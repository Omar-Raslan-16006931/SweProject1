// Milestone 1 adversarial QA suite (see README.md in this folder).
const path = require('path');
const BACKEND = path.resolve(__dirname, '..', '..');
const ROOT = path.resolve(BACKEND, '..');
// Settings match the local test .env described in test/e2e/README.md; override with environment variables.
const CFG = {
  api: process.env.QA_API ?? 'http://127.0.0.1:3001',
  mongoUri: process.env.QA_MONGO ?? 'mongodb://127.0.0.1:27017',
  dbName: process.env.QA_DB ?? 'travel_test',
  adminEmail: process.env.QA_ADMIN_EMAIL ?? 'admin@travel.local',
  adminPassword: process.env.QA_ADMIN_PASSWORD ?? 'Admin12345',
  webhookSecret: process.env.QA_WEBHOOK_SECRET ?? 'whsec_local_test_secret',
  stripeFake: process.env.QA_STRIPE_FAKE ?? 'http://127.0.0.1:12111',
  jwtSecret: process.env.QA_JWT_SECRET ?? 'test-access-secret',
  fxFailFlag: path.join(BACKEND, 'test', 'e2e', 'fakes', 'FX_FAIL'),
  uploadsDir: path.resolve(BACKEND, process.env.QA_UPLOADS_DIR ?? process.env.UPLOADS_DIR ?? 'uploads'),
  backend: BACKEND,
  root: ROOT,
};
const { MongoClient, ObjectId } = require(path.join(BACKEND, 'node_modules/mongodb'));
const Stripe = require(path.join(BACKEND, 'node_modules/stripe'));
const BASE = `${CFG.api}/api`;
const WEBHOOK_SECRET = CFG.webhookSecret;
const stripe = new Stripe('sk_test_fake_local');

const results = [];
let section = '';
function setSection(s) { section = s; console.log(`\n=== ${s}`); }
function check(id, name, cond, extra) {
  const ok = !!cond;
  results.push({ section, id, name, ok, extra: ok ? undefined : extra });
  console.log(`${ok ? '  ok  ' : '  FAIL'} [${id}] ${name}${ok ? '' : '  ->  ' + JSON.stringify(extra ?? '').slice(0, 400)}`);
  return ok;
}

class Client {
  constructor(label = '') { this.cookies = {}; this.label = label; this.rawSetCookie = []; }
  async req(method, p, body, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    const c = Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    if (c) headers.cookie = c;
    let payload;
    if (body instanceof FormData) payload = body;
    else if (opts.raw !== undefined) { payload = opts.raw; }
    else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(BASE + p, { method, headers, body: payload });
    const sc = res.headers.getSetCookie?.() || [];
    if (sc.length) this.rawSetCookie = sc;
    for (const s of sc) {
      const [kv] = s.split(';'); const [k, ...v] = kv.split('='); const val = v.join('=');
      if (!val || /Expires=Thu, 01 Jan 1970/i.test(s)) delete this.cookies[k]; else this.cookies[k] = val;
    }
    const ct = res.headers.get('content-type') || '';
    let data;
    if (ct.includes('json')) data = await res.json(); else data = Buffer.from(await res.arrayBuffer());
    return { status: res.status, data, headers: res.headers };
  }
  get(p, o) { return this.req('GET', p, undefined, o); }
  post(p, b, o) { return this.req('POST', p, b, o); }
  patch(p, b) { return this.req('PATCH', p, b); }
  put(p, b) { return this.req('PUT', p, b); }
  del(p, b) { return this.req('DELETE', p, b); }
  login(email, password) { return this.post('/auth/login', { email, password }); }
}

// ---- dates
const DAY = 86400000;
function isoDate(d) { return d.toISOString().slice(0, 10); }
function D(n) { return isoDate(new Date(Date.now() + n * DAY)); }
// local "YYYY-MM-DDTHH:mm" n days from now at hh:mm (airport-local wall clock)
function L(n, hhmm) { return `${D(n)}T${hhmm}`; }

// ---- db
let db; let mongo;
async function dbc() {
  if (!db) { mongo = await MongoClient.connect(CFG.mongoUri); db = mongo.db(CFG.dbName); }
  return db;
}
async function closeDb() { if (mongo) await mongo.close(); }

// ---- stripe webhook
async function sendWebhook(type, object) {
  const payload = JSON.stringify({ id: 'evt_' + Math.random().toString(36).slice(2), object: 'event', type, data: { object } });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  const res = await fetch(BASE + '/payments/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': header }, body: payload });
  return { status: res.status, data: await res.json().catch(() => null) };
}

let uniq = 0;
const u = (p = 'x') => `${p}${Date.now().toString(36)}${(++uniq).toString(36)}`;

async function newUser(name = 'Test User') {
  const c = new Client(name);
  const email = `${u('user')}@qa.test`;
  const r = await c.post('/auth/register', { name, email, password: 'Passw0rd1', acceptTerms: true });
  if (r.status !== 201) throw new Error('register failed ' + JSON.stringify(r.data));
  const l = await c.login(email, 'Passw0rd1');
  if (l.status !== 200) throw new Error('login failed ' + JSON.stringify(l.data));
  c.email = email; c.id = r.data.id; c.password = 'Passw0rd1';
  return c;
}

/** Full payment: accept policies, create PI, test-confirm, deliver signed webhook. Returns payment id. */
async function pay(c, type, bookingId, { accept = true, webhook = true } = {}) {
  if (accept) {
    const a = await c.post(`/bookings/${type}/${bookingId}/accept-policies`);
    if (a.status !== 200) return { error: 'accept', r: a };
  }
  const p = await c.post('/payments', { bookingType: type, bookingId });
  if (p.status !== 201) return { error: 'create', r: p };
  const t = await c.post(`/payments/${p.data.id}/test-confirm`, { paymentMethod: 'pm_card_visa' });
  if (t.status !== 200) return { error: 'confirm', r: t };
  let w;
  if (webhook) w = await sendWebhook('payment_intent.succeeded', { id: p.data.stripePaymentIntentId, object: 'payment_intent', status: 'succeeded', amount: Math.round(p.data.amount * 100), currency: 'usd' });
  return { paymentId: p.data.id, intentId: p.data.stripePaymentIntentId, payment: p.data, webhook: w };
}

function png(bytes = 200) {
  const b = Buffer.alloc(bytes); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); return b;
}
function jpg(bytes = 200) { const b = Buffer.alloc(bytes); b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; return b; }
function form(field, files) {
  const fd = new FormData();
  for (const f of files) fd.append(field, new Blob([f.buf], { type: f.type }), f.name);
  return fd;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { CFG, Client, check, results, setSection, D, L, DAY, dbc, closeDb, ObjectId, sendWebhook, newUser, pay, png, jpg, form, u, sleep, isoDate };
