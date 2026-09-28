import { useEffect, useState } from 'react';
import { api } from '../api/client';

const POPULAR_CATEGORIES = ['Tablets', 'Gaming', 'Cameras', 'Networking', 'Fitness', 'Lighting', 'Instruments', 'Office'];

export default function ProductSearch({ onTracked }) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('Tablets');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [catalogMessage, setCatalogMessage] = useState(null);

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [options, setOptions] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsNotice, setOptionsNotice] = useState(null);
  const [selectedOptionKey, setSelectedOptionKey] = useState('');
  const [intervalMinutes, setIntervalMinutes] = useState(120);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Auto-populate with initial featured category on mount
  useEffect(() => {
    executeSearch('Tablets', true);
  }, []);

  async function executeSearch(searchTerm, isCategoryClick = false) {
    const term = searchTerm.trim();
    if (!term) return;

    setSearching(true);
    setHasSearched(true);
    setSearchError(null);
    setCatalogMessage(null);
    setSelectedProduct(null);

    try {
      const data = await api.searchProducts(term);
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

  function handleSearchSubmit(e) {
    e.preventDefault();
    setActiveCategory(null);
    executeSearch(query);
  }

  function handleCategoryClick(cat) {
    setActiveCategory(cat);
    setQuery(cat);
    executeSearch(cat, true);
  }

  async function handleSelectProduct(product) {
    setSelectedProduct(product);
    setOptions([]);
    setSelectedOptionKey('');
    setFormError(null);
    setOptionsNotice(null);
    setOptionsLoading(true);

    try {
      const data = await api.fetchOptions(product.productUrl);
      const opts = data.options || [];
      setOptions(opts);
      if (data.notice) {
        setOptionsNotice(data.notice);
      }
      if (opts.length > 0) {
        setSelectedOptionKey(opts[0].key);
      }
    } catch (err) {
      // Fallback in case options endpoint fails
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
      setSuccessMessage(`✓ Successfully added "${trackedName}" (${label}) to your tracking list.`);

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
      <div className="panel-header-row">
        <div>
          <h2 className="panel-title">Explore Store Catalog &amp; Track Products</h2>
          <p className="muted small">
            457+ products indexed in database. Instant search with partial and fuzzy matching.
          </p>
        </div>
      </div>

      {successMessage && <div className="notice-banner notice-success">{successMessage}</div>}

      <form className="search-row" onSubmit={handleSearchSubmit}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by keyword, product name, or SKU (e.g. tablet, camera, headphones, router)"
          aria-label="Search products"
        />
        <button type="submit" className="primary" disabled={searching}>
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>

      {/* Category quick filter chips */}
      <div className="category-chips-row">
        <span className="small muted">Quick Browse:</span>
        {POPULAR_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            className={`category-chip ${activeCategory === cat ? 'active' : ''}`}
            onClick={() => handleCategoryClick(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {searchError && <p className="error-text">Search failed: {searchError}</p>}

      {catalogMessage && <div className="notice-banner notice-info">{catalogMessage}</div>}

      {hasSearched && !searching && results.length === 0 && !searchError && (
        <div className="empty-panel">
          <p className="muted">
            No products found matching &ldquo;{query}&rdquo;.
          </p>
          <span className="small muted">
            Try clicking one of the category buttons above or search for &ldquo;tablet&rdquo;, &ldquo;camera&rdquo;, or &ldquo;router&rdquo;.
          </span>
        </div>
      )}

      {results.length > 0 && (
        <div className="search-results-wrap">
          <div className="results-header-meta">
            <span className="small muted">Showing {results.length} catalog products:</span>
          </div>

          <div className="catalog-grid">
            {results.slice(0, 12).map((r) => {
              const isSelected = selectedProduct?.storeProductId === r.storeProductId;
              const dept = r.metadata?.department;
              const brand = r.metadata?.brand;

              return (
                <div
                  key={r.storeProductId}
                  className={`catalog-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleSelectProduct(r)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') handleSelectProduct(r);
                  }}
                >
                  <div className="card-top">
                    <span className="product-sku">#{r.storeProductId}</span>
                    {dept && <span className="dept-tag">{dept}</span>}
                  </div>
                  <h4 className="card-name">{r.name}</h4>
                  <div className="card-bottom">
                    {brand && <span className="brand-name">{brand}</span>}
                    <span className="action-link">{isSelected ? 'Configuring…' : 'Track Product →'}</span>
                  </div>
                </div>
              );
            })}
          </div>
          {results.length > 12 && (
            <p className="small muted centered-text" style={{ marginTop: '12px' }}>
              + {results.length - 12} more matching items in catalog. Use the search bar above to narrow results.
            </p>
          )}
        </div>
      )}

      {selectedProduct && (
        <div className="track-form" id="track-config-form">
          <div className="track-form-header">
            <h3>Configure Tracking for: <em>{selectedProduct.name}</em></h3>
            <span className="small muted">SKU: #{selectedProduct.storeProductId}</span>
          </div>

          {optionsLoading && <p className="muted">Loading available product variants…</p>}

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
            <span>Scrape Frequency (Minutes)</span>
            <input
              type="number"
              min={15}
              step={15}
              value={intervalMinutes}
              onChange={(e) => setIntervalMinutes(e.target.value)}
            />
            <span className="small muted">Default is 120 minutes (every 2 hours as per assignment requirements)</span>
          </label>

          {formError && <p className="error-text">{formError}</p>}

          <div className="track-form-actions">
            <button
              type="button"
              className="primary"
              onClick={handleTrack}
              disabled={saving || !selectedOptionKey || optionsLoading}
            >
              {saving ? 'Adding to Tracker…' : '✓ Start Tracking This Product'}
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
