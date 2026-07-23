// server.js
// Sıfır bağımlılıklı (zero-dependency) HTTP sunucusu.
// - public/ klasörünü statik olarak sunar
// - /api/search uç noktasıyla araştırma motorunu çağırır
//
// Çalıştırma:  node server.js   ->  http://localhost:3000
// Node 18+ gerektirir (yerleşik fetch). Bu projede Node 24 ile test edildi.

const http = require("http");
const fs = require("fs");
const path = require("path");

// Varsa .env dosyasını yükle (Node 20.6+ yerleşik özelliği — ek paket gerekmez).
try {
  if (fs.existsSync(path.join(__dirname, ".env"))) process.loadEnvFile();
} catch { /* .env yoksa sorun değil */ }

const { research } = require("./src/engine");
const { SOURCES } = require("./src/sources");

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function serveStatic(req, res) {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel === "/") rel = "/index.html";
  // Dizin geçişini (path traversal) engelle.
  const filePath = path.join(PUBLIC, path.normalize(rel).replace(/^(\.\.[/\\])+/, ""));
  if (!filePath.startsWith(PUBLIC)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("404 — sayfa bulunamadı");
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);

  // Mevcut kaynakların listesi (frontend filtrelerini buradan kurar).
  if (u.pathname === "/api/sources") {
    return sendJSON(res, 200, {
      sources: Object.entries(SOURCES).map(([key, v]) => ({
        key,
        label: v.label,
        color: v.color,
        defaultOn: v.defaultOn,
      })),
    });
  }

  // Asıl araştırma uç noktası.
  if (u.pathname === "/api/search") {
    const topic = (u.searchParams.get("topic") || "").trim();
    if (!topic) return sendJSON(res, 400, { error: "topic parametresi gerekli" });
    const days = Math.min(365, Math.max(1, parseInt(u.searchParams.get("days")) || 30));
    const limit = Math.min(50, Math.max(5, parseInt(u.searchParams.get("limit")) || 20));
    const sources = (u.searchParams.get("sources") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      const data = await research({ topic, days, sources, limit });
      return sendJSON(res, 200, data);
    } catch (err) {
      return sendJSON(res, 500, { error: String(err.message || err) });
    }
  }

  // Geri kalan her şey statik dosya.
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`\n  last30days çalışıyor →  http://localhost:${PORT}\n`);
});
