import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

// Markdown docs shipped inside the explorer bundle — the same canonical
// source the explorer serves. One helper for every doc-rendering page.
const FILES_ROOT = fileURLToPath(
  new URL("../../public/explorer/bundles/xeto/files/", import.meta.url)
);

/** Page names (sans .md) in a bundle lib's files dir, excluding index. */
export function docPages(lib: string): string[] {
  return readdirSync(`${FILES_ROOT}${lib}/`)
    .filter((f) => f.endsWith(".md") && f !== "index.md")
    .map((f) => f.replace(/\.md$/, ""));
}

/** Render a bundle markdown file to HTML with .md links rewritten to base. */
export function renderDoc(lib: string, page: string, linkBase: string) {
  const md = readFileSync(`${FILES_ROOT}${lib}/${page}.md`, "utf-8");
  const rewritten = md.replace(
    /\]\((?!https?:|\/|#)([^)#]+)\.md(#[^)]*)?\)/g,
    `](${linkBase}$1$2)`
  );
  const html = marked.parse(rewritten) as string;
  const title = md.match(/^#\s+(.+)$/m)?.[1] ?? page;
  return { html, title };
}

/** Ordered nav entries parsed from a lib's index.md link list. */
export function docNav(lib: string): { page: string; label: string }[] {
  const md = readFileSync(`${FILES_ROOT}${lib}/index.md`, "utf-8");
  return [...md.matchAll(/\[([^\]]+)\]\(([^)#]+)\.md\)/g)].map((m) => ({
    label: m[1]!,
    page: m[2]!,
  }));
}
