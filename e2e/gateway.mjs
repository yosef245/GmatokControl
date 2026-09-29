// Local stand-in for the Supabase gateway (e2e only): /rest/v1 → PostgREST, /auth/v1 → a tiny password auth backed by auth.users.
import http from "node:http";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
const SECRET = "local-e2e-secret-local-e2e-secret-0123";
const DB = process.env.E2E_DB;
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
function jwt(claims) {
  const h = b64({ alg: "HS256", typ: "JWT" }), p = b64(claims);
  return `${h}.${p}.${crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`;
}
function verify(t) {
  const [h, p, s] = (t || "").split(".");
  if (!s || crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url") !== s) return null;
  return JSON.parse(Buffer.from(p, "base64url").toString());
}
const q = (sql) => { try { return execFileSync("psql", [DB, "-At", "-c", sql]).toString().trim(); } catch { return ""; } };
const userJson = (c) => ({ id: c.sub, aud: "authenticated", role: "authenticated", email: c.email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() });
http.createServer(async (req, res) => {
  const body = await new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d)); });
  res.setHeader("access-control-allow-origin", req.headers.origin || "*");
  res.setHeader("access-control-allow-credentials", "true");
  res.setHeader("access-control-allow-headers", req.headers["access-control-request-headers"] || "*");
  res.setHeader("access-control-allow-methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  const send = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(obj === undefined ? "" : JSON.stringify(obj)); };
  if (req.url.startsWith("/auth/v1/token")) {
    const { email, password } = JSON.parse(body || "{}");
    const safe = String(email || "").replace(/'/g, "");
    const pw = String(password).replace(/'/g, "");
    const id = q(`select id from auth.users where lower(email)=lower('${safe}') and encrypted_password = extensions.crypt('${pw}', encrypted_password) and (banned_until is null or banned_until < now())`);
    if (!id) return send(400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const claims = { sub: id, email: safe, role: "authenticated", aud: "authenticated", exp, iat: exp - 3600, session_id: crypto.randomUUID() };
    return send(200, { access_token: jwt(claims), token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: "r-" + id, user: userJson(claims) });
  }
  if (req.url.startsWith("/auth/v1/user")) {
    const c = verify((req.headers.authorization || "").replace(/^Bearer /, ""));
    if (c && req.method === "PUT") {
      const { password } = JSON.parse(body || "{}");
      if (!password || String(password).length < 6) return send(422, { code: 422, error_code: "weak_password", msg: "Password should be at least 6 characters." });
      q(`update auth.users set encrypted_password = extensions.crypt('${String(password).replace(/'/g, "")}', extensions.gen_salt('bf', 4)) where id = '${c.sub}'`);
    }
    return c ? send(200, userJson(c)) : send(401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
  }
  if (req.url.startsWith("/auth/v1/logout")) return send(204);
  if (req.url.startsWith("/rest/v1/")) {
    const headers = { ...req.headers };
    delete headers.host;
    if (headers.authorization && !verify(headers.authorization.replace(/^Bearer /, ""))) delete headers.authorization;
    if (headers.authorization === undefined || headers.authorization === "Bearer anon") delete headers.authorization;
    const up = http.request({ host: "127.0.0.1", port: 54331, path: req.url.slice("/rest/v1".length), method: req.method, headers }, (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    });
    up.on("error", (e) => send(502, { msg: String(e) }));
    up.end(body);
    return;
  }
  send(404, { msg: "not found " + req.url });
}).listen(54321, () => console.log("gateway on 54321"));
