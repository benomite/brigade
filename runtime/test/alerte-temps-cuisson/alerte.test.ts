// L'alerte du temps de cuisson (#2676) : un ticket de correction quand la
// médiane des rapports réel / attendu dépasse `cookingOverEstimateMax` (1,5 par
// défaut), et jamais un second tant qu'il est ouvert.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { alerteTempsCuisson, LABELS_CORRECTION, lireSeuil, MARQUE_CORRECTION, medianeDesRatios, type GitHubDeLAlerte, type RatioServi } from "../../src/alerte-temps-cuisson/alerte.ts";

type Issue = { number: number; titre: string; corps: string; labels: string[]; state: "open" | "closed"; association: string };

// Le GitHub d'un projet, réduit à ce que l'alerte lit et écrit.
class FauxDepot {
  issues: Issue[] = [];
  github(): GitHubDeLAlerte {
    return {
      issuesDepuis: async () => this.issues.map(({ number, corps, association, state }) => ({ number, body: corps, association, state })),
      creerIssue: async ({ titre, corps, labels }) => {
        const number = 2700 + this.issues.length;
        this.issues.push({ number, titre, corps, labels, state: "open", association: "OWNER" });
        return number;
      },
      fermerIssue: async (numero) => {
        const issue = this.issues.find((i) => i.number === numero);
        if (issue) issue.state = "closed";
      },
    };
  }
}

// Un projet dont projet.json porte `contenu`.
function projetAvec(contenu: object): string {
  const dossier = mkdtempSync(join(tmpdir(), "alerte-temps-cuisson-"));
  mkdirSync(join(dossier, ".claude/brigade"), { recursive: true });
  writeFileSync(join(dossier, ".claude/brigade/projet.json"), JSON.stringify(contenu));
  return dossier;
}

// [ticket, attendu, réel], en minutes.
const ratios = (...lignes: [number, number | null, number][]): RatioServi[] => lignes.map(([ticket, attendu, reel]) => ({ ticket, attendu, reel }));
const MAINTENANT = () => new Date("2026-11-07T10:00:00Z");

test("with cookingOverEstimateMax absent from projet.json, the threshold is 1.5", (t) => {
  const dossier = projetAvec({ version: 1, integrationBranch: "main" });
  t.after(() => rmSync(dossier, { recursive: true, force: true }));
  assert.equal(lireSeuil(dossier), 1.5);
  // Pas de projet.json du tout : le même défaut.
  assert.equal(lireSeuil(join(dossier, "ailleurs")), 1.5);
});

test("a custom cookingOverEstimateMax in projet.json replaces the default", async (t) => {
  const dossier = projetAvec({ version: 1, cookingOverEstimateMax: 3 });
  t.after(() => rmSync(dossier, { recursive: true, force: true }));
  assert.equal(lireSeuil(dossier), 3);
  // Une médiane de 2 : au-dessus du défaut, sous le seuil du projet — rien ne s'ouvre.
  const depot = new FauxDepot();
  const alerter = alerteTempsCuisson({ github: depot.github(), lire: () => ({ ratios: ratios([1, 10, 20], [2, 10, 20], [3, 10, 20]), seuil: lireSeuil(dossier) }), maintenant: MAINTENANT });
  assert.deepEqual(await alerter(), { issue: "sous-le-seuil", mediane: 2, seuil: 3 });
  assert.equal(depot.issues.length, 0);
});

test("a median ratio over the threshold opens one correction ticket listing the most over-estimate tickets, highest ratio first", async () => {
  // Rapports : 1, 2, 4, 1.5, 3, 2.5 — médiane 2.25.
  const lus = ratios([2601, 10, 10], [2602, 10, 20], [2603, 5, 20], [2604, 20, 30], [2605, 10, 30], [2606, 4, 10]);
  assert.equal(medianeDesRatios(lus), 2.25);
  const depot = new FauxDepot();
  const alerter = alerteTempsCuisson({ github: depot.github(), lire: () => ({ ratios: lus, seuil: 1.5 }), maintenant: MAINTENANT });
  assert.deepEqual(await alerter(), { issue: "ouverte", numero: 2700, mediane: 2.25, seuil: 1.5 });
  assert.equal(depot.issues.length, 1);
  const [ouvert] = depot.issues;
  assert.deepEqual(ouvert?.labels, LABELS_CORRECTION);
  assert.ok(ouvert?.corps.startsWith(MARQUE_CORRECTION));
  assert.match(ouvert?.titre ?? "", /median ratio ×2\.25 over the max of ×1\.50/);
  const lignes = (ouvert?.corps ?? "").split("\n").filter((ligne) => /^\| #\d+ /.test(ligne));
  assert.deepEqual(lignes, [
    "| #2603 | 5 min | 20 min | ×4.00 |",
    "| #2605 | 10 min | 30 min | ×3.00 |",
    "| #2606 | 4 min | 10 min | ×2.50 |",
    "| #2602 | 10 min | 20 min | ×2.00 |",
    "| #2604 | 20 min | 30 min | ×1.50 |",
  ]);
});

test("a median at or below the threshold opens nothing, and tickets with no estimate are left out of the median", async () => {
  const depot = new FauxDepot();
  // Exactement au seuil : rien.
  const auSeuil = ratios([1, 10, 10], [2, 10, 15], [3, 10, 20]);
  assert.deepEqual(await alerteTempsCuisson({ github: depot.github(), lire: () => ({ ratios: auSeuil, seuil: 1.5 }), maintenant: MAINTENANT })(), { issue: "sous-le-seuil", mediane: 1.5, seuil: 1.5 });
  // Trois tickets estimés à ×1, et quatre sans estimation qui ont cuit longtemps :
  // comptés, ils porteraient la médiane bien au-dessus du seuil.
  const sansEstimation = ratios([4, 10, 10], [5, 10, 10], [6, 10, 10], [7, null, 90], [8, null, 90], [9, 0, 90], [10, null, 90]);
  assert.equal(medianeDesRatios(sansEstimation), 1);
  assert.deepEqual(await alerteTempsCuisson({ github: depot.github(), lire: () => ({ ratios: sansEstimation, seuil: 1.5 }), maintenant: MAINTENANT })(), { issue: "sous-le-seuil", mediane: 1, seuil: 1.5 });
  // Aucun ticket estimé : pas de médiane, rien.
  assert.deepEqual(await alerteTempsCuisson({ github: depot.github(), lire: () => ({ ratios: ratios([11, null, 90]), seuil: 1.5 }), maintenant: MAINTENANT })(), { issue: "sous-le-seuil", mediane: null, seuil: 1.5 });
  assert.equal(depot.issues.length, 0);
});

test("a second run while the correction ticket is open opens no other, even from another station; once it is closed, one more opens", async () => {
  const lus = ratios([1, 10, 30], [2, 10, 30], [3, 10, 30]);
  const depot = new FauxDepot();
  const lire = () => ({ ratios: lus, seuil: 1.5 });
  const alerter = alerteTempsCuisson({ github: depot.github(), lire, maintenant: MAINTENANT });
  assert.equal((await alerter()).issue, "ouverte");
  assert.deepEqual(await alerter(), { issue: "deja-ouverte", numero: 2700, mediane: 3, seuil: 1.5 });
  // Une autre station, sans mémoire, le trouve sur GitHub.
  assert.deepEqual(await alerteTempsCuisson({ github: depot.github(), lire, maintenant: MAINTENANT })(), { issue: "deja-ouverte", numero: 2700, mediane: 3, seuil: 1.5 });
  assert.equal(depot.issues.length, 1);
  // Une issue qui copie la marque, d'un auteur hors de confiance, ne compte pas.
  depot.issues[0]!.state = "closed";
  depot.issues.push({ number: 2650, titre: "copie", corps: MARQUE_CORRECTION, labels: [], state: "open", association: "NONE" });
  assert.equal((await alerter()).issue, "ouverte");
  assert.equal(depot.issues.filter((i) => i.state === "open" && i.association === "OWNER").length, 1);
});
