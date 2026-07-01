import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadAcquisition } from "../download.js";
import * as httpClient from "../http-client.js";

describe("downloadAcquisition", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "opds-mcp-test-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it("saves the file with a sanitized name and the right extension for the content-type", async () => {
    vi.spyOn(httpClient, "fetchBinary").mockResolvedValue({
      url: "https://example.com/download/book-1",
      status: 200,
      contentType: "application/epub+zip",
      buffer: Buffer.from("fake epub bytes"),
    });

    const result = await downloadAcquisition("https://example.com/download/book-1", dir, {
      suggestedName: "Möby: Dick! / A Whale?",
    });

    expect(result.fileName).toBe("Moby_Dick_A_Whale.epub");
    expect(path.dirname(result.filePath)).toBe(path.resolve(dir));
    const contents = await readFile(result.filePath, "utf-8");
    expect(contents).toBe("fake epub bytes");
  });

  it("falls back to the URL path segment when no suggested name is given", async () => {
    vi.spyOn(httpClient, "fetchBinary").mockResolvedValue({
      url: "https://example.com/files/frankenstein.epub",
      status: 200,
      contentType: "application/epub+zip",
      buffer: Buffer.from("x"),
    });

    const result = await downloadAcquisition("https://example.com/files/frankenstein.epub", dir);
    expect(result.fileName).toBe("frankenstein.epub");
  });
});
