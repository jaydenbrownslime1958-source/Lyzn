import { useEffect, useState } from "react";
import axios from "axios";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { Constellation } from "../components/Constellation";
import { Check, X, Loader2, Lock, RefreshCw, Save, ShieldAlert } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Admin() {
  const [password, setPassword] = useState(
    () => localStorage.getItem("lyzn-admin-pw") || ""
  );
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submissions, setSubmissions] = useState([]);

  const login = async () => {
    setLoading(true);
    try {
      await axios.post(`${API}/admin/login`, { password });
      localStorage.setItem("lyzn-admin-pw", password);
      setAuthed(true);
      toast.success("Admin access granted");
      await fetchList(password);
    } catch {
      toast.error("Wrong password");
    } finally {
      setLoading(false);
    }
  };

  const fetchList = async (pw = password) => {
    try {
      const { data } = await axios.get(`${API}/admin/submissions`, {
        headers: { "X-Admin-Password": pw },
      });
      setSubmissions(data);
    } catch {
      toast.error("Failed to fetch submissions");
    }
  };

  const clearFlags = async () => {
    try {
      const { data } = await axios.post(
        `${API}/admin/clear-flags`,
        {},
        { headers: { "X-Admin-Password": password } }
      );
      toast.success(`Cleared ${data.cleared_flags} flags + ${data.cleared_attempts} rate-limit entries`);
    } catch {
      toast.error("Failed to clear flags");
    }
  };

  useEffect(() => {
    if (authed) {
      const t = setInterval(() => fetchList(), 5000);
      return () => clearInterval(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  // Auto-login if pw stored
  useEffect(() => {
    if (password && !authed) {
      (async () => {
        try {
          await axios.post(`${API}/admin/login`, { password });
          setAuthed(true);
          fetchList(password);
        } catch { /* ignore */ }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act = async (id, kind) => {
    try {
      const { data } = await axios.post(
        `${API}/admin/submissions/${id}/${kind}`,
        {},
        { headers: { "X-Admin-Password": password } }
      );
      if (kind === "approve") {
        toast.success(`Approved — key ${data.key}`);
      } else {
        toast(`Rejected & user flagged for 5 min`);
      }
      fetchList();
    } catch {
      toast.error("Action failed");
    }
  };

  if (!authed) {
    return (
      <div className="min-h-screen text-white relative font-sora flex items-center justify-center px-6 bg-black">
        <Constellation />
        <div className="relative z-10 w-full max-w-md bg-white/[0.03] border border-white/15 p-8 backdrop-blur-xl rounded-xl">
          <Lock className="w-8 h-8 text-white/70 mb-4" />
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            Admin Access
          </h1>
          <p className="text-sm text-white/50 mb-6">
            Enter the admin password to review payment submissions.
          </p>
          <Input
            data-testid="admin-password-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()}
            placeholder="password"
            className="bg-white/[0.04] border border-white/15 text-white placeholder:text-white/30 focus:border-white/40 focus:ring-0 rounded-md h-11 mb-4"
          />
          <Button
            data-testid="admin-login-btn"
            disabled={loading || !password}
            onClick={login}
            className="w-full bg-white text-black hover:bg-white/90 font-bold py-5 rounded-md transition-all"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enter"}
          </Button>
          <a href="/" className="block text-center text-xs text-white/40 mt-6 hover:text-white">
            ← back to Lyzn.gg
          </a>
        </div>
      </div>
    );
  }

  const pending = submissions.filter((s) => s.status === "pending");
  const done = submissions.filter((s) => s.status !== "pending");

  return (
    <div className="min-h-screen text-white relative font-sora bg-black">
      <Constellation />
      <div className="relative z-10 px-6 md:px-12 py-10 max-w-7xl mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-4 mb-10">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-white/40">/ lyzn admin</p>
            <h1 className="text-4xl font-bold tracking-tight mt-1">
              Payment Review
            </h1>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => fetchList()}
              className="border-white/15 hover:border-white/40 rounded-md bg-transparent text-white"
              data-testid="admin-refresh-btn"
            >
              <RefreshCw className="w-4 h-4 mr-2" /> Refresh
            </Button>
            <Button
              variant="outline"
              onClick={clearFlags}
              className="border-orange-400/40 hover:border-orange-400 hover:bg-orange-400/10 rounded-md bg-transparent text-orange-300"
              data-testid="admin-clear-flags-btn"
              title="Clear all rate-limit flags (use if a real buyer got blocked)"
            >
              <ShieldAlert className="w-4 h-4 mr-2" /> Clear Flags
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                localStorage.setItem("lyzn-admin-pw", password);
                toast.success("Password saved on this device — won't ask again", {
                  style: { background: "#0a0020", border: "1px solid rgba(16,185,129,0.5)", color: "#fff" },
                });
              }}
              className="border-emerald-400/40 hover:border-emerald-400 hover:bg-emerald-400/10 rounded-md bg-transparent text-emerald-300"
              data-testid="admin-save-pw-btn"
            >
              <Save className="w-4 h-4 mr-2" /> Save Password
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                localStorage.removeItem("lyzn-admin-pw");
                setAuthed(false);
                setPassword("");
              }}
              className="border-white/15 hover:border-red-400 rounded-md bg-transparent text-white"
              data-testid="admin-logout-btn"
            >
              Logout
            </Button>
          </div>
        </div>

        <Section title="Pending" count={pending.length}>
          {pending.length === 0 ? (
            <Empty label="No pending submissions" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {pending.map((s) => (
                <Card key={s.id} sub={s} onApprove={() => act(s.id, "approve")} onReject={() => act(s.id, "reject")} />
              ))}
            </div>
          )}
        </Section>

        <Section title="History" count={done.length}>
          {done.length === 0 ? (
            <Empty label="No past submissions" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {done.map((s) => (
                <Card key={s.id} sub={s} />
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

const Section = ({ title, count, children }) => (
  <section className="mb-14">
    <div className="flex items-center gap-4 mb-5">
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      <span className="text-xs font-mono text-white/40">[{count}]</span>
    </div>
    {children}
  </section>
);

const Empty = ({ label }) => (
  <div className="border border-dashed border-white/10 p-10 text-center text-sm text-white/40 rounded-lg">
    {label}
  </div>
);

const Card = ({ sub, onApprove, onReject }) => (
  <div className="bg-white/[0.03] border border-white/10 p-5 rounded-xl backdrop-blur-md" data-testid={`admin-sub-${sub.id}`}>
    <div className="flex items-center justify-between mb-3">
      <div>
        <p className="text-[10px] uppercase tracking-[0.3em] text-white/40">{sub.method}</p>
        <p className="font-mono text-sm text-white mt-1">{sub.email}</p>
        {sub.roblox_username && (
          <p className="font-mono text-xs text-cyan-400 mt-0.5">roblox: {sub.roblox_username}</p>
        )}
      </div>
      <StatusPill status={sub.status} />
    </div>
    {sub.screenshot && (
      <a href={sub.screenshot} target="_blank" rel="noreferrer">
        <img
          src={sub.screenshot}
          alt="screenshot"
          className="w-full max-h-60 object-contain bg-black border border-white/5 rounded-md"
        />
      </a>
    )}
    <p className="text-[11px] font-mono text-white/40 mt-3">
      {new Date(sub.created_at).toLocaleString()}
    </p>
    {sub.key && (
      <p className="font-mono text-sm text-white mt-2 break-all bg-white/5 p-2 rounded">key: {sub.key}</p>
    )}
    {onApprove && (
      <div className="flex gap-2 mt-4">
        <button
          onClick={onApprove}
          data-testid={`approve-btn-${sub.id}`}
          className="flex-1 bg-emerald-500/20 hover:bg-emerald-500/40 border border-emerald-400/40 text-emerald-300 py-2 text-xs uppercase tracking-widest font-bold flex items-center justify-center gap-2 transition rounded-md"
        >
          <Check className="w-4 h-4" /> Approve
        </button>
        <button
          onClick={onReject}
          data-testid={`reject-btn-${sub.id}`}
          className="flex-1 bg-red-500/20 hover:bg-red-500/40 border border-red-400/40 text-red-300 py-2 text-xs uppercase tracking-widest font-bold flex items-center justify-center gap-2 transition rounded-md"
        >
          <X className="w-4 h-4" /> Reject
        </button>
      </div>
    )}
  </div>
);

const StatusPill = ({ status }) => {
  const map = {
    pending: "border-yellow-400/40 text-yellow-300 bg-yellow-400/10",
    approved: "border-emerald-400/40 text-emerald-300 bg-emerald-400/10",
    rejected: "border-red-400/40 text-red-300 bg-red-400/10",
  };
  return (
    <span className={`text-[10px] uppercase tracking-[0.25em] border px-2 py-1 rounded ${map[status]}`}>
      {status}
    </span>
  );
};
