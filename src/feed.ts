import { fetchText } from "./http-client.js";
import { parseAtomFeed } from "./parsers/atom.js";
import { parseOpds2Feed } from "./parsers/opds2.js";
import type { AuthOptions, OpdsFeed } from "./types.js";

function resolveFeedLinks(feed: OpdsFeed, baseUrl: string): OpdsFeed {
  const resolve = (href: string): string => {
    try {
      return new URL(href, baseUrl).toString();
    } catch {
      return href;
    }
  };
  return {
    ...feed,
    links: feed.links.map((l) => ({ ...l, href: resolve(l.href) })),
    entries: feed.entries.map((e) => ({
      ...e,
      links: e.links.map((l) => ({ ...l, href: resolve(l.href) })),
    })),
  };
}

function looksLikeJson(contentType: string, body: string): boolean {
  if (contentType.includes("json")) return true;
  if (contentType.includes("xml")) return false;
  return body.trimStart().startsWith("{");
}

export interface FetchedFeed {
  feed: OpdsFeed;
  finalUrl: string;
  contentType: string;
}

/** Fetches an OPDS catalog document (1.x Atom/XML or 2.0 JSON) and normalizes it. */
export async function fetchFeed(url: string, auth?: AuthOptions): Promise<FetchedFeed> {
  const res = await fetchText(url, {
    auth,
    accept: "application/atom+xml,application/opds+json,application/json,text/xml,application/xml;q=0.9,*/*;q=0.8",
  });
  const isJson = looksLikeJson(res.contentType, res.body);
  const parsed = isJson ? parseOpds2Feed(res.body) : parseAtomFeed(res.body);
  return {
    feed: resolveFeedLinks(parsed, res.url),
    finalUrl: res.url,
    contentType: res.contentType,
  };
}
