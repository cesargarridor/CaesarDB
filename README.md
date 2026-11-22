# Web de CaesarDB (site/)

HTML + CSS + JS vanilla. Sin build, sin frameworks, sin trackers, sin cookies, sin fuentes ni CDN externos: todo es local
(`assets/`). Español en la raíz y inglés en `en/` (mismas páginas). Para verla: `cd site && python3 -m http.server 8080`.

Publicación prevista: GitHub Pages en `https://cesargarridor.github.io/caesardb/` (la app enlaza a esa URL: constante
`SITE_URL` en `src/lib/license.ts` y lista blanca `is_allowed_external` en `src-tauri/src/license.rs`).

## Qué editar

- `assets/config.js`: `RELEASES_REPO` (repo de GitHub Releases de donde salen los instaladores), patrones de nombre de
  instalador por sistema (`ASSET_PATTERNS`), `BUY_URL`, `PORTAL_URL` y los datos del titular (`LEGAL`, de referencia).
- Descargas: `assets/site.js` detecta el sistema (macOS / Windows / Linux), consulta
  `https://api.github.com/repos/${RELEASES_REPO}/releases/latest`, elige el asset por patrón y lanza la descarga directa
  (macOS `.dmg` universal, Windows `_x64-setup.exe`, Linux `.AppImage` + enlace `.deb`). Si la API falla, el botón lleva a la
  página de releases. Si el repo de releases es privado la API devolverá 404: el fallback seguirá funcionando.
- Datos del titular (nombre, NIF, domicilio fiscal, correo): son los mismos que publica la web de Caesar y están escritos en
  las páginas legales (`legal.html`, `terms.html`, `privacy.html`, `refunds.html`, `security.html`, `support.html`, ES y
  `en/`). Para cambiarlos, busca el valor antiguo en `site/` y reemplázalo en todo el árbol, por ejemplo:
  `grep -rl "cgarrui0301@gmail.com" site | xargs sed -i '' 's/cgarrui0301@gmail.com/nuevo@correo/g'`.
- Equipos (Team): el botón usa un `mailto:` al correo de contacto; sustitúyelo por un formulario o enlace cuando exista.
- Política de reembolso: `refunds.html` y `en/refunds.html`, entre los comentarios `POLÍTICA DE REEMBOLSO` / `REFUND POLICY`
  (hoy: 14 días de cortesía, importe íntegro). Es el único bloque a tocar si cambia.
- Estilo: `assets/style.css` (variables en `:root`; fondo azul-grafito y acento ámbar).

## Aviso interno (no publicar en las páginas)

Los textos legales (términos/EULA, privacidad, cookies, reembolsos, seguridad, soporte y aviso legal) son un texto
informativo; **no es asesoramiento jurídico: revísalo con un abogado antes de publicar**.
