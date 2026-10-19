import { createClient } from '@supabase/supabase-js';
import { configIsReady, createProfileStore, friendlyError, normalizeProfile, profileFieldsToFill } from './profile.js';

const $ = selector => document.querySelector(selector);
const config = window.FICHE_CONFIG;
const dialog = $('#account-dialog');
const enabled = configIsReady(config);
const client = enabled ? createClient(config.supabaseUrl, config.supabasePublishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'fiche-terrain-auth' }
}) : null;
const profiles = client ? createProfileStore(client) : null;
let currentUser = null;
let currentProfile = null;
let revision = 0;
let syncing = null;
let recovery = false;
const redirectTo = new URL('./', window.location.href).href;

function message(text = '', error = false) {
  const element = $('#account-message');
  element.textContent = text;
  element.hidden = !text;
  element.classList.toggle('is-error', error);
}
function panel(mode, open = true) {
  for (const element of dialog.querySelectorAll('[data-panel]')) element.hidden = element.dataset.panel !== mode;
  const names = { login: 'Bienvenue sur le terrain.', signup: 'Votre profil, une seule fois.', forgot: 'Retrouver votre compte.', recovery: 'Un nouveau mot de passe.', profile: 'Votre profil technicien.' };
  $('#account-title').textContent = names[mode];
  message();
  if (!enabled) message('Les comptes sont en cours d’activation. Vous pouvez déjà remplir et télécharger votre fiche sans compte.');
  if (open && !dialog.open) dialog.showModal();
}
function updateAccountUI() {
  $('#account-open').textContent = currentUser ? 'Mon profil' : 'Se connecter';
  $('#account-banner-title').textContent = currentUser ? 'Votre profil vous accompagne.' : 'Votre équipe, déjà renseignée.';
  $('#account-banner-description').textContent = currentUser
    ? (currentProfile ? 'Entreprise et équipe préremplies. Vous pouvez les adapter pour cette fiche.' : 'Complétez votre profil pour préremplir vos prochaines fiches.')
    : 'Un compte gratuit pour retrouver votre entreprise et votre équipe à chaque visite.';
  $('#account-start').textContent = currentUser ? 'Modifier mon profil' : 'Créer mon compte';
  $('#use-profile').hidden = !currentProfile;
  $('#account-connection-status').textContent = currentUser ? 'Connecté' : (enabled ? 'Compte facultatif' : 'Comptes bientôt disponibles');
  $('#profile-email').textContent = currentUser?.email || '';
  const form = $('#profile-form');
  form.elements.entreprise.value = currentProfile?.entreprise || '';
  form.elements.equipe.value = currentProfile?.equipe || '';
}
function fillProfile(overwrite = false) {
  if (!currentProfile) return;
  const sheet = $('#sheet');
  const values = profileFieldsToFill({ entreprise: sheet.elements.entreprise.value, equipe: sheet.elements.equipe.value }, currentProfile, overwrite);
  for (const [key, value] of Object.entries(values)) sheet.elements[key].value = value;
  sheet.dispatchEvent(new Event('input', { bubbles: true }));
}
function forgetLocalProfile() {
  currentUser = null;
  currentProfile = null;
  const sheet = $('#sheet');
  sheet.elements.entreprise.value = '';
  sheet.elements.equipe.value = '';
  sheet.dispatchEvent(new Event('input', { bubbles: true }));
  updateAccountUI();
}
async function syncProfile() {
  if (!client) return;
  // Serialize refreshes, but let callers wait for the in-flight result.
  if (syncing) return syncing;
  const generation = ++revision;
  syncing = (async () => {
    try {
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData.session) return;
      const { data: userData, error: userError } = await client.auth.getUser();
      if (userError) throw userError;
      if (!userData.user || generation !== revision) return;
      currentUser = userData.user;
      updateAccountUI();
      let loaded = await profiles.load();
      if (!loaded.profile) {
        // Metadata is only a proposed profile, never an authorization claim.
        let initial = null;
        try { initial = normalizeProfile(loaded.user.user_metadata); } catch { /* Complete it in the dialog. */ }
        if (initial) loaded = await profiles.save(initial);
      }
      if (generation !== revision) return;
      currentUser = loaded.user;
      currentProfile = loaded.profile;
      updateAccountUI();
      fillProfile();
      if (!currentProfile && !recovery) panel('profile');
    } catch (error) {
      if (generation === revision) {
        $('#account-connection-status').textContent = 'Profil indisponible';
        if (dialog.open) message(friendlyError(error), true);
      }
    }
  })();
  try { await syncing; }
  finally { syncing = null; }
}

async function run(form, operation) {
  if (!client) return;
  const fieldset = form.querySelector('fieldset');
  fieldset.disabled = true;
  form.setAttribute('aria-busy', 'true');
  message();
  try { await operation(); }
  catch (error) { message(friendlyError(error), true); }
  finally { fieldset.disabled = false; form.removeAttribute('aria-busy'); }
}

$('#account-open').addEventListener('click', () => panel(recovery ? 'recovery' : currentUser ? 'profile' : 'login'));
$('#account-start').addEventListener('click', () => panel(currentUser ? 'profile' : 'signup'));
$('#account-close').addEventListener('click', () => dialog.close());
for (const button of dialog.querySelectorAll('[data-switch]')) button.addEventListener('click', () => panel(button.dataset.switch));
dialog.addEventListener('close', () => {
  dialog.querySelectorAll('input[type=password]').forEach(input => { input.value = ''; });
});
$('#use-profile').addEventListener('click', () => fillProfile(true));
window.addEventListener('fiche:reset', () => fillProfile());

$('#signup-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  run(form, async () => {
    const profile = normalizeProfile({ entreprise: form.elements.entreprise.value, equipe: form.elements.equipe.value });
    const { data, error } = await client.auth.signUp({
      email: form.elements.email.value.trim(), password: form.elements.password.value,
      options: { data: profile, emailRedirectTo: redirectTo }
    });
    if (error) throw error;
    form.reset();
    if (data.session) {
      await syncProfile();
      if (currentProfile) dialog.close();
    } else {
      panel('login');
      message('Vérifiez votre boîte mail pour confirmer votre adresse, puis connectez-vous. Si vous avez déjà un compte, utilisez votre mot de passe habituel.');
    }
  });
});
$('#login-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  run(form, async () => {
    const { error } = await client.auth.signInWithPassword({ email: form.elements.email.value.trim(), password: form.elements.password.value });
    if (error) throw error;
    form.elements.password.value = '';
    await syncProfile();
    if (currentProfile) dialog.close();
  });
});
$('#forgot-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  run(form, async () => {
    const { error } = await client.auth.resetPasswordForEmail(form.elements.email.value.trim(), { redirectTo });
    if (error) throw error;
    message('Si un compte correspond à cette adresse, un e-mail vous permettra de choisir un nouveau mot de passe.');
  });
});
$('#recovery-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (form.elements.password.value !== form.elements.confirm.value) {
    message('Les deux mots de passe doivent être identiques.', true);
    return;
  }
  run(form, async () => {
    const { error } = await client.auth.updateUser({ password: form.elements.password.value });
    if (error) throw error;
    recovery = false;
    form.reset();
    await syncProfile();
    panel('profile');
    message('Votre mot de passe a été mis à jour.');
  });
});
$('#profile-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  run(form, async () => {
    const generation = ++revision;
    const saved = await profiles.save({ entreprise: form.elements.entreprise.value, equipe: form.elements.equipe.value });
    if (generation !== revision) return;
    currentUser = saved.user;
    currentProfile = saved.profile;
    updateAccountUI();
    // Saving a profile deliberately updates this fiche's company/team only.
    fillProfile(true);
    message('Profil enregistré. Vos prochaines fiches seront préremplies.');
  });
});
$('#signout').addEventListener('click', async () => {
  if (!client) return;
  $('#signout').disabled = true;
  try {
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw error;
    ++revision;
    forgetLocalProfile();
    dialog.close();
  } catch (error) { message(friendlyError(error), true); }
  finally { $('#signout').disabled = false; }
});

if (client) {
  // Do not await SDK calls inside the auth callback: they share the auth lock.
  client.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') { ++revision; forgetLocalProfile(); }
    else if (event === 'PASSWORD_RECOVERY') { recovery = true; panel('recovery'); }
    else if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') setTimeout(async () => { if (syncing) await syncing; await syncProfile(); }, 0);
  });
  syncProfile();
} else {
  dialog.querySelectorAll('form fieldset').forEach(fieldset => { fieldset.disabled = true; });
}
updateAccountUI();
