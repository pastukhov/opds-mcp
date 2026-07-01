import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  isArray: (tagName) => tagName === "Url",
});

export interface OpenSearchUrlTemplate {
  type?: string;
  template: string;
}

/** Parses an OpenSearch description document and returns its search URL templates. */
export function parseOpenSearchDescription(xml: string): OpenSearchUrlTemplate[] {
  const doc = parser.parse(xml);
  const root = doc["OpenSearchDescription"];
  if (!root) {
    throw new Error("Document does not look like an OpenSearchDescription: missing root element");
  }
  const urls: Record<string, unknown>[] = Array.isArray(root["Url"]) ? root["Url"] : root["Url"] ? [root["Url"]] : [];
  return urls
    .map((u) => ({ type: u["@_type"] ? String(u["@_type"]) : undefined, template: String(u["@_template"] ?? "") }))
    .filter((u) => u.template.includes("searchTerms"));
}

/** Picks the URL template best suited for OPDS clients (Atom/OPDS+JSON over generic HTML search). */
export function pickBestTemplate(templates: OpenSearchUrlTemplate[]): OpenSearchUrlTemplate | undefined {
  const byPreference = [
    (t: OpenSearchUrlTemplate) => t.type?.includes("opds-catalog"),
    (t: OpenSearchUrlTemplate) => t.type?.includes("opds+json"),
    (t: OpenSearchUrlTemplate) => t.type?.includes("atom"),
    (t: OpenSearchUrlTemplate) => t.type?.includes("xml") || t.type?.includes("json"),
  ];
  for (const test of byPreference) {
    const match = templates.find(test);
    if (match) return match;
  }
  return templates[0];
}

/** Substitutes OpenSearch template parameters, filling {searchTerms} and dropping unused optional ones. */
export function buildSearchUrl(template: string, query: string, baseUrl: string): string {
  let filled = template.replace(/\{searchTerms\??\}/g, encodeURIComponent(query));
  // Drop any remaining optional template params, e.g. {startPage?}, {count?}
  filled = filled.replace(/[?&][^=?&]+=\{[^}]+\?\}/g, "");
  filled = filled.replace(/\{[^}]+\?\}/g, "");
  return new URL(filled, baseUrl).toString();
}
