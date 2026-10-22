// Les appels de la box à GitHub, comptés par projet et par sorte de lecture, sur l'heure glissante.
import assert from "node:assert/strict";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { decrireEtat, faits, lireEtat } from "../src/etat.ts";
import { ouvrirGitHub } from "../src/github.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { appelsDeLaStation, direLesAppels, FENETRE_MS, lectureDe, limiteDeLaStation, ouvrirLimite } from "../src/limite-github.ts";
import { aArreter, repertoireTemporaire } from "./outils.ts";

test("la sorte de lecture se lit dans le chemin de l'appel ; un geste est un geste", () => {
  assert.equal(lectureDe(["repos/o/r/issues/12/comments?per_page=100"]), "issue-comments");
  assert.equal(lectureDe(["repos/o/r/pulls/12"]), "pull-requests");
  assert.equal(lectureDe(["repos/o/r/issues?state=open"]), "issues");
  assert.equal(lectureDe(["-X", "PATCH", "/gists/abc", "--input", "-"]), "gist");
  assert.equal(lectureDe(["rate_limit"]), "other");
  assert.equal(lectureDe(["repos/o/r/pulls/12/merge"], "geste"), "gesture");
});

test("un mélange connu d'appels sur deux projets : le total et le plus gros projet et la plus grosse lecture sont exacts ; l'heure passée, ils sortent", () => {
  let instant = 1_000_000;
  const limite = ouvrirLimite({ maintenant: () => instant });
  const prendre = (projet: string, lecture: "issues" | "gist" | "issue-comments", n: number) => {
    for (let i = 0; i < n; i++) limite.prendre("cuisine", undefined, { projet, lecture });
  };
  prendre("alpha", "issues", 3);
  prendre("alpha", "issue-comments", 1);
  prendre("beta", "issues", 2);
  prendre("beta", "gist", 1);
  const r = limite.repartition();
  assert.equal(r.total, 7);
  assert.deepEqual(r.parProjet, [
    { nom: "alpha", appels: 4 },
    { nom: "beta", appels: 3 },
  ]);
  assert.deepEqual(r.parLecture[0], { nom: "issues", appels: 5 });
  assert.deepEqual(direLesAppels(r), ["7 calls in the last hour", "most calls: project alpha (4), kind issues (5)"]);

  instant += FENETRE_MS + 1;
  assert.equal(limite.repartition().total, 0);
  limite.fermer();
});

// Un faux `gh` qui note chaque appel et rend une liste vide.
function unGh(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const bin = join(repertoire, "gh");
  writeFileSync(bin, ["#!/bin/sh", 'echo "$*" >> "$(dirname "$0")/appels"', "printf 'HTTP/2.0 200\\r\\n\\r\\n[]'", ""].join("\n"));
  chmodSync(bin, 0o755);
  const fichier = join(repertoire, "appels");
  return { bin, nombre: () => (existsSync(fichier) ? readFileSync(fichier, "utf8").split("\n").filter(Boolean).length : 0) };
}

test("deux GitHub, deux projets, un faux gh : `status` et les faits de l'app disent le même total, le même projet et la même lecture en tête ; l'heure passée, ils sortent", async (t) => {
  const gh = unGh(t);
  const station = repertoireTemporaire(t);
  let instant = Date.parse("2026-10-15T12:00:00Z");
  const maintenant = () => instant;
  const limite = limiteDeLaStation(station, { maintenant });
  aArreter(t, () => limite.fermer());
  const alpha = ouvrirGitHub({ depot: "o/alpha", bin: gh.bin, limite, projet: "alpha", maintenant });
  const beta = ouvrirGitHub({ depot: "o/beta", bin: gh.bin, limite, projet: "beta", maintenant });
  const gestes = ouvrirGitHub({ depot: "o/beta", bin: gh.bin, limite, projet: "beta", usage: "geste", maintenant });
  aArreter(t, () => {
    alpha.fermer();
    beta.fermer();
    gestes.fermer();
  });

  // alpha : 4 sondages d'issues, 1 lecture de commentaires.
  for (let i = 0; i < 4; i++) await alpha.tickets();
  await alpha.commentaires(7);
  // beta : 2 sondages d'issues, 1 lecture de PR, et un geste (son chemin n'y change rien).
  for (let i = 0; i < 2; i++) await beta.ouvertes();
  await beta.prDeBranche("cook/1");
  await gestes.prDeBranche("cook/2");
  assert.equal(gh.nombre(), 9);

  const appels = appelsDeLaStation(station, instant);
  assert.ok(appels);
  assert.deepEqual(direLesAppels(appels), ["9 calls in the last hour", "most calls: project alpha (5), kind issues (6)"]);

  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: () => new Date(instant) });
  aArreter(t, () => journal.fermer());
  const etat = lireEtat(journal, new Date(instant));
  const lignes = decrireEtat(etat, new Date(instant), undefined, null, appels);
  assert.ok(lignes.some((l) => l.includes("gh calls") && l.includes("9 calls in the last hour")));
  assert.ok(lignes.some((l) => l.includes("most calls: project alpha (5), kind issues (6)")));

  const lus = faits(etat, new Date(instant), undefined, null, null, appels).appelsGithub;
  assert.deepEqual(lus, {
    total: 9,
    topProject: { name: "alpha", calls: 5 },
    topKind: { name: "issues", calls: 6 },
    byProject: [
      { name: "alpha", calls: 5 },
      { name: "beta", calls: 4 },
    ],
    byKind: [
      { name: "issues", calls: 6 },
      { name: "gesture", calls: 1 },
      { name: "issue-comments", calls: 1 },
      { name: "pull-requests", calls: 1 },
    ],
  });

  instant += FENETRE_MS + 1;
  assert.equal(appelsDeLaStation(station, instant)?.total, 0);
});
