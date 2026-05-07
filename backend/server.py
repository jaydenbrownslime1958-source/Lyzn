from fastapi import FastAPI, APIRouter, HTTPException, Header, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import json
import logging
import asyncio
import random
import smtplib
import ssl
import string
import threading
import uuid
from email.message import EmailMessage
from pathlib import Path
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Literal
from datetime import datetime, timezone

import resend

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "lyzn-admin-2026")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "").strip()
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
GMAIL_USER = os.environ.get("GMAIL_USER", "").strip()
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD", "").replace(" ", "").strip()
DISCORD_WEBHOOK_URL = os.environ.get("DISCORD_WEBHOOK_URL", "").strip()
ADMIN_PANEL_URL = os.environ.get("ADMIN_PANEL_URL", "").strip()
MONGO_URL = os.environ.get("MONGO_URL", "").strip()
DB_NAME = os.environ.get("DB_NAME", "lyzn")
COOLDOWN_SECONDS = 5             # resubmit within this window = flagged (tight = bot-only)
FLAG_WAIT_SECONDS = 5 * 60       # 5 minute cooldown after flag
IP_APPROVAL_CAP = 50             # soft cap on keys per IP (covers shared WiFi / CGNAT)

# ---- Storage layer: MongoDB if MONGO_URL set, else file-based ----
KEY_STATE_PATH = ROOT_DIR / "keys_state.json"
KEY_SEED_PATH = ROOT_DIR / "keys_seed.json"
_key_lock = threading.Lock()

_mongo_client = None
_mongo_db = None
if MONGO_URL:
    try:
        from pymongo import MongoClient
        _mongo_client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
        _mongo_client.admin.command("ping")
        _mongo_db = _mongo_client[DB_NAME]
        # Indexes
        _mongo_db.approved_emails.create_index("email", unique=True)
        _mongo_db.consumed_keys.create_index("key", unique=True)
        logging.getLogger(__name__).info(f"Connected to MongoDB ({DB_NAME})")
    except Exception as e:
        logging.getLogger(__name__).error(f"MongoDB connection failed, falling back to file storage: {e}")
        _mongo_client = None
        _mongo_db = None


def _seed_initial_keys_if_empty() -> None:
    """One-time seed: if Mongo is empty AND a keys_seed.json is present, populate it."""
    if _mongo_db is None or not KEY_SEED_PATH.exists():
        return
    if _mongo_db.available_keys.count_documents({}) > 0:
        return
    seed = json.loads(KEY_SEED_PATH.read_text())
    if seed.get("available"):
        _mongo_db.available_keys.insert_many([{"key": k, "added_at": datetime.now(timezone.utc).isoformat()} for k in seed["available"]])
        logging.getLogger(__name__).info(f"Seeded {len(seed['available'])} keys into MongoDB")


def _load_key_state() -> dict:
    if _mongo_db is not None:
        avail = list(_mongo_db.available_keys.find({}, {"_id": 0, "key": 1}))
        consumed = list(_mongo_db.consumed_keys.find({}, {"_id": 0}).sort("at", -1).limit(500))
        return {"available": [d["key"] for d in avail], "consumed": consumed}
    if KEY_STATE_PATH.exists():
        try:
            return json.loads(KEY_STATE_PATH.read_text())
        except Exception:
            pass
    if KEY_SEED_PATH.exists():
        seed = json.loads(KEY_SEED_PATH.read_text())
        KEY_STATE_PATH.write_text(json.dumps(seed, indent=2))
        return seed
    return {"available": [], "consumed": []}


def _save_key_state(state: dict) -> None:
    if _mongo_db is not None:
        # Mongo is updated atomically by _pop_key — nothing to do here
        return
    tmp = KEY_STATE_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2))
    tmp.replace(KEY_STATE_PATH)


def _pop_key(email: str) -> Optional[str]:
    """Atomically reserve one key from the pool."""
    if _mongo_db is not None:
        # Use find_one_and_delete for atomic pop
        doc = _mongo_db.available_keys.find_one_and_delete({}, sort=[("_id", 1)])
        if not doc:
            return None
        key = doc["key"]
        _mongo_db.consumed_keys.insert_one({
            "key": key,
            "email": email,
            "at": datetime.now(timezone.utc).isoformat(),
        })
        return key
    with _key_lock:
        state = _load_key_state()
        if not state["available"]:
            return None
        key = state["available"].pop(0)
        state["consumed"].append({
            "key": key,
            "email": email,
            "at": datetime.now(timezone.utc).isoformat(),
        })
        _save_key_state(state)
        return key


def _stock_count() -> int:
    if _mongo_db is not None:
        return _mongo_db.available_keys.count_documents({})
    with _key_lock:
        return len(_load_key_state().get("available", []))


def _is_email_approved(email: str) -> bool:
    email_lc = email.lower().strip()
    if _mongo_db is not None:
        return _mongo_db.approved_emails.find_one({"email": email_lc}) is not None
    return email_lc in approved_emails


def _mark_email_approved(email: str, ip: str) -> None:
    email_lc = email.lower().strip()
    if _mongo_db is not None:
        try:
            _mongo_db.approved_emails.insert_one({"email": email_lc, "ip": ip, "at": datetime.now(timezone.utc).isoformat()})
        except Exception:
            pass
        _mongo_db.approved_ips.update_one({"ip": ip}, {"$inc": {"count": 1}}, upsert=True)
        return
    approved_emails.add(email_lc)
    approved_ips[ip] = approved_ips.get(ip, 0) + 1


def _ip_approval_count(ip: str) -> int:
    if _mongo_db is not None:
        doc = _mongo_db.approved_ips.find_one({"ip": ip})
        return (doc or {}).get("count", 0)
    return approved_ips.get(ip, 0)


_seed_initial_keys_if_empty()


async def _notify_discord_new_submission(sub: dict) -> None:
    """Fires a Discord webhook embed when a new verification submission is created."""
    if not DISCORD_WEBHOOK_URL:
        return
    method_emoji = {"cashapp": "💵", "venmo": "💜", "robux": "🎮"}.get(sub["method"], "📦")
    fields = [
        {"name": "Email", "value": f"`{sub['email']}`", "inline": True},
        {"name": "Method", "value": f"{method_emoji} {sub['method'].title()}", "inline": True},
    ]
    if sub.get("roblox_username"):
        fields.append({"name": "Roblox Username", "value": f"`{sub['roblox_username']}`", "inline": True})
    fields.append({"name": "Submission ID", "value": f"`{sub['id'][:8]}...`", "inline": False})
    if ADMIN_PANEL_URL:
        fields.append({"name": "Action", "value": f"[Open Admin Panel →]({ADMIN_PANEL_URL})", "inline": False})

    payload = {
        "username": "Lyzn Verifier",
        "embeds": [{
            "title": "New Verification Submitted",
            "description": "A buyer just dropped a screenshot. Review it in the admin panel.",
            "color": 0xB026FF,
            "fields": fields,
            "footer": {"text": f"Lyzn · {sub['created_at']}"},
        }],
    }

    def _post():
        import requests
        requests.post(DISCORD_WEBHOOK_URL, json=payload, timeout=8)

    try:
        await asyncio.to_thread(_post)
    except Exception as e:
        logger.error(f"Discord webhook failed: {e}")


if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

# In-memory stores (user opted out of MongoDB persistence)
submissions: dict = {}          # id -> submission dict
flag_until: dict = {}           # ip -> epoch seconds (cooldown end)
last_attempt: dict = {}         # ip -> epoch seconds (last submit time)
approved_emails: set = set()    # emails that already got a key — block re-buys
approved_ips: dict = {}         # ip -> count of approvals (max 2 per IP for shared/family scenarios)

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


# ---------- Models ----------
class SubmissionCreate(BaseModel):
    email: EmailStr
    screenshot: str = Field(..., description="Base64 data URL of payment screenshot")
    method: Literal["cashapp", "venmo", "robux"]
    roblox_username: Optional[str] = None


class SubmissionOut(BaseModel):
    id: str
    email: str
    method: str
    status: str
    created_at: str
    key: Optional[str] = None
    has_screenshot: bool = True
    roblox_username: Optional[str] = None


class SubmissionAdmin(SubmissionOut):
    screenshot: str
    client_fingerprint: str


class AdminLogin(BaseModel):
    password: str


# ---------- Helpers ----------
def _now_epoch() -> float:
    return datetime.now(timezone.utc).timestamp()


def _client_ip(request: Request) -> str:
    # Prefer Cloudflare / X-Forwarded-For headers since FastAPI sits behind a proxy
    cf = request.headers.get("cf-connecting-ip")
    if cf:
        return cf.strip()
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _gen_key() -> str:
    chars = string.ascii_uppercase + string.digits
    parts = ["".join(random.choices(chars, k=4)) for _ in range(4)]
    return "LYZN-" + "-".join(parts)


def _require_admin(password: Optional[str]):
    if not password or password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid admin password")


async def _send_key_email(to_email: str, key: str) -> bool:
    """
    Sends the lifetime key. Prefers Gmail SMTP (works without a verified domain).
    Falls back to Resend if Gmail is not configured. Returns True if sent.
    """
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width:560px; margin:auto; background:#000; color:#fff; padding:32px; border:1px solid #222;">
      <h1 style="color:#fff; letter-spacing:3px; margin:0 0 8px 0;">LYZN.GG</h1>
      <p style="color:#aaa; margin:0 0 24px 0;">Your lifetime access key is ready.</p>
      <div style="background:#0c0c0c; border:1px solid #2a2a2a; padding:18px; text-align:center; font-family: monospace; font-size:18px; letter-spacing:2px; color:#10b981;">
        {key}
      </div>
      <p style="color:#aaa; margin:24px 0 8px 0;">Join the Discord to claim:</p>
      <a href="https://discord.gg/m7Cju8zr3Z" style="display:inline-block; background:#5865F2; color:#fff; padding:12px 18px; text-decoration:none; font-weight:bold;">
        Join Lyzn Discord
      </a>
      <p style="color:#666; margin-top:32px; font-size:11px;">If you didn't request this, ignore this email.</p>
    </div>
    """
    text = (
        f"LYZN.GG\n\n"
        f"Your lifetime access key: {key}\n\n"
        f"Join the Discord to claim: https://discord.gg/m7Cju8zr3Z\n"
    )

    # 1) Try Gmail SMTP
    if GMAIL_USER and GMAIL_APP_PASSWORD:
        def _send_gmail():
            msg = EmailMessage()
            msg["Subject"] = "Your LYZN Lifetime Key"
            msg["From"] = f"Lyzn <{GMAIL_USER}>"
            msg["To"] = to_email
            msg.set_content(text)
            msg.add_alternative(html, subtype="html")
            ctx = ssl.create_default_context()
            with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ctx, timeout=15) as smtp:
                smtp.login(GMAIL_USER, GMAIL_APP_PASSWORD)
                smtp.send_message(msg)
        try:
            await asyncio.to_thread(_send_gmail)
            logger.info(f"Gmail SMTP sent key to {to_email}")
            return True
        except Exception as e:
            logger.error(f"Gmail SMTP failed: {e}")
            # fall through to Resend

    # 2) Resend fallback
    if RESEND_API_KEY:
        try:
            params = {
                "from": SENDER_EMAIL,
                "to": [to_email],
                "subject": "Your LYZN Lifetime Key",
                "html": html,
            }
            await asyncio.to_thread(resend.Emails.send, params)
            logger.info(f"Resend sent key to {to_email}")
            return True
        except Exception as e:
            logger.error(f"Resend send failed: {e}")

    # 3) Mock fallback
    logger.info(f"[MOCK EMAIL] Would send key {key} to {to_email}")
    return False


# ---------- Public routes ----------
@api_router.get("/")
async def root():
    return {"app": "Lyzn", "status": "online", "stock": _stock_count()}


@api_router.get("/stock")
async def stock():
    return {"stock": _stock_count()}


@api_router.post("/submissions", response_model=SubmissionOut)
async def create_submission(payload: SubmissionCreate, request: Request):
    ip = _client_ip(request)
    email_lc = payload.email.lower().strip()
    now = _now_epoch()

    # 1) Already-approved email → reject hard (no double-keys)
    if _is_email_approved(email_lc):
        raise HTTPException(
            status_code=409,
            detail="This email already received a Lyzn key. Check your inbox (and spam) for it.",
        )

    # 2) Per-IP approval cap (high limit covers shared WiFi / mobile CGNAT while blocking mass farming)
    if _ip_approval_count(ip) >= IP_APPROVAL_CAP:
        raise HTTPException(
            status_code=429,
            detail="This network has already redeemed the maximum number of keys.",
        )

    # 3) Active flag cooldown by IP
    if ip in flag_until and now < flag_until[ip]:
        remaining = int(flag_until[ip] - now)
        raise HTTPException(
            status_code=429,
            detail=f"Flagged for suspicious activity. Try again in {remaining} seconds.",
        )

    # 4) Rapid-fire detection by IP → flag
    if ip in last_attempt and (now - last_attempt[ip]) < COOLDOWN_SECONDS:
        flag_until[ip] = now + FLAG_WAIT_SECONDS
        last_attempt[ip] = now
        raise HTTPException(
            status_code=429,
            detail=f"Submitting too fast — flagged. Wait {FLAG_WAIT_SECONDS} seconds before retrying.",
        )
    last_attempt[ip] = now

    if not payload.screenshot or len(payload.screenshot) < 50:
        raise HTTPException(status_code=400, detail="Valid screenshot required.")

    sub_id = str(uuid.uuid4())
    sub = {
        "id": sub_id,
        "email": payload.email,
        "method": payload.method,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "key": None,
        "screenshot": payload.screenshot,
        "client_fingerprint": ip,
        "client_ip": ip,
        "roblox_username": (payload.roblox_username or "").strip() or None,
    }
    submissions[sub_id] = sub
    logger.info(f"New submission {sub_id} from {payload.email} via {payload.method} (ip={ip})")
    asyncio.create_task(_notify_discord_new_submission(sub))
    return SubmissionOut(
        id=sub_id,
        email=sub["email"],
        method=sub["method"],
        status=sub["status"],
        created_at=sub["created_at"],
        key=None,
        roblox_username=sub["roblox_username"],
    )


@api_router.get("/submissions/{sub_id}", response_model=SubmissionOut)
async def get_submission(sub_id: str):
    sub = submissions.get(sub_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    return SubmissionOut(
        id=sub["id"],
        email=sub["email"],
        method=sub["method"],
        status=sub["status"],
        created_at=sub["created_at"],
        key=sub.get("key"),
    )


# ---------- Admin routes ----------
@api_router.post("/admin/login")
async def admin_login(payload: AdminLogin):
    _require_admin(payload.password)
    return {"ok": True}


@api_router.get("/admin/submissions", response_model=List[SubmissionAdmin])
async def admin_list(x_admin_password: Optional[str] = Header(default=None)):
    _require_admin(x_admin_password)
    items = sorted(submissions.values(), key=lambda s: s["created_at"], reverse=True)
    return [SubmissionAdmin(**s, has_screenshot=True) for s in items]


@api_router.post("/admin/submissions/{sub_id}/approve", response_model=SubmissionOut)
async def admin_approve(sub_id: str, x_admin_password: Optional[str] = Header(default=None)):
    _require_admin(x_admin_password)
    sub = submissions.get(sub_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    if sub["status"] == "approved":
        return SubmissionOut(
            id=sub["id"], email=sub["email"], method=sub["method"],
            status=sub["status"], created_at=sub["created_at"], key=sub.get("key"),
        )
    key = _pop_key(sub["email"])
    if not key:
        raise HTTPException(status_code=409, detail="Out of stock — no keys available.")
    sub["key"] = key
    sub["status"] = "approved"
    # Permanently lock the email + bump the IP approval count
    ip = sub.get("client_ip") or sub.get("client_fingerprint") or "unknown"
    _mark_email_approved(sub["email"], ip)
    await _send_key_email(sub["email"], key)
    return SubmissionOut(
        id=sub["id"], email=sub["email"], method=sub["method"],
        status=sub["status"], created_at=sub["created_at"], key=key,
    )


@api_router.post("/admin/submissions/{sub_id}/reject", response_model=SubmissionOut)
async def admin_reject(sub_id: str, x_admin_password: Optional[str] = Header(default=None)):
    _require_admin(x_admin_password)
    sub = submissions.get(sub_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    sub["status"] = "rejected"
    # Flag the IP for 5 minutes when rejected
    ip = sub.get("client_ip") or sub.get("client_fingerprint") or "unknown"
    flag_until[ip] = _now_epoch() + FLAG_WAIT_SECONDS
    return SubmissionOut(
        id=sub["id"], email=sub["email"], method=sub["method"],
        status=sub["status"], created_at=sub["created_at"], key=None,
    )


@api_router.post("/admin/clear-flags")
async def admin_clear_flags(x_admin_password: Optional[str] = Header(default=None)):
    """Wipe all in-memory rate-limit / cooldown state. Useful if a real buyer got accidentally flagged."""
    _require_admin(x_admin_password)
    flag_count = len(flag_until)
    attempt_count = len(last_attempt)
    flag_until.clear()
    last_attempt.clear()
    return {"ok": True, "cleared_flags": flag_count, "cleared_attempts": attempt_count}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
