// The only endpoint of the waiting list (#3271): POST /signup, with an email. It never returns a stored email or the count:
// the list is read with report.mjs, on the machine that holds the file.
// Usage: WAITLIST_DB=/path/waitlist.sqlite [PORT=8787] [WAITLIST_ORIGIN=https://benomite.github.io] node scripts/waitlist/server.mjs
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { openStore } from "./store.mjs";

const MAX_BODY = 2048;

export function createWaitlistServer(store, origin) {
  return createServer((req, res) => {
    const cors = { "access-control-allow-origin": origin, "access-control-allow-methods": "POST", "access-control-allow-headers": "content-type" };
    const send = (status, body) => { res.writeHead(status, { ...cors, "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (new URL(req.url, "http://x").pathname !== "/signup") return send(404, { error: "not found" });
    if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
    if (req.method !== "POST") return send(405, { error: "method not allowed" });
    let body = "";
    let tooBig = false;
    req.on("data", (c) => { body += c; if (body.length > MAX_BODY) { tooBig = true; req.destroy(); } });
    req.on("close", () => { if (tooBig && !res.writableEnded) send(413, { error: "too large" }); });
    req.on("end", () => {
      let email;
      try { email = JSON.parse(body).email; } catch { return send(400, { error: "invalid" }); }
      // Valid and already known answers the same: the person never sees a duplicate.
      return store.add(email) ? send(200, { ok: true }) : send(400, { error: "invalid" });
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.env.WAITLIST_DB;
  if (!file) { console.error("WAITLIST_DB is required (the path of the SQLite file)."); process.exit(1); }
  const port = Number(process.env.PORT ?? 8787);
  createWaitlistServer(openStore(file), process.env.WAITLIST_ORIGIN ?? "https://benomite.github.io").listen(port, () => console.log(`waiting list listening on ${port}`));
}
