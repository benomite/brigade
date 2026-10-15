// Ce que la station dit d'elle-même quand elle a démarré : ce que la mise à
// jour attend pour garder une version.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { annoncerEnService, lireEnService, versionDuRuntime } from "../../src/mise-a-jour/en-service.ts";
import { jusqua, repertoireTemporaire } from "../outils.ts";

test("hors du paquet, la version du runtime est celle du dépôt", () => {
  assert.equal(versionDuRuntime(), "0.0.0");
});

test("la station dit sa version, son pid, depuis quand et ce qu'elle sert — puis le redit quand ce qu'elle sert change", async (t) => {
  const racine = repertoireTemporaire(t);
  let servis = ["brigade"];
  let refuses: Record<string, string> = { espace: "le clone du projet n'existe pas" };
  const arreter = annoncerEnService(racine, () => ({ servis, refuses }), { version: "1.2.0", pid: 4242, maintenant: () => new Date("2026-10-15T14:02:00.000Z"), intervalleMs: 5 });
  t.after(arreter);
  assert.deepEqual(lireEnService(racine), { version: "1.2.0", pid: 4242, depuis: "2026-10-15T14:02:00.000Z", servis: ["brigade"], refuses });
  servis = ["espace", "brigade"];
  refuses = {};
  await jusqua(() => lireEnService(racine)?.servis.length === 2);
  assert.deepEqual(lireEnService(racine), { version: "1.2.0", pid: 4242, depuis: "2026-10-15T14:02:00.000Z", servis: ["brigade", "espace"], refuses: {} });
});

test("ce qui ne se lit pas comme un démarrage de la station n'en est pas un", (t) => {
  const racine = repertoireTemporaire(t);
  assert.equal(lireEnService(racine), null);
  for (const texte of ["", "{", JSON.stringify({ version: "1.0.0" }), JSON.stringify({ version: 1, pid: 2, depuis: "x", servis: [] })]) {
    writeFileSync(join(racine, "en-service"), texte);
    assert.equal(lireEnService(racine), null, texte);
  }
});
