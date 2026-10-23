// Un setup de worktree qui échoue sur un besoin que la station ne fournit pas
// vraiment (#1533) : lu dans sa sortie, tenu au journal du projet, et joué par
// une vraie cuisine dont le setup bute sur le Postgres de la station — le chef
// a le choix de ce besoin, pas l'échec brut du setup. Un setup qui échoue sur
// autre chose garde sa carte, avec son erreur.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { blocagesDuJournal, estUneSortieBrute, poserBlocage } from "../../../src/installation/blocages/blocages.ts";
import { ACTION_DU_CHOIX, choixDuJournal, ICI, manquesDuSetup, suivreLesBesoins, tenirLeSetup, choisir, type Stations } from "../../../src/installation/besoins/besoins.ts";
import type { Jouer } from "../../../src/installation/besoins/catalogue.ts";
import type { Sonde } from "../../../src/installation/besoins/fourni.ts";
import { besoinsNommesParLeSetup } from "../../../src/installation/besoins/setup.ts";
import { blocageDuSetup, ID_DU_BLOCAGE_DU_SETUP } from "../../../src/installation/preparation/blocage-du-setup.ts";
import { ouvrirJournal } from "../../../src/journal.ts";
import { cuisine, fauxGitHub, issue, montre, STATION, type Lieux } from "../../aides/cuisine.ts";
import { aArreter, jusqua, repertoireTemporaire, temporaireDuFichier } from "../../outils.ts";

const rienNeReste = temporaireDuFichier();

// Ce que le setup de mirrorlab a dit sur parade-box : le Postgres de la
// station est installé, mais il ne connaît pas le compte de la cuisine.
const MIRRORLAB = 'psql: error: connection to server on socket "/var/run/postgresql/.s.PGSQL.5432" failed: FATAL:  role "claude" does not exist';

// Un serveur Postgres doublé, tel que le compte de la station le trouve : il
// refuse sa connexion, ou le sert.
const unPostgres =
  (sert: boolean): Jouer =>
  (commande, args) => {
    if (commande !== "psql") return { code: null, sortie: "" };
    return sert ? { code: 0, sortie: "" } : { code: 2, sortie: `${MIRRORLAB}\n` };
  };

// Une machine où les binaires de Postgres sont installés ; `sert` : leur
// serveur sert le compte de la station.
const machine = (sert: boolean): Sonde => ({
  commande: (nom) => ["postgres", "pg_ctlcluster", "psql"].includes(nom),
  dossier: () => false,
  jouer: unPostgres(sert),
  essayer: (_besoin, essai) => essai(),
  env: {},
  maison: "/nulle-part",
});
const REFUSE = machine(false);
const SERT = machine(true);

const QUI = { projet: "mirrorlab", auteur: `station:${STATION}` };
const stations = (sonde: Sonde): Stations => ({ projet: "mirrorlab", sonde, fournit: ["code"], ailleurs: [] });

function unJournal(t: TestContext) {
  const repertoireEtat = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoireEtat);
  aArreter(t, () => journal.fermer());
  return { repertoireEtat, journal };
}

// Un clone dont rien ne dit qu'il a besoin d'une base : seul le setup le dit.
function unClone(t: TestContext): string {
  const dossier = repertoireTemporaire(t);
  for (const [chemin, contenu] of Object.entries({ ".git/HEAD": "0123456789abcdef0123456789abcdef01234567\n", "package.json": JSON.stringify({ name: "mirrorlab", scripts: { test: "vitest run" } }) })) {
    mkdirSync(dirname(join(dossier, chemin)), { recursive: true });
    writeFileSync(join(dossier, chemin), contenu);
  }
  return dossier;
}

describe("ce que la sortie du setup nomme", () => {
  test("le Postgres qui refuse le compte de mirrorlab, une commande introuvable, un démon Docker muet : chacun nomme son besoin, une fois, dans l'ordre", () => {
    const ids = (sortie: string) => besoinsNommesParLeSetup(sortie).map(({ id }) => id);
    assert.deepEqual(ids(`Scope: all 3 workspace projects\n${MIRRORLAB}\n`), ["postgres"]);
    assert.deepEqual(ids("./setup.sh: line 12: psql: command not found"), ["postgres"]);
    assert.deepEqual(ids("ERROR:  permission denied to create database"), ["postgres"]);
    assert.deepEqual(ids("Error: connect ECONNREFUSED 127.0.0.1:5432"), ["postgres"]);
    assert.deepEqual(ids("Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?\npsql: could not connect to server: Connection refused\ndocker: command not found"), ["docker", "postgres"]);
    assert.deepEqual(ids("ERROR 2002 (HY000): Can't connect to local MySQL server through socket '/run/mysqld/mysqld.sock' (2)"), ["mysql"]);
    assert.deepEqual(ids("Could not connect to Redis at 127.0.0.1:6379: Connection refused"), ["redis"]);
  });

  test("un setup qui échoue sur autre chose ne nomme aucun besoin", () => {
    assert.deepEqual(besoinsNommesParLeSetup("npm ci a échoué"), []);
    assert.deepEqual(besoinsNommesParLeSetup("cp: cannot stat 'apps/api/.env': No such file or directory\ntsc a échoué"), []);
    assert.deepEqual(besoinsNommesParLeSetup(""), []);
  });
});

describe("au journal du projet", () => {
  test("le setup manque de Postgres sur la station : son choix est posé aussitôt, avec le blocage qui l'attend, et sa cause est le setup", (t) => {
    const { journal } = unJournal(t);
    tenirLeSetup(journal, QUI, STATION, ["postgres"], stations(REFUSE));
    assert.deepEqual([...manquesDuSetup(journal.base)], [[STATION, ["postgres"]]]);
    const [choix, ...autres] = choixDuJournal(journal.base);
    assert.deepEqual(autres, []);
    assert.equal(choix?.id, "need:postgres");
    assert.equal(choix?.status, "pending");
    assert.equal(choix?.message, `The tests of mirrorlab need a Postgres database, which ${STATION} does not have.`);
    assert.equal(choix?.cause, `\`.claude/brigade/worktree-setup.sh\` fails on ${STATION} because it cannot use a Postgres database there.`);
    assert.deepEqual(blocagesDuJournal(journal.base), [{ id: "need:postgres", message: choix!.message, cause: choix!.cause, action: ACTION_DU_CHOIX }]);
    // Des phrases, jamais la sortie du setup.
    assert.ok([choix!.message, choix!.cause, ...choix!.options.map(({ consequence }) => consequence)].every((phrase) => !estUneSortieBrute(phrase)));
    // Le même échec, de nouveau : rien ne se réécrit.
    assert.equal(tenirLeSetup(journal, QUI, STATION, ["postgres"], stations(REFUSE)), 0);
  });

  test("la lecture suivante de la station garde le choix tel quel, même si le dépôt n'en dit rien — et la station qui le fournit enfin le voit partir", (t) => {
    const { repertoireEtat, journal } = unJournal(t);
    const clone = unClone(t);
    tenirLeSetup(journal, QUI, STATION, ["postgres"], stations(REFUSE));
    const avant = journal.dernierSeq();
    const projet = { nom: "mirrorlab", principale: true };
    const tenus = suivreLesBesoins({ station: "box", sonde: REFUSE }).tenir(projet, { repertoireEtat, clone });
    assert.deepEqual(tenus.map(({ id, status }) => [id, status]), [["need:postgres", "pending"]]);
    assert.equal(journal.dernierSeq(), avant);

    assert.deepEqual(suivreLesBesoins({ station: "box", sonde: SERT }).tenir(projet, { repertoireEtat, clone }), []);
    assert.deepEqual(blocagesDuJournal(journal.base), []);
  });

  test("le setup passe de nouveau : il ne dit plus rien manquer, et le choix qu'il avait posé part — l'issue retenue avec lui", (t) => {
    const { journal } = unJournal(t);
    tenirLeSetup(journal, QUI, STATION, ["postgres"], stations(REFUSE));
    choisir(journal, QUI, "need:postgres", ICI);
    tenirLeSetup(journal, QUI, STATION, []);
    assert.deepEqual([...manquesDuSetup(journal.base)], []);
    assert.deepEqual(choixDuJournal(journal.base), []);
    assert.deepEqual(blocagesDuJournal(journal.base), []);
    // Il passe encore : rien à dire.
    assert.equal(tenirLeSetup(journal, QUI, STATION, []), 0);
  });
});

// Une cuisine dont le setup du projet échoue, sur une machine doublée ; un
// blocage du setup est déjà posé, d'un échec précédent, avant qu'elle ne
// démarre.
function uneCuisine(t: TestContext, setup: "postgres" | "echec", sonde: Sonde) {
  const lieux: Lieux = { repertoire: repertoireTemporaire(t), origine: "", clone: "", gh: fauxGitHub(issue(15)), heure: montre() };
  const journal = ouvrirJournal(lieux.repertoire);
  poserBlocage(journal, { projet: "brigade", auteur: `station:${STATION}` }, blocageDuSetup({ station: STATION, phraseEn: `the setup exits with code 1 on the station \`${STATION}\``, sortie: "un échec précédent", preparation: false }));
  journal.fermer();
  return cuisine(t, { scenario: "muet", setup, sonde, lieux });
}

describe("une cuisine dont le setup échoue", { concurrency: 3 }, () => {
  test("sur le Postgres de la station, qui refuse son compte : le chef a le choix de la base, et plus la carte de l'échec du setup", async (t) => {
    const { journal, etat, cooks } = uneCuisine(t, "postgres", REFUSE);
    await jusqua(() => etat(15) === "86");

    assert.deepEqual(cooks(), []);
    const choix = choixDuJournal(journal.base);
    assert.deepEqual(choix.map(({ id, status }) => [id, status]), [["need:postgres", "pending"]]);
    assert.match(choix[0]!.message, /need a Postgres database, which box\/claude does not have\.$/);
    assert.deepEqual(blocagesDuJournal(journal.base).map(({ id }) => id), ["need:postgres"]);
    assert.equal(blocagesDuJournal(journal.base).some(({ id }) => id === ID_DU_BLOCAGE_DU_SETUP), false);
  });

  test("sur autre chose : la carte de l'échec du setup, avec son erreur telle qu'il l'a dite, et aucun choix", async (t) => {
    const { journal, etat } = uneCuisine(t, "echec", REFUSE);
    await jusqua(() => etat(15) === "86");

    assert.deepEqual(choixDuJournal(journal.base), []);
    assert.deepEqual(blocagesDuJournal(journal.base), [
      {
        id: ID_DU_BLOCAGE_DU_SETUP,
        message: `The worktree setup of this project fails on ${STATION}: no ticket of this project starts until it passes.`,
        cause: `The setup exits with code 1 on the station \`${STATION}\`: \`npm ci a échoué\`.`,
        detail: "npm ci a échoué",
      },
    ]);
  });

  test("sur un Postgres que la station fournit pourtant : rien de ce qui lui manque ne l'explique, c'est la carte de l'échec du setup", async (t) => {
    const { journal, etat } = uneCuisine(t, "postgres", SERT);
    await jusqua(() => etat(15) === "86");

    assert.deepEqual(choixDuJournal(journal.base), []);
    const [blocage, ...autres] = blocagesDuJournal(journal.base);
    assert.deepEqual(autres, []);
    assert.equal(blocage?.id, ID_DU_BLOCAGE_DU_SETUP);
    assert.ok(blocage?.detail?.includes(MIRRORLAB), blocage?.detail ?? "");
  });
});

test("setup.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
