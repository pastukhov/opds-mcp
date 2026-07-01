import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBinary, fetchText, OpdsHttpError } from "../http-client.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchText", () => {
  it("rejects non-http(s) protocols", async () => {
    await expect(fetchText("file:///etc/passwd")).rejects.toThrow(OpdsHttpError);
    await expect(fetchText("ftp://example.com/feed.xml")).rejects.toThrow(/Unsupported protocol/);
  });

  it("rejects malformed URLs", async () => {
    await expect(fetchText("not a url")).rejects.toThrow(OpdsHttpError);
  });

  it("returns the body, resolved URL and content-type on success", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("<feed></feed>", {
          status: 200,
          headers: { "content-type": "application/atom+xml" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchText("https://example.com/opds");
    expect(res.body).toBe("<feed></feed>");
    expect(res.status).toBe(200);
    expect(res.contentType).toBe("application/atom+xml");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends a Basic Authorization header when auth is provided", async () => {
    let seenAuth: string | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        seenAuth = (init?.headers as Headers).get("Authorization");
        return new Response("ok", { status: 200 });
      }),
    );

    await fetchText("https://example.com/opds", { auth: { username: "alice", password: "secret" } });
    expect(seenAuth).toBe(`Basic ${Buffer.from("alice:secret").toString("base64")}`);
  });

  it("throws OpdsHttpError with the status on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404, statusText: "Not Found" })));
    await expect(fetchText("https://example.com/missing")).rejects.toMatchObject({ status: 404 });
  });
});

describe("fetchBinary", () => {
  it("returns the response as a buffer with content metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(new Uint8Array([1, 2, 3, 4]), {
            status: 200,
            headers: { "content-type": "application/epub+zip", "content-length": "4" },
          }),
      ),
    );

    const res = await fetchBinary("https://example.com/book.epub");
    expect(res.buffer).toEqual(Buffer.from([1, 2, 3, 4]));
    expect(res.contentType).toBe("application/epub+zip");
    expect(res.contentLength).toBe(4);
  });

  it("rejects a response whose declared content-length exceeds maxBytes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(new Uint8Array(10), {
            status: 200,
            headers: { "content-length": "10" },
          }),
      ),
    );

    await expect(fetchBinary("https://example.com/huge.epub", { maxBytes: 5 })).rejects.toThrow(/exceeding the 5 byte limit/);
  });
});
