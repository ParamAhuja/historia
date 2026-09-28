import { api } from '../api/client';

export default function ExportButton() {
  return (
    <a
      className="export-button"
      href={api.exportCsvUrl()}
      download="scrape_history.csv"
      title="Download entire scrape attempt audit log as CSV"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ marginRight: '6px', verticalAlign: '-1px' }}
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      Export History (CSV)
    </a>
  );
}
