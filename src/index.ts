#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { downloadAcquisition } from "./download.js";
import { fetchFeed } from "./feed.js";
import { summarizeEntry, summarizeFeed } from "./format.js";
import { fetchText } from "./http-client.js";
import { buildSearchUrl, parseOpenSearchDescription, pickBestTemplate } from "./opensearch.js";
import type { AuthOptions } from "./types.js";

const DEFAULT_DOWNLOAD_DIR = process.env.OPDS_DOWNLOAD_DIR
  ? path.resolve(process.env.OPDS_DOWNLOAD_DIR)
  : path.join(os.tmpdir(), "opds-mcp-downloads");

const DEFAULT_AUTH: AuthOptions = {
  username: process.env.OPDS_USERNAME,
  password: process.env.OPDS_PASSWORD,
};

const authArgs = {
  username: z.string().optional().describe("HTTP Basic Auth username, if the catalog requires authentication"),
  password: z.string().optional().describe("HTTP Basic Auth password, if the catalog requires authentication"),
};

function resolveAuth(args: { username?: string; password?: string }): AuthOptions | undefined {
  const username = args.username ?? DEFAULT_AUTH.username;
  const password = args.password ?? DEFAULT_AUTH.password;
  return username ? { username, password } : undefined;
}

function textResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
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
      url: z.string().describe("Absolute URL of the OPDS catalog/feed document to fetch"),
      ...authArgs,
    },
  },
  async ({ url, username, password }) => {
    try {
      const { feed, finalUrl } = await fetchFeed(url, resolveAuth({ username, password }));
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
      url: z.string().describe("URL of the OPDS feed (containing a rel=\"search\" link) or of an OpenSearchDescription document"),
      query: z.string().describe("Free-text search query, e.g. a book title or author name"),
      ...authArgs,
    },
  },
  async ({ url, query, username, password }) => {
    try {
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
      url: z.string().describe("Absolute URL of the entry/publication document to fetch"),
      ...authArgs,
    },
  },
  async ({ url, username, password }) => {
    try {
      const { feed, finalUrl } = await fetchFeed(url, resolveAuth({ username, password }));
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
      `directory under the OS temp folder (${DEFAULT_DOWNLOAD_DIR}); configure OPDS_DOWNLOAD_DIR to persist elsewhere.`,
    inputSchema: {
      url: z.string().describe("Absolute URL of the acquisition (download) link"),
      suggestedName: z.string().optional().describe("Preferred base file name (without extension), e.g. the book title"),
      ...authArgs,
    },
  },
  async ({ url, suggestedName, username, password }) => {
    try {
      const result = await downloadAcquisition(url, DEFAULT_DOWNLOAD_DIR, {
        auth: resolveAuth({ username, password }),
        suggestedName,
      });
      return textResult(result);
    } catch (err) {
      return errorResult(err);
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error starting opds-mcp server:", err);
  process.exit(1);
});
