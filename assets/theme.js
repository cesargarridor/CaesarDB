/* Tema claro/oscuro. Sigue al sistema por defecto; si lo cambias con el botón, guarda solo esa preferencia en tu navegador (localStorage). */
(function () {
  var KEY = "caesardb-theme", root = document.documentElement, t = "";
  try { t = localStorage.getItem(KEY) || ""; } catch (e) {}
  if (t !== "dark" && t !== "light") t = window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  root.setAttribute("data-theme", t);
  document.addEventListener("DOMContentLoaded", function () {
    var b = document.querySelector(".theme-btn");
    if (!b) return;
    var es = root.lang !== "en";
    function paint() { var d = root.getAttribute("data-theme") === "dark"; b.textContent = d ? "☀" : "☾"; var l = d ? (es ? "Tema claro" : "Light theme") : (es ? "Tema oscuro" : "Dark theme"); b.setAttribute("aria-label", l); b.title = l; }
    b.addEventListener("click", function () {
      var n = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", n);
      try { localStorage.setItem(KEY, n); } catch (e) {}
      paint();
    });
    paint();
  });
})();
