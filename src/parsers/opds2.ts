import type { OpdsAuthor, OpdsEntry, OpdsFeed, OpdsLink } from "../types.js";

interface Json2Link {
  rel?: string | string[];
  href: string;
  type?: string;
  title?: string;
  properties?: { numberOfItems?: number };
}

interface Json2Author {
  name?: string;
  links?: Json2Link[];
}

interface Json2PublicationMetadata {
  title?: string;
  identifier?: string;
  author?: Json2Author | Json2Author[] | string | string[];
  description?: string;
  language?: string | string[];
  publisher?: string | { name?: string };
  published?: string;
  modified?: string;
  subject?: unknown;
}

interface Json2Publication {
  metadata: Json2PublicationMetadata;
  links?: Json2Link[];
  images?: Json2Link[];
}

interface Json2Feed {
  metadata?: { title?: string; itemsPerPage?: number };
  links?: Json2Link[];
  publications?: Json2Publication[];
  navigation?: Json2Link[];
  facets?: { metadata?: { title?: string }; links?: Json2Link[] }[];
  groups?: { metadata?: { title?: string }; links?: Json2Link[]; publications?: Json2Publication[]; navigation?: Json2Link[] }[];
}

function firstRel(rel: string | string[] | undefined): string {
  if (!rel) return "alternate";
  return Array.isArray(rel) ? (rel[0] ?? "alternate") : rel;
}

function toLink(raw: Json2Link): OpdsLink {
  return {
    rel: firstRel(raw.rel),
    href: raw.href,
    type: raw.type,
    title: raw.title,
    length: raw.properties?.numberOfItems !== undefined ? String(raw.properties.numberOfItems) : undefined,
  };
}

function toAuthors(raw: Json2PublicationMetadata["author"]): OpdsAuthor[] {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map((a): OpdsAuthor => {
    if (typeof a === "string") return { name: a };
    return { name: a.name ?? "Unknown", uri: a.links?.[0]?.href };
  });
}

function toEntry(pub: Json2Publication): OpdsEntry {
  const meta = pub.metadata ?? {};
  const links = [...(pub.links ?? []).map(toLink), ...(pub.images ?? []).map((l) => ({ ...toLink(l), rel: l.rel ? firstRel(l.rel) : "http://opds-spec.org/image" }))];
  const language = Array.isArray(meta.language) ? meta.language[0] : meta.language;
  const publisher = typeof meta.publisher === "string" ? meta.publisher : meta.publisher?.name;

  return {
    id: meta.identifier ?? links.find((l) => l.rel === "self")?.href ?? meta.title ?? "",
    title: meta.title ?? "Untitled",
    updated: meta.modified,
    published: meta.published,
    summary: meta.description,
    authors: toAuthors(meta.author),
    categories: [],
    language,
    publisher,
    links,
  };
}

/** Parses an OPDS 2.0 catalog document (JSON) into the normalized feed shape. */
export function parseOpds2Feed(json: string): OpdsFeed {
  const doc = JSON.parse(json) as Json2Feed;

  // Some servers expose a single publication (not wrapped in a feed) as its own
  // document. Distinguish it from a feed by the presence of `metadata.identifier`,
  // which is specific to publication metadata and absent from feed metadata.
  const maybeSoloPublication = doc as unknown as Json2Publication;
  if (!doc.publications && !doc.navigation && !doc.groups && maybeSoloPublication.metadata?.identifier) {
    const entry = toEntry(maybeSoloPublication);
    return { title: entry.title, links: [], entries: [entry] };
  }

  const navLinks = (doc.navigation ?? []).map(toLink);
  const facetLinks = (doc.facets ?? []).flatMap((f) => (f.links ?? []).map(toLink));
  const topLinks = (doc.links ?? []).map(toLink);
  const groupLinks = (doc.groups ?? []).flatMap((g) => [...(g.links ?? []).map(toLink), ...(g.navigation ?? []).map(toLink)]);

  const publications = [...(doc.publications ?? []), ...(doc.groups ?? []).flatMap((g) => g.publications ?? [])];

  return {
    title: doc.metadata?.title,
    links: [...topLinks, ...navLinks, ...facetLinks, ...groupLinks],
    entries: publications.map(toEntry),
  };
}
