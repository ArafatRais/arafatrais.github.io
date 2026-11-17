// Local-only revision server. Proxies the Notion API (token stays here),
// keeps review state in data/reviews.json, and serves ./public.
// Run: npm run revise   (then open http://localhost:3939)
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { demoPages, demoTree } from "./demo.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3939;
const NOTION_VERSION = "2022-06-28";
const CACHE_MS = 20 * 60 * 1000; // Notion file URLs expire after ~1h
const MAX_DEPTH = 10;

// ---------- env ----------
try {
  const text = await fs.readFile(path.join(root, ".env"), "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}
const TOKEN = process.env.NOTION_TOKEN;
const DEMO = process.env.REVISE_DEMO === "1";

// ---------- notion client (≈3 req/s, retries on 429) ----------
const GAP = 340;
let nextSlot = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function slot() {
  const now = Date.now();
  const t = Math.max(now, nextSlot);
  nextSlot = t + GAP;
  if (t > now) await sleep(t - now);
}

async function notion(method, url, body) {
  for (let attempt = 0; attempt < 6; attempt++) {
    await slot();
    const res = await fetch(`https://api.notion.com/v1${url}`, {
      method,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) {
      const wait = Number(res.headers.get("retry-after") || 1) * 1000;
      await sleep(wait);
      continue;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || `Notion error ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }
  throw new Error("Notion rate limit: gave up after retries");
}

// ---------- rich text → safe html ----------
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function richHtml(rt = []) {
  return rt
    .map((r) => {
      let s =
        r.type === "equation"
          ? `<code class="eq">${esc(r.equation.expression)}</code>`
          : esc(r.plain_text).replace(/\n/g, "<br>");
      const a = r.annotations || {};
      if (a.code) s = `<code>${s}</code>`;
      if (a.bold) s = `<strong>${s}</strong>`;
      if (a.italic) s = `<em>${s}</em>`;
      if (a.strikethrough) s = `<s>${s}</s>`;
      if (a.underline) s = `<u>${s}</u>`;
      if (r.href && /^(https?:|mailto:)/.test(r.href))
        s = `<a href="${esc(r.href)}" target="_blank" rel="noreferrer">${s}</a>`;
      if (a.color && a.color !== "default") s = `<span class="c-${esc(a.color)}">${s}</span>`;
      return s;
    })
    .join("");
}
const plain = (rt = []) => rt.map((r) => r.plain_text).join("");

// ---------- block tree ----------
function simplify(b, children) {
  const t = b.type;
  const d = b[t] ?? {};
  const node = { id: b.id, type: t, children };
  if (t === "toggle" || (t.startsWith("heading_") && d.is_toggleable)) node.toggle = true;
  if (d.rich_text) node.html = richHtml(d.rich_text);
  switch (t) {
    case "to_do":
      node.checked = !!d.checked;
      break;
    case "callout":
      node.icon = d.icon?.type === "emoji" ? d.icon.emoji : "";
      break;
    case "code":
      node.text = plain(d.rich_text);
      node.language = d.language;
      delete node.html;
      break;
    case "equation":
      node.text = d.expression;
      break;
    case "image":
    case "video":
    case "file":
    case "pdf":
    case "bookmark":
    case "embed":
    case "link_preview":
      node.url = d.url ?? d.external?.url ?? d.file?.url ?? "";
      node.caption = richHtml(d.caption);
      break;
    case "table":
      node.header = !!d.has_column_header;
      break;
    case "table_row":
      node.cells = (d.cells || []).map(richHtml);
      break;
    case "child_page":
      node.text = d.title;
      break;
  }
  return node;
}

async function fetchChildren(blockId, depth = 0) {
  const blocks = [];
  let cursor;
  do {
    const q = `?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`;
    const res = await notion("GET", `/blocks/${blockId}/children${q}`);
    blocks.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  return Promise.all(
    blocks.map(async (b) => {
      const recurse = b.has_children && b.type !== "child_page" && b.type !== "child_database" && depth < MAX_DEPTH;
      const kids = recurse ? await fetchChildren(b.id, depth + 1) : [];
      return simplify(b, kids);
    }),
  );
}

const titleOf = (page) => {
  const prop = Object.values(page.properties || {}).find((p) => p.type === "title");
  return plain(prop?.title) || "Untitled";
};
const dashed = (id) => {
  const h = id.replace(/-/g, "").toLowerCase();
  return /^[0-9a-f]{32}$/.test(h)
    ? `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
    : null;
};

const pageCache = new Map(); // id -> { at, promise }
function loadPage(id, refresh) {
  const hit = pageCache.get(id);
  if (hit && !refresh && Date.now() - hit.at < CACHE_MS) return hit.promise;
  const promise = (async () => {
    if (DEMO) return demoTree(id);
    const [page, tree] = await Promise.all([notion("GET", `/pages/${id}`), fetchChildren(id)]);
    return { id, title: titleOf(page), url: page.url, tree };
  })();
  pageCache.set(id, { at: Date.now(), promise });
  promise.catch(() => pageCache.delete(id));
  return promise;
}

// ---------- review state (local json file) ----------
const DATA = path.join(root, "data", "reviews.json");
let reviews = {};
try {
  reviews = JSON.parse(await fs.readFile(DATA, "utf8"));
} catch {}
let saving = Promise.resolve();
function saveReviews() {
  saving = saving.then(async () => {
    await fs.mkdir(path.dirname(DATA), { recursive: true });
    await fs.writeFile(DATA + ".tmp", JSON.stringify(reviews, null, 2));
    await fs.rename(DATA + ".tmp", DATA);
  });
  return saving;
}

const MIN = 60e3;
const DAY = 864e5;
// Simple SM-2 style scheduler. Grades: 1 Again, 2 Hard, 3 Good, 4 Easy.
function schedule(prev, grade, now) {
  let { ease = 2.5, interval = 0, reps = 0, lapses = 0 } = prev ?? {};
  let ms;
  if (grade === 1) {
    lapses++;
    reps = 0;
    interval = 0;
    ease = Math.max(1.3, ease - 0.2);
    ms = 10 * MIN;
  } else {
    if (grade === 2) {
      ease = Math.max(1.3, ease - 0.15);
      interval = reps === 0 ? 1 : Math.max(1, interval * 1.2);
    } else if (grade === 3) {
      interval = reps === 0 ? 1 : reps === 1 ? 3 : interval * ease;
    } else {
      ease += 0.15;
      interval = reps === 0 ? 4 : interval * ease * 1.3;
    }
    interval = Math.round(interval * 10) / 10;
    reps++;
    ms = interval * DAY;
  }
  return { ease, interval, reps, lapses, last: now, due: now + ms };
}

// ---------- http ----------
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

const send = (res, status, body, type = "application/json") => {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
};
const readBody = (req) =>
  new Promise((resolve, reject) => {
    let s = "";
    req.on("data", (c) => {
      s += c;
      if (s.length > 1e6) reject(new Error("Body too large"));
    });
    req.on("end", () => {
      try {
        resolve(s ? JSON.parse(s) : {});
      } catch (e) {
        reject(e);
      }
    });
  });

async function api(req, res, url) {
  const { pathname } = url;
  if (pathname === "/api/status") return send(res, 200, { ok: true, token: !!TOKEN, demo: DEMO });

  if (pathname === "/api/reviews" && req.method === "GET") return send(res, 200, reviews);

  if (pathname === "/api/review" && req.method === "POST") {
    const { id, pageId, pageTitle, title, grade } = await readBody(req);
    if (typeof id !== "string" || ![1, 2, 3, 4].includes(grade)) return send(res, 400, { error: "Bad request" });
    reviews[id] = {
      ...schedule(reviews[id], grade, Date.now()),
      pageId: String(pageId ?? ""),
      pageTitle: String(pageTitle ?? ""),
      title: String(title ?? "").slice(0, 200),
    };
    await saveReviews();
    return send(res, 200, reviews[id]);
  }

  if (pathname.startsWith("/api/review/") && req.method === "DELETE") {
    delete reviews[decodeURIComponent(pathname.slice("/api/review/".length))];
    await saveReviews();
    return send(res, 200, { ok: true });
  }

  if (!TOKEN && !DEMO)
    return send(res, 500, { error: "No Notion token. Create revise/.env with NOTION_TOKEN=... (see revise/README.md).", setup: true });

  if (pathname === "/api/pages") {
    if (DEMO) return send(res, 200, demoPages);
    const data = await notion("POST", "/search", {
      query: url.searchParams.get("q") || "",
      filter: { property: "object", value: "page" },
      sort: { direction: "descending", timestamp: "last_edited_time" },
      page_size: 50,
    });
    return send(
      res,
      200,
      data.results.map((p) => ({ id: p.id, title: titleOf(p), edited: p.last_edited_time })),
    );
  }

  if (pathname.startsWith("/api/page/")) {
    const raw = decodeURIComponent(pathname.slice("/api/page/".length));
    const id = DEMO ? raw : dashed(raw);
    if (!id) return send(res, 400, { error: "That doesn't look like a Notion page id." });
    return send(res, 200, await loadPage(id, url.searchParams.get("refresh") === "1"));
  }

  return send(res, 404, { error: "Not found" });
}

const server = http.createServer(async (req, res) => {
  try {
    // Only answer to localhost host names (blocks DNS-rebinding from other sites).
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || "")) return send(res, 403, { error: "Forbidden" });
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);

    const rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const file = path.join(root, "public", rel);
    if (!file.startsWith(path.join(root, "public") + path.sep)) return send(res, 403, "Forbidden", "text/plain");
    const body = await fs.readFile(file).catch(() => null);
    if (!body) return send(res, 404, "Not found", "text/plain");
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(body);
  } catch (e) {
    send(res, e.status === 404 || e.status === 400 ? 404 : 500, { error: e.message || "Server error" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Revise running at http://localhost:${PORT}${DEMO ? "  (demo data)" : TOKEN ? "" : "  (no NOTION_TOKEN set)"}`);
});
