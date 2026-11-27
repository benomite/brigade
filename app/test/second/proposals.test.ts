// Ce que le second propose, suivi pour la vue (#1520) : le canal du runtime tel qu'il est
// (runtime/src/second-propositions/canal.ts, #1519), un fichier par dossier de projet sous un HOME de test. Le second
// publie par le canal, la vue reçoit ; la réponse du chef l'efface ; un projet qui quitte la liste n'est plus suivi.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import * as channel from "../../../runtime/src/second-propositions/canal.ts";
import { jusqua, repertoireTemporaire } from "../../../runtime/test/outils.ts";
import { type Proposition, type Proposals, holdTheProposals } from "../../src/second/proposals.ts";

const CHOICE = { kind: "choices", choices: [{ value: "A", label: "Merge it now" }, { value: "B", label: "Wait for the review first" }] };

// Deux projets, chacun son dossier, et ce que la vue a reçu de chacun, dans l'ordre.
function trial(t: TestContext) {
  const root = repertoireTemporaire(t);
  const env = { HOME: join(root, "maison") };
  const parade = join(root, "parade");
  const cantine = join(root, "cantine");
  for (const folder of [parade, cantine]) mkdirSync(folder);
  const file = (folder: string) => channel.fichierDeProposition(folder, env);
  const receivedOnes: [string, Proposition | null][] = [];
  const heldEntries: Proposals = holdTheProposals({
    canal: { fichierDeProposition: file, suivreLaProposition: channel.suivreLaProposition, repondre: channel.repondre },
    surProposition: (project, proposal) => receivedOnes.push([project, proposal]),
  });
  t.after(() => heldEntries.arreter());
  return { tenues: heldEntries, recus: receivedOnes, parade, cantine, fichier: file };
}

test("le second publie des choix : la vue les reçoit pour son projet, et les relit telles quelles", async (t) => {
  const { tenues: heldEntries, recus: receivedOnes, parade, cantine, fichier: file } = trial(t);
  heldEntries.suivre([{ nom: "parade", dossier: parade }, { nom: "cantine", dossier: cantine }]);
  // Rien de publié : rien n'est dit à la vue.
  assert.deepEqual([...receivedOnes], []);
  assert.deepEqual(heldEntries.vu(), {});

  const published = channel.publier(file(parade), CHOICE);
  await jusqua(() => receivedOnes.length === 1);
  assert.deepEqual([...receivedOnes], [["parade", published]]);
  assert.deepEqual(heldEntries.vu(), { parade: published });

  // Une nouvelle proposition remplace la précédente ; le second passé à autre chose, la vue reçoit null.
  const next = channel.publier(file(parade), { kind: "choices", choices: [{ value: "1", label: "Yes" }] });
  await jusqua(() => receivedOnes.length === 2);
  assert.deepEqual(receivedOnes[1], ["parade", next]);
  channel.effacer(file(parade));
  await jusqua(() => receivedOnes.length === 3);
  assert.deepEqual(receivedOnes[2], ["parade", null]);
  assert.deepEqual(heldEntries.vu(), {});
});

test("la réponse du chef, d'un clic ou tapée, efface la proposition à laquelle il a répondu, et la vue l'apprend", async (t) => {
  const { tenues: heldEntries, recus: receivedOnes, parade, fichier: file } = trial(t);
  heldEntries.suivre([{ nom: "parade", dossier: parade }]);
  const first = channel.publier(file(parade), CHOICE);
  await jusqua(() => receivedOnes.length === 1);

  const rendered = heldEntries.repondre("parade", { id: first.id, by: "click", value: "B" });
  assert.equal(rendered.state, "answered");
  await jusqua(() => receivedOnes.length === 2);
  assert.deepEqual(receivedOnes[1], ["parade", null]);

  const second = channel.publier(file(parade), CHOICE);
  await jusqua(() => receivedOnes.length === 3);
  assert.equal(heldEntries.repondre("parade", { id: second.id, by: "text" }).state, "answered");
  await jusqua(() => receivedOnes.length === 4);
  assert.deepEqual(receivedOnes[3], ["parade", null]);

  // Une réponse à une proposition remplacée depuis n'efface pas la nouvelle.
  const third = channel.publier(file(parade), CHOICE);
  await jusqua(() => receivedOnes.length === 5);
  assert.equal(heldEntries.repondre("parade", { id: second.id, by: "text" }).state, "refused");
  assert.deepEqual(heldEntries.vu(), { parade: third });
  // Un projet que l'app ne suit pas n'a rien à répondre.
  assert.equal(heldEntries.repondre("fanfare", { id: third.id, by: "text" }).state, "refused");
});

test("un projet qui quitte la liste, ou ne s'ouvre plus, n'est plus suivi : la vue reçoit null pour lui", async (t) => {
  const { tenues: heldEntries, recus: receivedOnes, parade, cantine, fichier: file } = trial(t);
  heldEntries.suivre([{ nom: "parade", dossier: parade }, { nom: "cantine", dossier: cantine }]);
  const published = channel.publier(file(cantine), CHOICE);
  await jusqua(() => receivedOnes.length === 1);
  assert.deepEqual(receivedOnes[0], ["cantine", published]);

  heldEntries.suivre([{ nom: "parade", dossier: parade }, { nom: "cantine", dossier: cantine, refus: "its folder is gone" }]);
  assert.deepEqual(receivedOnes[1], ["cantine", null]);
  assert.deepEqual(heldEntries.vu(), {});
  // Revenu dans la liste, son suivi reprend la proposition en cours.
  heldEntries.suivre([{ nom: "parade", dossier: parade }, { nom: "cantine", dossier: cantine }]);
  assert.deepEqual(receivedOnes[2], ["cantine", published]);
  assert.deepEqual(heldEntries.vu(), { cantine: published });
});
