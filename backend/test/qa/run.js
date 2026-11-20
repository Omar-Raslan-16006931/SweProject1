// Runs every QA module in order against a running backend. Exit code 1 when any check fails.
const { results, closeDb } = require('./lib');
(async () => {
  const ctx = {};
  const mods = ['t1_auth', 't2_admin', 't3_flights', 't4_fbook', 't5_hotels', 't6_itn', 't7_blog', 't9_extra', 't10_round2', 't12_round4', 't13_round5', 't11_round3', 't8_gen'];
  for (const m of mods) {
    try { await require('./' + m)(ctx); }
    catch (e) { console.log(`!!! module ${m} crashed: ${e.stack}`); results.push({ section: m, id: 'HARNESS', name: `${m} crashed: ${e.message}`, ok: false }); }
  }
  const fails = results.filter((r) => !r.ok);
  console.log(`\nRESULT: ${results.length - fails.length}/${results.length} checks passed, ${fails.length} failed`);
  for (const f of fails) console.log(`  FAIL [${f.id}] ${f.name}`);
  await closeDb();
  process.exit(fails.length ? 1 : 0);
})();
