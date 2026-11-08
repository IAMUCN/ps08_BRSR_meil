import "server-only";
import { createHash } from "node:crypto";
import { lookup as dnsLookup } from "node:dns";
import { request } from "node:https";
import type { LookupAddress } from "node:dns";
import {
  checkLink,
  findCandidates,
  htmlToText,
  isPrivateAddress,
  officialHost,
} from "./source-text";
import type { SourceHost } from "./source-text";

// Reading a conversion factor's source page (feature_enhancement.md 6.1; decision log "Phase 6 decisions"). Only a
// link on an official site (org_settings.factor_source_hosts) is fetched; the page is read and the numbers that
// look like factors are offered to the person, who picks one and saves a draft. Nothing is saved here.
//
// The server is the one making the request, so the guards are about where it can be sent: https on port 443 only,
// a host on the list (redirects re-checked), and every address the name resolves to must be public. The address
// check happens inside the connection's own lookup, so a name cannot resolve to a public address for the check
// and a private one for the connection.

export type FetchedSource = {
  finalUrl: string;
  contentType: string;
  publisher: string;
  title: string | null;
  sha256: string;
  retrievedOn: string;
  bytes: number;
  candidates: ReturnType<typeof findCandidates>;
};

export type FetchOutcome = { ok: true; source: FetchedSource } | { ok: false; reason: string };

const MAX_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

type Lookup = typeof dnsLookup;

/** A DNS lookup that refuses names resolving to any private address. Used by the connection itself. */
export function guardedLookup(base: Lookup = dnsLookup): Lookup {
  return ((hostname: string, options: unknown, callback: unknown) => {
    const cb = (typeof options === "function" ? options : callback) as (
      err: NodeJS.ErrnoException | null,
      address: string | LookupAddress[],
      family?: number,
    ) => void;
    const opts = (typeof options === "object" && options ? options : {}) as { all?: boolean };
    base(hostname, { all: true }, (err, addresses) => {
      if (err) return cb(err, "", 0);
      const list = addresses as LookupAddress[];
      if (!list.length || list.some((a) => isPrivateAddress(a.address))) {
        const refused = Object.assign(new Error(`${hostname} resolves to a private address`), {
          code: "EPRIVATE",
        });
        return cb(refused, "", 0);
      }
      if (opts.all) return cb(null, list);
      return cb(null, list[0].address, list[0].family);
    });
  }) as Lookup;
}

type RawResponse = { status: number; location: string | null; contentType: string; body: Buffer };
export type Transport = (url: URL) => Promise<RawResponse>;

/** One GET over https with the guarded lookup, a time limit and a size limit. */
export const httpsTransport =
  (lookup: Lookup = guardedLookup()): Transport =>
  (url) =>
    new Promise((resolve, reject) => {
      const req = request(
        url,
        {
          method: "GET",
          lookup,
          timeout: TIMEOUT_MS,
          headers: {
            "user-agent": "EmeilSG-factor-source-check/1.0",
            accept:
              "text/html,application/pdf,text/plain,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel;q=0.9,*/*;q=0.1",
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_BYTES) {
              req.destroy(new Error("The file is larger than 10 MB."));
              return;
            }
            chunks.push(chunk);
          });
          res.on("end", () =>
            resolve({
              status: res.statusCode ?? 0,
              location: typeof res.headers.location === "string" ? res.headers.location : null,
              contentType: String(res.headers["content-type"] ?? "").toLowerCase(),
              body: Buffer.concat(chunks),
            }),
          );
          res.on("error", reject);
        },
      );
      req.on("timeout", () => req.destroy(new Error("The site did not answer within 15 seconds.")));
      req.on("error", reject);
      req.end();
    });

/** Today in India, YYYY-MM-DD. */
export const indiaToday = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

/** Fetch an official source page and offer its likely factor values. */
export async function fetchSource(
  raw: string,
  hosts: SourceHost[],
  context: { metricUnit: string; keywords: string[] },
  transport: Transport = httpsTransport(),
): Promise<FetchOutcome> {
  const first = checkLink(raw);
  if (!first.ok) return first;
  let url = first.url;
  let official = officialHost(url, hosts);
  if (!official) {
    return {
      ok: false,
      reason: `${url.hostname} is not on the list of official sources, so it is not fetched. The link is still saved with the factor; type the value.`,
    };
  }

  let res: RawResponse | null = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    try {
      res = await transport(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        reason: /private address/.test(message)
          ? "That site's name points to a private address, so it was not fetched."
          : `The page could not be read: ${message}`,
      };
    }
    if (res.status >= 300 && res.status < 400 && res.location) {
      const next = checkLink(new URL(res.location, url).toString());
      if (!next.ok)
        return {
          ok: false,
          reason: `The site redirected to a link that is refused. ${next.reason}`,
        };
      const nextOfficial = officialHost(next.url, hosts);
      if (!nextOfficial)
        return {
          ok: false,
          reason: `The site redirected to ${next.url.hostname}, which is not on the official list.`,
        };
      url = next.url;
      official = nextOfficial;
      continue;
    }
    break;
  }
  if (!res || (res.status >= 300 && res.status < 400))
    return { ok: false, reason: "The site redirected too many times." };
  if (res.status !== 200)
    return { ok: false, reason: `The site answered with status ${res.status}.` };

  const kind = res.contentType.split(";")[0].trim();
  let text: string;
  let title: string | null = null;
  try {
    if (kind === "text/html" || kind === "application/xhtml+xml") {
      const html = res.body.toString("utf8");
      title =
        htmlToText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").slice(0, 160) || null;
      text = htmlToText(html);
    } else if (kind === "text/plain" || kind === "text/csv") {
      text = res.body.toString("utf8");
    } else if (kind === "application/pdf") {
      text = await pdfText(res.body);
    } else if (
      kind === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      kind === "application/vnd.ms-excel"
    ) {
      text = await sheetText(res.body);
    } else {
      return { ok: false, reason: `The link returned a ${kind || "file"} that cannot be read.` };
    }
  } catch (error) {
    // The server log keeps why (a damaged or encrypted file, or a reader problem); the person sees a plain reason.
    console.warn(
      "factor source could not be read",
      kind,
      error instanceof Error ? error.message : error,
    );
    return { ok: false, reason: "The file could not be read." };
  }

  return {
    ok: true,
    source: {
      finalUrl: url.toString(),
      contentType: kind,
      publisher: official.publisher,
      title,
      sha256: createHash("sha256").update(res.body).digest("hex"),
      retrievedOn: indiaToday(),
      bytes: res.body.length,
      candidates: findCandidates(text, context),
    },
  };
}

async function pdfText(data: Buffer): Promise<string> {
  // pdf.js runs its "worker" in this process when the worker module is already loaded; importing it by name also
  // puts the file in the deployment's file trace (it is otherwise loaded by a path pdf.js builds at runtime).
  const g = globalThis as { pdfjsWorker?: unknown };
  g.pdfjsWorker ??= await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: new Uint8Array(data),
    disableFontFace: true,
    useSystemFonts: false,
    // Only text is read, so the font warnings pdf.js prints for drawing are noise.
    verbosity: 0,
  });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let n = 1; n <= Math.min(doc.numPages, 60); n += 1) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    pages.push(content.items.map((i) => ("str" in i ? i.str : "")).join(" "));
  }
  await task.destroy();
  return pages.join("\n");
}

async function sheetText(data: Buffer): Promise<string> {
  const XLSX = await import("xlsx");
  const book = XLSX.read(data, { type: "buffer", cellFormula: false, cellHTML: false });
  return book.SheetNames.slice(0, 20)
    .map((name) => name + "\n" + XLSX.utils.sheet_to_csv(book.Sheets[name], { FS: " | " }))
    .join("\n");
}
