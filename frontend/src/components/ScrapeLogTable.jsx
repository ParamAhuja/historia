function outcomeBadgeClass(outcome) {
  if (outcome === 'success') return 'badge badge-success';
  if (outcome === 'retried') return 'badge badge-retried';
  return 'badge badge-failed';
}

function formatUtc(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  } catch {
    return iso;
  }
}

function cleanMessage(text) {
  if (!text) return '';
  return text.replace(/\u001b\[[0-9;]*m/g, '').replace(/\s+/g, ' ').trim();
}

export default function ScrapeLogTable({ logs }) {
  if (!logs || logs.length === 0) {
    return (
      <div className="empty-panel">
        <p className="muted">No scrape attempts recorded yet for this product.</p>
        <span className="small muted">
          All automated and manual scrape runs (including retries and network failures) will be audited here.
        </span>
      </div>
    );
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
            <th>Details / Error</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => {
            const errorText = cleanMessage(log.error_message);
            return (
              <tr key={log.id}>
                <td className="mono small">{formatUtc(log.attempted_at_utc)}</td>
                <td className="mono small">#{log.attempt_number}</td>
                <td>
                  <span className={outcomeBadgeClass(log.outcome)}>{log.outcome}</span>
                </td>
                <td className="mono">
                  {log.outcome === 'success' && log.normalized_price !== null
                    ? `₹${Number(log.normalized_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                    : '—'}
                </td>
                <td className="mono small">
                  {log.outcome === 'success' ? (log.normalized_stock || 'unknown').replace('_', ' ') : '—'}
                </td>
                <td className="mono small">{log.parse_strategy || '—'}</td>
                <td className="mono small">{log.duration_ms ? `${log.duration_ms}ms` : '—'}</td>
                <td className="small error-cell">
                  {log.error_code ? (
                    <span title={errorText}>
                      <strong>[{log.error_code}]</strong> {errorText}
                    </span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
