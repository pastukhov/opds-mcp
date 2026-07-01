import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchBinary } from "./http-client.js";
import type { AuthOptions } from "./types.js";

const EXTENSION_BY_TYPE: Record<string, string> = {
  "application/epub+zip": ".epub",
  "application/x-mobipocket-ebook": ".mobi",
  "application/vnd.amazon.ebook": ".azw",
  "application/pdf": ".pdf",
  "application/x-fictionbook+xml": ".fb2",
  "application/fb2+zip": ".fb2.zip",
  "application/zip": ".zip",
  "application/vnd.comicbook+zip": ".cbz",
  "application/vnd.comicbook-rar": ".cbr",
  "text/plain": ".txt",
};

const DEFAULT_MAX_BYTES = 200 * 1024 * 1024; // 200MB

const COMBINING_DIACRITICS = /[̀-ͯ]/g;

function sanitizeFileNamePart(value: string): string {
  return value
    .normalize("NFKD")
    .replace(COMBINING_DIACRITICS, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

function guessExtension(contentType: string, href: string): string {
  const bare = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (EXTENSION_BY_TYPE[bare]) return EXTENSION_BY_TYPE[bare];
  const pathExt = path.extname(new URL(href).pathname);
  if (pathExt && pathExt.length <= 6) return pathExt;
  return ".bin";
}

export interface DownloadResult {
  filePath: string;
  fileName: string;
  bytes: number;
  contentType: string;
  sourceUrl: string;
}

/**
 * Downloads an OPDS acquisition link to `downloadDir`, deriving a safe filename from
 * the suggested title and the response content-type. `downloadDir` must already be an
 * absolute, trusted directory chosen by the server operator.
 */
export async function downloadAcquisition(
  href: string,
  downloadDir: string,
  opts: { auth?: AuthOptions; suggestedName?: string; maxBytes?: number } = {},
): Promise<DownloadResult> {
  const res = await fetchBinary(href, { auth: opts.auth, maxBytes: opts.maxBytes ?? DEFAULT_MAX_BYTES });
  const ext = guessExtension(res.contentType, res.url);
  const base = sanitizeFileNamePart(opts.suggestedName ?? path.basename(new URL(res.url).pathname, ext)) || "download";
  const fileName = `${base}${ext}`;

  await mkdir(downloadDir, { recursive: true });
  const filePath = path.resolve(downloadDir, fileName);
  // Guard against a crafted suggested name escaping the download directory.
  if (path.dirname(filePath) !== path.resolve(downloadDir)) {
    throw new Error("Resolved download path escapes the configured download directory");
  }

  await writeFile(filePath, res.buffer);
  return {
    filePath,
    fileName,
    bytes: res.buffer.byteLength,
    contentType: res.contentType,
    sourceUrl: res.url,
  };
}
