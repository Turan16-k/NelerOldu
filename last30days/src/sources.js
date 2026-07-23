// src/sources.js
// Her kaynak için "fetcher". Hepsi ÜCRETSİZ ve API anahtarı gerektirmeyen
// uç noktalar kullanır. Sunucu tarafında çalıştığı için CORS sorunu yoktur.
//
// Her fetcher ortak bir formatta sonuç döndürür:
// { source, title, url, score, comments, author, createdAt(ISO), summary, thumbnail }

const UA = "last30days-app/1.0 (https://github.com/) research aggregator";

// Belirtilen gün sayısı kadar geriye giden Unix zaman damgası (saniye).
function sinceTimestamp(days) {
  return Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
}

// Güvenli JSON fetch — hata olursa boş döner, tüm uygulamayı çökertmez.
async function getJSON(url, headers = {}) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json", ...headers },
    // 12 sn timeout
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// ---------------------------------------------------------------- Hacker News
// Algolia HN Search API: tamamen ücretsiz, tarih filtreli.
async function hackerNews(topic, days, limit) {
  const since = sinceTimestamp(days);
  const url =
    `https://hn.algolia.com/api/v1/search_by_date` +
    `?query=${encodeURIComponent(topic)}` +
    `&tags=story&numericFilters=created_at_i>${since}&hitsPerPage=${limit}`;
  const data = await getJSON(url);
  return (data.hits || []).map((h) => ({
    source: "hackernews",
    title: h.title || h.story_title || "(başlıksız)",
    url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    score: h.points || 0,
    comments: h.num_comments || 0,
    author: h.author || null,
    createdAt: h.created_at || null,
    summary: "",
    thumbnail: null,
    discussionUrl: `https://news.ycombinator.com/item?id=${h.objectID}`,
  }));
}

// -------------------------------------------------------------------- Reddit
// Reddit'in herkese açık .json arama uç noktası (auth gerektirmez).
async function reddit(topic, days, limit) {
  // t=month ~ son 30 gün; daha geniş aralık için "year" kullanıp sonra filtreliyoruz.
  const t = days <= 31 ? "month" : days <= 366 ? "year" : "all";
  const url =
    `https://www.reddit.com/search.json` +
    `?q=${encodeURIComponent(topic)}&sort=top&t=${t}&limit=${limit}&type=link`;
  const data = await getJSON(url);
  const since = sinceTimestamp(days);
  return (data.data?.children || [])
    .map((c) => c.data)
    .filter((d) => d && d.created_utc >= since)
    .map((d) => ({
      source: "reddit",
      title: d.title,
      url: d.url_overridden_by_dest || `https://reddit.com${d.permalink}`,
      score: d.score || 0,
      comments: d.num_comments || 0,
      author: d.author ? `u/${d.author}` : null,
      createdAt: new Date(d.created_utc * 1000).toISOString(),
      summary: (d.selftext || "").slice(0, 280),
      thumbnail:
        d.thumbnail && d.thumbnail.startsWith("http") ? d.thumbnail : null,
      discussionUrl: `https://reddit.com${d.permalink}`,
      subreddit: d.subreddit_name_prefixed,
    }));
}

// ----------------------------------------------------------- Stack Exchange
// Stack Overflow araması: anonim kullanımda günde ~300 istek, anahtar gerekmez.
// Soru puanı + cevap sayısı güçlü bir "gerçek etkileşim" sinyalidir.
async function stackexchange(topic, days, limit) {
  const since = sinceTimestamp(days);
  const url =
    `https://api.stackexchange.com/2.3/search/advanced` +
    `?q=${encodeURIComponent(topic)}&site=stackoverflow` +
    `&sort=votes&order=desc&fromdate=${since}&pagesize=${limit}&filter=default`;
  const data = await getJSON(url);
  return (data.items || []).map((q) => ({
    source: "stackexchange",
    title: decodeEntities(q.title),
    url: q.link,
    score: q.score || 0,
    comments: q.answer_count || 0,
    author: q.owner?.display_name || null,
    createdAt: q.creation_date ? new Date(q.creation_date * 1000).toISOString() : null,
    summary: (q.tags || []).map((t) => `#${t}`).join(" "),
    thumbnail: null,
    discussionUrl: q.link,
  }));
}

// API yanıtlarındaki temel HTML varlıklarını çözer (StackExchange başlıkları için).
function decodeEntities(s = "") {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));
}

// -------------------------------------------------------------------- GitHub
// GitHub arama API'si: anonim 60 istek/saat. Opsiyonel GITHUB_TOKEN ile artar.
async function github(topic, days, limit) {
  const sinceDate = new Date(Date.now() - days * 86400000)
    .toISOString()
    .slice(0, 10);
  const url =
    `https://api.github.com/search/repositories` +
    `?q=${encodeURIComponent(topic)}+pushed:>${sinceDate}` +
    `&sort=stars&order=desc&per_page=${limit}`;
  const headers = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN)
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const data = await getJSON(url, headers);
  return (data.items || []).map((r) => ({
    source: "github",
    title: r.full_name,
    url: r.html_url,
    score: r.stargazers_count || 0,
    comments: r.open_issues_count || 0,
    author: r.owner?.login || null,
    createdAt: r.pushed_at || r.created_at || null,
    summary: r.description || "",
    thumbnail: r.owner?.avatar_url || null,
    discussionUrl: r.html_url,
    language: r.language,
  }));
}

// Kaynak kayıt defteri — frontend filtreleri buradan beslenir.
// defaultOn: false olan kaynaklar başlangıçta kapalı gelir.
// (Reddit, sunucu IP'lerini sık sık bot olarak engellediği için varsayılan kapalı;
//  engellemediği ağlarda/sunucularda elle açılabilir.)
const SOURCES = {
  hackernews: { label: "Hacker News", fn: hackerNews, color: "#ff6600", defaultOn: true },
  github: { label: "GitHub", fn: github, color: "#8957e5", defaultOn: true },
  stackexchange: { label: "Stack Overflow", fn: stackexchange, color: "#f48024", defaultOn: true },
  reddit: { label: "Reddit", fn: reddit, color: "#ff4500", defaultOn: false },
};

module.exports = { SOURCES };
