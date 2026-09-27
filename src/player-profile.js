export const MIN_PLAYER_NAME_LENGTH = 2;
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

export function authenticatedPlayerAvatar(user) {
  const candidate = user?.user_metadata?.avatar_url || user?.user_metadata?.picture;
  if (typeof candidate !== 'string') return '';
  try {
    const url = new URL(candidate);
    const hostname = url.hostname.toLowerCase();
    const isGoogleImage = hostname === 'googleusercontent.com'
      || hostname.endsWith('.googleusercontent.com');
    return url.protocol === 'https:' && isGoogleImage ? url.href : '';
  } catch {
    return '';
  }
}
