import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFeed } from "../feed.js";
import * as httpClient from "../http-client.js";

const fixturesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../fixtures");
const read = (name: string) => readFileSync(path.join(fixturesDir, name), "utf-8");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchFeed", () => {
  it("parses an Atom (OPDS 1.x) response based on its content-type", async () => {
    vi.spyOn(httpClient, "fetchText").mockResolvedValue({
      url: "https://example.com/opds/root.xml",
      status: 200,
      contentType: "application/atom+xml;profile=opds-catalog",
      body: read("opds1-feed.xml"),
    });

    const { feed, contentType } = await fetchFeed("https://example.com/opds/root.xml");
    expect(contentType).toContain("atom+xml");
    expect(feed.entries).toHaveLength(2);
  });

  it("parses a JSON (OPDS 2.0) response based on its content-type", async () => {
    vi.spyOn(httpClient, "fetchText").mockResolvedValue({
      url: "https://example.com/opds2/root.json",
      status: 200,
      contentType: "application/opds+json",
      body: read("opds2-feed.json"),
    });

    const { feed } = await fetchFeed("https://example.com/opds2/root.json");
    expect(feed.entries).toHaveLength(1);
    expect(feed.entries[0]!.title).toBe("Frankenstein");
  });

  it("falls back to sniffing the body when content-type is missing", async () => {
    vi.spyOn(httpClient, "fetchText").mockResolvedValue({
      url: "https://example.com/opds2/root.json",
      status: 200,
      contentType: "",
      body: read("opds2-feed.json"),
    });

    const { feed } = await fetchFeed("https://example.com/opds2/root.json");
    expect(feed.entries).toHaveLength(1);
  });

  it("resolves relative links against the final response URL", async () => {
    vi.spyOn(httpClient, "fetchText").mockResolvedValue({
      url: "https://example.com/opds/root.xml",
      status: 200,
      contentType: "application/atom+xml",
      body: read("opds1-feed.xml"),
    });

    const { feed } = await fetchFeed("https://example.com/opds/root.xml");
    const selfLink = feed.links.find((l) => l.rel === "self");
    expect(selfLink?.href).toBe("https://example.com/opds/root.xml");

    const acquisition = feed.entries[0]!.links.find((l) => l.rel.includes("acquisition"));
    expect(acquisition?.href).toBe("https://example.com/download/book-1.epub");
  });
});
