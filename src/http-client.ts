import type { AuthOptions } from "./types.js";

const DEFAULT_TIMEOUT_MS = 20_000;
const USER_AGENT = "opds-mcp/0.1 (+https://github.com/)";

export interface FetchResult {
  url: string;
  status: number;
  contentType: string;
  body: string;
}

export class OpdsHttpError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "OpdsHttpError";
  }
}

function assertHttpUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new OpdsHttpError(`Invalid URL: ${rawUrl}`, rawUrl);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new OpdsHttpError(`Unsupported protocol "${url.protocol}", only http/https are allowed`, rawUrl);
  }
  return url;
}

function buildHeaders(auth?: AuthOptions, accept?: string): Headers {
  const headers = new Headers();
  headers.set("User-Agent", USER_AGENT);
  if (accept) headers.set("Accept", accept);
  if (auth?.username) {
    const token = Buffer.from(`${auth.username}:${auth.password ?? ""}`).toString("base64");
    headers.set("Authorization", `Basic ${token}`);
  }
  return headers;
}

/** Fetches a URL and returns the decoded text body. Intended for OPDS/Atom/JSON/OpenSearch documents. */
export async function fetchText(
  rawUrl: string,
  opts: { auth?: AuthOptions; accept?: string; timeoutMs?: number } = {},
): Promise<FetchResult> {
  const url = assertHttpUrl(rawUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: buildHeaders(opts.auth, opts.accept),
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new OpdsHttpError(`Request to ${url} failed with status ${res.status} ${res.statusText}`, url.toString(), res.status);
    }
    const body = await res.text();
    return {
      url: res.url || url.toString(),
      status: res.status,
      contentType: res.headers.get("content-type") ?? "",
      body,
    };
  } catch (err) {
    if (err instanceof OpdsHttpError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new OpdsHttpError(`Request to ${url} timed out`, url.toString());
    }
    throw new OpdsHttpError(`Request to ${url} failed: ${err instanceof Error ? err.message : String(err)}`, url.toString());
  } finally {
    clearTimeout(timeout);
  }
}

/** Fetches a URL as a binary buffer, used for downloading acquisition (book) files. */
export async function fetchBinary(
  rawUrl: string,
  opts: { auth?: AuthOptions; timeoutMs?: number; maxBytes?: number } = {},
): Promise<{ url: string; status: number; contentType: string; contentLength?: number; buffer: Buffer }> {
  const url = assertHttpUrl(rawUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);
  try {
    const res = await fetch(url, {
      headers: buildHeaders(opts.auth),
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new OpdsHttpError(`Request to ${url} failed with status ${res.status} ${res.statusText}`, url.toString(), res.status);
    }
    const declaredLength = res.headers.get("content-length");
    if (opts.maxBytes && declaredLength && Number(declaredLength) > opts.maxBytes) {
      throw new OpdsHttpError(
        `Response from ${url} declares ${declaredLength} bytes, exceeding the ${opts.maxBytes} byte limit`,
        url.toString(),
      );
    }
    const arrayBuffer = await res.arrayBuffer();
    if (opts.maxBytes && arrayBuffer.byteLength > opts.maxBytes) {
      throw new OpdsHttpError(
        `Response from ${url} is ${arrayBuffer.byteLength} bytes, exceeding the ${opts.maxBytes} byte limit`,
        url.toString(),
      );
    }
    return {
      url: res.url || url.toString(),
      status: res.status,
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
      contentLength: declaredLength ? Number(declaredLength) : undefined,
      buffer: Buffer.from(arrayBuffer),
    };
  } catch (err) {
    if (err instanceof OpdsHttpError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new OpdsHttpError(`Request to ${url} timed out`, url.toString());
    }
    throw new OpdsHttpError(`Request to ${url} failed: ${err instanceof Error ? err.message : String(err)}`, url.toString());
  } finally {
    clearTimeout(timeout);
  }
}
