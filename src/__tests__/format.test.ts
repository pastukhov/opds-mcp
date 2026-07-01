import { describe, expect, it } from "vitest";
import { summarizeFeed } from "../format.js";
import type { OpdsFeed } from "../types.js";

const feed: OpdsFeed = {
  title: "Test Feed",
  links: [
    { rel: "self", href: "https://example.com/feed" },
    { rel: "next", href: "https://example.com/feed?page=2" },
    { rel: "http://opds-spec.org/facet", href: "https://example.com/facet/fiction", title: "Fiction" },
    { rel: "subsection", href: "https://example.com/sub" },
  ],
  entries: [
    {
      id: "book-1",
      title: "Book One",
      authors: [{ name: "Author One" }],
      categories: ["Fiction"],
      links: [
        { rel: "http://opds-spec.org/acquisition", href: "https://example.com/book-1.epub", type: "application/epub+zip" },
        { rel: "http://opds-spec.org/image", href: "https://example.com/book-1.jpg", type: "image/jpeg" },
        { rel: "alternate", href: "https://example.com/entry/book-1" },
      ],
    },
  ],
};

describe("summarizeFeed", () => {
  it("buckets navigation links by relation", () => {
    const summary = summarizeFeed(feed);
    expect(summary.navigation.self).toBe("https://example.com/feed");
    expect(summary.navigation.next).toBe("https://example.com/feed?page=2");
    expect(summary.navigation.facets).toHaveLength(1);
    expect(summary.navigation.subsections).toHaveLength(1);
  });

  it("splits entry links into acquisitions and images", () => {
    const summary = summarizeFeed(feed);
    const entry = summary.entries[0]!;
    expect(entry.acquisitions).toHaveLength(1);
    expect(entry.acquisitions[0]!.href).toBe("https://example.com/book-1.epub");
    expect(entry.images).toHaveLength(1);
    expect(entry.entryUrl).toBe("https://example.com/entry/book-1");
    expect(entry.authors).toEqual(["Author One"]);
  });
});
