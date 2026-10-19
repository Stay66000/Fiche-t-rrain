import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProfile, configIsReady, profileFieldsToFill, createProfileStore, friendlyError } from '../src/profile.js';

test('only profile fields and allowlisted defaults are retained, with whitespace trimmed', () => {
  assert.deepEqual(normalizeProfile({
    entreprise: '  Exemple  ',
    equipe: ' 42 ',
    default_moyens_presents: ['m4', 'm4', 'm99', 3],
    default_moyens_a_prevoir: ['f0', 'f3', 'evil'],
    reference: 'secret client', telephone: '0600000000', id: 'another-user', role: 'admin'
  }), {
    entreprise: 'Exemple',
    equipe: '42',
    default_moyens_presents: ['m4'],
    default_moyens_a_prevoir: ['f0', 'f3']
  });
});
test('missing default options are normalized to empty arrays', () => {
  assert.deepEqual(normalizeProfile({ entreprise: 'A', equipe: '1' }), {
    entreprise: 'A', equipe: '1', default_moyens_presents: [], default_moyens_a_prevoir: []
  });
});
test('empty or oversized profiles are rejected', () => {
  for (const input of [{ entreprise: ' ', equipe: '1' }, { entreprise: 'x'.repeat(31), equipe: '1' }, { entreprise: 'A', equipe: 'x'.repeat(26) }]) assert.throws(() => normalizeProfile(input));
});
test('configuration fails closed and excludes secret keys and non-Supabase origins', () => {
  const valid = { accountsEnabled: true, supabaseUrl: 'https://exampleproject.supabase.co', supabasePublishableKey: 'sb_publishable_example' };
  assert.equal(configIsReady(valid), true);
  for (const patch of [{ accountsEnabled: false }, { supabaseUrl: 'http://exampleproject.supabase.co' }, { supabaseUrl: 'https://attacker.test' }, { supabasePublishableKey: 'sb_secret_example' }, { supabaseUrl: 'https://u:p@exampleproject.supabase.co' }]) assert.equal(configIsReady({ ...valid, ...patch }), false);
});
test('automatic text prefill never overwrites a fiche already being typed', () => {
  const profile = { entreprise: 'Profil', equipe: '12', default_moyens_presents: ['m4'], default_moyens_a_prevoir: ['f0'] };
  assert.deepEqual(profileFieldsToFill({ entreprise: 'Chantier différent', equipe: '' }, profile), { equipe: '12' });
  assert.deepEqual(profileFieldsToFill({ entreprise: 'Chantier différent', equipe: '9' }, profile, true), { entreprise: 'Profil', equipe: '12' });
});
function fixture({ authError = null, dbError = null } = {}) {
  const calls = [];
  const row = { entreprise: 'A', equipe: '1', default_moyens_presents: ['m4'], default_moyens_a_prevoir: ['f0'] };
  const chain = {
    select: (...args) => { calls.push(['select', ...args]); return chain; },
    eq: (...args) => { calls.push(['eq', ...args]); return chain; },
    upsert: (...args) => { calls.push(['upsert', ...args]); return chain; },
    maybeSingle: async () => ({ data: row, error: dbError }),
    single: async () => ({ data: row, error: dbError })
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: authError ? null : { id: 'verified-user' } }, error: authError }) },
    from: name => { calls.push(['from', name]); return chain; }
  };
  return { calls, store: createProfileStore(client) };
}
test('profile reads are scoped to the server-verified user and include defaults', async () => {
  const { calls, store } = fixture();
  await store.load();
  assert.ok(calls.some(c => c[0] === 'eq' && c[1] === 'id' && c[2] === 'verified-user'));
  assert.ok(calls.some(c => c[0] === 'select' && String(c[1]).includes('default_moyens_presents')));
});
test('profile writes ignore supplied ids and intervention fields while saving valid defaults', async () => {
  const { calls, store } = fixture();
  await store.save({
    entreprise: 'A', equipe: '1', id: 'victim', reference: 'Dossier privé', commentaires: 'Confidentiel',
    default_moyens_presents: ['m4', 'm99'], default_moyens_a_prevoir: ['f0', 'f4']
  });
  assert.deepEqual(calls.find(c => c[0] === 'upsert')[1], {
    id: 'verified-user', entreprise: 'A', equipe: '1', default_moyens_presents: ['m4'], default_moyens_a_prevoir: ['f0', 'f4']
  });
});
test('failed authentication prevents all database calls', async () => {
  const error = new Error('expired');
  const { calls, store } = fixture({ authError: error });
  await assert.rejects(store.load(), /expired/);
  await assert.rejects(store.save({ entreprise: 'A', equipe: '1' }), /expired/);
  assert.deepEqual(calls, []);
});
test('database errors propagate instead of pretending a profile was saved', async () => {
  const { store } = fixture({ dbError: new Error('RLS denied') });
  await assert.rejects(store.save({ entreprise: 'A', equipe: '1' }), /RLS denied/);
});
test('unknown server errors are not echoed as HTML or technical details', () => {
  assert.ok(!friendlyError({ message: '<img onerror=alert(1)> token secret' }).includes('token'));
  assert.match(friendlyError({ code: 'invalid_credentials' }), /incorrect/);
});
