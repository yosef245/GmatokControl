// Local stand-in for Meta's WhatsApp Cloud API (e2e only), on :54332.
//   POST /<version>/<phone-id>/messages → { messages: [{ id }] }, or an error for numbers ending in 000000
//   GET  /__sent                        → every message received so far
import http from "node:http";
const sent = [];
http.createServer(async (req, res) => {
  const body = await new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d)); });
  const send = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
  if (req.method === "GET" && req.url === "/__sent") return send(200, sent);
  if (req.method === "POST" && /^\/v[\d.]+\/[^/]+\/messages$/.test(req.url)) {
    if (req.headers.authorization !== "Bearer e2e-token") return send(401, { error: { message: "Invalid OAuth access token", code: 190 } });
    let msg;
    try { msg = JSON.parse(body); } catch { return send(400, { error: { message: "bad json", code: 100 } }); }
    if (String(msg.to).endsWith("000000")) return send(400, { error: { message: "Recipient phone number not in allowed list", code: 131030 } });
    const id = `wamid.e2e${sent.length + 1}`;
    sent.push({ id, ...msg });
    return send(200, { messaging_product: "whatsapp", contacts: [{ wa_id: msg.to }], messages: [{ id }] });
  }
  send(404, { error: { message: "not found" } });
}).on("error", (e) => console.error(e)).listen(54332, "127.0.0.1");
