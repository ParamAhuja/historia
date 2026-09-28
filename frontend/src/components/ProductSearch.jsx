import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

const CATEGORIES = [
  'All',
  'Tablets',
  'Gaming',
  'Cameras',
  'Networking',
  'Fitness',
  'Lighting',
  'Instruments',
  'Office',
  'Outdoor',
];

export default function ProductSearch({ onTracked }) {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
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

  const debounceTimerRef = useRef(null);

  const executeSearch = useCallback(async (text, cat) => {
    setSearching(true);
    setHasSearched(true);
    setSearchError(null);
    setCatalogMessage(null);

    const activeCat = cat === 'All' ? '' : cat;

    try {
      const data = await api.searchProducts(text, activeCat);
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
  }, []);

  // Initial load on mount: fetch catalog products
  useEffect(() => {
    executeSearch('', 'All');
  }, [executeSearch]);

  // Debounced live search when query text changes
  const handleQueryChange = (e) => {
    const val = e.target.value;
    setQuery(val);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      executeSearch(val, selectedCategory);
    }, 280);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    executeSearch(query, selectedCategory);
  };

  const handleCategoryFilter = (cat) => {
    // If clicking the active category (other than 'All'), toggle back to 'All'
    const nextCat = selectedCategory === cat && cat !== 'All' ? 'All' : cat;
    setSelectedCategory(nextCat);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    executeSearch(query, nextCat);
  };

  const handleClearQuery = () => {
    setQuery('');
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    executeSearch('', selectedCategory);
  };

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
    } catch {
      // Fallback options if target store is offline
      const fallbackOpts = [
        { label: 'Standard / Default', key: 'default' },
        { label: 'Variant A', key: 'variant_a' },
      ];
      setOptions(fallbackOpts);
      setSelectedOptionKey('default');
      setOptionsNotice('Store storefront is unreachable. Standard tracking options assigned.');
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
      setSuccessMessage(`✓ Successfully started tracking "${trackedName}" (${label}).`);

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

  // Summary header text for current filter state
  let resultsMetaText = '';
  const hasText = Boolean(query.trim());
  const hasCat = selectedCategory !== 'All';

  if (hasText && hasCat) {
    resultsMetaText = `Showing ${results.length} products matching "${query}" in ${selectedCategory}:`;
  } else if (hasText) {
    resultsMetaText = `Showing ${results.length} products matching "${query}":`;
  } else if (hasCat) {
    resultsMetaText = `Showing ${results.length} products in ${selectedCategory}:`;
  } else {
    resultsMetaText = `Showing ${results.length} catalog products:`;
  }

  return (
    <section className="panel search-panel">
      <div className="panel-header-row">
        <div>
          <h2 className="panel-title">Explore Store Catalog &amp; Track Products</h2>
          <p className="muted small">
            457+ products indexed in database. Instant search with partial and fuzzy matching combined with category filters.
          </p>
        </div>
      </div>

      {successMessage && <div className="notice-banner notice-success">{successMessage}</div>}

      <form className="search-row" onSubmit={handleSearchSubmit}>
        <div className="search-input-wrap" style={{ flex: 1, position: 'relative', display: 'flex' }}>
          <input
            type="text"
            value={query}
            onChange={handleQueryChange}
            placeholder="Search keyword, name, brand, or SKU (e.g. tablet, camera, headset, quarrow, 2176)"
            aria-label="Search products"
            style={{ width: '100%', paddingRight: query ? '34px' : '12px' }}
          />
          {query && (
            <button
              type="button"
              onClick={handleClearQuery}
              title="Clear search text"
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                padding: '4px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              ✕
            </button>
          )}
        </div>
        <button type="submit" className="primary" disabled={searching}>
          {searching ? 'Filtering…' : 'Search'}
        </button>
      </form>

      {/* Category filter buttons combined with search query */}
      <div className="category-chips-row">
        <span className="small muted">Filter by Department:</span>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            className={`category-chip ${selectedCategory === cat ? 'active' : ''}`}
            onClick={() => handleCategoryFilter(cat)}
            title={selectedCategory === cat && cat !== 'All' ? 'Click to clear filter' : `Filter by ${cat}`}
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
            No products found matching &ldquo;{query}&rdquo;
            {selectedCategory !== 'All' ? ` in ${selectedCategory}` : ''}.
          </p>
          <span className="small muted">
            Try adjusting your search terms or selecting &ldquo;All&rdquo; above.
          </span>
        </div>
      )}

      {results.length > 0 && (
        <div className="search-results-wrap">
          <div className="results-header-meta">
            <span className="small muted">{resultsMetaText}</span>
          </div>

          <div className="catalog-grid">
            {results.slice(0, 12).map((r) => {
              const isSelected = selectedProduct?.storeProductId === r.storeProductId;
              const dept = r.metadata?.department;
              const brand = r.metadata?.brand;
              const basePrice = r.metadata?.base_price;

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
                    <span className="brand-name">
                      {brand || 'Store Item'}
                      {basePrice && ` · ₹${Number(basePrice).toFixed(2)}`}
                    </span>
                    <span className="action-link">{isSelected ? 'Configuring…' : 'Track Product →'}</span>
                  </div>
                </div>
              );
            })}
          </div>
          {results.length > 12 && (
            <p className="small muted centered-text" style={{ marginTop: '14px' }}>
              + {results.length - 12} more matching items in catalog. Use the search bar above to narrow results.
            </p>
          )}
        </div>
      )}

      {selectedProduct && (
        <div className="track-form" id="track-config-form">
          <div className="track-form-header">
            <h3>Configure Tracking for: <em>{selectedProduct.name}</em></h3>
            <span className="small muted">
              SKU: #{selectedProduct.storeProductId}
              {selectedProduct.metadata?.base_price && ` · Catalog Price: ₹${Number(selectedProduct.metadata.base_price).toFixed(2)}`}
            </span>
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
