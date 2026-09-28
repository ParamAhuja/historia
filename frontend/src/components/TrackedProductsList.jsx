import { useState } from 'react';
import { api } from '../api/client';

function formatPrice(price) {
  if (price === null || price === undefined) return '—';
  return `₹${Number(price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}

function stockLabel(stock) {
  if (stock === 'in_stock') return { text: 'In stock', className: 'stock-in' };
  if (stock === 'out_of_stock') return { text: 'Out of stock', className: 'stock-out' };
  return { text: 'Unknown', className: 'stock-unknown' };
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

  async function handleToggleActive(e, item) {
    e.stopPropagation();
    setBusyId(item.id);
    setActionType('toggle');
    try {
      await api.updateTrackedItem(item.id, { isActive: !item.is_active });
      await onChanged?.();
    } catch (err) {
      alert(`Failed to update status: ${err.message}`);
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
      await onChanged?.();
    } catch (err) {
      alert(`Failed to remove item: ${err.message}`);
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
      await api.scrapeNow(item.id);
      await onChanged?.();
    } catch (err) {
      alert(`Scrape request failed: ${err.message}`);
    } finally {
      setBusyId(null);
      setActionType(null);
    }
  }

  if (items.length === 0) {
    return (
      <section className="panel">
        <h2 className="panel-title">Tracked Products</h2>
        <div className="empty-panel">
          <p className="muted">
            No products are currently being tracked. Search for a product above and click &ldquo;Track this product&rdquo;
            to begin automated price monitoring.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-header-row">
        <h2 className="panel-title">Tracked Products ({items.length})</h2>
        <span className="small muted">Click any item to inspect price history and scrape logs</span>
      </div>

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
                    Every {item.scrape_interval_minutes}m · Last scrape: {formatRelativeTime(item.last_scraped_at)}
                  </span>
                </div>
              </button>

              <div className="tracked-item-actions">
                <button
                  type="button"
                  onClick={(e) => handleScrapeNow(e, item)}
                  disabled={isBusy}
                  title="Trigger immediate scrape attempt"
                >
                  {isBusy && actionType === 'scrape' ? 'Scraping…' : 'Scrape now'}
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
