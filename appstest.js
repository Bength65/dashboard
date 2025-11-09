console.log("appstest.js laddad");
console.log("LightweightCharts:", typeof LightweightCharts);

const elChart = document.getElementById('chart');

const chart = LightweightCharts.createChart(elChart, {
console.log("Chart object:", chart);    
  width: 800,
  height: 400,
});

const candleSeries = chart.addCandlestickSeries();

candleSeries.setData([
  { time: Math.floor(Date.now()/1000) - 86400, open: 100, high: 110, low: 90, close: 105 },
  { time: Math.floor(Date.now()/1000), open: 105, high: 115, low: 95, close: 100 },
]);