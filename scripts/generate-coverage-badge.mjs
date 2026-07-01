#!/usr/bin/env node
// Reads coverage/coverage-summary.json (produced by `npm run test:coverage`) and writes a
// shields.io "endpoint" badge definition to .github/badges/coverage.json, so README.md can embed
// a live coverage badge via https://img.shields.io/endpoint without any third-party coverage
// service or committed image.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const summaryPath = path.join(repoRoot, "coverage", "coverage-summary.json");
const badgePath = path.join(repoRoot, ".github", "badges", "coverage.json");

function colorFor(pct) {
  if (pct >= 90) return "brightgreen";
  if (pct >= 80) return "green";
  if (pct >= 70) return "yellowgreen";
  if (pct >= 60) return "yellow";
  if (pct >= 50) return "orange";
  return "red";
}

const summary = JSON.parse(await readFile(summaryPath, "utf-8"));
const pct = summary.total.lines.pct;

const badge = {
  schemaVersion: 1,
  label: "coverage",
  message: `${pct}%`,
  color: colorFor(pct),
};

await mkdir(path.dirname(badgePath), { recursive: true });
await writeFile(badgePath, `${JSON.stringify(badge, null, 2)}\n`);
console.log(`Wrote ${badgePath}:`, badge);
