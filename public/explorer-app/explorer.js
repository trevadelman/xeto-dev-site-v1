//
// Xeto Studio Explorer: static app for xeto namespace bundles.  Loads a
// bundles.json index, then for the active bundle fetches its manifest and
// gzipped xetopack, decompresses in the browser, and creates a live xeto
// namespace with zero backend.  Every page is rendered by querying the
// Namespace API directly - no fetches after a bundle's pack loads.
//
// Routes are hash-based and always start with the bundle name:
// #{bundle}/lib/{name}, #{bundle}/spec/{qname}, #{bundle}/instance/{lib}/{id},
// #{bundle}/file/{lib}/{uri}.
//

let bundleNames = [];    // published (server-built) bundle names
let curBundle = null;    // active bundle name
const bundles = {};      // name -> { manifest, ns, typeIndex, instanceIndex, searchIndex, dis }
const virtuals = {};     // name -> { libNames, dis } it was scoped from (recreated from env on load)

//////////////////////////////////////////////////////////////////////////
// Bundle loading (lazy, cached per name - switching back is instant)
//////////////////////////////////////////////////////////////////////////

async function loadBundleList()
{
  bundleNames = await (await fetch("bundles.json")).json();
}

// load a bundle's namespace on first visit; cached thereafter
async function ensureBundle(name)
{
  if (bundles[name]) return bundles[name];
  if (virtuals[name]) return createVirtualBundle(name, virtuals[name].libNames, virtuals[name].dis);
  // recreate a virtual bundle from a bookmarked/refreshed hash, e.g.
  // "ph*", "ph+hx.ai*", or "ph+hx.ai*MyNamespace" (dis after the "*")
  const star = name.indexOf("*");
  if (star >= 0)
  {
    const libNames = name.slice(0, star).split("+");
    const dis = name.slice(star + 1) || null;
    return createVirtualBundle(name, libNames, dis);
  }

  const dir = `bundles/${name}/`;
  const manifest = await (await fetch(dir + "manifest.json")).json();
  document.getElementById("nav").textContent =
    `Loading ${name} (${Math.round(manifest.size / 1024)}KB)\u2026`;

  const res = await fetch(dir + manifest.pack);
  const ds = new DecompressionStream("gzip");
  const bytes = await new Response(res.body.pipeThrough(ds)).arrayBuffer();

  const env  = fan.xetom.RemoteEnv.make();
  const buf  = fan.sys.MemBuf.__makeBytes(bytes);
  const vers = env.loadLibs(buf.in());
  const ns   = env.createNamespace(vers);

  const bundle = { dir, manifest, ns, typeIndex: null, instanceIndex: null, searchIndex: null };
  bundles[name] = bundle;
  return bundle;
}

//////////////////////////////////////////////////////////////////////////
// Virtual bundles: computed client-side as a dependency-closure subset of
// the "env" bundle's already-loaded namespace - no server round trip
//////////////////////////////////////////////////////////////////////////

// transitive dependency closure of a lib name, resolved against an
// already-loaded namespace
function dependClosure(ns, libName, acc)
{
  if (acc.has(libName)) return acc;
  acc.set(libName, ns.version(libName));
  const lib = ns.lib(libName);
  lib.depends().each(d => dependClosure(ns, d.name(), acc));
  return acc;
}

// create (or recreate) a virtual bundle scoped to the union of one or
// more libs' dependency closures, reusing the env bundle's RemoteEnv so
// no pack is refetched.  dis is an optional friendly display name (e.g.
// from a committed xetopack rec) shown in place of the raw lib list.
async function createVirtualBundle(name, libNames, dis)
{
  const env = await ensureBundle(bundleNames[0]);
  const closure = new Map();
  libNames.forEach(libName => dependClosure(env.ns, libName, closure));
  const vers = fan.sys.List.make(fan.xeto.LibVersion.type$, Array.from(closure.values()));
  const ns = env.ns.env().createNamespace(vers);

  // scope manifest.files down to just the libs in this bundle's closure -
  // env's manifest otherwise lists files for every installed lib
  const files = {};
  closure.forEach((v, libN) => { if (env.manifest.files?.[libN]) files[libN] = env.manifest.files[libN]; });
  const manifest = { ...env.manifest, files };

  const bundle = {
    dir: env.dir, manifest, ns, dis,
    typeIndex: null, instanceIndex: null, searchIndex: null
  };
  bundles[name] = bundle;
  virtuals[name] = { libNames, dis };
  if (!bundleNames.includes(name)) bundleNames.push(name);
  return bundle;
}

// virtual bundle name for one or more libs, e.g. "ph*" or "ph+hx.ai*",
// optionally carrying a friendly dis after the "*", e.g. "ph+hx.ai*MyNamespace"
function virtualBundleName(libNames, dis)
{
  return `${libNames.join("+")}*${dis ?? ""}`;
}

// friendly display name for a bundle: its committed dis if it has one,
// otherwise the bundle name itself
function bundleDis(name)
{
  return bundles[name]?.dis || name;
}

// "Create Bundle" button handler: build (or reuse) the virtual bundle for
// a lib and navigate to it
async function createBundleFromLib(libName)
{
  const name = virtualBundleName([libName]);
  await createVirtualBundle(name, [libName]);
  location.hash = bundleHref(name);
}



// current bundle's live objects - only valid once route() has awaited ensureBundle
function cur()      { return bundles[curBundle]; }
function curNs()     { return cur().ns; }
function curManifest() { return cur().manifest; }
function curDir()    { return cur().dir; }

//////////////////////////////////////////////////////////////////////////
// Hash routing: #{bundle}/lib/{name}, #{bundle}/spec/{qname},
// #{bundle}/instance/{lib}/{id}, #{bundle}/file/{lib}/{uri} - back/forward
// and bookmarks just work
//////////////////////////////////////////////////////////////////////////

async function route()
{
  const [bundleName, view, ...rest] = decodeURIComponent(location.hash.slice(1)).split("/");
  const name = bundleName || bundleNames[0];
  if (!name) return;

  await ensureBundle(name);
  curBundle = name;
  renderNav();

  const arg = rest.join("/");
  try
  {
    if (view == "lib")           showLib(arg);
    else if (view == "spec")     showSpec(arg);
    else if (view == "instance") showInstance(rest[0], rest.slice(1).join("/"));
    else if (view == "file")     showFile(rest[0], "/" + rest.slice(1).join("/"));
    else                         showIndex();
  }
  catch (err)
  {
    showNotFound(view, arg, err);
  }
  markActiveNav();
}

// rendered when a route's lib/spec/instance/file isn't in the active
// bundle's namespace (e.g. following a link into a scoped virtual bundle
// that doesn't include that lib)
function showNotFound(view, arg, err)
{
  const out = [crumbs(esc(arg)), `<h1>Not found in ${esc(curBundle)}</h1>`,
    `<p>No ${esc(view)} <code>${esc(arg)}</code> in this bundle&rsquo;s namespace.</p>`];
  if (bundleNames.length > 0 && curBundle !== bundleNames[0])
    out.push(`<p><a class="btn" href="${bundleHref(bundleNames[0]) + "/" + view + "/" + encodeURIComponent(arg)}">` +
      `Look it up in ${esc(bundleNames[0])}</a></p>`);
  setMain(out.join(""));
}

// lib name for current hash within the active bundle, or "index"
function routeLib()
{
  const [, view, ...rest] = decodeURIComponent(location.hash.slice(1)).split("/");
  if (view == "spec") return rest.join("/").split("::")[0];
  if (view == "lib" || view == "file" || view == "instance") return rest[0];
  return "index";
}

function href(...parts)
{
  return "#" + [curBundle, ...parts].map(encodeURIComponent).join("/");
}

function bundleHref(name)
{
  return "#" + encodeURIComponent(name);
}

function markActiveNav()
{
  const cur = routeLib();
  document.querySelectorAll("#navList a").forEach(a => {
    a.classList.toggle("active", a.dataset.lib === cur);
  });
}

//////////////////////////////////////////////////////////////////////////
// Namespace API helpers
//////////////////////////////////////////////////////////////////////////

function esc(s)
{
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

// render xetodoc markdown source to html
function mdToHtml(md)
{
  return fan.markdown.Xetodoc.make().toHtml(md);
}

// doc string from spec meta rendered as xetodoc
function docOf(spec)
{
  const doc = spec.meta().get("doc");
  if (doc == null) return `<span class="muted">&ndash;</span>`;
  return mdToHtml(doc);
}

function specLink(spec)
{
  return `<a href="${href("spec", spec.qname())}">${esc(spec.qname())}</a>`;
}

function instanceLink(libName, id)
{
  return `<a href="${href("instance", libName, id)}"><code>@${esc(id)}</code></a>`;
}

// breadcrumb trail rendered at top of main pane
function crumbs(...parts)
{
  const items = [`<a href="${bundleHref(curBundle)}">Index</a>`, ...parts];
  return `<div class="crumbs">${items.join(" / ")}</div>`;
}

// every type spec in the active bundle, computed once per bundle
function allTypes()
{
  const b = cur();
  if (b.typeIndex == null)
  {
    b.typeIndex = [];
    b.ns.libs().each(lib => lib.types().each(t => b.typeIndex.push(t)));
  }
  return b.typeIndex;
}

// all types in the active bundle that inherit from base
function subtypesOf(base)
{
  return allTypes().filter(t => t !== base && t.isa(base));
}

// every instance in the active bundle as {lib, id}, computed once per bundle
function allInstances()
{
  const b = cur();
  if (b.instanceIndex == null)
  {
    b.instanceIndex = [];
    b.ns.libs().each(lib => lib.instances().each(dict => {
      b.instanceIndex.push({ lib: lib.name(), id: dict.id().toStr() });
    }));
  }
  return b.instanceIndex;
}

// render a xeto value using haystack::Kind to dispatch on type
function valToHtml(val)
{
  if (val == null) return "";
  const kind = fan.haystack.Kind.fromVal(val, false);
  if (kind == null) return esc(val.toString());
  if (kind.isRef()) return `<code>@${esc(val.id())}</code>`;
  if (kind.isList())
  {
    const items = [];
    val.each(v => items.push(valToHtml(v)));
    return items.join(", ");
  }
  if (kind.isDict())
  {
    const rows = [];
    val.each((v, n) => rows.push(`<tr><td><code>${esc(n)}</code></td><td>${valToHtml(v)}</td></tr>`));
    return `<table>${rows.join("")}</table>`;
  }
  return esc(val.toString());
}

// libs of the active bundle sorted alphabetically by name
function sortedLibs()
{
  const acc = [];
  curNs().libs().each(lib => acc.push(lib));
  return acc.sort((a, b) => a.name().localeCompare(b.name()));
}

function setMain(html)
{
  const main = document.getElementById("main");
  main.innerHTML = html;
  main.scrollTop = 0;
}

//////////////////////////////////////////////////////////////////////////
// Views
//////////////////////////////////////////////////////////////////////////

function showIndex()
{
  const virtualBadge = curBundle.includes("*") ? `<span class="badge virtual">virtual</span>` : "";
  const out = [`<h1>${esc(bundleDis(curBundle))} <span class="badge">${curNs().libs().size()} libs</span>${virtualBadge}</h1>`];
  out.push("<table><tr><th>Lib</th><th>Version</th><th>Doc</th></tr>");
  sortedLibs().forEach(lib => {
    out.push(`<tr><td><a href="${href("lib", lib.name())}">${esc(lib.name())}</a></td>` +
      `<td class="muted">${esc(lib.version().toStr())}</td><td>${esc(lib.meta().get("doc") ?? "")}</td></tr>`);
  });
  out.push("</table>");
  setMain(out.join(""));
}

function showLib(libName)
{
  const lib = curNs().lib(libName);
  const out = [crumbs(esc(libName))];
  out.push(`<div class="page-head">` +
    `<div class="title"><h1>${esc(libName)}</h1><span class="badge">${esc(lib.version().toStr())}</span></div>` +
    (curBundle === bundleNames[0]
      ? `<a class="btn btn-primary" onclick="createBundleFromLib('${esc(libName)}')">Create Bundle</a>`
      : "") +
    `</div>`);
  out.push(`<p>${esc(lib.meta().get("doc") ?? "")}</p>`);
  const depends = lib.depends();
  if (depends.size() > 0)
  {
    const links = [];
    depends.each(d => links.push(
      curNs().hasLib(d.name())
        ? `<a href="${href("lib", d.name())}">${esc(d.name())}</a> <span class="muted">${esc(d.versions().toStr())}</span>`
        : `<span class="muted">${esc(d.name())} ${esc(d.versions().toStr())}</span>`
    ));
    out.push(`<h3>Depends</h3><p>${links.join(", ")}</p>`);
  }
  out.push("<h3>Specs</h3><table><tr><th>Name</th><th>Doc</th></tr>");
  lib.specs().each(spec => {
    out.push(`<tr><td>${specLink(spec)}</td><td>${docOf(spec)}</td></tr>`);
  });
  out.push("</table>");
  const instances = lib.instances();
  if (instances.size() > 0)
  {
    out.push("<h3>Instances</h3><ul>");
    instances.each(x => {
      out.push(`<li>${instanceLink(libName, x.id().toStr())}</li>`);
    });
    out.push("</ul>");
  }
  const docs = curManifest().files?.[libName];
  if (docs)
  {
    out.push("<h3>Files</h3><ul>");
    docs.forEach(uri => {
      out.push(`<li><a href="${href("file", libName, uri.slice(1))}">${esc(uri)}</a></li>`);
    });
    out.push("</ul>");
  }
  setMain(out.join(""));
}

function showSpec(qname)
{
  const spec = curNs().spec(qname);
  const libName = spec.lib().name();
  const out = [crumbs(`<a href="${href("lib", libName)}">${esc(libName)}</a>`, esc(spec.name())),
    `<h1>${esc(spec.qname())}</h1>`];
  if (spec.base() != null) out.push(`<p class="muted">extends ${specLink(spec.base())}</p>`);
  out.push(docOf(spec));

  const rows = [];
  spec.slots().each(slot => {
    rows.push(`<tr><td><code>${esc(slot.name())}</code></td>` +
      `<td>${specLink(slot.type())}${slot.isMaybe() ? "?" : ""}</td>` +
      `<td>${docOf(slot)}</td></tr>`);
  });
  if (rows.length > 0)
    out.push("<h3>Slots</h3><table><tr><th>Name</th><th>Type</th><th>Doc</th></tr>" + rows.join("") + "</table>");

  // subtype query across the active bundle's namespace
  const subs = subtypesOf(spec);
  if (subs.length > 0)
  {
    out.push(`<h3>Subtypes <span class="badge">${subs.length}</span></h3>`);
    out.push("<table><tr><th>Spec</th><th>Lib</th><th>Doc</th></tr>");
    subs.forEach(s => {
      out.push(`<tr><td>${specLink(s)}</td><td class="muted">${esc(s.lib().name())}</td><td>${docOf(s)}</td></tr>`);
    });
    out.push("</table>");
  }

  setMain(out.join(""));
}

function showInstance(libName, id)
{
  const dict = curNs().instance(id);
  const out = [crumbs(`<a href="${href("lib", libName)}">${esc(libName)}</a>`, `<code>@${esc(id)}</code>`),
    `<h1><code>@${esc(id)}</code></h1>`];
  out.push("<table><tr><th>Name</th><th>Value</th></tr>");
  dict.each((v, n) => out.push(`<tr><td><code>${esc(n)}</code></td><td>${valToHtml(v)}</td></tr>`));
  out.push("</table>");
  setMain(out.join(""));
}

async function showFile(libName, rawUri)
{
  // rawUri may carry a heading anchor from a doc cross-link, e.g.
  // "/Libs.md#names" - split it off and scroll to the heading after render
  const [uri, anchor] = rawUri.split("#");
  const head = crumbs(`<a href="${href("lib", libName)}">${esc(libName)}</a>`, esc(uri));
  const src = `${curDir()}files/${libName}${uri}`;
  if (!uri.endsWith(".md")) return setMain(head + `<img src="${src}">`);
  const md = await (await fetch(src)).text();
  setMain(head + rewriteDocLinks(mdToHtml(md), libName, uri));
  if (anchor) document.getElementById(anchor)?.scrollIntoView();
}

// rewrite relative links/images in rendered doc html (e.g. "Libs.md" or
// "Libs.md#names") from a lib's doc file into explorer routes, so docs
// authored as plain relative markdown links work unmodified
function rewriteDocLinks(html, libName, uri)
{
  const baseDir = uri.slice(0, uri.lastIndexOf("/") + 1);
  const frag = document.createElement("div");
  frag.innerHTML = html;

  frag.querySelectorAll("a[href]").forEach(a => {
    const target = a.getAttribute("href");
    if (/^([a-z]+:|#|\/)/i.test(target)) return; // absolute, anchor, or root-relative - leave as-is
    const [path, hash] = target.split("#");
    const resolved = path ? baseDir + path : uri;
    a.setAttribute("href", href("file", libName, resolved.slice(1)) + (hash ? "#" + hash : ""));
  });

  frag.querySelectorAll("img[src]").forEach(img => {
    const target = img.getAttribute("src");
    if (/^([a-z]+:|\/)/i.test(target)) return;
    img.setAttribute("src", `${curDir()}files/${libName}${baseDir}${target}`);
  });

  return frag.innerHTML;
}

//////////////////////////////////////////////////////////////////////////
// Search: command palette (cmd-K / ctrl-K / "/") over specs, instances,
// libs, and files - scoped to the active bundle
//////////////////////////////////////////////////////////////////////////

function buildSearchIndex()
{
  const b = cur();
  if (b.searchIndex != null) return b.searchIndex;
  const idx = [];
  sortedLibs().forEach(lib => idx.push({ kind: "lib", name: lib.name(), href: href("lib", lib.name()) }));
  allTypes().forEach(t => idx.push({ kind: "spec", name: t.qname(), href: href("spec", t.qname()) }));
  allInstances().forEach(x => idx.push({ kind: "instance", name: `${x.lib}::${x.id}`, href: href("instance", x.lib, x.id) }));
  Object.entries(b.manifest.files ?? {}).forEach(([lib, uris]) =>
    uris.forEach(uri => idx.push({
      kind: "file", name: `${lib}${uri}`, href: href("file", lib, uri.slice(1))
    })));
  b.searchIndex = idx;
  return idx;
}

function searchMatches(query)
{
  const q = query.toLowerCase();
  if (!q) return [];
  const starts = [], contains = [];
  buildSearchIndex().forEach(item => {
    const n = item.name.toLowerCase();
    if (n.startsWith(q)) starts.push(item);
    else if (n.includes(q)) contains.push(item);
  });
  return starts.concat(contains).slice(0, 200);
}

let paletteSel = 0;
function openPalette()
{
  document.getElementById("palette-backdrop").classList.add("open");
  const input = document.getElementById("palette-input");
  input.value = "";
  input.focus();
  renderPaletteResults([]);
}

function closePalette()
{
  document.getElementById("palette-backdrop").classList.remove("open");
}

function renderPaletteResults(items)
{
  paletteSel = 0;
  const el = document.getElementById("palette-results");
  el.innerHTML = items.map((item, i) =>
    `<div class="row${i === 0 ? " sel" : ""}" data-href="${item.href}">` +
    `<span class="kind">${item.kind}</span><span class="name">${esc(item.name)}</span></div>`
  ).join("");
  el.querySelectorAll(".row").forEach(row => {
    row.addEventListener("click", () => { location.hash = row.dataset.href; closePalette(); });
  });
}

function paletteMove(delta)
{
  const rows = document.querySelectorAll("#palette-results .row");
  if (rows.length === 0) return;
  rows[paletteSel]?.classList.remove("sel");
  paletteSel = (paletteSel + delta + rows.length) % rows.length;
  rows[paletteSel].classList.add("sel");
  rows[paletteSel].scrollIntoView({ block: "nearest" });
}

function paletteChoose()
{
  const rows = document.querySelectorAll("#palette-results .row");
  const row = rows[paletteSel];
  if (row) { location.hash = row.dataset.href; closePalette(); }
}

function initPalette()
{
  const input = document.getElementById("palette-input");
  input.addEventListener("input", () => renderPaletteResults(searchMatches(input.value)));
  input.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { e.preventDefault(); paletteMove(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); paletteMove(-1); }
    else if (e.key === "Enter") { e.preventDefault(); paletteChoose(); }
    else if (e.key === "Escape") { closePalette(); }
  });
  document.getElementById("palette-backdrop").addEventListener("click", e => {
    if (e.target.id === "palette-backdrop") closePalette();
  });
  window.addEventListener("keydown", e => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); openPalette(); }
    else if (e.key === "/" && document.activeElement.tagName !== "INPUT" &&
             document.activeElement.tagName !== "TEXTAREA") { e.preventDefault(); openPalette(); }
  });
}

//////////////////////////////////////////////////////////////////////////
// Top bar: bundle switcher
//////////////////////////////////////////////////////////////////////////

// embed mode (?embed): hides the topbar chrome so the explorer can be
// iframed inside xeto.dev library pages without double-branding
const embedMode = new URLSearchParams(location.search).has("embed");

function renderTopBar()
{
  if (embedMode) { document.getElementById("topbar").style.display = "none"; return; }
  document.getElementById("topbar").innerHTML =
    `<button class="btn btn-ghost nav-btn" onclick="toggleNav()" aria-label="Toggle navigation">&#9776;</button>` +
    `<a class="brand" href="/">xeto.dev</a>` +
    `<div id="bundle-switcher" class="dropdown">` +
      `<button class="btn dropdown-toggle" onclick="toggleBundleMenu()">` +
        `<span class="name">${esc(bundleDis(curBundle))}</span>` +
        `${curBundle.includes("*") ? `<span class="badge virtual">virtual</span>` : ""}` +
        `<span class="chevron">&#9662;</span>` +
      `</button>` +
      `<div id="bundle-menu" class="dropdown-menu"></div>` +
    `</div>` +
    `<a class="btn btn-ghost search-btn" onclick="openPalette()">Search <span class="kbd">&#8984;K</span></a>`;
  renderBundleMenu();
  if (!window.__bundleMenuBound)
  {
    window.__bundleMenuBound = true;
    document.addEventListener("click", closeBundleMenuOnClickAway);
  }
}

function renderBundleMenu()
{
  const menu = document.getElementById("bundle-menu");
  menu.innerHTML = bundleNames.map(name =>
    `<div class="dropdown-item${name === curBundle ? " sel" : ""}" data-name="${esc(name)}">` +
    `<span class="item-name">${esc(bundleDis(name))}</span>` +
    `${name.includes("*") ? `<span class="badge virtual">virtual</span>` : ""}</div>`
  ).join("");
  menu.querySelectorAll(".dropdown-item").forEach(item => {
    item.addEventListener("click", () => {
      location.hash = bundleHref(item.dataset.name);
      closeBundleMenu();
    });
  });
}

function toggleBundleMenu()
{
  document.getElementById("bundle-switcher").classList.toggle("open");
}

function closeBundleMenu()
{
  document.getElementById("bundle-switcher")?.classList.remove("open");
}

function closeBundleMenuOnClickAway(e)
{
  const switcher = document.getElementById("bundle-switcher");
  if (switcher && !switcher.contains(e.target)) closeBundleMenu();
}

//////////////////////////////////////////////////////////////////////////
// Nav
//////////////////////////////////////////////////////////////////////////

function renderNav()
{
  document.getElementById("nav").innerHTML =
    `<input type="text" placeholder="Filter libs\u2026" oninput="renderNavList(this.value)">` +
    `<div id="navList"></div>`;
  renderNavList("");
  renderTopBar();
  initNavResize();
}

// draggable divider between #nav and #main - width persisted across sessions
function initNavResize()
{
  const nav = document.getElementById("nav");
  const handle = document.getElementById("nav-resize");
  if (handle.dataset.bound) return; // only wire listeners once
  handle.dataset.bound = "1";

  const saved = localStorage.getItem("navWidth");
  if (saved) nav.style.width = saved + "px";

  let dragging = false;
  handle.addEventListener("mousedown", e => {
    dragging = true;
    document.body.style.cursor = "col-resize";
    e.preventDefault();
  });
  window.addEventListener("mousemove", e => {
    if (!dragging) return;
    const w = Math.min(Math.max(e.clientX, 140), 480);
    nav.style.width = w + "px";
  });
  window.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = "";
    localStorage.setItem("navWidth", parseInt(nav.style.width, 10));
  });
}

function renderNavList(filter)
{
  const out = [`<ul><li><a href="${bundleHref(curBundle)}" data-lib="index">Index</a></li>`];
  sortedLibs().forEach(lib => {
    if (filter && !lib.name().includes(filter)) return;
    out.push(`<li><a href="${href("lib", lib.name())}" data-lib="${esc(lib.name())}" title="${esc(lib.name())}">` +
      `<span>${esc(lib.name())}</span><span class="badge">${esc(lib.version().toStr())}</span></a></li>`);
  });
  out.push("</ul>");
  document.getElementById("navList").innerHTML = out.join("");
  markActiveNav();
}

//////////////////////////////////////////////////////////////////////////
// Boot
//////////////////////////////////////////////////////////////////////////

// mobile nav drawer (see explorer.css media query); closes on navigation
function toggleNav(force)
{
  document.body.classList.toggle("nav-open", force);
}

window.addEventListener("hashchange", () => {
  toggleNav(false);
  route();
  // keep the wrapping /explorer page's URL in sync when embedded
  if (embedMode && window.parent !== window)
    window.parent.postMessage({ explorerHash: location.hash }, location.origin);
});


loadBundleList()
  .then(() => { initPalette(); return route(); })
  .catch(err => {
    console.error(err);
    document.getElementById("nav").textContent = "ERROR: " + err;
  });
