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

export default function TrackedProductsList({ items, selectedId, onSelect, onChanged }) {
  async function handleToggleActive(item) {
    await api.updateTrackedItem(item.id, { isActive: !item.is_active });
    onChanged?.();
  }

  async function handleDelete(item) {
    if (!window.confirm(`Stop tracking "${item.products.name}" (${item.selected_option_label})?`)) return;
    await api.deleteTrackedItem(item.id);
    onChanged?.();
  }

  async function handleScrapeNow(item) {
    await api.scrapeNow(item.id);
    onChanged?.();
  }

  if (items.length === 0) {
    return (
      <section className="panel">
        <h2 className="panel-title">Tracked products</h2>
        <p className="muted">
          Nothing tracked yet. Search for a product above and pick an option to start monitoring its price.
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2 className="panel-title">Tracked products ({items.length})</h2>
      <ul className="tracked-list">
        {items.map((item) => {
          const stock = stockLabel(item.latest?.stock);
          const isSelected = item.id === selectedId;
          return (
            <li key={item.id} className={`tracked-item ${isSelected ? 'selected' : ''} ${!item.is_active ? 'inactive' : ''}`}>
              <button type="button" className="tracked-item-main" onClick={() => onSelect(item.id)}>
                <div className="tracked-item-heading">
                  <span className="tracked-item-name">{item.products.name}</span>
                  <span className="tracked-item-option">{item.selected_option_label}</span>
                </div>
                <div className="tracked-item-meta">
                  <span className="tracked-item-price">{formatPrice(item.latest?.price)}</span>
                  <span className={`stock-pill ${stock.className}`}>{stock.text}</span>
                  <span className="muted small">
                    every {item.scrape_interval_minutes}m · #{item.products.store_product_id}
                  </span>
                </div>
              </button>
              <div className="tracked-item-actions">
                <button type="button" onClick={() => handleScrapeNow(item)} title="Scrape now">
                  Scrape now
                </button>
                <button type="button" onClick={() => handleToggleActive(item)} title="Pause/resume">
                  {item.is_active ? 'Pause' : 'Resume'}
                </button>
                <button type="button" className="danger" onClick={() => handleDelete(item)} title="Stop tracking">
                  Remove
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
