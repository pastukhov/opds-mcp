# opds-mcp

[![CI](https://github.com/pastukhov/opds-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/pastukhov/opds-mcp/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/pastukhov/opds-mcp/main/.github/badges/coverage.json)](https://github.com/pastukhov/opds-mcp/actions/workflows/coverage-badge.yml)

An [MCP](https://modelcontextprotocol.io) server that lets an LLM browse, search and download
books from [OPDS](https://ru.wikipedia.org/wiki/OPDS) catalogs (Open Publication Distribution
System) — the Atom/JSON-based feed format used by digital libraries such as Project Gutenberg,
Standard Ebooks, Feedbooks, and many self-hosted book servers (Calibre-Web, COPS, KOReader sync
targets, etc).

Supports both OPDS 1.x (Atom + XML) and OPDS 2.0 (JSON) catalogs, OpenSearch-based full-text
search, and downloading acquisition links to disk.

## Tools

- **`opds_browse`** — fetch a catalog/feed document and return its navigation links (search,
  next/prev, subsections, facets) plus entries (title, authors, summary, categories, acquisition
  links, cover images).
- **`opds_search`** — search a catalog. Give it either the catalog's feed URL (its
  `rel="search"` link is discovered automatically) or an OpenSearch description URL directly,
  plus a free-text query.
- **`opds_get_entry`** — fetch a single entry/publication document (e.g. an entry's
  `rel="alternate"` link) for full details.
- **`opds_download`** — download the file behind an acquisition link to a local directory and
  return the saved file path.

All tools accept optional `username`/`password` for catalogs that require HTTP Basic Auth. The
`url` argument of `opds_browse`/`opds_search`/`opds_get_entry` is optional if the server is
configured with a default catalog via `OPDS_BASE_URL` (see below) — pass `url` explicitly to
browse a different catalog for that one call.

## Install

```bash
npm install
npm run build
```

## Configure in an MCP client

### Via npx (no local checkout required)

The package hasn't been published to the npm registry, but `npx` can install and run it straight
from this GitHub repo — it clones the repo, runs `npm install` (which triggers the `prepare`
script to build `dist/`), then executes the `opds-mcp` bin:

```json
{
  "mcpServers": {
    "opds": {
      "command": "npx",
      "args": ["-y", "github:pastukhov/opds-mcp"],
      "env": {
        "OPDS_BASE_URL": "https://example.com/opds/root.xml",
        "OPDS_USERNAME": "optional-default-username",
        "OPDS_PASSWORD": "optional-default-password",
        "OPDS_DOWNLOAD_DIR": "/absolute/path/to/save/books"
      }
    }
  }
}
```

To pin a specific branch or commit, append it: `"github:pastukhov/opds-mcp#branch-or-sha"`.

### Via a local checkout

Example for Claude Desktop / Claude Code (`claude_desktop_config.json` or `.mcp.json`):

```json
{
  "mcpServers": {
    "opds": {
      "command": "npx",
      "args": ["-y", "/absolute/path/to/opds-mcp"],
      "env": {
        "OPDS_BASE_URL": "https://example.com/opds/root.xml",
        "OPDS_USERNAME": "optional-default-username",
        "OPDS_PASSWORD": "optional-default-password",
        "OPDS_DOWNLOAD_DIR": "/absolute/path/to/save/books"
      }
    }
  }
}
```

`npx -y /absolute/path` installs dependencies and builds on first run, same as the GitHub form
above. Alternatively, run `npm install && npm run build` yourself and point `command`/`args`
directly at `node` and `dist/index.js`.

- **`OPDS_BASE_URL`** — the catalog `opds_browse`/`opds_search`/`opds_get_entry` use when a tool
  call doesn't pass its own `url`. This is the recommended way to point the server at a specific
  library (e.g. `https://your-library.example/opds`) without relying on the model to know or
  guess the address; omit it to require an explicit `url` on every call instead.
- **`OPDS_USERNAME`/`OPDS_PASSWORD`** — used as a fallback whenever a tool call doesn't pass its
  own credentials, which is convenient when the server is dedicated to a single authenticated
  catalog.
- **`OPDS_DOWNLOAD_DIR`** — where `opds_download` saves files; defaults to a directory under the
  OS temp folder.

## Example flow

1. `opds_browse` with the catalog's root URL to see navigation links and/or a first page of
   entries.
2. `opds_search` with that same root URL and a query to find a specific book.
3. Pick an entry's `acquisitions[].href` from the result and pass it to `opds_download` to save
   the file locally (or use `opds_get_entry` first if you need more detail than the search
   result already includes).

## Development

```bash
npm run dev            # run the server directly with tsx
npm run typecheck      # tsc --noEmit
npm test               # vitest, using fixture OPDS documents under fixtures/
npm run test:coverage  # vitest with a coverage report under coverage/
npm run build          # compile to dist/
```

Every pull request runs `typecheck`, `build` and `test:coverage` via
[`.github/workflows/ci.yml`](.github/workflows/ci.yml). On every push to `main`,
[`.github/workflows/coverage-badge.yml`](.github/workflows/coverage-badge.yml) recomputes coverage
and commits `.github/badges/coverage.json`, which the badge at the top of this file reads via
[shields.io's endpoint badge](https://shields.io/badges/endpoint-badge).

## Notes

- Only `http:`/`https:` URLs are accepted; other schemes are rejected before any request is made.
- Downloaded files are capped at 200MB by default and written under a sanitized filename inside
  the configured download directory.
- Because feed documents can be arbitrarily large, `opds_browse`/`opds_search` return whatever a
  single page contains; use the `navigation.next` link from the response to page through the
  rest of the catalog.
