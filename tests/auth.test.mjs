import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthController } from '../src/auth-controller.js';
import { createRankingApi } from '../src/ranking-api.js';

function setup(href = 'https://game.example/?track=azul') {
  const state = { session: null, urls: [], exchanges: [] };
  const sdk = {
    onAuthStateChange(fn) { state.change = fn; },
    async getSession() { return { data: { session: state.session } }; },
    async exchangeCodeForSession(code, options) { state.exchanges.push(code); state.flow = options; return { error: state.exchangeError }; },
    async signInWithOAuth(options) { state.options = options; return {}; },
    async signOut(options) { state.signout = options; return { error: state.signoutError }; },
  };
  const controller = createAuthController(sdk, {
    location: { href }, history: { replaceState(_state, _title, url) { state.urls.push(url); } },
  });
  return { state, sdk, controller };
}

test('Google sign-in returns only to the current origin and path', async () => {
  const { state, controller } = setup('https://game.example/ski/?next=https://evil.example/#token');
  await controller.signIn();
  assert.equal(state.options.provider, 'google');
  assert.equal(state.options.options.redirectTo, 'https://game.example/ski/');
});

test('PKCE callback exchanges code, restores session and removes code from URL', async () => {
  const { state, controller } = setup('https://game.example/?code=one-use&track=azul&sb_flow_id=flow-123');
  state.session = { user: { id: 'google-user' } };
  await controller.initialize();
  assert.deepEqual(state.exchanges, ['one-use']);
  assert.deepEqual(state.flow, { flowId: 'flow-123' });
  assert.equal(controller.user().id, 'google-user');
  assert.deepEqual(state.urls, ['/?track=azul']);
  state.change('SIGNED_OUT', null);
  assert.equal(controller.user(), null);
});

test('failed PKCE callback is cleaned and cannot leave a signed-in user', async () => {
  const { state, controller } = setup('https://game.example/?code=expired');
  state.exchangeError = new Error('invalid verifier');
  await assert.rejects(controller.initialize(), /completar el acceso/);
  assert.equal(controller.user(), null);
  assert.deepEqual(state.urls, ['/']);
});

test('OAuth cancellation does not render untrusted error descriptions', async () => {
  const { state, controller } = setup('https://game.example/#error=access_denied&error_description=untrusted');
  await assert.rejects(controller.initialize(), /cancelado o rechazado/);
  assert.deepEqual(state.exchanges, []);
  assert.deepEqual(state.urls, ['/']);
});

test('sign-out clears this device, while failed sign-out preserves state', async () => {
  const { state, controller } = setup();
  state.session = { user: { id: 'google-user' } };
  await controller.initialize();
  state.signoutError = new Error('offline');
  await assert.rejects(controller.signOut());
  assert.equal(controller.user().id, 'google-user');
  state.signoutError = null;
  await controller.signOut();
  assert.equal(controller.user(), null);
  assert.equal(state.signout.scope, 'local');
});

const score = { track: 'Verde', name: 'Snow', timeSec: 65, speedKmh: 85, expectedPlayerId: 'account-a' };
function ranking(user) {
  const writes = [];
  const client = {
    auth: { async getSession() { return { data: { session: user ? { user } : null } }; } },
    from(table) { return { async upsert(body, options) { writes.push({ table, body, options }); return {}; } }; },
  };
  return { api: createRankingApi(client), writes };
}
test('guests and non-Google sessions cannot send scores', async () => {
  for (const user of [null, { id: 'account-a', is_anonymous: true }, { id: 'account-a', app_metadata: { provider: 'email' } }]) {
    const { api, writes } = ranking(user);
    await assert.rejects(api.submitScore(score), /Google/);
    assert.equal(writes.length, 0);
  }
});
test('account changes during a race cannot assign a score to the new account', async () => {
  const { api, writes } = ranking({ id: 'account-b', app_metadata: { provider: 'google' } });
  await assert.rejects(api.submitScore(score), /sesión cambió/);
  assert.equal(writes.length, 0);
});
test('scores use the authenticated ID and never send device metadata or supplied IDs', async () => {
  const { api, writes } = ranking({ id: 'account-a', app_metadata: { provider: 'google' } });
  await api.submitScore({ ...score, player_id: 'victim', meta: { ua: 'private' } });
  assert.deepEqual(writes[0].body, { player_id: 'account-a', track: 'Verde', name: 'Snow', time_cs: 6500, speed_kmh: 85 });
});
test('guests can request their position without querying private identity', async () => {
  const { api } = ranking(null);
  assert.equal(await api.fetchMyRank('Verde'), null);
});
