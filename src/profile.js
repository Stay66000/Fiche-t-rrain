/** Explicit allowlist: no field from an intervention is ever sent to Supabase. */
export function normalizeProfile(input) {
  const entreprise = String(input?.entreprise ?? '').trim();
  const equipe = String(input?.equipe ?? '').trim();
  if (!entreprise || entreprise.length > 30) throw new Error('Indiquez une entreprise de 1 à 30 caractères.');
  if (!equipe || equipe.length > 25) throw new Error('Indiquez une équipe de 1 à 25 caractères.');
  return { entreprise, equipe };
}

export function configIsReady(config) {
  if (config?.accountsEnabled !== true) return false;
  try {
    const url = new URL(config.supabaseUrl);
    return url.protocol === 'https:' && /^[a-z0-9]+\.supabase\.co$/.test(url.hostname)
      && url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password
      && /^sb_publishable_[A-Za-z0-9_-]+$/.test(config.supabasePublishableKey);
  } catch { return false; }
}

export function profileFieldsToFill(current, profile, overwrite = false) {
  const clean = normalizeProfile(profile);
  return Object.fromEntries(Object.entries(clean).filter(([key]) => overwrite || !String(current[key] || '').trim()));
}

export function createProfileStore(client) {
  async function verifiedUser() {
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    if (!data.user) throw new Error('Reconnectez-vous pour accéder à votre profil.');
    return data.user;
  }
  return {
    async load() {
      const user = await verifiedUser();
      const { data, error } = await client.from('profiles').select('entreprise,equipe').eq('id', user.id).maybeSingle();
      if (error) throw error;
      return { user, profile: data };
    },
    async save(input) {
      const clean = normalizeProfile(input);
      const user = await verifiedUser();
      const { data, error } = await client.from('profiles').upsert({ id: user.id, ...clean }, { onConflict: 'id' })
        .select('entreprise,equipe').single();
      if (error) throw error;
      return { user, profile: data };
    }
  };
}

export function friendlyError(error) {
  const messages = {
    invalid_credentials: 'Adresse e-mail ou mot de passe incorrect.',
    email_not_confirmed: 'Confirmez votre adresse e-mail avant de vous connecter.',
    user_already_exists: 'Un compte existe déjà avec cette adresse. Essayez de vous connecter.',
    weak_password: 'Choisissez un mot de passe plus long et plus difficile à deviner.',
    over_email_send_rate_limit: 'Trop de demandes d’e-mail. Patientez avant de réessayer.',
    over_request_rate_limit: 'Trop de tentatives. Réessayez dans quelques minutes.',
    email_address_not_authorized: 'L’envoi des e-mails n’est pas encore activé pour ce site. Utilisez le formulaire sans compte.',
    signup_disabled: 'Les inscriptions sont momentanément indisponibles. Le formulaire sans compte reste accessible.',
    otp_expired: 'Ce lien a expiré. Demandez un nouvel e-mail.',
    same_password: 'Choisissez un mot de passe différent de l’ancien.',
    session_not_found: 'Votre session a expiré. Reconnectez-vous.'
  };
  if (messages[error?.code]) return messages[error.code];
  if (error?.name === 'AuthSessionMissingError') return 'Votre session a expiré. Reconnectez-vous.';
  if (error?.message?.startsWith('Indiquez ') || error?.message?.startsWith('Reconnectez-vous')) return error.message;
  return 'Le service est momentanément indisponible. Réessayez ou continuez sans compte.';
}
