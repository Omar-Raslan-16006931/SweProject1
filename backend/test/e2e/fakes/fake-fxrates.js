// Fake FXRatesAPI /latest responder (format mirrors api.fxratesapi.com). FX_FAIL=1 file toggles failures.
const http = require('http'); const fs = require('fs');
http.createServer((req, res) => {
  if (fs.existsSync(__dirname + '/FX_FAIL')) { res.writeHead(503); return res.end('down'); }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ success: true, base: 'USD', date: new Date().toISOString(), rates: { EGP: 48.5, AED: 3.6725, GBP: 0.79, USD: 1, EUR: 0.92, JPY: 150.2, SAR: 3.75 } }));
}).listen(12112, () => console.log('FAKE_FX_READY'));
