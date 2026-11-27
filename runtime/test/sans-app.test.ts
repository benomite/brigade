// Le paquet de la station ne porte que runtime/src (runtime/paquet/construire.ts) : un import
// du runtime qui sort de runtime/src — vers app/src surtout — démarre la station du paquet sur
// ERR_MODULE_NOT_FOUND (#4551). Ce que le runtime et l'app partagent vit dans runtime/src, et
// l'app l'importe de là.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { test } from "node:test";

const SRC = resolve(import.meta.dirname, "../src");

function sources(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) return sources(chemin);
    return /\.(ts|js|mjs|cjs)$/.test(entree.name) ? [chemin] : [];
  });
}

// Les spécificateurs relatifs d'un source : `import … from`, `export … from`, `import "…"`,
// `import("…")` et `typeof import("…")`, types compris.
function importsRelatifs(texte: string): string[] {
  const motif = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["'](\.{1,2}\/[^"']+)["']/g;
  return [...texte.matchAll(motif)].map((m) => m[1] ?? "");
}

test("aucun source de runtime/src n'importe hors de runtime/src — ni app/src, ni rien que le paquet ne porte pas (#4551)", () => {
  const fichiers = sources(SRC);
  assert.ok(fichiers.length > 100, `runtime/src lu : ${fichiers.length} sources`);
  const dehors = fichiers.flatMap((fichier) =>
    importsRelatifs(readFileSync(fichier, "utf8"))
      .filter((specificateur) => !resolve(dirname(fichier), specificateur).startsWith(SRC + sep))
      .map((specificateur) => `${relative(SRC, fichier)} importe ${specificateur}`),
  );
  assert.deepEqual(dehors, []);
});

test("le garde voit un import vers app/src, statique, de type ou dynamique", () => {
  const texte = [
    `import { a } from "../../app/src/vue/x.ts";`,
    `import type { B } from '../../../app/src/y.ts';`,
    `const c = await import("../../app/src/z.ts");`,
    `type D = typeof import("../../app/src/w.ts");`,
    `export { e } from "../../app/src/v.ts";`,
    `// app/src/vue/autonomy/compute.ts, en commentaire : pas un import`,
  ].join("\n");
  assert.deepEqual(importsRelatifs(texte), ["../../app/src/vue/x.ts", "../../../app/src/y.ts", "../../app/src/z.ts", "../../app/src/w.ts", "../../app/src/v.ts"]);
});
