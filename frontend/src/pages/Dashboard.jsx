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
      setItems(data.items || []);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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
      setSelectedId(null); // toggle off
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
            <span className="live-badge">Live Monitor</span>
          </div>
          <p className="muted">
            Automated price &amp; stock tracker for INE mock storefront • 2-hour scheduled polling
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

      <main className="dashboard-main">
        <ProductSearch onTracked={refreshList} />

        {loadError && (
          <div className="notice-banner notice-error">
            Could not load tracked items: {loadError}
          </div>
        )}

        {loading ? (
          <div className="loading-state">
            <p className="muted">Loading monitored products…</p>
          </div>
        ) : (
          <TrackedProductsList
            items={items}
            selectedId={selectedId}
            onSelect={handleSelect}
            onChanged={handleChanged}
          />
        )}

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
                  {selectedItem.products.product_url && (
                    <>
                      <span>•</span>
                      <a
                        href={selectedItem.products.product_url}
                        target="_blank"
                        rel="noreferrer"
                        className="external-link"
                      >
                        Open on Store ↗
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
                <h3 className="section-subtitle">Price &amp; Stock Trend</h3>
                <PriceHistoryChart history={history} />

                <h3 className="section-subtitle">Scrape Attempt Audit Log</h3>
                <ScrapeLogTable logs={logs} />
              </>
            )}
          </section>
        )}
      </main>

      <footer className="dashboard-footer">
        <p className="small muted">
          INE Software Engineering Intern Assignment • Unattended Scraper with Automated Retries &amp; Resiliency
        </p>
      </footer>
    </div>
  );
}
