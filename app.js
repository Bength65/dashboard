// app.js
const elChart = document.getElementById('chart');
const elSymbol = document.getElementById('symbolInput');
const elInterval = document.getElementById('intervalSelect');
const elConn = document.getElementById('conn');

const chart = LightweightCharts.createChart(elChart, {
  layout: { background: { color: '#ffffff' }, textColor: '#1f2937' },
  grid: { vertLines: { color: '#f1f5f9' }, horzLines: { color: '#f1f5f9' } },
  rightPriceScale: { borderColor: '#e5e7eb' },
  timeScale: { borderColor: '#e5e7eb', timeVisible: true, secondsVisible: false },
  crosshair: { mode: 1 },
});

const candleSeries = chart.addCandlestickSeries({
  upColor: '#16a34a', downColor: '#dc2626', borderVisible: false,
  wickUpColor: '#16a34a', wickDownColor: '#dc2626',
});

const volumeSeries = chart.addHistogramSeries({
  priceFormat: { type: 'volume' },
  priceScaleId: '', // separat skala för att skapa "volympanel"
  scaleMargins: { top: 0.8, bottom: 0 },
});

let smaSeries = null;
let emaSeries = null;

function sma(values, length) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= length) sum -= values[i - length];
    if (i >= length - 1) out[i] = sum / length;
  }
  return out;
}
function ema(values, length) {
  const out = new Array(values.length).fill(null);
  const k = 2 / (length + 1);
  let prev = values[0];
  out[0] = prev;
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

let ws = null;
let currentSymbol = 'BTCUSDT';
let currentInterval = '1m';
let currentHistory = []; // [{time,open,high,low,close,volume}]

async function loadHistory(symbol, interval) {
  const res = await fetch(`/api/klines?symbol=${symbol}&interval=${interval}&limit=500`);
  if (!res.ok) throw new Error('Kunde inte hämta historik');
  const data = await res.json();
  currentHistory = data;
  candleSeries.setData(data.map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })));
  volumeSeries.setData(data.map((c, i) => ({
    time: c.time,
    value: c.volume,
    color: (c.close >= c.open) ? 'rgba(22,163,74,0.5)' : 'rgba(220,38,38,0.5)'
  })));
  updateIndicators();
  chart.timeScale().fitContent();
}

function updateIndicators() {
  // rensa om de inte är aktiva
  if (!smaSeries?._active) { smaSeries?.setData([]); smaSeries=null; }
  if (!emaSeries?._active) { emaSeries?.setData([]); emaSeries=null; }

  // markera aktiva via flaggor på serierna
  // (kontrolleras via knapparna nedan)
  if (smaSeries?._active) {
    const closes = currentHistory.map(c => c.close);
    const line = sma(closes, 20);
    smaSeries.setData(currentHistory.map((c, i) => line[i] ? { time: c.time, value: line[i] } : { time: c.time, value: null }));
  }
  if (emaSeries?._active) {
    const closes = currentHistory.map(c => c.close);
    const line = ema(closes, 20);
    emaSeries.setData(currentHistory.map((c, i) => line[i] ? { time: c.time, value: line[i] } : { time: c.time, value: null }));
  }
}

function connectWS(symbol, interval) {
  // stäng gammal socket
  if (ws) { ws.close(); ws = null; }
  const stream = `${symbol.toLowerCase()}@kline_${interval}`;
  const url = `wss://stream.binance.com:9443/ws/${stream}`;
  ws = new WebSocket(url);
  ws.onopen = () => elConn.textContent = 'Status: connected';
  ws.onclose = () => elConn.textContent = 'Status: disconnected';
  ws.onerror = () => elConn.textContent = 'Status: error';

  ws.onmessage = (evt) => {
    const msg = JSON.parse(evt.data);
    if (!msg.k) return;
    const k = msg.k; // kline payload
    const bar = {
      time: Math.floor(k.t / 1000),
      open: parseFloat(k.o),
      high: parseFloat(k.h),
      low: parseFloat(k.l),
      close: parseFloat(k.c),
      volume: parseFloat(k.v),
      isFinal: k.x,
    };

    const last = currentHistory[currentHistory.length - 1];
    if (!last || bar.time > last.time) {
      // nytt ljus
      currentHistory.push(bar);
      candleSeries.update({ time: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close });
      volumeSeries.update({ time: bar.time, value: bar.volume, color: (bar.close >= bar.open) ? 'rgba(22,163,74,0.5)' : 'rgba(220,38,38,0.5)' });
    } else {
      // uppdatera pågående ljus
      Object.assign(last, bar);
      candleSeries.update({ time: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close });
      volumeSeries.update({ time: bar.time, value: bar.volume, color: (bar.close >= bar.open) ? 'rgba(22,163,74,0.5)' : 'rgba(220,38,38,0.5)' });
    }
    if (smaSeries?._active || emaSeries?._active) updateIndicators();
  };
}

function refreshAll() {
  loadHistory(currentSymbol, currentInterval).then(() => connectWS(currentSymbol, currentInterval));
}

// UI handlers
document.getElementById('btnSMA').onclick = () => {
  if (!smaSeries) {
    smaSeries = chart.addLineSeries({ color:'#eab308', lineWidth:2 });
  }
  smaSeries._active = !smaSeries._active;
  document.getElementById('btnSMA').style.opacity = smaSeries._active ? '1' : '0.6';
  updateIndicators();
};
document.getElementById('btnEMA').onclick = () => {
  if (!emaSeries) {
    emaSeries = chart.addLineSeries({ color:'#06b6d4', lineWidth:2 });
  }
  emaSeries._active = !emaSeries._active;
  document.getElementById('btnEMA').style.opacity = emaSeries._active ? '1' : '0.6';
  updateIndicators();
};
document.getElementById('btnClearInd').onclick = () => {
  if (smaSeries) smaSeries._active = false;
  if (emaSeries) emaSeries._active = false;
  updateIndicators();
};

document.getElementById('btnTheme').onclick = () => {
  const dark = document.documentElement.getAttribute('data-theme') !== 'dark';
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  chart.applyOptions({
    layout: { background: { color: dark ? '#0f172a' : '#ffffff' }, textColor: dark ? '#e5e7eb' : '#1f2937' },
    grid: { vertLines: { color: dark ? '#1f2937' : '#f1f5f9' }, horzLines: { color: dark ? '#1f2937' : '#f1f5f9' } },
    rightPriceScale: { borderColor: dark ? '#334155' : '#e5e7eb' },
    timeScale: { borderColor: dark ? '#334155' : '#e5e7eb' },
  });
};

elSymbol.addEventListener('change', () => {
  currentSymbol = elSymbol.value.trim().toUpperCase();
  refreshAll();
});
elInterval.addEventListener('change', () => {
  currentInterval = elInterval.value;
  refreshAll();
});

// Watchlist snabbval
document.querySelectorAll('.sym').forEach(b => b.onclick = () => {
  currentSymbol = b.textContent.trim();
  elSymbol.value = currentSymbol;
  refreshAll();
});

// Auto-resize
new ResizeObserver(() => chart.resize(elChart.clientWidth, elChart.clientHeight)).observe(elChart);

// Init
refreshAll();