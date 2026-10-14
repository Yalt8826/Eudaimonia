// M5 drain-leg fixture: stands in for the wake-tap ingest route until P2
// T2.1 builds the real one in app/ (M3 precedent — the phone test used a
// /tmp stand-in, never a data-plane implementation). It accepts ANY POST
// and returns 200, which is exactly the contract the outbox needs to clear
// a queued event; the queue's own dedup/ordering is what is under test,
// not this server.
//
// Usage: node scripts/test_ingest_server.js [port]   (default 8000)
// Appends one JSON line per request to renders/m5-drain-log.jsonl.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const port = Number(process.argv[2] || 8000);
const logPath = path.join(__dirname, "..", "renders", "m5-drain-log.jsonl");

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    let parsed = null;
    try {
      parsed = body ? JSON.parse(body) : null;
    } catch {
      parsed = { unparsed: body };
    }
    fs.appendFileSync(
      logPath,
      JSON.stringify({
        at: new Date().toISOString(),
        method: req.method,
        url: req.url,
        body: parsed,
      }) + "\n",
    );
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"status":"ok"}');
  });
});
server.listen(port, "0.0.0.0", () => {
  console.log(`ingest stand-in on 0.0.0.0:${port} -> ${logPath}`);
});
