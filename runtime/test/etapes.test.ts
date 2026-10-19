// Les étapes de l'installation d'un projet : une liste fixe, dans son ordre,
// lisible avant que la première soit lancée ; leur état au journal du projet,
// qui survit au redémarrage du runtime ; et l'étape courante, la première qui
// n'est pas faite.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { principal } from "../src/etapes-cli.ts";
import { ETAPES, installationDe, noterEtape } from "../src/etapes.ts";
import { openLog } from "../src/log.ts";
import { appeler, BASE, DEPOT, ENV_GIT, FAUX_CLAUDE, fauxGh, git, lancer, repertoireTemporaire } from "./outils.ts";

const MAIN = join(import.meta.dirname, "../src/main.ts");
const INSTALLATION = join(import.meta.dirname, "../src/installation-cli.ts");
const ORDRE = ["ajout", "init", "verification", "stations", "protection", "decisions", "demarrage"];

async function lire(repertoire: string) {
  const appel = appeler(principal, ["--json"], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await appel.fin, 0, appel.sortie());
  return JSON.parse(appel.sortie()) as { courante: string | null; etapes: Array<{ id: string; titre: string; etat: string; sert: string; sauter: string; geste: string | null }> };
}

async function noter(repertoire: string, etape: string, etat: string, env: Record<string, string> = { BRIGADE_PROJECT: "espace" }) {
  const appel = appeler(principal, [etape, etat], { BRIGADE_STATE_DIR: repertoire, ...env });
  return { code: await appel.fin, sortie: appel.sortie() };
}

test("avant la première étape, la lecture rend toutes les étapes, dans leur ordre, à faire — sans créer de journal", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const lue = await lire(repertoire);
  assert.deepEqual(lue.etapes.map((etape) => etape.id), ORDRE);
  assert.deepEqual(lue.etapes.map((etape) => etape.etat), ORDRE.map(() => "à faire"));
  assert.equal(lue.courante, "ajout");
  assert.equal(existsSync(join(repertoire, "log.db")), false);
});

test("chaque étape dit, en une phrase non vide, à quoi elle sert et ce qui se passe si on la saute", async (t) => {
  const { etapes } = await lire(repertoireTemporaire(t));
  assert.equal(etapes.length, ETAPES.length);
  assert.equal(new Set(etapes.map((etape) => etape.id)).size, etapes.length);
  for (const etape of etapes) {
    assert.ok(etape.titre.trim() !== "", etape.id);
    assert.ok(etape.sert.trim() !== "", etape.id);
    assert.ok(etape.sauter.trim() !== "", etape.id);
    assert.notEqual(etape.sert, etape.sauter, etape.id);
    assert.ok(etape.geste === null || etape.geste.trim() !== "", etape.id);
  }
  // L'amorçage du dépôt est une conversation, puis un merge : deux gestes du chef.
  assert.match(etapes.find((etape) => etape.id === "init")?.geste ?? "", /\/brigade:init/);
});

test("la forme JSON est un contrat : ses champs, leur ordre, ses mots", async (t) => {
  const repertoire = repertoireTemporaire(t);
  await noter(repertoire, "ajout", "faite");
  await noter(repertoire, "init", "en-attente");
  const lue = await lire(repertoire);
  assert.deepEqual(Object.keys(lue), ["courante", "etapes"]);
  for (const etape of lue.etapes) assert.deepEqual(Object.keys(etape), ["id", "titre", "etat", "sert", "sauter", "geste"]);
  assert.deepEqual(lue.etapes.slice(0, 3).map((etape) => [etape.id, etape.etat]), [["ajout", "faite"], ["init", "en attente"], ["verification", "à faire"]]);
});

test("l'étape courante est la première qui n'est pas faite — en attente du chef, elle le reste", async (t) => {
  const repertoire = repertoireTemporaire(t);
  assert.equal((await noter(repertoire, "ajout", "faite")).code, 0);
  assert.equal((await lire(repertoire)).courante, "init");
  await noter(repertoire, "init", "en-attente");
  assert.equal((await lire(repertoire)).courante, "init");
  // Une étape faite plus loin ne déplace pas la courante : celles d'avant restent à faire.
  await noter(repertoire, "stations", "faite");
  assert.equal((await lire(repertoire)).courante, "init");
  await noter(repertoire, "init", "faite");
  assert.equal((await lire(repertoire)).courante, "verification");
  // Remise à faire, une étape redevient la courante.
  await noter(repertoire, "ajout", "a-faire");
  assert.equal((await lire(repertoire)).courante, "ajout");
  // Toutes notées sauf la dernière : elle seule reste la courante. Elle ne se
  // note pas sur parole — la vérification la termine (`installation.test.ts`).
  for (const etape of ORDRE.slice(0, -1)) await noter(repertoire, etape, "faite");
  const presque = await lire(repertoire);
  assert.equal(presque.courante, "demarrage");
  assert.deepEqual(presque.etapes.map((etape) => etape.id), ORDRE);
});

test("noter une étape écrit un fait au journal, une fois : la même note ne réécrit rien", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const premiere = await noter(repertoire, "ajout", "faite");
  assert.match(premiere.sortie, /« Ajouter le projet sur la box » notée faite/);
  const seconde = await noter(repertoire, "ajout", "faite");
  assert.equal(seconde.code, 0);
  assert.match(seconde.sortie, /déjà faite — rien n'est écrit/);
  // Une étape jamais notée est à faire : l'y remettre ne s'écrit pas.
  assert.match((await noter(repertoire, "init", "a-faire")).sortie, /déjà à faire/);
  const log = openLog(repertoire, { lectureSeule: true });
  try {
    assert.deepEqual(
      log.tout().map((e) => [e.type, e.project, e.author, e.payload]),
      [["installation.step", "espace", "chef", { step: "ajout", state: "done", previous: "todo" }]],
    );
  } finally {
    log.fermer();
  }
});

test("une étape inconnue, un état inconnu sont refusés sans rien écrire ; sans journal ni projet, rien n'est noté", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const inconnue = await noter(repertoire, "mise-en-service", "faite");
  assert.equal(inconnue.code, 2);
  assert.match(inconnue.sortie, /n'est pas une étape de l'installation — attendu ajout, init, verification/);
  assert.equal((await noter(repertoire, "ajout", "finie")).code, 2);
  assert.equal((await noter(repertoire, "ajout", "faite", {})).code, 1);
  assert.equal(existsSync(join(repertoire, "log.db")), false);
  assert.equal((await appeler(principal, [], {}).fin), 2);
});

test("une étape notée par une version plus récente, que ce runtime ne connaît pas, est ignorée", (t) => {
  const repertoire = repertoireTemporaire(t);
  const log = openLog(repertoire);
  try {
    log.ajouter({ project: "espace", ticket: null, author: "chef", type: "installation.step", payload: { step: "plus-tard", state: "done", previous: "todo" } });
    noterEtape(log, { projet: "espace", etape: "ajout", etat: "done", auteur: "chef" });
    assert.throws(() => noterEtape(log, { projet: "espace", etape: "plus-tard", etat: "done", auteur: "chef" }), /n'est pas une étape/);
  } finally {
    log.fermer();
  }
  const lue = installationDe(repertoire);
  assert.deepEqual(lue.etapes.map((etape) => etape.id), ORDRE);
  assert.equal(lue.courante, "init");
});

// L'environnement d'un runtime complet, sur un dépôt sans ticket : aucun test
// ne touche le réseau, et aucun cook ne part.
function environnement(t: TestContext, repertoire: string) {
  const gh = fauxGh(t);
  gh.issues([]);
  const clone = repertoireTemporaire(t);
  git(clone, "init", "-q");
  return {
    ...ENV_GIT,
    BRIGADE_STATE_DIR: repertoire,
    BRIGADE_PROJECT: "espace",
    BRIGADE_GITHUB_REPO: DEPOT,
    BRIGADE_GH_BIN: gh.bin,
    BRIGADE_REPO_DIR: clone,
    BRIGADE_BASE_BRANCH: BASE,
    BRIGADE_CLAUDE_BIN: FAUX_CLAUDE,
    BRIGADE_STATIONS: "box/claude:1:code",
    BRIGADE_MANAGER_MODEL: "sonnet",
    BRIGADE_MANAGER_EFFORT: "medium",
    BRIGADE_REVIEWER_MODEL: "sonnet",
    BRIGADE_REVIEWER_EFFORT: "medium",
    BRIGADE_MAX_LOAD_PER_CORE: "1000000",
    BRIGADE_MIN_FREE_MEMORY_MB: "0",
    BRIGADE_MIN_FREE_DISK_MB: "0",
  };
}

test("après le redémarrage du runtime, la même lecture rend les mêmes états : les faites le restent, la courante est la première non faite", async (t) => {
  const repertoire = repertoireTemporaire(t);
  // L'installation précède le premier démarrage : le journal naît de la première note.
  await noter(repertoire, "ajout", "faite");
  await noter(repertoire, "init", "faite");
  await noter(repertoire, "verification", "en-attente");
  const avant = await lire(repertoire);
  assert.equal(avant.courante, "verification");

  const env = environnement(t, repertoire);
  const premier = lancer(t, MAIN, [], env);
  await premier.attendre("démarré");
  // Pendant qu'il tourne, la lecture est la même.
  assert.deepEqual(await lire(repertoire), avant);
  premier.process.kill("SIGTERM");
  assert.equal(await premier.fin, 0, premier.sortie());

  // Arrêté net, puis relancé : rien de ce qui était noté ne s'est perdu.
  const second = lancer(t, MAIN, [], env);
  await second.attendre("démarré");
  second.process.kill("SIGKILL");
  await second.fin;
  const troisieme = lancer(t, MAIN, [], env);
  await troisieme.attendre("démarré");
  assert.deepEqual(await lire(repertoire), avant);

  // Lue par la commande du chef, dans son propre process : `installation etapes`.
  const commande = lancer(t, INSTALLATION, ["etapes", "--json"], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await commande.fin, 0, commande.sortie());
  assert.deepEqual(JSON.parse(commande.sortie()), avant);

  // Le chef reprend où il en était : l'étape en attente faite, la courante avance.
  const reprise = lancer(t, INSTALLATION, ["etapes", "verification", "faite"], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await reprise.fin, 0, reprise.sortie());
  troisieme.process.kill("SIGTERM");
  assert.equal(await troisieme.fin, 0, troisieme.sortie());
  const apres = await lire(repertoire);
  assert.equal(apres.courante, "stations");
  assert.deepEqual(apres.etapes.map((etape) => etape.etat), ["faite", "faite", "faite", "à faire", "à faire", "à faire", "à faire"]);
});

test("rejouer le journal ne change rien aux étapes : leur état ne vit que dans ses faits", (t) => {
  const repertoire = repertoireTemporaire(t);
  const log = openLog(repertoire);
  try {
    noterEtape(log, { projet: "espace", etape: "ajout", etat: "done", auteur: "chef" });
    noterEtape(log, { projet: "espace", etape: "init", etat: "waiting", auteur: "chef" });
    const avant = installationDe(repertoire);
    log.reconstruire();
    assert.deepEqual(installationDe(repertoire), avant);
  } finally {
    log.fermer();
  }
});

test("la lecture pour le chef dit l'étape courante, et pour chaque étape à quoi elle sert, si on la saute, et le geste qui reste à lui", async (t) => {
  const repertoire = repertoireTemporaire(t);
  await noter(repertoire, "ajout", "faite");
  const appel = appeler(principal, [], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await appel.fin, 0);
  const texte = appel.sortie();
  assert.match(texte, /1 étape faite sur 7 — la courante : 2\. Amorcer le dépôt/);
  assert.match(texte, / 2\. à faire    → Amorcer le dépôt \(init\)/);
  assert.equal(texte.match(/à quoi elle sert : /g)?.length, 7);
  assert.equal(texte.match(/si tu la sautes  : /g)?.length, 7);
  assert.match(texte, /à faire toi-même : Taper `\/brigade:init`/);
});
