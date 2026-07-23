# ◷ last30days

Bir konuyu **Hacker News, Reddit ve GitHub** üzerinde son 30 günde (ya da seçtiğin aralıkta) tarayıp, sonuçları editör seçkisiyle değil **gerçek etkileşimle** (oy / yorum / yıldız) sıralayan küçük bir araştırma uygulaması.

[mvanhorn/last30days-skill](https://github.com/mvanhorn/last30days-skill) projesinin fikrinden ilham alınmıştır; burada **hem yerelde hem webde çalışan, tek tıkla kurulan** bir web uygulamasına dönüştürülmüştür.

![tema](https://img.shields.io/badge/tema-açık%20%2F%20koyu-6d8bff) ![bağımlılık](https://img.shields.io/badge/bağımlılık-yok-34d399) ![node](https://img.shields.io/badge/node-%E2%89%A518-339933)

## Özellikler

- 🔎 **Çok kaynaklı arama** — HN + Reddit + GitHub aynı anda, paralel.
- ⚡ **Etkileşim sıralaması** — oy ve yorumları logaritmik tek skora indirger.
- 🔗 **Çapraz kaynak birleştirme** — aynı haber farklı platformlarda tekrar etmez.
- 🗂️ **Filtreler** — zaman aralığı (7g / 30g / 90g / 1y), kaynak seç, sıralama ölçütü.
- 🌗 **Açık / koyu tema** (tercih tarayıcıda saklanır).
- ⬇️ **HTML olarak dışa aktar** + **özeti panoya kopyala** (Slack / e-posta için).
- 📦 **Sıfır bağımlılık** — sadece Node'un yerleşik modülleri. `npm install` gerekmez.

## Yerelde çalıştırma

Tek gereksinim: **Node.js 18+** (Node 24 ile test edildi).

```bash
cd last30days
node server.js
```

Sonra tarayıcıda aç: **http://localhost:3000**

> İsteğe bağlı: `npm run dev` dosya değişikliklerinde sunucuyu otomatik yeniden başlatır.

### GitHub limitini artırmak (opsiyonel)

Anonim GitHub araması saatte 60 istekle sınırlıdır. Daha fazlası için:

1. `.env.example` dosyasını `.env` olarak kopyala.
2. [github.com/settings/tokens](https://github.com/settings/tokens) adresinden izinsiz (scope'suz) bir token oluştur.
3. `.env` içine `GITHUB_TOKEN=...` yapıştır. Uygulama bunu otomatik okur.

## Webde yayınlama

Uygulama standart bir Node HTTP sunucusudur; çoğu platforma olduğu gibi yüklenir.

| Platform | Adım |
|---|---|
| **Render / Railway** | Yeni "Web Service" → repoyu bağla → Start komutu: `node server.js`. Port otomatik (`PORT` env) okunur. |
| **Fly.io** | `fly launch` → Node algılanır → deploy. |
| **Kendi VPS'in** | `node server.js` (arka planda `pm2 start server.js` ile). Önüne Nginx koyabilirsin. |

İsteğe bağlı `GITHUB_TOKEN` ortam değişkenini platformun panelinden ekleyebilirsin.

## Proje yapısı

```
last30days/
├── server.js          # Sıfır-bağımlılıklı HTTP sunucusu + statik servis
├── src/
│   ├── engine.js      # Paralel sorgu, skorlama, deduplikasyon, özet
│   └── sources.js     # HN / Reddit / GitHub fetcher'ları (ücretsiz API'ler)
├── public/
│   ├── index.html     # Arayüz
│   ├── style.css      # Tema + tasarım
│   ├── app.js         # Frontend mantığı
│   └── favicon.svg
├── package.json
└── .env.example
```

## API

Frontend olmadan da kullanabilirsin:

```
GET /api/search?topic=yapay+zeka&days=30&sources=hackernews,reddit,github&limit=20
GET /api/sources
```

`/api/search` JSON döner: `{ topic, days, perSource, topPicks, total, results[] }`.
Her sonuç: `{ source, title, url, score, comments, author, createdAt, engagement, ... }`.

## Yeni kaynak eklemek

[src/sources.js](src/sources.js) içine ortak formatta sonuç döndüren bir fonksiyon yaz ve `SOURCES` nesnesine ekle — frontend filtrelerini ve renkleri otomatik kurar. (Örn. Lobsters, Mastodon, dev.to herkese açık API'lerle eklenebilir.)

## Lisans

MIT
