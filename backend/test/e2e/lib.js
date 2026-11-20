const BASE = 'http://127.0.0.1:3001/api';
const results = []; let failures = 0;
function check(name, cond, extra) {
  results.push({ name, ok: !!cond });
  if (!cond) { failures++; console.log('  FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 600) : ''); }
  else console.log('  ok  ', name);
}
class Client {
  constructor() { this.cookies = {}; }
  async req(method, path, body, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    const c = Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    if (c) headers.cookie = c;
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(BASE + path, { method, headers, body: payload });
    for (const sc of res.headers.getSetCookie?.() || []) {
      const [kv] = sc.split(';'); const [k, ...v] = kv.split('='); const val = v.join('=');
      if (!val || /Expires=Thu, 01 Jan 1970/i.test(sc)) delete this.cookies[k]; else this.cookies[k] = val;
    }
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data, headers: res.headers };
  }
  get(p, o) { return this.req('GET', p, undefined, o); }
  post(p, b, o) { return this.req('POST', p, b, o); }
  patch(p, b) { return this.req('PATCH', p, b); }
  put(p, b) { return this.req('PUT', p, b); }
  del(p) { return this.req('DELETE', p); }
  async login(email, password) { return this.post('/auth/login', { email, password }); }
}
module.exports = { Client, check, results, get failures() { return failures; }, BASE };
