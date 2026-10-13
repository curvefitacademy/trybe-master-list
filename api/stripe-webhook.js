// Stripe -> member list. Gives buyers access when they pay and removes it when they cancel.
// Needs these Vercel environment variables:
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SECRET_KEY
const Stripe = require('stripe');

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sbHeaders(extra) {
  const key = process.env.SUPABASE_SECRET_KEY || '';
  const h = Object.assign({ apikey: key, 'Content-Type': 'application/json' }, extra || {});
  if (key.startsWith('eyJ')) h.Authorization = 'Bearer ' + key; // legacy service_role key
  return h;
}
const sbUrl = (path) => process.env.SUPABASE_URL.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '') + '/rest/v1/' + path;

async function upsertMember(row) {
  const r = await fetch(sbUrl('members?on_conflict=email'), {
    method: 'POST',
    headers: sbHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error('Supabase upsert ' + r.status + ': ' + (await r.text()));
}

async function patchMembers(filter, body) {
  const r = await fetch(sbUrl('members?' + filter), {
    method: 'PATCH',
    headers: sbHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('Supabase update ' + r.status + ': ' + (await r.text()));
  return r.json();
}

async function setStatusForCustomer(stripe, customerId, status) {
  const now = new Date().toISOString();
  const rows = await patchMembers('stripe_customer_id=eq.' + encodeURIComponent(customerId), { status, updated_at: now });
  if (rows.length) return;
  // Fallback: match by the customer's email
  const cust = await stripe.customers.retrieve(customerId);
  const email = (cust && !cust.deleted && cust.email || '').toLowerCase();
  if (!email) return;
  if (status === 'active') {
    await upsertMember({ email, status, source: 'stripe', stripe_customer_id: customerId, updated_at: now });
  } else {
    await patchMembers('email=eq.' + encodeURIComponent(email), { status, updated_at: now });
  }
}

const ACTIVE = new Set(['active', 'trialing', 'past_due']); // past_due: Stripe is still retrying the card
const ENDED = new Set(['canceled', 'unpaid', 'incomplete_expired', 'paused']);

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  let event;
  try {
    const raw = await readRawBody(req);
    event = stripe.webhooks.constructEvent(raw, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    res.status(400).send('Webhook signature check failed: ' + err.message);
    return;
  }
  try {
    const o = event.data.object;
    switch (event.type) {
      case 'checkout.session.completed': {
        const email = ((o.customer_details && o.customer_details.email) || o.customer_email || '').toLowerCase();
        if (email) await upsertMember({ email, status: 'active', source: 'stripe', stripe_customer_id: o.customer || null, updated_at: new Date().toISOString() });
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const s = event.type === 'customer.subscription.deleted' ? 'canceled' : o.status;
        if (ACTIVE.has(s)) await setStatusForCustomer(stripe, o.customer, 'active');
        else if (ENDED.has(s)) await setStatusForCustomer(stripe, o.customer, 'canceled');
        break;
      }
      case 'invoice.paid': {
        if (o.customer) await setStatusForCustomer(stripe, o.customer, 'active');
        break;
      }
      default: break;
    }
    res.status(200).json({ received: true });
  } catch (err) {
    console.error(err);
    res.status(500).send('Handler error: ' + err.message); // Stripe will retry
  }
};
module.exports.config = { api: { bodyParser: false } };
