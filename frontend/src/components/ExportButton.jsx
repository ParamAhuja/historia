import { api } from '../api/client';

export default function ExportButton() {
  return (
    <a className="export-button" href={api.exportCsvUrl()} download>
      Export scrape history (CSV)
    </a>
  );
}
