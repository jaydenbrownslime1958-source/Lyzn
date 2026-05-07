"""Lyzn backend API tests - in-memory key delivery service."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://lyzn-gaming-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_PASSWORD = "lyzn-admin-2026"
ADMIN_HEADER = {"X-Admin-Password": ADMIN_PASSWORD}

SAMPLE_SCREENSHOT = "data:image/png;base64," + ("A" * 120)


def _unique_email(tag: str) -> str:
    return f"TEST_{tag}_{uuid.uuid4().hex[:8]}@example.com"


# ---------- Public status ----------
class TestPublicStatus:
    def test_root(self):
        r = requests.get(f"{API}/")
        assert r.status_code == 200
        data = r.json()
        assert data.get("app") == "Lyzn"
        assert data.get("status") == "online"
        assert data.get("stock") == 1000

    def test_stock(self):
        r = requests.get(f"{API}/stock")
        assert r.status_code == 200
        assert r.json() == {"stock": 1000}


# ---------- Admin login ----------
class TestAdminLogin:
    def test_login_wrong_password(self):
        r = requests.post(f"{API}/admin/login", json={"password": "wrong"})
        assert r.status_code == 401

    def test_login_correct_password(self):
        r = requests.post(f"{API}/admin/login", json={"password": ADMIN_PASSWORD})
        assert r.status_code == 200
        assert r.json() == {"ok": True}


# ---------- Submission validation ----------
class TestSubmissionValidation:
    def test_missing_fields_422(self):
        r = requests.post(f"{API}/submissions", json={"email": "x@y.com"})
        assert r.status_code == 422

    def test_invalid_email_422(self):
        r = requests.post(f"{API}/submissions", json={
            "email": "not-an-email", "screenshot": SAMPLE_SCREENSHOT, "method": "cashapp"
        })
        assert r.status_code == 422

    def test_invalid_method_422(self):
        r = requests.post(f"{API}/submissions", json={
            "email": _unique_email("badmethod"), "screenshot": SAMPLE_SCREENSHOT, "method": "paypal"
        })
        assert r.status_code == 422

    def test_screenshot_too_short_400(self):
        r = requests.post(f"{API}/submissions", json={
            "email": _unique_email("shortss"), "screenshot": "tiny", "method": "cashapp"
        })
        assert r.status_code == 400


# ---------- Create + retrieve submission ----------
class TestSubmissionCreateAndGet:
    def test_create_and_get(self):
        email = _unique_email("create")
        payload = {"email": email, "screenshot": SAMPLE_SCREENSHOT, "method": "venmo"}
        r = requests.post(f"{API}/submissions", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["email"] == email
        assert data["method"] == "venmo"
        assert data["status"] == "pending"
        assert data.get("key") is None
        assert isinstance(data["id"], str) and len(data["id"]) > 0

        # GET by id
        g = requests.get(f"{API}/submissions/{data['id']}")
        assert g.status_code == 200
        gdata = g.json()
        assert gdata["id"] == data["id"]
        assert gdata["email"] == email
        assert gdata["status"] == "pending"

    def test_get_nonexistent_submission(self):
        r = requests.get(f"{API}/submissions/{uuid.uuid4()}")
        assert r.status_code == 404


# ---------- Admin list / auth ----------
class TestAdminList:
    def test_admin_list_unauthorized(self):
        r = requests.get(f"{API}/admin/submissions")
        assert r.status_code == 401

    def test_admin_list_wrong_password(self):
        r = requests.get(f"{API}/admin/submissions", headers={"X-Admin-Password": "wrong"})
        assert r.status_code == 401

    def test_admin_list_authorized(self):
        # Seed one submission
        email = _unique_email("adminlist")
        requests.post(f"{API}/submissions", json={
            "email": email, "screenshot": SAMPLE_SCREENSHOT, "method": "cashapp"
        })
        r = requests.get(f"{API}/admin/submissions", headers=ADMIN_HEADER)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert any(s["email"] == email for s in items)
        # Admin list should include screenshot + fingerprint
        for s in items:
            assert "screenshot" in s
            assert "client_fingerprint" in s


# ---------- Approve / reject flow ----------
class TestApproveReject:
    def test_approve_generates_key(self):
        email = _unique_email("approve")
        r = requests.post(f"{API}/submissions", json={
            "email": email, "screenshot": SAMPLE_SCREENSHOT, "method": "robux"
        })
        sub_id = r.json()["id"]

        # Unauthorized approve
        u = requests.post(f"{API}/admin/submissions/{sub_id}/approve")
        assert u.status_code == 401

        # Authorized approve
        a = requests.post(f"{API}/admin/submissions/{sub_id}/approve", headers=ADMIN_HEADER)
        assert a.status_code == 200, a.text
        data = a.json()
        assert data["status"] == "approved"
        key = data.get("key")
        assert isinstance(key, str)
        assert key.startswith("LYZN-")
        parts = key.split("-")
        assert len(parts) == 5  # LYZN + 4 groups
        for p in parts[1:]:
            assert len(p) == 4

        # Verify persistence via GET
        g = requests.get(f"{API}/submissions/{sub_id}")
        assert g.status_code == 200
        assert g.json()["status"] == "approved"
        assert g.json()["key"] == key

    def test_approve_idempotent(self):
        email = _unique_email("idemp")
        r = requests.post(f"{API}/submissions", json={
            "email": email, "screenshot": SAMPLE_SCREENSHOT, "method": "cashapp"
        })
        sub_id = r.json()["id"]
        a1 = requests.post(f"{API}/admin/submissions/{sub_id}/approve", headers=ADMIN_HEADER)
        a2 = requests.post(f"{API}/admin/submissions/{sub_id}/approve", headers=ADMIN_HEADER)
        assert a1.status_code == 200 and a2.status_code == 200
        assert a1.json()["key"] == a2.json()["key"]

    def test_reject_sets_status_and_flags(self):
        # Use session to keep requests on same replica (in-memory state)
        s = requests.Session()
        email = _unique_email("reject")
        r = s.post(f"{API}/submissions", json={
            "email": email, "screenshot": SAMPLE_SCREENSHOT, "method": "venmo"
        })
        sub_id = r.json()["id"]

        rej = s.post(f"{API}/admin/submissions/{sub_id}/reject", headers=ADMIN_HEADER)
        assert rej.status_code == 200
        assert rej.json()["status"] == "rejected"
        assert rej.json().get("key") is None

        # Re-submit same email -> should be flagged (429) because reject flagged the fp
        time.sleep(1)
        r2 = s.post(f"{API}/submissions", json={
            "email": email, "screenshot": SAMPLE_SCREENSHOT, "method": "venmo"
        })
        assert r2.status_code == 429
        assert "Flagged" in r2.json().get("detail", "") or "flagged" in r2.json().get("detail", "").lower()

    def test_approve_nonexistent(self):
        r = requests.post(f"{API}/admin/submissions/{uuid.uuid4()}/approve", headers=ADMIN_HEADER)
        assert r.status_code == 404


# ---------- Rapid re-submit flagging ----------
class TestRapidResubmitFlagging:
    def test_rapid_resubmit_flags_user(self):
        # Use Session (keep-alive) so all requests land on the same backend replica,
        # since in-memory state is per-process and ingress may round-robin.
        s = requests.Session()
        email = _unique_email("rapid")
        payload = {"email": email, "screenshot": SAMPLE_SCREENSHOT, "method": "cashapp"}
        r1 = s.post(f"{API}/submissions", json=payload)
        assert r1.status_code == 200
        r2 = s.post(f"{API}/submissions", json=payload)
        assert r2.status_code == 429
        detail = r2.json().get("detail", "")
        assert "flag" in detail.lower() or "fast" in detail.lower()

        r3 = s.post(f"{API}/submissions", json=payload)
        assert r3.status_code == 429
        assert "second" in r3.json().get("detail", "").lower()
