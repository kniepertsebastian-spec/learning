import http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Schaltbarer Vorsatz-Proxy vor dem Next-Server. Playwrights `setOffline` sperrt Anfragen des Service Workers nicht;
 * mit `setOnline(false)` bricht das Gateway Verbindungen wirklich ab - wie ein echter Netzausfall.
 * `deploy(n)` hängt einen Kommentar an /sw.js: der Browser sieht dann einen neuen Service Worker (wie nach einem Deploy).
 */
export class Gateway {
  private server: http.Server;
  private online = true;
  private version = 1;
  url = "";

  constructor(private target: { host: string; port: number }) {
    this.server = http.createServer((req, res) => this.handle(req, res));
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve) => this.server.listen(0, "127.0.0.1", resolve));
    this.url = `http://localhost:${(this.server.address() as AddressInfo).port}`;
  }

  async stop(): Promise<void> {
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  setOnline(online: boolean): void {
    this.online = online;
    if (!online) this.server.closeAllConnections();
  }

  deploy(version: number): void {
    this.version = version;
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (!this.online) {
      req.socket.destroy();
      return;
    }
    const isSw = (req.url ?? "").startsWith("/sw.js");
    const headers = { ...req.headers, host: req.headers.host ?? "", ...(isSw ? { "accept-encoding": "identity" } : {}) };
    if (isSw) {
      delete headers["if-none-match"];
      delete headers["if-modified-since"];
    }
    const upstream = http.request({ ...this.target, path: req.url, method: req.method, headers }, (up) => {
      if (!isSw) {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
        return;
      }
      const chunks: Buffer[] = [];
      up.on("data", (c: Buffer) => chunks.push(c));
      up.on("end", () => {
        const body = `${Buffer.concat(chunks).toString()}\n// deploy ${this.version}`;
        const out = { ...up.headers, "content-length": String(Buffer.byteLength(body)), "cache-control": "no-store" };
        delete out.etag;
        res.writeHead(up.statusCode ?? 200, out);
        res.end(body);
      });
    });
    upstream.on("error", () => req.socket.destroy());
    req.pipe(upstream);
  }
}
