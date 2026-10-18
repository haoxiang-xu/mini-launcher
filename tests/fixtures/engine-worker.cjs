const { createInterface } = require('node:readline');
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
send({ event: 'ready', protocol: 1, backend: 'mini-prism' });
createInterface({ input: process.stdin }).on('line', line => {
  const request = JSON.parse(line);
  if (request.method === 'status') {
    const response = JSON.stringify({ id: request.id, result: { accounts: [], instances: [], loginConfigured: false } }) + '\n';
    process.stdout.write(response.slice(0, 12)); setTimeout(() => process.stdout.write(response.slice(12)), 5);
  } else if (request.method === 'auth.login') send({ id: request.id, error: { code: 'CLIENT_ID_REQUIRED', message: 'Not configured' } });
  else if (request.method === 'crash') process.exit(2);
  else if (request.method === 'progress') {
    send({ event: 'progress', id: request.id, action: 'install', current: 3, total: 10 });
    send({ id: request.id, result: { ok: true } });
  } else if (request.method === 'shutdown') { send({ id: request.id, result: { ok: true } }); process.exit(); }
});
