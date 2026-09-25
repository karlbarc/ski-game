# Activar Google

El juego usa Supabase Auth con OAuth PKCE. Las credenciales de Google solo se
guardan en Supabase, nunca en JavaScript, Vercel ni el repositorio.

1. En [Google Auth Platform](https://console.cloud.google.com/auth/overview),
   selecciona o crea un proyecto. Configura el nombre de la app, correo de soporte
   y audiencia. Si está en modo Testing, añade las cuentas de prueba.
2. Crea un cliente OAuth de tipo **Web application**.
   - Origen JavaScript: `https://ski-game-beta.vercel.app`
   - URI de redirección autorizada:
     `https://mvhsepsnncfviwizxmcy.supabase.co/auth/v1/callback`
   - Utiliza únicamente los permisos básicos `openid`, email y perfil.
3. En [Supabase → Authentication → Providers](https://supabase.com/dashboard/project/mvhsepsnncfviwizxmcy/auth/providers),
   habilita Google y guarda el Client ID y Client Secret del paso anterior.
4. En [Supabase → URL Configuration](https://supabase.com/dashboard/project/mvhsepsnncfviwizxmcy/auth/url-configuration):
   - Site URL: `https://ski-game-beta.vercel.app`
   - Redirect URLs: `https://ski-game-beta.vercel.app/`
   - Para desarrollo: `http://localhost:8173/` y `http://127.0.0.1:8173/`.
   - Si mantienes GitHub Pages, añade `https://karlbarc.github.io/ski-game/`.
   - No autorices comodines para dominios ajenos ni todas las previews de Vercel.
5. Abre el juego, pulsa **Continuar con Google**, elige una cuenta y completa
   una bajada. Comprueba el ranking, recarga y prueba **Cerrar sesión**.

El SDK guarda y renueva la sesión en el navegador y sincroniza el cierre entre
pestañas. El ranking público contiene el apodo, identificador y puntuación; no
expone el correo ni los metadatos del dispositivo. Los invitados pueden jugar y
consultar marcas, pero no escribir. Las marcas antiguas siguen visibles y no se
reclaman automáticamente: un UUID guardado en localStorage no acredita propiedad.
Los mejores tiempos locales son del dispositivo; las marcas de Google pertenecen
a la cuenta. La base conserva atómicamente el mejor tiempo de cada cuenta/pista.

## Validación técnica

- `npm test`: OAuth, errores, sesiones, cambios de cuenta y reglas de envío.
- `npm run build`: regenera `vendor/supabase.js` desde el lockfile y genera `dist/`.
- `tests/score-auth.sql`: pruebas de permisos con roles reales. Ejecutar dentro
  de una transacción y terminar con `ROLLBACK`; no dejar las filas de prueba.
- La migración `20260925000000_google_score_ownership.sql` debe aplicarse antes
  del frontend nuevo. Cierra escrituras anónimas y protege registros ajenos.

Autenticar usuarios no prueba que hayan jugado honestamente: los tiempos aún
proceden del navegador. La validación de partidas y límites de frecuencia son
trabajo adicional si se necesita un ranking resistente a trampas.

Referencia: [documentación oficial de Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google).
