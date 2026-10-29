const assert = require('node:assert/strict');
const origin = new URL(process.env.SMOKE_APP_URL || 'http://127.0.0.1:3000').origin;
(async () => {
  const page = await fetch(origin, { redirect: 'manual' });
  assert.equal(page.status, 307);
  assert.equal(new URL(page.headers.get('location'), origin).pathname, '/login');
  const task = await fetch(origin + '/api/tasks');
  assert.equal(task.status, 401);
  assert.match(task.headers.get('cache-control'), /no-store/);
  for (const endpoint of ['/api/tasks','/api/import','/api/tasks/migrate','/api/tasks/extract-image','/auth/signout']) {
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
  const fullEdit = await fetch(origin + '/api/tasks/test', { method: 'PATCH', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Edited task', dueAt: '2026-10-20', allDay: true, category: 'Homework', status: 'In Progress', urls: [] }) });
  assert.equal(fullEdit.status, 401, 'Full task edit requires authentication');
  assert.equal((await fetch(origin + '/ocr-runner.js')).status, 404, 'Obsolete OCR worker removed');
  assert.equal(reset.status, 307);
  assert.equal(new URL(reset.headers.get('location'), origin).pathname, '/login');
  assert.equal(new URL(reset.headers.get('location'), origin).searchParams.get('mode'), 'forgot');
  for (const headers of [{ Origin: origin }, { Origin: 'https://evil.example' }, {}]) {
    const password = await fetch(origin + '/api/auth/password', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(password.status, headers.Origin === origin ? 401 : 403, 'Recovery password protection');
    assert.match(password.headers.get('cache-control'), /no-store/);
    const confirmation = await fetch(origin + '/auth/confirm', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'nonce=invalid', redirect: 'manual' });
    assert.equal(confirmation.status, headers.Origin === origin ? 303 : 403, 'Email confirmation protection');
  }
  const staged = await fetch(origin + '/auth/confirm?token_hash=' + 'a'.repeat(64) + '&type=recovery', { redirect: 'manual' });
  assert.equal(staged.status, 303);
  assert.equal(staged.headers.get('location'), origin + '/auth/confirm/continue');
  assert.match(staged.headers.get('set-cookie'), /dd-email-link=.*HttpOnly/i);
  assert.match(staged.headers.get('cache-control'), /no-store/);
  assert.equal(staged.headers.get('referrer-policy'), 'no-referrer');
  const continued = await fetch(origin + '/auth/confirm/continue', { headers: { Cookie: staged.headers.get('set-cookie').split(';')[0] } });
  const html = await continued.text();
  assert.equal(continued.status, 200); assert.match(html, /Continue to reset password/);
  assert.match(html, /action="\/auth\/confirm"/); assert.doesNotMatch(html, /token_hash=|a{64}/);
  const callback = await fetch(origin + '/auth/callback?next=https://evil.example', { redirect: 'manual' });
  assert.equal(new URL(callback.headers.get('location'), origin).pathname, '/login');
  console.log('Passed live app smoke checks: page protection, every API auth guard, origin rejection, no-store, callback redirect safety.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
