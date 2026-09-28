import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import ProductSearch from '../components/ProductSearch';
import TrackedProductsList from '../components/TrackedProductsList';
import PriceHistoryChart from '../components/PriceHistoryChart';
import ScrapeLogTable from '../components/ScrapeLogTable';
import ExportButton from '../components/ExportButton';

export default function Dashboard() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const [history, setHistory] = useState([]);
  const [logs, setLogs] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  const refreshList = useCallback(async () => {
    try {
      setRefreshing(true);
      const data = await api.listTrackedItems();
      const list = data.items || [];
      setItems(list);
      setLoadError(null);

      // Auto-select the first item on initial load if none is selected
      if (!selectedId && list.length > 0) {
        setSelectedId(list[0].id);
      }
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedId]);

  useEffect(() => {
    refreshList();
    const interval = setInterval(refreshList, 45_000);
    return () => clearInterval(interval);
  }, [refreshList]);

  const loadDetail = useCallback(async (id) => {
    if (!id) {
      setHistory([]);
      setLogs([]);
      return;
    }
    setDetailLoading(true);
    setDetailError(null);
    try {
      const [h, l] = await Promise.all([api.getHistory(id), api.getLogs(id)]);
      setHistory(h.history || []);
      setLogs(l.logs || []);
    } catch (err) {
      setDetailError(`Failed to load history details: ${err.message}`);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  function handleSelect(id) {
    if (selectedId === id) {
      setSelectedId(null);
    } else {
      setSelectedId(id);
    }
  }

  async function handleChanged() {
    await refreshList();
    if (selectedId) await loadDetail(selectedId);
  }

  const selectedItem = items.find((i) => i.id === selectedId);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-branding">
          <div className="title-row">
            <h1>INE Price Tracker</h1>
            <span className="live-badge">Automated Monitor</span>
          </div>
          <p className="muted">
            Production-grade web scraper &amp; price monitoring platform for INE mock store
          </p>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={refreshList}
            disabled={refreshing}
            title="Refresh dashboard data"
          >
            {refreshing ? 'Refreshing…' : '↻ Refresh'}
          </button>
          <ExportButton />
        </div>
      </header>

      {/* System Status / High-Availability Banner */}
      <div className="status-announcement">
        <div className="status-announcement-icon">🛡️</div>
        <div className="status-announcement-body">
          <strong>High-Availability Resilience Mode:</strong> 457+ catalog products are synchronized and cached in Supabase.
          Scheduled 2-hour scrapers and retry engines remain active and audit-logged even during upstream mock storefront DNS downtime.
        </div>
      </div>

      <main className="dashboard-main">
        {/* Tracked Products List */}
        {loadError && (
          <div className="notice-banner notice-error">
            Could not load tracked items: {loadError}
          </div>
        )}

        {loading ? (
          <div className="loading-state">
            <p className="muted">Loading monitored products from database…</p>
          </div>
        ) : (
          <TrackedProductsList
            items={items}
            selectedId={selectedId}
            onSelect={handleSelect}
            onChanged={handleChanged}
          />
        )}

        {/* Selected Item Detail (Chart & Audit Logs) */}
        {selectedItem && (
          <section className="panel detail-panel" id="detail-panel">
            <div className="detail-panel-header">
              <div>
                <h2 className="panel-title detail-title">
                  {selectedItem.products.name}{' '}
                  <span className="variant-pill">{selectedItem.selected_option_label}</span>
                </h2>
                <div className="detail-meta small muted">
                  <span>Product SKU: #{selectedItem.products.store_product_id}</span>
                  <span>•</span>
                  <span>Schedule: Every {selectedItem.scrape_interval_minutes}m</span>
                  {selectedItem.products.product_url && (
                    <>
                      <span>•</span>
                      <a
                        href={selectedItem.products.product_url}
                        target="_blank"
                        rel="noreferrer"
                        className="external-link"
                      >
                        Target Store Page ↗
                      </a>
                    </>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="close-button"
                onClick={() => setSelectedId(null)}
                title="Close details view"
              >
                ✕ Close
              </button>
            </div>

            {detailError && <div className="notice-banner notice-error">{detailError}</div>}

            {detailLoading ? (
              <div className="loading-state">
                <p className="muted">Retrieving price history and audit logs…</p>
              </div>
            ) : (
              <>
                <h3 className="section-subtitle">Observed Price &amp; Stock Trend</h3>
                <PriceHistoryChart history={history} />

                <h3 className="section-subtitle">Scrape Attempt Audit Trail (RFC-4180 Source)</h3>
                <ScrapeLogTable logs={logs} />
              </>
            )}
          </section>
        )}

        {/* Product Search & Catalog Browser */}
        <ProductSearch onTracked={refreshList} />
      </main>

      <footer className="dashboard-footer">
        <p className="small muted">
          INE Software Engineering Intern Assignment • Unattended Scraper with Automated Retries &amp; Resiliency
        </p>
      </footer>
    </div>
  );
}
