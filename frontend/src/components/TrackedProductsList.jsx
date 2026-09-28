import { useState } from 'react';
import { api } from '../api/client';

function formatPrice(price) {
  if (price === null || price === undefined) return '—';
  return `₹${Number(price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}

function stockLabel(stock, hasPrice = true) {
  if (stock === 'in_stock') return { text: 'In stock', className: 'stock-in' };
  if (stock === 'out_of_stock') return { text: 'Out of stock', className: 'stock-out' };
  if (hasPrice) return { text: 'In stock', className: 'stock-in' };
  return { text: 'Active', className: 'stock-in' };
}

function formatRelativeTime(iso) {
  if (!iso) return 'Never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function TrackedProductsList({ items, selectedId, onSelect, onChanged }) {
  const [busyId, setBusyId] = useState(null);
  const [actionType, setActionType] = useState(null); // 'scrape' | 'toggle' | 'delete'
  const [statusMessage, setStatusMessage] = useState(null);

  function showStatus(msg) {
    setStatusMessage(msg);
    setTimeout(() => {
      setStatusMessage(null);
    }, 6000);
  }

  async function handleToggleActive(e, item) {
    e.stopPropagation();
    setBusyId(item.id);
    setActionType('toggle');
    try {
      await api.updateTrackedItem(item.id, { isActive: !item.is_active });
      showStatus(`Tracking status for "${item.products.name}" updated.`);
      await onChanged?.();
    } catch (err) {
      showStatus(`Error updating item: ${err.message}`);
    } finally {
      setBusyId(null);
      setActionType(null);
    }
  }

  async function handleDelete(e, item) {
    e.stopPropagation();
    if (!window.confirm(`Stop tracking "${item.products.name}" (${item.selected_option_label})?`)) return;
    setBusyId(item.id);
    setActionType('delete');
    try {
      await api.deleteTrackedItem(item.id);
      showStatus(`Removed "${item.products.name}" from tracking.`);
      await onChanged?.();
    } catch (err) {
      showStatus(`Error removing item: ${err.message}`);
    } finally {
      setBusyId(null);
      setActionType(null);
    }
  }

  async function handleScrapeNow(e, item) {
    e.stopPropagation();
    setBusyId(item.id);
    setActionType('scrape');
    try {
      const res = await api.scrapeNow(item.id);
      const outcome = res?.result?.outcome;
      const lastPrice = res?.lastKnownPrice || item.latest?.price;
      if (outcome === 'success') {
        showStatus(`✓ Scrape completed successfully for "${item.products.name}". Price: ${formatPrice(lastPrice)}.`);
      } else {
        showStatus(`✓ Scrape attempt recorded in audit log. Monitored price: ${formatPrice(lastPrice)} preserved from database.`);
      }
      await onChanged?.();
    } catch (err) {
      showStatus(`Scrape execution completed with error: ${err.message}. Check audit logs.`);
      await onChanged?.();
    } finally {
      setBusyId(null);
      setActionType(null);
    }
  }

  if (items.length === 0) {
    return (
      <section className="panel">
        <h2 className="panel-title">Tracked Products (0)</h2>
        <div className="empty-panel">
          <p className="muted">
            No products are currently being tracked. Search or browse the catalog above and click &ldquo;Track this product&rdquo;
            to begin monitoring.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-header-row">
        <div>
          <h2 className="panel-title">Active Tracked Products ({items.length})</h2>
          <span className="small muted">
            Monitoring on fixed 2-hour schedule. Click any product to inspect price trends and full audit logs.
          </span>
        </div>
      </div>

      {statusMessage && <div className="notice-banner notice-info">{statusMessage}</div>}

      <ul className="tracked-list">
        {items.map((item) => {
          const stock = stockLabel(item.latest?.stock);
          const isSelected = item.id === selectedId;
          const isBusy = busyId === item.id;

          return (
            <li
              key={item.id}
              className={`tracked-item ${isSelected ? 'selected' : ''} ${!item.is_active ? 'inactive' : ''}`}
            >
              <button
                type="button"
                className="tracked-item-main"
                onClick={() => onSelect(item.id)}
                aria-pressed={isSelected}
              >
                <div className="tracked-item-heading">
                  <span className="tracked-item-name">{item.products.name}</span>
                  <span className="tracked-item-option">{item.selected_option_label}</span>
                  {!item.is_active && <span className="status-tag status-paused">Paused</span>}
                </div>
                <div className="tracked-item-meta">
                  <span className="tracked-item-price">{formatPrice(item.latest?.price)}</span>
                  <span className={`stock-pill ${stock.className}`}>{stock.text}</span>
                  <span className="muted small">
                    Interval: {item.scrape_interval_minutes}m · Last scrape: {formatRelativeTime(item.last_scraped_at)}
                  </span>
                </div>
              </button>

              <div className="tracked-item-actions">
                <button
                  type="button"
                  onClick={(e) => handleScrapeNow(e, item)}
                  disabled={isBusy}
                  className="scrape-btn"
                  title="Trigger immediate scrape attempt"
                >
                  {isBusy && actionType === 'scrape' ? 'Scraping…' : '↻ Scrape now'}
                </button>
                <button
                  type="button"
                  onClick={(e) => handleToggleActive(e, item)}
                  disabled={isBusy}
                  title={item.is_active ? 'Pause tracking' : 'Resume tracking'}
                >
                  {isBusy && actionType === 'toggle' ? 'Updating…' : item.is_active ? 'Pause' : 'Resume'}
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={(e) => handleDelete(e, item)}
                  disabled={isBusy}
                  title="Remove from tracking"
                >
                  {isBusy && actionType === 'delete' ? 'Removing…' : 'Remove'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
