const rawBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
const BASE_URL = rawBase.replace(/\/+$/, ''); // Strip trailing slash to prevent double-slash issues

async function request(path, options = {}) {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (!res.ok) {
      let message = `Request failed (${res.status})`;
      try {
        const body = await res.json();
        if (body.error) message = body.error;
      } catch {
        // response wasn't JSON - keep generic message
      }
      throw new Error(message);
    }
    if (res.status === 204) return null;
    return res.json();
  } catch (err) {
    if (err.name === 'TypeError' && err.message.toLowerCase().includes('fetch')) {
      throw new Error(
        `Unable to reach API server at ${BASE_URL}. If your backend is hosted on Render's free tier, it may be waking up from sleep (~45s), or verify that VITE_API_BASE_URL is configured in Vercel settings.`
      );
    }
    throw err;
  }
}

export const api = {
  searchProducts: (q = '', category = '') => {
    const params = new URLSearchParams();
    if (q && q.trim()) params.set('q', q.trim());
    if (category && category.trim() && category.toUpperCase() !== 'ALL') {
      params.set('category', category.trim());
    }
    const qs = params.toString();
    return request(`/api/products/search${qs ? `?${qs}` : ''}`);
  },
  fetchOptions: (url) => request(`/api/products/options?url=${encodeURIComponent(url)}`),

  listTrackedItems: () => request('/api/tracked-items'),
  createTrackedItem: (payload) =>
    request('/api/tracked-items', { method: 'POST', body: JSON.stringify(payload) }),
  updateTrackedItem: (id, patch) =>
    request(`/api/tracked-items/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteTrackedItem: (id) => request(`/api/tracked-items/${id}`, { method: 'DELETE' }),
  scrapeNow: (id) => request(`/api/tracked-items/${id}/scrape-now`, { method: 'POST' }),

  getHistory: (id) => request(`/api/tracked-items/${id}/history`),
  getLogs: (id) => request(`/api/tracked-items/${id}/logs`),

  exportCsvUrl: () => `${BASE_URL}/api/export/csv`,
};

export { BASE_URL };
