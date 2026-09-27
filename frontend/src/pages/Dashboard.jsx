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
  const [selectedId, setSelectedId] = useState(null);

  const [history, setHistory] = useState([]);
  const [logs, setLogs] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const refreshList = useCallback(async () => {
    try {
      const data = await api.listTrackedItems();
      setItems(data.items || []);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshList();
    const interval = setInterval(refreshList, 60_000);
    return () => clearInterval(interval);
  }, [refreshList]);

  const loadDetail = useCallback(async (id) => {
    if (!id) return;
    setDetailLoading(true);
    try {
      const [h, l] = await Promise.all([api.getHistory(id), api.getLogs(id)]);
      setHistory(h.history || []);
      setLogs(l.logs || []);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  function handleSelect(id) {
    setSelectedId(id);
  }

  async function handleChanged() {
    await refreshList();
    if (selectedId) await loadDetail(selectedId);
  }

  const selectedItem = items.find((i) => i.id === selectedId);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>Price Tracker</h1>
          <p className="muted">Monitoring the INE mock storefront every 2 hours</p>
        </div>
        <ExportButton />
      </header>

      <ProductSearch onTracked={refreshList} />

      {loadError && <p className="error-text">Could not load tracked items: {loadError}</p>}
      {loading ? (
        <p className="muted">Loading tracked products…</p>
      ) : (
        <TrackedProductsList items={items} selectedId={selectedId} onSelect={handleSelect} onChanged={handleChanged} />
      )}

      {selectedItem && (
        <section className="panel detail-panel">
          <h2 className="panel-title">
            {selectedItem.products.name} <span className="muted">— {selectedItem.selected_option_label}</span>
          </h2>

          {detailLoading ? (
            <p className="muted">Loading history…</p>
          ) : (
            <>
              <h3 className="section-subtitle">Price &amp; stock history</h3>
              <PriceHistoryChart history={history} />

              <h3 className="section-subtitle">Scrape log</h3>
              <ScrapeLogTable logs={logs} />
            </>
          )}
        </section>
      )}
    </div>
  );
}
