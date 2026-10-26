// La sélection faite dans l'app, traduite en ce que la station demande à
// `projets/tenir.ts` : un projet par dépôt, et ce que la sélection ne dit pas
// — sa branche, ses cooks, son calibrage —, tiré du dépôt ou de la machine.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import type { Selection } from "../../src/enregistrement-station/contrat.ts";
import { baseDuClone, CALIBRAGE_DE_DEPART, cooksDeLaMachine, demandeDeLaSelection } from "../../src/projets-station/selection.ts";
import { projetSurGit } from "../aides/projet-sur-git.ts";
import { repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

const selection = (...repositories: string[]): Selection => ({ brigade: "station-selection", format: 1, repositories, updatedAt: "2026-10-26T09:45:00.000Z" });

test("chaque dépôt choisi est un projet dont la station est la principale, nommé comme l'app le nomme, avec le plafond de cooks de la machine et le calibrage de départ", () => {
  const bases: string[] = [];
  const demande = demandeDeLaSelection(selection("acme/Shop.git", "acme/site"), { cooks: 3, base: (nom) => (bases.push(nom), nom === "site" ? "main" : null) });
  assert.deepEqual(demande.problemes, []);
  assert.deepEqual(bases, ["shop", "site"]);
  assert.deepEqual(demande.projets, [
    { nom: "shop", depot: "acme/Shop.git", base: null, principale: true, cooks: 3, manager: CALIBRAGE_DE_DEPART, reviewer: CALIBRAGE_DE_DEPART, ouvertLe: null, demandeLe: null },
    { nom: "site", depot: "acme/site", base: "main", principale: true, cooks: 3, manager: CALIBRAGE_DE_DEPART, reviewer: CALIBRAGE_DE_DEPART, ouvertLe: null, demandeLe: null },
  ]);
  assert.deepEqual(CALIBRAGE_DE_DEPART, { modele: "sonnet", effort: "medium" });
});

test("une sélection vide ne demande aucun projet", () => {
  assert.deepEqual(demandeDeLaSelection(selection(), { cooks: 1, base: () => null }), { projets: [], problemes: [] });
});

test("deux dépôts du même nom : le premier est servi, l'autre est dit ; un dépôt sans nom de projet aussi", () => {
  const demande = demandeDeLaSelection(selection("acme/site", "autre/site", "acme/___"), { cooks: 1, base: () => null });
  assert.deepEqual(
    demande.projets.map(({ nom, depot }) => `${nom} ${depot}`),
    ["site acme/site"],
  );
  assert.deepEqual(demande.problemes, [
    "autre/site, choisi dans l'app, n'est pas servi : acme/site sert déjà sous le nom de projet « site »",
    "acme/___, choisi dans l'app, n'est pas servi : son nom ne donne pas de nom de projet (minuscules, chiffres et tirets)",
  ]);
});

test("le plafond de cooks vient des cœurs de la machine : deux gardés pour la cuisine, puis environ deux par cook", () => {
  assert.equal(cooksDeLaMachine(8), 3);
  assert.equal(cooksDeLaMachine(2), 1);
  assert.equal(cooksDeLaMachine(1), 1);
  assert.ok(cooksDeLaMachine() >= 1);
});

test("la branche de la ligne : aucune si le dépôt en déclare une, sinon sa branche par défaut — aucune tant qu'il n'est pas cloné", (t) => {
  assert.equal(baseDuClone(join(repertoireTemporaire(t), "pas-de-clone")), null);
  const { clone: sansReglage } = projetSurGit(t, { parDefaut: "trunk" });
  assert.equal(baseDuClone(sansReglage), "trunk");
  const { clone: declare } = projetSurGit(t, { parDefaut: "main", autres: ["v2"], reglages: { integrationBranch: "v2" } });
  assert.equal(baseDuClone(declare), null);
  const { clone: parSonClaudeMd } = projetSurGit(t, { parDefaut: "main", autres: ["v2"], claudeMd: "- **Branche d'intégration** : `v2`\n" });
  assert.equal(baseDuClone(parSonClaudeMd), null);
});

test("selection.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
