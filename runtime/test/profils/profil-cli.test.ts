// La commande `profile` : le chef voit les profils proposés et les tranche d'un « yes » ou d'un « no »
// (profil-cli.ts, par `decider`). C'est elle que lance la carte de la file, dans l'app — `brigade <projet>
// profile yes|no <proposition>` —, qui lit ses codes : 0, la réponse est écrite ; 1, rien ne l'est, la
// raison sur la dernière ligne ; 2, l'appel ne se lit pas.
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { saveCarnet } from "../../src/carnet/carnet.ts";
import { principal as facts } from "../../src/faits.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { principal as profile } from "../../src/profil-cli.ts";
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
    return { env: { BRIGADE_STATE_DIR: etat, BRIGADE_REPO_DIR: repoDir }, repoDir, proposition: une.seq };
  } finally {
    journal.fermer();
  }
}

async function jouer(args: string[], env: Record<string, string>) {
  const appel = appeler(profile, args, env);
  const code = await appel.fin;
  return { code, lignes: appel.sortie().trimEnd().split("\n") };
}

async function enAttente(env: Record<string, string>): Promise<unknown> {
  const appel = appeler(facts, [], env);
  assert.equal(await appel.fin, 0, appel.sortie());
  return (JSON.parse(appel.sortie()) as { profils?: unknown }).profils;
}

const definitions = (repoDir: string) => (existsSync(join(repoDir, PROFILS_DIR)) ? readdirSync(join(repoDir, PROFILS_DIR)) : []);

test("sans argument, `profile` montre les profils qui attendent le chef, par leur numéro ; sans proposition, il le dit", async (t) => {
  const { env, proposition } = proposee(t);
  assert.deepEqual(await jouer([], env), { code: 0, lignes: [`${proposition}  app-src-vue  for app/src/vue`] });
  await jouer(["no", String(proposition)], env);
  assert.deepEqual(await jouer([], env), { code: 0, lignes: ["no cook profile is proposed"] });
});

test("« yes » écrit la définition du profil dans le dépôt du projet, et la proposition quitte `facts` ; un second « yes » n'écrit rien de plus", async (t) => {
  const { env, repoDir, proposition } = proposee(t);
  assert.deepEqual(definitions(repoDir), []);
  assert.equal((await enAttente(env)) instanceof Array, true);

  const oui = await jouer(["yes", String(proposition)], env);
  assert.equal(oui.code, 0, oui.lignes.join("\n"));
  assert.equal(oui.lignes.at(-1), `“yes” to app-src-vue: its definition is written to ${PROFILS_DIR}/app-src-vue.md`);
  assert.deepEqual(definitions(repoDir), ["app-src-vue.md"]);
  assert.equal(await enAttente(env), undefined);

  const encore = await jouer(["yes", String(proposition)], env);
  assert.equal(encore.code, 0);
  assert.match(encore.lignes.at(-1) ?? "", /^already answered — “yes” to app-src-vue/);
  assert.deepEqual(definitions(repoDir), ["app-src-vue.md"]);
});

test("« no » fait quitter `facts` à la proposition, sans rien écrire dans le dépôt", async (t) => {
  const { env, repoDir, proposition } = proposee(t);
  const non = await jouer(["no", String(proposition)], env);
  assert.equal(non.code, 0, non.lignes.join("\n"));
  assert.equal(non.lignes.at(-1), "“no” to app-src-vue: the proposal leaves the queue");
  assert.equal(await enAttente(env), undefined);
  assert.deepEqual(definitions(repoDir), []);
});

test("rien n'est écrit — une proposition inconnue, un profil que le dépôt définit déjà : 1, la raison sur la dernière ligne", async (t) => {
  const { env, repoDir, proposition } = proposee(t);
  const inconnue = await jouer(["yes", "999999"], env);
  assert.equal(inconnue.code, 1);
  assert.equal(inconnue.lignes.at(-1), "brigade: no cook profile is proposed under 999999");

  // Le même profil, déjà défini dans le dépôt par une autre proposition acceptée : celle-ci attend toujours.
  const autre = proposee(t);
  assert.equal((await jouer(["yes", String(autre.proposition)], { ...autre.env, BRIGADE_REPO_DIR: repoDir })).code, 0);
  const existe = await jouer(["yes", String(proposition)], env);
  assert.equal(existe.code, 1);
  assert.match(existe.lignes.at(-1) ?? "", /already defines this profile \(\.claude\/brigade\/profils\/app-src-vue\.md\): nothing is written, the proposal still waits$/);
  assert.equal((await enAttente(env)) instanceof Array, true);
});

test("un appel qui ne se lit pas : 2, l'usage, et rien n'est écrit", async (t) => {
  const { env, repoDir, proposition } = proposee(t);
  for (const [args, sans] of [[["maybe", String(proposition)]], [["yes"]], [["yes", "x"]], [["yes", String(proposition), "encore"]], [["yes", String(proposition)], "BRIGADE_REPO_DIR"]] as const) {
    const essai = await jouer([...args], sans === undefined ? env : { BRIGADE_STATE_DIR: env.BRIGADE_STATE_DIR });
    assert.equal(essai.code, 2, args.join(" "));
    assert.match(essai.lignes.join("\n"), /run profile\b/);
  }
  assert.deepEqual(definitions(repoDir), []);
  assert.equal((await enAttente(env)) instanceof Array, true);
});
