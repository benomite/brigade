// Ce que le second propose, suivi pour la vue (#1520) : le canal du runtime tel qu'il est
// (runtime/src/second-propositions/canal.ts, #1519), un fichier par dossier de projet sous un HOME de test. Le second
// publie par le canal, la vue reçoit ; la réponse du chef l'efface ; un projet qui quitte la liste n'est plus suivi.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import * as canal from "../../../runtime/src/second-propositions/canal.ts";
import { jusqua, repertoireTemporaire } from "../../../runtime/test/outils.ts";
import { type Proposition, type Propositions, tenirLesPropositions } from "../../src/second/propositions.ts";

const CHOIX = { kind: "choices", choices: [{ value: "A", label: "Merge it now" }, { value: "B", label: "Wait for the review first" }] };

// Deux projets, chacun son dossier, et ce que la vue a reçu de chacun, dans l'ordre.
function essai(t: TestContext) {
  const racine = repertoireTemporaire(t);
  const env = { HOME: join(racine, "maison") };
  const parade = join(racine, "parade");
  const cantine = join(racine, "cantine");
  for (const dossier of [parade, cantine]) mkdirSync(dossier);
  const fichier = (dossier: string) => canal.fichierDeProposition(dossier, env);
  const recus: [string, Proposition | null][] = [];
  const tenues: Propositions = tenirLesPropositions({
    canal: { fichierDeProposition: fichier, suivreLaProposition: canal.suivreLaProposition, repondre: canal.repondre },
    surProposition: (projet, proposition) => recus.push([projet, proposition]),
  });
  t.after(() => tenues.arreter());
  return { tenues, recus, parade, cantine, fichier };
}

test("le second publie des choix : la vue les reçoit pour son projet, et les relit telles quelles", async (t) => {
  const { tenues, recus, parade, cantine, fichier } = essai(t);
  tenues.suivre([{ nom: "parade", dossier: parade }, { nom: "cantine", dossier: cantine }]);
  // Rien de publié : rien n'est dit à la vue.
  assert.deepEqual([...recus], []);
  assert.deepEqual(tenues.vu(), {});

  const publiee = canal.publier(fichier(parade), CHOIX);
  await jusqua(() => recus.length === 1);
  assert.deepEqual([...recus], [["parade", publiee]]);
  assert.deepEqual(tenues.vu(), { parade: publiee });

  // Une nouvelle proposition remplace la précédente ; le second passé à autre chose, la vue reçoit null.
  const suivante = canal.publier(fichier(parade), { kind: "choices", choices: [{ value: "1", label: "Yes" }] });
  await jusqua(() => recus.length === 2);
  assert.deepEqual(recus[1], ["parade", suivante]);
  canal.effacer(fichier(parade));
  await jusqua(() => recus.length === 3);
  assert.deepEqual(recus[2], ["parade", null]);
  assert.deepEqual(tenues.vu(), {});
});

test("la réponse du chef, d'un clic ou tapée, efface la proposition à laquelle il a répondu, et la vue l'apprend", async (t) => {
  const { tenues, recus, parade, fichier } = essai(t);
  tenues.suivre([{ nom: "parade", dossier: parade }]);
  const premiere = canal.publier(fichier(parade), CHOIX);
  await jusqua(() => recus.length === 1);

  const rendu = tenues.repondre("parade", { id: premiere.id, by: "click", value: "B" });
  assert.equal(rendu.state, "answered");
  await jusqua(() => recus.length === 2);
  assert.deepEqual(recus[1], ["parade", null]);

  const seconde = canal.publier(fichier(parade), CHOIX);
  await jusqua(() => recus.length === 3);
  assert.equal(tenues.repondre("parade", { id: seconde.id, by: "text" }).state, "answered");
  await jusqua(() => recus.length === 4);
  assert.deepEqual(recus[3], ["parade", null]);

  // Une réponse à une proposition remplacée depuis n'efface pas la nouvelle.
  const troisieme = canal.publier(fichier(parade), CHOIX);
  await jusqua(() => recus.length === 5);
  assert.equal(tenues.repondre("parade", { id: seconde.id, by: "text" }).state, "refused");
  assert.deepEqual(tenues.vu(), { parade: troisieme });
  // Un projet que l'app ne suit pas n'a rien à répondre.
  assert.equal(tenues.repondre("fanfare", { id: troisieme.id, by: "text" }).state, "refused");
});

test("un projet qui quitte la liste, ou ne s'ouvre plus, n'est plus suivi : la vue reçoit null pour lui", async (t) => {
  const { tenues, recus, parade, cantine, fichier } = essai(t);
  tenues.suivre([{ nom: "parade", dossier: parade }, { nom: "cantine", dossier: cantine }]);
  const publiee = canal.publier(fichier(cantine), CHOIX);
  await jusqua(() => recus.length === 1);
  assert.deepEqual(recus[0], ["cantine", publiee]);

  tenues.suivre([{ nom: "parade", dossier: parade }, { nom: "cantine", dossier: cantine, refus: "its folder is gone" }]);
  assert.deepEqual(recus[1], ["cantine", null]);
  assert.deepEqual(tenues.vu(), {});
  // Revenu dans la liste, son suivi reprend la proposition en cours.
  tenues.suivre([{ nom: "parade", dossier: parade }, { nom: "cantine", dossier: cantine }]);
  assert.deepEqual(recus[2], ["cantine", publiee]);
  assert.deepEqual(tenues.vu(), { cantine: publiee });
});
