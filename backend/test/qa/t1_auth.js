const { Client, check, setSection, dbc, u, newUser, sleep } = require('./lib');

module.exports = async function auth(ctx) {
  setSection('ACC — registration (ACC-01)');
  const g = new Client('guest');
  const email = `${u('reg')}@qa.test`;
  const base = { name: 'Reg User', email, password: 'Passw0rd1', acceptTerms: true };
  let r;
  r = await g.post('/auth/register', { ...base, password: 'short1' });
  check('ACC-01', 'password < 8 chars rejected 400 with field error', r.status === 400 && JSON.stringify(r.data).includes('password'), r.data);
  r = await g.post('/auth/register', { ...base, password: 'abcdefgh' });
  check('ACC-01', 'password without digit rejected', r.status === 400, r.status);
  r = await g.post('/auth/register', { ...base, password: '12345678' });
  check('ACC-01', 'password without letter rejected', r.status === 400, r.status);
  r = await g.post('/auth/register', { ...base, email: `${u('a')}@qa.test`, acceptTerms: false });
  check('ACC-01', 'consent=false rejected', r.status === 400, r.status);
  r = await g.post('/auth/register', { name: 'X', email: `${u('a')}@qa.test`, password: 'Passw0rd1' });
  check('ACC-01', 'missing consent rejected', r.status === 400, r.status);
  r = await g.post('/auth/register', { ...base, email: `${u('a')}@qa.test`, acceptTerms: 'true' });
  check('ACC-01', 'consent as string "true" rejected (must be boolean)', r.status === 400, r.status);
  for (const bad of ['notanemail', 'a@', '@b.com', 'a b@c.com', '']) {
    r = await g.post('/auth/register', { ...base, email: bad });
    check('ACC-01', `invalid email "${bad}" rejected`, r.status === 400, r.status);
  }
  r = await g.post('/auth/register', { ...base, name: '   ' });
  check('ACC-01', 'whitespace-only name rejected', r.status === 400, r.status);
  r = await g.post('/auth/register', { ...base, name: 'x'.repeat(5000), email: `${u('a')}@qa.test` });
  check('ACC-01', 'absurdly long name rejected', r.status === 400, r.status);
  r = await g.post('/auth/register', { ...base, role: 'admin', email: `${u('a')}@qa.test` });
  check('ACC-18', 'register with role=admin is rejected (no admin self-registration)', r.status === 400, { s: r.status, role: r.data?.role });
  r = await g.post('/auth/register', base);
  check('ACC-01', 'valid registration 201', r.status === 201 && r.data.role === 'user', r);
  check('GEN-13', 'response never exposes password hash', !JSON.stringify(r.data).toLowerCase().includes('hash'), r.data);
  r = await g.post('/auth/register', base);
  check('ACC-01', 'duplicate email rejected 409', r.status === 409, r.status);
  r = await g.post('/auth/register', { ...base, email: email.toUpperCase() });
  check('ACC-01', 'duplicate email in different case rejected', r.status === 409, r.status);
  r = await g.post('/auth/register', { ...base, email: `  ${email}  ` });
  check('ACC-01', 'duplicate email with surrounding spaces rejected', r.status === 409 || r.status === 400, r.status);
  // concurrent duplicate registrations must not create two accounts
  const em2 = `${u('race')}@qa.test`;
  const rs = await Promise.all(Array.from({ length: 6 }, () => g.post('/auth/register', { ...base, email: em2 })));
  const created = rs.filter((x) => x.status === 201).length;
  check('ACC-01', 'concurrent duplicate registration creates exactly one account', created === 1 && rs.every((x) => [201, 409].includes(x.status)), rs.map((x) => x.status));
  const db = await dbc();
  check('GEN-13', 'password stored only as salted bcrypt hash', /^\$2[aby]\$\d\d\$/.test((await db.collection('users').findOne({ email })).passwordHash), null);
  // long password registered must be usable for login
  const longPw = 'A1' + 'x'.repeat(300);
  const em3 = `${u('long')}@qa.test`;
  r = await g.post('/auth/register', { ...base, email: em3, password: longPw });
  if (r.status === 201) {
    const l = await new Client().login(em3, longPw);
    check('ACC-01/04', 'a password accepted at registration can be used to log in (300 chars)', l.status === 200, { status: l.status, msg: l.data?.message, errors: l.data?.errors });
  } else check('ACC-01', 'very long password either rejected at registration or usable', r.status === 400, r.status);

  setSection('ACC — login, lockout, session (ACC-04/05/06/19)');
  const c = new Client('login');
  r = await c.login(email, 'wrongpass1');
  check('ACC-04', 'wrong password -> 401 generic "invalid email or password"', r.status === 401 && /invalid email or password/i.test(r.data.message), r.data);
  r = await c.login('nobody@qa.test', 'wrongpass1');
  check('ACC-04', 'unknown email -> same generic message (no enumeration)', r.status === 401 && /invalid email or password/i.test(r.data.message), r.data);
  r = await c.login(email.toUpperCase(), 'Passw0rd1');
  check('ACC-04', 'login is case-insensitive on email', r.status === 200, r.status);
  check('ACC-04', 'login returns role home path', r.data.homePath === '/', r.data);
  const sc = c.rawSetCookie.join(' | ');
  check('ACC-19', 'access & refresh cookies are HttpOnly', (sc.match(/HttpOnly/gi) || []).length >= 2, sc);
  check('ACC-19', 'cookies have SameSite', /SameSite=/i.test(sc), sc);
  check('ACC-19', 'login body contains no token', !/eyJ/.test(JSON.stringify(r.data)), null);
  r = await c.get('/auth/me');
  check('ACC-19', 'GET /auth/me returns current user', r.status === 200 && r.data.email === email, r.status);
  r = await new Client().get('/auth/me');
  check('ACC-19', 'GET /auth/me without cookie -> 401', r.status === 401, r.status);
  r = await new Client().get('/auth/me', { headers: { authorization: 'Bearer ' + c.cookies.access_token } });
  check('ACC-19', 'token in Authorization header is NOT accepted (cookies only)', r.status === 401, r.status);
  const forged = new Client(); forged.cookies.access_token = c.cookies.access_token.slice(0, -4) + 'AAAA';
  r = await forged.get('/auth/me');
  check('ACC-19', 'tampered JWT rejected', r.status === 401, r.status);

  // lockout
  const lockEmail = `${u('lock')}@qa.test`;
  await g.post('/auth/register', { ...base, email: lockEmail });
  const lc = new Client();
  const st = [];
  for (let i = 0; i < 4; i++) st.push((await lc.login(lockEmail, 'Wrong1234')).status);
  r = await lc.login(lockEmail, 'Passw0rd1');
  check('ACC-05', 'successful login after 4 failures works and resets counter', r.status === 200, r.status);
  for (let i = 0; i < 4; i++) await lc.login(lockEmail, 'Wrong1234');
  r = await lc.login(lockEmail, 'Passw0rd1');
  check('ACC-05', 'counter was reset by the success (4 new failures do not lock)', r.status === 200, r.status);
  for (let i = 0; i < 5; i++) r = await lc.login(lockEmail, 'Wrong1234');
  check('ACC-05', '5th consecutive failure locks the account with a lockout message', r.status === 423 || /lock/i.test(r.data.message), r.data);
  r = await lc.login(lockEmail, 'Passw0rd1');
  check('ACC-05', 'correct password during lock is refused', r.status !== 200 && /lock/i.test(r.data.message), r.data);
  const lu = await db.collection('users').findOne({ email: lockEmail });
  const mins = (new Date(lu.lockUntil) - Date.now()) / 60000;
  check('ACC-05', 'lock lasts 15 minutes', mins > 14 && mins <= 15.1, mins);
  await db.collection('users').updateOne({ email: lockEmail }, { $set: { lockUntil: new Date(Date.now() - 1000) } });
  r = await lc.login(lockEmail, 'Passw0rd1');
  check('ACC-05', 'login works after the 15 minutes pass', r.status === 200, r.status);

  // parallel brute force must not bypass the 5-attempt lock
  const pEmail = `${u('par')}@qa.test`;
  await g.post('/auth/register', { ...base, email: pEmail });
  await Promise.all(Array.from({ length: 12 }, () => new Client().login(pEmail, 'Wrong1234')));
  const pu = await db.collection('users').findOne({ email: pEmail });
  r = await new Client().login(pEmail, 'Passw0rd1');
  check('ACC-05', '12 parallel wrong-password attempts lock the account (no race bypass)', r.status !== 200 && !!pu.lockUntil, { status: r.status, failed: pu.failedLoginAttempts, lockUntil: pu.lockUntil });

  // logout & revoke
  const lo = new Client();
  await lo.login(email, 'Passw0rd1');
  const savedAccess = lo.cookies.access_token; const savedRefresh = lo.cookies.refresh_token;
  r = await lo.post('/auth/logout');
  check('ACC-06', 'logout 200 and clears cookies', r.status === 200 && !lo.cookies.access_token, lo.cookies);
  const replay = new Client(); replay.cookies.access_token = savedAccess;
  r = await replay.get('/auth/me');
  check('ACC-06', 'old access token rejected after logout (session revoked server-side)', r.status === 401, r.status);
  const replayR = new Client(); replayR.cookies.refresh_token = savedRefresh;
  r = await replayR.post('/auth/refresh');
  check('ACC-06', 'old refresh token rejected after logout', r.status === 401, r.status);
  r = await new Client().post('/auth/logout');
  check('ACC-06', 'logout without session does not crash', r.status === 200, r.status);

  // inactivity
  const ia = new Client();
  await ia.login(email, 'Passw0rd1');
  await db.collection('sessions').updateMany({ user: lu._id ? (await db.collection('users').findOne({ email }))._id : null }, { $set: { lastActivityAt: new Date(Date.now() - 31 * 60000) } });
  r = await ia.get('/auth/me');
  check('ACC-06', 'session idle for 31 minutes expires', r.status === 401, r.status);
  r = await ia.post('/auth/refresh');
  check('ACC-06', 'refresh after 31 idle minutes refused', r.status === 401, r.status);
  const ia2 = new Client();
  await ia2.login(email, 'Passw0rd1');
  await db.collection('sessions').updateMany({ user: (await db.collection('users').findOne({ email }))._id, revokedAt: null }, { $set: { lastActivityAt: new Date(Date.now() - 29 * 60000) } });
  r = await ia2.get('/auth/me');
  check('ACC-06', 'session idle for 29 minutes is still valid', r.status === 200, r.status);
  // refresh token reuse
  const rr = new Client(); await rr.login(email, 'Passw0rd1');
  const oldRt = rr.cookies.refresh_token;
  r = await rr.post('/auth/refresh');
  check('ACC-06', 'refresh rotates token', r.status === 200 && rr.cookies.refresh_token !== oldRt, r.status);
  const reuse = new Client(); reuse.cookies.refresh_token = oldRt;
  r = await reuse.post('/auth/refresh');
  check('ACC-06', 'rotated (old) refresh token cannot be reused', r.status === 401, r.status);

  setSection('ACC — change password, profile (ACC-08/09)');
  const cp = await newUser('Pw Changer');
  r = await cp.patch('/auth/change-password', { currentPassword: 'nope12345', newPassword: 'NewPass123' });
  check('ACC-08', 'wrong current password rejected', r.status >= 400 && r.status < 500 && r.status !== 404, r.status);
  r = await cp.patch('/auth/change-password', { currentPassword: 'Passw0rd1', newPassword: 'weak' });
  check('ACC-08', 'new password breaking rules rejected', r.status === 400, r.status);
  r = await cp.patch('/auth/change-password', { currentPassword: 'Passw0rd1', newPassword: 'NewPass123' });
  check('ACC-08', 'change password ok', r.status === 200, r.data);
  r = await new Client().login(cp.email, 'Passw0rd1');
  check('ACC-08', 'old password no longer works', r.status === 401, r.status);
  r = await new Client().login(cp.email, 'NewPass123');
  check('ACC-08', 'new password works', r.status === 200, r.status);
  r = await new Client().patch('/auth/change-password', { currentPassword: 'NewPass123', newPassword: 'Other1234' });
  check('ACC-08', 'change password requires login', r.status === 401, r.status);

  const pr = await newUser('Profile User');
  r = await pr.patch('/users/me', { name: 'New Name', phone: '+201001234567', preferredCurrency: 'eur' });
  check('ACC-09', 'edit name, phone, currency', r.status === 200 && r.data.name === 'New Name' && r.data.preferredCurrency === 'EUR', r.data);
  r = await pr.patch('/users/me', { name: 'Should Not Save', phone: 'abc' });
  check('ACC-09', 'invalid phone rejected', r.status === 400, r.status);
  r = await pr.get('/users/me');
  check('ACC-09', 'nothing saved when one field is invalid (atomic)', r.data.name === 'New Name', r.data.name);
  r = await pr.patch('/users/me', { name: 'Should Not Save', preferredCurrency: 'XYZ' });
  check('ACC-09', 'unsupported currency rejected', r.status === 400, r.status);
  r = await pr.get('/users/me');
  check('ACC-09', 'name not saved when currency invalid', r.data.name === 'New Name', r.data.name);
  r = await pr.patch('/users/me', { name: '' });
  check('ACC-09', 'empty name rejected', r.status === 400, r.status);
  r = await pr.patch('/users/me', { email: 'hack@qa.test' });
  check('ACC-09', 'cannot change email via profile', r.status === 400, r.status);
  r = await pr.patch('/users/me', { role: 'admin' });
  check('ACC-09', 'cannot escalate role via profile', r.status === 400, r.status);
  r = await pr.patch('/users/me', { status: 'active', failedLoginAttempts: 0 });
  check('ACC-09', 'cannot set internal fields', r.status === 400, r.status);
  r = await pr.patch('/users/me', { preferredCurrency: 'JPY' });
  check('ACC-09', 'every listed supported currency accepted (JPY)', r.status === 200, r.status);

  ctx.regEmail = email;
};
