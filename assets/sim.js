/* Simulador de CaesarDB: reproduce la interfaz real (barra superior, conexiones, tablas e índices, pestañas, constructor de
   Query/Scan/PartiQL, tabla con colores por tipo, Inspector, Safe Mode, Split View, Código, Tipos, Live Tail y Métricas).
   Datos inventados de una tienda single-table. Todo ocurre en tu navegador: sin red, sin cookies, sin almacenamiento. */
(function () {
  var root = document.getElementById("sim");
  if (!root) return;
  var EN = document.documentElement.lang === "en";
  function t(es, en) { return EN ? en : es; }
  var PRICING = "pricing.html";
  var ICON = (function () { var s = document.currentScript; return s && s.src ? s.src.replace(/sim\.js.*$/, "app-icon.png") : "assets/app-icon.png"; })();
  var PAGE = 25, TABLE = "Tienda";

  /* ── datos reproducibles: CUSTOMER / PRODUCT / ORDER / LINE en una sola tabla ── */
  var seed = 11;
  function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
  function pick(a) { return a[Math.floor(rnd() * a.length)]; }
  function r2(n) { return Math.round(n * 100) / 100; }
  function pad(n, l) { n = String(n); while (n.length < l) n = "0" + n; return n; }
  var cities = ["Madrid", "Sevilla", "Valencia", "Bilbao", "Lisboa"], cats = ["libros", "deporte", "hogar", "tech"];
  var names = ["Ana Ruiz", "Luis Gómez", "Marta Díaz", "Iker Soto", "Lucía Vega", "Pablo Mena", "Nuria Álvarez", "Iván Moreno", "Sara Cano", "Hugo Pardo"];
  var statuses = ["PAID", "SHIPPED", "PENDING", "REFUNDED"];
  var base = [], i, k;
  for (i = 1; i <= 30; i++) {
    var city = cities[i % 5], nm = names[i % 10] + (i > 10 ? " " + String.fromCharCode(65 + (i % 26)) + "." : "");
    base.push({ pk: "CUSTOMER#" + i, sk: "META", entity: "CUSTOMER", name: nm, email: nm.toLowerCase().replace(/[^a-z]+/g, ".").replace(/\.$/, "") + "@example.com", city: city, createdAt: "2026-" + pad(1 + (i % 11), 2) + "-" + pad(1 + (i * 7 % 27), 2), vip: i % 4 === 0, gsi1pk: "CITY#" + city, gsi1sk: "CUSTOMER#" + pad(i, 3) });
  }
  for (i = 1; i <= 24; i++) {
    var cat = cats[i % 4];
    base.push({ pk: "PRODUCT#" + i, sk: "META", entity: "PRODUCT", sku: "SKU-" + (1000 + i * 7), title: cat + " modelo " + i, price: r2(4 + rnd() * 190), stock: Math.floor(rnd() * 500), category: cat, dims: [12, 30, i % 9 + 1], gsi1pk: "CAT#" + cat, gsi1sk: "PRODUCT#" + pad(i, 3) });
  }
  var oid = 1000;
  for (i = 1; i <= 30; i++) {
    var no = 1 + Math.floor(rnd() * 4);
    for (k = 1; k <= no; k++) {
      var id = "o" + (++oid), day = "2026-1" + (rnd() < 0.5 ? 0 : 1) + "-" + pad(1 + Math.floor(rnd() * 27), 2), st = pick(statuses);
      var ts = Math.floor(Date.UTC(2026, 9, 1 + Math.floor(rnd() * 50)) / 1000), nl = 1 + Math.floor(rnd() * 3), tot = 0;
      for (var j = 1; j <= nl; j++) {
        var pr = 1 + Math.floor(rnd() * 24), qty = 1 + Math.floor(rnd() * 4), price = r2(4 + rnd() * 190);
        tot += price * qty;
        base.push({ pk: "ORDER#" + id, sk: "LINE#" + j, entity: "LINE", productId: pr, sku: "SKU-" + (1000 + pr * 7), qty: qty, price: price });
      }
      var o = { pk: "CUSTOMER#" + i, sk: "ORDER#" + day + "#" + id, entity: "ORDER", orderId: id, total: r2(tot), status: st, placedAt: ts, gsi1pk: "STATUS#" + st, gsi1sk: day };
      if (rnd() < 0.3) o.note = JSON.stringify({ gift: true, msg: "Feliz cumple" });
      if (st === "PENDING") o.ttl = ts + 604800;
      base.push(o);
    }
  }
  function cmpKey(a, b) { return a.pk < b.pk ? -1 : a.pk > b.pk ? 1 : a.sk < b.sk ? -1 : a.sk > b.sk ? 1 : 0; }
  var items = base.slice().sort(cmpKey);
  var INDEXES = [
    { id: "", label: t("Tabla principal", "Main table"), pk: "pk", sk: "sk" },
    { id: "GSI1", label: "GSI1", pk: "gsi1pk", sk: "gsi1sk" },
    { id: "por-ciudad", label: "por-ciudad", pk: "city", sk: "createdAt" }
  ];
  var ENTS = ["CUSTOMER", "PRODUCT", "ORDER", "LINE"];
  var ENTCLS = { CUSTOMER: "u", PRODUCT: "p", ORDER: "o", LINE: "l" };

  /* ── estado ── */
  var S = {
    env: "local", mode: "scan", idx: "", pk: "CUSTOMER#1", skOp: "begins_with", sk: "", fAttr: "", fOp: "contains", fVal: "",
    pql: "SELECT * FROM \"Tienda\" WHERE pk = 'CUSTOMER#1'", rows: [], all: [], next: 0, sel: null, itab: "clean", ent: null,
    stats: { count: 0, scanned: 0, rcu: 0, lat: 0, total: 0, scannedAll: 0 }, safe: false, queue: [], split: false, modal: null, toast: "", err: "", codeKind: "ts"
  };

  /* ── motor de consulta ── */
  function idxDef() { for (var a = 0; a < INDEXES.length; a++) if (INDEXES[a].id === S.idx) return INDEXES[a]; return INDEXES[0]; }
  function sortFor(def) {
    return function (a, b) {
      var x = a[def.sk] == null ? "" : a[def.sk], y = b[def.sk] == null ? "" : b[def.sk];
      return x < y ? -1 : x > y ? 1 : cmpKey(a, b);
    };
  }
  function matchFilter(it) {
    if (!S.fAttr || S.fVal === "") return true;
    var v = it[S.fAttr]; if (v === undefined) return false;
    var s = String(v), q = S.fVal, nv = Number(v), nq = Number(q);
    switch (S.fOp) {
      case "=": return s === q;
      case "<>": return s !== q;
      case "contains": return s.toLowerCase().indexOf(q.toLowerCase()) >= 0;
      case "begins_with": return s.indexOf(q) === 0;
      case ">": return nv > nq;
      case "<": return nv < nq;
      default: return true;
    }
  }
  var PQL_SELECT = /^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/|\s)*select\b/i;
  function parsePartiql(sql) {
    var m = /^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/|\s)*select\s+\*\s+from\s+"?([\w-]+)"?(?:\s+where\s+([\s\S]+?))?\s*;?\s*$/i.exec(sql);
    if (!m) return null;
    var conds = [], w = m[2] || "", re = /begins_with\(\s*(\w+)\s*,\s*'([^']*)'\s*\)|(\w+)\s*(=|<>|>|<)\s*(?:'([^']*)'|(-?[\d.]+))/gi, x;
    while ((x = re.exec(w))) conds.push(x[1] ? { a: x[1], op: "begins", v: x[2] } : { a: x[3], op: x[4], v: x[5] !== undefined ? x[5] : x[6] });
    return { table: m[1], conds: conds };
  }
  function runQuery() {
    var src = items, def = idxDef(), keyed = false;
    S.err = "";
    if (S.mode === "partiql") {
      if (!PQL_SELECT.test(S.pql)) {
        if (!/^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/|\s)*(insert|update|delete)\b/i.test(S.pql)) { S.err = t("PartiQL no reconocido: usa SELECT, INSERT, UPDATE o DELETE", "Unrecognised PartiQL: use SELECT, INSERT, UPDATE or DELETE"); S.rows = []; S.all = []; return true; }
        if (S.env === "aws") { S.modal = "pro:PartiQL INSERT / UPDATE / DELETE"; } else { flash(t("Sentencia de escritura simulada: en local se ejecuta de verdad en la app", "Write statement simulated: it runs for real in the app")); }
        return false;
      }
      var p = parsePartiql(S.pql);
      if (!p) { S.err = t("PartiQL no reconocido por el simulador (prueba SELECT * FROM \"Tienda\" WHERE pk = 'CUSTOMER#1')", "PartiQL not supported by the simulator (try SELECT * FROM \"Tienda\" WHERE pk = 'CUSTOMER#1')"); S.rows = []; S.all = []; return true; }
      src = items.filter(function (it) {
        return p.conds.every(function (c) {
          var v = it[c.a]; if (v === undefined) return false;
          if (c.op === "begins") return String(v).indexOf(c.v) === 0;
          if (c.op === "=") return String(v) === String(c.v);
          if (c.op === "<>") return String(v) !== String(c.v);
          if (c.op === ">") return Number(v) > Number(c.v);
          return Number(v) < Number(c.v);
        });
      });
      keyed = true;
    } else if (S.mode === "query") {
      src = items.filter(function (it) { return it[def.pk] === S.pk.trim(); });
      if (S.sk.trim() !== "") src = src.filter(function (it) { var v = it[def.sk]; if (v === undefined) return false; return S.skOp === "=" ? String(v) === S.sk.trim() : String(v).indexOf(S.sk.trim()) === 0; });
      keyed = true;
    } else if (S.idx) {
      src = items.filter(function (it) { return it[def.pk] !== undefined; });
    }
    if (S.idx && S.mode !== "partiql") src = src.slice().sort(sortFor(def));
    var scanned = src.length, rows = S.mode === "partiql" ? src : src.filter(matchFilter), bytes = 0;
    rows.forEach(function (it) { bytes += size(it); });
    S.all = rows; S.next = 0; S.rows = []; S.sel = null;
    S.stats = { count: 0, scanned: 0, rcu: Math.max(0.5, Math.ceil((keyed ? bytes : scanned * 230) / 4096) * 0.5), lat: Math.round(6 + rnd() * 8 + (S.env === "aws" ? 24 : 0)), total: rows.length, scannedAll: scanned };
    more(true);
    return true;
  }
  function more(first) {
    var chunk = S.all.slice(S.next, S.next + PAGE);
    S.rows = S.rows.concat(chunk); S.next += chunk.length;
    S.stats.count = S.rows.length; S.stats.scanned = S.stats.scannedAll - (S.stats.total - S.next);
    if (!first) S.stats.rcu += 0.5 * (1 + Math.floor(rnd() * 2));
  }
  function size(it) { return JSON.stringify(it).length + 12; }

  /* ── utilidades de DOM ── */
  function el(tag, cls, kids) {
    var e = document.createElement(tag); if (cls) e.className = cls;
    (kids || []).forEach(function (c) { if (c == null) return; e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function btn(label, cls, on, title) { var b = el("button", cls, typeof label === "string" ? [label] : label); b.type = "button"; if (title) b.title = title; b.addEventListener("click", on); return b; }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
  function hl(txt) {
    return esc(txt).replace(/"([^"\n]+?)":/g, '<span class="j-k">"$1"</span>:').replace(/: "([^"\n]*)"/g, ': <span class="j-s">"$1"</span>')
      .replace(/: (-?\d+(\.\d+)?)/g, ': <span class="j-n">$1</span>').replace(/: (true|false|null)/g, ': <span class="j-b">$1</span>');
  }
  var toastT;
  function flash(m) { S.toast = m; renderToast(); clearTimeout(toastT); toastT = setTimeout(function () { S.toast = ""; renderToast(); }, 2400); }
  function isLocked() { return S.env === "aws"; }
  function pro(name) { S.modal = "pro:" + name; renderModal(); }
  function iso(sec) { return new Date(sec * 1000).toISOString().replace(".000Z", "Z"); }
  function raw(v) {
    if (v === null) return { NULL: true };
    if (typeof v === "string") return { S: v };
    if (typeof v === "number") return { N: String(v) };
    if (typeof v === "boolean") return { BOOL: v };
    if (Array.isArray(v)) return v.length && v.every(function (x) { return typeof x === "number"; }) ? { NS: v.map(String) } : { L: v.map(raw) };
    var o = {}; Object.keys(v).forEach(function (kk) { o[kk] = raw(v[kk]); }); return { M: o };
  }

  /* ── esqueleto ── */
  var R = {};
  function build() {
    root.textContent = "";
    var top = el("div", "sx-top");
    var im = el("img", "sx-ico"); im.src = ICON; im.alt = ""; im.width = 18; im.height = 18;
    top.appendChild(el("div", "sx-brand", [im, el("b", null, ["CaesarDB"])]));
    R.conn = el("div", "sx-conn"); top.appendChild(R.conn);
    R.badge = el("span", "sx-badge"); top.appendChild(R.badge);
    R.tools = el("div", "sx-tools"); top.appendChild(R.tools);
    R.side = el("aside", "sx-side");
    R.tabs = el("div", "sx-tabs"); R.qbar = el("div", "sx-q"); R.legend = el("div", "sx-legend"); R.err = el("div", "sx-err");
    R.grid = el("div", "sx-grid"); R.insp = el("div", "sx-insp"); R.split = el("div", "sx-split2"); R.status = el("div", "sx-status");
    R.work = el("div", "sx-work", [R.grid, R.insp]);
    var main = el("div", "sx-main", [R.tabs, R.qbar, R.legend, R.err, R.work, R.split, R.status]);
    R.toast = el("div", "sx-toast"); R.modalHost = el("div", "sx-modalhost");
    root.appendChild(top); root.appendChild(el("div", "sx-body", [R.side, main])); root.appendChild(R.toast); root.appendChild(R.modalHost);
    root.appendChild(el("div", "sx-foot", [t("Simulador · datos inventados · nada sale de tu navegador", "Simulator · made-up data · nothing leaves your browser")]));
    root.classList.add("sx");
  }

  /* ── barra superior ── */
  function renderTop() {
    R.conn.textContent = "";
    R.conn.appendChild(el("span", "sx-dot " + (S.env === "aws" ? "prod" : "loc")));
    var sel = el("select", "sx-sel"); sel.setAttribute("aria-label", t("Conexión", "Connection"));
    [["local", "Local · localhost:4566"], ["aws", "AWS · prod · eu-west-1"]].forEach(function (c) { var o = el("option", null, [c[1]]); o.value = c[0]; if (S.env === c[0]) o.selected = true; sel.appendChild(o); });
    sel.addEventListener("change", function () { S.env = sel.value; S.safe = false; S.queue = []; S.split = false; S.modal = null; renderAll(); });
    R.conn.appendChild(sel);
    R.conn.appendChild(el("span", "sx-env " + (S.env === "aws" ? "prod" : "loc"), [S.env === "aws" ? "PROD" : "LOCAL"]));
    R.badge.textContent = "FREE"; R.badge.className = "sx-badge";
    R.badge.title = t("Plan Free: en localhost todo está desbloqueado", "Free plan: everything is unlocked on localhost");
    R.tools.textContent = "";
    [["safe", "Safe Mode", true], ["split", "Split View", true], ["code", t("Código", "Code"), true], ["types", t("Tipos", "Types"), true], ["tail", "Live Tail", true], ["metrics", t("Métricas", "Metrics"), true], ["table", t("Tabla", "Table"), false], ["migrate", t("Migración", "Migration"), true]].forEach(function (d) {
      var on = (d[0] === "safe" && S.safe) || (d[0] === "split" && S.split);
      var b = btn([el("span", null, [d[1]])], "sx-tb" + (on ? " on" : ""), function () { tool(d[0]); });
      if (d[2] && isLocked()) b.appendChild(el("u", null, ["PRO"]));
      if (d[0] === "safe" && S.queue.length) b.appendChild(el("i", null, [String(S.queue.length)]));
      R.tools.appendChild(b);
    });
  }
  function tool(id) {
    var nm = { safe: "Safe Mode", split: "Split View", code: t("Copiar como código", "Copy as code"), types: t("Tipos", "Types"), tail: "Live Tail (Streams)", metrics: t("Métricas de CloudWatch", "CloudWatch metrics"), migrate: t("Migración", "Migration") };
    if (id !== "table" && isLocked()) { pro(nm[id]); return; }
    if (id === "safe") { S.safe = !S.safe; flash(S.safe ? t("Safe Mode activado: los cambios se ponen en cola", "Safe Mode on: changes are queued") : t("Safe Mode desactivado", "Safe Mode off")); renderTop(); renderStatus(); return; }
    if (id === "split") { S.split = !S.split; renderTop(); renderSplit(); return; }
    S.modal = id; renderModal();
  }

  /* ── barra lateral ── */
  function defaultPk() { var d = idxDef(); return d.id === "GSI1" ? "STATUS#PENDING" : d.id === "por-ciudad" ? "Madrid" : "CUSTOMER#1"; }
  function renderSide() {
    var s = R.side; s.textContent = "";
    s.appendChild(el("h4", null, [t("Tablas", "Tables")]));
    s.appendChild(el("div", "sx-tbl on", [el("b", null, [TABLE]), el("small", null, [items.length + " items"])]));
    INDEXES.slice(1).forEach(function (ix) {
      s.appendChild(btn([el("span", null, [ix.id]), el("small", null, [ix.pk + " / " + ix.sk])], "sx-ix" + (S.idx === ix.id ? " on" : ""), function () { S.idx = S.idx === ix.id ? "" : ix.id; S.sk = ""; if (S.mode === "query") S.pk = defaultPk(); renderQuery(); renderSide(); renderTabs(); run(); }));
    });
    s.appendChild(el("h4", null, [t("Favoritos", "Favorites")]));
    [[t("Pedidos pendientes", "Pending orders"), "GSI1", "STATUS#PENDING", ""], [t("Clientes de Madrid", "Madrid customers"), "por-ciudad", "Madrid", ""], [t("Pedidos del cliente 3", "Customer 3 orders"), "", "CUSTOMER#3", "ORDER#"]].forEach(function (f) {
      s.appendChild(btn([el("span", "sx-star", ["★"]), f[0]], "sx-fav", function () { S.mode = "query"; S.idx = f[1]; S.pk = f[2]; S.sk = f[3]; renderQuery(); renderSide(); renderTabs(); run(); }));
    });
    s.appendChild(el("h4", null, [t("Historial", "History")]));
    s.appendChild(el("div", "sx-hist", [t("Cada consulta que ejecutas queda aquí.", "Every query you run is kept here.")]));
  }

  /* ── pestañas y barra de consulta ── */
  function renderTabs() {
    R.tabs.textContent = "";
    R.tabs.appendChild(el("div", "sx-tab on", [el("span", "sx-dot loc"), TABLE + (S.idx ? " · " + S.idx : "")]));
    var plus = btn("+", "sx-plus", function () { if (isLocked()) pro(t("Varias pestañas", "Multiple tabs")); else flash(t("Nueva pestaña (en local no hay límite)", "New tab (no limit on local)")); }, t("Nueva pestaña", "New tab"));
    if (isLocked()) plus.appendChild(el("u", null, ["PRO"]));
    R.tabs.appendChild(plus);
  }
  function input(key, ph, w) {
    var i = el("input"); i.placeholder = ph; i.value = S[key]; i.style.width = w; i.spellcheck = false; i.setAttribute("aria-label", ph);
    i.addEventListener("input", function () { S[key] = i.value; });
    i.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); run(); } });
    return i;
  }
  function select(key, opts, on) {
    var s = el("select", "sx-sel sm");
    opts.forEach(function (o) { var op = el("option", null, [o[1]]); op.value = o[0]; if (S[key] === o[0]) op.selected = true; s.appendChild(op); });
    s.addEventListener("change", function () { S[key] = s.value; if (on) on(); });
    return s;
  }
  function renderQuery() {
    var q = R.qbar; q.textContent = "";
    var seg = el("div", "sx-seg");
    [["scan", "Scan"], ["query", "Query"], ["partiql", "PartiQL"]].forEach(function (m) { seg.appendChild(btn(m[1], S.mode === m[0] ? "on" : "", function () { S.mode = m[0]; if (m[0] === "query") S.pk = defaultPk(); renderQuery(); run(); })); });
    q.appendChild(seg);
    if (S.mode !== "partiql") q.appendChild(select("idx", INDEXES.map(function (x) { return [x.id, x.label]; }), function () { S.sk = ""; if (S.mode === "query") S.pk = defaultPk(); renderQuery(); renderSide(); renderTabs(); run(); }));
    if (S.mode === "query") {
      var d = idxDef();
      q.appendChild(el("label", "sx-lb", [d.pk + " ="])); q.appendChild(input("pk", d.pk, "9.5rem"));
      q.appendChild(el("label", "sx-lb", [d.sk])); q.appendChild(select("skOp", [["begins_with", "begins_with"], ["=", "="]]));
      q.appendChild(input("sk", d.sk, "8rem"));
    }
    if (S.mode === "partiql") {
      var ta = el("textarea", "sx-pql"); ta.value = S.pql; ta.rows = 2; ta.spellcheck = false; ta.setAttribute("aria-label", "PartiQL");
      ta.addEventListener("input", function () { S.pql = ta.value; });
      ta.addEventListener("keydown", function (e) { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); run(); } });
      q.appendChild(ta);
    } else {
      q.appendChild(el("span", "sx-fl", [el("b", null, [t("Filtro", "Filter")]),
        select("fAttr", [["", t("atributo…", "attribute…")], ["entity", "entity"], ["status", "status"], ["total", "total"], ["city", "city"], ["name", "name"], ["price", "price"], ["category", "category"], ["qty", "qty"]]),
        select("fOp", [["contains", "contains"], ["=", "="], ["<>", "<>"], ["begins_with", "begins_with"], [">", ">"], ["<", "<"]]), input("fVal", t("valor", "value"), "6.5rem")]));
    }
    q.appendChild(btn(t("Ejecutar", "Run") + " ⌘↵", "sx-run", function () { run(); }));
  }

  /* ── tabla de datos ── */
  function columns() {
    var freq = {}; S.rows.forEach(function (r) { Object.keys(r).forEach(function (kk) { if (kk !== "pk" && kk !== "sk" && kk !== "entity" && kk.indexOf("gsi1") !== 0) freq[kk] = (freq[kk] || 0) + 1; }); });
    var extra = Object.keys(freq).sort(function (a, b) { return freq[b] - freq[a] || (a < b ? -1 : 1); }).slice(0, 5);
    var cols = ["pk", "sk"];
    if (idxDef().id === "GSI1") cols.push("gsi1pk", "gsi1sk");
    return cols.concat(["entity"], extra);
  }
  function fmt(v) { if (v === undefined) return ""; if (typeof v === "object") return JSON.stringify(v); return String(v); }
  function isQueued(r) { return S.queue.some(function (q) { return q.op === "delete" && q.item === r; }); }
  function renderGrid() {
    var g = R.grid; g.textContent = "";
    if (!S.rows.length) { g.appendChild(el("div", "sx-empty", [S.err ? "" : t("Sin resultados. Prueba Scan, o Query con CUSTOMER#1 y ORDER#.", "No results. Try Scan, or Query with CUSTOMER#1 and ORDER#.")])); return; }
    var cols = columns(), tbl = el("table"), hd = el("tr"), def = idxDef();
    cols.forEach(function (c) {
      var isKey = c === "pk" || c === "sk" || c === def.pk || c === def.sk, th = el("th", isKey ? "key" : "", [c]);
      if (c === "pk" || c === "sk") th.appendChild(el("em", null, [c === "pk" ? "PK" : "SK"]));
      hd.appendChild(th);
    });
    tbl.appendChild(el("thead", null, [hd]));
    var tb = el("tbody");
    S.rows.forEach(function (r) {
      if (S.ent && r.entity !== S.ent) return;
      var tr = el("tr", "e-" + ENTCLS[r.entity] + (S.sel === r ? " on" : "") + (isQueued(r) ? " del" : ""));
      cols.forEach(function (c) {
        var td = el("td", c === "pk" || c === "sk" ? "key" : "");
        if (c === "entity") td.appendChild(el("span", "sx-pill e-" + ENTCLS[r.entity], [r.entity])); else td.textContent = fmt(r[c]);
        tr.appendChild(td);
      });
      tr.addEventListener("click", function () { S.sel = r; renderGrid(); renderInsp(); });
      tb.appendChild(tr);
    });
    tbl.appendChild(tb); g.appendChild(tbl);
    if (S.next < S.all.length) g.appendChild(btn(t("Cargar más", "Load more") + " (" + (S.all.length - S.next) + ")", "sx-more", function () { more(false); renderGrid(); renderLegend(); renderStatus(); }));
  }
  function renderLegend() {
    var lg = R.legend; lg.textContent = "";
    var c = {}; S.rows.forEach(function (r) { c[r.entity] = (c[r.entity] || 0) + 1; });
    lg.appendChild(el("b", null, [t("Tipos de objeto", "Object types")]));
    ENTS.forEach(function (e) {
      if (!c[e]) return;
      lg.appendChild(btn([el("i", "e-" + ENTCLS[e]), e, el("em", null, [String(c[e])])], "sx-lg" + (S.ent === e ? " on" : ""), function () { S.ent = S.ent === e ? null : e; renderLegend(); renderGrid(); }, t("Clic para filtrar", "Click to filter")));
    });
  }

  /* ── Inspector ── */
  function detectors(it) {
    var out = [];
    Object.keys(it).forEach(function (kk) {
      var v = it[kk];
      if (typeof v === "number" && v > 1e9 && v < 4e9) out.push(el("div", "sx-det", [el("b", null, [kk]), " → " + (kk === "ttl" ? "TTL · " : "epoch · ") + iso(v)]));
      if (typeof v === "string" && /^\s*[{[]/.test(v)) { try { JSON.parse(v); out.push(el("div", "sx-det", [el("b", null, [kk]), " → " + t("JSON dentro de un String", "JSON inside a String")])); } catch (e) { void e; } }
    });
    return out;
  }
  function tree(v, key) {
    if (v && typeof v === "object") {
      var d = el("details"); d.open = true; d.appendChild(el("summary", null, [(key != null ? key + ": " : "") + (Array.isArray(v) ? "[" + v.length + "]" : "{" + Object.keys(v).length + "}")]));
      Object.keys(v).forEach(function (kk) { d.appendChild(tree(v[kk], kk)); }); return d;
    }
    return el("div", "sx-leaf", [(key != null ? key + ": " : "") + (typeof v === "string" ? '"' + v + '"' : String(v))]);
  }
  function renderInsp() {
    var p = R.insp; p.textContent = "";
    R.work.classList.toggle("has", !!S.sel);
    if (!S.sel) { p.appendChild(el("div", "sx-empty", [t("Selecciona una fila para abrir el Inspector.", "Select a row to open the Inspector.")])); return; }
    var it = S.sel, sz = size(it);
    p.appendChild(el("div", "sx-ih", [el("span", "sx-pill e-" + ENTCLS[it.entity], [it.entity]), el("b", null, [it.pk]), el("small", null, [it.sk])]));
    var tabs = el("div", "sx-itabs");
    [["clean", "Clean JSON"], ["raw", "Raw JSON"], ["tree", t("Árbol", "Tree")]].forEach(function (x) { tabs.appendChild(btn(x[1], S.itab === x[0] ? "on" : "", function () { S.itab = x[0]; renderInsp(); })); });
    p.appendChild(tabs);
    if (S.itab === "tree") { var tr = el("div", "sx-tree"); tr.appendChild(tree(it)); p.appendChild(tr); }
    else {
      var shown = it;
      if (S.itab === "raw") { shown = {}; Object.keys(it).forEach(function (kk) { shown[kk] = raw(it[kk]); }); }
      var pre = el("pre"); pre.innerHTML = hl(JSON.stringify(shown, null, 2)); p.appendChild(pre);
    }
    detectors(it).forEach(function (d) { p.appendChild(d); });
    var bar = el("i"); bar.style.width = Math.max(1, Math.round(sz / 4096)) + "%";
    p.appendChild(el("div", "sx-size", [el("span", null, [t("Peso", "Size") + ": " + sz + " B / 400 KB"]), el("div", "sx-bar", [bar])]));
    var act = el("div", "sx-act");
    act.appendChild(btn(t("Duplicar", "Duplicate"), "ghost", function () { write("dup", it); }));
    act.appendChild(btn(t("Borrar", "Delete"), "ghost danger", function () { write("delete", it); }));
    act.appendChild(btn(t("Comparar", "Compare"), "ghost", function () { if (isLocked()) pro(t("Diff entre items", "Item diff")); else { S.modal = "diff"; renderModal(); } }));
    p.appendChild(act);
  }
  function write(op, it) {
    if (isLocked()) { pro(op === "delete" ? t("Borrar item", "Delete item") : t("Duplicar item", "Duplicate item")); return; }
    if (S.safe) { S.queue.push({ op: op, item: it }); flash(t("Añadido a la cola de Safe Mode", "Added to the Safe Mode queue")); renderTop(); renderStatus(); renderGrid(); return; }
    applyOp({ op: op, item: it }); flash(op === "delete" ? t("Item borrado (simulado)", "Item deleted (simulated)") : t("Item duplicado (simulado)", "Item duplicated (simulated)")); run();
  }
  function applyOp(q) {
    if (q.op === "delete") { var ix = items.indexOf(q.item); if (ix >= 0) items.splice(ix, 1); }
    else { var c = JSON.parse(JSON.stringify(q.item)); c.sk = c.sk + "#copy"; items.push(c); items.sort(cmpKey); }
  }

  /* ── Split View ── */
  function renderSplit() {
    var p = R.split; p.textContent = ""; p.style.display = S.split ? "block" : "none";
    if (!S.split) return;
    p.appendChild(el("div", "sx-sh", [el("b", null, ["Split View"]), t(" · segunda consulta: productos de la categoría libros", " · second query: books category products")]));
    var cols = ["pk", "sku", "title", "price", "stock"], rows = items.filter(function (it) { return it.entity === "PRODUCT" && it.category === "libros"; }).slice(0, 4);
    var tbl = el("table"); tbl.appendChild(el("thead", null, [el("tr", null, cols.map(function (c) { return el("th", null, [c]); }))]));
    var tb = el("tbody"); rows.forEach(function (r) { tb.appendChild(el("tr", "e-p", cols.map(function (c) { return el("td", null, [fmt(r[c])]); }))); });
    tbl.appendChild(tb); p.appendChild(tbl);
  }

  /* ── barra de estado ── */
  function renderStatus() {
    var s = R.status; s.textContent = ""; var st = S.stats;
    [[t("Devueltos", "Returned"), st.count + (st.total > st.count ? " / " + st.total : "")], [t("Escaneados", "Scanned"), st.scanned], ["RCU", st.rcu.toFixed(1)], [t("Latencia", "Latency"), st.lat + " ms"]].forEach(function (x) { s.appendChild(el("span", null, [x[0] + " ", el("b", null, [String(x[1])])])); });
    if (S.queue.length) s.appendChild(btn(t("Cambios en cola", "Queued changes") + " · " + S.queue.length, "sx-qbtn", function () { S.modal = "queue"; renderModal(); }));
    s.appendChild(el("span", "sx-ro" + (isLocked() ? " on" : ""), [isLocked() ? "🔒 " + t("Solo lectura", "Read-only") : (S.safe ? "Safe Mode" : "")]));
  }
  function renderToast() { R.toast.textContent = S.toast; R.toast.className = "sx-toast" + (S.toast ? " on" : ""); }

  /* ── modales ── */
  var tailTimer = null, mTimer = null, ev = [], tailPaused = false, spark = { rcu: [], wcu: [] };
  function stopTimers() { clearInterval(tailTimer); clearInterval(mTimer); tailTimer = mTimer = null; }
  function closeModal() { S.modal = null; renderModal(); }
  function modal(title, body, wide) {
    var back = el("div", "sx-back"); back.addEventListener("click", function (e) { if (e.target === back) closeModal(); });
    back.appendChild(el("div", "sx-modal" + (wide ? " wide" : ""), [el("div", "sx-mh", [el("b", null, [title]), btn("✕", "sx-x", closeModal, t("Cerrar", "Close"))]), body]));
    return back;
  }
  function codeFor(kind) {
    var def = idxDef(), isQ = S.mode === "query", ix = S.idx ? S.idx : "";
    var kce = def.pk + " = :pk" + (S.sk ? (S.skOp === "=" ? " AND " + def.sk + " = :sk" : " AND begins_with(" + def.sk + ", :sk)") : "");
    var ep = "http://localhost:4566";
    if (kind === "ts") {
      if (!isQ) return 'import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";\n\nconst client = new DynamoDBClient({ endpoint: "' + ep + '", region: "us-east-1" });\nconst out = await client.send(new ScanCommand({\n  TableName: "' + TABLE + '",' + (ix ? '\n  IndexName: "' + ix + '",' : "") + "\n  Limit: 25,\n}));\nconsole.log(out.Items, out.LastEvaluatedKey);";
      return 'import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";\n\nconst client = new DynamoDBClient({ endpoint: "' + ep + '", region: "us-east-1" });\nconst out = await client.send(new QueryCommand({\n  TableName: "' + TABLE + '",' + (ix ? '\n  IndexName: "' + ix + '",' : "") + '\n  KeyConditionExpression: "' + kce + '",\n  ExpressionAttributeValues: {\n    ":pk": { S: "' + S.pk + '" },' + (S.sk ? '\n    ":sk": { S: "' + S.sk + '" },' : "") + "\n  },\n}));\nconsole.log(out.Items, out.LastEvaluatedKey);";
    }
    if (kind === "py") {
      var head = 'import boto3\n\ntable = boto3.resource("dynamodb", endpoint_url="' + ep + '", region_name="us-east-1").Table("' + TABLE + '")\n';
      if (!isQ) return head + "res = table.scan(" + (ix ? 'IndexName="' + ix + '", ' : "") + "Limit=25)\nprint(res[\"Items\"], res.get(\"LastEvaluatedKey\"))";
      return head + "res = table.query(" + (ix ? '\n    IndexName="' + ix + '",' : "") + '\n    KeyConditionExpression="' + kce + '",\n    ExpressionAttributeValues={":pk": "' + S.pk + '"' + (S.sk ? ', ":sk": "' + S.sk + '"' : "") + "},\n)\nprint(res[\"Items\"], res.get(\"LastEvaluatedKey\"))";
    }
    if (!isQ) return "aws dynamodb scan --endpoint-url " + ep + " --table-name " + TABLE + (ix ? " --index-name " + ix : "") + " --limit 25";
    return "aws dynamodb query --endpoint-url " + ep + " --table-name " + TABLE + (ix ? " --index-name " + ix : "") + " \\\n  --key-condition-expression '" + kce + "' \\\n  --expression-attribute-values '{\":pk\":{\"S\":\"" + S.pk + "\"}" + (S.sk ? ",\":sk\":{\"S\":\"" + S.sk + "\"}" : "") + "}'";
  }
  function typesFor() {
    var by = {}; S.rows.forEach(function (r) { (by[r.entity] = by[r.entity] || []).push(r); });
    var out = Object.keys(by).map(function (e) {
      var f = {}; by[e].forEach(function (r) { Object.keys(r).forEach(function (kk) { var v = r[kk]; f[kk] = Array.isArray(v) ? "number[]" : typeof v === "object" ? "Record<string, unknown>" : typeof v; }); });
      return "export interface " + e.charAt(0) + e.slice(1).toLowerCase() + " {\n" + Object.keys(f).map(function (kk) { return "  " + kk + ": " + f[kk] + ";"; }).join("\n") + "\n}";
    }).join("\n\n");
    return out || "// " + t("Carga datos para inferir los tipos", "Load data to infer types");
  }
  function spk(arr, col) {
    var mx = Math.max.apply(null, arr) || 1, pts = arr.map(function (v, n) { return (n * 300 / (arr.length - 1)).toFixed(1) + "," + (58 - v / mx * 52).toFixed(1); }).join(" ");
    return '<svg viewBox="0 0 300 60" preserveAspectRatio="none"><polyline fill="none" stroke="' + col + '" stroke-width="2" points="' + pts + '"/></svg>';
  }
  function renderModal() {
    R.modalHost.textContent = ""; stopTimers();
    var m = S.modal; if (!m) return;
    var node;
    if (m.indexOf("pro:") === 0) {
      var wall = el("div", "sx-wall", [el("b", null, ["PRO"]), el("h4", null, [m.slice(4)]), el("p", null, [t("Esta función requiere el plan Pro al trabajar con AWS real. En localhost es gratis.", "This feature needs the Pro plan on real AWS. It is free on localhost.")])]);
      var a = el("a", "btn", [t("Ver planes", "See plans")]); a.href = PRICING; wall.appendChild(a);
      node = modal(t("Requiere plan Pro", "Requires Pro plan"), wall);
    } else if (m === "code") {
      var body = el("div", "sx-code"), tabs = el("div", "sx-itabs"), pre = el("pre");
      [["ts", "TypeScript"], ["py", "Python"], ["cli", "AWS CLI"]].forEach(function (x) { tabs.appendChild(btn(x[1], S.codeKind === x[0] ? "on" : "", function () { S.codeKind = x[0]; renderModal(); })); });
      pre.textContent = codeFor(S.codeKind); body.appendChild(tabs); body.appendChild(pre);
      body.appendChild(btn(t("Copiar", "Copy"), "ghost", function () { try { navigator.clipboard.writeText(pre.textContent); flash(t("Copiado", "Copied")); } catch (e) { flash(t("Selecciona y copia el texto", "Select and copy the text")); } }));
      node = modal(t("Copiar como código", "Copy as code"), body, true);
    } else if (m === "types") {
      var tp = el("pre"); tp.textContent = typesFor(); node = modal(t("Tipos inferidos de los items cargados", "Types inferred from loaded items"), el("div", "sx-code", [tp]), true);
    } else if (m === "queue") {
      var qb = el("div", "sx-code"), ac = el("div", "sx-act");
      S.queue.forEach(function (q) { qb.appendChild(el("div", "sx-qrow", [el("b", q.op === "delete" ? "neg" : "pos", [q.op === "delete" ? "DELETE" : "PUT"]), q.item.pk + " / " + q.item.sk + (q.op === "dup" ? "#copy" : "")])); });
      ac.appendChild(btn(t("Aplicar (Cmd+S)", "Apply (Cmd+S)"), "sx-run", function () { var n = S.queue.length; S.queue.forEach(applyOp); S.queue = []; S.modal = null; flash(n + " " + t("cambios aplicados (simulado)", "changes applied (simulated)")); renderTop(); run(); }));
      ac.appendChild(btn(t("Descartar", "Discard"), "ghost", function () { S.queue = []; S.modal = null; renderTop(); renderGrid(); renderStatus(); renderModal(); }));
      qb.appendChild(ac); node = modal(t("Cambios en cola", "Queued changes"), qb);
    } else if (m === "table") {
      var pp = el("div", "sx-props");
      [[t("Nombre", "Name"), TABLE], ["PK / SK", "pk (S) / sk (S)"], ["GSI", "GSI1, por-ciudad"], [t("Facturación", "Billing"), "PAY_PER_REQUEST"], ["TTL", "ttl"], ["PITR", t("desactivado", "disabled")], ["Items", String(items.length)], ["Streams", "NEW_AND_OLD_IMAGES"]].forEach(function (x) { pp.appendChild(el("div", null, [el("small", null, [x[0]]), el("b", null, [x[1]])])); });
      node = modal(t("Propiedades de la tabla", "Table properties") + (isLocked() ? " · " + t("solo lectura", "read-only") : ""), pp);
    } else if (m === "migrate") {
      node = modal(t("Migración", "Migration"), el("div", "sx-code", [el("p", null, [t("Copiar o mover items entre tablas, perfiles o regiones; importar y exportar JSON, NDJSON, CSV; vaciar una tabla.", "Copy or move items between tables, profiles or regions; import and export JSON, NDJSON, CSV; truncate a table.")]), el("p", null, [t("Esto necesita la app real: el simulador solo lo enseña.", "This needs the real app: the simulator only shows it.")])]));
    } else if (m === "diff") {
      var a1 = S.sel, a2 = items.filter(function (x) { return x.entity === a1.entity && x !== a1; })[0] || a1, dd = el("div", "sx-diff"), keys = {};
      Object.keys(a1).concat(Object.keys(a2)).forEach(function (kk) { keys[kk] = 1; });
      Object.keys(keys).forEach(function (kk) { if (JSON.stringify(a1[kk]) !== JSON.stringify(a2[kk])) dd.appendChild(el("div", null, [el("b", null, [kk]), el("span", "neg", [fmt(a1[kk])]), el("span", "pos", [fmt(a2[kk])])])); });
      node = modal(t("Diferencias entre 2 items", "Diff between 2 items"), dd, true);
    } else if (m === "tail") {
      var host = el("div", "sx-tailhost"), list = el("div", "sx-events"), pbtn;
      var label = function () { return tailPaused ? t("Reanudar", "Resume") : t("Pausar", "Pause"); };
      pbtn = btn(label(), "ghost", function () { tailPaused = !tailPaused; pbtn.textContent = label(); });
      var draw = function () { list.textContent = ""; if (!ev.length) list.appendChild(el("div", "sx-empty", [t("Esperando eventos del stream…", "Waiting for stream events…")])); ev.forEach(function (e) { list.appendChild(el("div", "sx-ev " + e.type, [el("b", null, [e.type]), el("code", null, [e.key]), el("em", null, [e.diff])])); }); };
      host.appendChild(el("div", "sx-th", [el("span", "live", ["● LIVE"]), pbtn])); host.appendChild(list); draw();
      tailTimer = setInterval(function () {
        if (tailPaused) return;
        var it = items[Math.floor(rnd() * items.length)], ty = pick(["INSERT", "MODIFY", "MODIFY", "REMOVE"]);
        ev.unshift({ type: ty, key: it.pk + " / " + it.sk, diff: ty === "MODIFY" ? "status: PENDING → PAID" : (ty === "INSERT" ? "NewImage · " : "OldImage · ") + size(it) + " B" });
        ev = ev.slice(0, 40); draw();
      }, 1400);
      node = modal("Live Tail · Streams", host, true);
    } else if (m === "metrics") {
      var mb = el("div", "sx-metrics"), kp = el("div", "sx-kpis"), c1 = el("div", "sx-chart"), c2 = el("div", "sx-chart");
      [["RCU / s", "14.2"], ["WCU / s", "3.1"], ["Throttling", "0"], ["p99", "18 ms"]].forEach(function (x) { kp.appendChild(el("div", null, [el("small", null, [x[0]]), el("b", null, [x[1]])])); });
      var paint = function () { c1.innerHTML = "<h4>RCU</h4>" + spk(spark.rcu, "#2f7bff"); c2.innerHTML = "<h4>WCU</h4>" + spk(spark.wcu, "#ff9a1f"); };
      if (!spark.rcu.length) for (var n = 0; n < 40; n++) { spark.rcu.push(8 + rnd() * 10); spark.wcu.push(2 + rnd() * 4); }
      paint(); mb.appendChild(kp); mb.appendChild(c1); mb.appendChild(c2);
      mTimer = setInterval(function () { spark.rcu.shift(); spark.rcu.push(8 + rnd() * 10); spark.wcu.shift(); spark.wcu.push(2 + rnd() * 4); paint(); }, 1200);
      node = modal(t("Métricas · 1 h", "Metrics · 1 h"), mb, true);
    }
    if (node) R.modalHost.appendChild(node);
  }

  /* ── orquestación ── */
  function run() {
    var ok = runQuery();
    if (ok !== false) { renderGrid(); renderLegend(); renderInsp(); }
    renderStatus(); R.err.textContent = S.err; R.err.style.display = S.err ? "block" : "none"; renderToast();
    if (S.modal) renderModal();
  }
  function renderAll() { renderTop(); renderSide(); renderTabs(); renderQuery(); renderSplit(); run(); }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && S.modal) closeModal(); });
  build(); renderAll();
})();
