function outcomeBadgeClass(outcome) {
  if (outcome === 'success') return 'badge badge-success';
  if (outcome === 'retried') return 'badge badge-retried';
  return 'badge badge-failed';
}

function formatUtc(iso) {
  return new Date(iso).toISOString().replace('T', ' ').replace('Z', ' UTC');
}

export default function ScrapeLogTable({ logs }) {
  if (!logs || logs.length === 0) {
    return <p className="muted">No scrape attempts recorded yet for this product.</p>;
  }

  return (
    <div className="table-wrap">
      <table className="log-table">
        <thead>
          <tr>
            <th>Timestamp (UTC)</th>
            <th>Attempt</th>
            <th>Outcome</th>
            <th>Price</th>
            <th>Stock</th>
            <th>Strategy</th>
            <th>Duration</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td className="mono">{formatUtc(log.attempted_at_utc)}</td>
              <td className="mono">#{log.attempt_number}</td>
              <td>
                <span className={outcomeBadgeClass(log.outcome)}>{log.outcome}</span>
              </td>
              <td className="mono">{log.outcome === 'success' ? `₹${log.normalized_price}` : '—'}</td>
              <td className="mono">{log.outcome === 'success' ? log.normalized_stock : '—'}</td>
              <td className="mono small">{log.parse_strategy || '—'}</td>
              <td className="mono small">{log.duration_ms ? `${log.duration_ms}ms` : '—'}</td>
              <td className="small error-cell">
                {log.error_code ? `${log.error_code}: ${log.error_message || ''}` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
