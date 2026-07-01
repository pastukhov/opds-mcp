import os from "node:os";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { downloadAcquisition } from "./download.js";
import { fetchFeed } from "./feed.js";
import { summarizeEntry, summarizeFeed } from "./format.js";
import { fetchText } from "./http-client.js";
import { buildSearchUrl, parseOpenSearchDescription, pickBestTemplate } from "./opensearch.js";
import type { AuthOptions } from "./types.js";

export interface ServerOptions {
  /** Directory `opds_download` saves files into. Defaults to a directory under the OS temp folder. */
  downloadDir?: string;
  /** Fallback HTTP Basic Auth used when a tool call doesn't supply its own username/password. */
  defaultAuth?: AuthOptions;
  /** Fallback catalog URL used by opds_browse/opds_search/opds_get_entry when a call omits `url`. */
  defaultUrl?: string;
}

function defaultDownloadDir(): string {
  return process.env.OPDS_DOWNLOAD_DIR ? path.resolve(process.env.OPDS_DOWNLOAD_DIR) : path.join(os.tmpdir(), "opds-mcp-downloads");
}

const authArgs = {
  username: z.string().optional().describe("HTTP Basic Auth username, if the catalog requires authentication"),
  password: z.string().optional().describe("HTTP Basic Auth password, if the catalog requires authentication"),
};

function textResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

/** Builds the opds-mcp server and registers its tools. Factored out of the CLI entrypoint so it can be exercised in tests. */
export function createServer(options: ServerOptions = {}): McpServer {
  const downloadDir = options.downloadDir ?? defaultDownloadDir();
  const defaultAuth: AuthOptions = options.defaultAuth ?? {
    username: process.env.OPDS_USERNAME,
    password: process.env.OPDS_PASSWORD,
  };
  const defaultUrl = options.defaultUrl ?? process.env.OPDS_BASE_URL;

  function resolveAuth(args: { username?: string; password?: string }): AuthOptions | undefined {
    const username = args.username ?? defaultAuth.username;
    const password = args.password ?? defaultAuth.password;
    return username ? { username, password } : undefined;
  }

  function resolveUrl(url: string | undefined): string {
    const resolved = url ?? defaultUrl;
    if (!resolved) {
      throw new Error(
        "No URL was provided and no default catalog URL is configured. Pass `url`, or set OPDS_BASE_URL when starting the server.",
      );
    }
    return resolved;
  }

  const server = new McpServer({ name: "opds-mcp", version: "0.1.0" });

  server.registerTool(
    "opds_browse",
    {
      title: "Browse an OPDS catalog",
      description:
        "Fetches an OPDS catalog document (feed, navigation, or acquisition list; OPDS 1.x Atom/XML or OPDS 2.0 JSON) " +
        "and returns its navigation links (search, next/prev, subsections) and entries (books/publications) with " +
        "their acquisition (download) and cover image links.",
      inputSchema: {
        url: z
          .string()
          .optional()
          .describe(
            "Absolute URL of the OPDS catalog/feed document to fetch. Optional if the server was started with a " +
              "default catalog URL (OPDS_BASE_URL); required otherwise.",
          ),
        ...authArgs,
      },
    },
    async ({ url, username, password }) => {
      try {
        const { feed, finalUrl } = await fetchFeed(resolveUrl(url), resolveAuth({ username, password }));
        return textResult({ sourceUrl: finalUrl, ...summarizeFeed(feed) });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "opds_search",
    {
      title: "Search an OPDS catalog",
      description:
        "Searches an OPDS catalog. Pass either the catalog's root/feed URL (its OpenSearch description will be " +
        "discovered via the feed's rel=\"search\" link) or an OpenSearchDescription document URL directly, plus a " +
        "free-text query. Returns matching entries the same way opds_browse does.",
      inputSchema: {
        url: z
          .string()
          .optional()
          .describe(
            "URL of the OPDS feed (containing a rel=\"search\" link) or of an OpenSearchDescription document. " +
              "Optional if the server was started with a default catalog URL (OPDS_BASE_URL); required otherwise.",
          ),
        query: z.string().describe("Free-text search query, e.g. a book title or author name"),
        ...authArgs,
      },
    },
    async ({ url: urlArg, query, username, password }) => {
      try {
        const url = resolveUrl(urlArg);
        const auth = resolveAuth({ username, password });
        const initial = await fetchText(url, { auth });
        const isOpenSearchDoc = initial.body.includes("OpenSearchDescription");

        let descriptionXml = initial.body;
        let descriptionUrl = initial.url;
        if (!isOpenSearchDoc) {
          const { feed, finalUrl } = await fetchFeed(url, auth);
          const searchLink = feed.links.find((l) => l.rel === "search");
          if (!searchLink) {
            return errorResult(new Error(`Feed at ${finalUrl} does not advertise a rel="search" link`));
          }
          const searchDoc = await fetchText(searchLink.href, { auth });
          descriptionXml = searchDoc.body;
          descriptionUrl = searchDoc.url;
        }

        const templates = parseOpenSearchDescription(descriptionXml);
        const best = pickBestTemplate(templates);
        if (!best) {
          return errorResult(new Error(`No usable search URL template found in OpenSearchDescription at ${descriptionUrl}`));
        }
        const searchUrl = buildSearchUrl(best.template, query, descriptionUrl);
        const { feed, finalUrl } = await fetchFeed(searchUrl, auth);
        return textResult({ sourceUrl: finalUrl, query, ...summarizeFeed(feed) });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "opds_get_entry",
    {
      title: "Get a single OPDS entry/publication",
      description:
        "Fetches a single OPDS entry document (a per-publication Atom entry or OPDS 2.0 publication), typically the " +
        "URL found in an entry's rel=\"alternate\" link, and returns its full details including acquisition links.",
      inputSchema: {
        url: z
          .string()
          .optional()
          .describe(
            "Absolute URL of the entry/publication document to fetch. Optional if the server was started with a " +
              "default catalog URL (OPDS_BASE_URL); required otherwise.",
          ),
        ...authArgs,
      },
    },
    async ({ url, username, password }) => {
      try {
        const { feed, finalUrl } = await fetchFeed(resolveUrl(url), resolveAuth({ username, password }));
        if (feed.entries.length === 0) {
          return errorResult(new Error(`No entry found at ${finalUrl}`));
        }
        return textResult({ sourceUrl: finalUrl, ...summarizeEntry(feed.entries[0]!) });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "opds_download",
    {
      title: "Download a publication from an OPDS acquisition link",
      description:
        "Downloads the file behind an OPDS acquisition link (as returned in the `acquisitions` array of " +
        "opds_browse/opds_search/opds_get_entry) to a local directory and returns the saved file path. Defaults to a " +
        `directory under the OS temp folder (${downloadDir}); configure OPDS_DOWNLOAD_DIR to persist elsewhere.`,
      inputSchema: {
        url: z.string().describe("Absolute URL of the acquisition (download) link"),
        suggestedName: z.string().optional().describe("Preferred base file name (without extension), e.g. the book title"),
        ...authArgs,
      },
    },
    async ({ url, suggestedName, username, password }) => {
      try {
        const result = await downloadAcquisition(url, downloadDir, {
          auth: resolveAuth({ username, password }),
          suggestedName,
        });
        return textResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  return server;
}
