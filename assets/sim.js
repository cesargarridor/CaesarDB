/* Simulador en vivo de CaesarDB. Todo ocurre en tu navegador con datos inventados: no hay red, ni cookies, ni almacenamiento.
   Imita una tabla single-table de DynamoDB (Query/Scan, Inspector, Live Tail de Streams y métricas) para enseñar cómo se trabaja con la app. */
(function () {
  var root = document.getElementById("sim");
  if (!root) return;
  var L = document.documentElement.lang === "en" ? "en" : "es";
  var TXT = {
    es: {
      title: "CaesarDB · Orders", tables: "Tablas", env: "Entorno", local: "Local · localhost:8000", aws: "AWS · prod (solo lectura)",
      data: "Datos", tail: "Live Tail", metrics: "Métricas", query: "Query", scan: "Scan", run: "Ejecutar", filter: "Filtro (contiene)",
      pk: "Clave de partición", sk: "begins_with SK", count: "Devueltos", scanned: "Escaneados", rcu: "RCU", lat: "Latencia",
      pick: "Selecciona una fila para ver el Inspector.", size: "Peso del item", del: "Borrar", dup: "Duplicar", clean: "Clean JSON",
      pro: "Función Pro", proMsg: "Escribir en AWS, Live Tail y métricas de CloudWatch son Pro. En localhost todo está desbloqueado.",
      seePlans: "Ver planes", pause: "Pausar", resume: "Reanudar", waiting: "Esperando eventos del stream…", demo: "Datos simulados · nada sale de tu navegador",
      deleted: "Item borrado (simulado)", dupd: "Item duplicado (simulado)", rcuL: "RCU consumidas / s", wcuL: "WCU consumidas / s", thr: "Throttling", p99: "Latencia p99",
      noRows: "Sin resultados. Prueba con USER#u001 y ORDER#.", ro: "Solo lectura", types: "Tipos de objeto"
    },
    en: {
      title: "CaesarDB · Orders", tables: "Tables", env: "Environment", local: "Local · localhost:8000", aws: "AWS · prod (read-only)",
      data: "Data", tail: "Live Tail", metrics: "Metrics", query: "Query", scan: "Scan", run: "Run", filter: "Filter (contains)",
      pk: "Partition key", sk: "begins_with SK", count: "Returned", scanned: "Scanned", rcu: "RCU", lat: "Latency",
      pick: "Select a row to open the Inspector.", size: "Item size", del: "Delete", dup: "Duplicate", clean: "Clean JSON",
      pro: "Pro feature", proMsg: "Writing to AWS, Live Tail and CloudWatch metrics are Pro. On localhost everything is unlocked.",
      seePlans: "See plans", pause: "Pause", resume: "Resume", waiting: "Waiting for stream events…", demo: "Simulated data · nothing leaves your browser",
      deleted: "Item deleted (simulated)", dupd: "Item duplicated (simulated)", rcuL: "RCU consumed / s", wcuL: "WCU consumed / s", thr: "Throttling", p99: "p99 latency",
      noRows: "No results. Try USER#u001 and ORDER#.", ro: "Read-only", types: "Object types"
    }
  }[L];
  var PRICING = L === "en" ? "pricing.html" : "pricing.html";

  /* ── datos ── */
  var seed = 7;
  function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
  function pick(a) { return a[Math.floor(rnd() * a.length)]; }
  var items = [];
  var users = [["u001", "Ana Ruiz", "pro"], ["u002", "Luis Gómez", "free"], ["u003", "Marta Díaz", "pro"], ["u004", "Iker Soto", "free"], ["u005", "Lucía Vega", "team"]];
  var statuses = ["PAID", "SHIPPED", "PENDING"], skus = ["KB-104", "MS-220", "HD-807", "CB-019", "PS-330"];
  var oid = 100;
  users.forEach(function (u) {
    items.push({ PK: "USER#" + u[0], SK: "PROFILE", entityType: "USER", name: u[1], plan: u[2], email: u[0] + "@example.com" });
    var n = 2 + Math.floor(rnd() * 2);
    for (var i = 1; i <= n; i++) {
      var id = "o" + (++oid);
      items.push({ PK: "USER#" + u[0], SK: "ORDER#2026-11-0" + i, entityType: "ORDER", orderId: id, total: Math.round(rnd() * 24000) / 100 + 9, status: pick(statuses), ttl: 1798000000 + oid * 1000 });
      var m = 1 + Math.floor(rnd() * 2);
      for (var k = 1; k <= m; k++) items.push({ PK: "ORDER#" + id, SK: "ITEM#" + k, entityType: "LINE", sku: pick(skus), qty: 1 + Math.floor(rnd() * 4) });
    }
  });

  /* ── estado ── */
  var S = { mode: "query", pk: "USER#u001", sk: "", filter: "", env: "local", tab: "data", rows: [], sel: null, stats: { count: 0, scanned: 0, rcu: 0, lat: 0 }, paused: false, events: [], toast: "" };
  var spark = { rcu: [], wcu: [] };
  for (var i = 0; i < 40; i++) { spark.rcu.push(8 + rnd() * 10); spark.wcu.push(2 + rnd() * 4); }
  var thr = 0;

  function size(it) { return JSON.stringify(it).length; }
  function run() {
    var t0 = performance.now(), src = items, rows;
    if (S.mode === "query") {
      rows = src.filter(function (it) { return it.PK === S.pk.trim() && (!S.sk || it.SK.indexOf(S.sk.trim()) === 0); });
    } else {
      rows = src.slice();
    }
    var scanned = S.mode === "query" ? rows.length : src.length;
    if (S.filter) { var f = S.filter.toLowerCase(); rows = rows.filter(function (it) { return JSON.stringify(it).toLowerCase().indexOf(f) >= 0; }); }
    var bytes = (S.mode === "scan" ? src : rows).reduce(function (a, it) { return a + size(it); }, 0);
    S.rows = rows;
    S.stats = { count: rows.length, scanned: scanned, rcu: Math.max(0.5, Math.ceil(bytes / 4096) * 0.5), lat: Math.round(7 + rnd() * 9 + (S.env === "aws" ? 18 : 0)) };
    S.sel = null;
    void t0;
  }

  /* ── helpers de DOM ── */
  function el(tag, cls, kids) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    (kids || []).forEach(function (k) { if (k == null) return; e.appendChild(typeof k === "string" ? document.createTextNode(k) : k); });
    return e;
  }
  function btn(label, cls, on) { var b = el("button", cls, [label]); b.type = "button"; b.addEventListener("click", on); return b; }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
  function json(it) {
    return esc(JSON.stringify(it, null, 2)).replace(/(&quot;|")([^"\n]+?)(&quot;|")(:)/g, '<span class="j-k">"$2"</span>$4')
      .replace(/: "([^"\n]*)"/g, ': <span class="j-s">"$1"</span>').replace(/: (-?\d+(\.\d+)?)/g, ': <span class="j-n">$1</span>');
  }
  function flash(msg) { S.toast = msg; render(); clearTimeout(flash.t); flash.t = setTimeout(function () { S.toast = ""; render(); }, 2200); }
  function proWall() {
    var w = el("div", "sim-wall", [el("b", null, ["PRO"]), el("h4", null, [TXT.pro]), el("p", null, [TXT.proMsg])]);
    var a = el("a", "btn", [TXT.seePlans]); a.href = PRICING; w.appendChild(a);
    return w;
  }

  /* ── render ── */
  function render() {
    var ae = document.activeElement, keep = ae && ae.dataset && ae.dataset.k, pos = keep && ae.selectionStart;
    root.textContent = "";
    var bar = el("div", "sim-bar", [el("i"), el("i"), el("i"), el("span", null, [TXT.title])]);
    var side = el("aside", "sim-side");
    side.appendChild(el("h4", null, [TXT.tables]));
    ["Orders", "Users", "Events"].forEach(function (n, i) { side.appendChild(el("div", "sim-tbl" + (i === 0 ? " on" : ""), [n])); });
    side.appendChild(el("h4", null, [TXT.env]));
    var eb = el("div", "sim-envs");
    [["local", TXT.local, "env-local"], ["aws", TXT.aws, "env-aws"]].forEach(function (e) {
      eb.appendChild(btn(e[1], "sim-env " + e[2] + (S.env === e[0] ? " on" : ""), function () { S.env = e[0]; if (e[0] === "aws" && S.tab !== "data") S.tab = "data"; run(); render(); }));
    });
    side.appendChild(eb);

    var main = el("div", "sim-main");
    var tabs = el("div", "sim-tabs");
    [["data", TXT.data], ["tail", TXT.tail], ["metrics", TXT.metrics]].forEach(function (t) {
      var b = btn(t[1], "sim-tab" + (S.tab === t[0] ? " on" : ""), function () { S.tab = t[0]; render(); });
      if (t[0] !== "data" && S.env === "aws") b.appendChild(el("u", null, ["PRO"]));
      tabs.appendChild(b);
    });
    main.appendChild(tabs);
    if (S.tab === "data") main.appendChild(dataView());
    else if (S.env === "aws") main.appendChild(proWall());
    else if (S.tab === "tail") main.appendChild(tailView());
    else main.appendChild(metricsView());
    if (S.toast) main.appendChild(el("div", "sim-toast", [S.toast]));

    var body = el("div", "sim-body", [side, main]);
    root.appendChild(bar); root.appendChild(body);
    root.appendChild(el("div", "sim-foot", [TXT.demo]));
    if (keep) { var n = root.querySelector('[data-k="' + keep + '"]'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} } }
  }

  function field(key, ph, val, w) {
    var i = el("input"); i.dataset.k = key; i.placeholder = ph; i.value = val; i.spellcheck = false; i.style.width = w;
    i.addEventListener("input", function () { S[key] = i.value; });
    i.addEventListener("keydown", function (e) { if (e.key === "Enter") { run(); render(); } });
    return i;
  }

  function dataView() {
    var v = el("div", "sim-data");
    var q = el("div", "sim-q");
    var seg = el("div", "sim-seg");
    ["query", "scan"].forEach(function (m) { seg.appendChild(btn(TXT[m], S.mode === m ? "on" : "", function () { S.mode = m; run(); render(); })); });
    q.appendChild(seg);
    if (S.mode === "query") { q.appendChild(field("pk", TXT.pk, S.pk, "9.5rem")); q.appendChild(field("sk", TXT.sk, S.sk, "8rem")); }
    else q.appendChild(field("filter", TXT.filter, S.filter, "14rem"));
    q.appendChild(btn(TXT.run + " ⌘↵", "sim-run", function () { run(); render(); }));
    v.appendChild(q);
    var counts = {}; S.rows.forEach(function (r) { counts[r.entityType] = (counts[r.entityType] || 0) + 1; });
    var lg = el("div", "sim-legend", [el("b", null, [TXT.types])]);
    Object.keys(counts).forEach(function (k) { lg.appendChild(el("span", "lgd " + k, [el("span", null, [k]), el("em", null, [String(counts[k])])])); });
    v.appendChild(lg);
    var cols = ["PK", "SK", "entityType"], extra = [];
    S.rows.forEach(function (r) { Object.keys(r).forEach(function (k) { if (cols.indexOf(k) < 0 && extra.indexOf(k) < 0) extra.push(k); }); });
    cols = cols.concat(extra.slice(0, 4));
    var wrap = el("div", "sim-grid");
    if (!S.rows.length) wrap.appendChild(el("p", "sim-empty", [TXT.noRows]));
    else {
      var t = el("table"), hr = el("tr");
      cols.forEach(function (c, i) { hr.appendChild(el("th", i < 2 ? "key" : "", [c])); });
      t.appendChild(el("thead", null, [hr]));
      var tb = el("tbody");
      S.rows.slice(0, 40).forEach(function (r) {
        var tr = el("tr", "ent-" + r.entityType + (S.sel === r ? " on" : ""));
        cols.forEach(function (c, i) {
          var val = r[c] == null ? "" : String(r[c]);
          tr.appendChild(el("td", i < 2 ? "key" : "", [c === "entityType" ? el("span", "tb tb-" + val, [val]) : val]));
        });
        tr.addEventListener("click", function () { S.sel = r; render(); });
        tb.appendChild(tr);
      });
      t.appendChild(tb); wrap.appendChild(t);
    }
    var insp = el("div", "sim-insp");
    if (!S.sel) insp.appendChild(el("p", "sim-hint", [TXT.pick]));
    else {
      var kb = (size(S.sel) / 1024).toFixed(2);
      insp.appendChild(el("div", "sim-insp-h", [el("b", null, [TXT.clean]), el("span", null, [TXT.size + ": " + kb + " KB / 400 KB"])]));
      var pre = el("pre"); pre.innerHTML = json(S.sel); insp.appendChild(pre);
      var act = el("div", "sim-act");
      act.appendChild(btn(TXT.dup, "ghost", function () { guard(function () { items.push(Object.assign({}, S.sel, { SK: S.sel.SK + "#copy" })); flash(TXT.dupd); run(); render(); }); }));
      act.appendChild(btn(TXT.del, "ghost danger", function () { guard(function () { items.splice(items.indexOf(S.sel), 1); flash(TXT.deleted); run(); render(); }); }));
      insp.appendChild(act);
    }
    var split = el("div", "sim-split", [wrap, insp]);
    v.appendChild(split);
    var st = S.stats;
    v.appendChild(el("div", "sim-stat", [
      el("span", null, [TXT.count + " ", el("b", null, [String(st.count)])]), el("span", null, [TXT.scanned + " ", el("b", null, [String(st.scanned)])]),
      el("span", null, [TXT.rcu + " ", el("b", null, [st.rcu.toFixed(1)])]), el("span", null, [TXT.lat + " ", el("b", null, [st.lat + " ms"])]),
      S.env === "aws" ? el("span", "ro", [TXT.ro]) : null
    ]));
    return v;
  }
  function guard(fn) {
    if (S.env === "aws") { S.tab = "data"; flash("PRO · " + TXT.proMsg.split(".")[0] + "."); return; }
    fn();
  }

  function tailView() {
    var v = el("div", "sim-tail");
    v.appendChild(el("div", "sim-q", [btn(S.paused ? TXT.resume : TXT.pause, "sim-run", function () { S.paused = !S.paused; render(); }), el("span", "live" + (S.paused ? " off" : ""), ["● LIVE"])]));
    var list = el("div", "sim-events");
    if (!S.events.length) list.appendChild(el("p", "sim-hint", [TXT.waiting]));
    S.events.slice(0, 12).forEach(function (e) {
      list.appendChild(el("div", "sim-ev " + e.type, [el("code", null, [e.time]), el("b", null, [e.type]), el("span", null, [e.key]), el("em", null, [e.diff])]));
    });
    v.appendChild(list);
    return v;
  }

  function lineSvg(arr, color) {
    var w = 300, h = 70, max = Math.max.apply(null, arr) * 1.15, pts = arr.map(function (y, i) { return (i * w / (arr.length - 1)).toFixed(1) + "," + (h - y / max * h).toFixed(1); }).join(" ");
    return '<svg viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none"><polyline fill="none" stroke="' + color + '" stroke-width="2" points="' + pts + '"/><polyline fill="' + color + '" fill-opacity=".12" stroke="none" points="0,' + h + " " + pts + " " + w + "," + h + '"/></svg>';
  }
  function metricsView() {
    var v = el("div", "sim-metrics");
    [["rcu", TXT.rcuL, "#5aa2ff"], ["wcu", TXT.wcuL, "#f5a524"]].forEach(function (m) {
      var c = el("div", "sim-chart", [el("h4", null, [m[1], el("b", null, [spark[m[0]][spark[m[0]].length - 1].toFixed(1)])])]);
      var s = el("div", "sim-svg"); s.innerHTML = lineSvg(spark[m[0]], m[2]); c.appendChild(s); v.appendChild(c);
    });
    v.appendChild(el("div", "sim-kpis", [el("div", null, [el("small", null, [TXT.thr]), el("b", null, [String(thr)])]), el("div", null, [el("small", null, [TXT.p99]), el("b", null, [Math.round(18 + rnd() * 12) + " ms"])])]));
    return v;
  }

  /* ── vida: stream y métricas cada ~1,4 s (solo si la sección está en pantalla) ── */
  var visible = true;
  if ("IntersectionObserver" in window) new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }, { threshold: 0.05 }).observe(root);
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  function tick() {
    if (!visible || document.hidden) return;
    spark.rcu.push(Math.max(2, spark.rcu[spark.rcu.length - 1] + (rnd() - 0.5) * 6)); spark.rcu.shift();
    spark.wcu.push(Math.max(1, spark.wcu[spark.wcu.length - 1] + (rnd() - 0.5) * 3)); spark.wcu.shift();
    if (rnd() < 0.08) thr++;
    if (S.paused || S.env !== "local") { if (S.tab === "metrics" && S.env === "local") render(); return; }
    var d = new Date(), time = ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2) + ":" + ("0" + d.getSeconds()).slice(-2);
    var orders = items.filter(function (i) { return i.entityType === "ORDER"; }), r = rnd(), ev;
    if (r < 0.4 || orders.length < 3) {
      var u = pick(users), id = "o" + (++oid), it = { PK: "USER#" + u[0], SK: "ORDER#2026-11-" + (10 + Math.floor(rnd() * 18)), entityType: "ORDER", orderId: id, total: Math.round(rnd() * 24000) / 100 + 9, status: "PENDING", ttl: 1798000000 + oid * 1000 };
      items.push(it); ev = { type: "INSERT", key: it.PK + " / " + it.SK, diff: "+ status: PENDING · total " + it.total };
    } else if (r < 0.85) {
      var o = pick(orders), old = o.status; o.status = old === "PENDING" ? "PAID" : old === "PAID" ? "SHIPPED" : "PAID";
      ev = { type: "MODIFY", key: o.PK + " / " + o.SK, diff: "status: " + old + " → " + o.status };
    } else if (orders.length > 6) {
      var x = pick(orders); items.splice(items.indexOf(x), 1); ev = { type: "REMOVE", key: x.PK + " / " + x.SK, diff: "− " + x.orderId };
    } else return;
    ev.time = time; S.events.unshift(ev); if (S.events.length > 30) S.events.pop();
    if (items.length > 70) items.splice(0, 4);
    if (S.tab === "tail" || S.tab === "metrics") render();
    else if (S.tab === "data") { var keepSel = S.sel; run(); S.sel = keepSel && S.rows.indexOf(keepSel) >= 0 ? keepSel : null; render(); }
  }
  run(); render();
  if (!reduce) setInterval(tick, 1400);
  else { tick(); }
  document.addEventListener("keydown", function (e) { if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && root.contains(document.activeElement)) { run(); render(); } });
})();
