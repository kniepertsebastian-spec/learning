/**
 * Request-Bodies mit fester Obergrenze lesen. Der Header Content-Length allein reicht nicht: bei einem Upload in Stücken
 * (Transfer-Encoding: chunked) fehlt er, und request.json() / request.formData() lesen dann den ganzen Body in den Speicher,
 * bevor irgendeine Größenprüfung greift. Hier wird der Strom mitgezählt und bei Überschreitung abgebrochen.
 */

export class BodyTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Die Anfrage ist größer als ${maxBytes} Bytes.`);
  }
}

/** Liest den Body höchstens bis maxBytes; wirft BodyTooLargeError, sobald es mehr wird (auch ohne Content-Length). */
export async function readBodyCapped(request: Request, maxBytes: number): Promise<Buffer> {
  // Angegebene Größe über der Grenze: gar nicht erst anfangen zu lesen. Fehlt der Header, ergibt Number(null) 0 und der Strom entscheidet.
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLargeError(maxBytes);
  if (!request.body) return Buffer.alloc(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new BodyTooLargeError(maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

/** Wie request.json(), aber mit Obergrenze. Wirft BodyTooLargeError bzw. SyntaxError bei ungültigem JSON. */
export async function readJsonCapped(request: Request, maxBytes: number): Promise<unknown> {
  return JSON.parse((await readBodyCapped(request, maxBytes)).toString("utf-8"));
}

/** Wie request.formData(), aber mit Obergrenze. Wirft BodyTooLargeError bzw. TypeError bei einem ungültigen Multipart-Body. */
export async function readFormDataCapped(request: Request, maxBytes: number): Promise<FormData> {
  const body = await readBodyCapped(request, maxBytes);
  // Sicht auf denselben Speicher statt Kopie: bei Uploads bis 105 MB wäre eine Kopie ein dritter Satz im Heap.
  const view = new Uint8Array(body.buffer as ArrayBuffer, body.byteOffset, body.byteLength);
  return new Response(view, { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData();
}
