// Un `blocked-on-human` ne se pose qu'avec la question écrite sur la carte, et
// chaque cas sans question est compté (#2556).
import assert from "node:assert/strict";
import { test } from "node:test";
import { A_LA_MAIN } from "../src/brigade-github.ts";
import { lireBlocagesSansQuestion, poserALaMain } from "../src/blocages-sans-question.ts";
import { principal as faits } from "../src/faits.ts";
import { principal as status } from "../src/status.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { appeler, repertoireTemporaire } from "./outils.ts";

function github() {
  const gestes: string[] = [];
  return {
    gestes,
    commenter: async (numero: number, texte: string) => void gestes.push(`comment #${numero}: ${texte}`),
    labelliser: async (numero: number, labels: string[]) => void gestes.push(`label #${numero}: ${labels.join(",")}`),
  };
}

test("avec une question, elle est écrite sur la carte avant le label, et rien n'est compté", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const gh = github();

  const pose = await poserALaMain({ github: gh, repertoireEtat: repertoire }, 12, "Which of the two layouts do you want?");

  assert.deepEqual(pose, { pose: true });
  assert.deepEqual(gh.gestes, ["comment #12: Which of the two layouts do you want?", `label #12: ${A_LA_MAIN}`]);
  assert.equal(lireBlocagesSansQuestion(repertoire), 0);
});

test("sans question, vide ou blanche, le label n'est pas posé et chaque cas s'ajoute au compte", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const gh = github();

  const premiere = await poserALaMain({ github: gh, repertoireEtat: repertoire }, 12, "");
  const seconde = await poserALaMain({ github: gh, repertoireEtat: repertoire }, 13, "  \n ");
  const absente = await poserALaMain({ github: gh, repertoireEtat: repertoire }, 14, undefined);

  for (const pose of [premiere, seconde, absente]) assert.equal(pose.pose, false);
  assert.deepEqual(gh.gestes, []);
  assert.equal(lireBlocagesSansQuestion(repertoire), 3);
});

test("le compte survit au process : un fichier illisible vaut zéro", async (t) => {
  const repertoire = repertoireTemporaire(t);
  await poserALaMain({ github: github(), repertoireEtat: repertoire }, 1, null);
  assert.equal(lireBlocagesSansQuestion(repertoire), 1);
  assert.equal(lireBlocagesSansQuestion(undefined), 0);
  assert.equal(lireBlocagesSansQuestion(`${repertoire}/absent`), 0);
});

test("les faits du projet portent blockedWithoutQuestion, l'entier courant, et status le dit", async (t) => {
  const repertoire = repertoireTemporaire(t);
  ouvrirJournal(repertoire).fermer();

  const avant = appeler(faits, [], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await avant.fin, 0);
  assert.equal(JSON.parse(avant.sortie()).blockedWithoutQuestion, 0);

  await poserALaMain({ github: github(), repertoireEtat: repertoire }, 5, "");
  await poserALaMain({ github: github(), repertoireEtat: repertoire }, 6, "");

  const apres = appeler(faits, [], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await apres.fin, 0);
  assert.equal(JSON.parse(apres.sortie()).blockedWithoutQuestion, 2);

  const photo = appeler(status, [], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await photo.fin, 0);
  assert.match(photo.sortie(), /^blocked w\/o q 2$/m);
});
