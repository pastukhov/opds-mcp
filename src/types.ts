export interface OpdsLink {
  rel: string;
  href: string;
  type?: string;
  title?: string;
  /** Present on acquisition links that advertise file size, e.g. dcterms:extent or thr:count */
  length?: string;
  bitrate?: string;
}

export interface OpdsAuthor {
  name: string;
  uri?: string;
}

export interface OpdsEntry {
  id: string;
  title: string;
  updated?: string;
  published?: string;
  summary?: string;
  content?: string;
  authors: OpdsAuthor[];
  categories: string[];
  language?: string;
  publisher?: string;
  /** All links on the entry, including acquisition and image links */
  links: OpdsLink[];
}

export interface OpdsFeed {
  id?: string;
  title?: string;
  updated?: string;
  /** Feed-level links: navigation, search, pagination, facets, self */
  links: OpdsLink[];
  entries: OpdsEntry[];
}

export const ACQUISITION_RELS = [
  "http://opds-spec.org/acquisition",
  "http://opds-spec.org/acquisition/open-access",
  "http://opds-spec.org/acquisition/borrow",
  "http://opds-spec.org/acquisition/buy",
  "http://opds-spec.org/acquisition/sample",
  "http://opds-spec.org/acquisition/subscribe",
] as const;

export function isAcquisitionLink(link: OpdsLink): boolean {
  return link.rel === "acquisition" || link.rel.startsWith("http://opds-spec.org/acquisition");
}

export function isImageLink(link: OpdsLink): boolean {
  return (
    link.rel.includes("opds-spec.org/image") ||
    link.rel === "cover" ||
    link.rel === "thumbnail" ||
    link.rel.includes("cover-image")
  );
}

export interface AuthOptions {
  username?: string;
  password?: string;
}
