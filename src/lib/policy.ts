// Loads the authoritative policy (data/policy.md) and returns relevant sections.
// Server-only (uses fs). data/policy.md is traced into the Vercel bundle via
// outputFileTracingIncludes in next.config.ts.

import fs from "node:fs";
import path from "node:path";

let cache: string | null = null;

function loadPolicy(): string {
  if (cache) return cache;
  cache = fs.readFileSync(path.join(process.cwd(), "data", "policy.md"), "utf8");
  return cache;
}

interface PolicySection {
  heading: string;
  body: string;
}

function sections(): PolicySection[] {
  const md = loadPolicy();
  return md
    .split(/\n(?=## )/g)
    .map((part) => {
      const m = part.match(/^##\s+(.*)/m);
      return { heading: m ? m[1].trim() : "Overview", body: part.trim() };
    });
}

/**
 * Returns the full policy when no topic is given, otherwise the section(s)
 * whose heading or body mention the topic. Falls back to the full document.
 */
export function getPolicy(topic?: string): string {
  const full = loadPolicy();
  if (!topic || !topic.trim()) return full;
  const t = topic.toLowerCase();
  const matched = sections().filter(
    (s) => s.heading.toLowerCase().includes(t) || s.body.toLowerCase().includes(t),
  );
  return matched.length > 0 ? matched.map((s) => s.body).join("\n\n") : full;
}
