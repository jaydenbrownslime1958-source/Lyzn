import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { toast } from "sonner";
import { FaDiscord } from "react-icons/fa";
import { Upload, Loader2, X, Copy, Check } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const METHOD_LABELS = {
  cashapp: "Cash App",
  venmo: "Venmo",
  robux: "Robux",
};

export const VerifyModal = ({ open, onOpenChange, method }) => {
  const [email, setEmail] = useState("");
  const [robloxUsername, setRobloxUsername] = useState("");
  const [screenshot, setScreenshot] = useState(null);
  const [screenshotName, setScreenshotName] = useState("");
  const [loading, setLoading] = useState(false);
  const [submission, setSubmission] = useState(null);
  const [copied, setCopied] = useState(false);
  const [cooldownEnd, setCooldownEnd] = useState(null);
  const [now, setNow] = useState(Date.now());
  const pollRef = useRef(null);
  const fileInputRef = useRef(null);

  const isRobux = method === "robux";

  // Poll submission status every 4s while pending
  useEffect(() => {
    if (!submission || submission.status !== "pending") return;
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await axios.get(`${API}/submissions/${submission.id}`);
        setSubmission(data);
        if (data.status === "approved") {
          toast.success("Payment verified! Your key is ready.", {
            style: { background: "#0a0020", border: "1px solid #B026FF", color: "#fff" },
          });
        } else if (data.status === "rejected") {
          toast.error("Payment rejected. You've been flagged — wait 5 minutes.", {
            style: { background: "#0a0020", border: "1px solid #FF003C", color: "#fff" },
          });
        }
      } catch (e) {
        // ignore
      }
    }, 4000);
    return () => clearInterval(pollRef.current);
  }, [submission]);

  // Cooldown tick
  useEffect(() => {
    if (!cooldownEnd) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [cooldownEnd]);

  const resetState = () => {
    setEmail("");
    setScreenshot(null);
    setScreenshotName("");
    setSubmission(null);
    setCopied(false);
    setLoading(false);
  };

  const handleClose = (val) => {
    if (!val) resetState();
    onOpenChange(val);
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      toast.error("Image too large (max 6MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setScreenshot(reader.result);
      setScreenshotName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!email || !screenshot) {
      toast.error("Email and screenshot are both required.");
      return;
    }
    if (isRobux && !robloxUsername.trim()) {
      toast.error("Roblox username is required for Robux payments.");
      return;
    }
    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/submissions`, {
        email,
        screenshot,
        method,
        roblox_username: isRobux ? robloxUsername.trim() : null,
      });
      setSubmission(data);
      toast("Submission received — awaiting admin review", {
        style: { background: "#0a0020", border: "1px solid #00F0FF", color: "#fff" },
      });
    } catch (err) {
      const detail = err?.response?.data?.detail || "Submission failed.";
      const status = err?.response?.status;
      // 429 = rate-limit/flagged, 409 = already-approved or out-of-stock
      if (status === 429 && /seconds/i.test(detail)) {
        const match = detail.match(/(\d+)\s*seconds?/i);
        const secs = match ? parseInt(match[1], 10) : 300;
        setCooldownEnd(Date.now() + secs * 1000);
        toast.error(detail, {
          duration: 6000,
          style: { background: "#0a0020", border: "1px solid #FF003C", color: "#fff" },
        });
      } else {
        // generic error – surface the backend's reason directly so the user knows what to fix
        toast.error(detail, {
          duration: 6000,
          style: { background: "#0a0020", border: "1px solid #FF003C", color: "#fff" },
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const cooldownRemaining = cooldownEnd
    ? Math.max(0, Math.ceil((cooldownEnd - now) / 1000))
    : 0;
  const mm = String(Math.floor(cooldownRemaining / 60)).padStart(2, "0");
  const ss = String(cooldownRemaining % 60).padStart(2, "0");

  const copyKey = () => {
    if (!submission?.key) return;
    navigator.clipboard.writeText(submission.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        data-testid="verify-modal"
        className="max-w-lg bg-[#0a0020] border border-purple-500/40 text-white rounded-none shadow-[0_0_60px_rgba(176,38,255,0.25)] p-0"
      >
        <div className="p-8">
          <div className="flex items-center justify-between mb-6">
            <DialogTitle className="font-unbounded text-2xl tracking-tight text-white">
              Verify Payment
            </DialogTitle>
            <span className="text-[10px] uppercase tracking-[0.3em] text-cyan-400">
              {METHOD_LABELS[method] || "Payment"}
            </span>
          </div>

          <AnimatePresence mode="wait">
            {/* COOLDOWN STATE */}
            {cooldownRemaining > 0 && (
              <motion.div
                key="cooldown"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <div className="bg-red-500/10 border border-red-500/40 p-6 text-center">
                  <p className="text-xs uppercase tracking-[0.3em] text-red-400 mb-2">
                    Flagged — suspicious activity
                  </p>
                  <p className="font-unbounded text-5xl text-white" data-testid="cooldown-timer">
                    {mm}:{ss}
                  </p>
                  <p className="text-sm text-purple-200/70 mt-3">
                    Too many rapid attempts. Please wait before retrying.
                  </p>
                </div>
              </motion.div>
            )}

            {/* APPROVED STATE */}
            {cooldownRemaining === 0 && submission?.status === "approved" && submission.key && (
              <motion.div
                key="approved"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-5"
              >
                <div className="text-center">
                  <p className="text-xs uppercase tracking-[0.3em] text-emerald-400">
                    Payment Verified
                  </p>
                  <p className="font-unbounded text-3xl mt-2">Lifetime Access Unlocked</p>
                </div>
                <div className="bg-black/50 border border-emerald-400/40 p-6 text-center" data-testid="key-sent-message">
                  <div className="flex items-center justify-center gap-2 text-emerald-400 text-sm font-bold uppercase tracking-[0.25em]">
                    <Check className="w-4 h-4" />
                    Key sent to your email
                  </div>
                  <p className="text-white text-base mt-3 font-mono break-all">
                    {submission.email}
                  </p>
                  <p className="text-purple-200/60 text-xs mt-3">
                    Check your inbox (and spam folder just in case).
                  </p>
                </div>
                <a
                  href="https://discord.gg/m7Cju8zr3Z"
                  target="_blank"
                  rel="noreferrer"
                  data-testid="join-discord-approved"
                  className="flex items-center justify-center gap-3 bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold py-4 px-6 w-full transition-all shadow-[0_0_25px_rgba(88,101,242,0.4)]"
                >
                  <FaDiscord className="w-5 h-5" />
                  Join Lyzn Discord to Claim Lifetime Access
                </a>
              </motion.div>
            )}

            {/* REJECTED */}
            {cooldownRemaining === 0 && submission?.status === "rejected" && (
              <motion.div
                key="rejected"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-red-500/10 border border-red-500/40 p-6 text-center"
              >
                <p className="text-xs uppercase tracking-[0.3em] text-red-400 mb-2">Rejected</p>
                <p className="text-white">
                  Your submission was rejected. You've been flagged — please wait 5 minutes.
                </p>
              </motion.div>
            )}

            {/* PENDING */}
            {cooldownRemaining === 0 && submission?.status === "pending" && (
              <motion.div
                key="pending"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-6"
              >
                <Loader2 className="w-10 h-10 animate-spin text-purple-400 mx-auto mb-4" />
                <p className="font-unbounded text-xl text-white mb-1">Awaiting Admin Review</p>
                <p className="text-sm text-purple-200/70">
                  Beware of fake submissions — an admin is reviewing your screenshot now.
                </p>
                <p className="text-[11px] text-purple-200/40 mt-4 font-mono">
                  ID: {submission.id}
                </p>
              </motion.div>
            )}

            {/* FORM (default) */}
            {cooldownRemaining === 0 && !submission && (
              <motion.div
                key="form"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-5"
              >
                <p className="text-sm text-purple-200/80">
                  Upload a screenshot of your payment. An admin will verify it and your key will
                  be delivered to your email.
                </p>

                <div>
                  <label className="text-[10px] uppercase tracking-[0.3em] text-cyan-400">
                    Email address
                  </label>
                  <Input
                    data-testid="verify-email-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@domain.com"
                    className="mt-2 bg-black/50 border border-white/20 text-white placeholder:text-white/30 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 rounded-none h-11"
                  />
                </div>

                {isRobux && (
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.3em] text-cyan-400">
                      Roblox username
                    </label>
                    <Input
                      data-testid="verify-roblox-input"
                      type="text"
                      value={robloxUsername}
                      onChange={(e) => setRobloxUsername(e.target.value)}
                      placeholder="your Roblox username"
                      className="mt-2 bg-black/50 border border-white/20 text-white placeholder:text-white/30 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 rounded-none h-11"
                    />
                    <p className="text-[10px] text-white/40 mt-1.5">
                      So we can confirm the Robux purchase came from you.
                    </p>
                  </div>
                )}

                <div>
                  <label className="text-[10px] uppercase tracking-[0.3em] text-cyan-400">
                    Payment screenshot
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFile}
                    className="hidden"
                    data-testid="verify-file-input"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="verify-upload-btn"
                    className="mt-2 w-full bg-black/50 border border-dashed border-white/20 hover:border-cyan-400 hover:bg-white/5 text-white/70 p-6 text-center cursor-pointer transition-all flex items-center justify-center gap-3"
                  >
                    <Upload className="w-5 h-5" />
                    {screenshotName || "Click to upload screenshot"}
                  </button>
                  {screenshot && (
                    <div className="mt-3 relative">
                      <img
                        src={screenshot}
                        alt="preview"
                        className="max-h-40 w-auto border border-white/10"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setScreenshot(null);
                          setScreenshotName("");
                        }}
                        className="absolute -top-2 -right-2 bg-black border border-white/20 p-1 hover:border-red-400"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  )}
                </div>

                <Button
                  data-testid="verify-submit-btn"
                  disabled={loading || !email || !screenshot || (isRobux && !robloxUsername.trim())}
                  onClick={handleSubmit}
                  className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-bold py-5 rounded-none border border-purple-400 shadow-[0_0_20px_rgba(176,38,255,0.4)] hover:shadow-[0_0_30px_rgba(176,38,255,0.7)] transition-all"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Submit for Verification"}
                </Button>

                <p className="text-[11px] text-purple-200/40 text-center">
                  Fake submissions will be flagged and locked out for 5 minutes.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VerifyModal;
