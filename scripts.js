// Script maker: "Get script" on any Top 100 video shows what was said in it,
// "Break it down" labels every line (Hook, Open curiosity loop, Pain point 1, Benefit 2...),
// "Write my version" turns it into a script for the member's own product,
// and any of the three can be saved to Favorites > Scripts.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const bkey = (b) => String(b || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  const css = `
.vscript{margin-top:6px;justify-self:start;background:var(--accent);color:#fff;border:0;border-radius:999px;padding:5px 11px;font-size:12px;font-weight:800;cursor:pointer}
.smodal{position:fixed;inset:0;z-index:50;background:rgba(15,13,40,.55);display:grid;place-items:center;padding:16px}
.smodal[hidden]{display:none}
.sbox{background:var(--surface);color:var(--ink);border-radius:18px;max-width:760px;width:100%;max-height:calc(100vh - 32px);overflow:auto;padding:20px;display:grid;gap:12px;box-shadow:0 20px 60px rgba(0,0,0,.3)}
.sbox header{display:flex;justify-content:space-between;align-items:center;gap:10px}
.sbox h2{margin:0;font-size:18px}
.sbox .stext,.ssaved .stext{white-space:pre-wrap;background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:12px;font-size:14px;line-height:1.5;max-height:260px;overflow:auto}
.sbox label{display:grid;gap:4px;font-size:13px;font-weight:700}
.sbox input,.sbox textarea{border:1px solid var(--line);border-radius:10px;padding:9px 11px;background:var(--bg);color:var(--ink);font:inherit;font-weight:400}
.sbox textarea{min-height:70px;resize:vertical}
.srow{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.sclose{background:none;border:0;font-size:22px;cursor:pointer;color:var(--muted);line-height:1}
.ssave[aria-pressed="true"]{background:var(--green);color:var(--green-ink);border-color:transparent}
.beats{display:grid;gap:8px;margin:0;padding:0;list-style:none}
.beat{display:grid;grid-template-columns:150px 1fr;gap:10px;align-items:start;background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:10px 12px}
.beat p{margin:0;font-size:14px;line-height:1.5}
.beat .why{margin-top:4px;color:var(--muted);font-size:12px}
.blab{justify-self:start;padding:3px 9px;border-radius:999px;font-size:12px;font-weight:800;line-height:1.3;background:var(--chip);color:var(--ink)}
.blab.t-hook{background:var(--accent);color:#fff}
.blab.t-loop{background:#fde68a;color:#713f12}
.blab.t-pain{background:#fecaca;color:#7f1d1d}
.blab.t-ben{background:var(--green);color:var(--green-ink)}
.blab.t-cta{background:#1e1b4b;color:#fff}
.bsum{margin:0;font-size:14px;font-weight:700}
.btabs{display:flex;gap:6px}
.btabs button{border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:999px;padding:4px 11px;font-size:12px;font-weight:700;cursor:pointer}
.btabs button[aria-selected="true"]{background:var(--ink);color:var(--surface);border-color:transparent}
.ssaved{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));margin-top:8px}
.scard{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px;display:grid;gap:8px;align-content:start;min-width:0}
.scard header{display:flex;justify-content:space-between;gap:8px;align-items:start}
.scard header b{overflow-wrap:anywhere}
.stype{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:800;background:var(--chip);color:var(--ink);white-space:nowrap}
.scard details summary{cursor:pointer;font-size:13px;font-weight:700}
.scard .beats{margin-top:8px}
.scard .beat{grid-template-columns:1fr;gap:4px}
@media (max-width:560px){.beat{grid-template-columns:1fr;gap:4px}}
`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  const labClass = (l) => { l = String(l).toLowerCase(); return /hook/.test(l) ? 't-hook' : /curio|loop|tease/.test(l) ? 't-loop' : /pain|problem|struggl|objection/.test(l) ? 't-pain' : /benefit|result|demo|reveal|solution|proof/.test(l) ? 't-ben' : /cta|call to action/.test(l) ? 't-cta' : ''; };
  const beatsHtml = (lines) => `<ol class="beats">${lines.map((x) => `<li class="beat"><span class="blab ${labClass(x.label)}">${esc(x.label)}</span><div><p>${esc(x.text != null ? x.text : x.how)}</p>${x.why ? `<p class="why">${esc(x.why)}</p>` : ''}</div></li>`).join('')}</ol>`;
  const beatsText = (lines, key) => lines.map((x) => `${String(x.label).toUpperCase()}: ${x[key] || ''}`).join('\n\n');
  const fmtText = (bd) => (bd.summary ? 'FORMULA: ' + bd.summary + '\n\n' : '') + beatsText(bd.format, 'how');

  // ---------------------------------------------------------------- saved scripts (Favorites > Scripts)
  // Stored in the member's favorites table as brand = 's:' + JSON {k, id, b, u, p, x, at}
  //   k: 'o' original script (+ breakdown), 'f' format (template), 'm' my version
  let SAVED = []; const sb = () => window.__tbmlSb; const me = () => window.__tbmlMe;
  const TYPES = { o: 'Original script', f: 'Format', m: 'My version' };
  async function loadSaved() {
    if (!sb()) return;
    const { data, error } = await sb().from('favorites').select('brand,created_at').like('brand', 's:%');
    SAVED = [];
    if (!error && data) data.forEach((r) => { try { const o = JSON.parse(r.brand.slice(2)); o.raw = r.brand; SAVED.push(o); } catch (e) {} });
    renderSaved(); syncModalSaves();
  }
  document.addEventListener('tbml:favs', loadSaved);
  if (window.__tbmlSb && window.__tbmlMe) loadSaved();
  const findSaved = (k, id, p) => SAVED.find((s) => s.k === k && s.id === id && (k !== 'm' || s.p === p));
  async function saveItem(o) {
    o.at = new Date().toISOString();
    const raw = 's:' + JSON.stringify(o);
    const { error } = await sb().from('favorites').insert({ email: me(), brand: raw });
    if (error && !/duplicate/i.test(error.message)) throw new Error('Could not save. Please try again.');
    o.raw = raw; SAVED.push(o); renderSaved(); return o;
  }
  async function removeItem(o) {
    const { error } = await sb().from('favorites').delete().eq('email', me()).eq('brand', o.raw);
    if (error) throw new Error('Could not remove. Please try again.');
    SAVED = SAVED.filter((s) => s !== o); renderSaved();
  }

  function ensureSection() {
    if ($('favSGrid') || !$('favVGrid')) return !!$('favSGrid');
    const wrap = document.createElement('div');
    wrap.innerHTML = `<h2 class="fav-h">Scripts <span class="fav-count" id="favSCount"></span></h2>
      <div class="srow"><select id="favSType" aria-label="Script type"><option value="">All script types</option><option value="o">Original scripts</option><option value="f">Formats</option><option value="m">My versions</option></select></div>
      <p class="small" id="favSEmpty">No saved scripts yet. Tap Get script on any Top 100 video, then Save script, Save format or Save my version.</p>
      <div class="ssaved" id="favSGrid"></div>`;
    $('favVGrid').after(...wrap.childNodes);
    $('favSType').addEventListener('change', renderSaved);
    ['favQ', 'favBrand', 'favNiche', 'favSort'].forEach((id) => $(id) && $(id).addEventListener(id === 'favQ' ? 'input' : 'change', renderSaved));
    $('favSGrid').addEventListener('click', onSavedClick);
    return true;
  }
  function savedText(o) {
    const x = o.x || {};
    if (o.k === 'f') return fmtText(x);
    if (o.k === 'm') return x.script || '';
    return x.lines && x.lines.length ? beatsText(x.lines, 'text') : (x.text || '');
  }
  function renderSaved() {
    if (!ensureSection()) return;
    const q = ($('favQ') || {}).value ? $('favQ').value.trim().toLowerCase() : '';
    const fb = ($('favBrand') || {}).value || '', fn = ($('favNiche') || {}).value || '', ft = $('favSType').value, sort = ($('favSort') || {}).value || '';
    const BY = new Map((window.__tbmlD || []).map((d) => [bkey(d.brand), d]));
    let list = SAVED.filter((o) => {
      if (ft && o.k !== ft) return false;
      if (fb && bkey(fb) !== bkey(o.b)) return false;
      const d = BY.get(bkey(o.b));
      if (fn && !(d && String(d.cat || '').toLowerCase().includes(fn.toLowerCase()))) return false;
      if (q && !(o.b + ' ' + (o.p || '') + ' ' + savedText(o)).toLowerCase().includes(q)) return false;
      return true;
    });
    list.sort(sort === 'brand' ? (a, b) => String(a.b).localeCompare(String(b.b)) : (a, b) => String(b.at).localeCompare(String(a.at)));
    $('favSCount').textContent = SAVED.length ? `(${SAVED.length})` : '';
    $('favSEmpty').hidden = SAVED.length > 0;
    $('favSGrid').innerHTML = list.map((o, i) => {
      const x = o.x || {}, idx = SAVED.indexOf(o);
      const body = o.k === 'f' ? (x.summary ? `<p class="bsum">${esc(x.summary)}</p>` : '') + beatsHtml((x.format || []).map((f) => ({ label: f.label, how: f.how })))
        : o.k === 'o' && x.lines && x.lines.length ? (x.summary ? `<p class="bsum">${esc(x.summary)}</p>` : '') + beatsHtml(x.lines)
        : `<div class="stext">${esc(o.k === 'm' ? x.script : x.text)}</div>`;
      return `<article class="scard" data-i="${idx}"><header><div><span class="stype">${TYPES[o.k] || 'Script'}</span><div><b>${esc(o.k === 'm' && o.p ? o.p : o.b)}</b></div><div class="small">${o.k === 'm' ? 'From a ' + esc(o.b) + ' Top 100 video · ' : ''}Saved ${esc(String(o.at || '').slice(0, 10))}</div></div></header>
        <details${list.length <= 2 ? ' open' : ''}><summary>${o.k === 'f' ? 'Show format' : 'Show script'}</summary>${body}</details>
        <div class="srow"><button class="btn ghost sm" type="button" data-act="copy">Copy</button>${o.u ? '<button class="btn ghost sm" type="button" data-act="open">Open video script</button>' : ''}<button class="linky danger" type="button" data-act="del">Remove</button></div></article>`;
    }).join('');
  }
  async function onSavedClick(e) {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const o = SAVED[+b.closest('.scard').dataset.i]; if (!o) return;
    if (b.dataset.act === 'copy') { copyText(savedText(o), b); }
    else if (b.dataset.act === 'open') { open({ dataset: { sid: o.id, vurl: o.u, brand: o.b } }); }
    else if (b.dataset.act === 'del') { b.disabled = true; try { await removeItem(o); } catch (err) { b.disabled = false; b.textContent = err.message; } syncModalSaves(); }
  }
  // Keep the section in place when the Favorites tab re-renders.
  new MutationObserver(() => { if ($('favVGrid') && !$('favSGrid')) renderSaved(); }).observe(document.body, { childList: true, subtree: true });

  // ---------------------------------------------------------------- "Get script" buttons on video cards
  const addButtons = (root) => root.querySelectorAll('.vcard').forEach((card) => {
    if (card.querySelector('.vscript')) return;
    const v = card.querySelector('video'), star = card.querySelector('.vstar');
    if (!v || !star) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'vscript'; b.textContent = 'Get script';
    b.dataset.sid = star.dataset.vid; b.dataset.vurl = v.getAttribute('src') || '';
    b.dataset.brand = (card.querySelector('.vmeta b') || {}).textContent || '';
    card.querySelector('.vmeta').appendChild(b);
  });
  new MutationObserver(() => ['topGrid', 'favVGrid'].forEach((id) => $(id) && addButtons($(id)))).observe(document.body, { childList: true, subtree: true });

  // ---------------------------------------------------------------- modal
  let modal, cur = null;
  const copyText = (text, btn) => { navigator.clipboard && navigator.clipboard.writeText(text); const t = btn.textContent; btn.textContent = 'Copied!'; setTimeout(() => (btn.textContent = t), 1200); };
  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement('div'); modal.className = 'smodal'; modal.hidden = true;
    modal.innerHTML = `<div class="sbox" role="dialog" aria-modal="true" aria-labelledby="sTitle">
      <header><h2 id="sTitle">Script</h2><button class="sclose" type="button" aria-label="Close">×</button></header>
      <div class="small" id="sSub"></div>
      <div class="stext" id="sText">Loading…</div>
      <div class="srow"><button class="btn ghost sm" type="button" id="sCopyT">Copy original script</button><button class="btn ghost sm ssave" type="button" id="sSaveO" aria-pressed="false">☆ Save script</button><button class="btn sm" type="button" id="sBd">Break it down</button></div>
      <div id="sBdBox" hidden>
        <h2>Line-by-line breakdown</h2>
        <p class="bsum" id="sBdSum"></p>
        <div class="btabs" role="tablist"><button type="button" role="tab" id="sBdTabL" aria-selected="true">This video's lines</button><button type="button" role="tab" id="sBdTabF" aria-selected="false">Reusable format</button></div>
        <div id="sBdLines" style="margin-top:8px"></div>
        <div class="srow" style="margin-top:8px"><button class="btn ghost sm" type="button" id="sCopyB">Copy breakdown</button><button class="btn ghost sm" type="button" id="sCopyF">Copy format</button><button class="btn ghost sm ssave" type="button" id="sSaveF" aria-pressed="false">☆ Save format</button></div>
      </div>
      <h2>Write my version</h2>
      <p class="small" style="margin:0">Keeps this video's hook, structure and pacing, written for your product.</p>
      <label>Your product <input id="sProd" maxlength="120" placeholder="e.g. Hydration packets by Taste Salud"></label>
      <label>What it does / key points <textarea id="sPts" maxlength="800" placeholder="e.g. 3x electrolytes, no sugar, tastes like lemonade, travel friendly"></textarea></label>
      <label>Anything else? (optional) <input id="sNotes" maxlength="500" placeholder="e.g. I'm a mom of 3, filming in my car, keep it under 30 seconds"></label>
      <div class="srow"><button class="btn sm" type="button" id="sGo">Write my script</button><span class="small" id="sLeft"></span></div>
      <div class="msg err" id="sErr" hidden></div>
      <div id="sOut" hidden><div class="stext" id="sScript"></div><div class="srow" style="margin-top:8px"><button class="btn ghost sm" type="button" id="sCopyS">Copy my script</button><button class="btn ghost sm ssave" type="button" id="sSaveM" aria-pressed="false">☆ Save my version</button><button class="btn ghost sm" type="button" id="sAgain">Write another version</button></div></div>
    </div>`;
    document.body.appendChild(modal);
    const close = () => { modal.hidden = true; cur = null; };
    modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('.sclose')) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });
    $('sCopyT').onclick = (e) => copyText($('sText').textContent, e.target);
    $('sCopyS').onclick = (e) => copyText($('sScript').textContent, e.target);
    $('sCopyB').onclick = (e) => cur && cur.bd && copyText(beatsText(cur.bd.lines, 'text'), e.target);
    $('sCopyF').onclick = (e) => cur && cur.bd && copyText(fmtText(cur.bd), e.target);
    $('sBdTabL').onclick = () => showBd('l'); $('sBdTabF').onclick = () => showBd('f');
    $('sBd').onclick = breakdown;
    $('sGo').onclick = write; $('sAgain').onclick = write;
    $('sSaveO').onclick = (e) => toggleSave('o', e.target);
    $('sSaveF').onclick = (e) => toggleSave('f', e.target);
    $('sSaveM').onclick = (e) => toggleSave('m', e.target);
    return modal;
  }
  const token = () => { try { const k = Object.keys(localStorage).find((x) => /^sb-.*-auth-token$/.test(x)); return k && JSON.parse(localStorage.getItem(k)).access_token; } catch (e) { return null; } };
  async function call(body) {
    const r = await fetch('/api/script', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() }, body: JSON.stringify(body) });
    let j = {}; try { j = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error(j.error || 'Something went wrong. Please try again.');
    return j;
  }
  function err(t) { $('sErr').textContent = t || ''; $('sErr').hidden = !t; }

  function setSaveBtn(btn, on, label) { btn.setAttribute('aria-pressed', on); btn.textContent = (on ? '★ Saved ' : '☆ Save ') + label; }
  function syncModalSaves() {
    if (!modal || !cur) return;
    setSaveBtn($('sSaveO'), !!findSaved('o', cur.id), 'script'); $('sSaveO').disabled = !cur.text;
    setSaveBtn($('sSaveF'), !!findSaved('f', cur.id), 'format');
    setSaveBtn($('sSaveM'), !!(cur.mine && findSaved('m', cur.id, cur.mine.p) && findSaved('m', cur.id, cur.mine.p).x.script === cur.mine.script), 'my version');
  }
  async function toggleSave(k, btn) {
    if (!cur || !sb()) { err('Please refresh the page and try again.'); return; }
    err(''); btn.disabled = true;
    try {
      const have = k === 'm' ? SAVED.find((s) => s.k === 'm' && s.id === cur.id && cur.mine && s.x.script === cur.mine.script) : findSaved(k, cur.id);
      if (have) await removeItem(have);
      else {
        const base = { k, id: cur.id, b: cur.brand, u: cur.url };
        if (k === 'o') base.x = { text: cur.text, summary: cur.bd ? cur.bd.summary : '', lines: cur.bd ? cur.bd.lines : null };
        if (k === 'f') base.x = { summary: cur.bd.summary, format: cur.bd.format };
        if (k === 'm') { base.p = cur.mine.p; base.x = { script: cur.mine.script }; }
        await saveItem(base);
      }
    } catch (e2) { err(e2.message); }
    btn.disabled = false; syncModalSaves();
  }

  async function open(btn) {
    ensureModal(); cur = { id: btn.dataset.sid, url: btn.dataset.vurl, brand: btn.dataset.brand, text: '', bd: null, mine: null };
    $('sTitle').textContent = 'Script: ' + cur.brand; $('sSub').textContent = 'What the creator says in this Top 100 video.';
    $('sText').textContent = 'Pulling the script from the video… (first time takes about 10 seconds)'; $('sOut').hidden = true; $('sBdBox').hidden = true; $('sBd').disabled = true; err(''); modal.hidden = false;
    syncModalSaves();
    const mine = cur;
    try {
      const j = await call({ mode: 'transcript', id: cur.id, url: cur.url });
      if (cur !== mine) return;
      cur.text = j.text || ''; $('sText').textContent = cur.text || '(No speech found in this video. It may be music or text on screen only.)';
      $('sBd').disabled = !cur.text;
      if (j.breakdown && j.breakdown.lines) { cur.bd = j.breakdown; drawBd(); }
      syncModalSaves();
    } catch (e) { if (cur === mine) { $('sText').textContent = ''; err(e.message); } }
  }
  function showBd(which) {
    $('sBdTabL').setAttribute('aria-selected', which === 'l'); $('sBdTabF').setAttribute('aria-selected', which === 'f');
    $('sBdLines').innerHTML = which === 'f' ? beatsHtml(cur.bd.format.map((f) => ({ label: f.label, how: f.how }))) : beatsHtml(cur.bd.lines);
  }
  function drawBd() {
    $('sBdSum').textContent = cur.bd.summary ? 'Formula: ' + cur.bd.summary : '';
    $('sBdBox').hidden = false; $('sBd').textContent = 'Breakdown below'; $('sBd').disabled = true; showBd('l');
  }
  async function breakdown() {
    if (!cur || !cur.text) return; err('');
    const b = $('sBd'), mine = cur; b.disabled = true; b.textContent = 'Breaking it down… (about 10 seconds)';
    try {
      const j = await call({ mode: 'breakdown', id: cur.id, url: cur.url });
      if (cur !== mine) return;
      if (!j.breakdown || !j.breakdown.lines) throw new Error('No speech to break down in this video.');
      cur.bd = j.breakdown; drawBd(); syncModalSaves();
      // An original saved before it had a breakdown gets upgraded in place.
      const o = findSaved('o', cur.id);
      if (o && !(o.x && o.x.lines)) { await removeItem(o); await saveItem({ k: 'o', id: cur.id, b: cur.brand, u: cur.url, x: { text: cur.text, summary: cur.bd.summary, lines: cur.bd.lines } }); syncModalSaves(); }
    } catch (e) { if (cur === mine) { err(e.message); b.disabled = false; b.textContent = 'Break it down'; } }
  }
  async function write() {
    if (!cur) return; err('');
    const product = $('sProd').value.trim(); if (!product) { err('Add your product name first.'); return; }
    const go = $('sGo'); go.disabled = true; go.textContent = 'Writing…';
    try {
      const j = await call({ mode: 'write', id: cur.id, url: cur.url, brand: cur.brand, product, points: $('sPts').value, notes: $('sNotes').value });
      $('sScript').textContent = j.script || ''; $('sOut').hidden = false;
      cur.mine = { p: product, script: j.script || '' };
      if (j.text) { cur.text = j.text; $('sText').textContent = j.text; }
      $('sLeft').textContent = j.left != null ? j.left + ' scripts left today' : '';
      syncModalSaves();
    } catch (e) { err(e.message); }
    go.disabled = false; go.textContent = 'Write my script';
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('.vscript'); if (b) open(b); });
})();
