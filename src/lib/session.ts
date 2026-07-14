// Site-wide website session helpers — a Supabase Auth JWT captured from
// the magic-link redirect hash and stored in localStorage. Anonymous
// browsing/search/install never touches this; it exists only to answer
// "who am I and what's mine" (header indicator, ownership strips) and
// to back the /account mutations (tokens, claims, profile).
//
// Local dev without burning the magic-link email quota (2/hr): sign in
// once on the production site, copy `localStorage.xd_session` from
// devtools, paste the same value into localStorage on localhost. Same
// Supabase project, same JWT — works identically against the live API.

export const SUPABASE_URL = "https://aberopmtegsusdukrncd.supabase.co";
export const ANON_KEY = "sb_publishable__Ue0RZeCbmYKs76eigWXgg_B3FT1MMD";
export const API = `${SUPABASE_URL}/functions/v1/api`;

export interface Session {
  access_token: string;
  expires_at: number;
}

export interface Me {
  id: string;
  display_name: string;
  email: string | null;
  handle: string | null;
  orgs: string[];
}

// magic link returns tokens in the URL hash: #access_token=...&...
export function captureHash(): void {
  if (!location.hash.includes("access_token")) return;
  const p = new URLSearchParams(location.hash.slice(1));
  const at = p.get("access_token");
  if (at) {
    localStorage.setItem(
      "xd_session",
      JSON.stringify({ access_token: at, expires_at: Number(p.get("expires_at") ?? 0) }),
    );
    history.replaceState(null, "", location.pathname);
  }
}

export function session(): Session | null {
  const raw = localStorage.getItem("xd_session");
  if (!raw) return null;
  const s = JSON.parse(raw) as Session;
  if (s.expires_at && s.expires_at * 1000 < Date.now()) {
    localStorage.removeItem("xd_session");
    return null;
  }
  return s;
}

export function signOut(): void {
  localStorage.removeItem("xd_session");
}

export async function sendMagicLink(email: string): Promise<void> {
  const redirect = encodeURIComponent(location.origin + "/account");
  const res = await fetch(SUPABASE_URL + "/auth/v1/otp?redirect_to=" + redirect, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, create_user: true }),
  });
  if (!res.ok) throw new Error("Could not send link: " + (await res.json()).msg);
}

// authed fetch against the account API; signs out and throws on 401
export async function api(path: string, opts: RequestInit = {}): Promise<any> {
  const s = session();
  if (!s) throw new Error("not signed in");
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      Authorization: "Bearer " + s.access_token,
      "Content-Type": "application/json",
      ...(opts.headers as Record<string, string> ?? {}),
    },
  });
  if (res.status === 401) {
    signOut();
    throw new Error("session expired");
  }
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body;
}

// cached account fetch — one round trip per page load, shared by the
// header indicator and any ownership strip on the page
let mePromise: Promise<Me | null> | null = null;
export function me(): Promise<Me | null> {
  if (!session()) return Promise.resolve(null);
  if (!mePromise) {
    mePromise = api("/account", { method: "POST" }).catch(() => null);
  }
  return mePromise;
}
