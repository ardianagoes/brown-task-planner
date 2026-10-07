const assert = require('node:assert/strict');
const origin = new URL(process.env.SMOKE_APP_URL || 'http://127.0.0.1:3000').origin;
(async () => {
  const page = await fetch(origin, { redirect: 'manual' });
  assert.equal(page.status, 307);
  assert.equal(new URL(page.headers.get('location'), origin).pathname, '/login');
  const task = await fetch(origin + '/api/tasks');
  assert.equal(task.status, 401);
  assert.match(task.headers.get('cache-control'), /no-store/);
  for (const endpoint of ['/api/tasks','/api/import','/api/tasks/migrate','/auth/signout']) {
    const signedOut = await fetch(origin + endpoint, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(signedOut.status, 401, endpoint);
    const foreign = await fetch(origin + endpoint, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(foreign.status, 403, endpoint);
    const missingOrigin = await fetch(origin + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(missingOrigin.status, 403, endpoint);
  }
  const patch = await fetch(origin + '/api/tasks/test', { method: 'PATCH', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{"status":"Submitted/Done"}' });
  assert.equal(patch.status, 401);
  const foreignPatch = await fetch(origin + '/api/tasks/test', { method: 'PATCH', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(foreignPatch.status, 403);
  const reset = await fetch(origin + '/auth/reset', { redirect: 'manual' });
  assert.equal(reset.status, 307);
  assert.equal(new URL(reset.headers.get('location'), origin).pathname, '/login');
  const callback = await fetch(origin + '/auth/callback?next=https://evil.example', { redirect: 'manual' });
  assert.equal(new URL(callback.headers.get('location'), origin).pathname, '/login');
  console.log('Passed live app smoke checks: page protection, every API auth guard, origin rejection, no-store, callback redirect safety.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
