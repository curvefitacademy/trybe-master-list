// Script maker: "Get script" on any Top 100 video shows what was said in it,
// and "Write my version" turns it into a script for the member's own product.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const css = `
.vscript{margin-top:6px;justify-self:start;background:var(--accent);color:#fff;border:0;border-radius:999px;padding:5px 11px;font-size:12px;font-weight:800;cursor:pointer}
.smodal{position:fixed;inset:0;z-index:50;background:rgba(15,13,40,.55);display:grid;place-items:center;padding:16px}
.smodal[hidden]{display:none}
.sbox{background:var(--surface);color:var(--ink);border-radius:18px;max-width:720px;width:100%;max-height:calc(100vh - 32px);overflow:auto;padding:20px;display:grid;gap:12px;box-shadow:0 20px 60px rgba(0,0,0,.3)}
.sbox header{display:flex;justify-content:space-between;align-items:center;gap:10px}
.sbox h2{margin:0;font-size:18px}
.sbox .stext{white-space:pre-wrap;background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:12px;font-size:14px;line-height:1.5;max-height:260px;overflow:auto}
.sbox label{display:grid;gap:4px;font-size:13px;font-weight:700}
.sbox input,.sbox textarea{border:1px solid var(--line);border-radius:10px;padding:9px 11px;background:var(--bg);color:var(--ink);font:inherit;font-weight:400}
.sbox textarea{min-height:70px;resize:vertical}
.srow{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.sclose{background:none;border:0;font-size:22px;cursor:pointer;color:var(--muted);line-height:1}
`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  // Add a "Get script" button to every Top 100 video card (and saved videos).
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

  let modal, cur = null;
  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement('div'); modal.className = 'smodal'; modal.hidden = true;
    modal.innerHTML = `<div class="sbox" role="dialog" aria-modal="true" aria-labelledby="sTitle">
      <header><h2 id="sTitle">Script</h2><button class="sclose" type="button" aria-label="Close">×</button></header>
      <div class="small" id="sSub"></div>
      <div class="stext" id="sText">Loading…</div>
      <div class="srow"><button class="btn ghost sm" type="button" id="sCopyT">Copy original script</button></div>
      <h2>Write my version</h2>
      <p class="small" style="margin:0">Keeps this video's hook, structure and pacing, written for your product.</p>
      <label>Your product <input id="sProd" maxlength="120" placeholder="e.g. Hydration packets by Taste Salud"></label>
      <label>What it does / key points <textarea id="sPts" maxlength="800" placeholder="e.g. 3x electrolytes, no sugar, tastes like lemonade, travel friendly"></textarea></label>
      <label>Anything else? (optional) <input id="sNotes" maxlength="500" placeholder="e.g. I'm a mom of 3, filming in my car, keep it under 30 seconds"></label>
      <div class="srow"><button class="btn sm" type="button" id="sGo">Write my script</button><span class="small" id="sLeft"></span></div>
      <div class="msg err" id="sErr" hidden></div>
      <div id="sOut" hidden><div class="stext" id="sScript"></div><div class="srow" style="margin-top:8px"><button class="btn ghost sm" type="button" id="sCopyS">Copy my script</button><button class="btn ghost sm" type="button" id="sAgain">Write another version</button></div></div>
    </div>`;
    document.body.appendChild(modal);
    const close = () => { modal.hidden = true; cur = null; };
    modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('.sclose')) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });
    const copy = (id, btn) => { navigator.clipboard && navigator.clipboard.writeText($(id).textContent); const t = btn.textContent; btn.textContent = 'Copied!'; setTimeout(() => (btn.textContent = t), 1200); };
    $('sCopyT').onclick = (e) => copy('sText', e.target);
    $('sCopyS').onclick = (e) => copy('sScript', e.target);
    $('sGo').onclick = write; $('sAgain').onclick = write;
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

  async function open(btn) {
    ensureModal(); cur = { id: btn.dataset.sid, url: btn.dataset.vurl, brand: btn.dataset.brand };
    $('sTitle').textContent = 'Script: ' + cur.brand; $('sSub').textContent = 'What the creator says in this Top 100 video.';
    $('sText').textContent = 'Pulling the script from the video… (first time takes about 10 seconds)'; $('sOut').hidden = true; err(''); modal.hidden = false;
    const mine = cur;
    try { const j = await call({ mode: 'transcript', id: cur.id, url: cur.url }); if (cur === mine) $('sText').textContent = j.text || '(No speech found in this video. It may be music or text on screen only.)'; }
    catch (e) { if (cur === mine) { $('sText').textContent = ''; err(e.message); } }
  }
  async function write() {
    if (!cur) return; err('');
    const product = $('sProd').value.trim(); if (!product) { err('Add your product name first.'); return; }
    const go = $('sGo'); go.disabled = true; go.textContent = 'Writing…';
    try {
      const j = await call({ mode: 'write', id: cur.id, url: cur.url, brand: cur.brand, product, points: $('sPts').value, notes: $('sNotes').value });
      $('sScript').textContent = j.script || ''; $('sOut').hidden = false;
      if (j.text) $('sText').textContent = j.text;
      $('sLeft').textContent = j.left != null ? j.left + ' scripts left today' : '';
    } catch (e) { err(e.message); }
    go.disabled = false; go.textContent = 'Write my script';
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('.vscript'); if (b) open(b); });
})();
