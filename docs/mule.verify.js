// mule.verify.js: SIG1 (SEC-PULL-1 plan P) checks a signed snapshot envelope before its body is parsed.
// Envelope {v: 1, kid, sig, body}: sig = ed25519(key[kid], "mule-snap/1\n" + body as UTF-8). The body string is
// JSON.parse'd only after the signature checks; then app and page must be the ones asked for.
(function (root) {
  "use strict";

  var DOMAIN = "mule-snap/1\n";
  // why: the pinned public keys are the root of trust; a new kid ships here one release before the signer uses it.
  var PUBKEYS = Object.freeze({ cfdbaf5b: "M9kBZEkrD50uJgdjRFhEMt6KTNl+Nd7k1KEpKeNMBjQ=" });

  function bytes(b64) {
    var bin = root.atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function refuse(why) { var e = new Error("unverified snapshot: " + why); e.unverified = true; return e; }
  function cannot() { var e = new Error("this browser cannot verify Ed25519 signatures"); e.cannot = true; return e; }

  function make(keys) {
    var imported = {};
    function keyOf(kid) {
      if (!Object.prototype.hasOwnProperty.call(keys, kid)) return Promise.reject(refuse("unknown key"));
      if (!imported[kid]) {
        imported[kid] = root.crypto.subtle.importKey("raw", bytes(keys[kid]), { name: "Ed25519" }, false, ["verify"])
          .catch(function () { throw cannot(); });
      }
      return imported[kid];
    }
    // verifySnap(text, app, page) -> Promise of the verified body; rejects with e.unverified or e.cannot.
    function verifySnap(text, app, page) {
      if (!(root.crypto && root.crypto.subtle && root.TextEncoder && root.atob)) return Promise.reject(cannot());
      var env, sig;
      try {
        env = JSON.parse(text);
        sig = bytes(env.sig);
      } catch (e) { return Promise.reject(refuse("envelope")); }
      if (!env || env.v !== 1 || typeof env.kid !== "string" || typeof env.body !== "string" || sig.length !== 64) {
        return Promise.reject(refuse("envelope"));
      }
      return keyOf(env.kid).then(function (k) {
        return root.crypto.subtle.verify({ name: "Ed25519" }, k, sig, new root.TextEncoder().encode(DOMAIN + env.body));
      }).then(function (ok) {
        if (!ok) throw refuse("signature");
        var body = JSON.parse(env.body);
        if (!body || body.app !== app || body.page !== page) throw refuse("app or page");
        if (!Number.isSafeInteger(body.rev) || body.rev < 1 || !body.statement || typeof body.issued_at !== "string") {
          throw refuse("fields");
        }
        return body;
      });
    }
    return { verifySnap: verifySnap };
  }

  var api = make(PUBKEYS);
  api.make = make;
  api.PUBKEYS = PUBKEYS;
  api.DOMAIN = DOMAIN;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MuleVerify = api;
})(typeof window !== "undefined" ? window : globalThis);
