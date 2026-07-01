import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "../server.js";

const fixturesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../fixtures");
const read = (name: string) => readFileSync(path.join(fixturesDir, name), "utf-8");

function textOf(result: CallToolResult): string {
  const block = result.content[0];
  if (!block || block.type !== "text") throw new Error("Expected a text content block");
  return block.text;
}

function xmlResponse(body: string, contentType = "application/atom+xml") {
  return new Response(body, { status: 200, headers: { "content-type": contentType } });
}

async function connectedClient(options: Parameters<typeof createServer>[0] = {}) {
  const server = createServer(options);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

describe("opds-mcp server (end-to-end over MCP)", () => {
  let downloadDir: string;
  let client: Client;

  beforeEach(async () => {
    downloadDir = mkdtempSync(path.join(os.tmpdir(), "opds-mcp-server-test-"));
    client = await connectedClient({ downloadDir });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists all four tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["opds_browse", "opds_download", "opds_get_entry", "opds_search"]);
  });

  it("opds_browse fetches and summarizes a catalog feed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => xmlResponse(read("opds1-feed.xml"))));

    const result = (await client.callTool({
      name: "opds_browse",
      arguments: { url: "https://example.com/opds/root.xml" },
    })) as CallToolResult;
    const data = JSON.parse(textOf(result));
    expect(data.title).toBe("Example OPDS Catalog");
    expect(data.entries).toHaveLength(2);
    expect(data.entries[0].acquisitions[0].href).toBe("https://example.com/download/book-1.epub");
  });

  it("opds_browse reports a friendly error for a failing request", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500, statusText: "Internal Server Error" })));

    const result = (await client.callTool({
      name: "opds_browse",
      arguments: { url: "https://example.com/opds/root.xml" },
    })) as CallToolResult;
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/500/);
  });

  it("opds_search discovers the OpenSearch link and fetches matching entries", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = input.toString();
      if (url.includes("opensearch")) return xmlResponse(read("opensearch.xml"), "application/opensearchdescription+xml");
      return xmlResponse(read("opds1-feed.xml"));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = (await client.callTool({
      name: "opds_search",
      arguments: { url: "https://example.com/opds/root.xml", query: "moby dick" },
    })) as CallToolResult;
    const data = JSON.parse(textOf(result));
    expect(data.entries.length).toBeGreaterThan(0);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/opds/search"))).toBe(true);
  });

  it("opds_get_entry returns a single publication's details", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => xmlResponse(read("opds1-entry.xml"))));

    const result = (await client.callTool({
      name: "opds_get_entry",
      arguments: { url: "https://example.com/opds/entry/book-1.xml" },
    })) as CallToolResult;
    const data = JSON.parse(textOf(result));
    expect(data.title).toBe("Moby-Dick");
    expect(data.acquisitions).toHaveLength(1);
  });

  it("opds_download saves the acquisition link under the configured download directory", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "application/epub+zip" } })),
    );

    const result = (await client.callTool({
      name: "opds_download",
      arguments: { url: "https://example.com/download/book-1.epub", suggestedName: "Moby Dick" },
    })) as CallToolResult;
    const data = JSON.parse(textOf(result));
    expect(data.fileName).toBe("Moby_Dick.epub");
    expect(path.dirname(data.filePath)).toBe(path.resolve(downloadDir));
  });

  it("falls back to the server's default auth when a call omits credentials", async () => {
    const authedClient = await connectedClient({ downloadDir, defaultAuth: { username: "envuser", password: "envpass" } });
    let seenAuth: string | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        seenAuth = (init?.headers as Headers).get("Authorization");
        return xmlResponse(read("opds1-feed.xml"));
      }),
    );

    await authedClient.callTool({ name: "opds_browse", arguments: { url: "https://example.com/opds/root.xml" } });
    expect(seenAuth).toBe(`Basic ${Buffer.from("envuser:envpass").toString("base64")}`);
  });

  it("prefers per-call credentials over the server's default auth", async () => {
    const authedClient = await connectedClient({ downloadDir, defaultAuth: { username: "envuser", password: "envpass" } });
    let seenAuth: string | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        seenAuth = (init?.headers as Headers).get("Authorization");
        return xmlResponse(read("opds1-feed.xml"));
      }),
    );

    await authedClient.callTool({
      name: "opds_browse",
      arguments: { url: "https://example.com/opds/root.xml", username: "callUser", password: "callPass" },
    });
    expect(seenAuth).toBe(`Basic ${Buffer.from("callUser:callPass").toString("base64")}`);
  });

  it("falls back to the server's default catalog URL when a call omits url", async () => {
    const defaultUrlClient = await connectedClient({
      downloadDir,
      defaultUrl: "https://example.com/opds/root.xml",
    });
    const fetchMock = vi.fn(async () => xmlResponse(read("opds1-feed.xml")));
    vi.stubGlobal("fetch", fetchMock);

    const result = (await defaultUrlClient.callTool({ name: "opds_browse", arguments: {} })) as CallToolResult;
    const data = JSON.parse(textOf(result));
    expect(data.title).toBe("Example OPDS Catalog");
    expect(String(fetchMock.mock.calls[0]![0])).toBe("https://example.com/opds/root.xml");
  });

  it("prefers a per-call url over the server's default catalog URL", async () => {
    const defaultUrlClient = await connectedClient({
      downloadDir,
      defaultUrl: "https://example.com/opds/default.xml",
    });
    const fetchMock = vi.fn(async () => xmlResponse(read("opds1-feed.xml")));
    vi.stubGlobal("fetch", fetchMock);

    await defaultUrlClient.callTool({ name: "opds_browse", arguments: { url: "https://example.com/opds/other.xml" } });
    expect(String(fetchMock.mock.calls[0]![0])).toBe("https://example.com/opds/other.xml");
  });

  it("returns a clear error when url is omitted and no default catalog URL is configured", async () => {
    const result = (await client.callTool({ name: "opds_browse", arguments: {} })) as CallToolResult;
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/OPDS_BASE_URL/);
  });
});
