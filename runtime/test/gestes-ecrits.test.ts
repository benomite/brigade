// Les gestes que le runtime écrit se tapent tels quels sur la box : chacun est
// `brigade <projet> <commande> …`, avec le vrai nom du projet, et sa commande est
// une de celles que le geste de box (`deploy/brigade`) accepte — jamais `run …`,
// qu'il refuse en 66.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const PROJET = "espace-essai";
process.env.BRIGADE_PROJECT = PROJET;

const RACINE = join(import.meta.dirname, "..");

// La règle du geste de box : un script du `package.json` qui lance un fichier de
// `src/`, sauf `start` — et sous son nom anglais : un ancien nom répond encore,
// mais aucun message ne le cite (`commandes.ts`).
const scripts: Record<string, string> = JSON.parse(readFileSync(join(RACINE, "package.json"), "utf8")).scripts;
const ACCEPTEES = Object.entries(scripts)
  .filter(([nom, script]) => nom !== "start" && /^node src\/[\w-]+\.ts$/.test(script) && script !== "node src/ancien-nom.ts")
  .map(([nom]) => nom);

const gestesDe = (texte: string) => [...texte.matchAll(/brigade (\S+) ([a-z][a-z-]*)/g)].map(([, projet, commande]) => ({ projet: projet ?? "", commande: commande ?? "" }));

function accepte(texte: string) {
  const gestes = gestesDe(texte);
  assert.ok(gestes.length > 0, `aucun geste dans : ${texte}`);
  for (const { projet, commande } of gestes) {
    assert.equal(projet, PROJET, `le projet n'est pas nommé dans : ${texte}`);
    assert.ok(ACCEPTEES.includes(commande), `« ${commande} » n'est pas acceptée par le geste de box (${ACCEPTEES.join(", ")}) : ${texte}`);
  }
  assert.doesNotMatch(texte, /(^|[\s`(])run [a-z-]+/, `une forme de poste de dev reste dans : ${texte}`);
  assert.doesNotMatch(texte, /npm (--prefix \S+ )?run /, `une forme de poste de dev reste dans : ${texte}`);
}

test("les gestes cités en constantes sont ceux de la box", async () => {
  const fermeture = await import("../src/closing/say.ts");
  const stations = await import("../src/projections/stations.ts");
  const declarees = await import("../src/stations-declarees.ts");
  const attend = await import("../src/attend.ts");
  const base = await import("../src/dire-base.ts");
  const manager = await import("../src/events/manager.ts");
  for (const texte of [
    fermeture.DEMANDER, fermeture.ANNULER,
    stations.GESTE_DE_CONNEXION, declarees.GESTE_DE_STATION_A_CHAUD,
    attend.ACCORDER_LE_GRANT, base.REJOUER_LA_BASE, manager.commandeRendre(12),
  ]) accepte(texte);
});

test("aucun message du runtime n'écrit `run <commande>` : la forme de la box est la seule", () => {
  const fichiers = (dossier: string): string[] =>
    readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => (entree.isDirectory() ? fichiers(join(dossier, entree.name)) : entree.name.endsWith(".ts") ? [join(dossier, entree.name)] : []));
  for (const fichier of fichiers(join(RACINE, "src"))) {
    const lignes = readFileSync(fichier, "utf8").split("\n");
    lignes.forEach((ligne, i) => {
      if (/^\s*\/\//.test(ligne) || /usage :|^\s*"\s+BRIGADE_/.test(ligne)) return;
      assert.doesNotMatch(ligne, /`run [a-z-]+|"run [a-z-]+/, `${fichier}:${i + 1} écrit un geste \`run …\``);
      assert.doesNotMatch(ligne, /`npm (--prefix runtime )?run [a-z-]+/, `${fichier}:${i + 1} écrit un geste de poste de dev`);
    });
  }
});
