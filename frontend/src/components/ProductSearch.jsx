import { useState } from 'react';
import { api } from '../api/client';

export default function ProductSearch({ onTracked }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [options, setOptions] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [selectedOptionKey, setSelectedOptionKey] = useState('');
  const [intervalMinutes, setIntervalMinutes] = useState(120);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  async function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setSearchError(null);
    setSelectedProduct(null);
    try {
      const data = await api.searchProducts(query.trim());
      setResults(data.results || []);
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
    setOptionsLoading(true);
    try {
      const data = await api.fetchOptions(product.productUrl);
      setOptions(data.options || []);
      if (data.options?.length) setSelectedOptionKey(data.options[0].key);
    } catch (err) {
      setFormError(`Could not load options: ${err.message}`);
    } finally {
      setOptionsLoading(false);
    }
  }

  async function handleTrack() {
    if (!selectedProduct || !selectedOptionKey) return;
    const option = options.find((o) => o.key === selectedOptionKey);
    setSaving(true);
    setFormError(null);
    try {
      await api.createTrackedItem({
        storeProductId: selectedProduct.storeProductId,
        name: selectedProduct.name,
        productUrl: selectedProduct.productUrl,
        optionLabel: option?.label || selectedOptionKey,
        optionKey: selectedOptionKey,
        intervalMinutes: Number(intervalMinutes) || 120,
      });
      setSelectedProduct(null);
      setOptions([]);
      setResults([]);
      setQuery('');
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
      <form className="search-row" onSubmit={handleSearch}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by product name, e.g. &ldquo;wireless headphones&rdquo;"
          aria-label="Search products"
        />
        <button type="submit" disabled={searching}>
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>

      {searchError && <p className="error-text">Search failed: {searchError}</p>}

      {results.length > 0 && (
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
      )}

      {selectedProduct && (
        <div className="track-form">
          <h3>{selectedProduct.name}</h3>

          {optionsLoading && <p className="muted">Loading options…</p>}

          {!optionsLoading && options.length > 0 && (
            <label className="field">
              <span>Option to track</span>
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
          </label>

          {formError && <p className="error-text">{formError}</p>}

          <button type="button" className="primary" onClick={handleTrack} disabled={saving || !selectedOptionKey}>
            {saving ? 'Adding…' : 'Track this product'}
          </button>
        </div>
      )}
    </section>
  );
}
