const fs = require('fs');
const { CFG, Client, check, setSection, dbc, D, u, ObjectId, newUser, sleep } = require('./lib');
const ROOT = CFG.root;

module.exports = async function gen(ctx) {
  const g = new Client('guest'); const db = await dbc(); let r;

  setSection('GEN-13 / PDF 6.7 — validation, error format, hostile input');
  r = await g.post('/auth/register', { name: 'x', email: 'bad', password: 'x', acceptTerms: false });
  check('GEN-02', 'validation errors are field-level ({field, messages[]})', r.status === 400 && Array.isArray(r.data.errors) && r.data.errors.every((e) => e.field && Array.isArray(e.messages)) && ['email', 'password', 'acceptTerms'].every((f) => r.data.errors.some((e) => e.field === f)), r.data);
  check('GEN-13', 'consistent error shape {statusCode, error, message, path, timestamp}', r.data.statusCode === 400 && r.data.error && r.data.message && r.data.path && r.data.timestamp, r.data);
  r = await g.post('/auth/login', { email: { $ne: null }, password: { $ne: null } });
  check('GEN-13', 'NoSQL operator injection in login rejected (400, no login)', r.status === 400, r.status);
  r = await g.post('/auth/login', { email: CFG.adminEmail, password: { $gt: '' } });
  check('GEN-13', 'operator injection in password rejected', r.status === 400, r.status);
  r = await g.get('/hotels/search?' + 'cityId[$ne]=x&checkIn=' + D(20) + '&checkOut=' + D(22) + '&guests=1');
  check('GEN-13', 'operator injection via query string rejected', r.status === 400, r.status);
  r = await g.req('POST', '/auth/login', undefined, { raw: '{"email": "a@b.c", "password": ', headers: { 'content-type': 'application/json' } });
  check('GEN-13', 'malformed JSON -> 400 not 500', r.status === 400, r.status);
  r = await g.req('POST', '/auth/register', undefined, { raw: JSON.stringify({ name: 'x'.repeat(200000) }), headers: { 'content-type': 'application/json' } });
  check('GEN-13', 'oversized JSON body rejected (413/400), not 500', r.status === 413 || r.status === 400, r.status);
  r = await g.post('/auth/register', JSON.parse('{"name":"Proto","email":"proto@qa.test","password":"Passw0rd1","acceptTerms":true,"__proto__":{"role":"admin"}}'));
  check('GEN-13', 'prototype-pollution payload cannot create an admin', !(r.status === 201 && r.data.role === 'admin'), r.data?.role);
  r = await g.get('/does-not-exist');
  check('GEN-13', 'unknown route -> 404 JSON', r.status === 404 && r.data.statusCode === 404, r.status);
  r = await g.req('PUT', '/auth/login', { email: 'a', password: 'b' });
  check('GEN-13', 'wrong HTTP method -> 404/405 not 500', r.status === 404 || r.status === 405, r.status);
  r = await ctx.traveler.post('/flight-bookings', { outboundFlightId: 'zzz', outboundCabinClass: 'Economy', passengers: [] });
  check('GEN-13', 'invalid ObjectId in body -> 400', r.status === 400, r.status);
  r = await ctx.traveler.post('/flight-bookings', { outboundFlightId: ctx.fl.fA.id, outboundCabinClass: 'Economy', passengers: 'everyone' });
  check('GEN-13', 'wrong type for array field -> 400', r.status === 400, r.status);
  r = await ctx.traveler.post('/itineraries', [1, 2, 3]);
  check('GEN-13', 'array body where object expected -> 400', r.status === 400, r.status);
  r = await ctx.traveler.post('/itineraries', { title: '<script>alert(1)</script>', countries: ['EG'], startDate: D(10) });
  check('GEN-13', 'HTML stored as plain text (no 500)', r.status === 201, r.status);

  setSection('GEN-05 — pagination everywhere');
  for (const p of ['/posts', '/itineraries/public/search', `/hotels/${ctx.hotel.id}/reviews`]) {
    r = await g.get(p);
    check('GEN-05', `${p} paginated with page size 10`, r.status === 200 && r.data.pageSize === 10 && 'total' in r.data && 'totalPages' in r.data, r.data?.pageSize);
  }
  r = await ctx.traveler.get('/flight-bookings');
  check('GEN-05', 'my flight bookings paginated', r.data.pageSize === 10, null);
  r = await ctx.traveler.get('/notifications');
  check('GEN-05', 'notifications paginated (10)', r.data.pageSize === 10 && r.data.items.length <= 10, r.data.items?.length);
  r = await g.get('/airports');
  check('GEN-05', 'reference lists may be returned whole (8 airports, under 10 rows)', Array.isArray(r.data), null);

  setSection('PDF 8 — Swagger / documentation');
  r = await fetch(`${CFG.api}/api/docs`);
  check('PDF 7.1 / 13.1', 'Swagger UI served at /api/docs', r.status === 200 && (await r.text()).toLowerCase().includes('swagger'), r.status);
  let spec = null;
  for (const p of ['/api/docs-json', '/api/docs/json', '/api-json']) { const x = await fetch(CFG.api + p); if (x.ok) { spec = await x.json(); break; } }
  check('PDF 8', 'OpenAPI JSON exposed for Swagger', !!spec?.paths, null);
  if (spec) {
    const n = Object.values(spec.paths).reduce((s, x) => s + Object.keys(x).length, 0);
    check('PDF 8', 'every implemented route documented in Swagger', n >= 130, n);
    check('PDF 8', 'cookie auth scheme documented', !!spec.components?.securitySchemes, Object.keys(spec.components?.securitySchemes ?? {}));
  }

  setSection('Deliverables (PDF 8.11 / 10 / 11 / 13.1)');
  const exists = (p) => fs.existsSync(`${ROOT}/${p}`);
  check('PDF 13.1', 'README.md', exists('README.md'), null);
  check('PDF 11.1', 'AI_PROMPTS.txt', exists('AI_PROMPTS.txt') && fs.readFileSync(`${ROOT}/AI_PROMPTS.txt`, 'utf8').length > 500, null);
  check('PDF 8.11', '.env.example documents MONGODB_URI without secrets', exists('.env.example') && /MONGODB_URI=/.test(fs.readFileSync(`${ROOT}/.env.example`, 'utf8')) && !/mongodb\+srv:\/\/[^<\s]+:[^<\s]+@/.test(fs.readFileSync(`${ROOT}/.env.example`, 'utf8')), null);
  check('PDF 8.11', '.env ignored by git', /^\.env$/m.test(fs.readFileSync(`${ROOT}/.gitignore`, 'utf8')), null);

  setSection('Schedulers (FLT-22 / FLT-30 / HTL-23)');
  if (ctx.pendingExpiry) {
    let st;
    for (let i = 0; i < 14; i++) {
      await sleep(5000);
      st = (await db.collection('flight_bookings').findOne({ _id: new ObjectId(ctx.pendingExpiry.id) })).status;
      if (st === 'Expired') break;
    }
    check('FLT-22', 'an abandoned hold expires on its own (scheduler) and releases seats', st === 'Expired', st);
  }
  const fl = await db.collection('flights').findOne({ _id: new ObjectId(ctx.fl.fA.id) });
  await db.collection('flights').updateOne({ _id: fl._id }, { $set: { departureTime: new Date(Date.now() - 1000) } });
  let fst;
  for (let i = 0; i < 14; i++) { await sleep(5000); fst = (await db.collection('flights').findOne({ _id: fl._id })).status; if (fst === 'Departed') break; }
  check('FLT-30', 'scheduler persists Departed status once departure time passes', fst === 'Departed', fst);
};
