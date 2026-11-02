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
    rs = rs.concat(orphanRuns(F, st, tc, used));
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
        if (onPress) el.addEventListener("click", function () { onPress(b); });
      }
    });
    // TR-PAINT: look-only transform units (icons, tiles) after the plan; no box, hit or text changes.
    if (root.MuleTransform && api.transform) root.MuleTransform.paint(doc, page, st, api.transform);
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

  // DIFF4: ops edit strings and marks of a copy of the base; the last element [s, e, r] replaces chars s..e with r.
  function edit(t, o) { var sp = o[o.length - 1]; return (t || "").slice(0, sp[0]) + sp[2] + (t || "").slice(sp[1]); }
  var OPS = {
    n: function (st, o) { var n = st.nodes[o[1]]; n.text = edit(n.text, o); },
    nl: function (st, o) { var n = st.nodes[o[1]]; n.lines[o[2]] = edit(n.lines[o[2]], o); },
    np: function (st, o) { var q = st.nodes[o[1]].parts[o[2]]; q.text = edit(q.text, o); },
    nm: function (st, o) { st.nodes[o[1]].marks = o[2]; },
    a: function (st, o) { st.ascii[o[1]] = edit(st.ascii[o[1]], o); },
    t: function (st, o) { st.ai_text[o[1]] = edit(st.ai_text[o[1]], o); },
    v: function (st, o) { st.aiv[o[1]] = edit(st.aiv[o[1]], o); },
    act: function (st, o) { st.activity = o[1]; },
    p: function (st, o) { st.spec[o[1]] = edit(st.spec[o[1]], o); },
    sh: function (st, o) { st.spec_hash = o[1]; }
  };
  // DIFF5: canonical JSON (sorted keys, no spaces) and sha256, the same bytes the engine hashes.
  function canon(v) {
    if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
    if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ":" + canon(v[k]); }).join(",") + "}";
    return JSON.stringify(v);
  }
  function sha(text) {
    return root.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (buf) {
      return "sha256:" + Array.from(new Uint8Array(buf)).map(function (x) { return x.toString(0x10).padStart(2, "0"); }).join("");
    });
  }
  function patchOf(baseSt, p) {
    var st = JSON.parse(JSON.stringify(baseSt));
    try {
      if (!(root.crypto && root.crypto.subtle)) throw new Error("no subtle crypto");
      p.ops.forEach(function (o) { if (!OPS[o[0]]) throw new Error("op " + o[0]); OPS[o[0]](st, o); });
    } catch (e) { return Promise.reject(e); }
    return Promise.all([sha(canon(st.nodes)), sha(st.ascii.join("\n")), sha(st.ai_text.join("\n")),
      sha((st.aiv || []).join("\n"))]).then(function (d) {
      var want = [p.d.n, p.d.a, p.d.t, p.d.v || ""];
      var pre = "sha256:".length;
      if (d.some(function (x, i) { return want[i] && x.slice(pre, pre + want[i].length) !== want[i]; })) throw new Error("digest mismatch");
      st.summary.digest = d[0];
      st.ascii_digest = d[1];
      st.ai_text_digest = d[2];
      if (st.aiv) st.aiv_digest = d[d.length - 1];
      return st;
    });
  }

  // NAV2: page = ?page when it is a plain name, else the host page's home; NAV3: object <app>/<page>.json.
  var PAGE_RE = /^[a-z0-9-]+$/;
  function pageOf(cfg) { var p = root.location ? new URLSearchParams(root.location.search).get("page") : null; return p && PAGE_RE.test(p) ? p : cfg.home; }
  // NAV1: a pressed cmd "nav.<page>" names the target page; any other cmd has no inbound path yet.
  function navTarget(cmd) { var m = /^nav\.(.+)$/.exec(cmd || ""); return m && PAGE_RE.test(m[1]) ? m[1] : null; }

  // LOCAL1: a local review page (cfg.local = a relative folder, no url, no key) reads <folder><page>.json from
  // its own server only; subscribe() needs a key, so it never opens a channel.
  function fetchLatest(cfg, page) {
    var o = (cfg.local ? cfg.local : cfg.url + "/storage/v1/object/public/mule-statement/" + encodeURIComponent(cfg.app) + "/") +
      encodeURIComponent(page || cfg.home) + ".json?t=" + Date.now();
    return fetch(o, { cache: "no-store" }).then(function (r) {
      if (r.status === 400 || r.status === 404) return null;
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (row) {
      // TR-LOAD: a row that names a transform table (theme.transform = its sha256) loads it once before drawing.
      if (!row || !row.theme || !root.MuleTransform) return row;
      return root.MuleTransform.load(row.theme).then(function (T) { api.transform = T; return row; },
        function (e) { api.transform = null; api.transformError = e.message; return row; });
    });
  }

  function start(cfg, doc) {
    var host = doc.getElementById(cfg.mount || "mule");
    var status = doc.getElementById(cfg.status || "mule-status");
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
    function say(s) { if (status) status.textContent = s; }
    function onPress(b) {
      var to = navTarget(b.cmd);
      if (!to) { say("pressed " + b.id + " -> " + b.cmd + " (no inbound path: nothing sent)"); return; }
      clickT = root.performance.now();
      clickTo = to;
      go(to);
    }
    // ACT5: the statement's activity record is the op pipeline state; at receipt with a target page every
    // viewer moves once per (at, target) through the same NAV4 path.
    var act = { phase: "idle", pace: true }, followed = {};
    function actSeen(a) {
      if (!a || typeof a.phase !== "string") return;
      act = a;
      api.act = a;
      // why: a bot's move (bot-vs-bot background game) highlights its page but never moves a viewer.
      if (a.actor === "bot") return;
      // ACT5: viewers go to the acting page at announce (to see the highlight) and to the target at receipt,
      // once per (at, target, phase); the record may arrive in any page's statement.
      var to = a.phase === "announce" ? a.page : a.phase === "receipt" ? a.to : null, key = a.at + " " + a.target + " " + a.phase;
      if (to && !followed[key] && PAGE_RE.test(to)) {
        followed[key] = 1;
        if (to !== page) go(to);
      }
    }
    function go(to) {
      // NAV4: the page lives in the address, so a reload stays on it; the view and mode params are kept.
      var q = new URLSearchParams(root.location.search);
      q.set("page", to);
      try { root.history.pushState(null, "", "?" + q.toString()); } catch (e) { /* file:// may refuse */ }
      page = to;
      show(to);
    }
    // CACHE2: a page switch draws the cached statement at once, then reads the snapshot in the background;
    // the snapshot redraws only when its rev is newer (RT1).
    function show(to) {
      if (cache[to]) apply(to, cache[to]);
      refresh();
    }
    root.addEventListener && root.addEventListener("popstate", function () { page = pageOf(cfg); show(page); });
    // RT1 + CACHE1: one cache entry per page object {rev, updated_at, statement} and one base (last full row,
    // DIFF3); rows of any page update its entry; an older rev never replaces a newer one; only the current
    // page is drawn.
    var live = false, client = null, ch = null, cache = {}, base = {}, known = {}, clickT = null, clickTo = null, clickNote = "";
    api.patches = { applied: 0, refused: 0 };
    api.clickMs = [];
    api.cache = cache;
    function store(p, row, live) {
      if (!row || !row.statement || (cache[p] && row.rev < cache[p].rev)) return false;
      cache[p] = { rev: row.rev, updated_at: row.updated_at, statement: row.statement, patched: !!row.patched };
      // why: only a live broadcast row may move the viewer; a snapshot or prefetch can carry an old record.
      if (live && p !== page) actSeen(row.statement.activity);
      if (!row.patched) base[p] = { rev: row.rev, st: row.statement };
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
    function prefetch(p) {
      fetchLatest(cfg, p).then(function (row) { if (row) apply(p, row); }).catch(function () { known[p] = 0; });
    }
    function apply(want, row, live) {
      if (!store(want, row, live) || want !== page) return;
      var e = cache[want], st = e.statement, F = frameOf(st);
      // G0: one projection needs cell = char box; refuse to paint a statement that breaks it.
      if (!F.ok || st.grid.cell_w !== st.grid.char_w || st.grid.cell_h !== st.grid.char_h) {
        say("refused: statement grid breaks G0 (cell != char box) or has no screen rows");
        return;
      }
      if (want + ":" + e.rev !== shown) {
        if (view !== "ai") draw(doc, webEl, st, onPress);
        if (view !== "web") drawAi(doc, aiEl, st, view === "ai" ? mode : "aiv");
        api.last = st;
        shown = want + ":" + e.rev;
        if (live) actSeen(st.activity); else { act = st.activity || act; api.act = act; }
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
        " | view " + view + (view === "ai" ? " mode " + mode : "") + " | " + (live ? "realtime" : "polling") +
        " | act: " + act.phase + " | pace: " + (act.pace === false ? "off" : "on") + clickNote);
    }
    // RT1 entry for every broadcast row of any page: a full row is stored as is, a patch goes through DIFF3-DIFF5.
    function receive(row) {
      if (!row || !PAGE_RE.test(row.page || "") || doc.visibilityState === "hidden") return;
      var p = row.page;
      if (row.statement) { apply(p, row, true); return; }
      var b = base[p];
      if (row.t !== "p" || !b || b.rev !== row.base_rev || (cache[p] && row.rev <= cache[p].rev)) return;
      patchOf(b.st, row).then(function (st) {
        api.patches.applied += 1;
        apply(p, { rev: row.rev, updated_at: "patch on " + row.base_rev, statement: st, patched: true }, true);
      }, function () {
        // DIFF5: a patch that does not reproduce its digests is dropped; that page's snapshot is read instead.
        api.patches.refused += 1;
        if (p === page) refresh(); else prefetch(p);
      });
    }
    api.receive = receive;
    function refresh() {
      var want = page;
      return fetchLatest(cfg, want).then(function (row) {
        if (!row) { if (want === page) say("no statement yet for " + cfg.app + " page " + want); return; }
        apply(want, row);
      }).catch(function (e) { say("read failed: " + e.message); });
    }
    // RT2: subscribe to the public broadcast topic <app>, event "statement", with the publishable key;
    // RT3: any status other than SUBSCRIBED (error, timeout, closed) or a missing client = polling.
    function subscribe() {
      if (ch || !cfg.key || !(root.supabase && root.supabase.createClient)) return;
      try {
        client = client || root.supabase.createClient(cfg.url, cfg.key);
        ch = client.channel(cfg.topic || cfg.app);
        ch.on("broadcast", { event: "statement" }, function (msg) { receive(msg && msg.payload); }).subscribe(function (s) {
          live = s === "SUBSCRIBED";
          api.live = live;
          api.rtStatus = s;
          if (!live && ch && s !== "SUBSCRIBED") refresh();
        });
      } catch (e) { live = false; ch = null; }
    }
    // RT4: a hidden tab leaves the channel and stops polling; back in front it reads the snapshot and rejoins.
    function unsubscribe() {
      if (ch && client) { try { client.removeChannel(ch); } catch (e) { /* closed already */ } }
      ch = null;
      live = false;
      api.live = false;
    }
    // NAV5: a page that is not the home page and is not named by any nav target is unknown: say so in the
    // status line with a link home, and request nothing for it.
    if (page !== cfg.home) {
      fetchLatest(cfg, cfg.home).then(function (row) {
        if (row) apply(cfg.home, row);
        if (known[page]) { show(page); return; }
        if (status) {
          status.textContent = "unknown page " + page + " | ";
          var a = doc.createElement("a");
          a.href = "?page=" + encodeURIComponent(cfg.home);
          a.textContent = "open " + cfg.home;
          status.appendChild(a);
        }
      }).catch(function (e) { say("read failed: " + e.message); });
    } else {
      refresh();
    }
    subscribe();
    // why: polling runs only while the realtime path is down, and never in a hidden tab (free Storage egress).
    setInterval(function () { if (doc.visibilityState !== "hidden" && !live && (page === cfg.home || known[page])) refresh(); }, cfg.poll_ms || 10000);
    doc.addEventListener("visibilitychange", function () {
      if (doc.visibilityState === "hidden") { unsubscribe(); return; }
      refresh();
      subscribe();
    });
  }

  var api = { plan: plan, runs: runs, frameOf: frameOf, navTarget: navTarget, pageOf: pageOf, draw: draw, drawAi: drawAi, viewOf: viewOf, modeOf: modeOf,
    fetchLatest: fetchLatest, start: start };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.Mule = api;
})(typeof window !== "undefined" ? window : globalThis);
