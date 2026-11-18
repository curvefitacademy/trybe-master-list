// Script maker for the Top 100 videos.
// POST { mode: 'transcript', id, url }                       -> { text }
// POST { mode: 'breakdown', id, url }                        -> { text, breakdown: { summary, lines[{label,text,why}], format[{label,how}] } }
// POST { mode: 'write', id, url, brand, product, points, notes } -> { text, script }
// Breakdowns are made once per video and cached in site_meta 'bd_<id>'.
// The spoken script of each video is transcribed once with OpenAI and cached in site_meta 'tx_<id>'.
// Only signed-in active members (or the admin) can use it, with a daily limit on new scripts.
// Needs Vercel env vars: OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SECRET_KEY (optional OPENAI_MODEL).
const crypto = require('crypto');

const DAILY_WRITES = 30;
const s = (v, n) => String(v == null ? '' : v).slice(0, n);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const URL_ = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const KEY = process.env.SUPABASE_SECRET_KEY, OAI = process.env.OPENAI_API_KEY;
  if (!URL_ || !KEY) return res.status(500).json({ error: 'Server not configured' });
  if (!OAI) return res.status(503).json({ error: 'The script maker is not switched on yet. (Missing OPENAI_API_KEY in Vercel.)' });

  // 1) Members only
  const auth = String(req.headers.authorization || '');
  if (!/^Bearer [\w.-]+$/.test(auth)) return res.status(401).json({ error: 'Please log in again.' });
  const u = await fetch(URL_ + '/auth/v1/user', { headers: { apikey: KEY, Authorization: auth } });
  if (!u.ok) return res.status(401).json({ error: 'Your login expired. Please refresh the page and log in again.' });
  const email = String(((await u.json()) || {}).email || '').toLowerCase();
  const rest = (path, opt = {}) => fetch(URL_ + '/rest/v1/' + path, { ...opt, headers: { apikey: KEY, 'Content-Type': 'application/json', ...(opt.headers || {}) } });
  const e = encodeURIComponent(email);
  const [m, a] = await Promise.all([rest('members?select=status&email=eq.' + e), rest('admins?select=email&email=eq.' + e)]);
  const mem = m.ok ? await m.json() : [], adm = a.ok ? await a.json() : [];
  if (!(adm.length || mem.some((x) => x.status === 'active'))) return res.status(403).json({ error: 'Members only' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (err) { body = {}; } }
  body = body || {};
  const id = s(body.id, 64);
  if (!/^[\w-]{8,64}$/.test(id)) return res.status(400).json({ error: 'Unknown video' });

  // 2) Transcript (cached)
  const getMeta = async (key) => { const r = await rest('site_meta?select=value&key=eq.' + encodeURIComponent(key)); const j = r.ok ? await r.json() : []; return j[0] ? j[0].value : null; };
  const putMeta = (key, value) => rest('site_meta?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key, value }) });
  let tx = await getMeta('tx_' + id);
  if (!tx || !tx.t) {
    const url = s(body.url, 400);
    let ok = false; try { const p = new URL(url); ok = p.protocol === 'https:' && p.hostname === 'cdn.jointrybe.com' && p.pathname.includes(id); } catch (err) {}
    if (!ok) return res.status(400).json({ error: 'Unknown video' });
    const v = await fetch(url);
    if (!v.ok) return res.status(502).json({ error: 'Could not load that video from Trybe.' });
    const buf = Buffer.from(await v.arrayBuffer());
    if (buf.length > 24 * 1024 * 1024) return res.status(413).json({ error: 'That video is too long to transcribe.' });
    const transcribe = async (model) => {
      const fd = new FormData();
      fd.append('file', new Blob([buf], { type: 'video/mp4' }), 'video.mp4');
      fd.append('model', model);
      const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + OAI }, body: fd });
      return r.ok ? ((await r.json()).text || '') : null;
    };
    let text = await transcribe('gpt-4o-mini-transcribe');
    if (text == null) text = await transcribe('whisper-1');
    if (text == null) return res.status(502).json({ error: 'Transcription failed. Please try again in a minute.' });
    tx = { t: text.trim(), at: new Date().toISOString() };
    await putMeta('tx_' + id, tx);
  }
  const chat = async (messages, opts = {}) => {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: 'Bearer ' + OAI, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', messages, ...opts }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
  };

  // 3) Line-by-line breakdown of the original (made once per video, shared by every member)
  let bd = await getMeta('bd_' + id);
  if (body.mode === 'breakdown' && !(bd && Array.isArray(bd.lines) && bd.lines.length)) {
    if (!tx.t) return res.status(200).json({ text: tx.t, breakdown: null });
    const sys = [
      'You are a viral TikTok and UGC script analyst. Break the transcript of a top performing video into its beats, in order.',
      'Return JSON only: {"summary": "one sentence naming the overall formula", "lines": [{"label": "Hook", "text": "the exact words from the transcript", "why": "why this beat works, max 15 words"}], "format": [{"label": "Hook", "how": "a reusable, product-neutral fill-in-the-blank template for this beat using ___ for blanks, then a short tip"}]}.',
      'Use short standard beat names such as: Hook, Open curiosity loop, Pain point, Relatable moment, Credibility, Product reveal, Benefit, Demo, Social proof, Objection handling, Urgency, Close the loop, CTA.',
      'When a beat type repeats, number every one of them (Pain point 1, Pain point 2, Benefit 1, Benefit 2).',
      'Every word of the transcript belongs to exactly one beat, in the original order and wording. Use at most 20 beats.',
      '"format" has the same number of items and the same labels as "lines".',
    ].join(' ');
    const out = await chat([{ role: 'system', content: sys }, { role: 'user', content: 'TRANSCRIPT:\n' + tx.t.slice(0, 6000) }], { temperature: 0.2, max_tokens: 2500, response_format: { type: 'json_object' } });
    let p = null; try { p = JSON.parse(out); } catch (err) {}
    if (!p || !Array.isArray(p.lines) || !p.lines.length) return res.status(502).json({ error: 'The breakdown is busy. Please try again in a minute.' });
    const lines = p.lines.slice(0, 20).map((x) => ({ label: s(x && x.label, 40).trim() || 'Beat', text: s(x && x.text, 1200).trim(), why: s(x && x.why, 200).trim() })).filter((x) => x.text);
    const fm = Array.isArray(p.format) ? p.format : [];
    const format = lines.map((x, i) => ({ label: x.label, how: s(fm[i] && fm[i].how, 400).trim() }));
    bd = { summary: s(p.summary, 300).trim(), lines, format, at: new Date().toISOString() };
    await putMeta('bd_' + id, bd);
  }
  if (body.mode === 'breakdown') return res.status(200).json({ text: tx.t, breakdown: bd });
  if (body.mode !== 'write') return res.status(200).json({ text: tx.t, breakdown: bd && bd.lines ? bd : null });

  // 4) Write the member's version (daily limit per member)
  const product = s(body.product, 120).trim();
  if (!product) return res.status(400).json({ error: 'Add your product name first.' });
  const day = new Date().toISOString().slice(0, 10);
  const rlKey = 'rl_' + crypto.createHash('sha256').update(email + '|' + day).digest('hex').slice(0, 24);
  const used = ((await getMeta(rlKey)) || {}).n || 0;
  if (used >= DAILY_WRITES) return res.status(429).json({ error: `You've made ${DAILY_WRITES} scripts today. The limit resets tomorrow.` });

  const system = [
    'You are a viral TikTok and UGC scriptwriter. You write like a creator recommending a lifehack or a solution to a friend, not like a salesperson.',
    'You will get the transcript of a video that ranked in the Trybe Top 100 and details about a different product.',
    "Write a new script for the new product that keeps what made the original work: the hook style, the structure and order of beats, the pacing, the length (about the same word count) and the type of call to action.",
    "Don't copy the original's distinctive lines word for word. Don't invent claims, results, prices or discounts that the creator didn't give you, and avoid medical or guaranteed-results claims.",
    'Format: start with a line "WHY THE ORIGINAL WORKS:" (one or two sentences), then "HOOK:", then "SCRIPT:" with the spoken lines (put any on-screen text or shot ideas in [brackets]), then "CTA:". Plain text, no markdown.',
  ].join(' ');
  const beats = bd && Array.isArray(bd.lines) && bd.lines.length ? '\nBEATS OF THE ORIGINAL, IN ORDER (follow this structure): ' + bd.lines.map((x) => x.label).join(' -> ') + '\n' : '';
  const user = `ORIGINAL VIDEO (brand: ${s(body.brand, 120)}):\n"""${tx.t.slice(0, 6000)}"""\n${beats}\nNEW PRODUCT: ${product}\nWHAT IT DOES / KEY POINTS: ${s(body.points, 800)}\nEXTRA NOTES FROM THE CREATOR: ${s(body.notes, 500)}`;
  const out = await chat([{ role: 'system', content: system }, { role: 'user', content: user }], { temperature: 0.8, max_tokens: 900 });
  if (out == null) return res.status(502).json({ error: 'The script writer is busy. Please try again in a minute.' });
  const script = s(out, 6000).trim();
  await putMeta(rlKey, { n: used + 1 });
  return res.status(200).json({ text: tx.t, script, left: DAILY_WRITES - used - 1 });
};
module.exports.config = { maxDuration: 60 };
