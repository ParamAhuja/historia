import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Dot } from 'recharts';

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
      <div className="chart-tooltip-time">{formatTime(label)} (UTC)</div>
      <div className="chart-tooltip-price">₹{Number(point.price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
      <div className={`chart-tooltip-stock stock-${point.stock}`}>
        {(point.stock || 'unknown').replace('_', ' ')}
      </div>
    </div>
  );
}

export default function PriceHistoryChart({ history }) {
  if (!history || history.length === 0) {
    return (
      <div className="empty-chart-box">
        <p className="muted">
          No price readings recorded yet for this product.
        </p>
        <span className="small muted">
          Click &ldquo;Scrape now&rdquo; on the item above to trigger the first scrape attempt.
        </span>
      </div>
    );
  }

  const numericPrices = history.map((h) => Number(h.price)).filter((p) => !isNaN(p));
  const latestPrice = numericPrices.length > 0 ? numericPrices[numericPrices.length - 1] : null;
  const minPrice = numericPrices.length > 0 ? Math.min(...numericPrices) : null;
  const maxPrice = numericPrices.length > 0 ? Math.max(...numericPrices) : null;

  const data = history.map((h) => ({
    time: h.observed_at_utc,
    price: Number(h.price),
    stock: h.stock,
  }));

  return (
    <div className="chart-section">
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-label">Latest Price</span>
          <span className="stat-val signal">
            {latestPrice !== null ? `₹${latestPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Lowest Price</span>
          <span className="stat-val">
            {minPrice !== null ? `₹${minPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Highest Price</span>
          <span className="stat-val">
            {maxPrice !== null ? `₹${maxPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total Readings</span>
          <span className="stat-val">{history.length}</span>
        </div>
      </div>

      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#2a2e38" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="time"
              tickFormatter={formatTime}
              stroke="#8b8f9c"
              tick={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' }}
              minTickGap={40}
            />
            <YAxis
              stroke="#8b8f9c"
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
          <span className="legend-dot" style={{ background: '#5fa88a' }} /> In Stock
          <span className="legend-dot" style={{ background: '#c0605a' }} /> Out of Stock
          <span className="legend-dot" style={{ background: '#7a7e8a' }} /> Unknown
        </p>
      </div>
    </div>
  );
}
