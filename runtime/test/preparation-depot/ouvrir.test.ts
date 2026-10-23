// Le ticket qui prépare le dépôt d'un projet ajouté depuis l'app : ouvert une
// fois sur GitHub — doublé ici —, son numéro gardé dans l'état du projet, et
// ce qu'il demande au cook.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { GitHub, IssueOuverte } from "../../src/github.ts";
import { FICHIER, lirePreparation, ouvrirLaPreparation } from "../../src/preparation-depot/ouvrir.ts";
import { corps, dejaSurLaBase, LABELS, MARQUEUR, TITRE } from "../../src/preparation-depot/ticket.ts";
import { BASE, depotGit, git, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

const issue = (numero: number, body: string, association = "OWNER"): IssueOuverte => ({
  number: numero,
  title: `Ticket ${numero}`,
  labels: [],
  state: "open",
  createdAt: "2026-10-15T12:00:00Z",
  updatedAt: "2026-10-15T12:00:00Z",
  url: `https://github.com/benomite/parade/issues/${numero}`,
  body,
  association,
});

function unGitHub(ouvertes: IssueOuverte[] = []) {
  const creees: Array<{ titre: string; corps: string; labels: string[] }> = [];
  let lectures = 0;
  const github: Pick<GitHub, "ouvertes" | "creerIssue"> = {
    async ouvertes() {
      lectures++;
      return { inchange: false, issues: ouvertes, confirmer: () => {} };
    },
    async creerIssue(demande) {
      creees.push(demande);
      return 41 + creees.length;
    },
  };
  return { github, creees, lectures: () => lectures };
}

test("ouvert une fois : créé sur GitHub avec `fire` et son calibrage, son numéro gardé dans l'état du projet — rouvert, rien ne repart vers GitHub", async (t) => {
  const repertoireEtat = join(repertoireTemporaire(t), "etat/parade");
  const { clone } = depotGit(t);
  const { github, creees, lectures } = unGitHub([issue(3, "un autre ticket")]);
  const options = { repertoireEtat, projet: "parade", depot: "benomite/parade", base: BASE, clone, github, maintenant: () => new Date("2026-10-15T12:03:00Z") };

  assert.deepEqual(await ouvrirLaPreparation(options), { ticket: 42, ouvert: true });
  assert.equal(creees.length, 1);
  assert.equal(creees[0]?.titre, TITRE);
  assert.deepEqual(creees[0]?.labels, ["fire", "model:opus", "effort:high"]);
  assert.ok(creees[0]?.corps.startsWith(MARQUEUR));
  assert.deepEqual(lirePreparation(repertoireEtat), { ticket: 42, ouvertLe: "2026-10-15T12:03:00.000Z" });

  // Rajouté depuis l'app, ou relu après un redémarrage : le même ticket.
  assert.deepEqual(await ouvrirLaPreparation(options), { ticket: 42, ouvert: false });
  assert.equal(creees.length, 1);
  assert.equal(lectures(), 1);
});

test("créé sans avoir pu être noté : retrouvé par son marqueur parmi les issues ouvertes — seulement s'il vient de quelqu'un qui a la main sur le dépôt", async (t) => {
  const { clone } = depotGit(t);
  const etranger = unGitHub([issue(5, `${MARQUEUR}\nun inconnu`, "NONE")]);
  const ailleurs = join(repertoireTemporaire(t), "etat/parade");
  assert.deepEqual(await ouvrirLaPreparation({ repertoireEtat: ailleurs, projet: "parade", depot: "benomite/parade", base: BASE, clone, github: etranger.github }), { ticket: 42, ouvert: true });

  const repertoireEtat = join(repertoireTemporaire(t), "etat/parade");
  const { github, creees } = unGitHub([issue(3, "un autre ticket"), issue(9, `${MARQUEUR}\nle sien`)]);
  assert.deepEqual(await ouvrirLaPreparation({ repertoireEtat, projet: "parade", depot: "benomite/parade", base: BASE, clone, github }), { ticket: 9, ouvert: false });
  assert.equal(creees.length, 0);
  assert.equal(lirePreparation(repertoireEtat)?.ticket, 9);
});

test("GitHub en panne : rien n'est noté, l'erreur remonte — la station réessaiera", async (t) => {
  const repertoireEtat = join(repertoireTemporaire(t), "etat/parade");
  const { clone } = depotGit(t);
  const github: Pick<GitHub, "ouvertes" | "creerIssue"> = {
    ouvertes: async () => ({ inchange: false, issues: [], confirmer: () => {} }),
    creerIssue: async () => {
      throw new Error("gh api repos/benomite/parade/issues : HTTP 502");
    },
  };
  await assert.rejects(ouvrirLaPreparation({ repertoireEtat, projet: "parade", depot: "benomite/parade", base: BASE, clone, github }), /HTTP 502/);
  assert.equal(lirePreparation(repertoireEtat), null);
});

test("un fichier d'état illisible n'est pas un ticket", (t) => {
  const repertoireEtat = repertoireTemporaire(t);
  for (const contenu of ["", "{", '{"ticket":"7","ouvertLe":"x"}', '{"ticket":0,"ouvertLe":"x"}', '{"ticket":7}']) {
    writeFileSync(join(repertoireEtat, FICHIER), contenu);
    assert.equal(lirePreparation(repertoireEtat), null, contenu);
  }
});

test("le ticket dit, pour chaque fichier, ce que la branche d'intégration en porte déjà", (t) => {
  const { clone } = depotGit(t);
  assert.deepEqual(dejaSurLaBase(clone, BASE), { ".claude/brigade/gates.sh": false, ".claude/brigade/worktree-setup.sh": false, ".claude/brigade/reseau": false });
  mkdirSync(join(clone, ".claude/brigade"), { recursive: true });
  writeFileSync(join(clone, ".claude/brigade/gates.sh"), "#!/bin/sh\nexit 0\n");
  chmodSync(join(clone, ".claude/brigade/gates.sh"), 0o755);
  git(clone, "add", ".");
  git(clone, "commit", "-q", "-m", "gates");
  git(clone, "push", "-q", "origin", `HEAD:${BASE}`);
  git(clone, "fetch", "-q", "origin");
  assert.deepEqual(dejaSurLaBase(clone, BASE), { ".claude/brigade/gates.sh": true, ".claude/brigade/worktree-setup.sh": false, ".claude/brigade/reseau": false });
  // Une branche que l'origine n'a pas, un dossier qui n'est pas un dépôt : on ne sait pas.
  assert.deepEqual(dejaSurLaBase(clone, "nulle-part"), { ".claude/brigade/gates.sh": null, ".claude/brigade/worktree-setup.sh": null, ".claude/brigade/reseau": null });
  assert.deepEqual(Object.values(dejaSurLaBase(repertoireTemporaire(t), BASE)), [null, null, null]);

  const texte = corps({ projet: "parade", depot: "benomite/parade", base: BASE, presents: dejaSurLaBase(clone, BASE) });
  assert.match(texte, /`\.claude\/brigade\/gates\.sh` \|.*\| déjà sur `v2` : à éprouver, à corriger au besoin \|/);
  assert.match(texte, /`\.claude\/brigade\/worktree-setup\.sh` \|.*\| absent : à écrire \|/);
  assert.match(texte, /`\.claude\/brigade\/reseau` \|.*\| absent : à écrire \|/);
});

test("le ticket demande des critères observables, et que le cook les éprouve sur la station qui le cuit — pas en local", () => {
  const texte = corps({ projet: "parade", depot: "benomite/parade", base: "main", presents: {} });
  assert.match(texte, /Tant que ce ticket n'est pas mergé, aucun autre ticket du projet ne part/);
  assert.match(texte, /## Éprouver sur la station, pas en local/);
  assert.match(texte, /Éprouve la configuration ici, sur cette machine, dans ton worktree\*\* — pas sur un poste de dev/);
  const criteres = texte.split("## Critères d'acceptation")[1]?.split("\n").filter((ligne) => ligne.startsWith("- [ ] ")) ?? [];
  assert.equal(criteres.length, 4);
  assert.match(criteres[0] ?? "", /gates\.sh` passe \(code 0\) sur la station qui cuit ce ticket/);
  assert.match(criteres[1] ?? "", /worktree-setup\.sh` s'exécute sur cette station/);
  assert.match(criteres[2] ?? "", /reseau` est présent/);
  assert.deepEqual(LABELS, ["fire", "model:opus", "effort:high"]);
});

test("ouvrir.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
