import { supabase, SUPABASE_URL, SUPABASE_ANON } from './supabase-client.js';
import { createAuthController } from './auth-controller.js';
const controller = createAuthController(supabase.auth);
export const auth = {
  ...controller,
  async signIn() {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON } });
    if (!response.ok) throw new Error('No se pudo conectar con el servicio de acceso. Inténtalo de nuevo.');
    const settings = await response.json();
    if (!settings.external?.google) throw new Error('El acceso con Google aún no está disponible. Por ahora puedes jugar como invitado.');
    return controller.signIn();
  },
};
