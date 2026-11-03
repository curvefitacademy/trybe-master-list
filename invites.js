// My Invites: members sync their own Trybe brand invites with a bookmark button and compare them.
// The invites are read inside the member's own Trybe tab and passed here with postMessage.
// Nothing about their Trybe login reaches this site, and the invites are kept only in this browser.
(function () {
  const SITE = 'https://trybe-master-list.vercel.app';
  const TRYBE = /^https:\/\/(www\.)?jointrybe\.com$/;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const n = (v) => (v == null ? '' : Number(v).toLocaleString('en-US'));
  const money = (v) => (v >= 1e6 ? '$' + (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M+' : v >= 1000 ? '$' + Math.round(v / 1000) + 'K+' : '');
  const bkey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const TTS = { Y: 'Yes', F: 'Not found', U: 'Not verified', A: 'App/Digital' };
  const TYPES = { PERCENTAGE_GMV: '% of sales (GMV)', META_ANALYTICS: '% of ad spend', FLAT_PER_APPROVED_SUBMISSION: '$ per video', FLAT_PER_ORDER: '$ per order' };
  const dash = '<span class="dash">—</span>';

  // ---------------------------------------------------------------- the bookmark button
  const BOOKMARKLET = `(async()=>{const S='${SITE}';if(!/(^|\\.)jointrybe\\.com$/.test(location.hostname)){alert('Open jointrybe.com and log in first, then tap this bookmark there.');return}
const keys=['sb-sup-auth-token'].concat(Object.keys(localStorage).filter(k=>/^sb-.*auth-token$/.test(k)&&k!=='sb-sup-auth-token'));
const toks=keys.map(k=>{try{return JSON.parse(localStorage.getItem(k)||'{}').access_token}catch(e){return null}}).filter(Boolean);
if(!toks.length){alert('Please log in to Trybe first, then tap this bookmark again.');return}
const w=window.open(S+'/#invites','tbml_invites');if(!w){alert('Your browser blocked the window. Allow pop-ups for jointrybe.com and tap the bookmark again.');return}
let inv=null,st=0;for(const t of toks){const r=await fetch('/backend/api/discovery/creators/me/invites',{headers:{authorization:'Bearer '+t}});st=r.status;if(r.ok){const j=await r.json();if(Array.isArray(j.data)){inv=j.data;break}}}
if(!inv){alert('Could not read your Trybe invites (error '+st+'). Refresh Trybe, make sure you are logged in, and tap the bookmark again.');return}
const out=inv.filter(x=>x.status==='PENDING').map(x=>({bi:x.brandId,pi:x.discoveryProfileId,b:(x.brand&&x.brand.name)||'',c:(x.categories||[]).join(', '),r:((x.program&&x.program.rules)||[]).filter(z=>z.isActive!==false).map(z=>({t:z.type,v:z.value,d:z.displayText,cap:z.maxEarningsPerSubmission})),m:(x.message||'').slice(0,600),at:x.createdAt}));
let tok=toks[0];const fresh=()=>{for(const k of keys){try{const t=JSON.parse(localStorage.getItem(k)||'{}').access_token;if(t)return t}catch(e){}}return tok};const get=async u=>{let r=await fetch(u,{headers:{authorization:'Bearer '+fresh()}});if(r.status===401){await new Promise(z=>setTimeout(z,4000));r=await fetch(u,{headers:{authorization:'Bearer '+fresh()}})}return r};const eb=v=>{const m=String(v||'').match(/\\$([0-9.]+)\\s*([KM])/i);return m?Math.round(parseFloat(m[1])*(m[2].toUpperCase()==='M'?1e6:1e3)):0};
let busy=false;const enrich=async(list)=>{if(busy)return;busy=true;let buf=[];for(let i=0;i<list.length;i++){if(w.closed)break;const[bi,pi]=list[i];let r;try{r=await get('/backend/api/discovery/brands/'+bi+'/profiles/'+pi+'?context=desktop')}catch(e){w.postMessage({tbmlProfilesErr:'network'},S);break}
if(r.status===404){continue}if(!r.ok){w.postMessage({tbmlProfilesErr:r.status},S);break}const j=await r.json();const d=j&&j.data;if(d&&d.brand){buf.push({b:d.brand.name,c:(d.categories||[]).join(', '),comm:((d.program&&d.program.rules)||[]).map(z=>z.displayText).filter(Boolean).join('; '),earn:eb(d.creatorEarningsBucket),cr:d.creatorCount,s30:d.submissionCount30d,sall:d.submissionCountTotal,score:d.trybeScore&&d.trybeScore.score,rating:d.reviewRating,rev:d.reviewCount,site:d.brand.websiteUrl||''})}
if(buf.length>=10||i===list.length-1){w.postMessage({tbmlProfiles:buf,done:i+1,total:list.length},S);buf=[]}await new Promise(z=>setTimeout(z,1500))}busy=false};
const msg={tbmlInvites:out,syncedAt:new Date().toISOString()};const h=e=>{if(e.origin!==S)return;if(e.data==='tbml-ready')w.postMessage(msg,S);if(e.data&&Array.isArray(e.data.tbmlEnrich))enrich(e.data.tbmlEnrich.slice(0,400))};window.addEventListener('message',h)})();`;

  // ---------------------------------------------------------------- storage (this browser only)
  const me = () => window.__tbmlMe || '';
  const keyFor = (e) => 'tbml_inv_' + (e || 'pending');
  function load() {
    try {
      const pend = localStorage.getItem(keyFor(''));
      if (pend && me()) { localStorage.setItem(keyFor(me()), pend); localStorage.removeItem(keyFor('')); }
      return JSON.parse(localStorage.getItem(keyFor(me())) || 'null');
    } catch (e) { return null; }
  }
  function save(v) { try { localStorage.setItem(keyFor(me()), JSON.stringify(v)); } catch (e) {} }

  // Clean what arrives so only expected, length-limited fields are kept.
  function clean(list) {
    if (!Array.isArray(list)) return [];
    const s = (x, m) => String(x ?? '').slice(0, m);
    return list.slice(0, 3000).map((x) => ({
      bi: /^[\w-]{8,64}$/.test(String(x && x.bi)) ? String(x.bi) : '', pi: /^[\w-]{8,64}$/.test(String(x && x.pi)) ? String(x.pi) : '',
      b: s(x && x.b, 120), c: s(x && x.c, 300), m: s(x && x.m, 600), at: s(x && x.at, 40),
      r: (Array.isArray(x && x.r) ? x.r : []).slice(0, 6).map((z) => ({ t: s(z && z.t, 40), v: s(z && z.v, 20), d: s(z && z.d, 200), cap: z && z.cap != null ? s(z.cap, 20) : null })),
    })).filter((x) => x.b);
  }

  // ---------------------------------------------------------------- receive from the Trybe tab
  let got = false;
  if (location.hash === '#invites' && window.opener) {
    let tries = 0;
    const ping = setInterval(() => {
      if (got || tries++ > 60) return clearInterval(ping);
      ['https://jointrybe.com', 'https://www.jointrybe.com'].forEach((o) => { try { window.opener.postMessage('tbml-ready', o); } catch (e) {} });
    }, 500);
  }
  window.addEventListener('message', (e) => {
    if (!TRYBE.test(e.origin) || !e.data || !Array.isArray(e.data.tbmlInvites)) return;
    got = true;
    try { e.source.postMessage('tbml-got', e.origin); } catch (err) {}
    save({ syncedAt: String(e.data.syncedAt || new Date().toISOString()).slice(0, 40), items: clean(e.data.tbmlInvites) });
    const src = e.source, org = e.origin;
    whenReady(() => { const t = $('t-inv'); if (t) t.click(); render(); askEnrich(src, org); });
  });
  window.addEventListener('message', (e) => {
    if (!TRYBE.test(e.origin) || !e.data) return;
    if (e.data.tbmlProfilesErr != null) { ENR.err = true; enrichMsg(); return; }
    if (!Array.isArray(e.data.tbmlProfiles)) return;
    ENR.done = Math.min(+e.data.done || 0, ENR.total); ENR.added += addProfiles(e.data.tbmlProfiles);
    enrichMsg(); if (ENR.done >= ENR.total) { ENR.finished = true; enrichMsg(); render(); }
  });

  // ---------------------------------------------------------------- fill in private invite brands
  const ENR = { total: 0, done: 0, added: 0, err: false, finished: false };
  const STALE = 7 * 864e5;
  function askEnrich(src, org) {
    const data = load(); if (!data || !data.items) return;
    const BY = new Map((window.__tbmlD || []).map((d) => [bkey(d.brand), d]));
    const seen = new Set(), need = [];
    data.items.forEach((x) => {
      if (!x.bi || !x.pi || seen.has(x.bi)) return; seen.add(x.bi);
      const d = BY.get(bkey(x.b));
      if (!d || (d.priv && !(Date.now() - Date.parse(d.pbAt) < STALE))) need.push([x.bi, x.pi]);
    });
    if (!data.items.some((x) => x.bi)) { $('invEnrich').hidden = false; $('invEnrich').textContent = 'Drag the updated Sync button below to your bookmarks bar (replace the old one) so it can also fill in data for private invite brands.'; return; }
    if (!need.length) return;
    Object.assign(ENR, { total: Math.min(need.length, 400), done: 0, added: 0, err: false, finished: false });
    enrichMsg();
    try { src.postMessage({ tbmlEnrich: need.slice(0, 400) }, org); } catch (err) {}
  }
  function enrichMsg() {
    const el = $('invEnrich'); if (!el || !ENR.total) return;
    el.hidden = false;
    const mins = Math.max(1, Math.round(((ENR.total - ENR.done) * 1.6) / 60));
    el.textContent = ENR.err ? `Trybe stopped answering after ${ENR.done} of ${ENR.total} brands, so the rest will fill in next time you sync.`
      : ENR.finished ? `Done: added data for ${ENR.added} private invite brands to the master list. Thanks for helping every member.`
      : `Filling in data for ${ENR.total} brands that aren't public on Trybe: ${ENR.done} of ${ENR.total} done (about ${mins} min left). Keep your Trybe tab open.`;
  }
  function addProfiles(list) {
    const D = window.__tbmlD; if (!D || !Array.isArray(list)) return 0;
    const BY = new Map(D.map((d) => [bkey(d.brand), d])); const send = []; let added = 0;
    const s = (x, m) => String(x ?? '').slice(0, m); const num = (v) => (v == null || v === '' || isNaN(+v) ? null : +v);
    list.slice(0, 50).forEach((x) => {
      const b = s(x && x.b, 120).trim(); if (!b) return;
      const site = s(x.site, 200).replace(/^https?:\/\//i, '').replace(/\/+$/, '');
      const row = { b, c: s(x.c, 300), comm: s(x.comm, 300), earn: num(x.earn) || 0, cr: num(x.cr), s30: num(x.s30), sall: num(x.sall), score: num(x.score), rating: num(x.rating), rev: num(x.rev), site };
      const cur = BY.get(bkey(b));
      if (cur && !cur.priv) return; // already public in the master list
      send.push(row);
      const cm = row.comm.toLowerCase();
      const obj = { i: cur ? cur.i : D.length, brand: b, tts: cur ? cur.tts : 'U', cat: row.c, comm: row.comm, earn: row.earn, cr: row.cr, epc: row.earn > 0 && row.cr > 0 ? row.earn / row.cr : null,
        s30: row.s30, sall: row.sall, score: row.score, rating: row.rating, rev: row.rev, site, cap: cm.includes('max') && cm.includes('per submission'), key: (b + ' ' + row.c).toLowerCase(), priv: true, pbAt: new Date().toISOString() };
      if (cur) Object.assign(cur, obj); else { D.push(obj); added++; }
    });
    if (send.length) contribute(send);
    return added;
  }
  async function contribute(rows) {
    try {
      const k = Object.keys(localStorage).find((x) => /^sb-.*-auth-token$/.test(x)); const tok = k && JSON.parse(localStorage.getItem(k)).access_token;
      if (!tok) return;
      await fetch('/api/contribute-brands', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ brands: rows }) });
    } catch (err) {}
  }
  function whenReady(fn) {
    const ok = () => window.__tbmlD && $('v-app') && !$('v-app').hidden;
    if (ok()) return fn();
    let i = 0; const t = setInterval(() => { if (ok() || i++ > 240) { clearInterval(t); if (ok()) fn(); } }, 250);
  }
  if (location.hash === '#invites') whenReady(() => { const t = $('t-inv'); if (t) t.click(); });

  // ---------------------------------------------------------------- build rows
  function rows(data) {
    const BY = new Map((window.__tbmlD || []).map((d) => [bkey(d.brand), d]));
    return data.items.map((x, i) => {
      const d = BY.get(bkey(x.b));
      const r0 = x.r[0] || {};
      const caps = x.r.map((z) => (z.cap == null ? null : +z.cap)).filter((v) => v > 0);
      const pct = r0.t === 'PERCENTAGE_GMV' || r0.t === 'META_ANALYTICS';
      return {
        i, brand: x.b, cat: x.c || (d ? d.cat : ''), msg: x.m, at: x.at,
        pay: x.r.map((z) => z.d).filter(Boolean).join('; ') || (d ? d.comm : ''),
        type: TYPES[r0.t] || 'Other', rate: r0.v != null && r0.v !== '' ? +r0.v : null, pct,
        cap: caps.length ? Math.max(...caps) : null,
        priv: !d || !!d.priv, nodata: !d, earn: d ? d.earn : null, cr: d ? d.cr : null, epc: d ? d.epc : null, score: d ? d.score : null,
        tts: d ? d.tts : null, s30: d ? d.s30 : null,
        key: (x.b + ' ' + x.c + ' ' + x.m).toLowerCase(),
      };
    });
  }

  // ---------------------------------------------------------------- render
  const COLS = [['brand', 'Brand', 0], ['pay', 'Pay', 0], ['cap', 'Cap per video', 1], ['earn', 'Creator Earnings', 1], ['cr', 'Creators', 1], ['epc', 'Earnings / Creator', 1], ['score', 'Trybe Score', 1], ['tts', 'TikTok Shop', 0], ['cat', 'Categories', 0], ['at', 'Invited', 1]];
  let R = [], sortKey = 'earn', dir = -1, limit = 100; const CMP = new Set();
  const scoreCls = (s) => (s >= 80 ? 's-hi' : s < 40 ? 's-lo' : 's-mid');
  const fmtDate = (s) => { const t = Date.parse(s); return isNaN(t) ? '' : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };

  function render() {
    const box = $('p-inv'); if (!box) return;
    const data = load();
    $('invBm').setAttribute('href', 'javascript:' + encodeURIComponent(BOOKMARKLET));
    $('invEmpty').hidden = !!(data && data.items);
    $('invHas').hidden = !(data && data.items);
    if (!data || !data.items) return;
    R = rows(data);
    $('invSynced').textContent = `Last synced ${fmtDate(data.syncedAt)} · ${n(R.length)} open invites`;
    const priv = R.filter((r) => r.priv).length, paying = R.filter((r) => r.earn >= 10000).length, shop = R.filter((r) => r.tts === 'Y').length, nocap = R.filter((r) => !r.cap).length;
    $('invStats').innerHTML = [[n(R.length), 'open invites'], [n(paying), 'brands that paid creators $10K+'], [n(shop), 'confirmed on TikTok Shop'], [n(priv), 'private invites (not public on Trybe)'], [n(nocap), 'with no per-video cap']]
      .map(([b, s]) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`).join('');
    const sel = $('invCat'), keep = sel.value, cats = new Map();
    R.forEach((r) => r.cat.split(', ').forEach((c) => { c = c.trim(); if (c) cats.set(c, (cats.get(c) || 0) + 1); }));
    sel.innerHTML = '<option value="">All niches</option>' + [...cats.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([c, k]) => `<option value="${esc(c)}">${esc(c)} (${k})</option>`).join('');
    sel.value = cats.has(keep) ? keep : '';
    draw();
  }

  function filtered() {
    const q = $('invQ').value.trim().toLowerCase(), c = $('invCat').value, t = $('invType').value;
    const shop = $('invShop').checked, nocap = $('invNoCap').checked, priv = $('invPriv').checked, paid = $('invPaid').checked;
    return R.filter((r) => (!q || r.key.includes(q)) && (!c || r.cat.split(', ').includes(c)) && (!t || r.type === t) &&
      (!shop || r.tts === 'Y') && (!nocap || !r.cap) && (!priv || r.priv) && (!paid || r.earn > 0));
  }
  function cmp(a, b) {
    let x = a[sortKey], y = b[sortKey];
    if (sortKey === 'pay') { x = a.rate; y = b.rate; if (a.type !== b.type) return a.type.localeCompare(b.type); }
    if (sortKey === 'at') { x = Date.parse(a.at) || null; y = Date.parse(b.at) || null; }
    if (sortKey === 'cap') { x = a.cap == null ? Infinity : a.cap; y = b.cap == null ? Infinity : b.cap; }
    const nx = x == null || x === '', ny = y == null || y === '';
    if (nx && ny) return a.i - b.i; if (nx) return 1; if (ny) return -1;
    if (typeof x === 'string') return dir * x.localeCompare(y); return dir * (x - y) || a.i - b.i;
  }
  function draw() {
    $('invHead').innerHTML = '<th class="starcell"></th><th class="cmpcell">Compare</th>' + COLS.map(([k, l, num]) => `<th class="${num ? 'num' : ''} ${k === sortKey ? 'sorted' : ''}"><button type="button" data-k="${k}">${l}${k === sortKey ? (dir < 0 ? ' ↓' : ' ↑') : ''}</button></th>`).join('');
    const list = filtered().sort(cmp), FAV = window.__tbmlFAV || new Set();
    $('invCount').innerHTML = `Showing <b>${n(Math.min(limit, list.length))}</b> of <b>${n(list.length)}</b> invites`;
    $('invBody').innerHTML = list.slice(0, limit).map((r) => {
      const on = FAV.has(r.brand);
      return `<tr>
      <td class="starcell">${r.nodata ? '' : `<button type="button" class="star" data-fav="${esc(r.brand)}" aria-pressed="${on}" aria-label="${on ? 'Remove from favorites' : 'Add to favorites'}">${on ? '★' : '☆'}</button>`}</td>
      <td class="cmpcell"><input type="checkbox" class="invcmp" data-i="${r.i}" ${CMP.has(r.i) ? 'checked' : ''} aria-label="Compare ${esc(r.brand)}"></td>
      <td class="brand">${esc(r.brand)}${r.priv ? '<span class="privbadge" title="Not publicly listed in Trybe Discover">Private invite</span>' : ''}</td>
      <td class="comm">${r.cap ? `<span class="cap">${esc(r.pay)}</span>` : esc(r.pay)}</td>
      <td class="num">${r.cap ? '$' + n(r.cap) : '<span class="nocap">No cap</span>'}</td>
      <td class="num">${r.earn >= 100000 ? `<span class="big">${money(r.earn)}</span>` : r.earn > 0 ? money(r.earn) : r.nodata ? dash : '<span class="new">New</span>'}</td>
      <td class="num">${r.cr ? n(r.cr) : dash}</td>
      <td class="num">${r.epc ? '$' + n(Math.round(r.epc)) : dash}</td>
      <td class="num">${r.score != null && r.score !== '' ? `<span class="score ${scoreCls(r.score)}">${r.score}</span>` : dash}</td>
      <td>${r.tts ? `<span class="pill p-${esc(r.tts)}">${TTS[r.tts] || 'Not verified'}</span>` : dash}</td>
      <td class="cat">${esc(r.cat)}</td>
      <td class="num">${fmtDate(r.at)}</td></tr>`;
    }).join('') || '<tr><td colspan="12" style="padding:28px;text-align:center;color:var(--muted)">No invites match those filters.</td></tr>';
    $('invMore').hidden = list.length <= limit;
    drawCompare();
  }

  function drawCompare() {
    const picked = R.filter((r) => CMP.has(r.i));
    $('invCmpBar').hidden = picked.length === 0;
    $('invCmpN').textContent = picked.length;
    const box = $('invCmp');
    if (picked.length < 2) { box.hidden = true; box.innerHTML = ''; return; }
    const best = (f, hi = true) => { const v = picked.map(f).filter((x) => x != null && !isNaN(x)); return v.length >= 2 ? (hi ? Math.max(...v) : Math.min(...v)) : null; };
    const bEarn = best((r) => r.earn), bEpc = best((r) => r.epc), bScore = best((r) => r.score), bCr = best((r) => r.cr, false);
    const sameType = new Set(picked.map((r) => r.type)).size === 1, bRate = sameType ? best((r) => r.rate) : null;
    const hl = (cond, html) => (cond ? `<span class="win">${html}</span>` : html);
    box.hidden = false;
    box.innerHTML = picked.map((r) => `<article class="cmpcard">
      <header><b>${esc(r.brand)}</b><button type="button" class="linky" data-uncmp="${r.i}" aria-label="Remove ${esc(r.brand)} from comparison">Remove</button></header>
      ${r.priv ? '<span class="privbadge">Private invite</span>' : ''}
      <dl>
        <dt>Pay</dt><dd>${hl(sameType && r.rate === bRate, esc(r.pay))}</dd>
        <dt>Pay type</dt><dd>${esc(r.type)}</dd>
        <dt>Cap per video</dt><dd>${r.cap ? '$' + n(r.cap) : '<span class="win">No cap</span>'}</dd>
        <dt>Creator earnings</dt><dd>${r.earn > 0 ? hl(r.earn === bEarn, money(r.earn)) : r.nodata ? 'Not available yet' : 'New program'}</dd>
        <dt>Creators</dt><dd>${r.cr ? hl(r.cr === bCr, n(r.cr) + (r.cr === bCr ? ' (least competition)' : '')) : '—'}</dd>
        <dt>Earnings / creator</dt><dd>${r.epc ? hl(r.epc === bEpc, '$' + n(Math.round(r.epc))) : '—'}</dd>
        <dt>Trybe Score</dt><dd>${r.score != null && r.score !== '' ? hl(r.score === bScore, String(r.score)) : '—'}</dd>
        <dt>Videos (30 days)</dt><dd>${r.s30 != null ? n(r.s30) : '—'}</dd>
        <dt>TikTok Shop</dt><dd>${r.tts ? TTS[r.tts] : '—'}</dd>
        <dt>Niche</dt><dd>${esc(r.cat) || '—'}</dd>
        <dt>Invited</dt><dd>${fmtDate(r.at) || '—'}</dd>
      </dl>
      ${r.msg ? `<details><summary>Brand's message</summary><p>${esc(r.msg)}</p></details>` : ''}
    </article>`).join('');
  }

  // ---------------------------------------------------------------- events
  document.addEventListener('click', (e) => {
    const h = e.target.closest('#invHead button[data-k]');
    if (h) { const k = h.dataset.k; if (k === sortKey) dir = -dir; else { sortKey = k; dir = COLS.find((c) => c[0] === k)[2] ? -1 : 1; if (k === 'cap') dir = -1; } limit = 100; draw(); return; }
    const u = e.target.closest('[data-uncmp]'); if (u) { CMP.delete(+u.dataset.uncmp); draw(); return; }
    if (e.target.id === 'invMore') { limit += 100; draw(); return; }
    if (e.target.id === 'invCmpClear') { CMP.clear(); draw(); return; }
    if (e.target.id === 'invCmpGo') { $('invCmp').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (e.target.id === 'invClear') { try { localStorage.removeItem(keyFor(me())); } catch (err) {} CMP.clear(); render(); return; }
    if (e.target.closest('#invBm')) { e.preventDefault(); $('invBmTip').hidden = false; }
  });
  document.addEventListener('change', (e) => {
    if (e.target.classList && e.target.classList.contains('invcmp')) {
      const i = +e.target.dataset.i;
      if (e.target.checked) { if (CMP.size >= 4) { e.target.checked = false; $('invCmpMsg').hidden = false; setTimeout(() => ($('invCmpMsg').hidden = true), 2500); return; } CMP.add(i); } else CMP.delete(i);
      drawCompare();
    }
  });
  ['invQ', 'invCat', 'invType', 'invShop', 'invNoCap', 'invPriv', 'invPaid'].forEach((id) => { const el = $(id); if (el) el.addEventListener('input', () => { limit = 100; draw(); }); });

  window.__tbmlInv = { render };
})();
