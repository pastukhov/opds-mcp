import { describe, expect, it } from "vitest";
import { fetchText, OpdsHttpError } from "../http-client.js";

describe("fetchText", () => {
  it("rejects non-http(s) protocols", async () => {
    await expect(fetchText("file:///etc/passwd")).rejects.toThrow(OpdsHttpError);
    await expect(fetchText("ftp://example.com/feed.xml")).rejects.toThrow(/Unsupported protocol/);
  });

  it("rejects malformed URLs", async () => {
    await expect(fetchText("not a url")).rejects.toThrow(OpdsHttpError);
  });
});
