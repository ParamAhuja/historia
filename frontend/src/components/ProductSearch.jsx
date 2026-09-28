import { useState } from 'react';
import { api } from '../api/client';

export default function ProductSearch({ onTracked }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [catalogMessage, setCatalogMessage] = useState(null);

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [options, setOptions] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [isFallbackOptions, setIsFallbackOptions] = useState(false);
  const [optionsNotice, setOptionsNotice] = useState(null);
  const [selectedOptionKey, setSelectedOptionKey] = useState('');
  const [intervalMinutes, setIntervalMinutes] = useState(120);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  async function handleSearch(e) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setSearching(true);
    setHasSearched(true);
    setSearchError(null);
    setCatalogMessage(null);
    setSelectedProduct(null);
    setSuccessMessage(null);

    try {
      const data = await api.searchProducts(trimmed);
      setResults(data.results || []);
      if (data.message) {
        setCatalogMessage(data.message);
      }
    } catch (err) {
      setSearchError(err.message);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function handleSelectProduct(product) {
    setSelectedProduct(product);
    setOptions([]);
    setSelectedOptionKey('');
    setFormError(null);
    setIsFallbackOptions(false);
    setOptionsNotice(null);
    setOptionsLoading(true);

    try {
      const data = await api.fetchOptions(product.productUrl);
      const opts = data.options || [];
      setOptions(opts);
      setIsFallbackOptions(Boolean(data.isFallback));
      if (data.notice) {
        setOptionsNotice(data.notice);
      }
      if (opts.length > 0) {
        setSelectedOptionKey(opts[0].key);
      }
    } catch (err) {
      // If fetching fails completely, provide fallback options so the user is never stuck
      setIsFallbackOptions(true);
      const fallbackOpts = [
        { label: 'Standard / Default', key: 'default' },
        { label: 'Variant A', key: 'variant_a' },
      ];
      setOptions(fallbackOpts);
      setSelectedOptionKey('default');
      setOptionsNotice('Live store is unreachable. Standard tracking options have been assigned.');
    } finally {
      setOptionsLoading(false);
    }
  }

  async function handleTrack() {
    if (!selectedProduct || !selectedOptionKey) return;
    const option = options.find((o) => o.key === selectedOptionKey);
    const label = option?.label || selectedOptionKey;

    setSaving(true);
    setFormError(null);

    try {
      await api.createTrackedItem({
        storeProductId: selectedProduct.storeProductId,
        name: selectedProduct.name,
        productUrl: selectedProduct.productUrl,
        optionLabel: label,
        optionKey: selectedOptionKey,
        intervalMinutes: Number(intervalMinutes) || 120,
      });

      const trackedName = selectedProduct.name;
      setSelectedProduct(null);
      setOptions([]);
      setResults([]);
      setQuery('');
      setHasSearched(false);
      setSuccessMessage(`Added "${trackedName}" (${label}) to your tracking list.`);

      setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);

      onTracked?.();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel search-panel">
      <h2 className="panel-title">Find a product to track</h2>

      {successMessage && <div className="notice-banner notice-success">{successMessage}</div>}

      <form className="search-row" onSubmit={handleSearch}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by product name (e.g. phone, headphones, camera, watch)"
          aria-label="Search products"
        />
        <button type="submit" className="primary" disabled={searching}>
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>

      {searchError && <p className="error-text">Search failed: {searchError}</p>}

      {catalogMessage && <div className="notice-banner notice-info">{catalogMessage}</div>}

      {hasSearched && !searching && results.length === 0 && !searchError && (
        <p className="muted empty-search-notice">
          No products found matching &ldquo;{query}&rdquo;. Try another keyword like &ldquo;phone&rdquo;,
          &ldquo;headphones&rdquo;, or &ldquo;watch&rdquo;.
        </p>
      )}

      {results.length > 0 && (
        <div className="search-results-wrap">
          <p className="small muted results-count">Found {results.length} matching products:</p>
          <ul className="result-list">
            {results.map((r) => (
              <li key={r.storeProductId}>
                <button
                  type="button"
                  className={`result-item ${selectedProduct?.storeProductId === r.storeProductId ? 'selected' : ''}`}
                  onClick={() => handleSelectProduct(r)}
                >
                  <span className="result-name">{r.name}</span>
                  <span className="result-id">#{r.storeProductId}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {selectedProduct && (
        <div className="track-form">
          <h3>Configure Tracking: {selectedProduct.name}</h3>

          {optionsLoading && <p className="muted">Fetching available options from store…</p>}

          {optionsNotice && <div className="notice-banner notice-warning">{optionsNotice}</div>}

          {!optionsLoading && options.length > 0 && (
            <label className="field">
              <span>Select Option / Variant to Track</span>
              <select value={selectedOptionKey} onChange={(e) => setSelectedOptionKey(e.target.value)}>
                {options.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="field">
            <span>Scrape interval (minutes)</span>
            <input
              type="number"
              min={15}
              step={15}
              value={intervalMinutes}
              onChange={(e) => setIntervalMinutes(e.target.value)}
            />
            <span className="small muted">Default is 120 minutes (2-hour scheduled frequency)</span>
          </label>

          {formError && <p className="error-text">{formError}</p>}

          <div className="track-form-actions">
            <button
              type="button"
              className="primary"
              onClick={handleTrack}
              disabled={saving || !selectedOptionKey || optionsLoading}
            >
              {saving ? 'Adding to Tracker…' : 'Track this product'}
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedProduct(null);
                setOptions([]);
              }}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
