// pdf.js ships no types for its worker module; source.ts only needs it loaded (see pdfText there).
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}
