// Les blocages d'un projet, tenus dans un vrai journal : posés, listés, levés,
// jamais en double — et jamais la sortie brute d'une commande comme message.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ouvrirJournal } from "../../../src/journal.ts";
import {
  blocage,
  BlocageInvalide,
  blocagesDuJournal,
  CAUSE_DE_REPLI,
  DETAIL_MAX,
  estUneSortieBrute,
  leverBlocage,
  leverBlocageDans,
  lireBlocages,
  MESSAGE_DE_REPLI,
  poserBlocage,
  poserBlocageDans,
  type NouveauBlocage,
} from "../../../src/installation/blocages/blocages.ts";
import { lireLEchecDuClone, type Enquete } from "../../../src/projets/echec-du-clone.ts";
import { repertoireTemporaire, temporaireDuFichier } from "../../outils.ts";

const rienNeReste = temporaireDuFichier();

const QUI = { projet: "mirrorscreen", auteur: "station:box" };

const CLONE: NouveauBlocage = {
  id: "clone",
  message: "box cannot clone BOBL-tech/mirrorscreen.",
  cause: "Its git settings send GitHub addresses to ssh, which refuses it.",
  detail: "Host key verification failed.\nfatal: Could not read from remote repository.",
};
const POSTGRES: NouveauBlocage = {
  id: "need:postgres",
  message: "The tests of mirrorscreen need a Postgres that box does not have.",
  cause: "The worktree setup runs psql against a local database.",
  action: "choose-station",
};
const JETONS: NouveauBlocage = {
  id: "token",
  message: "The token of brigade-cook does not include BOBL-tech/mirrorscreen.",
  cause: "A fine-grained token only covers the repositories chosen for it.",
  link: "https://github.com/settings/personal-access-tokens",
};

// Un projet, son répertoire d'état et son journal, ouvert le temps du test.
function unProjet(t: TestContext) {
  const repertoireEtat = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoireEtat);
  t.after(() => journal.fermer());
  const faits = () => journal.tout().filter(({ type }) => type.startsWith("blocker."));
  return { repertoireEtat, journal, faits };
}

test("un projet sans blocage n'en a aucun — sans journal comme avec", (t) => {
  const vide = repertoireTemporaire(t);
  assert.equal(lireBlocages(vide).length, 0);
  assert.equal(lireBlocages(join(vide, "absent")).length, 0);
  const { repertoireEtat, journal } = unProjet(t);
  assert.equal(blocagesDuJournal(journal.base).length, 0);
  assert.equal(lireBlocages(repertoireEtat).length, 0);
});

test("poser puis lister : chaque blocage dit son message, sa cause, et seulement l'action, le lien ou le détail qu'il porte, dans l'ordre où ils sont posés", (t) => {
  const { repertoireEtat, journal, faits } = unProjet(t);
  assert.deepEqual(poserBlocage(journal, QUI, CLONE), { blocage: { ...CLONE }, ecrit: true });
  poserBlocage(journal, QUI, POSTGRES);
  poserBlocage(journal, QUI, JETONS);

  const attendus = [
    { id: "clone", message: CLONE.message, cause: CLONE.cause, detail: CLONE.detail },
    { id: "need:postgres", message: POSTGRES.message, cause: POSTGRES.cause, action: "choose-station" },
    { id: "token", message: JETONS.message, cause: JETONS.cause, link: JETONS.link },
  ];
  assert.deepEqual(blocagesDuJournal(journal.base), attendus);
  // Lus d'un autre process, en lecture seule : les mêmes.
  assert.deepEqual(lireBlocages(repertoireEtat), attendus);
  // Au journal du projet, sans ticket, sous le nom de qui les a posés.
  assert.deepEqual(
    faits().map(({ project, ticket, author, type }) => ({ project, ticket, author, type })),
    Array.from({ length: 3 }, () => ({ project: "mirrorscreen", ticket: null, author: "station:box", type: "blocker.raised" })),
  );
});

test("un champ facultatif vide ou null n'est pas publié", () => {
  assert.deepEqual(blocage({ ...POSTGRES, action: null, link: "  ", detail: "" }), { id: "need:postgres", message: POSTGRES.message, cause: POSTGRES.cause });
});

test("le même blocage posé deux fois n'en fait qu'un : à l'identique rien ne s'écrit, changé il remplace l'ancien à sa place", (t) => {
  const { journal, faits } = unProjet(t);
  poserBlocage(journal, QUI, CLONE);
  poserBlocage(journal, QUI, POSTGRES);
  assert.deepEqual(poserBlocage(journal, { ...QUI, auteur: "runtime" }, { ...CLONE, message: `  ${CLONE.message}  ` }), { blocage: { ...CLONE }, ecrit: false });
  assert.equal(faits().length, 2);

  const autreCause = { ...CLONE, cause: "The station's GitHub account cannot see it.", detail: "Repository not found." };
  assert.equal(poserBlocage(journal, QUI, autreCause).ecrit, true);
  assert.deepEqual(
    blocagesDuJournal(journal.base).map(({ id, cause }) => ({ id, cause })),
    [
      { id: "clone", cause: autreCause.cause },
      { id: "need:postgres", cause: POSTGRES.cause },
    ],
  );
  assert.equal(poserBlocage(journal, QUI, autreCause).ecrit, false);
  assert.equal(faits().length, 3);
});

test("lever un blocage le retire de la liste ; lever ce qui n'est pas posé n'écrit rien ; reposé, il revient en dernier", (t) => {
  const { journal, faits } = unProjet(t);
  poserBlocage(journal, QUI, CLONE);
  poserBlocage(journal, QUI, POSTGRES);

  assert.equal(leverBlocage(journal, QUI, "clone"), true);
  assert.deepEqual(blocagesDuJournal(journal.base).map(({ id }) => id), ["need:postgres"]);
  assert.equal(faits().at(-1)?.type, "blocker.resolved");

  const avant = faits().length;
  assert.equal(leverBlocage(journal, QUI, "clone"), false);
  assert.equal(leverBlocage(journal, QUI, "jamais-pose"), false);
  assert.equal(faits().length, avant);

  poserBlocage(journal, QUI, CLONE);
  assert.deepEqual(blocagesDuJournal(journal.base).map(({ id }) => id), ["need:postgres", "clone"]);
  leverBlocage(journal, QUI, "need:postgres");
  leverBlocage(journal, QUI, "clone");
  assert.equal(blocagesDuJournal(journal.base).length, 0);
});

test("la station pose et lève dans le répertoire d'état d'un projet dont la cuisine ne s'est pas encore ouverte : le répertoire est créé", (t) => {
  const repertoireEtat = join(repertoireTemporaire(t), "etat", "mirrorscreen");
  assert.equal(poserBlocageDans(repertoireEtat, QUI, CLONE).ecrit, true);
  assert.equal(existsSync(repertoireEtat), true);
  assert.equal(poserBlocageDans(repertoireEtat, QUI, CLONE).ecrit, false);
  assert.deepEqual(lireBlocages(repertoireEtat).map(({ id }) => id), ["clone"]);
  assert.equal(leverBlocageDans(repertoireEtat, QUI, "clone"), true);
  assert.equal(lireBlocages(repertoireEtat).length, 0);
});

// Ce que des commandes ont vraiment dit, à l'installation de mirrorscreen et ailleurs.
const pile = (() => {
  try {
    JSON.parse("{");
  } catch (erreur) {
    return String((erreur as Error).stack);
  }
  return "";
})();
const SORTIES_BRUTES = [
  "failed to run git: exit status 128",
  "Command failed: git clone https://github.com/BOBL-tech/mirrorscreen.git /srv/clones/mirrorscreen",
  "fatal: repository 'https://github.com/BOBL-tech/mirrorscreen.git/' not found",
  "error: could not lock config file /home/brigade/.gitconfig: Permission denied",
  "Host key verification failed.\nfatal: Could not read from remote repository.",
  " ERR_PNPM_PNPM_ENGINE_IDENTITY_UNVERIFIABLE  Cannot verify the integrity of pnpm",
  "spawn psql ENOENT",
  "the setup exited with code 1",
  "npm ERR! code E404",
  "TypeError: Cannot read properties of undefined (reading 'nom')",
  "Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/srv/app/apps/api/.env'",
  "Traceback (most recent call last): File \"setup.py\", line 3",
  "    at ouvrirJournal (/srv/brigade/runtime/src/journal.ts:181:15)",
  "$ docker compose up -d",
  "killed by SIGKILL",
  pile,
];

test("un message qui n'est que la sortie brute d'une commande n'est jamais le message : il passe dans le détail, une phrase le remplace", (t) => {
  assert.notEqual(pile, "");
  const { repertoireEtat, journal } = unProjet(t);
  for (const [i, brut] of SORTIES_BRUTES.entries()) {
    assert.equal(estUneSortieBrute(brut), true, brut);
    const { blocage: pose } = poserBlocage(journal, QUI, { id: `brut-${i}`, message: brut, cause: "The repository could not be cloned." });
    assert.notEqual(pose.message, brut, brut);
    assert.notEqual(pose.message.trim(), brut.trim(), brut);
    assert.equal(pose.message, MESSAGE_DE_REPLI);
    assert.equal(pose.cause, "The repository could not be cloned.");
    assert.equal(pose.detail, brut.trim().slice(0, DETAIL_MAX), brut);
  }
  // Ce que la page lit : aucun message n'est une sortie brute.
  const publies = lireBlocages(repertoireEtat);
  assert.equal(publies.length, SORTIES_BRUTES.length);
  for (const { message } of publies) assert.equal(estUneSortieBrute(message), false, message);
});

test("une cause brute est assainie de même, et le détail garde tout, dans l'ordre : le message brut, la cause brute, le détail donné", () => {
  const pose = blocage({ id: "setup", message: "failed to run git: exit status 128", cause: "spawn docker ENOENT", detail: "while running the worktree setup" });
  assert.deepEqual(pose, {
    id: "setup",
    message: MESSAGE_DE_REPLI,
    cause: CAUSE_DE_REPLI,
    detail: "failed to run git: exit status 128\n\nspawn docker ENOENT\n\nwhile running the worktree setup",
  });
  assert.equal(blocage({ ...CLONE, detail: "x".repeat(DETAIL_MAX + 50) }).detail?.length, DETAIL_MAX);
});

test("une phrase pour le chef reste le message, telle quelle — celles du clone en échec comprises", () => {
  for (const phrase of [CLONE.message, CLONE.cause, POSTGRES.message, JETONS.cause, "Run `gh auth login` on box, under the account that runs it.", "The account's quota is used up: the station retries within 5 min."]) {
    assert.equal(estUneSortieBrute(phrase), false, phrase);
    assert.equal(blocage({ id: "x", message: phrase, cause: phrase }).message, phrase);
  }
  const enquetes: Enquete[] = [
    { compte: null, jeton: null, proprietaire: null },
    { compte: "brigade-cook", jeton: "fine-grained", proprietaire: true },
    { compte: "brigade-cook", jeton: "classic", proprietaire: false },
  ];
  const erreurs = ["Could not resolve host: github.com", "Host key verification failed.", "SAML SSO required", "gh auth login", "HTTP 403", "Repository not found.", "something else"];
  for (const enquete of enquetes) {
    for (const erreur of erreurs) {
      const { raison } = lireLEchecDuClone({ station: "box", depot: "BOBL-tech/mirrorscreen", erreurs: `${erreur}\nfailed to run git: exit status 128`, enquete, reessaieToutesLes: 60 });
      assert.equal(estUneSortieBrute(raison), false, raison);
    }
  }
});

test("un blocage mal formé par son producteur est refusé : identifiant, action ou lien illisible, message ou cause vide", () => {
  for (const mauvais of [
    { ...CLONE, id: "" },
    { ...CLONE, id: "Clone du dépôt" },
    { ...CLONE, message: "   " },
    { ...CLONE, cause: "" },
    { ...CLONE, action: "Open the settings" },
    { ...CLONE, link: "not a link" },
    { ...CLONE, link: "http://github.com/settings/tokens" },
    { ...CLONE, link: "javascript:alert(1)" },
  ]) {
    assert.throws(() => blocage(mauvais), BlocageInvalide, JSON.stringify(mauvais));
  }
});

test("un jeton dans le détail est masqué au journal, et ne fait pas réécrire le blocage à chaque fois", (t) => {
  const { journal, faits } = unProjet(t);
  const jeton = `sk-ant-oat01-${"r".repeat(60)}`;
  const avecJeton = { ...CLONE, detail: `token ${jeton} refused` };
  assert.equal(poserBlocage(journal, QUI, avecJeton).ecrit, true);
  assert.equal(blocagesDuJournal(journal.base)[0]?.detail?.includes(jeton), false);
  assert.equal(poserBlocage(journal, QUI, avecJeton).ecrit, false);
  assert.equal(faits().length, 1);
});

test("blocages.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
