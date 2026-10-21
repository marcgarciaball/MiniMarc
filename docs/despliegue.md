# Guía de despliegue

Agente Personal se despliega en Vercel (plan Hobby), con Supabase (base de datos, autenticación y RLS), inicio de sesión con Google y Google Calendar, y Gemini como IA interna. Es de un solo usuario. Esta guía asume que sabes programar pero que nunca has configurado estos servicios.

**Aviso de coste:** todo el stack está pensado para coste 0 €. No se activa facturación en Google Cloud ni en Google AI Studio. Ningún paso de esta guía exige pagar. Aun así, Google Calendar anuncia que cobrará por superar 1.000.000 de peticiones diarias por proyecto "a partir de finales de 2026", con al menos 90 días de aviso. Para uso personal no se alcanza ese umbral, pero conviene revisarlo si cambia la política.

**Aviso de privacidad (Gemini):** el nivel gratuito de la API de Gemini puede usar lo que envías para mejorar los productos de Google, y revisores humanos pueden leerlo. Google pide no enviar información personal o confidencial al nivel gratuito. El diseño de la app no envía contenido de Trabajo a la IA, pero sí enviará tareas, ideas y nombres personales. Es una decisión tomada por Marc; revisarla antes de usar la IA con datos reales (fase 3).

Orden recomendado: Supabase (1), Google Cloud (2), Supabase Auth (3), Vercel (4) y desarrollo local (5). El paso 3 necesita la URL de Vercel del paso 4, así que puedes dejar el Site URL para después, pero el orden de los pasos 1 a 3 no se puede cambiar.

---

## 1. Supabase

1. Entra en https://supabase.com y crea una cuenta.
2. Pulsa **New project**. Elige la organización, un nombre (por ejemplo `agente-personal`), una contraseña para la base de datos (guárdala) y una región UE: **West EU (Paris)** (`eu-west-3`) o **Central EU (Frankfurt)** (`eu-central-1`). Plan: **Free**.
3. Espera a que el proyecto termine de crearse.
4. Aplica el esquema. Hay dos opciones:
   - **Editor SQL (sin CLI):** abre **SQL Editor → New query**, pega el contenido completo de `supabase/migrations/0001_init.sql` y pulsa **Run**.
   - **Con CLI:** `npx supabase login`, luego `npx supabase link --project-ref <ref>` (el `ref` está en la URL del proyecto, `https://supabase.com/dashboard/project/<ref>`), y por último `npx supabase db push`.
5. Anota las claves en **Settings → API Keys** (en el panel antiguo, **Settings → API**):
   - **Project URL** (`https://<proyecto>.supabase.co`), en **Settings → API**.
   - **Publishable key** (`sb_publishable_...`). Equivale a la antigua clave `anon`. Es pública.
   - **Secret key** (`sb_secret_...`). Equivale a la antigua `service_role`. Salta RLS: **nunca** la pongas en una variable `NEXT_PUBLIC_*` ni en el cliente.
   - Las claves antiguas `anon` y `service_role` siguen funcionando, pero Supabase las retirará a finales de 2026. Si la app falla con las nuevas claves, usa las antiguas y avísame.
6. Comprueba que las extensiones `pg_cron` y `pg_net` aparecen en **Database → Extensions**. Las necesita la fase 4. Si no aparecen en el plan Free, no sigas: hay que cambiar el diseño de los avisos.

## 2. Google Cloud

1. Entra en https://console.cloud.google.com y crea un proyecto (por ejemplo `agente-personal`). **No vincules ninguna cuenta de facturación.**
2. Activa la API: **APIs y servicios → Biblioteca → Google Calendar API → Habilitar**.
3. Configura la pantalla de consentimiento (en la consola nueva, **Google Auth Platform**):
   1. **Branding:** nombre de la app y tu correo de contacto.
   2. **Audience:** tipo **External**.
   3. **Data Access → Add or remove scopes:** añade `https://www.googleapis.com/auth/calendar` y guarda.
   4. **Audience → Publish app → Confirm** para pasar a **In production**.
      - Si la app se queda en *Testing*, los refresh tokens caducan a los 7 días y Calendar dejará de sincronizar.
      - Al iniciar sesión, Google mostrará "Google no ha verificado esta aplicación". Acepta la advertencia una vez. Es esperado en una app personal sin verificar.
4. Crea el cliente OAuth: **Clients → Create client**.
   - Tipo de aplicación: **Aplicación web**.
   - **Authorized redirect URIs:** `https://<proyecto>.supabase.co/auth/v1/callback` (sustituye `<proyecto>` por la referencia de tu proyecto Supabase).
   - Guarda el **Client ID** y el **Client secret**. Son `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`.

## 3. Supabase Auth: proveedor Google

1. En Supabase: **Authentication → Sign In / Providers → Google**. Activa el proveedor y pega el **Client ID** y el **Client secret** del paso 2.
2. En **Authentication → URL Configuration**:
   - **Site URL:** `https://<app>.vercel.app` (sustituye `<app>` por el nombre del proyecto en Vercel; ver paso 4).
   - **Redirect URLs:** añade `https://<app>.vercel.app/auth/callback`.
   - Para desarrollo local, añade también `http://localhost:3000/auth/callback`.
3. Si todavía no tienes la URL de Vercel, deja el Site URL con la URL que aparezca tras el primer despliegue y vuelve a este paso. Vercel puede añadir un sufijo si el nombre está ocupado; usa la URL exacta que te muestre.

## 4. Vercel

1. Entra en https://vercel.com, crea una cuenta y elige el plan **Hobby**. Hobby es gratuito y solo para uso personal no comercial, que es el caso.
2. **Add New → Project → Import Git Repository**. Autoriza a Vercel sobre GitHub e importa `marcgarciaball/MiniMarc`. Rama: `main` (o `feat/agente-personal` si aún no has fusionado).
3. Nombre del proyecto: el que quieras. Determina el dominio `<app>.vercel.app`.
4. Antes de desplegar, abre **Environment Variables** y crea las siguientes (todas para Production; añade Preview si quieres probar ramas):

   | Variable | Qué es y de dónde sale |
   |---|---|
   | `ALLOWED_EMAIL` | Tu correo de Google. Único correo que puede entrar; cualquier otro se rechaza. |
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL de Supabase (paso 1.5). Es pública. |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable key de Supabase (paso 1.5). Es pública. |
   | `SUPABASE_SERVICE_ROLE_KEY` | Secret key de Supabase (paso 1.5). Solo servidor. |
   | `GOOGLE_CLIENT_ID` | Client ID del cliente OAuth (paso 2.4). |
   | `GOOGLE_CLIENT_SECRET` | Client secret del cliente OAuth (paso 2.4). Solo servidor. |
   | `GEMINI_API_KEY` | Clave de Google AI Studio creada en un proyecto **sin facturación** (https://aistudio.google.com/apikey). No hace falta hasta la fase 3: puedes dejarla vacía. |
   | `VAPID_PUBLIC_KEY` | Clave pública para notificaciones web push. Generar con `npx web-push generate-vapid-keys` (en tu ordenador). |
   | `VAPID_PRIVATE_KEY` | Clave privada de la misma pareja VAPID. Solo servidor. |
   | `CRON_SECRET` | Secreto que protege las rutas que llama el cron. Generar con `openssl rand -hex 32`. Solo servidor. |
   | `APP_TZ` | Valor fijo `Europe/Madrid`. Zona horaria de la app. |

5. Pulsa **Deploy**. Cuando termine, la URL será `https://<app>.vercel.app`. Vuelve al paso 3 y pon esa URL en Site URL y en Redirect URLs.
6. Cada vez que cambies una variable, vuelve a desplegar: **Deployments → ⋯ → Redeploy**. Las variables no se aplican a despliegues ya hechos.
7. La región de las funciones está fijada en `vercel.json` a `cdg1` (París). Hobby solo permite una región.

## 5. Desarrollo local

Requisitos: Node.js 20.9 o superior (requisito de Next.js 16) y npm.

1. Clona el repositorio y ejecuta `npm install`.
2. Crea `.env.local` en la raíz con las mismas variables del paso 4 (con los mismos valores). Este archivo está ignorado por Git y no debe subirse.
3. `.env.example` todavía no existe; el repositorio lo referencia en el README. Créalo tú con este contenido (solo nombres, sin valores), y así lo podrás commitear:

   ```bash
   # Correo de Google autorizado (único usuario)
   ALLOWED_EMAIL=
   # Supabase (Settings → API Keys)
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   # Google OAuth y Calendar
   GOOGLE_CLIENT_ID=
   GOOGLE_CLIENT_SECRET=
   # Gemini (fase 3; puede quedar vacía)
   GEMINI_API_KEY=
   # Web push (npx web-push generate-vapid-keys)
   VAPID_PUBLIC_KEY=
   VAPID_PRIVATE_KEY=
   # Secreto de cron (openssl rand -hex 32)
   CRON_SECRET=
   # Zona horaria
   APP_TZ=Europe/Madrid
   ```

4. Arranca el servidor de desarrollo con `npm run dev` y abre http://localhost:3000. Comprueba que el inicio de sesión funciona (requiere el redirect `http://localhost:3000/auth/callback` del paso 3).
5. Comprueba la build de producción con `npm run build`. **Esta build nunca se ha ejecutado fuera del entorno de desarrollo automatizado**, así que puede fallar. Si falla, copia el error completo y revisa primero las variables de entorno, que deben estar definidas para que la build compile.
6. Ejecuta los tests con `npm test`.

## 6. Límites de los planes gratuitos

Verificados el 2026-10-21 contra la documentación oficial. Los límites cambian; revísalos si algo deja de funcionar.

| Servicio | Límite | Valor | Fuente | Verificación |
|---|---|---|---|---|
| Vercel Hobby | Uso | Solo personal, no comercial | https://vercel.com/docs/plans/hobby | verificado el 2026-10-21 |
| Vercel Hobby | Invocaciones de funciones | 1.000.000 al mes | https://vercel.com/docs/plans/hobby | verificado el 2026-10-21 |
| Vercel Hobby | Duración máxima de función | 300 s | https://vercel.com/docs/plans/hobby | verificado el 2026-10-21 |
| Vercel Hobby | CPU activa / memoria | 4 h CPU / 360 GB-h al mes | https://vercel.com/docs/plans/hobby | verificado el 2026-10-21 |
| Vercel Hobby | Cron | Máximo una vez al día (no se usa; el cron va en Supabase) | https://vercel.com/docs/cron-jobs/usage-and-pricing | verificado el 2026-10-21 |
| Vercel Hobby | Regiones de funciones | Una sola (`cdg1` en `vercel.json`) | https://vercel.com/docs/functions/configuring-functions/region | verificado el 2026-10-21 |
| Supabase Free | Base de datos | 500 MB por proyecto | https://supabase.com/pricing | verificado el 2026-10-21 |
| Supabase Free | Usuarios activos mensuales | 50.000 | https://supabase.com/pricing | verificado el 2026-10-21 |
| Supabase Free | Egress | 5 GB (más 5 GB de egress en caché) | https://supabase.com/pricing | verificado el 2026-10-21 |
| Supabase Free | Almacenamiento de archivos | 1 GB | https://supabase.com/pricing | verificado el 2026-10-21 |
| Supabase Free | Proyectos activos | 2 | https://supabase.com/pricing | verificado el 2026-10-21 |
| Supabase Free | Pausa por inactividad | Tras 1 semana sin actividad; se reactiva desde el panel | https://supabase.com/pricing | verificado el 2026-10-21 |
| Supabase | `pg_cron` y `pg_net` en Free | **No confirmado** en la documentación consultada; comprobar en Database → Extensions | https://supabase.com/docs/guides/database/extensions/pg_cron | pendiente |
| Supabase | `pg_net` (si está disponible) | 200 peticiones/s; timeout por defecto 2.000 ms; respuestas guardadas 6 h | https://supabase.com/docs/guides/database/extensions/pg_net | verificado el 2026-10-21 |
| Gemini API (nivel gratuito) | Modelo recomendado | `gemini-2.5-flash-lite`; el más barato de los Flash-Lite con nivel gratuito (0,10 $ / 0,40 $ por 1M tokens de entrada/salida en pago). Los `gemini-3.x-flash-lite` cuestan más | https://ai.google.dev/gemini-api/docs/pricing | verificado el 2026-10-21 |
| Gemini API (nivel gratuito) | Peticiones por minuto y día | **No verificado** en fuentes oficiales; una fuente secundaria indica 15 RPM y 1.000 RPD. Confirmar en AI Studio | https://aistudio.google.com/rate-limit | pendiente |
| Gemini API (nivel gratuito) | Ámbito y reinicio | Por proyecto (no por clave); el RPD se reinicia a medianoche hora del Pacífico | https://ai.google.dev/gemini-api/docs/rate-limits | verificado el 2026-10-21 |
| Gemini API (nivel gratuito) | Uso de datos | Google usa el contenido para mejorar sus productos; revisores humanos pueden leerlo. No enviar datos personales o confidenciales | https://ai.google.dev/gemini-api/terms | verificado el 2026-10-21 |
| Gemini API | UE (EEE) | Las condiciones piden usar solo servicios de pago al poner clientes de API a disposición de usuarios del EEE. Para una app de uso propio de un solo usuario no está claro que aplique; revisar | https://ai.google.dev/gemini-api/terms | verificado el 2026-10-21 |
| Google Calendar API | Por usuario y proyecto | 600 peticiones por minuto | https://developers.google.com/calendar/api/guides/quota | verificado el 2026-10-21 |
| Google Calendar API | Por proyecto | 10.000 peticiones por minuto | https://developers.google.com/calendar/api/guides/quota | verificado el 2026-10-21 |
| Google Calendar API | Umbral diario de facturación | 1.000.000 peticiones al día por proyecto; sin cargo por debajo. Cargos previstos a finales de 2026 (ver aviso inicial) | https://developers.google.com/calendar/pricing | verificado el 2026-10-21 |

## Verificación

Marc ejecuta esta lista cuando la guía esté terminada. Todas las casillas deben estar marcadas.

- [ ] Inicio de sesión con el correo de Marc (`ALLOWED_EMAIL`) completa el flujo de Google y entra en la app.
- [ ] Inicio de sesión con otra cuenta de Google es rechazado.
- [ ] La PWA se instala en el iPhone desde Safari: **Compartir → Añadir a pantalla de inicio** (iOS 16.4 o superior).
