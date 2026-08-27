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

/* ============================== UNIVERSE ============================== */
const UNIVERSE = [
  { sym: "RELIANCE", name: "Reliance Industries", sector: "Energy" },
  { sym: "TCS", name: "Tata Consultancy Services", sector: "IT" },
  { sym: "INFY", name: "Infosys", sector: "IT" },
  { sym: "HDFCBANK", name: "HDFC Bank", sector: "Banking" },
  { sym: "ICICIBANK", name: "ICICI Bank", sector: "Banking" },
  { sym: "SBIN", name: "State Bank of India", sector: "Banking" },
  { sym: "ITC", name: "ITC Ltd", sector: "FMCG" },
  { sym: "LT", name: "Larsen & Toubro", sector: "Infra" },
  { sym: "BHARTIARTL", name: "Bharti Airtel", sector: "Telecom" },
  { sym: "MARUTI", name: "Maruti Suzuki", sector: "Auto" },
  { sym: "HCLTECH", name: "HCL Technologies", sector: "IT" },
  { sym: "AXISBANK", name: "Axis Bank", sector: "Banking" },
  { sym: "KOTAKBANK", name: "Kotak Mahindra Bank", sector: "Banking" },
  { sym: "WIPRO", name: "Wipro", sector: "IT" },
  { sym: "SUNPHARMA", name: "Sun Pharma", sector: "Pharma" },
];

const INDICES = [
  { key: "NIFTY50", name: "NIFTY 50", aliases: ["NIFTY50", "NIFTY", "NIFTY 50"] },
  { key: "SENSEX", name: "SENSEX", aliases: ["SENSEX"] },
  { key: "BANKNIFTY", name: "NIFTY BANK", aliases: ["BANKNIFTY", "NIFTYBANK", "NIFTY BANK"] },
  { key: "NIFTYIT", name: "NIFTY IT", aliases: ["NIFTYIT", "NIFTY IT"] },
];

/* ============================== TECHNICAL INDICATORS ============================== */
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

/* ============================== DERIVED SIGNAL (real-history, rule-based) ============================== */
function deriveSignal(series) {
  if (!Array.isArray(series) || series.length < 30) return null;

  const rsiArr = rsi(series);
  const macdArr = macdCalc(series);
  const ema21Arr = ema(series, 21);
  const last = series.length - 1;
  const price = Number(series[last].close);
  const lastRSI = Number(rsiArr[last] ?? 50);
  const lastMACD = macdArr[last];
  const aboveEMA21 = price > ema21Arr[last];
  const avgVol = series.slice(-20).reduce((a, b) => a + Number(b.volume || 0), 0) / 20;
  const volAboveAvg = Number(series[last].volume || 0) > avgVol;
  const macdBullish = lastMACD.macd > lastMACD.signal;

  // Deterministic technical score. No random/mock component.
  let score = 50;
  score += aboveEMA21 ? 10 : -10;
  score += macdBullish ? 12 : -12;
  score += lastRSI > 55 && lastRSI < 70 ? 10 : lastRSI >= 70 ? -6 : lastRSI < 35 ? -8 : 2;
  score += volAboveAvg ? 6 : -3;
  score = Math.max(2, Math.min(97, Math.round(score)));

  let signal = "HOLD";
  if (score >= 66) signal = "BUY";
  else if (score <= 38) signal = "SELL";

  const atr = Math.abs(Number(series[last].high) - Number(series[last].low)) * 1.4 || price * 0.012;
  const stopLoss = signal === "SELL" ? price + atr * 1.3 : price - atr * 1.3;
  const target = signal === "SELL" ? price - atr * 2.4 : price + atr * 2.4;
  const rr = Math.abs((target - price) / (price - stopLoss || 1));

  const reasons = [
    aboveEMA21 ? "Price is trading above the 21 EMA" : "Price is trading below the 21 EMA",
    macdBullish ? "MACD line is above its signal line (bullish momentum)" : "MACD line is below its signal line (bearish momentum)",
    lastRSI >= 70 ? `RSI at ${lastRSI.toFixed(0)} is in overbought territory` : lastRSI <= 35 ? `RSI at ${lastRSI.toFixed(0)} is in oversold territory` : `RSI at ${lastRSI.toFixed(0)} is in a neutral-to-healthy range`,
    volAboveAvg ? "Volume is above its 20-period average" : "Volume is below its 20-period average",
    "Signal is calculated from the real historical candles returned by the backend",
  ];

  return { signal, score, price, stopLoss, target, rr, reasons, lastRSI, macdBullish, aboveEMA21, volAboveAvg };
}

/* ============================== FORMATTERS ============================== */
const fmtINR = (v) => Number.isFinite(Number(v)) ? "₹" + Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : "—";
const fmtPct = (v) => Number.isFinite(Number(v)) ? (v >= 0 ? "+" : "") + Number(v).toFixed(2) + "%" : "—";
const fmtNum = (v) => Number.isFinite(Number(v)) ? Number(v).toLocaleString("en-IN") : "—";

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
            <span style={{ color: T.text }}>{Number.isFinite(Number(it.price)) ? Number(it.price).toFixed(2) : "—"}</span>
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

  const normalizeSymbol = (value) => String(value || "").trim().toUpperCase().replace(/-EQ$/, "");

  const connectLiveFeed = () => {
    if (!backendUrl) return;
    try {
      if (wsRef.current) wsRef.current.close();
      setLiveStatus("connecting");
      const ws = new WebSocket(backendUrl);
      wsRef.current = ws;

      ws.onopen = async () => {
        setLiveStatus("connected");
        try {
          const res = await fetch(`${apiBase}/subscribe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ symbols: UNIVERSE.map(s => s.sym) }),
          });
          if (!res.ok) throw new Error(`Subscribe HTTP ${res.status}`);
        } catch (e) {
          console.warn("Subscription request failed", e);
        }
      };

      ws.onerror = () => {
        setLiveStatus("error");
        setDataStatus("error");
      };
      ws.onclose = () => setLiveStatus("disconnected");
      ws.onmessage = (event) => {
        try {
          const t = JSON.parse(event.data);
          const symbol = normalizeSymbol(t.symbol);
          const price = Number(t.last_price);
          if (!symbol || !Number.isFinite(price)) return;
          setLiveTicks(prev => ({
            ...prev,
            [symbol]: {
              price,
              volume: Number(t.volume || 0),
              ts: t.exchange_timestamp || Date.now(),
              open: Number(t.open || 0),
              high: Number(t.high || 0),
              low: Number(t.low || 0),
              close: Number(t.close || 0),
            }
          }));
          setDataStatus("live");
        } catch (e) {
          console.warn("Invalid websocket message", e);
        }
      };
    } catch (e) {
      setLiveStatus("error");
      setDataStatus("error");
    }
  };

  const fetchRealQuotes = async () => {
    try {
      const symbols = UNIVERSE.map(s => s.sym).join(",");
      const res = await fetch(`${apiBase}/quote?symbols=${encodeURIComponent(symbols)}`);
      if (!res.ok) throw new Error(`Quote HTTP ${res.status}`);
      const json = await res.json();
      const rows = Array.isArray(json?.data?.fetched) ? json.data.fetched : [];
      const next = {};

      rows.forEach(row => {
        const symbol = normalizeSymbol(row.tradingSymbol || row.symbol);
        const price = Number(row.ltp);
        if (!symbol || !Number.isFinite(price)) return;
        next[symbol] = {
          price,
          volume: Number(row.tradeVolume || row.volume || 0),
          open: Number(row.open || 0),
          high: Number(row.high || 0),
          low: Number(row.low || 0),
          close: Number(row.close || 0),
          ts: row.exchTradeTime || Date.now(),
        };
      });

      // Try index symbols separately. If the backend does not support them,
      // the UI intentionally shows — instead of inventing an index price.
      try {
        const indexSymbols = "NIFTY,SENSEX,BANKNIFTY,NIFTYIT";
        const indexRes = await fetch(`${apiBase}/quote?symbols=${encodeURIComponent(indexSymbols)}`);
        if (indexRes.ok) {
          const indexJson = await indexRes.json();
          const indexRows = Array.isArray(indexJson?.data?.fetched) ? indexJson.data.fetched : [];
          indexRows.forEach(row => {
            const symbol = normalizeSymbol(row.tradingSymbol || row.symbol);
            const price = Number(row.ltp);
            if (!symbol || !Number.isFinite(price)) return;
            next[symbol] = {
              price,
              volume: Number(row.tradeVolume || row.volume || 0),
              open: Number(row.open || 0),
              high: Number(row.high || 0),
              low: Number(row.low || 0),
              close: Number(row.close || 0),
              ts: row.exchTradeTime || Date.now(),
            };
          });
        }
      } catch (e) {
        console.warn("Index quote fetch failed", e);
      }

      if (Object.keys(next).length) {
        setRealQuotes(prev => ({ ...prev, ...next }));
        setDataStatus("live");
      }
    } catch (e) {
      console.warn("Real quote fetch failed", e);
      setDataStatus(prev => prev === "live" ? prev : "error");
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

  useEffect(() => {
    const loadHistory = async () => {
      try {
        setRealHistory(prev => ({ ...prev, [selected]: undefined }));
        const to = new Date();
        const from = new Date();
        from.setDate(from.getDate() - 365);
        const fmtDate = d => {
          const pad = n => String(n).padStart(2, "0");
          return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} 09:15`;
        };
        const url = `${apiBase}/historical/${encodeURIComponent(selected)}?from_date=${encodeURIComponent(fmtDate(from))}&to_date=${encodeURIComponent(fmtDate(to))}&interval=ONE_DAY`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`History HTTP ${res.status}`);
        const rows = await res.json();
        if (!Array.isArray(rows)) throw new Error("Historical endpoint did not return an array");
        const parsed = rows.map((r, i) => ({
          i,
          time: r[0],
          open: Number(r[1]),
          high: Number(r[2]),
          low: Number(r[3]),
          close: Number(r[4]),
          volume: Number(r[5] || 0),
        })).filter(d => [d.open,d.high,d.low,d.close].every(Number.isFinite));
        if (parsed.length) {
          setRealHistory(prev => ({ ...prev, [selected]: parsed }));
        }
      } catch (e) {
        console.warn("Real historical data fetch failed", e);
      }
    };
    loadHistory();
  }, [selected, apiBase]);

  const seriesBySymbol = useMemo(() => {
    const map = {};
    UNIVERSE.forEach(s => { map[s.sym] = realHistory[s.sym] || []; });
    return map;
  }, [realHistory]);

  const stocksLive = useMemo(() => {
    return UNIVERSE.map(s => {
      const series = seriesBySymbol[s.sym] || [];
      const live = liveTicks[s.sym];
      const quote = realQuotes[s.sym];
      const price = live?.price ?? quote?.price ?? (series.length ? series[series.length - 1].close : null);
      const prevClose = quote?.close || (series.length >= 2 ? series[series.length - 2].close : null);
      const chg = Number.isFinite(price) && Number.isFinite(prevClose) && prevClose !== 0 ? ((price - prevClose) / prevClose) * 100 : null;
      const sig = deriveSignal(series);
      return { ...s, price, chg, sig, series, isLive: Number.isFinite(live?.price) || Number.isFinite(quote?.price) };
    });
  }, [seriesBySymbol, liveTicks, realQuotes]);

  const findIndexQuote = (ix) => {
    for (const alias of ix.aliases) {
      const q = liveTicks[normalizeSymbol(alias)] || realQuotes[normalizeSymbol(alias)];
      if (q?.price) return q;
    }
    return null;
  };

  const indicesLive = useMemo(() => INDICES.map(ix => {
    const q = findIndexQuote(ix);
    const price = q?.price ?? null;
    const prevClose = q?.close ?? null;
    const chg = Number.isFinite(price) && Number.isFinite(prevClose) && prevClose !== 0 ? ((price - prevClose) / prevClose) * 100 : null;
    return { ...ix, price, chg, isLive: !!q };
  }), [liveTicks, realQuotes]);

  const filtered = UNIVERSE.filter(s => s.sym.includes(query.toUpperCase()) || s.name.toUpperCase().includes(query.toUpperCase()));
  const stock = stocksLive.find(s => s.sym === selected);

  const gainers = [...stocksLive].filter(s => Number.isFinite(s.chg)).sort((a, b) => b.chg - a.chg).slice(0, 5);
  const losers = [...stocksLive].filter(s => Number.isFinite(s.chg)).sort((a, b) => a.chg - b.chg).slice(0, 5);
  const topSignals = [...stocksLive].filter(s => s.sig).sort((a, b) => b.sig.score - a.sig.score).slice(0, 4);

  const marketOpen = (() => {
    const parts = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
    const hh = Number(parts.find(p => p.type === "hour")?.value || 0);
    const mm = Number(parts.find(p => p.type === "minute")?.value || 0);
    const minutes = hh * 60 + mm;
    return minutes >= 9 * 60 + 15 && minutes <= 15 * 60 + 30;
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
        {liveStatus === "connected" && Object.keys(liveTicks).length > 0
          ? "LIVE — connected to your deployed Angel One backend. Showing real market ticks."
          : dataStatus === "loading"
            ? "CONNECTING — loading real Angel One market data…"
            : "LIVE FEED OFFLINE — no synthetic prices are used."}
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
            watchlist={watchlist} setWatchlist={setWatchlist} />
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
            <div style={{ fontSize: 22, fontWeight: 700, ...mono }}>{Number.isFinite(ix.price) ? ix.price.toFixed(2) : "—"}</div>
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
function StockAnalysis({ stock, showSMA, showEMA, showBB, setShowSMA, setShowEMA, setShowBB, capital, setCapital, riskPct, setRiskPct, horizon, setHorizon, watchlist, setWatchlist }) {
  const [tf, setTf] = useState("1D");
  const sig = stock.sig;
  const inWatch = watchlist.includes(stock.sym);
  const series = stock.series || [];
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  const qty = sig ? Math.max(0, Math.floor((capital * (riskPct / 100)) / Math.abs(sig.price - sig.stopLoss || 1))) : 0;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {!stock.isLive && !series.length && (
          <Card style={{ padding: 16, background: T.redDim, color: T.red }}>
            <b>Real market data unavailable for {stock.sym}.</b>
            <div style={{ marginTop: 6, fontSize: 12, color: T.text }}>The frontend will not generate replacement prices. Check the backend, Angel One session, and API endpoints.</div>
          </Card>
        )}
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
            {sig ? <SignalBadge signal={sig.signal} /> : <Pill tone="dim">WAITING</Pill>}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 16 }}>
            {[
              ["Open", last?.open],
              ["High", last?.high],
              ["Low", last?.low],
              ["Prev Close", prev?.close],
            ].map(([label, val]) => (
              <div key={label}>
                <div style={{ fontSize: 10.5, color: T.dim2 }}>{label}</div>
                <div style={{ fontSize: 13, ...mono }}>{fmtINR(val)}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 10 }}>
            {[
              ["Volume", fmtNum(last?.volume)],
              ["52W High", series.length ? fmtINR(Math.max(...series.map(d => d.high))) : "—"],
              ["52W Low", series.length ? fmtINR(Math.min(...series.map(d => d.low))) : "—"],
              ["Updated", stock.isLive ? "live" : "—"],
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
          {series.length >= 2 ? <>
            <CandleChart data={series.slice(-90)} showSMA={showSMA} showEMA={showEMA} showBB={showBB} />
            <div style={{ fontSize: 10.5, color: T.dim2, margin: "4px 0" }}>Volume</div>
            <VolumeChart data={series.slice(-90)} />
          </> : <div style={{ padding: 30, textAlign: "center", color: T.dim }}>Waiting for real historical candles from the backend…</div>}
        </Card>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Card style={{ padding: 16 }}>
            <SectionLabel>RSI (14)</SectionLabel>
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={series.length ? rsi(series).map((v, i) => ({ i, v })) : []}>
                <CartesianGrid stroke={T.border} vertical={false} />
                <YAxis domain={[0, 100]} hide />
                <ReferenceLine y={70} stroke={T.red} strokeDasharray="3 3" />
                <ReferenceLine y={30} stroke={T.green} strokeDasharray="3 3" />
                <Line type="monotone" dataKey="v" stroke={T.gold} dot={false} strokeWidth={1.6} />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 12, ...mono, color: T.dim }}>Current: <span style={{ color: T.text }}>{sig ? sig.lastRSI.toFixed(1) : "—"}</span></div>
          </Card>
          <Card style={{ padding: 16 }}>
            <SectionLabel>MACD (12, 26, 9)</SectionLabel>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={series.length ? macdCalc(series).map((v, i) => ({ i, hist: v.hist })) : []}>
                <CartesianGrid stroke={T.border} vertical={false} />
                <YAxis hide />
                <Bar dataKey="hist">
                  {(series.length ? macdCalc(series) : []).map((v, i) => (
                    <Cell key={i} fill={v.hist >= 0 ? T.green : T.red} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 12, ...mono, color: T.dim }}>
              {sig ? (sig.macdBullish ? <span style={{ color: T.green }}>Bullish crossover</span> : <span style={{ color: T.red }}>Bearish crossover</span>) : <span style={{ color: T.dim }}>Waiting for data</span>}
            </div>
          </Card>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Card style={{ padding: 16 }}>
          <SectionLabel>AI Signal</SectionLabel>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {sig ? <SignalBadge signal={sig.signal} /> : <Pill tone="dim">WAITING FOR DATA</Pill>}
            <div style={{ fontSize: 22, fontWeight: 800, color: T.gold, ...mono }}>{sig ? sig.score : "—"}{sig && <span style={{ fontSize: 12, color: T.dim }}>/100</span>}</div>
          </div>
          <div style={{ height: 6, background: T.panel2, borderRadius: 3, marginTop: 10, overflow: "hidden" }}>
            {sig && <div style={{ width: `${sig.score}%`, height: "100%", background: `linear-gradient(90deg, ${T.red}, ${T.gold}, ${T.green})` }} />}
          </div>
          <div style={{ fontSize: 11.5, color: T.dim, marginTop: 8 }}>
            {sig ? <>Technical rule score: <b style={{ color: T.text }}>{sig.score}/100</b>. This is calculated from real historical candles; it is not a trained ML probability.</> : <>Waiting for sufficient real historical data.</>}
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
          <SectionLabel>Why this signal</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(sig?.reasons || ["No signal until real historical data is available"]).map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 8, fontSize: 12.5, color: T.text }}>
                <ChevronRight size={14} color={T.gold} style={{ flexShrink: 0, marginTop: 1 }} />
                {r}
              </div>
            ))}
          </div>
        </Card>

        <Card style={{ padding: 16 }}>
          <SectionLabel><Shield size={12} style={{ display: "inline", marginRight: 4, verticalAlign: -2 }} />Risk Management</SectionLabel>
          <RiskRow label="Entry Zone" value={fmtINR(sig?.price)} />
          <RiskRow label="Stop-Loss" value={fmtINR(sig?.stopLoss)} tone="red" />
          <RiskRow label="Target" value={fmtINR(sig?.target)} tone="green" />
          <RiskRow label="Risk/Reward" value={sig ? sig.rr.toFixed(2) + " : 1" : "—"} />
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
  const sorted = [...stocks].filter(s => s.sig).sort((a, b) => b.sig.score - a.sig.score);
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
          <span style={{ ...mono, color: T.gold, fontWeight: 700 }}>{s.sig?.score ?? "—"}</span>,
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
  const results = stocks.filter(s => s.sig && filters.every(id => SCAN_FILTERS.find(f => f.id === id).test(s)));
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
              <span style={{ ...mono, color: T.gold, fontWeight: 700 }}>{s.sig?.score ?? "—"}</span>,
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
  const series = stock?.series || [];
  const ready = series.length >= 30;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card style={{ padding: 16 }}>
        <SectionLabel>Backtest — {stock?.sym || "—"}</SectionLabel>
        {ready ? (
          <div style={{ color: T.dim, fontSize: 12.5, lineHeight: 1.6 }}>
            Real historical candles are loaded. A backtest engine has not been connected yet, so no performance numbers are fabricated here.
            <br />Connect a real strategy/backtest endpoint before displaying returns, Sharpe, drawdown, or win-rate metrics.
          </div>
        ) : (
          <div style={{ color: T.dim, fontSize: 12.5 }}>Waiting for at least 30 real historical candles.</div>
        )}
      </Card>
    </div>
  );
}

/* ============================== MODELS TAB ============================== */
function ModelsTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card style={{ padding: 16 }}>
        <SectionLabel>Production Model</SectionLabel>
        <div style={{ color: T.dim, fontSize: 12.5, lineHeight: 1.6 }}>
          No trained ML model is connected to this frontend yet. The displayed BUY/HOLD/SELL score is a transparent technical-rule score calculated from real historical candles.
          <br /><br />
          Do not show fabricated accuracy, precision, ROC-AUC, confusion matrices, or model-version metrics until a real trained model endpoint is connected.
        </div>
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
              <span style={{ ...mono, color: T.gold, fontWeight: 700 }}>{s.sig?.score ?? "—"}</span>,
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
