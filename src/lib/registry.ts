// Anonymous client-side reads against the xeto.dev registry API.
// Live data (search, versions, downloads) is always fetched from here
// so the static site never needs a rebuild when a lib is published.

export const REGISTRY_API =
  "https://aberopmtegsusdukrncd.supabase.co/functions/v1/api";

export interface RegistryLib {
  name: string;
  version: string;
  doc: string;
  downloads: number;
}

export interface RegistryVersion {
  version: string;
  doc: string;
  depends: { name: string; versions: string }[];
  downloads: number;
  published_at: string;
  publisher: string;
}

export interface RegistrySummary extends RegistryVersion {
  name: string;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${REGISTRY_API}${path}`);
  if (!res.ok) throw new Error(`registry ${path}: ${res.status}`);
  return res.json();
}

export function searchLibs(q = "", limit = 100): Promise<{ libs: RegistryLib[]; total: number }> {
  return get(`/search?q=${encodeURIComponent(q)}&limit=${limit}`);
}

export function libSummary(name: string): Promise<RegistrySummary> {
  return get(`/libs/${encodeURIComponent(name)}`);
}

export function libVersions(name: string): Promise<{ versions: RegistryVersion[] }> {
  return get(`/libs/${encodeURIComponent(name)}/versions`);
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}
