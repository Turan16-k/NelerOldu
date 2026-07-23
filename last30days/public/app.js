// public/app.js — frontend mantığı (çerçevesiz, vanilla JS)

const $ = (sel) => document.querySelector(sel);

const state = {
  days: 30,
  sortBy: "engagement",
  sources: {}, // key -> { enabled, label, color }
  lastData: null,
};

const SOURCE_COLORS = { hackernews: "#ff6600", reddit: "#ff4500", github: "#8957e5", stackexchange: "#f48024" };
const EXAMPLES = ["yapay zeka", "Bitcoin", "OpenAI", "iklim değişikliği", "uzay", "elektrikli araç"];

// ---------------------------------------------------------------- Tema
const themeToggle = $("#themeToggle");
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  themeToggle.querySelector(".theme-icon").textContent = t === "dark" ? "☾" : "☀";
  localStorage.setItem("l30d-theme", t);
}
applyTheme(localStorage.getItem("l30d-theme") || "dark");
themeToggle.addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme");
  applyTheme(cur === "dark" ? "light" : "dark");
});

// ---------------------------------------------------------------- Kurulum
async function init() {
  // Örnek çipler
  const chips = $("#exampleChips");
  EXAMPLES.forEach((ex) => {
    const c = document.createElement("button");
    c.type = "button";
    c.className = "chip";
    c.textContent = ex;
    c.addEventListener("click", () => {
      $("#topic").value = ex;
      runSearch();
    });
    chips.appendChild(c);
  });

  // Kaynakları sunucudan al, açık/kapalı düğmeleri kur
  try {
    const res = await fetch("/api/sources");
    const { sources } = await res.json();
    const wrap = $("#sourceToggles");
    sources.forEach((s) => {
      const on = s.defaultOn !== false;
      state.sources[s.key] = { enabled: on, label: s.label, color: s.color };
      const el = document.createElement("button");
      el.type = "button";
      el.className = "src-toggle" + (on ? "" : " off");
      el.dataset.key = s.key;
      el.innerHTML = `<span class="dot" style="background:${s.color}"></span>${s.label}`;
      el.addEventListener("click", () => {
        const cfg = state.sources[s.key];
        cfg.enabled = !cfg.enabled;
        el.classList.toggle("off", !cfg.enabled);
      });
      wrap.appendChild(el);
    });
  } catch {
    setStatus("⚠ Sunucuya bağlanılamadı. 'node server.js' çalışıyor mu?");
  }

  // Zaman aralığı segmenti
  $("#rangeSeg").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-days]");
    if (!btn) return;
    state.days = +btn.dataset.days;
    $("#rangeSeg").querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
  });

  $("#sortBy").addEventListener("change", (e) => {
    state.sortBy = e.target.value;
    if (state.lastData) renderResults(state.lastData.results);
  });

  $("#searchForm").addEventListener("submit", (e) => {
    e.preventDefault();
    runSearch();
  });
}

// ---------------------------------------------------------------- Arama
function setStatus(html) {
  $("#status").innerHTML = html;
}

async function runSearch() {
  const topic = $("#topic").value.trim();
  if (!topic) return;

  const enabled = Object.entries(state.sources).filter(([, v]) => v.enabled).map(([k]) => k);
  if (!enabled.length) return setStatus("⚠ En az bir kaynak seçmelisin.");

  const btn = $("#searchBtn");
  btn.disabled = true;
  $("#brief").classList.add("hidden");
  $("#results").innerHTML = "";
  setStatus(`<span class="spinner"></span>"${topic}" araştırılıyor…`);

  const params = new URLSearchParams({
    topic,
    days: state.days,
    sources: enabled.join(","),
    limit: 20,
  });

  try {
    const res = await fetch(`/api/search?${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Bilinmeyen hata");
    state.lastData = data;
    renderBrief(data);
    renderResults(data.results);
    setStatus("");
  } catch (err) {
    setStatus(`⚠ Hata: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
}

// ---------------------------------------------------------------- Özet
function renderBrief(data) {
  const brief = $("#brief");
  const sourceStats = Object.entries(data.perSource)
    .map(([k, n]) => `<div class="stat"><div class="num">${n}</div><div class="lbl">${state.sources[k]?.label || k}</div></div>`)
    .join("");

  const topList = data.topPicks
    .map((p) => `<li><a href="${p.url}" target="_blank" rel="noopener">${escapeHtml(p.title)}</a></li>`)
    .join("");

  brief.innerHTML = `
    <div class="brief-head">
      <h2>Özet: <span>${escapeHtml(data.topic)}</span> · son ${data.days} gün</h2>
      <div class="brief-actions">
        <button class="ghost-btn" id="exportBtn">⬇ HTML olarak indir</button>
        <button class="ghost-btn" id="copyBtn">⧉ Özeti kopyala</button>
      </div>
    </div>
    <div class="brief-stats">
      <div class="stat"><div class="num">${data.total}</div><div class="lbl">toplam sonuç</div></div>
      ${sourceStats}
      <div class="stat"><div class="num">${(data.elapsedMs / 1000).toFixed(1)}s</div><div class="lbl">süre</div></div>
    </div>
    ${data.topPicks.length ? `<div class="brief-top"><h3>En çok konuşulanlar</h3><ol>${topList}</ol></div>` : ""}
    ${data.errors.length ? `<p style="color:var(--muted);margin-top:12px;font-size:13px">⚠ Bazı kaynaklar yanıt vermedi: ${data.errors.map((e) => e.source).join(", ")}</p>` : ""}
  `;
  brief.classList.remove("hidden");

  $("#exportBtn").addEventListener("click", () => exportHTML(data));
  $("#copyBtn").addEventListener("click", () => copyBrief(data));
}

// ---------------------------------------------------------------- Sonuçlar
function sortResults(results) {
  const arr = [...results];
  switch (state.sortBy) {
    case "date": arr.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)); break;
    case "comments": arr.sort((a, b) => (b.comments || 0) - (a.comments || 0)); break;
    case "score": arr.sort((a, b) => (b.score || 0) - (a.score || 0)); break;
    default: arr.sort((a, b) => b.engagement - a.engagement);
  }
  return arr;
}

function renderResults(results) {
  const wrap = $("#results");
  wrap.innerHTML = "";
  if (!results.length) {
    wrap.innerHTML = `<p class="empty">Sonuç bulunamadı. Farklı bir konu veya daha geniş bir zaman aralığı dene.</p>`;
    return;
  }
  const tpl = $("#cardTemplate");
  const scoreLabel = { hackernews: "puan", reddit: "oy", github: "★", stackexchange: "oy" };

  sortResults(results).forEach((item, i) => {
    const node = tpl.content.cloneNode(true);
    const color = SOURCE_COLORS[item.source] || "var(--accent)";
    node.querySelector(".card-source").style.background = color;

    const title = node.querySelector(".card-title");
    title.textContent = item.title;
    title.href = item.url;

    node.querySelector(".card-summary").textContent = item.summary || "";

    node.querySelector(".meta-engagement").textContent = `⚡ ${item.engagement}`;

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.style.background = color;
    badge.textContent = state.sources[item.source]?.label || item.source;
    node.querySelector(".card-meta").prepend(badge);

    node.querySelector(".meta-score").textContent =
      item.score != null ? `↑ ${formatNum(item.score)} ${scoreLabel[item.source] || ""}` : "";
    node.querySelector(".meta-comments").textContent =
      item.comments ? `💬 ${formatNum(item.comments)}` : "";
    node.querySelector(".meta-author").textContent = item.author || "";
    node.querySelector(".meta-date").textContent = item.createdAt ? timeAgo(item.createdAt) : "";
    node.querySelector(".meta-also").textContent =
      item.alsoOn?.length ? `· ayrıca: ${item.alsoOn.join(", ")}` : "";

    const card = node.querySelector(".card");
    card.style.animationDelay = `${Math.min(i * 0.03, 0.5)}s`;
    wrap.appendChild(node);
  });
}

// ---------------------------------------------------------------- Dışa aktarma
function exportHTML(data) {
  const rows = sortResults(data.results)
    .map(
      (r) => `<tr>
        <td><a href="${r.url}">${escapeHtml(r.title)}</a></td>
        <td>${state.sources[r.source]?.label || r.source}</td>
        <td>${r.score ?? ""}</td>
        <td>${r.comments ?? ""}</td>
        <td>${r.engagement}</td>
      </tr>`
    )
    .join("");
  const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8">
    <title>last30days — ${escapeHtml(data.topic)}</title>
    <style>body{font-family:system-ui,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;color:#1a1e2c}
    h1{font-size:24px}table{width:100%;border-collapse:collapse;margin-top:20px}
    th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #e3e6ef;font-size:14px}
    th{color:#5b6378;text-transform:uppercase;font-size:12px}a{color:#4361ee;text-decoration:none}</style>
    </head><body>
    <h1>${escapeHtml(data.topic)} — son ${data.days} gün</h1>
    <p>${data.total} sonuç · ${new Date(data.generatedAt).toLocaleString("tr-TR")} · last30days</p>
    <table><thead><tr><th>Başlık</th><th>Kaynak</th><th>Oy/★</th><th>Yorum</th><th>Etkileşim</th></tr></thead>
    <tbody>${rows}</tbody></table></body></html>`;
  const blob = new Blob([html], { type: "text/html" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `last30days-${data.topic.replace(/\s+/g, "-")}.html`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function copyBrief(data) {
  const text =
    `${data.topic} — son ${data.days} gün (last30days)\n\n` +
    `En çok konuşulanlar:\n` +
    data.topPicks.map((p, i) => `${i + 1}. ${p.title}\n   ${p.url}`).join("\n");
  navigator.clipboard.writeText(text).then(() => {
    const btn = $("#copyBtn");
    const old = btn.textContent;
    btn.textContent = "✓ Kopyalandı";
    setTimeout(() => (btn.textContent = old), 1500);
  });
}

// ---------------------------------------------------------------- Yardımcılar
function formatNum(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(".0", "") + "k";
  return String(n);
}
function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} sa önce`;
  return `${Math.floor(diff / 86400)} gün önce`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

init();
