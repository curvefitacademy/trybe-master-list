// Returns the email a buyer used at Stripe checkout, so the sign-up form can use the exact same one.
// Needs STRIPE_SECRET_KEY. Only answers for completed checkout sessions.
const Stripe = require('stripe');

module.exports = async (req, res) => {
  const id = String((req.query && req.query.session_id) || '');
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) { res.status(400).json({ error: 'Missing or invalid session_id' }); return; }
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const s = await stripe.checkout.sessions.retrieve(id);
    if (s.status !== 'complete') { res.status(404).json({ error: 'Checkout not complete' }); return; }
    const email = ((s.customer_details && s.customer_details.email) || s.customer_email || '').toLowerCase();
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ email });
  } catch (err) {
    res.status(404).json({ error: 'Checkout not found' });
  }
};
