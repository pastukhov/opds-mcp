import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildSearchUrl, parseOpenSearchDescription, pickBestTemplate } from "../opensearch.js";

const fixturesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../fixtures");
const read = (name: string) => readFileSync(path.join(fixturesDir, name), "utf-8");

describe("OpenSearch", () => {
  it("parses URL templates from an OpenSearchDescription document", () => {
    const templates = parseOpenSearchDescription(read("opensearch.xml"));
    expect(templates).toHaveLength(2);
    expect(templates[0]!.type).toBe("application/atom+xml;profile=opds-catalog");
  });

  it("prefers the OPDS-typed template over a generic HTML one", () => {
    const templates = parseOpenSearchDescription(read("opensearch.xml"));
    const best = pickBestTemplate(templates);
    expect(best?.type).toBe("application/atom+xml;profile=opds-catalog");
  });

  it("builds a search URL substituting searchTerms and dropping unused optional params", () => {
    const templates = parseOpenSearchDescription(read("opensearch.xml"));
    const best = pickBestTemplate(templates)!;
    const url = buildSearchUrl(best.template, "moby dick", "https://example.com/opds/opensearch.xml");
    expect(url).toBe("https://example.com/opds/search?q=moby%20dick");
  });

  it("throws on a document that is not an OpenSearchDescription", () => {
    expect(() => parseOpenSearchDescription("<foo/>")).toThrow(/OpenSearchDescription/);
  });
});
