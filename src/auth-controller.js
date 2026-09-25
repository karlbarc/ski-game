// The SDK owns token storage, PKCE verification, refresh and cross-tab events.
export function createAuthController(auth, page = window) {
  let session = null;
  const listeners = new Set();
  function update(next) {
    session = next;
    for (const listener of listeners) listener(session?.user || null);
  }
  return {
    user: () => session?.user || null,
    subscribe(listener) {
      listeners.add(listener);
      listener(session?.user || null);
      return () => listeners.delete(listener);
    },
    async initialize() {
      auth.onAuthStateChange((_event, next) => update(next));
      const url = new URL(page.location.href);
      const hash = new URLSearchParams(url.hash.slice(1));
      const failed = url.searchParams.has('error') || hash.has('error');
      const code = url.searchParams.get('code');
      try {
        if (failed) throw new Error('El acceso con Google fue cancelado o rechazado. Inténtalo de nuevo.');
        if (code) {
          const flowId = url.searchParams.get('sb_flow_id');
          const { error } = await auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
          if (error) throw new Error('No pudimos completar el acceso. Vuelve a pulsar Continuar con Google.');
        }
        const { data, error } = await auth.getSession();
        if (error) throw error;
        update(data.session);
      } finally {
        if (code || failed) {
          for (const key of ['code', 'error', 'error_code', 'error_description', 'sb_flow_id']) url.searchParams.delete(key);
          url.hash = '';
          page.history.replaceState(null, '', url.pathname + url.search);
        }
      }
    },
    async signIn() {
      const url = new URL(page.location.href);
      const { error } = await auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: url.origin + url.pathname, queryParams: { prompt: 'select_account' } },
      });
      if (error) throw new Error('No se pudo iniciar el acceso con Google. Inténtalo más tarde.');
    },
    async signOut() {
      const { error } = await auth.signOut({ scope: 'local' });
      if (error) throw new Error('No se pudo cerrar la sesión. Inténtalo de nuevo.');
      update(null);
    },
  };
}
