import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Dot } from 'recharts';

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function StockDot(props) {
  const { cx, cy, payload } = props;
  const color = payload.stock === 'out_of_stock' ? '#c0605a' : payload.stock === 'in_stock' ? '#5fa88a' : '#7a7e8a';
  return <Dot cx={cx} cy={cy} r={3.5} fill={color} stroke="none" />;
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-time">{formatTime(label)}</div>
      <div className="chart-tooltip-price">₹{Number(point.price).toLocaleString('en-IN')}</div>
      <div className={`chart-tooltip-stock stock-${point.stock}`}>{point.stock.replace('_', ' ')}</div>
    </div>
  );
}

export default function PriceHistoryChart({ history }) {
  if (!history || history.length === 0) {
    return <p className="muted">No successful scrapes recorded yet for this product.</p>;
  }

  const data = history.map((h) => ({
    time: h.observed_at_utc,
    price: Number(h.price),
    stock: h.stock,
  }));

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#2a2a26" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="time"
            tickFormatter={formatTime}
            stroke="#8c8c82"
            tick={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' }}
            minTickGap={40}
          />
          <YAxis
            stroke="#8c8c82"
            tick={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' }}
            tickFormatter={(v) => `₹${v}`}
            width={64}
            domain={['auto', 'auto']}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="price"
            stroke="#c9a24a"
            strokeWidth={2}
            dot={<StockDot />}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="chart-legend">
        <span className="legend-dot" style={{ background: '#5fa88a' }} /> in stock
        <span className="legend-dot" style={{ background: '#c0605a' }} /> out of stock
        <span className="legend-dot" style={{ background: '#7a7e8a' }} /> unknown
      </p>
    </div>
  );
}
