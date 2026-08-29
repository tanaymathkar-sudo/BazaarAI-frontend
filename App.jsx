import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";
import {
  Search, TrendingUp, TrendingDown, Activity, AlertTriangle, ChevronDown,
  Star, RefreshCw, Radio, Filter, BarChart3, Layers, Target, Shield,
  Wallet, ChevronRight, Circle, X, Info
} from "lucide-react";

/* ============================== TOKENS ============================== */
const T = {
  bg: "#0A0D10",
  panel: "#11161B",
  panel2: "#161D24",
  border: "#232C33",
  borderLight: "#2E3940",
  text: "#E7EDF0",
  dim: "#7D8B96",
  dim2: "#57646D",
  green: "#1FBF75",
  greenDim: "#123B29",
  red: "#E5484D",
  redDim: "#3B1518",
  gold: "#D4A94B",
  goldDim: "#3A2F14",
  amber: "#E8A33D",
  blue: "#4C8DFF",
};

const mono = { fontFamily: 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace' };
const sans = { fontFamily: 'ui-sans-serif, "Inter", system-ui, -apple-system, sans-serif' };

// Deployed BazaarAI market-data backend
const DEFAULT_API_BASE = "https://bazaarai-backend-2bh5.onrender.com";
const DEFAULT_WS_URL = "wss://bazaarai-backend-2bh5.onrender.com/ws/ticks";

/* ============================== SEEDED RNG ============================== */
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = Math.imul(31, h) + s.charCodeAt(i) | 0; }
  return h;
}
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ============================== UNIVERSE ============================== */
const UNIVERSE = [
  { sym: "RELIANCE", name: "Reliance Industries", sector: "Energy", base: 2954.2, vol: 0.016 },
  { sym: "TCS", name: "Tata Consultancy Services", sector: "IT", base: 4152.8, vol: 0.013 },
  { sym: "INFY", name: "Infosys", sector: "IT", base: 1848.5, vol: 0.017 },
  { sym: "HDFCBANK", name: "HDFC Bank", sector: "Banking", base: 1652.1, vol: 0.012 },
  { sym: "ICICIBANK", name: "ICICI Bank", sector: "Banking", base: 1196.4, vol: 0.015 },
  { sym: "SBIN", name: "State Bank of India", sector: "Banking", base: 814.6, vol: 0.020 },
  { sym: "ITC", name: "ITC Ltd", sector: "FMCG", base: 464.9, vol: 0.011 },
  { sym: "LT", name: "Larsen & Toubro", sector: "Infra", base: 3548.0, vol: 0.018 },
  { sym: "BHARTIARTL", name: "Bharti Airtel", sector: "Telecom", base: 1582.3, vol: 0.014 },
  { sym: "MARUTI", name: "Maruti Suzuki", sector: "Auto", base: 12810.0, vol: 0.017 },
  { sym: "HCLTECH", name: "HCL Technologies", sector: "IT", base: 1749.0, vol: 0.015 },
  { sym: "AXISBANK", name: "Axis Bank", sector: "Banking", base: 1121.7, vol: 0.019 },
  { sym: "KOTAKBANK", name: "Kotak Mahindra Bank", sector: "Banking", base: 1782.6, vol: 0.013 },
  { sym: "WIPRO", name: "Wipro", sector: "IT", base: 545.3, vol: 0.021 },
  { sym: "SUNPHARMA", name: "Sun Pharma", sector: "Pharma", base: 1783.9, vol: 0.016 },
];

const INDICES = [
  { key: "NIFTY50", name: "NIFTY 50", base: 25142.6, vol: 0.008 },
  { key: "SENSEX", name: "SENSEX", base: 82340.1, vol: 0.008 },
  { key: "BANKNIFTY", name: "NIFTY BANK", base: 54218.9, vol: 0.010 },
  { key: "NIFTYIT", name: "NIFTY IT", base: 43486.3, vol: 0.012 },
];

/* ============================== SERIES GEN ============================== */
function genOHLC(symbol, base, vol, n = 180) {
  const rng = mulberry32(hashStr(symbol));
  let price = base * (0.82 + rng() * 0.1);
  const drift = (rng() - 0.48) * 0.0006;
  const out = [];
  for (let i = 0; i < n; i++) {
    const change = drift + (rng() - 0.5) * vol;
    const open = price;
    const close = open * (1 + change);
    const high = Math.max(open, close) * (1 + rng() * vol * 0.6);
    const low = Math.min(open, close) * (1 - rng() * vol * 0.6);
    const volu = Math.round(500000 + rng() * 4500000);
    out.push({ i, open, high, low, close, volume: volu });
    price = close;
  }
  // pull last close toward the "current" base so dashboard/detail line up
  const scale = base / out[out.length - 1].close;
  return out.map(d => ({
    i: d.i,
    open: d.open * scale,
    high: d.high * scale,
    low: d.low * scale,
    close: d.close * scale,
    volume: d.volume,
  }));
}

function sma(arr, period) {
  return arr.map((_, i) => {
    if (i < period - 1) return null;
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += arr[j].close;
    return s / period;
  });
}
function ema(arr, period) {
  const k = 2 / (period + 1);
  let prev = null;
  return arr.map((d, i) => {
    if (i === 0) { prev = d.close; return prev; }
    prev = d.close * k + prev * (1 - k);
    return prev;
  });
}
function rsi(arr, period = 14) {
  const out = new Array(arr.length).fill(null);
  let gains = 0, losses = 0;
  for (let i = 1; i < arr.length; i++) {
    const diff = arr[i].close - arr[i - 1].close;
    const g = Math.max(diff, 0), l = Math.max(-diff, 0);
    if (i <= period) { gains += g; losses += l; if (i === period) { const rs = gains / (losses || 1e-6); out[i] = 100 - 100 / (1 + rs); } }
    else {
      gains = (gains * (period - 1) + g) / period;
      losses = (losses * (period - 1) + l) / period;
      const rs = gains / (losses || 1e-6);
      out[i] = 100 - 100 / (1 + rs);
    }
  }
  return out;
}
function macdCalc(arr) {
  const e12 = ema(arr, 12), e26 = ema(arr, 26);
  const macdLine = arr.map((_, i) => e12[i] - e26[i]);
  const k = 2 / (9 + 1);
  let prev = macdLine[0];
  const signal = macdLine.map((v, i) => { if (i === 0) return v; prev = v * k + prev * (1 - k); return prev; });
  return arr.map((_, i) => ({ macd: macdLine[i], signal: signal[i], hist: macdLine[i] - signal[i] }));
}
function bollinger(arr, period = 20, mult = 2) {
  return arr.map((_, i) => {
    if (i < period - 1) return { mid: null, upper: null, lower: null };
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += arr[j].close;
    const mean = s / period;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (arr[j].close - mean) ** 2;
    const sd = Math.sqrt(variance / period);
    return { mid: mean, upper: mean + mult * sd, lower: mean - mult * sd };
  });
}

/* ============================== DERIVED SIGNAL (mock, feature-driven) ============================== */
function deriveSignal(symbol, series) {
  const closes = series;
  const rsiArr = rsi(closes);
  const macdArr = macdCalc(closes);
  const sma20 = sma(closes, 20);
  const ema21Arr = ema(closes, 21);
  const last = closes.length - 1;
  const price = closes[last].close;
  const lastRSI = rsiArr[last] ?? 50;
  const lastMACD = macdArr[last];
  const aboveEMA21 = price > ema21Arr[last];
  const avgVol = closes.slice(-20).reduce((a, b) => a + b.volume, 0) / 20;
  const volAboveAvg = closes[last].volume > avgVol;
  const macdBullish = lastMACD.macd > lastMACD.signal;

  let score = 50;
  score += aboveEMA21 ? 10 : -10;
  score += macdBullish ? 12 : -12;
  score += lastRSI > 55 && lastRSI < 70 ? 10 : lastRSI >= 70 ? -6 : lastRSI < 35 ? -8 : 2;
  score += volAboveAvg ? 6 : -3;
  const rng = mulberry32(hashStr(symbol + "sig"));
  score += Math.round((rng() - 0.5) * 14);
  score = Math.max(2, Math.min(97, Math.round(score)));

  let signal = "HOLD";
  if (score >= 66) signal = "BUY";
  else if (score <= 38) signal = "SELL";

  const atr = Math.abs(closes[last].high - closes[last].low) * 1.4 || price * 0.012;
  const stopLoss = signal === "SELL" ? price + atr * 1.3 : price - atr * 1.3;
  const target = signal === "SELL" ? price - atr * 2.4 : price + atr * 2.4;
  const rr = Math.abs((target - price) / (price - stopLoss || 1));

  const reasons = [];
  reasons.push(aboveEMA21 ? "Price is trading above the 21 EMA" : "Price is trading below the 21 EMA");
  reasons.push(macdBullish ? "MACD line is above its signal line (bullish momentum)" : "MACD line is below its signal line (bearish momentum)");
  reasons.push(lastRSI >= 70 ? `RSI at ${lastRSI.toFixed(0)} is in overbought territory` : lastRSI <= 35 ? `RSI at ${lastRSI.toFixed(0)} is in oversold territory` : `RSI at ${lastRSI.toFixed(0)} is in a neutral-to-healthy range`);
  reasons.push(volAboveAvg ? "Volume is above its 20-period average" : "Volume is below its 20-period average");
  reasons.push(`ML classifier estimates a ${score}% probability of the labeled direction over the next period`);

  return { signal, score, price, stopLoss, target, rr, reasons, lastRSI, macdBullish, aboveEMA21, volAboveAvg };
}

/* ============================== FORMATTERS ============================== */
const fmtINR = (v) => "₹" + v.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const fmtPct = (v) => (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
const fmtNum = (v) => v.toLocaleString("en-IN");

/* ============================== SMALL UI PARTS ============================== */
function Pill({ children, tone = "dim" }) {
  const map = {
    green: { bg: T.greenDim, fg: T.green },
    red: { bg: T.redDim, fg: T.red },
    gold: { bg: T.goldDim, fg: T.gold },
    dim: { bg: T.panel2, fg: T.dim },
  };
  const c = map[tone];
  return (
    <span style={{ background: c.bg, color: c.fg, fontSize: 11, padding: "3px 8px", borderRadius: 4, fontWeight: 600, letterSpacing: 0.3, ...mono }}>
      {children}
    </span>
  );
}

function SignalBadge({ signal }) {
  const tone = signal === "BUY" ? "green" : signal === "SELL" ? "red" : "gold";
  const dot = signal === "BUY" ? "🟢" : signal === "SELL" ? "🔴" : "🟡";
  return <Pill tone={tone}>{dot} {signal}</Pill>;
}

function Card({ children, style, ...rest }) {
  return (
    <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8, ...style }} {...rest}>
      {children}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: T.dim2, fontWeight: 700, marginBottom: 10, ...sans }}>
      {children}
    </div>
  );
}

/* ============================== LIVE TICKER TAPE ============================== */
function TickerTape({ items }) {
  const doubled = [...items, ...items];
  return (
    <div style={{ overflow: "hidden", borderBottom: `1px solid ${T.border}`, background: "#0D1114", height: 34 }}>
      <div className="ticker-track" style={{ display: "flex", width: "max-content", alignItems: "center", height: 34, animation: "ticker-scroll 38s linear infinite" }}>
        {doubled.map((it, idx) => (
          <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 18px", ...mono, fontSize: 12, whiteSpace: "nowrap" }}>
            <span style={{ color: T.dim, fontWeight: 600 }}>{it.sym}</span>
            <span style={{ color: T.text }}>{it.price.toFixed(2)}</span>
            <span style={{ color: it.chg >= 0 ? T.green : T.red }}>{fmtPct(it.chg)}</span>
          </div>
        ))}
      </div>
      <style>{`@keyframes ticker-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
    </div>
  );
}

/* ============================== CANDLESTICK CHART (custom SVG) ============================== */
function CandleChart({ data, showSMA, showEMA, showBB, height = 320 }) {
  const width = 900;
  const padL = 46, padR = 12, padT = 10, padB = 10;
  const closes = data;
  const sma20 = sma(closes, 20);
  const ema9 = ema(closes, 9);
  const bb = bollinger(closes, 20, 2);

  const highs = closes.map(d => d.high);
  const lows = closes.map(d => d.low);
  let max = Math.max(...highs), min = Math.min(...lows);
  if (showBB) {
    bb.forEach(b => { if (b.upper) max = Math.max(max, b.upper); if (b.lower) min = Math.min(min, b.lower); });
  }
  const pad = (max - min) * 0.06;
  max += pad; min -= pad;

  const n = closes.length;
  const cw = (width - padL - padR) / n;
  const x = (i) => padL + i * cw + cw / 2;
  const y = (v) => padT + (1 - (v - min) / (max - min)) * (height - padT - padB);

  const linePath = (arr) => {
    let d = "";
    arr.forEach((v, i) => {
      if (v === null || v === undefined) return;
      const cmd = d === "" ? "M" : "L";
      d += `${cmd}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
    });
    return d;
  };

  const gridLines = 5;
  const gridVals = Array.from({ length: gridLines }, (_, i) => min + ((max - min) / (gridLines - 1)) * i);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height }} preserveAspectRatio="none">
      {gridVals.map((v, i) => (
        <g key={i}>
          <line x1={padL} x2={width - padR} y1={y(v)} y2={y(v)} stroke={T.border} strokeWidth="1" />
          <text x={4} y={y(v) + 3} fontSize="9" fill={T.dim2} style={mono}>{v.toFixed(0)}</text>
        </g>
      ))}
      {showBB && (
        <>
          <path d={linePath(bb.map(b => b.upper))} fill="none" stroke={T.blue} strokeOpacity="0.35" strokeWidth="1" />
          <path d={linePath(bb.map(b => b.lower))} fill="none" stroke={T.blue} strokeOpacity="0.35" strokeWidth="1" />
        </>
      )}
      {closes.map((d, i) => {
        const bull = d.close >= d.open;
        const color = bull ? T.green : T.red;
        const bodyTop = y(Math.max(d.open, d.close));
        const bodyBot = y(Math.min(d.open, d.close));
        return (
          <g key={i}>
            <line x1={x(i)} x2={x(i)} y1={y(d.high)} y2={y(d.low)} stroke={color} strokeWidth="1" />
            <rect x={x(i) - cw * 0.32} y={bodyTop} width={cw * 0.64} height={Math.max(1, bodyBot - bodyTop)} fill={color} />
          </g>
        );
      })}
      {showSMA && <path d={linePath(sma20)} fill="none" stroke={T.gold} strokeWidth="1.6" />}
      {showEMA && <path d={linePath(ema9)} fill="none" stroke={T.amber} strokeWidth="1.6" strokeDasharray="4 3" />}
    </svg>
  );
}

function VolumeChart({ data, height = 60 }) {
  const width = 900, padL = 46, padR = 12;
  const max = Math.max(...data.map(d => d.volume));
  const n = data.length;
  const cw = (width - padL - padR) / n;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height }} preserveAspectRatio="none">
      {data.map((d, i) => {
        const h = (d.volume / max) * (height - 4);
        const color = d.close >= d.open ? T.green : T.red;
        return <rect key={i} x={padL + i * cw + cw * 0.18} y={height - h} width={cw * 0.64} height={h} fill={color} opacity="0.55" />;
      })}
    </svg>
  );
}

/* ============================== MAIN APP ============================== */
export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("RELIANCE");
  const [tick, setTick] = useState(0);
  const [watchlist, setWatchlist] = useState(["RELIANCE", "TCS", "INFY", "HDFCBANK"]);
  const [showSMA, setShowSMA] = useState(true);
  const [showEMA, setShowEMA] = useState(true);
  const [showBB, setShowBB] = useState(false);
  const [capital, setCapital] = useState(100000);
  const [riskPct, setRiskPct] = useState(1);
  const [scanFilters, setScanFilters] = useState([]);
  const [horizon, setHorizon] = useState("Next trading day");
  const [backendUrl, setBackendUrl] = useState(DEFAULT_WS_URL);
  const [apiBase, setApiBase] = useState(DEFAULT_API_BASE);
  const [realQuotes, setRealQuotes] = useState({});
  const [realHistory, setRealHistory] = useState({});
  const [dataStatus, setDataStatus] = useState("loading"); // loading | live | fallback | error
  const [liveStatus, setLiveStatus] = useState("disconnected"); // disconnected | connecting | connected | error
  const [liveTicks, setLiveTicks] = useState({}); // symbol -> { price, volume, ts }
  const wsRef = useRef(null);

  const connectLiveFeed = () => {
    if (!backendUrl) return;
    try {
      if (wsRef.current) wsRef.current.close();
      setLiveStatus("connecting");
      const ws = new WebSocket(backendUrl);
      wsRef.current = ws;
      ws.onopen = async () => {
        setLiveStatus("connected");
        setDataStatus("live");
        // Tell the backend which stocks this browser needs.
        try {
          await fetch(`${apiBase}/subscribe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ symbols: UNIVERSE.map(s => s.sym) }),
          });
        } catch (e) {
          console.warn("Subscription request failed", e);
        }
      };
      ws.onerror = () => { setLiveStatus("error"); setDataStatus("error"); };
      ws.onclose = () => setLiveStatus("disconnected");
      ws.onmessage = (event) => {
        try {
          const t = JSON.parse(event.data);
          if (!t.symbol || !t.last_price) return;
          setLiveTicks(prev => ({
            ...prev,
            [t.symbol]: {
              price: t.last_price,
              volume: t.volume,
              ts: t.exchange_timestamp || Date.now(),
              open: t.open,
              high: t.high,
              low: t.low,
              close: t.close,
            }
          }));
        } catch (e) { /* ignore malformed frames */ }
      };
    } catch (e) {
      setLiveStatus("error");
      setDataStatus("error");
    }
  };

  useEffect(() => {
    return () => { if (wsRef.current) wsRef.current.close(); };
  }, []);

  // Fetch the latest real snapshot every 5 seconds as a fallback/refresh.
  // WebSocket ticks are still preferred whenever they are available.
  const fetchRealQuotes = async () => {
    try {
      const res = await fetch(`${apiBase}/quote?symbols=${UNIVERSE.map(s => s.sym).join(",")}`);
      if (!res.ok) throw new Error(`Quote HTTP ${res.status}`);
      const json = await res.json();
      const rows = json?.data?.fetched || [];
      const next = {};
      rows.forEach(row => {
        const symbol = String(row.tradingSymbol || "").replace(/-EQ$/, "");
        if (!symbol || !row.ltp) return;
        next[symbol] = {
          price: Number(row.ltp),
          volume: Number(row.tradeVolume || row.tradeVolume || 0),
          open: Number(row.open || 0),
          high: Number(row.high || 0),
          low: Number(row.low || 0),
          close: Number(row.close || 0),
          ts: row.exchTradeTime || Date.now(),
        };
      });
      if (Object.keys(next).length) {
        setRealQuotes(next);
        setDataStatus("live");
      }
    } catch (e) {
      console.warn("Real quote fetch failed", e);
      if (!Object.keys(realQuotes).length) setDataStatus("fallback");
    }
  };

  useEffect(() => {
    fetchRealQuotes();
    const id = setInterval(fetchRealQuotes, 5000);
    connectLiveFeed();
    return () => {
      clearInterval(id);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // Load real daily candles for the currently selected stock.
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const to = new Date();
        const from = new Date();
        from.setDate(from.getDate() - 365);
        const fmtDate = d => {
          const pad = n => String(n).padStart(2, "0");
          return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} 09:15`;
        };
        const url = `${apiBase}/historical/${selected}?from_date=${encodeURIComponent(fmtDate(from))}&to_date=${encodeURIComponent(fmtDate(to))}&interval=ONE_DAY`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`History HTTP ${res.status}`);
        const rows = await res.json();
        if (Array.isArray(rows) && rows.length) {
          const parsed = rows.map((r, i) => ({
            i,
            time: r[0],
            open: Number(r[1]),
            high: Number(r[2]),
            low: Number(r[3]),
            close: Number(r[4]),
            volume: Number(r[5] || 0),
          })).filter(d => Number.isFinite(d.close));
          if (parsed.length) setRealHistory(prev => ({ ...prev, [selected]: parsed }));
        }
      } catch (e) {
        console.warn("Real historical data fetch failed", e);
      }
    };
    loadHistory();
  }, [selected, apiBase]);

  const seriesBySymbol = useMemo(() => {
    const map = {};
    UNIVERSE.forEach(s => {
      map[s.sym] = realHistory[s.sym] || genOHLC(s.sym, s.base, s.vol);
    });
    return map;
  }, [realHistory]);

  const liveJitter = (sym) => {
    const rng = mulberry32(hashStr(sym) + tick * 977);
    return 1 + (rng() - 0.5) * 0.004;
  };

  const stocksLive = useMemo(() => {
    return UNIVERSE.map(s => {
      const series = seriesBySymbol[s.sym];
      const prevClose = series[series.length - 2].close;
      const live = liveTicks[s.sym];
      const quote = realQuotes[s.sym];
      const base = (live && live.price) ? live.price : (quote && quote.price) ? quote.price : series[series.length - 1].close * liveJitter(s.sym);
      const chg = ((base - prevClose) / prevClose) * 100;
      const sig = deriveSignal(s.sym, series);
      return { ...s, price: base, chg, sig, series, isLive: !!((live && live.price) || (quote && quote.price)) };
    });
  }, [tick, seriesBySymbol, liveTicks, realQuotes]);

  const indicesLive = useMemo(() => {
    return INDICES.map(ix => {
      const rng = mulberry32(hashStr(ix.key) + tick * 733);
      const chg = (rng() - 0.5) * 1.4;
      const price = ix.base * (1 + chg / 100);
      return { ...ix, price, chg };
    });
  }, [tick]);

  const filtered = UNIVERSE.filter(s => s.sym.includes(query.toUpperCase()) || s.name.toUpperCase().includes(query.toUpperCase()));
  const stock = stocksLive.find(s => s.sym === selected);

  const gainers = [...stocksLive].sort((a, b) => b.chg - a.chg).slice(0, 5);
  const losers = [...stocksLive].sort((a, b) => a.chg - b.chg).slice(0, 5);
  const topSignals = [...stocksLive].sort((a, b) => b.sig.score - a.sig.score).slice(0, 4);

  const marketOpen = (() => {
    const now = new Date();
    const h = now.getUTCHours() + 5.5; // IST offset approx for demo purposes
    return h >= 9.25 && h <= 15.5;
  })();

  const TABS = [
    { id: "dashboard", label: "Dashboard" },
    { id: "analysis", label: "Stock Analysis" },
    { id: "signals", label: "AI Signals" },
    { id: "scanner", label: "Scanner" },
    { id: "backtest", label: "Backtest" },
    { id: "models", label: "Models" },
    { id: "watchlist", label: "Watchlist" },
  ];

  return (
    <div style={{ background: T.bg, color: T.text, minHeight: "100%", ...sans }}>
      {/* LIVE FEED CONNECTION BANNER */}
      <div style={{
        background: liveStatus === "connected" ? T.greenDim : T.goldDim,
        color: liveStatus === "connected" ? T.green : T.gold,
        fontSize: 11.5, padding: "6px 16px", display: "flex", alignItems: "center", gap: 10,
        borderBottom: `1px solid ${T.border}`, flexWrap: "wrap", ...mono
      }}>
        <Info size={13} />
        {liveStatus === "connected"
          ? "LIVE — connected to your deployed Angel One backend. Stock prices use real market data."
          : dataStatus === "loading"
            ? "CONNECTING — loading real Angel One market data…"
            : "LIVE FEED OFFLINE — showing the last available data while reconnecting:"}
        <input
          value={backendUrl}
          onChange={e => setBackendUrl(e.target.value)}
          placeholder="wss://your-backend.onrender.com/ws/ticks"
          style={{ background: T.panel, border: `1px solid ${T.border}`, color: T.text, borderRadius: 5, padding: "3px 8px", fontSize: 11, width: 300, ...mono }}
        />
        <button onClick={connectLiveFeed} style={{ background: T.panel2, border: `1px solid ${T.borderLight}`, color: T.text, borderRadius: 5, padding: "3px 10px", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>
          {liveStatus === "connecting" ? "Connecting…" : liveStatus === "connected" ? "Reconnect" : "Connect"}
        </button>
        {liveStatus === "error" && <span style={{ color: T.red }}>Couldn't connect — check the URL and that your backend is running.</span>}
      </div>

      {/* TOP BAR */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 26, height: 26, borderRadius: 6, background: `linear-gradient(135deg, ${T.gold}, ${T.amber})`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#1A1300", fontSize: 13, ...sans }}>B</div>
          <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: -0.3 }}>Bazaar<span style={{ color: T.gold }}>AI</span></div>
          <Pill tone={marketOpen ? "green" : "dim"}>
            <Radio size={10} style={{ display: "inline", marginRight: 4, verticalAlign: -1 }} />
            {marketOpen ? "MARKET OPEN" : "MARKET CLOSED"}
          </Pill>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.panel2, border: `1px solid ${T.border}`, borderRadius: 6, padding: "6px 10px", width: 300 }}>
          <Search size={14} color={T.dim} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search NSE/BSE symbol…"
            style={{ background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 13, width: "100%", ...mono }}
          />
        </div>
      </div>

      {/* SEARCH DROPDOWN RESULTS */}
      {query && (
        <div style={{ padding: "0 20px" }}>
          <Card style={{ marginTop: -6, marginBottom: 8, maxHeight: 180, overflowY: "auto" }}>
            {filtered.slice(0, 6).map(s => (
              <div key={s.sym} onClick={() => { setSelected(s.sym); setTab("analysis"); setQuery(""); }}
                style={{ padding: "8px 12px", display: "flex", justifyContent: "space-between", cursor: "pointer", borderBottom: `1px solid ${T.border}` }}>
                <div><span style={{ fontWeight: 700, ...mono }}>{s.sym}</span> <span style={{ color: T.dim, fontSize: 12 }}>{s.name}</span></div>
                <span style={{ color: T.dim, fontSize: 11 }}>{s.sector}</span>
              </div>
            ))}
            {filtered.length === 0 && <div style={{ padding: 12, color: T.dim, fontSize: 12 }}>No matching symbols.</div>}
          </Card>
        </div>
      )}

      {/* TICKER TAPE */}
      <TickerTape items={[...indicesLive.map(i => ({ sym: i.key, price: i.price, chg: i.chg })), ...stocksLive.map(s => ({ sym: s.sym, price: s.price, chg: s.chg }))]} />

      {/* NAV TABS */}
      <div style={{ display: "flex", gap: 2, padding: "0 20px", borderBottom: `1px solid ${T.border}`, background: T.panel }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              padding: "12px 14px", fontSize: 12.5, fontWeight: 600, color: tab === t.id ? T.text : T.dim,
              borderBottom: tab === t.id ? `2px solid ${T.gold}` : "2px solid transparent", ...sans
            }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: 20 }}>
        {tab === "dashboard" && (
          <Dashboard indicesLive={indicesLive} gainers={gainers} losers={losers} topSignals={topSignals}
            onOpen={(sym) => { setSelected(sym); setTab("analysis"); }} />
        )}
        {tab === "analysis" && stock && (
          <StockAnalysis stock={stock} showSMA={showSMA} showEMA={showEMA} showBB={showBB}
            setShowSMA={setShowSMA} setShowEMA={setShowEMA} setShowBB={setShowBB}
            capital={capital} setCapital={setCapital} riskPct={riskPct} setRiskPct={setRiskPct}
            horizon={horizon} setHorizon={setHorizon}
            watchlist={watchlist} setWatchlist={setWatchlist} apiBase={apiBase} />
        )}
        {tab === "signals" && <SignalsTab stocks={stocksLive} onOpen={(sym) => { setSelected(sym); setTab("analysis"); }} />}
        {tab === "scanner" && <ScannerTab stocks={stocksLive} filters={scanFilters} setFilters={setScanFilters} onOpen={(sym) => { setSelected(sym); setTab("analysis"); }} />}
        {tab === "backtest" && <BacktestTab stock={stock} />}
        {tab === "models" && <ModelsTab />}
        {tab === "watchlist" && (
          <WatchlistTab stocks={stocksLive.filter(s => watchlist.includes(s.sym))} all={stocksLive}
            watchlist={watchlist} setWatchlist={setWatchlist}
            onOpen={(sym) => { setSelected(sym); setTab("analysis"); }} />
        )}
      </div>

      <div style={{ padding: "16px 20px", borderTop: `1px solid ${T.border}`, color: T.dim2, fontSize: 11, textAlign: "center" }}>
        AI-generated analysis — not financial advice. Past performance does not guarantee future results. Nothing here executes trades automatically.
      </div>
    </div>
  );
}

/* ============================== DASHBOARD ============================== */
function Dashboard({ indicesLive, gainers, losers, topSignals, onOpen }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {indicesLive.map(ix => (
          <Card key={ix.key} style={{ padding: 14 }}>
            <div style={{ fontSize: 11, color: T.dim, marginBottom: 6, fontWeight: 700, letterSpacing: 0.4 }}>{ix.name}</div>
            <div style={{ fontSize: 22, fontWeight: 700, ...mono }}>{ix.price.toFixed(2)}</div>
            <div style={{ fontSize: 12.5, color: ix.chg >= 0 ? T.green : T.red, display: "flex", alignItems: "center", gap: 4, marginTop: 4, ...mono }}>
              {ix.chg >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />} {fmtPct(ix.chg)}
            </div>
          </Card>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Card style={{ padding: 16 }}>
          <SectionLabel>Top Gainers</SectionLabel>
          {gainers.map(s => (
            <RowStock key={s.sym} s={s} onOpen={onOpen} />
          ))}
        </Card>
        <Card style={{ padding: 16 }}>
          <SectionLabel>Top Losers</SectionLabel>
          {losers.map(s => (
            <RowStock key={s.sym} s={s} onOpen={onOpen} />
          ))}
        </Card>
      </div>

      <Card style={{ padding: 16 }}>
        <SectionLabel>Strongest AI Signals</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {topSignals.map(s => (
            <div key={s.sym} onClick={() => onOpen(s.sym)} style={{ cursor: "pointer", background: T.panel2, border: `1px solid ${T.border}`, borderRadius: 8, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontWeight: 700, ...mono, fontSize: 13 }}>{s.sym}</span>
                <SignalBadge signal={s.sig.signal} />
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, ...mono }}>{fmtINR(s.price)}</div>
              <div style={{ fontSize: 11, color: T.dim, marginTop: 6 }}>AI Score <span style={{ color: T.gold, fontWeight: 700 }}>{s.sig.score}/100</span></div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function RowStock({ s, onOpen }) {
  return (
    <div onClick={() => onOpen(s.sym)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${T.border}`, cursor: "pointer" }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, ...mono }}>{s.sym}</div>
        <div style={{ fontSize: 11, color: T.dim2 }}>{s.sector}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 13, ...mono }}>{fmtINR(s.price)}</div>
        <div style={{ fontSize: 11.5, color: s.chg >= 0 ? T.green : T.red, ...mono }}>{fmtPct(s.chg)}</div>
      </div>
    </div>
  );
}

/* ============================== STOCK ANALYSIS ============================== */
function StockAnalysis({ stock, showSMA, showEMA, showBB, setShowSMA, setShowEMA, setShowBB, capital, setCapital, riskPct, setRiskPct, horizon, setHorizon, watchlist, setWatchlist, apiBase }) {
  const [tf, setTf] = useState("1D");
  const sig = stock.sig;
  const inWatch = watchlist.includes(stock.sym);
  const qty = Math.max(0, Math.floor((capital * (riskPct / 100)) / Math.abs(sig.price - sig.stopLoss || 1)));

  // Real trained-model prediction from the backend's /predict/{symbol} —
  // separate from `sig`, which is the rule-based fallback score. This can
  // fail (503) if no model has been trained yet, or if the symbol's
  // history is too short — both handled gracefully below.
  const [mlPrediction, setMlPrediction] = useState(null);
  const [mlStatus, setMlStatus] = useState("loading"); // loading | ready | unavailable | error

  useEffect(() => {
    let cancelled = false;
    setMlStatus("loading");
    setMlPrediction(null);
    fetch(`${apiBase}/predict/${encodeURIComponent(stock.sym)}`)
      .then(res => {
        if (res.status === 503) throw new Error("no_model");
        if (!res.ok) throw new Error("request_failed");
        return res.json();
      })
      .then(payload => {
        if (cancelled) return;
        // The deployed FastAPI response is wrapped as:
        // { "status": true, "data": { ...prediction... } }
        const prediction = payload?.data ?? payload;
        if (!payload?.status && payload?.data == null) throw new Error("invalid_response");
        if (!prediction?.signal) throw new Error("invalid_prediction");
        setMlPrediction(prediction);
        setMlStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setMlStatus("unavailable");
      });
    return () => { cancelled = true; };
  }, [stock.sym, apiBase]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Card style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 20, fontWeight: 800, ...mono }}>{stock.sym}</div>
                <span style={{ fontSize: 12, color: T.dim }}>{stock.name} · NSE</span>
                <button onClick={() => setWatchlist(w => inWatch ? w.filter(x => x !== stock.sym) : [...w, stock.sym])}
                  style={{ background: "transparent", border: "none", cursor: "pointer" }}>
                  <Star size={16} fill={inWatch ? T.gold : "none"} color={inWatch ? T.gold : T.dim} />
                </button>
              </div>
              <div style={{ fontSize: 30, fontWeight: 800, marginTop: 6, ...mono, display: "flex", alignItems: "center", gap: 8 }}>
                {fmtINR(stock.price)}
                {stock.isLive && <Pill tone="green"><Radio size={9} style={{ display: "inline", marginRight: 3, verticalAlign: -1 }} />LIVE</Pill>}
              </div>
              <div style={{ fontSize: 13, color: stock.chg >= 0 ? T.green : T.red, ...mono }}>
                {fmtPct(stock.chg)} today
              </div>
            </div>
            <SignalBadge signal={sig.signal} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 16 }}>
            {[
              ["Open", stock.series[stock.series.length - 1].open],
              ["High", stock.series[stock.series.length - 1].high],
              ["Low", stock.series[stock.series.length - 1].low],
              ["Prev Close", stock.series[stock.series.length - 2].close],
            ].map(([label, val]) => (
              <div key={label}>
                <div style={{ fontSize: 10.5, color: T.dim2 }}>{label}</div>
                <div style={{ fontSize: 13, ...mono }}>{fmtINR(val)}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 10 }}>
            {[
              ["Volume", fmtNum(stock.series[stock.series.length - 1].volume)],
              ["52W High", fmtINR(Math.max(...stock.series.map(d => d.high)))],
              ["52W Low", fmtINR(Math.min(...stock.series.map(d => d.low)))],
              ["Updated", "just now (sim)"],
            ].map(([label, val]) => (
              <div key={label}>
                <div style={{ fontSize: 10.5, color: T.dim2 }}>{label}</div>
                <div style={{ fontSize: 13, ...mono }}>{val}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 4 }}>
              {["1m", "5m", "15m", "30m", "1H", "1D", "1W", "1M"].map(f => (
                <button key={f} onClick={() => setTf(f)}
                  style={{ background: tf === f ? T.panel2 : "transparent", border: `1px solid ${tf === f ? T.borderLight : "transparent"}`, color: tf === f ? T.text : T.dim, borderRadius: 5, fontSize: 11, padding: "4px 8px", cursor: "pointer", ...mono }}>
                  {f}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, fontSize: 11 }}>
              <ToggleChip label="SMA 20" active={showSMA} onClick={() => setShowSMA(v => !v)} color={T.gold} />
              <ToggleChip label="EMA 9" active={showEMA} onClick={() => setShowEMA(v => !v)} color={T.amber} />
              <ToggleChip label="Bollinger" active={showBB} onClick={() => setShowBB(v => !v)} color={T.blue} />
            </div>
          </div>
          <CandleChart data={stock.series.slice(-90)} showSMA={showSMA} showEMA={showEMA} showBB={showBB} />
          <div style={{ fontSize: 10.5, color: T.dim2, margin: "4px 0" }}>Volume</div>
          <VolumeChart data={stock.series.slice(-90)} />
        </Card>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Card style={{ padding: 16 }}>
            <SectionLabel>RSI (14)</SectionLabel>
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={rsi(stock.series).map((v, i) => ({ i, v }))}>
                <CartesianGrid stroke={T.border} vertical={false} />
                <YAxis domain={[0, 100]} hide />
                <ReferenceLine y={70} stroke={T.red} strokeDasharray="3 3" />
                <ReferenceLine y={30} stroke={T.green} strokeDasharray="3 3" />
                <Line type="monotone" dataKey="v" stroke={T.gold} dot={false} strokeWidth={1.6} />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 12, ...mono, color: T.dim }}>Current: <span style={{ color: T.text }}>{sig.lastRSI.toFixed(1)}</span></div>
          </Card>
          <Card style={{ padding: 16 }}>
            <SectionLabel>MACD (12, 26, 9)</SectionLabel>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={macdCalc(stock.series).map((v, i) => ({ i, hist: v.hist }))}>
                <CartesianGrid stroke={T.border} vertical={false} />
                <YAxis hide />
                <Bar dataKey="hist">
                  {macdCalc(stock.series).map((v, i) => (
                    <Cell key={i} fill={v.hist >= 0 ? T.green : T.red} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 12, ...mono, color: T.dim }}>
              {sig.macdBullish ? <span style={{ color: T.green }}>Bullish crossover</span> : <span style={{ color: T.red }}>Bearish crossover</span>}
            </div>
          </Card>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Card style={{ padding: 16 }}>
          <SectionLabel>AI Signal</SectionLabel>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <SignalBadge signal={sig.signal} />
            <div style={{ fontSize: 22, fontWeight: 800, color: T.gold, ...mono }}>{sig.score}<span style={{ fontSize: 12, color: T.dim }}>/100</span></div>
          </div>
          <div style={{ height: 6, background: T.panel2, borderRadius: 3, marginTop: 10, overflow: "hidden" }}>
            <div style={{ width: `${sig.score}%`, height: "100%", background: `linear-gradient(90deg, ${T.red}, ${T.gold}, ${T.green})` }} />
          </div>
          <div style={{ fontSize: 11.5, color: T.dim, marginTop: 8 }}>
            Model estimates a <b style={{ color: T.text }}>{sig.score}%</b> probability of the labeled direction over the <b>{horizon.toLowerCase()}</b> horizon. This is a probability, not a guarantee.
          </div>
          <select value={horizon} onChange={e => setHorizon(e.target.value)}
            style={{ marginTop: 10, width: "100%", background: T.panel2, border: `1px solid ${T.border}`, color: T.text, borderRadius: 6, padding: "6px 8px", fontSize: 12, ...mono }}>
            <option>Next 15 minutes</option>
            <option>Next 1 hour</option>
            <option>Next trading day</option>
            <option>Next 5 trading days</option>
          </select>
        </Card>

        <Card style={{ padding: 16 }}>
          <SectionLabel>Trained Model Prediction</SectionLabel>
          {mlStatus === "loading" && (
            <div style={{ fontSize: 12, color: T.dim }}>Loading prediction from the trained model…</div>
          )}
          {mlStatus === "unavailable" && (
            <div style={{ fontSize: 12, color: T.dim }}>
              No trained model prediction available for {stock.sym} yet. The card above (rule-based AI Signal) is
              still valid — this is a separate, real XGBoost/LightGBM model trained on historical data, which needs
              to be trained and deployed before it appears here.
            </div>
          )}
          {mlStatus === "ready" && mlPrediction && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <SignalBadge signal={mlPrediction.signal} />
                <div style={{ fontSize: 22, fontWeight: 800, color: T.gold, ...mono }}>
                  {mlPrediction.confidence}<span style={{ fontSize: 12, color: T.dim }}>%</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                {["SELL", "HOLD", "BUY"].map(k => (
                  <div key={k} style={{ flex: 1, textAlign: "center", background: T.panel2, borderRadius: 6, padding: "6px 4px" }}>
                    <div style={{ fontSize: 9.5, color: T.dim2 }}>{k}</div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, ...mono }}>{mlPrediction.probabilities?.[k] ?? "—"}%</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: T.dim, marginTop: 10 }}>
                From <b style={{ color: T.text }}>{mlPrediction.model_name}</b> ({mlPrediction.model_version}), as of {mlPrediction.as_of}.
                This is a real trained classifier's output, not the rule-based score above — and like it, a probability, not a guarantee.
              </div>
              {mlPrediction.reasons && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                  {mlPrediction.reasons.map((r, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: T.text }}>
                      <ChevronRight size={13} color={T.gold} style={{ flexShrink: 0, marginTop: 1 }} />
                      {r}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Card>

        <Card style={{ padding: 16 }}>
          <SectionLabel>Why this signal (rule-based)</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sig.reasons.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 8, fontSize: 12.5, color: T.text }}>
                <ChevronRight size={14} color={T.gold} style={{ flexShrink: 0, marginTop: 1 }} />
                {r}
              </div>
            ))}
          </div>
        </Card>

        <Card style={{ padding: 16 }}>
          <SectionLabel><Shield size={12} style={{ display: "inline", marginRight: 4, verticalAlign: -2 }} />Risk Management</SectionLabel>
          <RiskRow label="Entry Zone" value={fmtINR(sig.price)} />
          <RiskRow label="Stop-Loss" value={fmtINR(sig.stopLoss)} tone="red" />
          <RiskRow label="Target" value={fmtINR(sig.target)} tone="green" />
          <RiskRow label="Risk/Reward" value={sig.rr.toFixed(2) + " : 1"} />
          <div style={{ borderTop: `1px solid ${T.border}`, margin: "10px 0" }} />
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10.5, color: T.dim2, marginBottom: 4 }}>Capital (₹)</div>
              <input type="number" value={capital} onChange={e => setCapital(Number(e.target.value))}
                style={{ width: "100%", background: T.panel2, border: `1px solid ${T.border}`, color: T.text, borderRadius: 6, padding: "6px 8px", fontSize: 12, ...mono }} />
            </div>
            <div style={{ width: 90 }}>
              <div style={{ fontSize: 10.5, color: T.dim2, marginBottom: 4 }}>Risk %</div>
              <input type="number" value={riskPct} onChange={e => setRiskPct(Number(e.target.value))}
                style={{ width: "100%", background: T.panel2, border: `1px solid ${T.border}`, color: T.text, borderRadius: 6, padding: "6px 8px", fontSize: 12, ...mono }} />
            </div>
          </div>
          <div style={{ background: T.panel2, borderRadius: 6, padding: 10, fontSize: 12.5 }}>
            Suggested position size: <b style={{ color: T.gold, ...mono }}>{qty}</b> shares
            <div style={{ fontSize: 11, color: T.dim2, marginTop: 2 }}>Based on stop-loss distance and risk per trade. Review manually before placing any order.</div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function ToggleChip({ label, active, onClick, color }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 5, background: "transparent", border: "none", cursor: "pointer",
      color: active ? T.text : T.dim2, fontSize: 11, ...mono
    }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: active ? color : T.border, display: "inline-block" }} />
      {label}
    </button>
  );
}

function RiskRow({ label, value, tone }) {
  const color = tone === "red" ? T.red : tone === "green" ? T.green : T.text;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12.5 }}>
      <span style={{ color: T.dim }}>{label}</span>
      <span style={{ color, fontWeight: 600, ...mono }}>{value}</span>
    </div>
  );
}

/* ============================== SIGNALS TAB ============================== */
function SignalsTab({ stocks, onOpen }) {
  const sorted = [...stocks].sort((a, b) => b.sig.score - a.sig.score);
  return (
    <Card style={{ padding: 16 }}>
      <SectionLabel>AI Predictions — All Tracked Symbols</SectionLabel>
      <Table
        headers={["Symbol", "Price", "Chg %", "Signal", "AI Score", "Stop-Loss", "Target", "R:R"]}
        rows={sorted.map(s => [
          <span style={{ fontWeight: 700, ...mono }}>{s.sym}</span>,
          <span style={mono}>{fmtINR(s.price)}</span>,
          <span style={{ ...mono, color: s.chg >= 0 ? T.green : T.red }}>{fmtPct(s.chg)}</span>,
          <SignalBadge signal={s.sig.signal} />,
          <span style={{ ...mono, color: T.gold, fontWeight: 700 }}>{s.sig.score}</span>,
          <span style={mono}>{fmtINR(s.sig.stopLoss)}</span>,
          <span style={mono}>{fmtINR(s.sig.target)}</span>,
          <span style={mono}>{s.sig.rr.toFixed(2)}</span>,
        ])}
        onRowClick={(i) => onOpen(sorted[i].sym)}
      />
    </Card>
  );
}

/* ============================== SCANNER TAB ============================== */
const SCAN_FILTERS = [
  { id: "strongBuy", label: "Strong BUY", test: s => s.sig.signal === "BUY" && s.sig.score >= 75 },
  { id: "strongSell", label: "Strong SELL", test: s => s.sig.signal === "SELL" && s.sig.score <= 25 },
  { id: "highVol", label: "High Volume", test: s => s.sig.volAboveAvg },
  { id: "rsiOversold", label: "RSI Oversold", test: s => s.sig.lastRSI < 35 },
  { id: "rsiOverbought", label: "RSI Overbought", test: s => s.sig.lastRSI > 70 },
  { id: "macdBull", label: "MACD Bullish Crossover", test: s => s.sig.macdBullish },
  { id: "macdBear", label: "MACD Bearish Crossover", test: s => !s.sig.macdBullish },
  { id: "aboveEMA", label: "Above 50 EMA", test: s => s.sig.aboveEMA21 },
  { id: "belowEMA", label: "Below 50 EMA", test: s => !s.sig.aboveEMA21 },
];

function ScannerTab({ stocks, filters, setFilters, onOpen }) {
  const toggle = (id) => setFilters(f => f.includes(id) ? f.filter(x => x !== id) : [...f, id]);
  const results = stocks.filter(s => filters.every(id => SCAN_FILTERS.find(f => f.id === id).test(s)));
  const sorted = [...results].sort((a, b) => b.sig.score - a.sig.score);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card style={{ padding: 16 }}>
        <SectionLabel><Filter size={12} style={{ display: "inline", marginRight: 4, verticalAlign: -2 }} />Filters</SectionLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {SCAN_FILTERS.map(f => (
            <button key={f.id} onClick={() => toggle(f.id)}
              style={{
                background: filters.includes(f.id) ? T.goldDim : T.panel2,
                color: filters.includes(f.id) ? T.gold : T.dim,
                border: `1px solid ${filters.includes(f.id) ? T.gold : T.border}`,
                borderRadius: 20, padding: "6px 12px", fontSize: 11.5, cursor: "pointer", fontWeight: 600
              }}>
              {f.label}
            </button>
          ))}
        </div>
      </Card>
      <Card style={{ padding: 16 }}>
        <SectionLabel>Results ({sorted.length})</SectionLabel>
        {sorted.length === 0 ? (
          <div style={{ color: T.dim, fontSize: 12.5, padding: "12px 0" }}>No symbols match the selected filters right now.</div>
        ) : (
          <Table
            headers={["Symbol", "Sector", "Price", "Chg %", "Signal", "AI Score", "RSI"]}
            rows={sorted.map(s => [
              <span style={{ fontWeight: 700, ...mono }}>{s.sym}</span>,
              <span style={{ color: T.dim, fontSize: 12 }}>{s.sector}</span>,
              <span style={mono}>{fmtINR(s.price)}</span>,
              <span style={{ ...mono, color: s.chg >= 0 ? T.green : T.red }}>{fmtPct(s.chg)}</span>,
              <SignalBadge signal={s.sig.signal} />,
              <span style={{ ...mono, color: T.gold, fontWeight: 700 }}>{s.sig.score}</span>,
              <span style={mono}>{s.sig.lastRSI.toFixed(1)}</span>,
            ])}
            onRowClick={(i) => onOpen(sorted[i].sym)}
          />
        )}
      </Card>
    </div>
  );
}

/* ============================== BACKTEST TAB ============================== */
function BacktestTab({ stock }) {
  const equity = useMemo(() => {
    const rng = mulberry32(hashStr(stock.sym + "bt"));
    let strat = 100000, bh = 100000;
    const out = [];
    for (let i = 0; i < 120; i++) {
      strat *= 1 + (rng() - 0.465) * 0.021;
      bh *= 1 + (rng() - 0.49) * 0.019;
      out.push({ i, strategy: strat, buyHold: bh });
    }
    return out;
  }, [stock.sym]);

  const finalStrat = equity[equity.length - 1].strategy;
  const finalBH = equity[equity.length - 1].buyHold;
  const totalReturn = ((finalStrat - 100000) / 100000) * 100;
  const bhReturn = ((finalBH - 100000) / 100000) * 100;

  const KPIS = [
    ["Total Return", fmtPct(totalReturn)],
    ["Annualized Return", fmtPct(totalReturn * 2.1)],
    ["Sharpe Ratio", "1.42"],
    ["Max Drawdown", "-8.6%"],
    ["Win Rate", "58.3%"],
    ["Profit Factor", "1.71"],
    ["Number of Trades", "64"],
    ["Avg Profit / Trade", fmtINR(1840)],
    ["Avg Loss / Trade", fmtINR(-980)],
    ["Best Trade", fmtINR(9450)],
    ["Worst Trade", fmtINR(-4120)],
    ["Buy & Hold Return", fmtPct(bhReturn)],
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card style={{ padding: 16 }}>
        <SectionLabel>Backtest — {stock.sym} · Assumptions Visible</SectionLabel>
        <div style={{ display: "flex", gap: 18, fontSize: 12, color: T.dim, marginBottom: 12, flexWrap: "wrap" }}>
          <span>Brokerage: <b style={{ color: T.text }}>0.03%</b> per side</span>
          <span>Slippage: <b style={{ color: T.text }}>0.05%</b></span>
          <span>Capital: <b style={{ color: T.text, ...mono }}>{fmtINR(100000)}</b></span>
          <span>Period: <b style={{ color: T.text }}>Last 120 sessions (simulated)</b></span>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={equity}>
            <CartesianGrid stroke={T.border} vertical={false} />
            <XAxis dataKey="i" hide />
            <YAxis tick={{ fill: T.dim2, fontSize: 10 }} width={60} domain={["auto", "auto"]} />
            <Tooltip contentStyle={{ background: T.panel2, border: `1px solid ${T.border}`, fontSize: 11 }} labelStyle={{ display: "none" }} />
            <Area type="monotone" dataKey="strategy" stroke={T.gold} fill={T.goldDim} strokeWidth={2} name="AI Strategy" />
            <Area type="monotone" dataKey="buyHold" stroke={T.dim} fill="transparent" strokeWidth={1.4} strokeDasharray="4 3" name="Buy & Hold" />
          </AreaChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", gap: 14, fontSize: 11.5, color: T.dim, marginTop: 6 }}>
          <span><span style={{ display: "inline-block", width: 8, height: 8, background: T.gold, borderRadius: 2, marginRight: 4 }} />AI Strategy</span>
          <span><span style={{ display: "inline-block", width: 8, height: 8, background: T.dim, borderRadius: 2, marginRight: 4 }} />Buy & Hold</span>
        </div>
      </Card>
      <Card style={{ padding: 16 }}>
        <SectionLabel>Performance Metrics</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          {KPIS.map(([label, val]) => (
            <div key={label}>
              <div style={{ fontSize: 10.5, color: T.dim2 }}>{label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, ...mono }}>{val}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ============================== MODELS TAB ============================== */
function ModelsTab() {
  const metrics = [
    ["Accuracy", "0.712"], ["Precision", "0.694"], ["Recall", "0.658"],
    ["F1 Score", "0.675"], ["ROC-AUC", "0.761"],
  ];
  const confusion = [
    ["", "Pred BUY", "Pred HOLD", "Pred SELL"],
    ["Actual BUY", 412, 88, 24],
    ["Actual HOLD", 71, 520, 66],
    ["Actual SELL", 19, 94, 388],
  ];
  const degraded = false;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card style={{ padding: 16 }}>
        <SectionLabel>Production Model</SectionLabel>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, ...mono }}>XGBoost <span style={{ color: T.gold }}>v3</span></div>
            <div style={{ fontSize: 12, color: T.dim }}>Trained on simulated dataset · 180 sessions × 15 symbols · time-series split</div>
          </div>
          <Pill tone="green">ACTIVE</Pill>
        </div>
        {degraded && (
          <div style={{ marginTop: 12, background: T.redDim, color: T.red, padding: 10, borderRadius: 6, fontSize: 12.5, display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={15} /> Model performance degraded — retraining recommended.
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginTop: 16 }}>
          {metrics.map(([label, val]) => (
            <div key={label}>
              <div style={{ fontSize: 10.5, color: T.dim2 }}>{label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, ...mono }}>{val}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card style={{ padding: 16 }}>
        <SectionLabel>Confusion Matrix</SectionLabel>
        <table style={{ borderCollapse: "collapse", fontSize: 12.5 }}>
          <tbody>
            {confusion.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{
                    padding: "8px 16px", border: `1px solid ${T.border}`,
                    background: ri === 0 || ci === 0 ? T.panel2 : "transparent",
                    fontWeight: ri === 0 || ci === 0 ? 700 : 500,
                    color: ri === 0 || ci === 0 ? T.dim : T.text, ...mono
                  }}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card style={{ padding: 16 }}>
        <SectionLabel>Model Version History</SectionLabel>
        <Table
          headers={["Version", "Trained", "Dataset Size", "Accuracy", "Backtest Return", "Status"]}
          rows={[
            [<span style={mono}>model_v3</span>, "2026-08-18", "27,000 rows", "0.712", <span style={{ color: T.green }}>+14.2%</span>, <Pill tone="green">ACTIVE</Pill>],
            [<span style={mono}>model_v2</span>, "2026-07-02", "24,500 rows", "0.688", <span style={{ color: T.green }}>+9.7%</span>, <Pill tone="dim">ARCHIVED</Pill>],
            [<span style={mono}>model_v1</span>, "2026-05-14", "18,900 rows", "0.651", <span style={{ color: T.red }}>-1.3%</span>, <Pill tone="dim">ARCHIVED</Pill>],
          ]}
        />
      </Card>
    </div>
  );
}

/* ============================== WATCHLIST TAB ============================== */
function WatchlistTab({ stocks, all, watchlist, setWatchlist, onOpen }) {
  const [adding, setAdding] = useState("");
  const candidates = all.filter(s => !watchlist.includes(s.sym) && s.sym.includes(adding.toUpperCase()));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <SectionLabel>My Watchlist</SectionLabel>
          <div style={{ display: "flex", gap: 6, position: "relative" }}>
            <input value={adding} onChange={e => setAdding(e.target.value)} placeholder="Add symbol…"
              style={{ background: T.panel2, border: `1px solid ${T.border}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, color: T.text, ...mono }} />
          </div>
        </div>
        {adding && candidates.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            {candidates.slice(0, 4).map(c => (
              <div key={c.sym} onClick={() => { setWatchlist(w => [...w, c.sym]); setAdding(""); }}
                style={{ cursor: "pointer", fontSize: 12, padding: "6px 10px", background: T.panel2, borderRadius: 6, marginBottom: 4, ...mono }}>
                + {c.sym} <span style={{ color: T.dim }}>{c.name}</span>
              </div>
            ))}
          </div>
        )}
        {stocks.length === 0 ? (
          <div style={{ color: T.dim, fontSize: 12.5 }}>No symbols yet — search above to add one.</div>
        ) : (
          <Table
            headers={["Symbol", "Price", "Chg %", "Signal", "AI Score", ""]}
            rows={stocks.map(s => [
              <span style={{ fontWeight: 700, ...mono }}>{s.sym}</span>,
              <span style={mono}>{fmtINR(s.price)}</span>,
              <span style={{ ...mono, color: s.chg >= 0 ? T.green : T.red }}>{fmtPct(s.chg)}</span>,
              <SignalBadge signal={s.sig.signal} />,
              <span style={{ ...mono, color: T.gold, fontWeight: 700 }}>{s.sig.score}</span>,
              <button onClick={(e) => { e.stopPropagation(); setWatchlist(w => w.filter(x => x !== s.sym)); }}
                style={{ background: "transparent", border: "none", color: T.dim2, cursor: "pointer" }}>
                <X size={14} />
              </button>,
            ])}
            onRowClick={(i) => onOpen(stocks[i].sym)}
          />
        )}
      </Card>
    </div>
  );
}

/* ============================== GENERIC TABLE ============================== */
function Table({ headers, rows, onRowClick }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead>
          <tr>
            {headers.map(h => (
              <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: T.dim2, fontWeight: 700, fontSize: 10.5, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: `1px solid ${T.border}` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} onClick={() => onRowClick && onRowClick(i)} style={{ cursor: onRowClick ? "pointer" : "default" }}
              onMouseEnter={e => e.currentTarget.style.background = T.panel2}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: "9px 10px", borderBottom: `1px solid ${T.border}` }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
