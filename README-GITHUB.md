# Hylia · GitHub Pages + Cloudflare

Esta exportación adapta Hylia para publicar su interfaz en GitHub Pages y ejecutar las APIs en tu cuenta de Cloudflare. No modifica el Site original.

## Estado de la entrega

- Interfaz compilada en `docs/`, con rutas relativas compatibles con `usuario.github.io/repositorio/`.
- Código del cliente, estrategias, componentes, APIs, esquema y migraciones incluidos.
- API compilada en `worker/dist/worker.js` y código en `portable/`.
- Acceso propio con usuario/clave; sesiones firmadas de ocho horas y permisos separados para imágenes. Ya no depende del inicio de sesión de ChatGPT.
- Compilaciones del cliente y API verificadas. Pruebas locales de autenticación, persistencia, aislamiento entre usuarios y permisos verificadas.
- Cloudflare y la conexión entre frontend y API deben estar configurados antes de usar las funciones de cuenta. No está desplegado por el mero hecho de tener este ZIP.

## Publicar la interfaz sin compilar

1. Descomprime el ZIP y sube su contenido a la raíz de un repositorio. Incluye `.github/`.
2. En Settings → Pages puedes elegir **Deploy from a branch**, rama principal y carpeta **/docs**. La interfaz ya está compilada.
3. O elige **GitHub Actions** y ejecuta «Publicar interfaz en GitHub Pages». Este flujo vuelve a compilar desde el código.
4. En la pantalla de acceso configura la URL de tu API. También puedes establecer la variable de Actions `VITE_API_BASE` y ejecutar el flujo Pages para incluirla automáticamente. Para publicar directamente /docs, edita `docs/config.js` con esa URL pública.

## Desplegar la API desde GitHub

Crea en Settings → Secrets and variables → Actions estos secretos:

| Secreto | Contenido |
|---|---|
| CLOUDFLARE_API_TOKEN | Token para editar Workers, secretos de Workers y D1, además de R2 en tu cuenta |
| CLOUDFLARE_ACCOUNT_ID | ID de tu cuenta Cloudflare |
| APP_USERS_JSON | Lista JSON de usuarios privados, cada uno con username, name, password e id estable |
| APP_SESSION_SECRET | Clave aleatoria de al menos 32 caracteres; conservarla entre despliegues |
| ARX_PASSWORD | Clave del espacio ARX; no se incluye en el código público |

APP_USERS_JSON se guarda únicamente como secreto de Actions/Cloudflare. Ejemplo de estructura (sustituye la clave por una de al menos 12 caracteres):

```json
[{"username":"ricardo","name":"Ricardo","id":"github:ricardo","password":"SUSTITUIR_POR_CLAVE_PRIVADA_LARGA"}]
```

Configura la variable de Actions `APP_ORIGIN` con el origen de GitHub Pages, por ejemplo `https://tuusuario.github.io`, sin el nombre del repositorio.

Ejecuta Actions → **Publicar API en Cloudflare**. El flujo crea o reutiliza la base D1, aplica las migraciones, publica el Worker y guarda sus secretos. El registro muestra la URL workers.dev. Después configura `VITE_API_BASE` con esa URL y publica la interfaz. El token Cloudflare queda en secretos y no se empaqueta en el frontend.

Para Hylia debes habilitar R2 en la cuenta antes del despliegue. Si el panel requiere contratar o aceptar condiciones, completa esa autorización primero.

## Desarrollo

Node >=22.13. Instala con `npm install`, ejecuta `npm test` y `npm run build`. `npm run dev` abre el cliente. `npm run build:worker` compila solo la API.

## Datos y migración

El ZIP contiene el código y los planes versionados, pero no copia la base activa ni archivos privados del Site original. Las cuentas, conexiones cifradas, historial y archivos de producción requieren una migración independiente; no se ha alterado su origen. No reutilices un identificador de usuario para otra persona.

El acceso al espacio ARX conserva la entrada de Diego/Ricardo y su clave de equipo configurada en ARX_PASSWORD. Tras entrar, se importa el plan ARX/WOW versionado una sola vez. El calendario, las tareas, dependencias, tablero, taller creativo, referencias con imágenes y enlaces de colaboración usan D1/R2. Cada colaborador debe estar definido en APP_USERS_JSON y aceptar la invitación o entrar en ARX. Los enlaces de solo lectura usan `?share=TOKEN`, compatibles con Pages; su revocación se verifica en la API.
