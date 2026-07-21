import { authenticatedFetch } from "./authenticatedFetch";
import { downloadBlob } from "./downloadFile";

export type SpreadsheetFormat = "csv" | "xlsx";

/** Downloads a server-generated CSV/XLSX export via an authenticated fetch (not RTK Query — the response is a Blob, not serializable Redux state). */
export async function exportSpreadsheet(path: string, format: SpreadsheetFormat, filenameBase: string): Promise<void> {
  const url = `${path}${path.includes("?") ? "&" : "?"}format=${format}`;
  const res = await authenticatedFetch(url);
  if (!res.ok) throw new Error("Export failed");
  downloadBlob(await res.blob(), `${filenameBase}.${format}`);
}
