// mule.js: draw a st/0 statement. Every box, text run and line comes from the statement solved by
// mule-sketch; the formulas are in notes/mule-js-math.md and each mapping cites its id (P1, T1, ...).
(function (root) {
  "use strict";

  var FAMILY = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "DejaVu Sans Mono", "Liberation Mono", monospace';
  // Z1: engine paint order page < modal < overlay (text_screen.rs:161-181); depth orders within a layer.
  var LAYER_Z = { page: 0, modal: 1000, overlay: 2000 };
  // B4: the ASCII end-glyph pairs the engine draws (text_screen.rs:104, 109); "(" pairs round.
  var ENDS = { "[": "]", "(": ")" };
  // S-1 / B6: the only style classes; each maps to a glyph class the ASCII draws (H2: hand only on hit).
  var CLS = { line: "mule-line", ends: "mule-ends", under: "mule-under", legend: "mule-legend", hit: "mule-press",
    round: "mule-round" };
  // MOT1: motion classes, decoration only (no box, text or press change), keyed by the statement's activity
  // record: announce = inset ring inside the hit box, apply = pressed look; any other phase = none.
  var MOTION = { announce: "mule-motion-announce", apply: "mule-motion-press" };
  function motion(st, b) {
    var a = st.activity;
    // MOT2: a target without hit cells (e.g. a bot's piece) carries the class on its text runs instead.
    var onRole = b.role === "hit" || (b.role === "part" && !(st.hit || {})[b.id]);
    return a && onRole && a.target === b.id && MOTION[a.phase] ? " " + MOTION[a.phase] : "";
  }

  // P2: advance = cw for a monospace face at size cw / 0.6; line box = ch.
  // P2b: the advance of the real font is measured once at s0 = char_w / 0.6 and the size scaled so that one
  // character = cell_w exactly (no clipped last glyph); without a DOM the s0 estimate is used.
  var FONT = {};
  function font(g, doc) {
    var key = g.char_w + "/" + g.char_h + "/" + g.cols;
    if (FONT[key]) return FONT[key];
    var s0 = g.char_w / 0.6, css = function (sz) { return sz.toFixed(2) + "px/" + g.char_h + "px " + FAMILY; };
    if (!doc || !doc.body || !doc.createElement) return css(s0);
    var probe = doc.createElement("span");
    probe.style.font = css(s0);
    probe.style.whiteSpace = "pre";
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.textContent = new Array(g.cols + 1).join("0");
    doc.body.appendChild(probe);
    var adv = probe.getBoundingClientRect().width / g.cols;
    probe.remove();
    var sz = adv > 0 ? s0 * g.char_w / adv : s0;
    FONT[key] = css(sz);
    return FONT[key];
  }

  // P1: pi(c, r, w, h) = (cw c, ch r, cw w, ch h).
  function pi(g, c, r, w, h, z) {
    return { left: c * g.cell_w, top: r * g.cell_h, width: w * g.cell_w, height: h * g.cell_h, z: z };
  }

  // S1: gutter G = digits(rows - 1) + 1; head H = index of the row-0 line (its prefix is "0" padded to G).
  function frameOf(st) {
    var g = st.grid, A = st.ascii || [];
    var G = String(Math.max(g.rows - 1, 0)).length + 1;
    var row0 = new Array(G - 1).join(" ") + "0 ";
    var H = -1;
    for (var i = 0; i < A.length && H < 0; i++) if (A[i].slice(0, G) === row0) H = i;
    return { g: g, A: A, G: H < 0 ? 0 : G, H: H < 0 ? 0 : H, ok: H >= 0 };
  }

  // S2: the ASCII cell (c, r); lines are trim_end'ed by the engine, so a missing cell is a space.
  function at(F, c, r) { var l = F.A[F.H + r]; return (l && l.charAt(F.G + c)) || " "; }

  // T1 + T2: text runs = engine writes (text_screen.rs:127-136): lines[k] at (first.x, first.y + k lr),
  // then each part text at (p.x, p.y). T3: a run covers min(len, cols - x) cells (engine clips to the grid).
  // T5: a part without its own text that is not the node's line anchor is a glyph part (box, dot, track,
  // fill, rule, ...); its characters are READ from the engine ASCII screen at the part's cells (S2), not
  // recomputed; cells already read for the node are skipped (overlapping parts such as track + fill).
  function glyphRuns(F, n, out) {
    // BAR1: each glyph cell is owned by the LAST glyph part covering it (fill over track); runs split at owner
    // changes and carry the owner part name, so a theme can colour cells by part, never by recomputing.
    var own = {}, parts = n.parts || [];
    parts.forEach(function (p, i) {
      if (p.text != null || (i === 0 && (n.lines || []).length)) return;
      for (var r = p.y; r < p.y + p.h; r++) for (var c = p.x; c < p.x + p.w; c++) own[c + "," + r] = p.p;
    });
    var cells = Object.keys(own).map(function (k) { var v = k.split(","); return { c: Number(v[0]), r: Number(v[1]), k: k }; });
    cells.sort(function (a, b) { return a.r - b.r || a.c - b.c; });
    var seg = null;
    cells.forEach(function (q) {
      var ch = at(F, q.c, q.r), gp = own[q.k];
      if (ch === " ") { seg = null; return; }
      if (seg && q.r === seg.y && q.c === seg.x + seg.t.length && gp === seg.gp) { seg.t += ch; return; }
      seg = { id: n.id, kind: n.kind, part: "glyph", gp: gp, x: q.c, y: q.r, t: ch };
      out.push(seg);
    });
  }

  function runs(st) {
    var g = st.grid, lr = g.line_rows || 1, out = [], F = frameOf(st);
    st.nodes.forEach(function (n) {
      glyphRuns(F, n, out);
      var first = (n.parts || [])[0];
      if (first) (n.lines || []).forEach(function (t, k) {
        out.push({ id: n.id, kind: n.kind, part: first.p, x: first.x, y: first.y + k * lr, t: t });
      });
      (n.parts || []).forEach(function (p) {
        if (p.text != null) out.push({ id: n.id, kind: n.kind, part: p.p, x: p.x, y: p.y, t: p.text });
      });
    });
    out.forEach(function (u) { u.w = Math.max(0, Math.min(Array.from(u.t).length, g.cols - u.x)); });
    return out;
  }

  // T4: the set of cells written by a text run.
  function textCells(rs) {
    var s = {};
    rs.forEach(function (u) { for (var i = 0; i < u.w; i++) s[(u.x + i) + "," + u.y] = 1; });
    return s;
  }

  // B1: Box(n) <=> w, h >= 2 and the four corner cells are "+" and none is a text cell.
  function isBox(F, n, tc) {
    var x2 = n.x + n.w - 1, y2 = n.y + n.h - 1;
    return n.w >= 2 && n.h >= 2 && [[n.x, n.y], [x2, n.y], [n.x, y2], [x2, y2]].every(function (p) {
      return at(F, p[0], p[1]) === "+" && !tc[p[0] + "," + p[1]];
    });
  }

  // B4: Ends(n) = rows r in the rect where cell (x, r) is an open glyph, (x2, r) its close glyph, no text cell.
  // B4b: an end pair belongs to the deepest node: a row whose left or right edge cell lies inside a deeper node
  // is that node's, not n's (a board and its edge squares, a square and its button).
  function endRows(F, n, tc, nodes) {
    var x2 = n.x + n.w - 1, out = [];
    if (n.w < 2) return out;
    var deeper = function (c, r) {
      return (nodes || []).some(function (m) { return (m.depth || 0) > (n.depth || 0) && c >= m.x && c < m.x + m.w && r >= m.y && r < m.y + m.h; });
    };
    for (var r = n.y; r < n.y + n.h; r++) {
      if (deeper(n.x, r) || deeper(x2, r)) continue;
      var o = at(F, n.x, r);
      if (ENDS[o] && at(F, x2, r) === ENDS[o] && !tc[n.x + "," + r] && !tc[x2 + "," + r]) out.push({ r: r, round: o === "(" });
    }
    return out;
  }

  // B5: Under(n) = rows r where every cell of [x, x2] is "_" and no cell is a text cell.
  function underRows(F, n, tc) {
    var out = [];
    for (var r = n.y; r < n.y + n.h; r++) {
      var all = n.w > 0;
      for (var c = n.x; c < n.x + n.w && all; c++) all = at(F, c, r) === "_" && !tc[c + "," + r];
      if (all) out.push(r);
    }
    return out;
  }

  // H1: hit runs [row, col, width] -> rects, joined when runs stack exactly (same col and width).
  function hitRects(list) {
    var out = [];
    (list || []).forEach(function (h) {
      var last = out[out.length - 1];
      if (last && last.x === h[1] && last.w === h[2] && last.y + last.h === h[0]) last.h += 1;
      else out.push({ x: h[1], y: h[0], w: h[2], h: 1 });
    });
    return out;
  }

  // T6: ASCII cells that no text run, box line, end pair or underline accounts for (board fill ".", the selected
  // marker "*") are READ from the ASCII and drawn as glyph runs owned by the deepest node whose rect holds them.
  function orphanRuns(F, st, tc, used) {
    var g = st.grid, out = [], seg = null;
    for (var r = 0; r < g.rows; r++) {
      seg = null;
      for (var c = 0; c < g.cols; c++) {
        var ch = at(F, c, r), k = c + "," + r, own = null;
        if (ch === " " || tc[k] || used[k]) { seg = null; continue; }
        st.nodes.forEach(function (n) {
          if (c >= n.x && c < n.x + n.w && r >= n.y && r < n.y + n.h && (!own || (n.depth || 0) >= (own.depth || 0))) own = n;
        });
        if (!own) { seg = null; continue; }
        if (seg && seg.id === own.id && seg.x + seg.t.length === c) { seg.t += ch; continue; }
        seg = { id: own.id, kind: own.kind, part: "glyph", gp: "cell", x: c, y: r, t: ch };
        out.push(seg);
      }
    }
    out.forEach(function (u) { u.w = Array.from(u.t).length; });
    return out;
  }

  // T7: with Phi in the statement (phi/1, review build), a run keeps only the cells Phi gives its node: a later
  // plane (an open menu over a chart summary) takes the rest, as in the engine screen. No Phi: runs unchanged.
  function phiClip(st, rs) {
    var P = st.phi, idx = {}, out = [];
    if (!P || !P.own) return rs;
    st.nodes.forEach(function (n, i) { idx[n.id] = i; });
    var owner = function (c, r) { var o = null; (P.own[r] || []).forEach(function (q) { if (c >= q[0] && c < q[0] + q[1]) o = q[2]; }); return o; };
    rs.forEach(function (u) {
      var ch = Array.from(u.t), seg = null;
      for (var k = 0; k < u.w; k++) {
        if (owner(u.x + k, u.y) !== idx[u.id]) { seg = null; continue; }
        if (!seg) { seg = { id: u.id, kind: u.kind, part: u.part, gp: u.gp, x: u.x + k, y: u.y, t: "", w: 0 }; out.push(seg); }
        seg.t += ch[k];
        seg.w += 1;
      }
    });
    return out;
  }

  // plan: statement -> boxes in drawing order (pure; tested without a DOM).
  function plan(st) {
    var F = frameOf(st), g = st.grid, hit = st.hit || {}, out = [];
    var rs = runs(st), tc = textCells(rs), boxed = {}, E = {}, used = {};
    st.nodes.forEach(function (n) {
      if (!isBox(F, n, tc)) return;
      boxed[n.id] = n;
      for (var bx = n.x; bx < n.x + n.w; bx++) used[bx + "," + n.y] = used[bx + "," + (n.y + n.h - 1)] = 1;
      for (var by = n.y; by < n.y + n.h; by++) used[n.x + "," + by] = used[(n.x + n.w - 1) + "," + by] = 1;
      for (var c = n.x + 1; c < n.x + n.w - 1; c++) E[c + "," + n.y] = E[c + "," + (n.y + n.h - 1)] = 1;
      for (var r = n.y + 1; r < n.y + n.h - 1; r++) E[n.x + "," + r] = E[(n.x + n.w - 1) + "," + r] = 1;
    });
    // B3: a box over border cells E of a boxed node shows non-border chars there in the ASCII, so it cuts the line.
    var cuts = function (x, y, w) { for (var i = 0; i < w; i++) if (E[(x + i) + "," + y]) return true; return false; };
    st.nodes.forEach(function (n) {
      var z = (LAYER_Z[n.layer] || 0) + (n.depth || 0);
      // N1: one carrier per node at pi(rect); it has no style, text or pointer target.
      out.push({ role: "node", id: n.id, kind: n.kind, box: pi(g, n.x, n.y, n.w, n.h, z), cls: "" });
      var hr = n.press ? hitRects(hit[n.id]) : [];
      var ends = endRows(F, n, tc, st.nodes);
      ends.forEach(function (e) { used[n.x + "," + e.r] = used[(n.x + n.w - 1) + "," + e.r] = 1; });
      hr.forEach(function (r) {
        // H1 + H3: the button is the engine hit rect; it carries the end glyph box when the ASCII draws one there.
        var glyph = ends.some(function (e) { return e.r >= r.y && e.r < r.y + r.h; });
        out.push({ role: "hit", id: n.id, kind: n.kind, marks: n.marks || {}, box: pi(g, r.x, r.y, r.w, r.h, z + 1), cmd: n.cmd || null,
          label: n.text || n.id, cls: (glyph ? CLS.ends + " " : "") + (cuts(r.x, r.y, r.w) ? CLS.legend + " " : "") + CLS.hit });
      });
      if (boxed[n.id]) {
        // B2: the line runs on the centre lines of the edge cells: pi(rect) inset by (cw/2, ch/2), size - 1 cell.
        out.push({ role: "edge", id: n.id, kind: n.kind, cls: CLS.line, box: { left: n.x * g.cell_w + g.cell_w / 2,
          top: n.y * g.cell_h + g.cell_h / 2, width: (n.w - 1) * g.cell_w, height: (n.h - 1) * g.cell_h, z: z } });
      }
      if (!hr.length) ends.forEach(function (e) {
        out.push({ role: "deco", id: n.id, kind: n.kind, box: pi(g, n.x, e.r, n.w, 1, z), cls: CLS.ends + (e.round ? " " + CLS.round : "") });
      });
      underRows(F, n, tc).forEach(function (r) {
        for (var ux = n.x; ux < n.x + n.w; ux++) used[ux + "," + r] = 1;
        out.push({ role: "deco", id: n.id, kind: n.kind, box: pi(g, n.x, r, n.w, 1, z), cls: CLS.under });
      });
    });
    rs = phiClip(st, rs).concat(orphanRuns(F, st, tc, used));
    var zOf = {};
    out.forEach(function (b) { if (b.role === "node") zOf[b.id] = b.box.z; });
    rs.forEach(function (u) {
      var legend = cuts(u.x, u.y, u.w);
      out.push({ role: "part", id: u.id, kind: u.kind, part: u.part, gp: u.gp, box: pi(g, u.x, u.y, u.w, 1, (zOf[u.id] || 0) + 2),
        cls: legend ? CLS.legend : "", text: u.t });
    });
    return out;
  }

  function put(doc, parent, cls, box, text, tag) {
    var el = doc.createElement(tag || "div");
    el.className = cls;
    el.style.left = box.left + "px";
    el.style.top = box.top + "px";
    el.style.width = box.width + "px";
    el.style.height = box.height + "px";
    if (box.z != null) el.style.zIndex = String(box.z);
    if (text != null) {
      el.textContent = text;
      el.setAttribute("data-mule-text", "1");
    }
    parent.appendChild(el);
    return el;
  }

  // S3: head lines and row numbers are the engine screen's own lines, copied as is; the page origin
  // is pi(G, H) so web cell (c, r) and ASCII cell (c, r) share one pixel box.
  function draw(doc, host, st, onPress) {
    var F = frameOf(st), g = st.grid, cw = g.cell_w, ch = g.cell_h, G = F.G, H = F.H;
    var screen = doc.createElement("div");
    screen.className = "mule-screen";
    screen.style.font = font(g, doc);
    screen.style.width = (G + g.cols) * cw + "px";
    screen.style.height = (H + g.rows) * ch + "px";
    var line = "mule-chrome";
    for (var i = 0; i < H; i++) put(doc, screen, "mule-head " + line, pi(g, 0, i, G + g.cols, 1), F.A[i]);
    for (var r = 0; H && r < g.rows; r++) {
      put(doc, screen, "mule-rowno " + line, pi(g, 0, H + r, G, 1), (F.A[H + r] || "").slice(0, G));
    }
    var page = put(doc, screen, "mule-page", pi(g, G, H, g.cols, g.rows));
    page.setAttribute("data-mule-page", st.page);
    plan(st).forEach(function (b) {
      var isPart = b.role === "part", isHit = b.role === "hit";
      var el = put(doc, page, ("mule-" + b.role + " " + b.cls + motion(st, b)).trim(),
        b.box, isPart ? b.text : null, isHit ? "button" : "div");
      el.setAttribute("data-mule-id", b.id);
      el.setAttribute("data-mule-kind", b.kind);
      if (isPart) {
        el.setAttribute("data-mule-part", b.part);
        if (b.gp) el.setAttribute("data-mule-glyph", b.gp);
        el.style.lineHeight = ch + "px";
      }
      // S-2 (E5): only hit buttons take the pointer; carriers, lines and text are inert and hidden from AT
      // except text, which is the readable content.
      if (!isHit) el.style.pointerEvents = "none";
      if (!isHit && !isPart) el.setAttribute("aria-hidden", "true");
      if (isHit) {
        el.setAttribute("type", "button");
        el.setAttribute("aria-label", b.label);
        // A11Y1: roles and states from the statement only (node kind and its val mark), never guessed.
        var on = b.marks.val === "true";
        if (b.kind === "tab") { el.setAttribute("role", "tab"); el.setAttribute("aria-selected", String(on)); }
        if (b.kind === "select") { el.setAttribute("role", "combobox"); el.setAttribute("aria-expanded", "false"); el.setAttribute("aria-haspopup", "listbox"); }
        if (b.kind === "checkbox") { el.setAttribute("role", "checkbox"); el.setAttribute("aria-checked", String(on)); }
        if (b.kind === "radio-opt") { el.setAttribute("role", "radio"); el.setAttribute("aria-checked", String(on)); }
        if (b.kind === "option") { el.setAttribute("role", "option"); el.setAttribute("aria-selected", String(on)); }
        if (onPress) el.addEventListener("click", function () { onPress(b); });
      }
    });
    // TR-PAINT: look-only transform units (icons, tiles) after the plan; no box, hit or text changes.
    if (root.MuleTransform && api.transform) root.MuleTransform.paint(doc, page, st, api.transform);
    // SF-PAINT: read-only surfaces ink only the free cells of Phi (mule.surface.js; loaded by the review page only).
    if (root.MuleSurface && st.phi) root.MuleSurface.paint(doc, page, st);
    host.replaceChildren(screen);
    return page;
  }

  // V1: an AI mode shows one engine text field as is, joined by "\n", in the P2 font.
  // AIV1: the default AI mode is the full AI view (statement.aiv); screen / text / spec stay by URL.
  var MODES = { aiv: "aiv", screen: "ascii", text: "ai_text", spec: "spec" };

  function drawAi(doc, host, st, mode) {
    var field = MODES[mode] || MODES.aiv;
    var el = doc.createElement("pre");
    el.setAttribute("data-mule-view", field);
    el.style.font = font(st.grid, doc);
    el.style.margin = "0";
    el.textContent = (st[field] || []).join("\n");
    host.replaceChildren(el);
  }

  // U1: ?view=web|ai|both and &mode=screen|text|spec.
  function param(cfg, k) { return cfg[k] || (root.location ? new URLSearchParams(root.location.search).get(k) : null); }
  function modeOf(cfg) { var m = param(cfg, "mode"); return MODES[m] ? m : "aiv"; }
  function viewOf(cfg) { var v = param(cfg, "view"); return v === "ai" || v === "both" ? v : "web"; }

  // NAV2: page = ?page when it is a plain name, else the host page's home; NAV3: object <app>/s1/<page>.json.
  var PAGE_RE = /^[a-z0-9-]+$/;
  function pageOf(cfg) { var p = root.location ? new URLSearchParams(root.location.search).get("page") : null; return p && PAGE_RE.test(p) ? p : cfg.home; }
  // NAV1: a pressed cmd "nav.<page>" names the target page; any other cmd has no inbound path yet.
  function navTarget(cmd) { var m = /^nav\.(.+)$/.exec(cmd || ""); return m && PAGE_RE.test(m[1]) ? m[1] : null; }

  // SIG1 (SEC-PULL-1 plan P): a public snapshot is a signed envelope; mule.verify.js checks its ed25519 signature
  // against a pinned key BEFORE the body is parsed. No verifier = nothing is drawn. The same bytes as the last
  // verified read (an ETag 304 revalidation) are SAME: not verified again, not drawn again.
  // LOCAL1: a local review page (cfg.local = a relative folder) reads unsigned <folder><page>.json from its own
  // server only; the public page config has no cfg.local.
  var SAME = { same: true }, SEEN = {};
  function cannot() { var e = new Error("this browser cannot verify Ed25519 signatures"); e.cannot = true; return e; }
  function fetchLatest(cfg, page) {
    var p = page || cfg.home, o = cfg.local ? cfg.local + encodeURIComponent(p) + ".json?t=" + Date.now() :
      cfg.url + "/storage/v1/object/public/mule-statement/" + encodeURIComponent(cfg.app) + "/s1/" + encodeURIComponent(p) + ".json";
    // why: no ?t= and cache "no-cache" on the public path, so the browser revalidates with the ETag (304 when unchanged).
    return fetch(o, { cache: cfg.local ? "no-store" : "no-cache" }).then(function (r) {
      if (r.status === 400 || r.status === 404) return null;
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    }).then(function (text) {
      if (text == null) return null;
      if (cfg.local) return JSON.parse(text);
      if (SEEN[o] === text) return SAME;
      var V = root.MuleVerify;
      if (!V || !V.verifySnap) throw cannot();
      return V.verifySnap(text, cfg.app, p).then(function (b) {
        SEEN[o] = text;
        return { rev: b.rev, updated_at: b.issued_at, issued_at: b.issued_at, next_s: b.next_s, fresh_s: b.fresh_s,
          theme: b.theme, statement: b.statement, signed: true };
      });
    }).then(function (row) {
      // TR-LOAD: a row that names a transform table (theme.transform = its sha256) loads it once before drawing.
      if (!row || row === SAME || !row.theme || !root.MuleTransform) return row;
      return root.MuleTransform.load(row.theme).then(function (T) { api.transform = T; return row; },
        function (e) { api.transform = null; api.transformError = e.message; return row; });
    });
  }

  function utc(ms) { return new Date(ms).toISOString().slice(11, 19) + " UTC"; }

  function start(cfg, doc) {
    var host = doc.getElementById(cfg.mount || "mule");
    var status = doc.getElementById(cfg.status || "mule-status");
    var clockEl = doc.getElementById(cfg.clock || "mule-clock");
    var shown = "", view = viewOf(cfg), mode = modeOf(cfg), page = pageOf(cfg);
    var webEl = doc.createElement("div"), aiEl = doc.createElement("div");
    webEl.id = "mule-web";
    aiEl.id = "mule-ai";
    if (view === "both") {
      host.className = (host.className || "") + " mule-both";
      host.replaceChildren(webEl, aiEl);
    } else {
      host.replaceChildren(view === "ai" ? aiEl : webEl);
    }
    var cache = {}, known = {}, clickT = null, clickTo = null, clickNote = "", sigNote = "", act = { phase: "idle" }, skew = 0;
    api.sig = { ok: 0, refused: 0, old: 0, same: 0 };
    api.draws = 0;
    api.clickMs = [];
    api.cache = cache;
    function say(s) { if (status) status.textContent = s; }
    function onPress(b) {
      var to = navTarget(b.cmd);
      if (!to) { say("pressed " + b.id + " -> " + b.cmd + " (no inbound path: nothing sent)"); return; }
      clickT = root.performance.now();
      clickTo = to;
      go(to);
    }
    function go(to) {
      // NAV4: the page lives in the address, so a reload stays on it; the view and mode params are kept.
      var q = new URLSearchParams(root.location.search);
      q.set("page", to);
      try { root.history.pushState(null, "", "?" + q.toString()); } catch (e) { /* file:// may refuse */ }
      page = to;
      show(to);
    }
    // CACHE2: a page switch draws the cached statement at once, then reads the snapshot in the background.
    function show(to) {
      if (cache[to]) apply(to, cache[to]);
      refresh();
    }
    root.addEventListener && root.addEventListener("popstate", function () { page = pageOf(cfg); show(page); });
    // RT1 + CACHE1: one cache entry per page; an older rev never replaces a newer one; only the current page is drawn.
    function store(p, row) {
      if (!row || !row.statement || (cache[p] && row.rev < cache[p].rev)) return false;
      cache[p] = { rev: row.rev, updated_at: row.updated_at, statement: row.statement, issued_at: row.issued_at,
        next_s: row.next_s, fresh_s: row.fresh_s };
      discover(row.statement);
      return true;
    }
    // CACHE4: the pages to prefetch are the nav targets found in statements (no page list in mule.js).
    function discover(st) {
      (st.nodes || []).forEach(function (n) {
        var to = n.press ? navTarget(n.cmd) : null;
        if (to && !known[to]) { known[to] = 1; prefetch(to); }
      });
    }
    // SIG2: rev only moves forward per page: a verified but not newer snapshot (replay, an old CDN copy) is dropped.
    function take(p, row) {
      if (!row) return false;
      if (row === SAME) { api.sig.same += 1; return false; }
      if (row.signed) {
        api.sig.ok += 1;
        if (cache[p] && row.rev <= cache[p].rev) { api.sig.old += 1; return false; }
        var lag = Date.parse(row.issued_at) - Date.now();
        if (lag > skew) skew = lag;
        sigNote = "";
      }
      apply(p, row);
      return true;
    }
    function failed(e, p) {
      if (e && e.unverified) {
        api.sig.refused += 1;
        sigNote = " | snapshot failed verification: dropped, last verified frame kept";
        if (status && status.textContent.indexOf(sigNote) < 0) status.textContent += sigNote;
      } else if (e && e.cannot) {
        webEl.replaceChildren();
        aiEl.replaceChildren();
        say("cannot verify: this browser has no Ed25519 in WebCrypto, so nothing is shown");
      } else if (p === page) {
        say("read failed: " + (e && e.message));
      }
      if (p !== page) known[p] = 0;
    }
    function prefetch(p) {
      fetchLatest(cfg, p).then(function (row) { take(p, row); }).catch(function (e) { failed(e, p); });
    }
    function apply(want, row) {
      if (!store(want, row) || want !== page) return;
      var e = cache[want], st = e.statement, F = frameOf(st);
      // G0: one projection needs cell = char box; refuse to paint a statement that breaks it.
      if (!F.ok || st.grid.cell_w !== st.grid.char_w || st.grid.cell_h !== st.grid.char_h) {
        say("refused: statement grid breaks G0 (cell != char box) or has no screen rows");
        return;
      }
      if (want + ":" + e.rev !== shown) {
        if (view !== "ai") draw(doc, webEl, st, onPress);
        if (view !== "web") drawAi(doc, aiEl, st, view === "ai" ? mode : "aiv");
        api.draws += 1;
        api.last = st;
        shown = want + ":" + e.rev;
        act = st.activity || act;
        api.act = act;
        if (clickT != null && clickTo === want) {
          var t0 = clickT;
          clickT = null;
          // CLK1: click -> drawn = press time to the next frame after the draw (page chrome only).
          root.requestAnimationFrame(function () {
            var ms = Math.round(root.performance.now() - t0);
            api.clickMs.push(ms);
            clickNote = " | click -> drawn " + ms + " ms";
            if (status) status.textContent = status.textContent.replace(/ \| click -> drawn \d+ ms/g, "") + clickNote;
          });
        }
      }
      say("page " + want + " | rev " + e.rev + " | " + st.summary.nodes + " nodes | updated " + e.updated_at +
        " | view " + view + (view === "ai" ? " mode " + mode : "") + " | " + (cfg.local ? "local polling" : "signed pull, every " + every() / 1000 + " s") +
        " | act: " + act.phase + clickNote + sigNote);
    }
    function refresh() {
      var want = page;
      return fetchLatest(cfg, want).then(function (row) {
        if (!row && want === page) say("no statement yet for " + cfg.app + " page " + want);
        take(want, row);
      }).catch(function (e) { failed(e, want); });
    }
    // POLL1: the interval is the signed next_s of the shown page, clamped to [30, 900] s (cfg.poll_ms wins, local
    // review and tests); +-10 % jitter; a hidden tab reads nothing and reads once when it comes back.
    function every() {
      if (cfg.poll_ms) return cfg.poll_ms;
      var n = (cache[page] && cache[page].next_s) || 60;
      return Math.min(900, Math.max(30, n)) * 1000;
    }
    function tick() {
      if (doc.visibilityState !== "hidden" && (page === cfg.home || known[page])) refresh();
      root.setTimeout(tick, every() * (cfg.poll_ms ? 1 : 0.9 + 0.2 * Math.random()));
    }
    // CLOCK1: the page clock is the viewer clock moved forward when a signed issued_at shows it runs behind; stale
    // when the shown snapshot is older than fresh_s + next_s + 120 s (the loop re-signs a quiet page each fresh_s).
    function clock() {
      var e = cache[page], now = Date.now() + skew;
      if (!clockEl) return;
      var text = "page clock " + utc(now);
      if (e && e.issued_at) {
        var t = Date.parse(e.issued_at), late = now - t > ((e.fresh_s || 3600) + (e.next_s || 60) + 120) * 1000;
        text += " | statement signed " + utc(t) + (late ? " | stale: no newer signed snapshot" : "");
      }
      clockEl.textContent = text;
    }
    // NAV5: a page that is not the home page and is not named by any nav target is unknown: say so in the
    // status line with a link home, and request nothing for it.
    if (page !== cfg.home) {
      fetchLatest(cfg, cfg.home).then(function (row) {
        if (row && row !== SAME) take(cfg.home, row);
        if (known[page]) { show(page); return; }
        if (status) {
          status.textContent = "unknown page " + page + " | ";
          var a = doc.createElement("a");
          a.href = "?page=" + encodeURIComponent(cfg.home);
          a.textContent = "open " + cfg.home;
          status.appendChild(a);
        }
      }).catch(function (e) { failed(e, cfg.home); });
    } else {
      refresh();
    }
    root.setTimeout(tick, every());
    if (clockEl && !cfg.local) { clock(); root.setInterval(clock, 1000); }
    doc.addEventListener("visibilitychange", function () { if (doc.visibilityState !== "hidden") refresh(); });
  }

  var api = { plan: plan, runs: runs, frameOf: frameOf, navTarget: navTarget, pageOf: pageOf, draw: draw, drawAi: drawAi, viewOf: viewOf, modeOf: modeOf,
    fetchLatest: fetchLatest, start: start };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.Mule = api;
})(typeof window !== "undefined" ? window : globalThis);
