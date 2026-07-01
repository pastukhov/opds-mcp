import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseAtomFeed } from "../parsers/atom.js";

const fixturesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../fixtures");
const read = (name: string) => readFileSync(path.join(fixturesDir, name), "utf-8");

describe("parseAtomFeed", () => {
  it("parses feed-level metadata and links", () => {
    const feed = parseAtomFeed(read("opds1-feed.xml"));
    expect(feed.title).toBe("Example OPDS Catalog");
    expect(feed.id).toBe("urn:uuid:example-root-catalog");

    const rels = feed.links.map((l) => l.rel);
    expect(rels).toContain("self");
    expect(rels).toContain("search");
    expect(rels).toContain("next");
  });

  it("parses entries with authors, categories and acquisition/image links", () => {
    const feed = parseAtomFeed(read("opds1-feed.xml"));
    expect(feed.entries).toHaveLength(2);

    const mobyDick = feed.entries[0]!;
    expect(mobyDick.title).toBe("Moby-Dick");
    expect(mobyDick.authors).toEqual([{ name: "Herman Melville", uri: "https://example.com/authors/melville" }]);
    expect(mobyDick.categories).toEqual(["Fiction", "Classic Literature"]);
    expect(mobyDick.language).toBe("en");
    expect(mobyDick.publisher).toBe("Harper & Brothers");

    const acquisition = mobyDick.links.find((l) => l.rel === "http://opds-spec.org/acquisition/open-access");
    expect(acquisition).toMatchObject({ href: "/download/book-1.epub", type: "application/epub+zip", length: "512000" });

    const image = mobyDick.links.find((l) => l.rel === "http://opds-spec.org/image");
    expect(image?.href).toBe("/covers/book-1.jpg");
  });

  it("handles a single <entry> document (per-publication acquisition feed)", () => {
    const feed = parseAtomFeed(read("opds1-entry.xml"));
    expect(feed.entries).toHaveLength(1);
    expect(feed.entries[0]!.title).toBe("Moby-Dick");
    expect(feed.entries[0]!.links.some((l) => l.rel.includes("acquisition"))).toBe(true);
  });

  it("throws a clear error for non-feed XML", () => {
    expect(() => parseAtomFeed("<html><body>not a feed</body></html>")).toThrow(/does not look like an Atom\/OPDS feed/);
  });
});
