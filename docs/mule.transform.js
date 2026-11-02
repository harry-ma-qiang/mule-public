// mule.transform.js: the transform T of notes/sketch-transform.md for the local review page (TR1-TR6 in
// notes/mule-js-math.md section 4s). T is a data table (theme file mule.transform.json, pinned by sha256 in the
// row); keys come from the statement only (unit, node kind, parent kind, glyph block); the painter changes look
// only: no box, hit or press set changes, glyphs stay in the DOM (hidden), no clock, random or network.
(function (root) {
  "use strict";

  // TR-KEY: a unit key; the same string in mule.transform.js and scripts/geq.js (m).
  function keyOf(unit, kind, inKind, block) { return unit + "\u0001" + kind + "\u0001" + inKind + "\u0001" + block; }

  // TR-1 FUNCTION + TR-2 INJECTIVE: one row per key, one key per token, one token per asset; else refused.
  function check(table) {
    var byKey = {}, byTok = {}, byAsset = {}, bad = [];
    ((table && table.rows) || []).forEach(function (r) {
      var k = keyOf(r.unit, r.kind, r.in, r.block);
      if (byKey[k]) bad.push("TR-1 duplicate key " + JSON.stringify(r.block));
      if (byTok[r.token]) bad.push("TR-2 token " + r.token + " for two keys");
      if (r.asset && byAsset[r.asset]) bad.push("TR-2 asset " + r.asset + " for two tokens");
      if (!/^(icon|class):/.test(r.token || "") || (/^icon:/.test(r.token) !== !!r.asset)) bad.push("token kind " + r.token);
      byKey[k] = r;
      byTok[r.token] = r;
      if (r.asset) byAsset[r.asset] = r;
    });
    return { ok: !bad.length && !!table && table.v === "transform/1", bad: bad, byKey: byKey, byTok: byTok, byAsset: byAsset };
  }

  // TR-LOAD: read the table named by the row (theme.transform_path), refuse it unless its bytes hash to
  // theme.transform and TR-1 / TR-2 hold. One load per hash.
  var LOADED = {};
  function load(theme) {
    if (!theme || !theme.transform_path || !theme.transform) return Promise.resolve(null);
    if (LOADED[theme.transform]) return LOADED[theme.transform];
    LOADED[theme.transform] = fetch(theme.transform_path, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.arrayBuffer();
    }).then(function (buf) {
      return root.crypto.subtle.digest("SHA-256", buf).then(function (d) {
        var hex = "sha256:" + Array.from(new Uint8Array(d)).map(function (x) { return x.toString(0x10).padStart(2, "0"); }).join("");
        if (hex !== theme.transform) throw new Error("transform hash " + hex + " != " + theme.transform);
        var table = JSON.parse(new TextDecoder().decode(buf)), c = check(table);
        if (!c.ok) throw new Error("transform refused: " + c.bad.join("; "));
        return { table: table, sha256: hex, idx: c };
      });
    });
    return LOADED[theme.transform];
  }

  // TR-UNITS: the units of a statement and their keys, read from Phi only (node kind, parent kind, label
  // glyphs, the ASCII cells of a square's top row and the open end glyph of its button row).
  function units(st) {
    var A = st.ascii || [], g = st.grid, G = String(Math.max(g.rows - 1, 0)).length + 1, H = -1, out = [];
    for (var i = 0; i < A.length && H < 0; i++) if (A[i].slice(0, G) === new Array(G - 1).join(" ") + "0 ") H = i;
    var at = function (c, r) { var l = A[H + r] || ""; return l.charAt(G + c) || " "; };
    var byId = {};
    st.nodes.forEach(function (n) { byId[n.id] = n; });
    st.nodes.forEach(function (n) {
      var par = n.parent ? byId[n.parent] : null;
      if (!par || H < 0) return;
      if (n.kind === "button" && (n.text || "") !== "") {
        out.push({ unit: "label", id: n.id, box: par, key: keyOf("label", n.kind, par.kind, n.text), block: n.text });
      }
      if (n.kind === "square") {
        var top = "";
        for (var c = n.x; c < n.x + n.w; c++) top += at(c, n.y);
        var block = top.replace(/ +$/, "") + "|" + at(n.x, n.y + 1);
        out.push({ unit: "tile", id: n.id, box: n, key: keyOf("tile", n.kind, par.kind, block), block: block });
      }
    });
    return out;
  }

  // TR-PAINT: icon units get an <img> centred in the owning square's box (40 x 40 px inside 56 x 48), class units
  // a tile at the square's box under its content; the unit's text runs carry data-mule-t (hidden by the theme).
  var ICON_PX = 40;
  function paint(doc, page, st, T) {
    if (!T) return 0;
    var g = st.grid, n = 0;
    units(st).forEach(function (u) {
      var r = T.idx.byKey[u.key];
      if (!r) return;
      var b = u.box, left = b.x * g.cell_w, top = b.y * g.cell_h, w = b.w * g.cell_w, h = b.h * g.cell_h, el;
      var z = (b.layer === "modal" ? 1000 : b.layer === "overlay" ? 2000 : 0) + (b.depth || 0);
      if (r.asset) {
        el = doc.createElement("img");
        el.className = "mule-icon";
        el.src = r.asset;
        el.alt = "";
        el.style.left = (left + (w - ICON_PX) / 2) + "px";
        el.style.top = (top + (h - ICON_PX) / 2) + "px";
        el.style.width = el.style.height = ICON_PX + "px";
        el.style.zIndex = String(z + 3);
      } else {
        el = doc.createElement("div");
        el.className = "mule-tile " + r.token.slice("class:".length);
        el.style.left = left + "px";
        el.style.top = top + "px";
        el.style.width = w + "px";
        el.style.height = h + "px";
        el.style.zIndex = String(z);
      }
      el.style.position = "absolute";
      el.style.pointerEvents = "none";
      el.setAttribute("aria-hidden", "true");
      el.setAttribute("data-mule-id", u.id);
      el.setAttribute("data-mule-t", r.token);
      page.appendChild(el);
      Array.prototype.forEach.call(page.querySelectorAll('.mule-part[data-mule-id="' + CSS.escape(u.id) + '"]'), function (p) {
        if (r.asset ? p.getAttribute("data-mule-part") === "label" : p.getAttribute("data-mule-glyph") === "cell") p.setAttribute("data-mule-t", r.token);
      });
      n += 1;
    });
    return n;
  }

  var api = { keyOf: keyOf, check: check, load: load, units: units, paint: paint };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MuleTransform = api;
})(typeof window !== "undefined" ? window : globalThis);
