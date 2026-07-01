import { isAcquisitionLink, isImageLink, type OpdsEntry, type OpdsFeed, type OpdsLink } from "./types.js";

export interface FormattedLink {
  rel: string;
  href: string;
  type?: string;
  title?: string;
  length?: string;
}

function toFormattedLink(link: OpdsLink): FormattedLink {
  return { rel: link.rel, href: link.href, type: link.type, title: link.title, length: link.length };
}

export interface FormattedEntry {
  id: string;
  title: string;
  authors: string[];
  summary?: string;
  updated?: string;
  published?: string;
  language?: string;
  publisher?: string;
  categories: string[];
  acquisitions: FormattedLink[];
  images: FormattedLink[];
  entryUrl?: string;
}

export function summarizeEntry(entry: OpdsEntry): FormattedEntry {
  const acquisitions = entry.links.filter(isAcquisitionLink).map(toFormattedLink);
  const images = entry.links.filter(isImageLink).map(toFormattedLink);
  const alternate = entry.links.find((l) => l.rel === "alternate")?.href;

  return {
    id: entry.id,
    title: entry.title,
    authors: entry.authors.map((a) => a.name),
    summary: entry.summary,
    updated: entry.updated,
    published: entry.published,
    language: entry.language,
    publisher: entry.publisher,
    categories: entry.categories,
    acquisitions,
    images,
    entryUrl: alternate,
  };
}

export interface FormattedNavigation {
  self?: string;
  search?: string;
  next?: string;
  previous?: string;
  first?: string;
  last?: string;
  start?: string;
  up?: string;
  subsections: FormattedLink[];
  facets: FormattedLink[];
  other: FormattedLink[];
}

type SingleLinkKey = "self" | "search" | "next" | "previous" | "first" | "last" | "start" | "up";

const SINGLE_RELS: Record<string, SingleLinkKey> = {
  self: "self",
  search: "search",
  next: "next",
  previous: "previous",
  prev: "previous",
  first: "first",
  last: "last",
  start: "start",
  up: "up",
};

function categorizeLinks(links: OpdsLink[]): FormattedNavigation {
  const nav: FormattedNavigation = { subsections: [], facets: [], other: [] };
  for (const link of links) {
    const key = SINGLE_RELS[link.rel];
    if (key) {
      nav[key] = link.href;
      continue;
    }
    if (link.rel.includes("opds-spec.org/facet")) {
      nav.facets.push(toFormattedLink(link));
    } else if (link.rel === "subsection" || link.type?.includes("opds-catalog") || link.type?.includes("opds+json")) {
      nav.subsections.push(toFormattedLink(link));
    } else {
      nav.other.push(toFormattedLink(link));
    }
  }
  return nav;
}

export interface FormattedFeed {
  title?: string;
  id?: string;
  updated?: string;
  navigation: FormattedNavigation;
  entries: FormattedEntry[];
}

export function summarizeFeed(feed: OpdsFeed): FormattedFeed {
  return {
    title: feed.title,
    id: feed.id,
    updated: feed.updated,
    navigation: categorizeLinks(feed.links),
    entries: feed.entries.map(summarizeEntry),
  };
}
