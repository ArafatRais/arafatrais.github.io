// Revise: keyboard-driven review of Notion toggles, shown in page order.
const $ = (s, r = document) => r.querySelector(s);
const app = $("#app");
const STUDY_SECONDS = 30;

let reviews = {};
let page = null; // { id, title, url, tree }
let cursor = null; // focused .toggle element
let timer = null; // { el, end, handle }

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function api(path, opts) {
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ---------- review status ----------
function fmt(ms) {
  const m = ms / 60000;
  if (m < 60) return `${Math.max(1, Math.ceil(m))}m`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}
function status(id) {
  const r = reviews[id];
  if (!r) return { k: "new", label: "" };
  const left = r.due - Date.now();
  return left <= 0 ? { k: "due", label: "due" } : { k: "ok", label: `in ${fmt(left)}` };
}

// ---------- toast ----------
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

// ---------- routing ----------
window.addEventListener("hashchange", route);
route();

function route() {
  stopTimer();
  cursor = null;
  const m = location.hash.match(/^#\/p\/(.+)$/);
  if (m) openPage(decodeURIComponent(m[1]));
  else home();
}

function pageIdFromInput(s) {
  s = s.trim();
  if (!s) return null;
  const last = s.split("?")[0].split("#")[0].split("/").pop().replace(/-/g, "");
  const id = last.slice(-32);
  return /^[0-9a-f]{32}$/i.test(id) ? id.toLowerCase() : null;
}

// ---------- home ----------
async function home() {
  document.title = "Revise";
  app.innerHTML = `
    <div class="top"><span class="muted">Revise</span></div>
    <h1>Lectures</h1>
    <input class="search" id="q" placeholder="Search pages, or paste a Notion link…  (press / to focus)" autocomplete="off" />
    <div id="due"></div>
    <div id="list"><p class="note">Loading…</p></div>`;
  try {
    reviews = await api("/api/reviews");
  } catch {}
  renderDue();

  const q = $("#q");
  let t;
  q.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => loadList(q.value), 250);
  });
  q.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const id = pageIdFromInput(q.value);
      if (id) location.hash = `#/p/${id}`;
      else if (e.target.value) focusRow(0);
    }
    if (e.key === "Escape" || e.key === "ArrowDown") {
      e.preventDefault();
      q.blur();
      focusRow(0);
    }
  });
  loadList("");
}

function renderDue() {
  const byPage = new Map();
  for (const r of Object.values(reviews)) {
    if (!r.pageId || r.due > Date.now()) continue;
    const e = byPage.get(r.pageId) ?? { title: r.pageTitle || "Untitled", n: 0 };
    e.n++;
    byPage.set(r.pageId, e);
  }
  const box = $("#due");
  if (!byPage.size) return (box.innerHTML = "");
  box.innerHTML =
    `<div class="sect">Due now</div>` +
    [...byPage]
      .sort((a, b) => b[1].n - a[1].n)
      .map(([id, e]) => `<a class="row" href="#/p/${esc(id)}"><span class="name">${esc(e.title)}</span><span class="pill">${e.n} due</span></a>`)
      .join("");
}

async function loadList(q) {
  const list = $("#list");
  if (!list) return;
  try {
    const pages = await api(`/api/pages?q=${encodeURIComponent(q)}`);
    const counts = {};
    for (const r of Object.values(reviews)) if (r.pageId) counts[r.pageId] = (counts[r.pageId] || 0) + 1;
    list.innerHTML =
      `<div class="sect">${q ? "Results" : "Recently edited"}</div>` +
      (pages.length
        ? pages
            .map((p) => {
              const tracked = counts[p.id] ? `${counts[p.id]} tracked · ` : "";
              return `<a class="row" href="#/p/${esc(p.id)}"><span class="name">${esc(p.title)}</span><span class="meta">${tracked}${new Date(p.edited).toLocaleDateString()}</span></a>`;
            })
            .join("")
        : `<p class="note">No pages found. In Notion, open the page → ••• → Connections → add your integration.</p>`);
  } catch (e) {
    list.innerHTML = `<div class="err">${esc(e.message)}</div>`;
  }
}

function focusRow(i) {
  const rows = [...app.querySelectorAll(".row")];
  if (!rows.length) return;
  const cur = rows.findIndex((r) => r.classList.contains("focus"));
  rows.forEach((r) => r.classList.remove("focus"));
  const next = rows[Math.max(0, Math.min(rows.length - 1, i))];
  next.classList.add("focus");
  next.scrollIntoView({ block: "nearest" });
  return cur;
}

// ---------- page view ----------
async function openPage(id, refresh = false) {
  app.innerHTML = `<p class="note">Reading from Notion… the first load of a big page can take a few seconds.</p>`;
  try {
    [reviews, page] = await Promise.all([api("/api/reviews"), api(`/api/page/${id}${refresh ? "?refresh=1" : ""}`)]);
  } catch (e) {
    app.innerHTML = `<div class="top"><a class="back" href="#/">← All pages</a></div><div class="err">${esc(e.message)}</div>`;
    return;
  }
  document.title = `${page.title} · Revise`;
  app.innerHTML = `
    <div class="top"><a class="back" href="#/">← All pages</a></div>
    <h1>${page.url ? `<a href="${esc(page.url)}" target="_blank" rel="noreferrer" style="text-decoration:none">${esc(page.title)}</a>` : esc(page.title)}</h1>
    <div class="stats" id="stats"></div>
    <div class="page" id="page"></div>`;
  renderBlocks(page.tree, $("#page"));
  updateBadges();
  const first = $(".toggle", app);
  if (first) setCursor(first);
  else $("#page").insertAdjacentHTML("afterbegin", `<p class="note">No toggles on this page.</p>`);
}

function renderBlocks(nodes, container) {
  let i = 0;
  while (i < nodes.length) {
    const n = nodes[i];
    if (n.toggle) {
      container.append(toggleEl(n));
      i++;
    } else if (n.type === "bulleted_list_item" || n.type === "numbered_list_item") {
      const list = document.createElement(n.type === "bulleted_list_item" ? "ul" : "ol");
      while (i < nodes.length && nodes[i].type === n.type && !nodes[i].toggle) {
        const li = document.createElement("li");
        li.innerHTML = nodes[i].html || "";
        if (nodes[i].children.length) {
          const sub = document.createElement("div");
          sub.className = "li-sub";
          renderBlocks(nodes[i].children, sub);
          li.append(sub);
        }
        list.append(li);
        i++;
      }
      container.append(list);
    } else {
      container.append(blockEl(n));
      i++;
    }
  }
}

function toggleEl(n) {
  const el = document.createElement("div");
  el.className = "toggle";
  el.dataset.id = n.id;
  const h = n.type.startsWith("heading_") ? ` h${n.type.slice(-1)}` : "";
  el.innerHTML = `<div class="t-head"><span class="caret">▶</span><span class="t-title${h}">${n.html || "Untitled"}</span><span class="timer-txt"></span><span class="badge"></span><span class="timer-bar"></span></div><div class="t-body"></div>`;
  renderBlocks(n.children, $(".t-body", el));
  return el;
}

function blockEl(n) {
  const d = document.createElement("div");
  d.className = "blk";
  const kids = () => {
    if (!n.children?.length) return;
    const box = document.createElement("div");
    box.style.marginLeft = "20px";
    renderBlocks(n.children, box);
    d.append(box);
  };
  switch (n.type) {
    case "paragraph":
      d.innerHTML = n.html || "&nbsp;";
      kids();
      break;
    case "heading_1":
    case "heading_2":
    case "heading_3": {
      const h = document.createElement("h" + n.type.slice(-1));
      h.className = "blk";
      h.innerHTML = n.html;
      return h;
    }
    case "to_do":
      d.className = "blk todo";
      d.innerHTML = `<input type="checkbox" disabled ${n.checked ? "checked" : ""}>${n.html}`;
      kids();
      break;
    case "quote":
      d.className = "blk quote";
      d.innerHTML = n.html;
      kids();
      break;
    case "callout":
      d.className = "blk callout";
      d.innerHTML = `<span>${esc(n.icon)}</span><div>${n.html}</div>`;
      if (n.children?.length) renderBlocks(n.children, d.lastElementChild);
      break;
    case "code":
      d.innerHTML = `<pre><code>${esc(n.text)}</code></pre>`;
      break;
    case "equation":
      d.innerHTML = `<code class="eq">${esc(n.text)}</code>`;
      break;
    case "divider":
      return document.createElement("hr");
    case "image":
      d.innerHTML = `<img src="${esc(n.url)}" alt="" loading="lazy">${n.caption ? `<div class="cap">${n.caption}</div>` : ""}`;
      break;
    case "bookmark":
    case "embed":
    case "link_preview":
    case "video":
    case "file":
    case "pdf":
      d.innerHTML = `<a href="${esc(n.url)}" target="_blank" rel="noreferrer">${esc(n.url)}</a>`;
      break;
    case "table": {
      const rows = (n.children || []).map((r, ri) => {
        const tag = n.header && ri === 0 ? "th" : "td";
        return `<tr>${(r.cells || []).map((c) => `<${tag}>${c}</${tag}>`).join("")}</tr>`;
      });
      d.innerHTML = `<table>${rows.join("")}</table>`;
      break;
    }
    case "column_list":
      d.className = "blk columns";
      for (const col of n.children || []) {
        const c = document.createElement("div");
        c.className = "col";
        renderBlocks(col.children || [], c);
        d.append(c);
      }
      break;
    case "child_page":
      d.innerHTML = `<span class="muted">↳ ${esc(n.text)}</span>`;
      break;
    default:
      // synced blocks, columns, etc.: show their content; anything else is skipped quietly
      if (n.html) d.innerHTML = n.html;
      kids();
      if (!d.childNodes.length) return document.createComment(n.type);
  }
  return d;
}

// ---------- indicators ----------
function updateBadges() {
  if (!page) return;
  const counts = { new: 0, due: 0, ok: 0 };
  for (const el of app.querySelectorAll(".toggle")) {
    const s = status(el.dataset.id);
    counts[s.k]++;
    const b = $(":scope > .t-head .badge", el);
    b.className = `badge ${s.k}`;
    b.textContent = s.label;
    el.classList.toggle("is-due", s.k === "due");
  }
  const stats = $("#stats");
  if (stats)
    stats.innerHTML = `<span class="s-due"><b>${counts.due}</b> due</span><span><b>${counts.ok}</b> scheduled</span><span><b>${counts.new}</b> not started</span><button class="btn" id="refresh">Refresh from Notion</button>`;
  $("#refresh")?.addEventListener("click", () => refreshPage());
}
setInterval(updateBadges, 60000);

function refreshPage() {
  if (page) openPage(page.id, true);
}

// ---------- cursor / navigation ----------
const allToggles = () => [...app.querySelectorAll(".toggle")];
const parentToggle = (el) => el.parentElement.closest(".toggle");
function visibleToggles() {
  return allToggles().filter((t) => {
    for (let p = parentToggle(t); p; p = parentToggle(p)) if (!p.classList.contains("open")) return false;
    return true;
  });
}

function setCursor(el, { keepTimer = false } = {}) {
  if (!keepTimer && timer && timer.el !== el) stopTimer();
  cursor?.classList.remove("cursor");
  cursor = el;
  if (el) {
    el.classList.add("cursor");
    $(":scope > .t-head", el).scrollIntoView({ block: "nearest" });
  }
}

function move(dir) {
  const v = visibleToggles();
  if (!v.length) return;
  const i = cursor ? v.indexOf(cursor) : -1;
  setCursor(v[Math.max(0, Math.min(v.length - 1, i + dir))]);
}

function setOpen(el, open) {
  el.classList.toggle("open", open);
}

function jumpDue(dir) {
  const all = allToggles();
  if (!all.length) return;
  const start = cursor ? all.indexOf(cursor) : -1;
  for (let step = 1; step <= all.length; step++) {
    const t = all[(start + dir * step + all.length * 2) % all.length];
    if (status(t.dataset.id).k === "due") {
      for (let p = parentToggle(t); p; p = parentToggle(p)) setOpen(p, true);
      return setCursor(t);
    }
  }
  toast("Nothing due on this page");
}

// ---------- grading ----------
const GRADES = { 1: "Again", 2: "Hard", 3: "Good", 4: "Easy" };

async function grade(g) {
  const el = cursor;
  if (!el || !page) return;
  const id = el.dataset.id;
  const title = $(":scope > .t-head .t-title", el).textContent.trim();
  stopTimer();
  setOpen(el, false);
  const v = visibleToggles();
  const next = v[v.indexOf(el) + 1];
  if (next) setCursor(next); // move now so quick keypresses don't act on the graded toggle
  try {
    reviews[id] = await api("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, pageId: page.id, pageTitle: page.title, title, grade: g }),
    });
    toast(`${GRADES[g]} → back in ${fmt(reviews[id].due - Date.now())}`);
  } catch (e) {
    toast(`Couldn't save: ${e.message}`);
  }
  updateBadges();
}

async function untrack() {
  if (!cursor || !reviews[cursor.dataset.id]) return;
  await api(`/api/review/${encodeURIComponent(cursor.dataset.id)}`, { method: "DELETE" });
  delete reviews[cursor.dataset.id];
  updateBadges();
  toast("No longer tracked");
}

// ---------- study timer ----------
function startTimer(el) {
  if (timer?.el === el) return stopTimer();
  stopTimer();
  setOpen(el, true);
  const end = Date.now() + STUDY_SECONDS * 1000;
  const head = $(":scope > .t-head", el);
  const tick = () => {
    const left = end - Date.now();
    if (left <= 0) {
      stopTimer();
      setOpen(el, false);
      toast("Time. Say it back, then Space to check");
      return;
    }
    head.style.setProperty("--p", 1 - left / (STUDY_SECONDS * 1000));
    $(".timer-txt", head).textContent = `${Math.ceil(left / 1000)}s`;
  };
  timer = { el, handle: setInterval(tick, 200) };
  tick();
}

function stopTimer() {
  if (!timer) return;
  clearInterval(timer.handle);
  const head = $(":scope > .t-head", timer.el);
  head.style.removeProperty("--p");
  $(".timer-txt", head).textContent = "";
  timer = null;
}

// ---------- keys ----------
document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
  const help = $("#help");

  if (e.key === "?" && !typing) {
    help.hidden = !help.hidden;
    return;
  }
  if (e.key === "Escape" && !help.hidden) {
    help.hidden = true;
    return;
  }
  if (typing) return;

  if (!page) return homeKeys(e);

  const key = e.key;
  const handled = () => e.preventDefault();
  if (key === "j" || key === "ArrowDown") (handled(), move(1));
  else if (key === "k" || key === "ArrowUp") (handled(), move(-1));
  else if (key === " " || key === "Enter") {
    handled();
    if (cursor) {
      stopTimer();
      setOpen(cursor, !cursor.classList.contains("open"));
    }
  } else if (key === "ArrowRight" || key === "l") {
    handled();
    if (!cursor) return;
    if (!cursor.classList.contains("open")) setOpen(cursor, true);
    else {
      const child = $(".toggle", cursor);
      if (child) setCursor(child);
    }
  } else if (key === "ArrowLeft" || key === "h") {
    handled();
    if (!cursor) return;
    if (cursor.classList.contains("open")) setOpen(cursor, false);
    else if (parentToggle(cursor)) setCursor(parentToggle(cursor));
  } else if (key === "t") cursor && startTimer(cursor);
  else if (["1", "2", "3", "4"].includes(key)) grade(Number(key));
  else if (key === "0") untrack();
  else if (key === "n") jumpDue(1);
  else if (key === "p") jumpDue(-1);
  else if (key === "e") allToggles().forEach((t) => setOpen(t, true));
  else if (key === "z") {
    stopTimer();
    allToggles().forEach((t) => setOpen(t, false));
    const top = allToggles().find((t) => !parentToggle(t));
    if (cursor && parentToggle(cursor)) setCursor(top);
  } else if (key === "R") refreshPage();
  else if (key === "g") location.hash = "#/";
});

function homeKeys(e) {
  if (e.key === "/") {
    e.preventDefault();
    $("#q")?.focus();
    return;
  }
  const rows = [...app.querySelectorAll(".row")];
  const cur = rows.findIndex((r) => r.classList.contains("focus"));
  if (e.key === "j" || e.key === "ArrowDown") (e.preventDefault(), focusRow(cur + 1));
  else if (e.key === "k" || e.key === "ArrowUp") (e.preventDefault(), focusRow(Math.max(0, cur - 1)));
  else if (e.key === "Enter" && cur >= 0) rows[cur].click();
}
