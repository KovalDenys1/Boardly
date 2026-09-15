// Submits every URL in the production sitemap to IndexNow (api.indexnow.org fans out to Bing,
// Yandex, Seznam and Naver). Runs after a Production deployment. The key file is
// public/<key>.txt, so keyLocation resolves on boardly.online. Google ignores IndexNow.
const HOST = 'boardly.online'
const KEY = process.env.INDEXNOW_KEY
if (!KEY) {
  console.log('INDEXNOW_KEY missing – skipped')
  process.exit(0)
}

const sitemap = await fetch(`https://${HOST}/sitemap.xml`).then((r) => r.text())
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => u.includes(HOST))
if (urls.length === 0) {
  console.log('no URLs found in sitemap – skipped')
  process.exit(0)
}

const res = await fetch('https://api.indexnow.org/IndexNow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: urls }),
})
console.log(`IndexNow: ${res.status} for ${urls.length} URLs`)
if (res.status >= 400 && res.status !== 429) process.exit(1)
