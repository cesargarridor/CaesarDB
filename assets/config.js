/* Configuración editable de la web de CaesarDB. Sin telemetría: este archivo solo se usa para sustituir textos y enlaces. */

/* Repositorio de GitHub Releases del que se descargan los instaladores (owner/repo). */
var RELEASES_REPO = "cesargarridor/caesardb";

/* Enlace de respaldo (página de releases) si la API de GitHub falla. Se deriva de RELEASES_REPO. */
var DOWNLOAD_URL = "https://github.com/" + RELEASES_REPO + "/releases/latest";

/* Patrones del nombre del instalador por sistema (se elige el primer asset que coincida). */
var ASSET_PATTERNS = {
  mac: [/universal.*\.dmg$/i, /\.dmg$/i],
  windows: [/_x64-setup\.exe$/i, /setup\.exe$/i, /\.msi$/i],
  linux: [/\.AppImage$/i],
  "linux-deb": [/\.deb$/i]
};

/* Compra. */
var BUY_URL = "https://buy.polar.sh/polar_cl_kHgkDXSwdOPquaqy306z5ZUvmwxE4lZp0mWr52ZqaAc";
var PORTAL_URL = "https://polar.sh/caesar-api-client/portal";

/* Datos del responsable (fuente única de referencia; son los mismos que publica la web de Caesar).
   Las páginas legales los llevan escritos en el HTML: si cambian, busca el valor antiguo en site/ y reemplázalo (ver site/README.md). */
var LEGAL = {
  nombre: "Cesar Garrido (persona física)",
  nif: "78164624K",
  domicilio: "Avenida Madrid, 23003 Jaén (España)",
  email: "cgarrui0301@gmail.com"
};
