/** Small branded page for sign-in messages (errors, sign-in cancelled, setup problems). */
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function messagePage(title, message, { status = 200, primary, secondary } = {}) {
  const btn = (l, cls) => l ? `<a class="${cls}" href="${esc(l.href)}">${esc(l.label)}</a>` : '';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)} | Masjid Nuh</title><link rel="icon" href="/assets/mark.png">
<link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;600&family=Zilla+Slab:wght@600&display=swap" rel="stylesheet">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0D2B3A;color:#E9F1F1;font:16px/1.6 "Public Sans",system-ui,sans-serif;padding:24px;box-sizing:border-box}
main{max-width:440px;text-align:center}img{width:84px;margin:0 auto 22px;display:block}h1{font:600 2rem/1.15 "Zilla Slab",Georgia,serif;margin:0 0 12px;color:#fff}
p{color:#A9C1C6;margin:0}.row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:24px}a{text-decoration:none;font-weight:600;padding:12px 20px;border-radius:999px}
.primary{background:#D08A54;color:#1B1007}.ghost{border:1px solid rgba(255,255,255,.3);color:#E9F1F1}a:focus-visible{outline:3px solid #D08A54;outline-offset:3px}</style></head>
<body><main><img src="/assets/mark.png" alt=""><h1>${esc(title)}</h1><p>${esc(message)}</p>
<div class="row">${btn(primary, 'primary')}${btn(secondary, 'ghost')}</div></main></body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

/** Only allow redirects back to a path on this site. */
export function safeNext(next) {
  return typeof next === 'string' && /^\/(?!\/)[\w\-./?=&%#]*$/.test(next) ? next : '/admin/';
}
