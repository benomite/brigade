// Le « yes » ou le « no » du chef sur un profil proposé, joué comme un geste du rail (`trancherLeProfil`,
// profils/decision.ts) : c'est ce que la box joue pour `/brigade profile yes|no <proposition>`, posté sur le tableau
// de la cuisine — la carte de la file, dans l'app, le poste là. Fait, avec ce qu'il a écrit ; ou refusé, la raison
// dite, et rien n'est écrit.
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { saveCarnet } from "../../src/carnet/carnet.ts";
import { principal as facts } from "../../src/faits.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { trancherLeProfil } from "../../src/profils/decision.ts";
import { PROFILS_DIR } from "../../src/profils/definition.ts";
import { proposerLesProfils } from "../../src/profils/proposer.ts";
import { lireReglagesDesProfils } from "../../src/profils/reglages.ts";
import { appeler, horloge, repertoireTemporaire } from "../outils.ts";
import { PROJET, servir, tickets } from "./servir.ts";

// Vingt tickets servis : `app/src/vue` en porte cinq, livrés du premier coup 20 points sous le projet.
const VINGT_POINTS = [...tickets(1, 5, 3, ["app/src/vue"]), ...tickets(6, 15, 13, ["runtime/src"])];

// Un état et un dépôt de projet où un profil attend le chef ; rend son numéro.
function proposee(t: TestContext) {
  const etat = repertoireTemporaire(t);
  const repoDir = repertoireTemporaire(t);
  saveCarnet(repoDir, { lessons: [] });
  const journal = ouvrirJournal(etat, { maintenant: horloge() });
  try {
    for (const service of VINGT_POINTS) servir(journal, service);
    const [une] = proposerLesProfils({ journal, projet: PROJET, reglages: lireReglagesDesProfils({}), repoDir });
    assert.ok(une);
    return { etat, repoDir, proposition: une.seq };
  } finally {
    journal.fermer();
  }
}

function trancher(etat: string, repoDir: string, proposition: number, reponse: "yes" | "no") {
  const journal = ouvrirJournal(etat);
  try {
    return trancherLeProfil({ journal, projet: PROJET, repoDir }, proposition, reponse);
  } finally {
    journal.fermer();
  }
}

async function enAttente(etat: string): Promise<unknown> {
  const appel = appeler(facts, [], { BRIGADE_STATE_DIR: etat });
  assert.equal(await appel.fin, 0, appel.sortie());
  return (JSON.parse(appel.sortie()) as { profils?: unknown }).profils;
}

const definitions = (repoDir: string) => (existsSync(join(repoDir, PROFILS_DIR)) ? readdirSync(join(repoDir, PROFILS_DIR)) : []);

test("« yes » écrit la définition du profil dans le dépôt du projet, et la proposition quitte `facts` ; un second « yes » est refusé, sans rien écrire de plus", async (t) => {
  const { etat, repoDir, proposition } = proposee(t);
  assert.deepEqual(definitions(repoDir), []);
  assert.equal((await enAttente(etat)) instanceof Array, true);

  assert.deepEqual(trancher(etat, repoDir, proposition, "yes"), {
    done: true,
    price: `none on the quota: the definition of app-src-vue is written to ${PROFILS_DIR}/app-src-vue.md, in the project's repository`,
  });
  assert.deepEqual(definitions(repoDir), ["app-src-vue.md"]);
  assert.equal(await enAttente(etat), undefined);

  const encore = trancher(etat, repoDir, proposition, "yes");
  assert.equal(encore.done, false);
  assert.match(encore.done ? "" : encore.reason, /^this profile was already answered “yes”$/);
  assert.deepEqual(definitions(repoDir), ["app-src-vue.md"]);
});

test("« no » fait quitter `facts` à la proposition, sans rien écrire dans le dépôt", async (t) => {
  const { etat, repoDir, proposition } = proposee(t);
  assert.deepEqual(trancher(etat, repoDir, proposition, "no"), { done: true, price: "none: app-src-vue leaves the queue" });
  assert.equal(await enAttente(etat), undefined);
  assert.deepEqual(definitions(repoDir), []);
});

test("rien n'est écrit — une proposition inconnue, un profil que le dépôt définit déjà : refusé, la raison dite", async (t) => {
  const { etat, repoDir, proposition } = proposee(t);
  assert.deepEqual(trancher(etat, repoDir, 999999, "yes"), { done: false, reason: "no cook profile is proposed under 999999", price: "none: nothing was changed" });

  // Le même profil, déjà défini dans le dépôt par une autre proposition acceptée : celle-ci attend toujours.
  const autre = proposee(t);
  assert.equal(trancher(autre.etat, repoDir, autre.proposition, "yes").done, true);
  const existe = trancher(etat, repoDir, proposition, "yes");
  assert.equal(existe.done, false);
  assert.match(existe.done ? "" : existe.reason, /already defines this profile \(\.claude\/brigade\/profils\/app-src-vue\.md\): nothing is written, the proposal still waits$/);
  assert.equal((await enAttente(etat)) instanceof Array, true);
});
