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
  for (const headers of [{ Origin: origin }, { Origin: 'https://evil.example' }, {}]) {
    const deletion = await fetch(origin + '/api/tasks/test', { method: 'DELETE', headers });
    assert.equal(deletion.status, headers.Origin === origin ? 401 : 403, 'DELETE task protection');
    assert.match(deletion.headers.get('cache-control'), /no-store/);
  }
  const reset = await fetch(origin + '/auth/reset', { redirect: 'manual' });
  const removed = await fetch(origin + '/api/tasks/extract-image', { method: 'POST', headers: { Origin: origin } });
  assert.ok([404, 405].includes(removed.status), 'Paid extraction POST handler removed');
  for (const asset of ['/ocr-runner.js', '/ocr/worker.min.js', '/ocr/tesseract.min.js', '/ocr/eng.traineddata.gz']) {
    const localAsset = await fetch(origin + asset, { method: 'HEAD' });
    assert.equal(localAsset.status, 200, asset);
    assert.match(localAsset.headers.get('content-security-policy'), /connect-src 'self'/);
  }
  assert.equal(reset.status, 307);
  assert.equal(new URL(reset.headers.get('location'), origin).pathname, '/login');
  const callback = await fetch(origin + '/auth/callback?next=https://evil.example', { redirect: 'manual' });
  assert.equal(new URL(callback.headers.get('location'), origin).pathname, '/login');
  console.log('Passed live app smoke checks: page protection, every API auth guard, origin rejection, no-store, callback redirect safety.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
