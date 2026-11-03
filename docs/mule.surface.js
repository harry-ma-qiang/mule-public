// mule.surface.js: the layer-2 painter of a read-only surface (FLEX-EQ-1, local review; notes/sketch-flex-zones.md
// FX-1 / FX-3 / FX-6, mule-js-math.md section 4u). Inputs: the statement only (the surface node's rect, its
// declared extra.data, and the Phi cell map phi/1). Ink goes only on the free cells Phi still gives the surface
// (flex bit, fill role, owner = the surface): a menu over the chart takes its cells back by construction. No
// clock, random, storage or network; the element is clipped to the interior, inert and hidden from AT.
(function (root) {
  "use strict";

  var INK = { panel: "rgba(79, 70, 229, 0.07)", area: "rgba(79, 70, 229, 0.18)", line: "#4f46e5", dot: "#312e81", grid: "rgba(100, 116, 139, 0.25)" };

  // SF-MASK: the free cells of surface node index i (mode "phi"); mode "rect" is the twin that takes the whole
  // interior (it ignores Phi and must fail G-EQ T where a menu covers the chart).
  function freeCells(st, i, mode) {
    var n = st.nodes[i], P = st.phi, out = [];
    for (var r = n.y + 1; r < n.y + n.h - 1; r++) for (var c = n.x + 1; c < n.x + n.w - 1; c++) {
      if (mode === "rect") { out.push([c, r]); continue; }
      var own = ((P.own || [])[r] || []).some(function (q) { return q[2] === i && c >= q[0] && c < q[0] + q[1]; });
      if (own && (P.flex || [])[r] && P.flex[r].charAt(c) === "x" && P.role[r].charAt(c) === "f") out.push([c, r]);
    }
    return out;
  }

  // SF-SERIES: y = the last column whose every value is a number, in data order; nothing else is read.
  function series(data) {
    var rows = Array.isArray(data) ? data : [], keys = rows.length ? Object.keys(rows[0]) : [], y = null;
    keys.forEach(function (k) { if (rows.every(function (r) { return r[k] !== "" && isFinite(Number(r[k])); })) y = k; });
    return y ? rows.map(function (r) { return Number(r[y]); }) : [];
  }

  function chart(ctx, w, h, v) {
    var pad = 6, lo = Math.min.apply(null, v), hi = Math.max.apply(null, v), span = hi - lo || 1;
    var X = function (k) { return pad + (w - 2 * pad) * (v.length > 1 ? k / (v.length - 1) : 0.5); };
    var Y = function (x) { return h - pad - (h - 2 * pad) * (x - lo) / span; };
    ctx.strokeStyle = INK.grid;
    ctx.lineWidth = 1;
    for (var g = 1; g < 4; g++) { ctx.beginPath(); ctx.moveTo(0, Math.round(h * g / 4) + 0.5); ctx.lineTo(w, Math.round(h * g / 4) + 0.5); ctx.stroke(); }
    ctx.beginPath();
    v.forEach(function (x, k) { if (k) ctx.lineTo(X(k), Y(x)); else ctx.moveTo(X(k), Y(x)); });
    ctx.lineTo(X(v.length - 1), h);
    ctx.lineTo(X(0), h);
    ctx.closePath();
    ctx.fillStyle = INK.area;
    ctx.fill();
    ctx.beginPath();
    v.forEach(function (x, k) { if (k) ctx.lineTo(X(k), Y(x)); else ctx.moveTo(X(k), Y(x)); });
    ctx.strokeStyle = INK.line;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = INK.dot;
    v.forEach(function (x, k) { ctx.beginPath(); ctx.arc(X(k), Y(x), 2.5, 0, 2 * Math.PI); ctx.fill(); });
  }

  // SF-PAINT: one clipped box at pi(interior) per surface, z = node z + 1 (under its own text runs at z + 2 and
  // under every later plane); a canvas of the interior size; the clip path is the union of the free cells.
  function paint(doc, page, st, opt) {
    if (!st.phi) return 0;
    var g = st.grid, cw = g.cell_w, ch = g.cell_h, n0 = 0, mode = (opt && opt.mask) || "phi";
    st.nodes.forEach(function (n, i) {
      if (n.kind !== "surface" || n.w < 3 || n.h < 3) return;
      var x = n.extra || {}, w = (n.w - 2) * cw, h = (n.h - 2) * ch;
      var z = (n.layer === "modal" ? 1000 : n.layer === "overlay" ? 2000 : 0) + (n.depth || 0) + 1;
      var box = doc.createElement("div");
      box.className = "mule-surface";
      box.style.cssText = "position:absolute;overflow:hidden;contain:paint;pointer-events:none;left:" + (n.x + 1) * cw +
        "px;top:" + (n.y + 1) * ch + "px;width:" + w + "px;height:" + h + "px;z-index:" + z;
      box.setAttribute("aria-hidden", "true");
      box.setAttribute("data-mule-id", n.id);
      box.setAttribute("data-mule-t", "free");
      var cv = doc.createElement("canvas");
      cv.width = w;
      cv.height = h;
      cv.style.cssText = "position:absolute;left:0;top:0;width:" + w + "px;height:" + h + "px;pointer-events:none";
      cv.setAttribute("data-mule-id", n.id);
      cv.setAttribute("aria-hidden", "true");
      box.appendChild(cv);
      page.appendChild(box);
      var ctx = cv.getContext && cv.getContext("2d");
      if (!ctx) return;
      ctx.save();
      ctx.beginPath();
      freeCells(st, i, mode).forEach(function (q) { ctx.rect((q[0] - n.x - 1) * cw, (q[1] - n.y - 1) * ch, cw, ch); });
      ctx.clip();
      ctx.fillStyle = INK.panel;
      ctx.fillRect(0, 0, w, h);
      // why: extra.flex is the surface type; only a chart draws its series, other types show the panel only.
      var v = x.flex === "chart" ? series(x.data) : [];
      if (v.length) chart(ctx, w, h, v);
      ctx.restore();
      n0 += 1;
    });
    return n0;
  }

  var api = { paint: paint, freeCells: freeCells, series: series };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MuleSurface = api;
})(typeof window !== "undefined" ? window : globalThis);
