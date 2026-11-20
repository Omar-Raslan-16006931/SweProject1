const { CFG, Client, check, setSection, dbc, u, newUser, ObjectId } = require('./lib');

async function makeModerator(admin, role, providerId, label) {
  const email = `${u(label)}@qa.test`;
  const r = await admin.post('/admin/moderators', { name: label, email, role, providerId, temporaryPassword: 'TempPass1' });
  if (r.status !== 201) throw new Error('moderator create failed ' + JSON.stringify(r.data));
  const c = new Client(label);
  await c.login(email, 'TempPass1');
  const ch = await c.patch('/auth/change-password', { currentPassword: 'TempPass1', newPassword: 'ModPass123' });
  if (ch.status !== 200) throw new Error('mod pw change failed');
  c.email = email; c.id = r.data.id;
  return c;
}

module.exports = async function admin(ctx) {
  setSection('ACC-18 / ACC-13 / FLT-01 / HTL-01 — admin setup');
  const admin = new Client('admin');
  let r = await admin.login(CFG.adminEmail, CFG.adminPassword);
  check('ACC-18', 'seeded admin can log in and lands on /admin', r.status === 200 && r.data.role === 'admin' && r.data.homePath === '/admin', r.data);
  ctx.admin = admin;

  const user = await newUser('Plain User');
  r = await user.post('/airlines', { name: 'Evil Air', code: 'EV' });
  check('FLT-01', 'registered user cannot create airline (403)', r.status === 403, r.status);
  r = await new Client().post('/airlines', { name: 'Evil Air', code: 'EV' });
  check('FLT-01', 'guest cannot create airline (401)', r.status === 401, r.status);
  for (const code of ['A', 'ABCD', 'A-1', '']) {
    r = await admin.post('/airlines', { name: 'Bad', code });
    check('FLT-01', `airline code "${code}" rejected`, r.status === 400, r.status);
  }
  const code1 = ('Q' + Math.random().toString(36).slice(2, 4)).toUpperCase();
  r = await admin.post('/airlines', { name: 'QA Air', code: code1 });
  check('FLT-01', 'admin creates airline', r.status === 201, r.data);
  ctx.airline = r.data;
  r = await admin.post('/airlines', { name: 'Dup Air', code: code1.toLowerCase() });
  check('FLT-01', 'duplicate airline code (case-insensitive) rejected 409', r.status === 409, r.status);
  const code2 = ('R' + Math.random().toString(36).slice(2, 4)).toUpperCase();
  r = await admin.post('/airlines', { name: 'Other Air', code: code2 });
  ctx.airline2 = r.data;

  // hotels
  r = await admin.post('/hotels', { name: 'Bad City', address: 'x', cityId: 'atlantis', countryCode: 'EG', starClass: 3 });
  check('HTL-01', 'hotel in unknown city rejected', r.status === 400, r.status);
  r = await admin.post('/hotels', { name: 'Mismatch', address: 'x', cityId: 'cairo', countryCode: 'FR', starClass: 3 });
  check('HTL-01', 'city/country mismatch rejected', r.status === 400, r.status);
  for (const s of [0, 6, 3.5, -1]) {
    r = await admin.post('/hotels', { name: 'Star', address: 'x', cityId: 'cairo', countryCode: 'EG', starClass: s });
    check('HTL-01', `star class ${s} rejected`, r.status === 400, r.status);
  }
  r = await admin.post('/hotels', { name: 'QA Nile Hotel', address: '1 Nile St', cityId: 'cairo', countryCode: 'EG', starClass: 4, description: 'Nice', amenities: ['WiFi', 'Pool'] });
  check('HTL-01', 'admin creates hotel', r.status === 201, r.data);
  ctx.hotel = r.data;
  r = await admin.post('/hotels', { name: 'QA Dubai Hotel', address: '2 Marina', cityId: 'dubai', countryCode: 'AE', starClass: 5 });
  ctx.hotel2 = r.data;
  r = await user.post('/hotels', { name: 'Evil', address: 'x', cityId: 'cairo', countryCode: 'EG', starClass: 3 });
  check('HTL-01', 'user cannot create hotel', r.status === 403, r.status);

  setSection('ACC-13 — moderator accounts');
  r = await admin.post('/admin/moderators', { name: 'M', email: `${u('m')}@qa.test`, role: 'admin', providerId: ctx.airline.id, temporaryPassword: 'TempPass1' });
  check('ACC-13', 'cannot create a moderator with role=admin', r.status === 400, r.status);
  r = await admin.post('/admin/moderators', { name: 'M', email: `${u('m')}@qa.test`, role: 'airline_moderator', providerId: ctx.hotel.id, temporaryPassword: 'TempPass1' });
  check('ACC-13', 'airline moderator linked to a hotel id rejected', r.status === 400 || r.status === 404, r.status);
  r = await admin.post('/admin/moderators', { name: 'M', email: `${u('m')}@qa.test`, role: 'hotel_moderator', providerId: new ObjectId().toString(), temporaryPassword: 'TempPass1' });
  check('ACC-13', 'moderator for non-existent hotel rejected', r.status === 400 || r.status === 404, r.status);
  r = await admin.post('/admin/moderators', { name: 'M', email: user.email, role: 'hotel_moderator', providerId: ctx.hotel.id, temporaryPassword: 'TempPass1' });
  check('ACC-13', 'moderator with already-registered email rejected 409', r.status === 409, r.status);
  r = await admin.post('/admin/moderators', { name: 'M', email: `${u('m')}@qa.test`, role: 'hotel_moderator', providerId: ctx.hotel.id, temporaryPassword: 'weak' });
  check('ACC-13', 'temporary password must follow password rules', r.status === 400, r.status);
  r = await user.post('/admin/moderators', { name: 'M', email: `${u('m')}@qa.test`, role: 'hotel_moderator', providerId: ctx.hotel.id, temporaryPassword: 'TempPass1' });
  check('ACC-13', 'non-admin cannot create moderators', r.status === 403, r.status);

  const modEmail = `${u('am')}@qa.test`;
  r = await admin.post('/admin/moderators', { name: 'Air Mod', email: modEmail, role: 'airline_moderator', providerId: ctx.airline.id, temporaryPassword: 'TempPass1' });
  check('ACC-13', 'admin creates airline moderator', r.status === 201 && r.data.mustChangePassword === true, r.data);
  const am = new Client('airmod');
  r = await am.login(modEmail, 'TempPass1');
  check('ACC-13', 'moderator can log in with temp password, flagged mustChangePassword', r.status === 200 && r.data.mustChangePassword === true && r.data.homePath === '/moderator/airline', r.data);
  r = await am.post('/flights', { flightNumber: 'XX1', departureAirport: 'CAI', arrivalAirport: 'DXB', departureLocal: '2027-01-01T10:00', arrivalLocal: '2027-01-01T14:00' });
  check('ACC-13', 'moderator blocked from working until password changed', r.status === 403, r.status);
  r = await am.patch('/auth/change-password', { currentPassword: 'TempPass1', newPassword: 'TempPass1' });
  check('ACC-13', 'new password must differ from temporary', r.status >= 400, r.status);
  r = await am.patch('/auth/change-password', { currentPassword: 'TempPass1', newPassword: 'ModPass123' });
  check('ACC-13', 'moderator changes password on first login', r.status === 200, r.data);
  r = await am.get('/auth/me');
  check('ACC-13', 'mustChangePassword cleared', r.data.mustChangePassword === false, r.data);
  am.email = modEmail; am.id = r.data.id;
  ctx.airMod = am;
  ctx.airMod2 = await makeModerator(admin, 'airline_moderator', ctx.airline2.id, 'airmod2');
  ctx.hotelMod = await makeModerator(admin, 'hotel_moderator', ctx.hotel.id, 'hotmod');
  ctx.hotelMod2 = await makeModerator(admin, 'hotel_moderator', ctx.hotel2.id, 'hotmod2');
  r = await ctx.hotelMod.get('/auth/me');
  check('ACC-04', 'hotel moderator home page', r.data.homePath === '/moderator/hotel' && r.data.hotelId === ctx.hotel.id, r.data);

  setSection('ACC-14 — accounts list');
  for (let i = 0; i < 4; i++) await newUser('Filler ' + i);
  r = await admin.get('/admin/accounts');
  check('ACC-14', 'paginated accounts list, page size 10', r.status === 200 && r.data.items.length <= 10 && r.data.pageSize === 10 && r.data.total > 10, { total: r.data.total, n: r.data.items?.length });
  const it = r.data.items[0];
  check('ACC-14', 'items have name, email, role, status, registration date', it && it.name && it.email && it.role && it.status && it.registeredAt, it);
  r = await admin.get('/admin/accounts?role=airline_moderator');
  check('ACC-14', 'filter by role', r.status === 200 && r.data.items.every((x) => x.role === 'airline_moderator') && r.data.total >= 2, r.data.total);
  r = await admin.get(`/admin/accounts?q=${encodeURIComponent(modEmail.slice(0, 10).toUpperCase())}`);
  check('ACC-14', 'search by email (case-insensitive)', r.data.items.some((x) => x.email === modEmail), r.data.total);
  r = await admin.get('/admin/accounts?q=Air%20Mod');
  check('ACC-14', 'search by name', r.data.items.some((x) => x.email === modEmail), r.data.total);
  r = await admin.get('/admin/accounts?q=' + encodeURIComponent('.*'));
  check('ACC-14', 'regex characters in search are treated literally', r.status === 200 && r.data.total === 0, r.data.total);
  r = await admin.get('/admin/accounts?role=superhero');
  check('ACC-14', 'invalid role filter rejected', r.status === 400, r.status);
  r = await admin.get('/admin/accounts?page=0');
  check('GEN-05', 'page=0 rejected', r.status === 400, r.status);
  r = await admin.get('/admin/accounts?page=-3');
  check('GEN-05', 'negative page rejected', r.status === 400, r.status);
  r = await admin.get('/admin/accounts?page=abc');
  check('GEN-05', 'non-numeric page rejected', r.status === 400, r.status);
  r = await admin.get('/admin/accounts?page=9999');
  check('GEN-05', 'page beyond the end returns an empty list, not an error', r.status === 200 && r.data.items.length === 0, r.status);
  r = await user.get('/admin/accounts');
  check('ACC-14', 'non-admin cannot list accounts', r.status === 403, r.status);
  r = await ctx.airMod.get('/admin/accounts');
  check('ACC-14', 'moderator cannot list accounts', r.status === 403, r.status);

  setSection('ACC-15/16 — suspend / reactivate');
  const victim = await newUser('Victim');
  r = await admin.patch(`/admin/accounts/${victim.id}/suspend`);
  check('ACC-16', 'admin suspends a registered user', r.status === 200 && r.data.status === 'suspended', r.data);
  r = await victim.get('/auth/me');
  check('ACC-16', 'existing session of suspended user is cut off', r.status === 401 || r.status === 403, r.status);
  r = await new Client().login(victim.email, 'Passw0rd1');
  check('ACC-04/16', 'suspended user sees "account suspended" on login', r.status === 403 && /suspend/i.test(r.data.message), r.data);
  r = await new Client().login(victim.email, 'WrongPass1');
  check('ACC-04', 'suspended account + wrong password still gets the generic message (no status leak)', r.status === 401, r.data);
  r = await admin.patch(`/admin/accounts/${victim.id}/suspend`);
  check('ACC-16', 'suspending twice -> conflict', r.status === 409, r.status);
  const db = await dbc();
  const notif = await db.collection('notifications').findOne({ user: new ObjectId(victim.id), type: 'account_suspended' });
  check('GEN-01', 'suspended account gets an in-app notification', !!notif, null);
  r = await admin.patch(`/admin/accounts/${victim.id}/reactivate`);
  check('ACC-16', 'reactivate', r.status === 200 && r.data.status === 'active', r.data);
  r = await new Client().login(victim.email, 'Passw0rd1');
  check('ACC-16', 'reactivated user can log in', r.status === 200, r.status);
  r = await admin.patch(`/admin/accounts/${victim.id}/reactivate`);
  check('ACC-16', 'reactivating an active account -> conflict', r.status === 409, r.status);
  r = await admin.patch(`/admin/accounts/${(await admin.get('/auth/me')).data.id}/suspend`);
  check('ACC-15', 'admin cannot suspend themselves', r.status === 403 || r.status === 400, r.status);
  r = await admin.patch(`/admin/accounts/${new ObjectId()}/suspend`);
  check('ACC-15', 'suspend unknown id -> 404', r.status === 404, r.status);
  r = await admin.patch('/admin/accounts/not-an-id/suspend');
  check('GEN-13', 'malformed id -> 400 not 500', r.status === 400, r.status);
  // moderator suspension
  const smod = await makeModerator(admin, 'airline_moderator', ctx.airline2.id, 'susmod');
  r = await admin.patch(`/admin/accounts/${smod.id}/suspend`);
  check('ACC-15', 'admin suspends moderator', r.status === 200, r.status);
  r = await new Client().login(smod.email, 'ModPass123');
  check('ACC-15', 'suspended moderator cannot log in', r.status === 403, r.status);
  r = await user.patch(`/admin/accounts/${victim.id}/suspend`);
  check('ACC-16', 'user cannot suspend others', r.status === 403, r.status);

  setSection('ACC-07a — admin-assisted password reset');
  const fu = await newUser('Forgetful');
  r = await admin.post(`/admin/users/${fu.id}/reset-password`, { temporaryPassword: 'weak' });
  check('ACC-07a', 'temp password must meet rules', r.status === 400, r.status);
  r = await admin.post(`/admin/users/${fu.id}/reset-password`, { temporaryPassword: 'Temp12345' });
  check('ACC-07a', 'admin resets password', r.status === 200, r.data);
  r = await fu.get('/auth/me');
  check('ACC-07a', 'existing sessions revoked after reset', r.status === 401, r.status);
  r = await new Client().login(fu.email, 'Passw0rd1');
  check('ACC-07a', 'old password stops working', r.status === 401, r.status);
  const f2 = new Client();
  r = await f2.login(fu.email, 'Temp12345');
  check('ACC-07a', 'temp password logs in with mustChangePassword', r.status === 200 && r.data.mustChangePassword, r.data);
  r = await f2.post('/itineraries', { title: 'x', countries: ['EG'], startDate: '2027-01-01' });
  check('ACC-07a', 'must set new password before doing anything else', r.status === 403, r.status);
  r = await f2.patch('/auth/change-password', { currentPassword: 'Temp12345', newPassword: 'Fresh1234' });
  check('ACC-07a', 'sets new password', r.status === 200, r.status);
  r = await f2.post('/itineraries', { title: 'x', countries: ['EG'], startDate: '2027-01-01' });
  check('ACC-07a', 'can work after setting the new password', r.status === 201, r.status);
  r = await user.post(`/admin/users/${fu.id}/reset-password`, { temporaryPassword: 'Temp12345' });
  check('ACC-07a', 'non-admin cannot reset passwords', r.status === 403, r.status);
  ctx.user = user;
};
module.exports.makeModerator = makeModerator;
