export function googleProfileAvatar(metadata) {
  const candidate = metadata?.avatar_url || metadata?.picture;
  if (typeof candidate !== 'string' || candidate.length > 2048) return null;
  try {
    const url = new URL(candidate);
    const hostname = url.hostname.toLowerCase();
    const isGoogleImage = hostname === 'googleusercontent.com'
      || hostname.endsWith('.googleusercontent.com');
    return url.protocol === 'https:' && isGoogleImage ? url.href : null;
  } catch {
    return null;
  }
}
