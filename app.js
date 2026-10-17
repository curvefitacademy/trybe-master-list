(function () {
  const C = window.TBML_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const n = (v) => (v == null ? '' : Number(v).toLocaleString('en-US'));
  const money = (v) => (v >= 1e6 ? '$' + (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M+' : v >= 1000 ? '$' + Math.round(v / 1000) + 'K+' : '');
  const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

  ['contact1', 'contact2', 'contact3'].forEach((id) => { if ($(id)) $(id).textContent = C.CONTACT_EMAIL || ''; });
  if (C.BUY_URL) { ['buy-main', 'buy-link2'].forEach((id) => { $(id).href = C.BUY_URL; $(id).hidden = false; }); $('priceBox').hidden = false; }
  const WELCOME = /[?&]welcome=1/.test(location.search);
  if (C.MANAGE_URL) { $('manage-link').href = C.MANAGE_URL; $('manage-link').hidden = false; }

  function show(view) { ['v-loading', 'v-auth', 'v-noaccess', 'v-app'].forEach((v) => ($(v).hidden = v !== view)); }

  if (!window.supabase || !C.SUPABASE_URL || !C.SUPABASE_KEY) {
    show('v-auth');
    authMsg('err', 'The site could not connect to its login service. Please refresh, or email ' + (C.CONTACT_EMAIL || 'support') + '.');
    return;
  }
  const sb = window.supabase.createClient(C.SUPABASE_URL.replace(/\/rest\/v1\/?$/, ''), C.SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  // ------------------------------------------------------------------ auth UI
  function authMsg(kind, text) { const m = $('auth-msg'); if (!text) { m.hidden = true; return; } m.className = 'msg ' + kind; m.textContent = text; m.hidden = false; }
  function authForm(which) {
    ['login', 'signup', 'forgot', 'reset'].forEach((f) => ($('f-' + f).hidden = f !== which));
    $('sw-login').setAttribute('aria-selected', which === 'login');
    $('sw-signup').setAttribute('aria-selected', which === 'signup');
    document.querySelector('.auth-switch').hidden = which === 'reset' || which === 'forgot';
    authMsg();
  }
  $('sw-login').onclick = () => authForm('login');
  $('sw-signup').onclick = () => authForm('signup');
  $('go-forgot').onclick = (e) => { e.preventDefault(); $('fp-email').value = $('li-email').value; authForm('forgot'); };
  $('back-login').onclick = (e) => { e.preventDefault(); authForm('login'); };
  const busy = (form, on) => { const b = form.querySelector('button[type=submit]'); b.disabled = on; b.style.opacity = on ? 0.6 : 1; };

  $('f-login').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target; busy(f, true); authMsg();
    const email = $('li-email').value.trim().toLowerCase(), password = $('li-pw').value;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    busy(f, false);
    if (error) {
      const m = /confirm/i.test(error.message) ? 'Please confirm your email first. Check your inbox for the link.'
        : /invalid/i.test(error.message) ? 'That email and password don\'t match. Try again, or use "Forgot password?". New here? Click "Create account".'
        : error.message;
      authMsg('err', m);
    }
  });

  $('f-signup').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target; authMsg();
    const email = $('su-email').value.trim().toLowerCase(), password = $('su-pw').value;
    if (!EMAIL_RE.test(email)) return authMsg('err', 'Enter a valid email address.');
    if (password.length < 8) return authMsg('err', 'Use at least 8 characters for your password.');
    busy(f, true);
    const { data: allowed, error: rpcErr } = await sb.rpc('can_sign_up', { check_email: email });
    if (rpcErr) { busy(f, false); return authMsg('err', 'Could not check your email right now (' + rpcErr.message + '). Please try again.'); }
    let ok = allowed;
    // Right after checkout, Stripe can take a few seconds to confirm. Wait up to ~30 seconds.
    for (let i = 0; !ok && WELCOME && i < 10; i++) {
      authMsg('ok', 'Confirming your payment… (' + (i + 1) + ')');
      await new Promise((r) => setTimeout(r, 3000));
      const again = await sb.rpc('can_sign_up', { check_email: email });
      ok = !again.error && again.data;
    }
    if (!ok) { busy(f, false); return authMsg('err', 'That email isn\'t on the member list yet. Use the exact email you entered at checkout. Still stuck? Email ' + (C.CONTACT_EMAIL || '') + '.'); }
    const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } });
    busy(f, false);
    if (error) {
      return authMsg('err', /already/i.test(error.message) ? 'You already have an account. Log in instead, or use "Forgot password?".' : error.message);
    }
    if (!data.session) authMsg('ok', 'Almost done! Check your email for a confirmation link, then come back and log in.');
  });

  $('f-forgot').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target; authMsg();
    const email = $('fp-email').value.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return authMsg('err', 'Enter a valid email address.');
    busy(f, true);
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
    busy(f, false);
    if (error) return authMsg('err', error.message);
    authMsg('ok', 'If that email has an account, a reset link is on its way. Check your inbox (and spam).');
  });

  $('f-reset').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target; authMsg();
    const password = $('rp-pw').value;
    if (password.length < 8) return authMsg('err', 'Use at least 8 characters.');
    busy(f, true);
    const { error } = await sb.auth.updateUser({ password });
    busy(f, false);
    if (error) return authMsg('err', error.message);
    recovering = false;
    authMsg('ok', 'Password saved. Loading the list…');
    const { data } = await sb.auth.getSession();
    if (data.session) enter(data.session);
  });

  // After Stripe checkout, look up the exact email they paid with (Apple Pay / Link can use a different one).
  async function prefillCheckoutEmail() {
    const sid = (location.search.match(/[?&]session_id=([^&]+)/) || [])[1];
    if (!sid) return;
    try {
      const r = await fetch('/api/checkout-email?session_id=' + encodeURIComponent(sid), { cache: 'no-store' });
      const j = await r.json();
      if (j.email) {
        $('su-email').value = j.email; $('su-email').readOnly = true;
        $('li-email').value = j.email;
        $('welcome').innerHTML = 'Payment received, welcome! Your account email is <b>' + esc(j.email) + '</b> (the one you paid with). Just choose a password below.';
        $('su-pw').focus();
      }
    } catch (e) { /* fall back to typing it */ }
  }

  async function logout() { await sb.auth.signOut(); DATA = null; show('v-auth'); authForm('login'); }
  $('logout').onclick = logout; $('na-logout').onclick = logout;

  let recovering = false, entered = null;
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') { recovering = true; show('v-auth'); authForm('reset'); return; }
    if (recovering) return;
    if (session && entered !== session.user.id) enter(session);
    if (!session && event === 'SIGNED_OUT') { entered = null; }
  });

  (async () => {
    const { data } = await sb.auth.getSession();
    if (recovering) return;
    if (data.session) { if (entered !== data.session.user.id) enter(data.session); } else { show('v-auth'); authForm(WELCOME ? 'signup' : 'login'); if (WELCOME) { $('welcome').hidden = false; prefillCheckoutEmail(); } }
  })();

  // ------------------------------------------------------------------ load data
  let DATA = null, INFO = null, IS_ADMIN = false, TOPIDX = { snaps: [] };
  async function enter(session) {
    entered = session.user.id;
    show('v-loading');
    const email = (session.user.email || '').toLowerCase();
    const [meta, topIdx, adm] = await Promise.all([
      sb.from('site_meta').select('key,value').eq('key', 'info'),
      sb.from('site_meta').select('key,value').eq('key', 'top_index'),
      sb.from('admins').select('email').limit(1),
    ]);
    IS_ADMIN = !adm.error && adm.data && adm.data.length > 0;
    if (meta.error) { show('v-auth'); authMsg('err', 'Could not load the list: ' + meta.error.message); return; }
    const rows = {};
    const info = meta.data && meta.data[0] && meta.data[0].value;
    if (info && info.version && info.parts) {
      const keys = Array.from({ length: info.parts }, (_, i) => 'b_' + info.version + '_' + i);
      const parts = await sb.from('site_meta').select('key,value').in('key', keys);
      if (parts.error) { show('v-auth'); authMsg('err', 'Could not load the list: ' + parts.error.message); return; }
      const byKey = Object.fromEntries((parts.data || []).map((r) => [r.key, r.value]));
      rows.brands = keys.flatMap((k) => byKey[k] || []);
      rows.info = info;
    }
    if (!rows.brands && !IS_ADMIN) {
      // RLS hides everything from non-members. Check their own membership row for a clearer message.
      $('na-email').textContent = email; show('v-noaccess'); return;
    }
    INFO = rows.info || {};
    TOPIDX = (topIdx && !topIdx.error && topIdx.data && topIdx.data[0] && topIdx.data[0].value) || { snaps: [] };
    await Promise.all([loadFavs(email), loadLatestTop()]);
    setData(rows.brands);
    $('who').textContent = email;
    $('t-admin').hidden = !IS_ADMIN;
    show('v-app');
    if (IS_ADMIN && !rows.brands) selectTab('admin');
  }

  // ------------------------------------------------------------------ directory
  const TTS = { Y: 'Yes', F: 'Not found', U: 'Not verified', A: 'App/Digital' };
  let D = [];
  function setData(raw) {
    const list = Array.isArray(raw) ? raw : (raw && raw.rows) || [];
    // row: [brand,tts,cat,comm,earn,creators,s30,sall,score,rating,reviews,site]
    D = list.map((r, i) => {
      const epc = r[4] > 0 && r[5] > 0 ? r[4] / r[5] : null; const cm = (r[3] || '').toLowerCase();
      return { i, brand: r[0], tts: r[1] || 'U', cat: r[2] || '', comm: r[3] || '', earn: r[4], cr: r[5], epc, s30: r[6], sall: r[7], score: r[8], rating: r[9], rev: r[10], site: r[11] || '',
        cap: cm.includes('max') && cm.includes('per submission'), key: (r[0] + ' ' + (r[2] || '')).toLowerCase() };
    });
    DATA = D;
    $('updated').textContent = 'Updated weekly' + (INFO.updated_label ? ' · Last update: ' + INFO.updated_label : '');
    buildCats(); stats(); render(); picks(); whatsNew();
  }
  function stats() {
    const tot = D.length, yes = D.filter((d) => d.tts === 'Y').length, big = D.filter((d) => d.earn >= 100000).length, withC = D.filter((d) => d.cr).length;
    $('stats').innerHTML = [[n(tot), 'brands listed'], [n(yes), 'confirmed on TikTok Shop'], [n(big), 'paid creators $100K+'], [n(withC), 'with creator counts']]
      .map(([b, s]) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`).join('');
  }
  function buildCats() {
    const sel = $('cat'); const keep = sel.value; sel.innerHTML = '<option value="">All categories</option>';
    const cats = new Map(); D.forEach((d) => d.cat.split(', ').forEach((c) => { c = c.trim(); if (c) cats.set(c, (cats.get(c) || 0) + 1); }));
    [...cats.entries()].filter(([, v]) => v >= 15).sort((a, b) => a[0].localeCompare(b[0])).forEach(([c, v]) => { const o = document.createElement('option'); o.value = c; o.textContent = `${c} (${v})`; sel.appendChild(o); });
    sel.value = keep;
  }
  const COLS = [['brand', 'Brand', 0], ['tts', 'TikTok Shop', 0], ['comm', 'Commission', 0], ['earn', 'Creator Earnings', 1], ['cr', 'Creators', 1], ['epc', 'Earnings / Creator', 1], ['s30', 'Videos (30d)', 1], ['score', 'Trybe Score', 1], ['rating', 'Rating', 1], ['cat', 'Categories', 0]];
  let sortKey = 'earn', dir = -1, limit = 100;
  function head() {
    $('head').innerHTML = '<th class="starcell"><span class="sr-only" hidden>Favorite</span></th>' + COLS.map(([k, l, num]) => `<th class="${num ? 'num' : ''} ${k === sortKey ? 'sorted' : ''}" aria-sort="${k === sortKey ? (dir < 0 ? 'descending' : 'ascending') : 'none'}"><button type="button" data-k="${k}">${l}${k === sortKey ? (dir < 0 ? ' ↓' : ' ↑') : ''}</button></th>`).join('');
    $('head').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { const k = b.dataset.k; if (k === sortKey) dir = -dir; else { sortKey = k; dir = COLS.find((c) => c[0] === k)[2] ? -1 : 1; } limit = 100; render(); }));
  }
  function filtered() {
    const q = $('q').value.trim().toLowerCase(), c = $('cat').value, e = $('earnF').value, tt = $('ttsF').checked, na = $('noApps').checked, nc = $('noCap').checked, it = $('inTop').checked;
    return D.filter((d) => (!q || d.key.includes(q)) && (!c || d.cat.includes(c)) && (!tt || d.tts === 'Y') && (!na || d.tts !== 'A') && (!nc || !d.cap) && (!it || TOPB.has(bkey(d.brand))) &&
      (e === '' || (e === '0' ? !(d.earn > 0) : d.earn >= +e)));
  }
  function cmp(a, b) {
    const x = a[sortKey], y = b[sortKey]; const nx = x == null || x === '', ny = y == null || y === '';
    if (nx && ny) return a.i - b.i; if (nx) return 1; if (ny) return -1;
    if (typeof x === 'string') return dir * x.localeCompare(y); return dir * (x - y) || a.i - b.i;
  }
  const scoreCls = (s) => (s >= 80 ? 's-hi' : s < 40 ? 's-lo' : 's-mid');
  const dash = '<span class="dash">—</span>';
  function render() {
    head();
    const rows = filtered().sort(cmp);
    $('count').innerHTML = `Showing <b>${n(Math.min(limit, rows.length))}</b> of <b>${n(rows.length)}</b> brands`;
    $('body').innerHTML = rows.slice(0, limit).map(rowHtml).join('') || `<tr><td colspan="11" style="padding:28px;text-align:center;color:var(--muted)">No brands match those filters.</td></tr>`;
    $('moreBtn').hidden = rows.length <= limit;
  }
  function rowHtml(d) {
      const site = d.site.replace(/^https?:\/\//, '');
      const on = FAV.has(d.brand);
      return `<tr>
      <td class="starcell"><button type="button" class="star" data-fav="${esc(d.brand)}" aria-pressed="${on}" aria-label="${on ? 'Remove from favorites' : 'Add to favorites'}">${on ? '★' : '☆'}</button></td>
      <td class="brand">${esc(d.brand)}${topBadge(d.brand)}${site ? `<a href="https://${esc(site)}" target="_blank" rel="noopener">${esc(site.replace(/^www\./, '').split('/')[0])}</a>` : ''}</td>
      <td><span class="pill p-${esc(d.tts)}">${TTS[d.tts] || 'Not verified'}</span></td>
      <td class="comm">${d.cap ? `<span class="cap">${esc(d.comm)}</span>` : esc(d.comm)}</td>
      <td class="num">${d.earn >= 100000 ? `<span class="big">${money(d.earn)}</span>` : d.earn > 0 ? money(d.earn) : '<span class="new">New</span>'}</td>
      <td class="num">${d.cr ? n(d.cr) : dash}</td>
      <td class="num">${d.epc ? '$' + n(Math.round(d.epc)) : dash}</td>
      <td class="num">${d.s30 != null ? n(d.s30) : dash}</td>
      <td class="num">${d.score != null ? `<span class="score ${scoreCls(d.score)}">${d.score}</span>` : dash}</td>
      <td class="num">${d.rating ? Number(d.rating).toFixed(1) + ` <span class="small">(${n(d.rev)})</span>` : dash}</td>
      <td class="cat">${esc(d.cat)}</td></tr>`;
  }

  // ------------------------------------------------------------------ favorites
  let FAV = new Set(), ME = '';
  async function loadFavs(email) {
    ME = email; FAV = new Set();
    const { data, error } = await sb.from('favorites').select('brand');
    if (!error && data) data.forEach((r) => FAV.add(r.brand));
    favCount();
  }
  function favCount() { $('favCount').textContent = FAV.size ? FAV.size : ''; }
  async function toggleFav(brand, btn) {
    const on = !FAV.has(brand);
    on ? FAV.add(brand) : FAV.delete(brand);
    document.querySelectorAll('button.star').forEach((b) => { if (b.dataset.fav === brand) { b.setAttribute('aria-pressed', on); b.textContent = on ? '★' : '☆'; b.setAttribute('aria-label', on ? 'Remove from favorites' : 'Add to favorites'); } });
    favCount();
    const req = on ? sb.from('favorites').insert({ email: ME, brand }) : sb.from('favorites').delete().eq('email', ME).eq('brand', brand);
    const { error } = await req;
    if (error && !/duplicate/i.test(error.message)) {
      on ? FAV.delete(brand) : FAV.add(brand); favCount(); renderFavs(); render();
      alertBar('Could not save that favorite. Please try again.');
    }
    if (!$('p-fav').hidden) renderFavs();
  }
  function alertBar(t) { const m = $('count'); m.textContent = t; }
  function renderFavs() {
    const list = D.filter((d) => FAV.has(d.brand)).sort((a, b) => (b.earn || 0) - (a.earn || 0));
    $('favEmpty').hidden = list.length > 0; $('favWrap').hidden = list.length === 0;
    $('favHead').innerHTML = '<th class="starcell"></th>' + COLS.map(([k, l, num]) => `<th class="${num ? 'num' : ''}">${l}</th>`).join('');
    $('favBody').innerHTML = list.map(rowHtml).join('');
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('button.star'); if (b) toggleFav(b.dataset.fav, b); });
  ['q', 'cat', 'earnF', 'ttsF', 'noApps', 'noCap', 'inTop'].forEach((id) => $(id).addEventListener('input', () => { limit = 100; render(); }));
  $('moreBtn').onclick = () => { limit += 100; render(); };

  $('csvBtn').onclick = () => {
    const rows = filtered().sort(cmp);
    const q = (v) => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const lines = [['Brand', 'On TikTok Shop', 'Commission', 'Creator Earnings ($)', 'Total Creators', 'Earnings per Creator ($)', 'Submissions (30 days)', 'Submissions (all time)', 'Trybe Score', 'Rating', 'Reviews', 'Categories', 'Website'].join(',')];
    rows.forEach((d) => lines.push([d.brand, TTS[d.tts], d.comm, d.earn > 0 ? d.earn : 'New', d.cr, d.epc ? Math.round(d.epc) : '', d.s30, d.sall, d.score, d.rating, d.rev, d.cat, d.site].map(q).join(',')));
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'trybe-master-list.csv'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  // ------------------------------------------------------------------ picks + what's new
  function picks() {
    const withEPC = D.filter((d) => d.epc).sort((a, b) => b.epc - a.epc).slice(0, 10);
    const ttsTop = D.filter((d) => d.tts === 'Y' && d.earn > 0).sort((a, b) => b.earn - a.earn).slice(0, 10);
    const active = D.filter((d) => d.s30 != null).sort((a, b) => b.s30 - a.s30).slice(0, 10);
    const card = (t, p, list, val) => `<div class="pick"><h2>${t}</h2><p>${p}</p><ol>${list.map((d, i) => `<li><span class="rank">${i + 1}</span><span class="nm">${esc(d.brand)}</span><span class="vl">${val(d)}</span></li>`).join('')}</ol></div>`;
    $('picks').innerHTML = card('Highest earnings per creator', 'Big payouts split among fewer creators.', withEPC, (d) => '$' + n(Math.round(d.epc))) +
      card('Top earners on TikTok Shop', 'Trybe programs you can also promote as an affiliate.', ttsTop, (d) => money(d.earn)) +
      card('Most active right now', 'Most videos submitted in the last 30 days.', active, (d) => n(d.s30) + ' videos');
  }
  function whatsNew() {
    const w = INFO.whats_new;
    if (!w || !w.sections || !w.sections.length) {
      $('whatsnew').innerHTML = '<p>This page lists what changed after each weekly update: new brands, biggest earnings jumps and commission changes. Check back after the next update.</p>';
      return;
    }
    $('whatsnew').innerHTML = (w.intro ? `<p>${esc(w.intro)}</p>` : '') + w.sections.map((s) =>
      `<h2>${esc(s.title)}</h2><ul class="wn-list">${(s.items || []).map((it) => `<li>${esc(it)}</li>`).join('') || '<li>None this week</li>'}</ul>`).join('');
  }


  // ------------------------------------------------------------------ Top 100 videos
  // Snapshots live in site_meta: 'top_index' = {snaps:[{d:'YYYY-MM-DD', n}]}, 'top_YYYY-MM-DD' = {d, items:[[rank, id, brand, creator, username, thumb, video]]}
  const bkey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const SNAP = {}; let TOPB = new Map(), topLimit = 24;
  const fmtDay = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const fmtMonth = (m) => new Date(m + '-15T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const snaps = () => (TOPIDX.snaps || []).slice().sort((a, b) => b.d.localeCompare(a.d));
  async function getSnaps(days) {
    const need = days.filter((d) => !SNAP[d]);
    if (need.length) {
      const r = await sb.from('site_meta').select('key,value').in('key', need.map((d) => 'top_' + d));
      (r.data || []).forEach((x) => { SNAP[x.key.slice(4)] = (x.value && x.value.items) || []; });
    }
    return days.map((d) => ({ d, items: SNAP[d] || [] }));
  }
  async function loadLatestTop() {
    const s = snaps(); TOPB = new Map();
    if (!s.length) return;
    const [latest] = await getSnaps([s[0].d]);
    latest.items.forEach((it) => { const k = bkey(it[2]); const b = TOPB.get(k) || { c: 0, best: 999 }; b.c++; b.best = Math.min(b.best, it[0]); TOPB.set(k, b); });
  }
  function topBadge(brand) {
    const b = TOPB.get(bkey(brand)); if (!b) return '';
    return `<span class="topbadge" title="In this week's Trybe Top 100">Top 100${b.c > 1 ? ' ×' + b.c : ''} · #${b.best}</span>`;
  }
  function buildTopView() {
    const sel = $('topView'), keep = sel.value, s = snaps();
    if (!s.length) { sel.innerHTML = '<option value="">No Top 100 saved yet</option>'; return; }
    const months = [...new Set(s.map((x) => x.d.slice(0, 7)))];
    sel.innerHTML = `<optgroup label="Single update">${s.map((x, i) => `<option value="d:${x.d}">${i === 0 ? 'Latest · ' : ''}${fmtDay(x.d)}</option>`).join('')}</optgroup>` +
      `<optgroup label="Whole month (every update combined)">${months.map((m) => `<option value="m:${m}">${fmtMonth(m)}</option>`).join('')}</optgroup>`;
    if (keep && [...sel.options].some((o) => o.value === keep)) sel.value = keep;
  }
  let TOPV = [];
  async function loadTopView() {
    const v = $('topView').value, s = snaps();
    if (!v) { TOPV = []; return; }
    const days = v.startsWith('m:') ? s.filter((x) => x.d.startsWith(v.slice(2))).map((x) => x.d) : [v.slice(2)];
    const got = await getSnaps(days); const byId = new Map();
    got.forEach(({ d, items }) => items.forEach((it) => {
      const id = it[1] || it[6]; const e = byId.get(id);
      if (e) { e.days++; if (it[0] < e.rank) e.rank = it[0]; if (d < e.first) e.first = d; }
      else byId.set(id, { rank: it[0], id, brand: it[2], creator: it[3], user: it[4], thumb: it[5], video: it[6], days: 1, first: d });
    }));
    const BY = new Map(D.map((d) => [bkey(d.brand), d]));
    TOPV = [...byId.values()].map((x) => { const b = BY.get(bkey(x.brand)); return Object.assign(x, { cat: b ? b.cat : '', earn: b ? b.earn : null, key: (x.brand + ' ' + x.creator + ' ' + x.user).toLowerCase() }); });
    TOPV.total = days.length;
    const bs = $('topBrand'), kb = bs.value, cnt = new Map(); TOPV.forEach((x) => cnt.set(x.brand, (cnt.get(x.brand) || 0) + 1));
    bs.innerHTML = '<option value="">All brands</option>' + [...cnt.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([b, c]) => `<option value="${esc(b)}">${esc(b)} (${c})</option>`).join('');
    bs.value = cnt.has(kb) ? kb : '';
    const ns = $('topNiche'), kn = ns.value, nc = new Map(); TOPV.forEach((x) => x.cat.split(', ').forEach((c) => { c = c.trim(); if (c) nc.set(c, (nc.get(c) || 0) + 1); }));
    ns.innerHTML = '<option value="">All niches</option>' + [...nc.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([c, k]) => `<option value="${esc(c)}">${esc(c)} (${k})</option>`).join('');
    ns.value = nc.has(kn) ? kn : '';
  }
  function drawTop() {
    const q = $('topQ').value.trim().toLowerCase(), b = $('topBrand').value, c = $('topNiche').value, s = $('topSort').value;
    const rows = TOPV.filter((x) => (!q || x.key.includes(q)) && (!b || x.brand === b) && (!c || x.cat.split(', ').includes(c)));
    const by = { rank: (x, y) => x.rank - y.rank, brand: (x, y) => x.brand.localeCompare(y.brand) || x.rank - y.rank, days: (x, y) => y.days - x.days || x.rank - y.rank, earn: (x, y) => (y.earn || 0) - (x.earn || 0) || x.rank - y.rank }[s];
    rows.sort(by);
    const month = $('topView').value.startsWith('m:');
    $('topCount').innerHTML = TOPV.length ? `Showing <b>${n(Math.min(topLimit, rows.length))}</b> of <b>${n(rows.length)}</b> videos${month ? ` from <b>${TOPV.total}</b> update${TOPV.total > 1 ? 's' : ''}` : ''}` : '';
    $('topGrid').innerHTML = rows.slice(0, topLimit).map((x) => `<article class="vcard">
      <div class="vwrap"><video controls playsinline preload="none" poster="${esc(x.thumb)}" src="${esc(x.video)}"></video><span class="vrank">#${x.rank}</span></div>
      <div class="vmeta"><b>${esc(x.brand)}</b><span>@${esc(x.user || x.creator)}</span>
      ${month ? `<span class="small">In Top 100 ${x.days} of ${TOPV.total} update${TOPV.total > 1 ? 's' : ''} · best #${x.rank}</span>` : ''}
      ${x.cat ? `<span class="small">${esc(x.cat)}</span>` : ''}</div></article>`).join('') ||
      `<p class="small">${TOPV.length ? 'No videos match those filters.' : 'The first Top 100 snapshot has not been saved yet. Check back after the next update.'}</p>`;
    $('topMore').hidden = rows.length <= topLimit;
  }
  // Only one video plays at a time
  document.addEventListener('play', (e) => { document.querySelectorAll('#topGrid video').forEach((v) => { if (v !== e.target) v.pause(); }); }, true);
  let topReady = false;
  async function renderTop() {
    if (!topReady) { buildTopView(); topReady = true; await loadTopView(); }
    drawTop();
  }
  $('topView').addEventListener('change', async () => { topLimit = 24; await loadTopView(); drawTop(); });
  ['topQ', 'topBrand', 'topNiche', 'topSort'].forEach((id) => $(id).addEventListener('input', () => { topLimit = 24; drawTop(); }));
  $('topMore').addEventListener('click', () => { topLimit += 24; drawTop(); });

  // Admin: save one Top 100 snapshot. items = [[rank, id, brand, creator, username, thumb, video], ...]
  async function publishTop(items, day) {
    day = day || new Date().toISOString().slice(0, 10);
    const w = await sb.from('site_meta').upsert({ key: 'top_' + day, value: { d: day, items } }, { onConflict: 'key' });
    if (w.error) return { error: w.error.message };
    const cur = await sb.from('site_meta').select('value').eq('key', 'top_index');
    const idx = (cur.data && cur.data[0] && cur.data[0].value) || { snaps: [] };
    idx.snaps = (idx.snaps || []).filter((x) => x.d !== day).concat([{ d: day, n: items.length }]).sort((a, b) => a.d.localeCompare(b.d));
    const w2 = await sb.from('site_meta').upsert({ key: 'top_index', value: idx }, { onConflict: 'key' });
    if (w2.error) return { error: w2.error.message };
    TOPIDX = idx; SNAP[day] = items; topReady = false; await loadLatestTop(); render();
    return { ok: true, day, count: items.length, snaps: idx.snaps.length };
  }
  window.__tbmlPublishTop = (items, day) => (IS_ADMIN ? publishTop(items, day) : Promise.resolve({ error: 'not admin' }));

  // ------------------------------------------------------------------ tabs
  function selectTab(k) {
    document.querySelectorAll('.tab').forEach((x) => x.setAttribute('aria-selected', x.dataset.tab === k));
    ['dir', 'picks', 'top', 'fav', 'new', 'help', 'admin'].forEach((t) => ($('p-' + t).hidden = t !== k));
    if (k === 'top') renderTop();
    if (k === 'admin') loadMembers();
    if (k === 'fav') renderFavs();
  }
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => selectTab(t.dataset.tab)));

  // ------------------------------------------------------------------ admin
  function panelMsg(id, kind, text) { const m = $(id); if (!text) { m.hidden = true; return; } m.className = 'msg ' + kind; m.textContent = text; m.hidden = false; }

  // Saves the list in ~100 KB parts, then switches members over to the new version in one step.
  async function publishBrands(brands, info, progress) {
    const PART = 600, version = Date.now().toString(36), parts = Math.ceil(brands.length / PART);
    for (let i = 0; i < parts; i++) {
      if (progress) progress(i + 1, parts);
      const { error } = await sb.from('site_meta').upsert({ key: 'b_' + version + '_' + i, value: brands.slice(i * PART, (i + 1) * PART) }, { onConflict: 'key' });
      if (error) return { error: error.message };
    }
    const newInfo = Object.assign({}, info, { version, parts, count: brands.length, published_at: new Date().toISOString() });
    const { error } = await sb.from('site_meta').upsert({ key: 'info', value: newInfo }, { onConflict: 'key' });
    if (error) return { error: error.message };
    // Clean up older versions
    const keep = Array.from({ length: parts }, (_, i) => 'b_' + version + '_' + i);
    await sb.from('site_meta').delete().like('key', 'b_%').not('key', 'in', '(' + keep.join(',') + ')');
    await sb.from('site_meta').delete().eq('key', 'brands');
    return { info: newInfo };
  }
  window.__tbmlPublish = publishBrands;

  $('uploadBtn').onclick = async () => {
    panelMsg('upMsg');
    const file = $('dataFile').files[0];
    if (!file) return panelMsg('upMsg', 'err', 'Choose the weekly .json file first.');
    let payload;
    try { payload = JSON.parse(await file.text()); } catch (e) { return panelMsg('upMsg', 'err', 'That file isn\'t valid JSON. Make sure it\'s the .json file from Claude.'); }
    const brands = payload.brands, info = payload.info || {};
    if (!Array.isArray(brands) || brands.length < 100 || !Array.isArray(brands[0])) return panelMsg('upMsg', 'err', 'That file doesn\'t look like a brand list (expected thousands of brands).');
    $('uploadBtn').disabled = true;
    const result = await publishBrands(brands, info, (done, total) => panelMsg('upMsg', 'ok', `Publishing ${n(brands.length)} brands… part ${done} of ${total}`));
    $('uploadBtn').disabled = false;
    if (result.error) return panelMsg('upMsg', 'err', 'Upload failed: ' + result.error);
    INFO = result.info; setData(brands);
    panelMsg('upMsg', 'ok', 'Published! ' + n(brands.length) + ' brands are live for all members.');
    dataStatus();
  };
  function dataStatus() {
    $('dataStatus').textContent = D.length ? `Live now: ${n(D.length)} brands${INFO.updated_label ? ', data from ' + INFO.updated_label : ''}${INFO.published_at ? ', published ' + new Date(INFO.published_at).toLocaleString() : ''}.` : 'No data published yet.';
  }

  let MEMBERS = [];
  async function loadMembers() {
    dataStatus(); panelMsg('memMsg');
    MEMBERS = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('members').select('email,status,source,created_at').order('created_at', { ascending: false }).range(from, from + 999);
      if (error) { panelMsg('memMsg', 'err', 'Could not load members: ' + error.message); break; }
      MEMBERS = MEMBERS.concat(data); if (data.length < 1000) break;
    }
    renderMembers();
  }
  function renderMembers() {
    const q = $('memQ').value.trim().toLowerCase(), st = $('memStatus').value, src = $('memSource').value;
    const act = MEMBERS.filter((m) => m.status === 'active').length;
    $('memCount').textContent = `${n(act)} active · ${n(MEMBERS.length - act)} canceled`;
    const rows = MEMBERS.filter((m) => (!q || m.email.includes(q)) && (!st || m.status === st) && (!src || m.source === src));
    $('memBody').innerHTML = rows.slice(0, 300).map((m) => `<tr>
      <td>${esc(m.email)}</td><td class="status-${esc(m.status)}">${m.status === 'active' ? 'Active' : 'Canceled'}</td><td>${esc(m.source)}</td>
      <td class="small">${m.created_at ? new Date(m.created_at).toLocaleDateString() : ''}</td>
      <td style="white-space:nowrap">${m.status === 'active'
        ? `<button class="linky danger" data-act="cancel" data-e="${esc(m.email)}">Remove access</button>`
        : `<button class="linky" data-act="activate" data-e="${esc(m.email)}">Give access</button>`}</td></tr>`).join('')
      + (rows.length > 300 ? `<tr><td colspan="5" class="small">Showing 300 of ${n(rows.length)}. Search to narrow it down.</td></tr>` : '')
      || '<tr><td colspan="5" class="small">No members yet.</td></tr>';
    $('memBody').querySelectorAll('button[data-act]').forEach((b) => b.onclick = async () => {
      const status = b.dataset.act === 'cancel' ? 'canceled' : 'active';
      b.disabled = true;
      const { error } = await sb.from('members').update({ status, updated_at: new Date().toISOString() }).eq('email', b.dataset.e);
      if (error) { b.disabled = false; return panelMsg('memMsg', 'err', 'Could not update: ' + error.message); }
      const m = MEMBERS.find((x) => x.email === b.dataset.e); if (m) m.status = status; renderMembers();
    });
  }
  ['memQ', 'memStatus', 'memSource'].forEach((id) => $(id).addEventListener('input', renderMembers));
  $('memRefresh').onclick = loadMembers;

  $('addBtn').onclick = async () => {
    panelMsg('addMsg');
    const parts = $('addEmails').value.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    const good = [...new Set(parts.filter((e) => EMAIL_RE.test(e)))], bad = parts.filter((e) => !EMAIL_RE.test(e));
    if (!good.length) return panelMsg('addMsg', 'err', 'No valid emails found.');
    const source = $('addSource').value, now = new Date().toISOString();
    $('addBtn').disabled = true;
    for (let i = 0; i < good.length; i += 500) {
      const chunk = good.slice(i, i + 500).map((email) => ({ email, status: 'active', source, updated_at: now }));
      const { error } = await sb.from('members').upsert(chunk, { onConflict: 'email' });
      if (error) { $('addBtn').disabled = false; return panelMsg('addMsg', 'err', 'Stopped after ' + i + ' emails: ' + error.message); }
    }
    $('addBtn').disabled = false; $('addEmails').value = '';
    panelMsg('addMsg', 'ok', `Added ${n(good.length)} member${good.length === 1 ? '' : 's'}.` + (bad.length ? ` Skipped ${bad.length} that didn't look like emails: ${bad.slice(0, 5).join(', ')}${bad.length > 5 ? '…' : ''}` : ''));
    loadMembers();
  };
})();
