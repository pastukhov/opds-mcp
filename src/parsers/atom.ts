import { XMLParser } from "fast-xml-parser";
import type { OpdsAuthor, OpdsEntry, OpdsFeed, OpdsLink } from "../types.js";

const ARRAY_TAGS = new Set(["entry", "link", "author", "contributor", "category"]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  removeNSPrefix: true,
  trimValues: true,
  isArray: (tagName) => ARRAY_TAGS.has(tagName),
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(node: unknown): string | undefined {
  if (node === undefined || node === null) return undefined;
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (typeof node === "object" && "#text" in (node as Record<string, unknown>)) {
    return String((node as Record<string, unknown>)["#text"]);
  }
  return undefined;
}

function parseLink(raw: Record<string, unknown>): OpdsLink {
  return {
    rel: String(raw["@_rel"] ?? "alternate"),
    href: String(raw["@_href"] ?? ""),
    type: raw["@_type"] ? String(raw["@_type"]) : undefined,
    title: raw["@_title"] ? String(raw["@_title"]) : undefined,
    length: raw["@_length"] ? String(raw["@_length"]) : undefined,
    bitrate: raw["@_bitrate"] ? String(raw["@_bitrate"]) : undefined,
  };
}

function parseAuthor(raw: Record<string, unknown>): OpdsAuthor {
  return {
    name: textOf(raw["name"]) ?? "Unknown",
    uri: textOf(raw["uri"]),
  };
}

type RawNode = Record<string, unknown>;
type RawArray = RawNode | RawNode[] | undefined;

function parseEntry(raw: RawNode): OpdsEntry {
  const links = asArray<RawNode>(raw["link"] as RawArray).map(parseLink).filter((l) => l.href);
  const authors = asArray<RawNode>(raw["author"] as RawArray).map(parseAuthor);
  const categories = asArray<RawNode | string>(raw["category"] as RawNode | string | (RawNode | string)[] | undefined)
    .map((c) => (typeof c === "string" ? c : String(c["@_label"] ?? c["@_term"] ?? "")))
    .filter(Boolean);

  return {
    id: textOf(raw["id"]) ?? "",
    title: textOf(raw["title"]) ?? "Untitled",
    updated: textOf(raw["updated"]),
    published: textOf(raw["published"]),
    summary: textOf(raw["summary"]),
    content: textOf(raw["content"]),
    authors,
    categories,
    language: textOf(raw["language"]),
    publisher: textOf(raw["publisher"]),
    links,
  };
}

/** Parses an OPDS 1.x catalog document (Atom + XML) into the normalized feed shape. */
export function parseAtomFeed(xml: string): OpdsFeed {
  const doc = parser.parse(xml);
  const feed = doc["feed"] ?? doc["entry"];
  if (!feed) {
    throw new Error("Document does not look like an Atom/OPDS feed: missing <feed> root element");
  }

  // A document can itself be a single <entry> (per-publication acquisition document).
  // Note: `entry` is always parsed as an array (see ARRAY_TAGS), even at the document root.
  if (doc["entry"] && !doc["feed"]) {
    const [rootEntry] = asArray<RawNode>(doc["entry"] as RawArray);
    const entry = parseEntry(rootEntry ?? {});
    return {
      id: entry.id,
      title: entry.title,
      updated: entry.updated,
      links: [],
      entries: [entry],
    };
  }

  const links = asArray<Record<string, unknown>>(feed["link"]).map(parseLink).filter((l) => l.href);
  const entries = asArray<Record<string, unknown>>(feed["entry"]).map(parseEntry);

  return {
    id: textOf(feed["id"]),
    title: textOf(feed["title"]),
    updated: textOf(feed["updated"]),
    links,
    entries,
  };
}
