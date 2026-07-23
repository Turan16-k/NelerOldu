// src/engine.js
// Tüm kaynakları paralel sorgular, sonuçları tek bir "brief" (özet) altında
// birleştirir ve gerçek etkileşime (oy/yorum) göre sıralar.

const { SOURCES } = require("./sources");

// Ham etkileşim: upvote/yıldız + yorumların 2 katı (yorum daha güçlü sinyaldir).
function rawEngagement(item) {
  return (item.score || 0) + (item.comments || 0) * 2;
}

// Trend skoru (0–100): her kaynağın kendi içinde normalize edilir.
// Böylece GitHub'ın binlerce yıldızı, HN'in birkaç yüz puanını ezmez;
// "en çok konuşulanlar" listesi platformları adil şekilde karıştırır.
// Log ölçek kullanılır ki birkaç viral içerik dağılımı bozmasın.
function normalizeBySource(items) {
  const maxLog = {};
  for (const it of items) {
    it._log = Math.log10(rawEngagement(it) + 1);
    maxLog[it.source] = Math.max(maxLog[it.source] || 0, it._log);
  }
  for (const it of items) {
    it.engagement = maxLog[it.source]
      ? Math.round((it._log / maxLog[it.source]) * 100)
      : 0;
    delete it._log;
  }
}

// Aynı haberin farklı platformlardaki kopyalarını kabaca tespit etmek için
// başlığı normalize eden basit bir anahtar.
function dedupeKey(title) {
  return (title || "")
    .toLowerCase()
    .replace(/[^a-z0-9çğıöşü ]/gi, "")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 6)
    .join(" ");
}

async function research({ topic, days = 30, sources, limit = 20 }) {
  const defaults = Object.keys(SOURCES).filter((k) => SOURCES[k].defaultOn);
  const active = (sources && sources.length ? sources : defaults)
    .filter((s) => SOURCES[s]);

  const started = Date.now();
  const settled = await Promise.allSettled(
    active.map((key) => SOURCES[key].fn(topic, days, limit))
  );

  const results = [];
  const perSource = {};
  const errors = [];

  settled.forEach((r, i) => {
    const key = active[i];
    if (r.status === "fulfilled") {
      perSource[key] = r.value.length;
      results.push(...r.value);
    } else {
      perSource[key] = 0;
      errors.push({ source: key, message: String(r.reason?.message || r.reason) });
    }
  });

  // Kaynak-içi normalize edilmiş trend skorunu ekle ve sırala.
  normalizeBySource(results);
  results.sort((a, b) => b.engagement - a.engagement);

  // Çapraz kaynak basit deduplikasyon (skoru en yükseği tutulur).
  const seen = new Map();
  const merged = [];
  for (const item of results) {
    const key = dedupeKey(item.title);
    if (key && seen.has(key)) {
      const existing = seen.get(key);
      existing.alsoOn = existing.alsoOn || [];
      if (!existing.alsoOn.includes(item.source)) existing.alsoOn.push(item.source);
      continue;
    }
    if (key) seen.set(key, item);
    merged.push(item);
  }

  return {
    topic,
    days,
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    perSource,
    errors,
    total: merged.length,
    topPicks: merged.slice(0, 5).map((i) => ({
      title: i.title,
      source: i.source,
      url: i.url,
      engagement: i.engagement,
    })),
    results: merged,
  };
}

module.exports = { research, rawEngagement };
