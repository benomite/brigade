// Les projets qu'une autre station sert sont cuits ici aussi (#4286) : au lancement, la station embarquée
// reprend les lignes qu'une version d'avant (#2110) avait mises en commentaire, et n'en met plus aucune de côté.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { repertoireTemporaire } from "../../runtime/test/outils.ts";
import { remettreLesProjets } from "../src/station-projets-remis.ts";

const MIS_DE_COTE = "# projets\n# held-back (served by box): brigade acme/brigade main\nshop acme/shop main BRIGADE_X=1\n# held-back (served by box): espace acme/espace v2\n";
const REMIS = "# projets\nbrigade acme/brigade main\nshop acme/shop main BRIGADE_X=1\nespace acme/espace v2\n";

function unOrdinateur(t: TestContext, configuration: string) {
  const racine = join(repertoireTemporaire(t), "station");
  mkdirSync(racine);
  writeFileSync(join(racine, "projets"), configuration);
  return racine;
}

test("les lignes qu'une version d'avant avait mises de côté pour une autre station sont remises telles quelles, et dites", (t) => {
  const racine = unOrdinateur(t, MIS_DE_COTE);
  const lignes: string[] = [];
  remettreLesProjets({ racine, dire: (ligne) => lignes.push(ligne) });
  assert.equal(readFileSync(join(racine, "projets"), "utf8"), REMIS);
  assert.equal(lignes.length, 2);
  assert.match(lignes[0] ?? "", /^brigade: brigade was held back for another station: this computer's station serves it again/);
  assert.match(lignes[1] ?? "", /espace was held back/);
});

test("une configuration sans ligne mise de côté n'est pas touchée, et rien n'est dit", (t) => {
  const racine = unOrdinateur(t, REMIS);
  const lignes: string[] = [];
  remettreLesProjets({ racine, dire: (ligne) => lignes.push(ligne) });
  assert.equal(readFileSync(join(racine, "projets"), "utf8"), REMIS);
  assert.deepEqual(lignes, []);
});

test("sans fichier des projets, rien ne se passe ; un fichier illisible est laissé tel quel et le dit", (t) => {
  const vide = join(repertoireTemporaire(t), "station");
  mkdirSync(vide);
  const lignes: string[] = [];
  remettreLesProjets({ racine: vide, dire: (ligne) => lignes.push(ligne) });
  assert.deepEqual(lignes, []);

  const racine = unOrdinateur(t, MIS_DE_COTE);
  chmodSync(join(racine, "projets"), 0o000);
  t.after(() => chmodSync(join(racine, "projets"), 0o644));
  if (process.getuid?.() === 0) return;
  const dites: string[] = [];
  remettreLesProjets({ racine, dire: (ligne) => dites.push(ligne) });
  assert.equal(dites.length, 1);
  assert.match(dites[0] ?? "", /could not be put back .* left as it was/);
});
