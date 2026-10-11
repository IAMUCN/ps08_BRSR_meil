// Lets plain Node load the app's server modules for tests/isolation/cross-project.mjs: "@/x" -> apps/web/x,
// "server-only" -> nothing, "next/x" -> next/x.js, next/navigation -> a stand-in. Nothing here ships.
import { registerHooks } from "node:module";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const WEB = fileURLToPath(new URL("../../", import.meta.url)).replaceAll("\\", "/");
const candidates = (base) => [base, base + ".ts", base + ".tsx", base + "/index.ts"];

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,export{}", shortCircuit: true };
    }
    if (specifier.startsWith("@/")) {
      const hit = candidates(WEB + specifier.slice(2)).find(
        (p) => existsSync(p) && statSync(p).isFile(),
      );
      if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
    }
    if (
      specifier.startsWith(".") &&
      context.parentURL?.startsWith("file:") &&
      !/\.(ts|tsx|js|mjs|cjs|json)$/.test(specifier)
    ) {
      const base = fileURLToPath(new URL(specifier, context.parentURL)).replace(/\\/g, "/");
      const hit = candidates(base).find((p) => existsSync(p) && statSync(p).isFile());
      if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
    }
    if (specifier === "next/navigation") {
      return { url: new URL("./nav-stub.mjs", import.meta.url).href, shortCircuit: true };
    }
    if (/^next\/(headers|server|cache)$/.test(specifier)) {
      return nextResolve(specifier + ".js", context);
    }
    return nextResolve(specifier, context);
  },
});
