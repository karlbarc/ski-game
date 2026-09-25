export function authenticatedPlayerName(user, savedName = '') {
  const profileName = user?.user_metadata?.given_name
    || user?.user_metadata?.full_name
    || user?.user_metadata?.name
    || user?.email?.split('@')[0]
    || 'Esquiador';
  return (savedName.trim() || String(profileName).trim() || 'Esquiador').slice(0, 12);
}
