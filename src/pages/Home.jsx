import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../components/ui/dropdown-menu";
import { SUPPORTED_GAMES } from "../data/games";
import { Constellation } from "../components/Constellation";
import { VerifyModal } from "../components/VerifyModal";
import { FaDiscord } from "react-icons/fa";
import { SiCashapp, SiVenmo, SiRoblox } from "react-icons/si";
import {
  Search,
  ShoppingCart,
  ChevronDown,
  Gamepad2,
  Shield,
  Zap,
  Star,
  CircleCheck,
} from "lucide-react";
import { motion } from "framer-motion";

const PAYMENTS = [
  {
    id: "cashapp",
    label: "Cash App",
    handle: "$doublesk1",
    url: "https://cash.app/$doublesk1",
    icon: SiCashapp,
    accent: "#00D632",
  },
  {
    id: "venmo",
    label: "Venmo",
    handle: "@Jayden-Brown-272",
    url: "https://venmo.com/u/Jayden-Brown-272",
    icon: SiVenmo,
    accent: "#3D95CE",
  },
  {
    id: "robux",
    label: "Robux",
    handle: "via Roblox catalog",
    url: "https://www.roblox.com/catalog/14754485536",
    icon: SiRoblox,
    accent: "#ffffff",
  },
];

const REVIEWS = [
  { name: "@kxng_zay", text: "Lyzn just hits. Best $5 I ever spent — works on every basketball game.", rating: 5 },
  { name: "@itz_jay", text: "Got my key in 30s after the admin approved. No cap, lifetime is wild.", rating: 5 },
  { name: "@vyper", text: "Tested it on Hoopz and Blade Ball back-to-back. Smooth as hell.", rating: 5 },
  { name: "@dlo", text: "Was sketched out at first but the verify thing is legit. 10/10.", rating: 5 },
  { name: "@ynw_kayy", text: "Bro paid $5 once and i'm set forever. Other sites be charging $5/week.", rating: 5 },
  { name: "@trvp", text: "Used it on Phenom and Hoop Heroes today, no detection. Devs cooking.", rating: 5 },
  { name: "@goon_squad", text: "My whole crew copped Lyzn. Cheapest lifetime out there fr.", rating: 5 },
  { name: "@ace23", text: "Email arrived in like 2 mins after admin approved. Super clean.", rating: 5 },
  { name: "@blickyy", text: "Football Legends + RBW5 working perfect. This is THE script site now.", rating: 5 },
  { name: "@2x_smoke", text: "Lyzn admin replied in discord faster than my mom does to my texts.", rating: 5 },
  { name: "@boltz", text: "Already made my $5 back in one Hoopz session. Free money.", rating: 5 },
  { name: "@kj_thareal", text: "All 32 games unlocked. Bro you're not finding this deal anywhere else.", rating: 5 },
  { name: "@swisha", text: "Tried 3 other script sites before this. Lyzn the only one that actually works.", rating: 5 },
  { name: "@tre_4l", text: "Volleyball Legends auto-spike is INSANE. teammates are mad lol.", rating: 5 },
  { name: "@iceyy", text: "no lie, paid through cashapp and got my key in 4 min. legit ahh.", rating: 5 },
  { name: "@bagchaser", text: "Drill City + NBA Champs both hitting. Bricked once on Phenom but devs fixed it next day.", rating: 5 },
  { name: "@yng_kobe", text: "Best $5 a basketball player can spend. Period.", rating: 5 },
  { name: "@mvp_quan", text: "Used the robux option, sent username, got verified in like 6 mins. real ones.", rating: 5 },
  { name: "@spicy_mayo", text: "Arsenal aimbot got me 30 kills first match w lyzn. flawless.", rating: 5 },
  { name: "@dribbledrip", text: "Hoops Life is unrecognizable with this. 99 ovr stats lookin like 110.", rating: 5 },
  { name: "@finessekiid", text: "frfr the discord support is goated. answered me in 2 min.", rating: 5 },
  { name: "@yotrey", text: "literally the GOAT script. been using it for weeks, still undetected.", rating: 5 },
  { name: "@bbk_jon", text: "lifetime for $5 is actually crazy. my buddy paid $20 a month for less.", rating: 5 },
  { name: "@xanaxxx", text: "Universe Football auto-pass is dirty. defenders cant do nothing.", rating: 5 },
  { name: "@rico1k", text: "Fisch script makes the fishing so smooth. caught 3 mythics in an hour.", rating: 5 },
  { name: "@wavy_b", text: "got the email + key like 30 sec after they approved. real time legit.", rating: 5 },
];

export default function Home() {
  const [query, setQuery] = useState("");
  const [openModal, setOpenModal] = useState(false);
  const [method, setMethod] = useState("cashapp");
  const [currency, setCurrency] = useState("USD");
  const [stock, setStock] = useState(null);
  const [stockError, setStockError] = useState(false);

  useEffect(() => {
    const fetchStock = async () => {
      try {
        const { data } = await axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/stock`, { timeout: 8000 });
        setStock(data.stock);
        setStockError(false);
        // Cache so brief outages don't blank the badge
        try { localStorage.setItem("lyzn-stock-cache", String(data.stock)); } catch { /* ignore */ }
      } catch {
        setStockError(true);
        // Fall back to cached stock if available
        const cached = localStorage.getItem("lyzn-stock-cache");
        if (cached !== null && stock === null) setStock(parseInt(cached, 10));
      }
    };
    fetchStock();
    const t = setInterval(fetchStock, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredGames = useMemo(
    () =>
      SUPPORTED_GAMES.filter((g) =>
        g.name.toLowerCase().includes(query.trim().toLowerCase())
      ),
    [query]
  );

  const openVerify = (id) => {
    setMethod(id);
    setOpenModal(true);
  };

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  /**
   * Returns an onClick handler that opens an external URL in a new tab.
   * Works around iframe / popup-blocker quirks by using window.open within the
   * direct user-gesture handler. Falls back to top-level navigation if blocked.
   */
  const openExternal = (url) => (e) => {
    e.preventDefault();
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (!w) {
      // popup blocked → navigate top frame
      try {
        window.top.location.href = url;
      } catch {
        window.location.href = url;
      }
    }
  };

  return (
    <div className="relative min-h-screen text-white font-sora bg-[#05000A]">
      <Constellation />

      {/* NAV */}
      <header className="relative z-10 border-b border-purple-500/20 bg-black/50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 lg:px-10 py-4">
          <a href="/" className="flex items-center gap-2 group" data-testid="brand-logo">
            <div className="w-8 h-8 rounded-md bg-purple-500/20 border border-purple-400/40 flex items-center justify-center group-hover:bg-purple-500/30 transition">
              <Zap className="w-4 h-4 text-purple-300" />
            </div>
            <span className="text-2xl font-bold tracking-tight">Lyzn<span className="text-purple-300/50">.gg</span></span>
          </a>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-purple-100/80">
            <a href="#home" className="hover:text-cyan-400 transition" data-testid="nav-home">Home</a>
            <a href="#games" className="hover:text-cyan-400 transition" data-testid="nav-games">Games</a>
            <a href="#reviews" className="hover:text-cyan-400 transition" data-testid="nav-reviews">Reviews</a>
            <a href="#status" className="hover:text-cyan-400 transition" data-testid="nav-status">Status</a>
            <a href="https://discord.gg/m7Cju8zr3Z" target="_blank" rel="noopener noreferrer" onClick={openExternal("https://discord.gg/m7Cju8zr3Z")} className="hover:text-cyan-400 transition" data-testid="nav-discord">Discord</a>
            <a href="/admin" className="hover:text-cyan-400 transition" data-testid="nav-admin">Admin</a>
          </nav>

          <div className="flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger
                data-testid="currency-trigger"
                className="flex items-center gap-1 text-sm bg-purple-500/10 border border-purple-500/30 px-3 py-1.5 rounded-md hover:bg-white/10 transition"
              >
                {currency === "USD" ? "$" : currency === "EUR" ? "€" : "£"}
                <ChevronDown className="w-3.5 h-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-black border border-purple-500/30 text-white">
                <DropdownMenuItem onClick={() => setCurrency("USD")}>USD ($)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCurrency("EUR")}>EUR (€)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCurrency("GBP")}>GBP (£)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              onClick={() => scrollTo("payments")}
              data-testid="nav-cart-btn"
              className="w-10 h-10 flex items-center justify-center bg-purple-500/10 border border-purple-500/30 hover:bg-white/10 hover:border-purple-500/50 transition rounded-md"
              aria-label="cart"
            >
              <ShoppingCart className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section id="home" className="relative z-10 px-6 py-28 md:py-40">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <div className="inline-flex items-center gap-2 border border-purple-500/30 bg-purple-500/10 backdrop-blur px-3 py-1 rounded-full text-xs text-purple-100/80" data-testid="stock-badge">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {stock === null ? "..." : stock} Keys In Stock · $5 Lifetime
            </div>

            <h1 className="font-sora text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mt-7 leading-[1.05]">
              Welcome to{" "}
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-white/60">
                Lyzn.gg!
              </span>
            </h1>

            <p className="mt-5 text-base md:text-lg text-purple-100/70 max-w-xl mx-auto">
              The lifetime pass to Lyzn — 32 supported Roblox games, one key, forever.
            </p>

            {/* SEARCH */}
            <div className="mt-12 relative max-w-2xl mx-auto">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-cyan-400/70" />
              <Input
                data-testid="hero-search-input"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (e.target.value) scrollTo("games");
                }}
                placeholder="Search for games..."
                className="pl-14 pr-5 py-7 text-base bg-purple-500/[0.07] border border-purple-500/20 hover:border-purple-500/40 focus:border-cyan-400/60 focus:ring-0 placeholder:text-white/30 rounded-xl backdrop-blur-md text-white"
              />
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button
                onClick={() => scrollTo("games")}
                data-testid="view-games-btn"
                className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-6 py-6 rounded-md transition-all border border-purple-400/60 shadow-[0_0_25px_rgba(176,38,255,0.45)] hover:shadow-[0_0_40px_rgba(176,38,255,0.8)]"
              >
                <ShoppingCart className="w-4 h-4 mr-2" />
                View Games
              </Button>
              <a
                href="https://discord.gg/m7Cju8zr3Z"
                target="_blank"
                rel="noopener noreferrer"
                onClick={openExternal("https://discord.gg/m7Cju8zr3Z")}
                data-testid="hero-discord-btn"
                className="inline-flex items-center gap-2 border border-purple-500/30 hover:border-cyan-400/60 text-white px-6 py-3.5 rounded-md transition-all"
              >
                <FaDiscord className="w-4 h-4" />
                Join Discord
              </a>
              <Button
                onClick={() => scrollTo("payments")}
                data-testid="hero-purchase-btn"
                className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-bold px-6 py-6 rounded-md transition-all shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:shadow-[0_0_30px_rgba(16,185,129,0.7)] border border-emerald-400/50"
              >
                <ShoppingCart className="w-4 h-4 mr-2" />
                Purchase Product
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* GAMES */}
      <section id="games" className="relative z-10 px-6 py-24 border-t border-purple-500/10">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-end justify-between flex-wrap gap-6 mb-10">
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-400 mb-2">/ products</p>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Supported Games</h2>
              <p className="text-purple-200/60 mt-2">One key. Every title in our library.</p>
            </div>
            <div className="text-sm text-purple-200/60 font-mono">
              {filteredGames.length} / {SUPPORTED_GAMES.length}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3" data-testid="games-grid">
            {filteredGames.map((g, i) => (
              <motion.div
                key={g.id}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.012, duration: 0.35 }}
                className="group bg-purple-500/[0.06] hover:bg-purple-500/[0.12] border border-purple-500/20 hover:border-purple-500/50 p-4 rounded-lg cursor-default transition-all relative overflow-hidden backdrop-blur-sm"
                data-testid={`game-card-${g.id}`}
              >
                <div className="absolute top-2 right-2 text-[9px] text-white/30 font-mono">
                  #{String(g.id).padStart(2, "0")}
                </div>
                <Gamepad2 className="w-5 h-5 text-purple-200/60 group-hover:text-white transition" />
                <p className="mt-3 font-semibold text-sm leading-tight text-white">{g.name}</p>
                <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-400/70 mt-1">{g.category}</p>
              </motion.div>
            ))}
            {filteredGames.length === 0 && (
              <div className="col-span-full text-center py-16 text-cyan-400/70">
                No games match "{query}"
              </div>
            )}
          </div>
        </div>
      </section>

      {/* PAYMENTS */}
      <section id="payments" className="relative z-10 px-6 py-24 border-t border-purple-500/10">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-400 mb-2">/ checkout</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Send $5. Get Your Key.</h2>
            <p className="text-purple-200/60 mt-3">
              Pick a payment method, send <span className="text-white font-semibold">$5</span>, then
              come back and verify with a screenshot.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {PAYMENTS.map((p) => {
              const Icon = p.icon;
              return (
                <div
                  key={p.id}
                  className="group relative bg-purple-500/[0.06] border border-purple-500/20 hover:border-purple-500/50 backdrop-blur-md p-7 rounded-xl transition-all overflow-hidden"
                  data-testid={`payment-card-${p.id}`}
                >
                  <div
                    className="absolute -top-20 -right-20 w-44 h-44 rounded-full blur-3xl opacity-25 group-hover:opacity-50 transition-opacity"
                    style={{ background: p.accent }}
                  />
                  <Icon className="w-10 h-10" style={{ color: p.accent }} />
                  <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-400/70 mt-6">Method</p>
                  <h3 className="text-2xl font-bold mt-1">{p.label}</h3>

                  <div className="flex gap-2 mt-7">
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      data-testid={`pay-open-${p.id}`}
                      className="flex-1 text-center border border-purple-500/30 hover:border-cyan-400/60 text-white font-semibold py-2.5 text-xs uppercase tracking-widest rounded-md transition-all"
                    >
                      Open
                    </a>
                    <button
                      onClick={() => openVerify(p.id)}
                      data-testid={`pay-verify-${p.id}`}
                      className="flex-1 bg-white text-black hover:bg-white/90 font-bold py-2.5 text-xs uppercase tracking-widest rounded-md transition-all"
                    >
                      Verify
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-10 flex items-start gap-3 max-w-2xl mx-auto bg-purple-500/[0.06] border border-purple-500/20 p-5 rounded-lg">
            <Shield className="w-5 h-5 text-purple-100/70 shrink-0 mt-0.5" />
            <p className="text-sm text-purple-100/70">
              Fake submissions are flagged automatically. If you submit too fast or get rejected,
              you'll be locked out for <span className="text-white font-semibold">5 minutes</span>.
            </p>
          </div>
        </div>
      </section>

      {/* REVIEWS */}
      <section id="reviews" className="relative z-10 px-6 py-24 border-t border-purple-500/10">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-400 mb-2">/ reviews</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">What Lyzn users say</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {REVIEWS.map((r, i) => (
              <div
                key={i}
                className="bg-purple-500/[0.06] border border-purple-500/20 hover:border-white/25 backdrop-blur-md p-5 rounded-xl transition-all"
                data-testid={`review-${i}`}
              >
                <div className="flex gap-0.5 mb-3">
                  {Array.from({ length: r.rating }).map((_, k) => (
                    <Star key={k} className="w-3.5 h-3.5 fill-white text-white" />
                  ))}
                </div>
                <p className="text-sm text-purple-50/90 leading-relaxed">"{r.text}"</p>
                <p className="text-xs text-cyan-400/70 mt-4 font-mono">{r.name}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STATUS */}
      <section id="status" className="relative z-10 px-6 py-24 border-t border-purple-500/10">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-400 mb-2">/ status</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">All systems operational</h2>

            {/* Glowing UNDETECTED & WORKING badge */}
            <div className="mt-8 flex justify-center">
              <button
                type="button"
                data-testid="undetected-badge"
                className="relative inline-flex items-center gap-3 px-8 py-4 rounded-full bg-gradient-to-r from-emerald-500/20 via-emerald-400/30 to-emerald-500/20 border-2 border-emerald-400 text-emerald-300 font-bold tracking-[0.25em] uppercase text-sm shadow-[0_0_30px_rgba(16,185,129,0.6),inset_0_0_20px_rgba(16,185,129,0.15)] hover:shadow-[0_0_50px_rgba(16,185,129,0.9),inset_0_0_30px_rgba(16,185,129,0.25)] transition-all animate-pulse"
              >
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,1)]"></span>
                </span>
                Undetected &amp; Working
              </button>
            </div>
          </div>
          <div className="bg-purple-500/[0.06] border border-purple-500/20 rounded-xl divide-y divide-purple-500/20 backdrop-blur-md">
            {[
              { name: "Key delivery API", status: "Operational" },
              { name: "Payment verification", status: "Operational" },
              { name: "Discord bot", status: "Operational" },
              { name: "Email service", status: "Operational" },
            ].map((s, i) => (
              <div key={i} className="flex items-center justify-between px-6 py-4">
                <p className="text-sm text-purple-50/90">{s.name}</p>
                <div className="flex items-center gap-2 text-xs text-emerald-400 font-semibold">
                  <CircleCheck className="w-4 h-4" />
                  {s.status}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 border-t border-purple-500/10 px-6 py-10 text-xs text-cyan-400/70">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="font-bold text-white">Lyzn.gg</span>
            <span className="font-mono">// v1.0 // lifetime edition</span>
          </div>
          <div className="flex gap-6">
            <a href="https://discord.gg/m7Cju8zr3Z" target="_blank" rel="noopener noreferrer" className="hover:text-white">Discord</a>
            <a href="/admin" className="hover:text-white" data-testid="footer-admin-link">Admin</a>
          </div>
        </div>
      </footer>

      <VerifyModal open={openModal} onOpenChange={setOpenModal} method={method} />
    </div>
  );
}

