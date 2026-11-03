// Members' "Sync my Trybe invites" button looks up the brands that invited them (including private
// invite brands that are not listed in Trybe Discover) and sends brand-level stats here.
// Only signed-in active members (or the admin) can contribute. Each brand is stored as its own
// site_meta row 'pb_<brandkey>', which every member can read and the site merges into the master list.
// No member emails, earnings or invite messages are stored.

const MAX_ROWS = 100;
const s = (v, n) => String(v == null ? '' : v).slice(0, n);
const num = (v, max) => { const x = Number(v); return Number.isFinite(x) && x >= 0 && x <= max ? x : null; };
const bkey = (b) => String(b || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 80);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const URL_ = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const KEY = process.env.SUPABASE_SECRET_KEY;
  if (!URL_ || !KEY) return res.status(500).json({ error: 'Server not configured' });

  // 1) Who is calling? Verify their site login token with Supabase.
  const auth = String(req.headers.authorization || '');
  if (!/^Bearer [\w.-]+$/.test(auth)) return res.status(401).json({ error: 'Sign in first' });
  const u = await fetch(URL_ + '/auth/v1/user', { headers: { apikey: KEY, Authorization: auth } });
  if (!u.ok) return res.status(401).json({ error: 'Session expired, please log in again' });
  const email = String(((await u.json()) || {}).email || '').toLowerCase();
  if (!email) return res.status(401).json({ error: 'Sign in first' });

  const rest = (path, opt = {}) => fetch(URL_ + '/rest/v1/' + path, { ...opt, headers: { apikey: KEY, 'Content-Type': 'application/json', ...(opt.headers || {}) } });
  const e = encodeURIComponent(email);
  const [m, a] = await Promise.all([rest('members?select=status&email=eq.' + e), rest('admins?select=email&email=eq.' + e)]);
  const mem = m.ok ? await m.json() : [], adm = a.ok ? await a.json() : [];
  if (!(adm.length || mem.some((x) => x.status === 'active'))) return res.status(403).json({ error: 'Members only' });

  // 2) Validate the rows.
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (err) { body = null; } }
  const list = body && Array.isArray(body.brands) ? body.brands.slice(0, MAX_ROWS) : [];
  const now = new Date().toISOString();
  const rows = [];
  for (const x of list) {
    const b = s(x && x.b, 120).trim(), k = bkey(b);
    if (!b || k.length < 2) continue;
    const site = s(x.site, 200).replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    // Same compact row format as the master list: [brand, tts, categories, commission, earn, creators, s30, sall, score, rating, reviews, site]
    const r = [b, 'U', s(x.c, 300), s(x.comm, 300), num(x.earn, 1e9) || 0, num(x.cr, 1e7), num(x.s30, 1e7), num(x.sall, 1e8), num(x.score, 100), num(x.rating, 5), num(x.rev, 1e6), site];
    rows.push({ key: 'pb_' + k, value: { r, u: now } });
  }
  if (!rows.length) return res.status(200).json({ ok: true, saved: 0 });

  // 3) Save (insert or update each brand).
  const w = await rest('site_meta?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) });
  if (!w.ok) return res.status(500).json({ error: 'Could not save (' + w.status + ')' });
  return res.status(200).json({ ok: true, saved: rows.length });
};
