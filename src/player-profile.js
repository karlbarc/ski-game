export const MAX_PLAYER_NAME_LENGTH = 20;

export function normalizePlayerName(name) {
  return String(name || '').trim().slice(0, MAX_PLAYER_NAME_LENGTH);
}

export function authenticatedPlayerName(user, savedName = '') {
  const profileName = user?.user_metadata?.given_name
    || user?.user_metadata?.full_name
    || user?.user_metadata?.name
    || user?.email?.split('@')[0]
    || 'Esquiador';
  return normalizePlayerName(normalizePlayerName(savedName) || profileName || 'Esquiador');
}
