// Minimal fake Stripe API for local tests: payment_intents (create/retrieve/confirm/cancel) and refunds.
const http = require('http');
const qs = require('querystring');
const intents = new Map(); const refunds = new Map(); let n = 0;
const id = (p) => `${p}_test${(++n).toString().padStart(6, '0')}`;
http.createServer((req, res) => {
  let body = ''; req.on('data', (c) => (body += c)); req.on('end', () => {
    const p = qs.parse(body); const url = req.url.split('?')[0]; const send = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    let m;
    if (req.method === 'POST' && url === '/v1/payment_intents') {
      const pi = { id: id('pi'), object: 'payment_intent', amount: Number(p.amount), currency: p.currency, status: 'requires_payment_method', client_secret: null, metadata: {} };
      pi.client_secret = `${pi.id}_secret_x`; for (const k of Object.keys(p)) { const mm = k.match(/^metadata\[(.+)\]$/); if (mm) pi.metadata[mm[1]] = p[k]; }
      intents.set(pi.id, pi); return send(200, pi);
    }
    if ((m = url.match(/^\/v1\/payment_intents\/([^/]+)$/)) && req.method === 'GET') { const pi = intents.get(m[1]); return pi ? send(200, pi) : send(404, { error: { message: 'No such payment_intent', type: 'invalid_request_error' } }); }
    if ((m = url.match(/^\/v1\/payment_intents\/([^/]+)\/confirm$/))) {
      const pi = intents.get(m[1]); if (!pi) return send(404, { error: { message: 'No such payment_intent', type: 'invalid_request_error' } });
      if (String(p.payment_method).includes('Declined')) { pi.status = 'requires_payment_method'; return send(402, { error: { message: 'Your card was declined.', type: 'card_error', code: 'card_declined' } }); }
      pi.status = 'succeeded'; return send(200, pi);
    }
    if ((m = url.match(/^\/v1\/payment_intents\/([^/]+)\/cancel$/))) { const pi = intents.get(m[1]); if (!pi) return send(404, { error: { message: 'nf', type: 'invalid_request_error' } }); pi.status = 'canceled'; return send(200, pi); }
    if (req.method === 'POST' && url === '/v1/refunds') {
      const pi = intents.get(p.payment_intent); if (!pi || pi.status !== 'succeeded') return send(400, { error: { message: 'PaymentIntent not succeeded', type: 'invalid_request_error' } });
      const r = { id: id('re'), object: 'refund', amount: Number(p.amount), payment_intent: pi.id, status: 'pending', metadata: {} }; refunds.set(r.id, r); return send(200, r);
    }
    if (url === '/__state') return send(200, { intents: [...intents.values()], refunds: [...refunds.values()] });
    send(404, { error: { message: `fake stripe: ${req.method} ${url} not implemented`, type: 'invalid_request_error' } });
  });
}).listen(12111, () => console.log('FAKE_STRIPE_READY'));
