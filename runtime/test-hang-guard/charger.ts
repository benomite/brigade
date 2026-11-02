// Preloaded by `--import` on every test file's process (see the `test` script of package.json):
// each file `import`s `node:test`, and this redirects that import to `garde.ts`, which gives every
// test a 30 s limit (#2084).
import { registerHooks } from "node:module";

const GARDE = new URL("./garde.ts", import.meta.url).href;

registerHooks({
  resolve(specifier, contexte, suivant) {
    if (specifier === "node:test" && contexte.parentURL !== GARDE) return { url: GARDE, shortCircuit: true };
    return suivant(specifier, contexte);
  },
});
