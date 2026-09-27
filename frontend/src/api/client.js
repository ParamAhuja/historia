const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

async function request(path, options = {}) {
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
      // response wasn't JSON - keep the generic message
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  searchProducts: (q) => request(`/api/products/search?q=${encodeURIComponent(q)}`),
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
