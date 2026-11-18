// Phone layout (screens up to 700px wide). Desktop is unchanged.
// - Brand tables (Directory, My Invites, Favorites) become stacked cards with labels, plus a "Sort by" menu.
// - Filter chips fold behind a "Filters" button so the list starts on the first screen.
// - Compact header, scrollable tab bar that follows the active tab, 16px inputs (no iOS zoom), bigger tap targets.
(function () {
  const MQ = window.matchMedia('(max-width:700px)');
  const $ = (id) => document.getElementById(id);

  const css = `
.mfbtn,.msort{display:none}
.fmore{display:contents}
@media (max-width:700px){
  html{-webkit-text-size-adjust:100%}
  input,select,textarea{font-size:16px!important}
  /* header */
  #who{display:none}
  .bar-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;flex-wrap:nowrap}
  .bar-meta .updated{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
  .bar-meta .linkbtn{flex:none}
  /* tab bar */
  .tabs-in{overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;flex-wrap:nowrap;scroll-snap-type:x proximity}
  .tabs-in::-webkit-scrollbar{display:none}
  .tabs-in>*{flex:none;white-space:nowrap;scroll-snap-align:start}
  .tabs{box-shadow:0 1px 0 var(--line)}
  .tabs.mfade::after{content:"";position:absolute;right:0;top:0;bottom:0;width:36px;pointer-events:none;background:linear-gradient(90deg,transparent,var(--surface))}
  main h1,section>h1{font-size:24px}
  /* filters */
  .mfbtn{display:inline-flex;align-items:center;gap:6px;padding:10px 14px;border-radius:12px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font:inherit;font-weight:700;cursor:pointer;flex:none}
  .mfbtn .mfn{background:var(--accent);color:#fff;border-radius:999px;padding:0 7px;font-size:12px}
  .mfbtn .mfn:empty{display:none}
  .filters{flex-wrap:nowrap}
  .filters.mf{flex-wrap:wrap}
  .filters .search{flex:1 1 auto}
  .fmore{display:none}
  .filters.open .fmore{display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%}
  .fmore select{width:100%;min-width:0}
  .fmore .toggle{min-width:0;font-size:14px;padding:10px;min-height:44px}
  .fmore .toggle input{flex:none;width:20px;height:20px}
  /* sort menu for card lists */
  .msort{display:flex;gap:8px;align-items:center;margin:0 0 8px}
  .msort select{flex:1;min-width:0;padding:10px 12px;border-radius:12px;border:1px solid var(--line);background:var(--surface);color:var(--ink)}
  .msort button{flex:none;width:44px;height:44px;border-radius:12px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font-size:18px;cursor:pointer}
  /* tables -> cards */
  table.mcards thead{display:none}
  table.mcards,table.mcards tbody{display:block;width:100%!important;min-width:0!important;max-width:100%}
  .tablewrap:has(table.mcards){overflow:visible}
  table.mcards tr{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;padding:14px;border-bottom:1px solid var(--line);position:relative}
  table.mcards td{display:block;padding:0!important;border:0!important;text-align:left!important;min-width:0;white-space:normal!important;overflow-wrap:anywhere;order:2}
  table.mcards td::before{content:attr(data-label);display:block;font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px}
  table.mcards td[data-label=""]::before,table.mcards td.brand::before,table.mcards td.starcell::before{display:none}
  table.mcards td.cmpcell::before{content:"Compare";font-size:9px;text-align:center;margin:0}
  table.mcards td:empty{display:none}
  table.mcards td.brand{grid-column:1/-1;order:0;font-size:17px;font-weight:700;padding-right:100px!important;min-height:40px}
  table.mcards td.brand a{display:block;font-size:13px;font-weight:400}
  table.mcards td.num{order:1}
  table.mcards td.comm{grid-column:1/-1;order:3}
  table.mcards td.cat{grid-column:1/-1;order:4;font-size:13px;color:var(--muted)}
  table.mcards td[colspan]{grid-column:1/-1}
  table.mcards td.starcell{position:absolute;top:8px;right:6px}
  table.mcards td.cmpcell{position:absolute;top:4px;right:50px;width:auto;text-align:center!important}
  table.mcards .star{width:44px;height:44px;font-size:22px}
  table.mcards td.cmpcell input{width:22px;height:22px;margin:11px;accent-color:var(--accent)}
  table.mcards .spark{display:inline-flex;vertical-align:middle;margin-left:6px}
  /* Top 100 cards */
  .vtop{flex-wrap:wrap;gap:4px}
  .vmeta{padding:8px 10px}
  .vstar,.vscript{min-height:34px}
  /* compare bar sits under the sticky tab bar */
  .cmpbar{top:58px}
  /* buttons and pills */
  .btn,.linkbtn{min-height:40px}
  .toolbar{flex-wrap:wrap;gap:8px}
  /* script window: full screen sheet */
  .smodal{padding:0;place-items:end stretch}
  .sbox{max-width:none;border-radius:18px 18px 0 0;max-height:100dvh;height:100dvh;padding:16px 16px calc(16px + env(safe-area-inset-bottom))}
  .sbox header{position:sticky;top:-16px;background:var(--surface);padding:8px 0;z-index:1}
  .sclose{font-size:30px;width:44px;height:44px}
  .ssaved{grid-template-columns:1fr}
}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  // ---------- filters: fold everything but search behind a "Filters" button
  function activeCount(box) {
    let n = 0;
    box.querySelectorAll('select').forEach((s) => { if (s.options[0] && s.options[0].value === '' && s.value !== '') n++; });
    box.querySelectorAll('input[type=checkbox]').forEach((c) => { if (c.checked) n++; });
    return n;
  }
  function setupFilters(f) {
    if (f.dataset.mf) return; f.dataset.mf = '1';
    const kids = [...f.children].filter((c) => !c.classList.contains('search'));
    if (!kids.length) return;
    const more = document.createElement('div'); more.className = 'fmore';
    kids.forEach((k) => more.appendChild(k));
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'mfbtn';
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = 'Filters <span class="mfn"></span>';
    f.appendChild(btn); f.appendChild(more); f.classList.add('mf');
    const upd = () => { btn.querySelector('.mfn').textContent = activeCount(more) || ''; };
    btn.addEventListener('click', () => { const o = f.classList.toggle('open'); btn.setAttribute('aria-expanded', o); });
    more.addEventListener('change', upd); upd();
  }

  // ---------- tables: label every cell from its column header, add a sort menu
  const TABLES = ['body', 'invBody', 'favBody'];
  const clean = (t) => String(t || '').replace(/[↓↑▲▼]/g, '').trim();
  function labelTable(tb) {
    const table = tb.closest('table'); if (!table) return;
    table.classList.add('mcards');
    const ths = [...table.querySelectorAll('thead th')];
    const labels = ths.map((th) => clean(th.textContent));
    tb.querySelectorAll('tr').forEach((tr) => {
      [...tr.children].forEach((td, i) => { const l = td.colSpan > 1 ? '' : (labels[i] || ''); if (td.dataset.label !== l) td.dataset.label = l; });
    });
    sortMenu(table, ths);
  }
  function sortMenu(table, ths) {
    const wrap = table.closest('.tablewrap') || table;
    let m = wrap.previousElementSibling;
    if (!m || !m.classList.contains('msort')) {
      m = document.createElement('div'); m.className = 'msort';
      m.innerHTML = '<select aria-label="Sort by"></select><button type="button" aria-label="Reverse sort order" title="Reverse order">⇅</button>';
      wrap.parentNode.insertBefore(m, wrap);
      const sel = m.querySelector('select');
      sel.addEventListener('change', () => { const b = table.querySelector(`thead button[data-k="${sel.value}"]`); if (b) b.click(); });
      m.querySelector('button').addEventListener('click', () => { const b = table.querySelector(`thead button[data-k="${sel.value}"]`); if (b) b.click(); });
    }
    const btns = ths.map((th) => th.querySelector('button[data-k]')).filter(Boolean);
    if (!btns.length) { m.hidden = true; return; }
    m.hidden = false;
    const sel = m.querySelector('select');
    const opts = btns.map((b) => `<option value="${b.dataset.k}">Sort: ${clean(b.textContent)}</option>`).join('');
    if (sel.dataset.o !== opts) { sel.innerHTML = opts; sel.dataset.o = opts; }
    const cur = ths.find((th) => th.getAttribute('aria-sort') && th.getAttribute('aria-sort') !== 'none');
    const k = cur && cur.querySelector('button[data-k]');
    if (k) sel.value = k.dataset.k;
  }

  // ---------- tab bar: keep the active tab in view, show a fade while more tabs are off-screen
  function setupTabs() {
    const bar = document.querySelector('.tabs-in'); if (!bar || bar.dataset.m) return; bar.dataset.m = '1';
    const outer = bar.parentElement;
    const fade = () => outer.classList.toggle('mfade', MQ.matches && bar.scrollLeft + bar.clientWidth < bar.scrollWidth - 4);
    bar.addEventListener('scroll', fade, { passive: true }); window.addEventListener('resize', fade); fade();
    bar.addEventListener('click', (e) => { const t = e.target.closest('[role=tab],button,a'); if (t && MQ.matches) t.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); setTimeout(fade, 400); });
  }

  let busy = false;
  function run() {
    if (busy) return; busy = true;
    try {
      document.querySelectorAll('.filters').forEach(setupFilters);
      TABLES.forEach((id) => { const tb = $(id); if (tb) labelTable(tb); });
      setupTabs();
    } finally { busy = false; }
  }
  let q = 0;
  new MutationObserver(() => { if (!q) q = requestAnimationFrame(() => { q = 0; run(); }); }).observe(document.body, { childList: true, subtree: true });
  run();
})();
