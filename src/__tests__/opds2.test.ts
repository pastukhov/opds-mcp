import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseOpds2Feed } from "../parsers/opds2.js";

const fixturesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../fixtures");
const read = (name: string) => readFileSync(path.join(fixturesDir, name), "utf-8");

describe("parseOpds2Feed", () => {
  it("parses feed metadata, navigation and top-level links", () => {
    const feed = parseOpds2Feed(read("opds2-feed.json"));
    expect(feed.title).toBe("Example OPDS 2.0 Catalog");

    const rels = feed.links.map((l) => l.rel);
    expect(rels).toContain("self");
    expect(rels).toContain("search");
    expect(rels).toContain("subsection");
  });

  it("parses publications into normalized entries", () => {
    const feed = parseOpds2Feed(read("opds2-feed.json"));
    expect(feed.entries).toHaveLength(1);

    const entry = feed.entries[0]!;
    expect(entry.id).toBe("urn:isbn:9780000000001");
    expect(entry.title).toBe("Frankenstein");
    expect(entry.authors).toEqual([{ name: "Mary Shelley", uri: undefined }]);
    expect(entry.language).toBe("en");
    expect(entry.publisher).toBe("Lackington, Hughes, Harding, Mavor & Jones");

    const acquisition = entry.links.find((l) => l.rel.includes("acquisition"));
    expect(acquisition).toMatchObject({ href: "/download/frankenstein.epub", type: "application/epub+zip" });

    const image = entry.links.find((l) => l.rel === "http://opds-spec.org/image");
    expect(image?.href).toBe("/covers/frankenstein.jpg");
  });

  it("parses a solo publication document (not wrapped in a feed)", () => {
    const feed = parseOpds2Feed(read("opds2-publication.json"));
    expect(feed.entries).toHaveLength(1);
    expect(feed.entries[0]!.title).toBe("Frankenstein");
    expect(feed.entries[0]!.authors).toEqual([{ name: "Mary Shelley", uri: undefined }]);
  });
});
