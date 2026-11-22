/* Sin telemetría, sin cookies, sin almacenamiento. Solo: (1) descargas directas desde GitHub Releases,
   (2) enlaces de compra/portal. */
(function () {
  var rel = null, relP = null;
  function os() {
    var ua = (navigator.userAgent || "") + " " + (navigator.platform || "");
    if (/Win/i.test(ua)) return "windows";
    if (/Mac|iPhone|iPad/i.test(ua)) return "mac";
    if (/Linux|X11|Ubuntu/i.test(ua) && !/Android/i.test(ua)) return "linux";
    return "";
  }
  function getRelease() {
    if (!relP) relP = fetch("https://api.github.com/repos/" + RELEASES_REPO + "/releases/latest", { headers: { Accept: "application/vnd.github+json" }, referrerPolicy: "no-referrer", credentials: "omit" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { rel = j; return j; });
    return relP;
  }
  function pick(kind) {
    var pats = (typeof ASSET_PATTERNS === "object" && ASSET_PATTERNS[kind]) || [];
    var assets = (rel && rel.assets) || [];
    for (var i = 0; i < pats.length; i++)
      for (var j = 0; j < assets.length; j++) if (pats[i].test(assets[j].name)) return assets[j];
    return null;
  }
  function mb(n) { return (n / 1048576).toFixed(1).replace(".", document.documentElement.lang === "es" ? "," : ".") + " MB"; }
  try {
    var mine = os();
    document.querySelectorAll("[data-dl-auto]").forEach(function (a) {
      var names = { mac: "macOS", windows: "Windows", linux: "Linux" };
      if (mine) { a.setAttribute("data-dl", mine); a.textContent = a.getAttribute("data-label").replace("{os}", names[mine]); }
      else a.setAttribute("data-dl", "mac");
    });
    document.querySelectorAll("[data-dl-deb]").forEach(function (a) { a.setAttribute("data-dl", "linux-deb"); });
    document.querySelectorAll("[data-dl]").forEach(function (a) {
      var kind = a.getAttribute("data-dl");
      a.href = DOWNLOAD_URL;
      a.addEventListener("click", function (ev) {
        if (!rel) return; // aún sin datos: se sigue el enlace de respaldo
        var as = pick(kind === "auto" ? mine : kind);
        if (as) { ev.preventDefault(); window.location.href = as.browser_download_url; }
      });
    });
    getRelease().then(function () {
      document.querySelectorAll("[data-dl-ver]").forEach(function (e) { e.textContent = rel.tag_name || rel.name || ""; });
      document.querySelectorAll("[data-dl-size]").forEach(function (e) {
        var as = pick(e.getAttribute("data-dl-size")); if (as) e.textContent = mb(as.size);
      });
      document.querySelectorAll("[data-dl-auto]").forEach(function (a) {
        var as = pick(a.getAttribute("data-dl")); var s = document.querySelector("[data-dl-main-meta]");
        if (as && s) s.textContent = (rel.tag_name || "") + " · " + mb(as.size);
      });
    }).catch(function () {});
    document.querySelectorAll("[data-buy]").forEach(function (a) { a.href = BUY_URL; });
    document.querySelectorAll("[data-portal]").forEach(function (a) { a.href = PORTAL_URL; });
  } catch (e) {}
})();
