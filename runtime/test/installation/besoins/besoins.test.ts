// Ce qui manque à la station pour les tests d'un projet : lu dans un vrai
// dépôt écrit sur le disque, comparé à une machine doublée, tenu dans un vrai
// journal — un choix par besoin, à quatre issues, que le chef retient.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Canal, Fichiers } from "../../../src/appairage/canal.ts";
import { FICHIER_LOCAL } from "../../../src/appairage/presence.ts";
import { poserDecision } from "../../../src/decisions.ts";
import { blocagesDuJournal, estUneSortieBrute, lireBlocages } from "../../../src/installation/blocages/blocages.ts";
import {
  ACTION_DU_CHOIX,
  AILLEURS,
  choisir,
  choisirDans,
  choixDesBesoins,
  choixDuJournal,
  choixDuSetup,
  ChoixInconnu,
  ICI,
  lireChoix,
  PROJET,
  selectionsLues,
  suivreLesBesoins,
  TESTS,
  tenirLesChoix,
  type Choix,
} from "../../../src/installation/besoins/besoins.ts";
import { besoinNomme, essaiMysql, type Jouer } from "../../../src/installation/besoins/catalogue.ts";
import { ouvrirLesTicketsDans } from "../../../src/installation/besoins/ticket.ts";
import { besoinsDesFichiers, besoinsDuDepot, lireLeDepot } from "../../../src/installation/besoins/detecter.ts";
import { aLeBesoin, ESSAI_VALABLE_MS, sondeDeLaMachine, type Sonde } from "../../../src/installation/besoins/fourni.ts";
import { ouvrirJournal } from "../../../src/journal.ts";
import { FICHIER_PROJETS, FICHIER_SUIVI, type SuiviDuProjet } from "../../../src/projets/demande.ts";
import { tenirProjetsDeLApp } from "../../../src/projets/tenir.ts";
import { posixOnly } from "../../support/plateforme.ts";
import { aArreter, repertoireTemporaire, temporaireDuFichier } from "../../outils.ts";

const rienNeReste = temporaireDuFichier();

const QUI = { projet: "mirrorscreen", auteur: "station:box" };

// Le dépôt de mirrorscreen, tel que le setup écrit pour le Mac du chef le
// laisse : il joint une base Postgres locale, et son API dépend de `pg`.
const MIRRORSCREEN: Record<string, string> = {
  ".claude/brigade/worktree-setup.sh": "#!/usr/bin/env bash\nset -euo pipefail\n# docker est sur le Mac du chef, pas ici\ncp apps/api/.env.example apps/api/.env\npsql -h localhost -U postgres -c 'create database mirrorscreen_test'\npnpm install\n",
  "apps/api/package.json": JSON.stringify({ name: "api", scripts: { test: "vitest run", deploy: "docker build ." }, dependencies: { pg: "^8.11.0", fastify: "^4" } }),
  "apps/api/.env.example": "DATABASE_URL=postgres://postgres@localhost:5432/mirrorscreen\n",
  "package.json": JSON.stringify({ name: "mirrorscreen", private: true }),
  "README.md": "Uses psql and docker.",
};

// Un dépôt sur le disque : ses fichiers, et un `.git` — c'est un clone.
function unDepot(t: TestContext, fichiers: Record<string, string>): string {
  const dossier = repertoireTemporaire(t);
  mkdirSync(join(dossier, ".git"), { recursive: true });
  for (const [chemin, contenu] of Object.entries(fichiers)) {
    mkdirSync(dirname(join(dossier, chemin)), { recursive: true });
    writeFileSync(join(dossier, chemin), contenu);
  }
  return dossier;
}

// Un serveur Postgres doublé, tel que le compte de la station le trouve : il
// accepte sa connexion et crée ses bases, refuse sa connexion, ou l'accepte
// mais lui refuse de créer une base. Il retient ce que la sonde a joué, et les
// bases qui restent.
function unPostgres(etat: "utilisable" | "refuse" | "interdit") {
  const joues: string[] = [];
  const bases = new Set<string>();
  const jouer: Jouer = (commande, args) => {
    const requete = args.at(-1) ?? "";
    joues.push(`${commande} ${requete}`);
    if (commande !== "psql") return { code: null, sortie: "" };
    if (etat === "refuse") return { code: 2, sortie: 'psql: error: connection to server on socket "/var/run/postgresql/.s.PGSQL.5432" failed: FATAL:  role "brigade" does not exist\n' };
    const creee = /^CREATE DATABASE (\w+)$/.exec(requete)?.[1];
    if (creee !== undefined) {
      if (etat === "interdit") return { code: 1, sortie: "ERROR:  permission denied to create database\n" };
      bases.add(creee);
    }
    const supprimee = /^DROP DATABASE IF EXISTS (\w+)$/.exec(requete)?.[1];
    if (supprimee !== undefined) bases.delete(supprimee);
    return { code: 0, sortie: "" };
  };
  return { jouer, joues, bases };
}

// Une machine doublée : elle n'a que les commandes nommées, et un serveur
// Postgres doublé — aucun, par défaut : rien de ce qu'elle joue ne se lance.
const machineAvec = (serveur: { jouer: Jouer } | null, ...commandes: string[]): Sonde => ({
  commande: (nom) => commandes.includes(nom),
  dossier: () => false,
  jouer: serveur?.jouer ?? (() => ({ code: null, sortie: "" })),
  essayer: (_besoin, essai) => essai(),
  env: {},
  maison: "/nulle-part",
});
const machine = (...commandes: string[]): Sonde => machineAvec(null, ...commandes);

// Une machine où Postgres est installé et sert le compte de la station.
const AVEC_POSTGRES = () => machineAvec(unPostgres("utilisable"), "postgres", "pg_ctlcluster", "psql");

const BOX = machine("git", "node", "psql");

function unProjet(t: TestContext) {
  const repertoireEtat = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoireEtat);
  // Fermé avant que son répertoire soit supprimé : sous Windows, un journal
  // encore ouvert ne se supprime pas.
  aArreter(t, () => journal.fermer());
  return { repertoireEtat, journal };
}

const enAttente = (choix: readonly Choix[]) => choix.filter(({ status }) => status === "pending");

test("les tests d'un projet ont besoin de Postgres, la station ne l'a pas : un seul choix, pour la base, à quatre issues qui disent chacune ce qui en suit", (t) => {
  const besoins = besoinsDuDepot(unDepot(t, MIRRORSCREEN));
  // Le setup d'abord ; un script de déploiement qui lance docker ne dit rien des tests.
  assert.deepEqual(
    besoins.map(({ besoin, preuves }) => [besoin.id, preuves]),
    [["postgres", ["`.claude/brigade/worktree-setup.sh` runs `psql`", "`apps/api/.env.example` points at a `postgres://` address", "`apps/api/package.json` depends on `pg`"]]],
  );

  const choix = choixDesBesoins(besoins, { projet: "mirrorscreen", nom: "box", sonde: BOX, fournit: ["code", "raisonnement"], ailleurs: [] });
  assert.equal(choix.length, 1);
  const [base] = choix;
  assert.equal(base!.id, "need:postgres");
  assert.equal(base!.need, "postgres");
  assert.equal(base!.message, "The tests of mirrorscreen need a Postgres database, which box does not have.");
  assert.equal(base!.cause, "`.claude/brigade/worktree-setup.sh` runs `psql`; `apps/api/.env.example` points at a `postgres://` address; `apps/api/package.json` depends on `pg`.");
  assert.deepEqual(base!.options.map(({ id }) => id), [AILLEURS, ICI, TESTS, PROJET]);
  const [ailleurs, ici, tests, projet] = base!.options;
  // Quels tickets attendent une autre station, ce qui s'installe sur la box, ce que perd la couverture.
  assert.equal(ailleurs!.consequence, "The tickets of mirrorscreen whose tests need a Postgres database wait until a station that provides `postgres` is declared for mirrorscreen; none is today, so they do not start.");
  assert.equal(ici!.label, "Provide it on box");
  assert.equal(ici!.consequence, "A PostgreSQL server (the `postgresql` package) is installed on box and runs there as a service, and the tests of mirrorscreen run there with it: no ticket waits for another station.");
  assert.match(tests!.consequence, /^A ticket of mirrorscreen rewrites its tests so they pass without a Postgres database: .*no longer checked against a real Postgres\.$/);
  // La box n'a que le client `psql` : ni serveur à démarrer, ni Docker — le setup doit d'abord aller le chercher.
  assert.equal(projet!.label, "The project's setup brings it itself");
  assert.match(projet!.consequence, /^A ticket of mirrorscreen makes its worktree setup bring a Postgres database itself — it starts a throwaway Postgres server of its own .* —, and its tests run with it: what that takes is not on box yet, /);
  assert.equal(projet!.recommended, undefined);
  assert.ok(base!.options.every(({ recommended }) => recommended === undefined));
  // Des phrases, jamais la sortie d'une commande.
  for (const phrase of [base!.message, base!.cause, ...base!.options.flatMap(({ label, consequence }) => [label, consequence])]) {
    assert.equal(estUneSortieBrute(phrase), false, phrase);
    assert.match(phrase, /\.$|^[A-Z]/);
  }
});

test("une autre station du projet fournit le besoin : l'issue « ailleurs » dit laquelle les tickets attendent", (t) => {
  const besoins = besoinsDuDepot(unDepot(t, MIRRORSCREEN));
  const [choix] = choixDesBesoins(besoins, { projet: "mirrorscreen", nom: "box", sonde: BOX, fournit: ["code"], ailleurs: [{ nom: "mac/claude", fournit: ["code", "postgres"] }] });
  assert.equal(choix!.options[0]!.consequence, "The tickets of mirrorscreen whose tests need a Postgres database wait for mac/claude, which provides it; box keeps cooking the others.");
});

// Un Docker doublé : son démon répond au compte de la station, ou le refuse.
const unDocker = (repond: boolean): { jouer: Jouer } => ({
  jouer: (commande, args) =>
    commande === "docker" && args[0] === "info" ? (repond ? { code: 0, sortie: "Server Version: 24.0.7\n" } : { code: 1, sortie: "permission denied while trying to connect to the Docker daemon socket\n" }) : { code: null, sortie: "" },
});

test("l'issue « le setup du projet l'apporte » est recommandée quand rien n'est à installer sur la station : elle a les binaires du serveur, ou un Docker qui répond", (t) => {
  const besoins = besoinsDuDepot(unDepot(t, MIRRORSCREEN));
  const station = { projet: "mirrorscreen", nom: "box", fournit: [] as string[], ailleurs: [] };
  const issues = (sonde: Sonde, fournit: string[] = []) => choixDesBesoins(besoins, { ...station, sonde, fournit })[0]!.options;
  const duProjet = (sonde: Sonde, fournit: string[] = []) => issues(sonde, fournit).find(({ id }) => id === PROJET)!;

  // mirrorlab : Postgres est installé, mais refuse le compte de la cuisine —
  // le setup démarre le sien avec les binaires de la station.
  const binaires = duProjet(machineAvec(unPostgres("refuse"), ...SERVEUR_PG));
  assert.equal(binaires.recommended, true);
  assert.match(binaires.consequence, /, and its tests run with it: box already has what that takes, nothing is installed there\.$/);
  // Seule l'issue du projet l'est.
  assert.deepEqual(
    issues(machineAvec(unPostgres("refuse"), ...SERVEUR_PG)).filter(({ recommended }) => recommended === true).map(({ id }) => id),
    [PROJET],
  );
  // Ni binaires du serveur ni Postgres, mais un Docker qui répond : il le démarre en conteneur.
  assert.equal(duProjet(machineAvec(unDocker(true), "docker", "psql")).recommended, true);
  // Docker déclaré pour une station d'ici.
  assert.equal(duProjet(BOX, ["docker"]).recommended, true);

  // Le client `psql` seul, un Docker qui refuse le compte : il faudrait installer quelque chose.
  assert.equal(duProjet(BOX).recommended, undefined);
  const refuse = duProjet(machineAvec(unDocker(false), "docker", "psql"));
  assert.equal(refuse.recommended, undefined);
  assert.match(refuse.consequence, /: what that takes is not on box yet, so the setup has to fetch it, or that ticket says what must be installed there\.$/);

  // Le choix que pose un setup en échec porte le même jugement.
  const manques = new Map([["box/claude", ["postgres"]]]);
  const duSetup = (sonde: Sonde) => choixDuSetup(manques, { projet: "mirrorscreen", sonde, fournit: [], ailleurs: [] })[0]!.options.find(({ id }) => id === PROJET)!;
  assert.equal(duSetup(machineAvec(unPostgres("refuse"), ...SERVEUR_PG)).recommended, true);
  assert.equal(duSetup(BOX).recommended, undefined);
});

test("la carte du navigateur garde ses trois issues, et gagne celle du projet, sans recommandation : Chromium peut demander des bibliothèques du système", (t) => {
  const besoins = besoinsDuDepot(unDepot(t, { "package.json": JSON.stringify({ name: "site", devDependencies: { "@playwright/test": "^1.48.0" } }) }));
  assert.deepEqual(besoins.map(({ besoin }) => besoin.id), ["browser"]);
  const [choix] = choixDesBesoins(besoins, { projet: "site", nom: "box", sonde: machineAvec(unDocker(true), "docker", "npx"), fournit: [], ailleurs: [] });
  assert.deepEqual(
    choix!.options.map(({ id, label }) => [id, label]),
    [
      [AILLEURS, "Cook it on a station that has it"],
      [ICI, "Provide it on box"],
      [TESTS, "Adapt the tests"],
      [PROJET, "The project's setup brings it itself"],
    ],
  );
  assert.match(choix!.options[3]!.consequence, /^A ticket of site makes its worktree setup bring a browser itself — it downloads the browser its tests drive into the cook's account/);
  assert.ok(choix!.options.every(({ recommended }) => recommended === undefined));
});

test("la station a le besoin — sur sa machine, ou déclaré pour une station d'ici — : aucun choix", (t) => {
  const besoins = besoinsDuDepot(unDepot(t, MIRRORSCREEN));
  assert.equal(besoins.length, 1);
  const station = { projet: "mirrorscreen", nom: "box", ailleurs: [] };
  assert.equal(choixDesBesoins(besoins, { ...station, sonde: AVEC_POSTGRES(), fournit: ["code"] }).length, 0);
  assert.equal(choixDesBesoins(besoins, { ...station, sonde: BOX, fournit: ["code", "postgres"] }).length, 0);
});

test("la station principale tient le choix au journal du projet, avec le blocage qui l'attend ; elle a le besoin, rien ne s'écrit", (t) => {
  const clone = unDepot(t, MIRRORSCREEN);
  const { repertoireEtat, journal } = unProjet(t);
  poserDecision(journal, { projet: "mirrorscreen", nom: "BRIGADE_STATIONS", valeur: "box/claude:2:code+raisonnement", auteur: "chef" });
  const projet = { nom: "mirrorscreen", principale: true };

  const choix = suivreLesBesoins({ station: "box", sonde: BOX }).tenir(projet, { repertoireEtat, clone });
  assert.deepEqual(choix.map(({ id, status }) => [id, status]), [["need:postgres", "pending"]]);
  assert.deepEqual(blocagesDuJournal(journal.base), [{ id: "need:postgres", message: choix[0]!.message, cause: choix[0]!.cause, action: ACTION_DU_CHOIX }]);
  // Relu tel quel, rien ne se réécrit.
  const avant = journal.dernierSeq();
  suivreLesBesoins({ station: "box", sonde: BOX }).tenir(projet, { repertoireEtat, clone });
  assert.equal(journal.dernierSeq(), avant);

  // Ailleurs, la machine a Postgres : rien ne s'écrit pour un autre projet.
  const autre = unProjet(t);
  assert.equal(suivreLesBesoins({ station: "box", sonde: AVEC_POSTGRES() }).tenir(projet, { repertoireEtat: autre.repertoireEtat, clone }).length, 0);
  assert.equal(autre.journal.dernierSeq(), 0);
  // Et une station qui n'en est pas la principale ne détecte rien.
  const secondaire = unProjet(t);
  assert.equal(suivreLesBesoins({ station: "box", sonde: BOX }).tenir({ ...projet, principale: false }, { repertoireEtat: secondaire.repertoireEtat, clone }).length, 0);
  assert.equal(secondaire.journal.dernierSeq(), 0);
});

test("retenir une issue la garde au journal du projet : le choix n'est plus en attente, son blocage est levé — et la station Postgres installée, il quitte la liste", (t) => {
  const clone = unDepot(t, MIRRORSCREEN);
  const { repertoireEtat, journal } = unProjet(t);
  const voulus = choixDesBesoins(besoinsDuDepot(clone), { projet: "mirrorscreen", nom: "box", sonde: BOX, fournit: [], ailleurs: [] });
  assert.ok(tenirLesChoix(journal, QUI, voulus) > 0);
  assert.equal(enAttente(choixDuJournal(journal.base)).length, 1);

  assert.throws(() => choisir(journal, QUI, "need:docker", ICI), ChoixInconnu);
  assert.throws(() => choisir(journal, QUI, "need:postgres", "install-it"), ChoixInconnu);
  assert.equal(choisir(journal, QUI, "need:postgres", ICI), true);
  assert.equal(choisir(journal, QUI, "need:postgres", ICI), false);

  const [retenu] = choixDuJournal(journal.base);
  assert.equal(retenu!.status, "chosen");
  assert.equal(retenu!.status === "chosen" ? retenu!.selected : null, ICI);
  assert.ok(retenu!.status === "chosen" && !Number.isNaN(Date.parse(retenu!.selectedAt)));
  assert.equal(enAttente(choixDuJournal(journal.base)).length, 0);
  assert.equal(blocagesDuJournal(journal.base).length, 0);
  const selection = journal.tout().find(({ type }) => type === "need.choice-selected");
  assert.equal(selection?.author, "chef");

  // La station relit : le choix reste retenu, rien ne se réécrit, aucun blocage ne revient.
  assert.equal(tenirLesChoix(journal, QUI, voulus), 0);
  assert.equal(lireChoix(repertoireEtat)[0]!.status, "chosen");
  assert.equal(lireBlocages(repertoireEtat).length, 0);

  // Le chef change d'avis, depuis un autre process.
  assert.equal(choisirDans(repertoireEtat, QUI, "need:postgres", TESTS), true);
  const change = choixDuJournal(journal.base)[0]!;
  assert.equal(change.status === "chosen" ? change.selected : null, TESTS);

  // Postgres installé sur la box : le besoin ne manque plus, le choix s'en va.
  tenirLesChoix(journal, QUI, []);
  assert.equal(choixDuJournal(journal.base).length, 0);
  assert.equal(journal.tout().at(-1)?.type, "need.choice-dropped");
});

test("le choix que l'app écrit dans la demande est retenu à la lecture : une issue inconnue, ou un choix qui n'existe pas, n'y fait rien", (t) => {
  assert.deepEqual(selectionsLues({ "need:postgres": ICI, "need:docker": "install-it", clone: AILLEURS, "need:go": 3 }), { "need:postgres": ICI });
  assert.deepEqual(selectionsLues({ "need:postgres": PROJET }), { "need:postgres": PROJET });
  assert.deepEqual(selectionsLues(["need:postgres"]), {});
  assert.deepEqual(selectionsLues(null), {});

  const { journal } = unProjet(t);
  const voulus = choixDesBesoins(besoinsDuDepot(unDepot(t, MIRRORSCREEN)), { projet: "mirrorscreen", nom: "box", sonde: BOX, fournit: [], ailleurs: [] });
  tenirLesChoix(journal, QUI, voulus, { "need:docker": ICI });
  assert.equal(enAttente(choixDuJournal(journal.base)).length, 1);
  tenirLesChoix(journal, QUI, voulus, { "need:postgres": AILLEURS });
  assert.equal(enAttente(choixDuJournal(journal.base)).length, 0);
  assert.equal(blocagesDuJournal(journal.base).length, 0);
});

test("le dépôt dit ses besoins par son setup, sa configuration de test et ses manifestes", (t) => {
  const ids = (fichiers: Record<string, string>) => besoinsDesFichiers(lireLeDepot(unDepot(t, fichiers))).map(({ besoin }) => besoin.id);
  assert.deepEqual(ids({ "playwright.config.ts": "export default {}" }), ["browser"]);
  assert.deepEqual(ids({ "web/package.json": JSON.stringify({ devDependencies: { cypress: "13" } }) }), ["browser"]);
  assert.deepEqual(ids({ ".claude/brigade/worktree-setup.sh": "docker compose up -d db\n" }), ["docker"]);
  assert.deepEqual(ids({ "package.json": JSON.stringify({ scripts: { "test:e2e": "docker compose run e2e" } }) }), ["docker"]);
  assert.deepEqual(ids({ "package.json": JSON.stringify({ scripts: { deploy: "docker push" } }) }), []);
  assert.deepEqual(ids({ ".github/workflows/ci.yml": "jobs:\n  test:\n    services:\n      db:\n        image: postgres:16\n" }), ["postgres"]);
  assert.deepEqual(ids({ "prisma/schema.prisma": 'datasource db {\n  provider = "postgresql"\n}\n' }), ["postgres"]);
  assert.deepEqual(ids({ Gemfile: "gem 'rails'\ngem 'pg'\ngem 'capybara'\n" }), ["postgres"]);
  assert.deepEqual(ids({ "requirements.txt": "django\npsycopg2-binary==2.9\nredis>=5\n" }), ["postgres", "redis"]);
  assert.deepEqual(ids({ "go.mod": "module example.com/x\n\nrequire github.com/jackc/pgx/v5 v5.5.0\n" }), ["postgres", "go"]);
  assert.deepEqual(ids({ "Cargo.toml": "[package]\nname = 'x'\n" }), ["rust"]);
  assert.deepEqual(ids({ "mobile/pubspec.yaml": "dependencies:\n  flutter:\n    sdk: flutter\n" }), ["flutter"]);
  assert.deepEqual(ids({ "App.xcodeproj/project.pbxproj": "" }), ["xcode"]);
  // Ce qui est installé ou construit n'est pas lu ; un commentaire du setup ne dit rien.
  assert.deepEqual(ids({ "node_modules/x/package.json": JSON.stringify({ dependencies: { pg: "8" } }), ".claude/brigade/worktree-setup.sh": "# psql -c 'select 1'\nnpm ci\n" }), []);
});

const POSTGRES = besoinNomme("postgres")!;
const SERVEUR_PG = ["postgres", "pg_ctlcluster", "psql"];

test("Postgres installé et utilisable par le compte de la station : il le fournit, et la base de l'essai est supprimée", () => {
  const serveur = unPostgres("utilisable");
  assert.equal(aLeBesoin(POSTGRES, machineAvec(serveur, ...SERVEUR_PG), []), true);
  // Connexion, création, suppression — de la même base.
  assert.equal(serveur.joues.length, 3);
  assert.equal(serveur.joues[0], "psql SELECT 1");
  const base = /^psql CREATE DATABASE (brigade_essai_\w+)$/.exec(serveur.joues[1]!)?.[1];
  assert.ok(base !== undefined, serveur.joues[1]!);
  assert.equal(serveur.joues[2], `psql DROP DATABASE IF EXISTS ${base}`);
  assert.deepEqual([...serveur.bases], []);
});

test("Postgres installé mais qui refuse la connexion du compte de la station : il ne le fournit pas, et le choix est posé", (t) => {
  const serveur = unPostgres("refuse");
  const sonde = machineAvec(serveur, ...SERVEUR_PG);
  assert.equal(aLeBesoin(POSTGRES, sonde, []), false);
  // Rien n'a été créé : rien à supprimer.
  assert.deepEqual(serveur.joues, ["psql SELECT 1"]);
  const choix = choixDesBesoins(besoinsDuDepot(unDepot(t, MIRRORSCREEN)), { projet: "mirrorscreen", nom: "box", sonde, fournit: ["code"], ailleurs: [] });
  assert.deepEqual(choix.map(({ id }) => id), ["need:postgres"]);
});

test("Postgres accepte la connexion mais refuse de créer une base : il ne le fournit pas, et la suppression est tentée quand même", () => {
  const serveur = unPostgres("interdit");
  assert.equal(aLeBesoin(POSTGRES, machineAvec(serveur, ...SERVEUR_PG), []), false);
  assert.equal(serveur.joues.length, 3);
  assert.match(serveur.joues[1]!, /^psql CREATE DATABASE brigade_essai_\w+$/);
  assert.equal(serveur.joues[2], serveur.joues[1]!.replace("CREATE DATABASE", "DROP DATABASE IF EXISTS"));
});

test("sans les binaires de Postgres, la station ne le fournit pas, et rien ne se joue", () => {
  const serveur = unPostgres("utilisable");
  assert.equal(aLeBesoin(POSTGRES, machineAvec(serveur, "git", "node"), []), false);
  assert.deepEqual(serveur.joues, []);
  // Une capacité déclarée pour une station d'ici reste une preuve, sans essai.
  assert.equal(aLeBesoin(POSTGRES, machineAvec(serveur, "git", "node"), ["postgres"]), true);
  assert.deepEqual(serveur.joues, []);
});

test("MySQL : de même, connexion puis création d'une base, supprimée quoi qu'il en soit", () => {
  const joues: string[] = [];
  const serveur = (refuse: "connexion" | "creation" | null): Jouer => (commande, args) => {
    const requete = args.at(-1) ?? "";
    joues.push(`${commande} ${requete}`);
    if (commande !== "mariadb") return { code: null, sortie: "" };
    if (refuse === "connexion" || (refuse === "creation" && requete.startsWith("CREATE"))) return { code: 1, sortie: "ERROR 1045 (28000): Access denied\n" };
    return { code: 0, sortie: "" };
  };
  assert.equal(essaiMysql(serveur(null), "brigade_essai_x"), true);
  assert.deepEqual(joues.splice(0), ["mysql SELECT 1", "mariadb SELECT 1", "mariadb CREATE DATABASE brigade_essai_x", "mariadb DROP DATABASE IF EXISTS brigade_essai_x"]);
  assert.equal(essaiMysql(serveur("creation"), "brigade_essai_x"), false);
  assert.deepEqual(joues.splice(0).slice(2), ["mariadb CREATE DATABASE brigade_essai_x", "mariadb DROP DATABASE IF EXISTS brigade_essai_x"]);
  assert.equal(essaiMysql(serveur("connexion"), "brigade_essai_x"), false);
  assert.deepEqual(joues.splice(0), ["mysql SELECT 1", "mariadb SELECT 1"]);
});

test("Redis et Docker : leurs binaires ne suffisent pas, le serveur ou le démon doit répondre au compte de la station", () => {
  const redis = besoinNomme("redis")!;
  const docker = besoinNomme("docker")!;
  const repond = (reponses: Record<string, { code: number; sortie: string }>): Jouer => (commande, args) => reponses[`${commande} ${args.join(" ")}`] ?? { code: null, sortie: "" };
  assert.equal(aLeBesoin(redis, machineAvec({ jouer: repond({ "redis-cli ping": { code: 0, sortie: "PONG\n" } }) }, "redis-server", "redis-cli"), []), true);
  assert.equal(aLeBesoin(redis, machineAvec({ jouer: repond({ "redis-cli ping": { code: 1, sortie: "Could not connect to Redis at 127.0.0.1:6379: Connection refused\n" } }) }, "redis-server", "redis-cli"), []), false);
  assert.equal(aLeBesoin(docker, machineAvec({ jouer: repond({ "docker info": { code: 0, sortie: "Server Version: 24.0.7\n" } }) }, "docker"), []), true);
  const refuse = "permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock\n";
  assert.equal(aLeBesoin(docker, machineAvec({ jouer: repond({ "docker info": { code: 1, sortie: refuse } }) }, "docker"), []), false);
});

// Un faux `psql` dans le PATH de la machine : il note chaque requête qu'il
// reçoit, et répond selon l'état du serveur qu'il double. Rien que des
// commandes du shell lui-même : son PATH n'a que lui.
const FAUX_PSQL = `#!/bin/sh
for dernier; do :; done
printf '%s\\n' "$dernier" >> "$JOURNAL_PSQL"
case "$SERVEUR_PG" in
  refuse) echo 'psql: error: connection to server on socket "/var/run/postgresql/.s.PGSQL.5432" failed: FATAL:  role "brigade" does not exist' >&2; exit 2 ;;
  interdit) case "$dernier" in "CREATE DATABASE "*) echo 'ERROR:  permission denied to create database' >&2; exit 1 ;; esac ;;
esac
exit 0
`;

test("la machine joue l'essai sous son propre compte, avec son environnement, et garde son verdict un moment", { skip: posixOnly("probes the machine with a fake `psql` written by the test as an extensionless #!/bin/sh script on a PATH of its own, which Windows does not execute (this test uses POSIX mode bits); on the Windows job: false !== true") }, (t) => {
  const bin = repertoireTemporaire(t);
  writeFileSync(join(bin, "psql"), FAUX_PSQL);
  chmodSync(join(bin, "psql"), 0o755);
  const requetes = (serveur: string, maintenant = () => 0) => {
    const journal = join(repertoireTemporaire(t), "psql.log");
    const sonde = sondeDeLaMachine({ PATH: bin, HOME: bin, JOURNAL_PSQL: journal, SERVEUR_PG: serveur }, process.platform, maintenant);
    const fourni = aLeBesoin(POSTGRES, sonde, []);
    return { fourni, sonde, lues: () => (existsSync(journal) ? readFileSync(journal, "utf8").trim().split("\n") : []) };
  };

  const utilisable = requetes("utilisable");
  assert.equal(utilisable.fourni, true);
  const [connexion, creation, suppression] = utilisable.lues();
  assert.equal(connexion, "SELECT 1");
  assert.match(creation!, /^CREATE DATABASE brigade_essai_\w+$/);
  assert.equal(suppression, creation!.replace("CREATE DATABASE", "DROP DATABASE IF EXISTS"));

  const refuse = requetes("refuse");
  assert.equal(refuse.fourni, false);
  assert.deepEqual(refuse.lues(), ["SELECT 1"]);

  const interdit = requetes("interdit");
  assert.equal(interdit.fourni, false);
  assert.equal(interdit.lues().length, 3);
  assert.match(interdit.lues()[2]!, /^DROP DATABASE IF EXISTS brigade_essai_\w+$/);

  // Son verdict vaut un moment : relu tout de suite, rien ne se rejoue ; passé ce moment, l'essai se rejoue.
  let maintenant = 0;
  const garde = requetes("utilisable", () => maintenant);
  assert.equal(aLeBesoin(POSTGRES, garde.sonde, []), true);
  assert.equal(garde.lues().length, 3);
  maintenant = ESSAI_VALABLE_MS;
  assert.equal(aLeBesoin(POSTGRES, garde.sonde, []), true);
  assert.equal(garde.lues().length, 6);

  // Sans `psql` ni serveur dans son PATH, la machine ne le fournit pas.
  assert.equal(aLeBesoin(POSTGRES, sondeDeLaMachine({ PATH: repertoireTemporaire(t), HOME: bin }), []), false);
});

test("la machine a une commande quand son PATH en porte une exécutable", { skip: posixOnly("the executable bit is a POSIX permission") }, (t) => {
  const bin = repertoireTemporaire(t);
  writeFileSync(join(bin, "pg_ctlcluster"), "#!/bin/sh\n");
  chmodSync(join(bin, "pg_ctlcluster"), 0o755);
  writeFileSync(join(bin, "docker"), "pas exécutable");
  const sonde = sondeDeLaMachine({ PATH: bin, HOME: bin });
  assert.equal(sonde.commande("pg_ctlcluster"), true);
  assert.equal(sonde.commande("docker"), false);
  assert.equal(sonde.commande("psql"), false);
});

// La station qui tient les projets que l'app lui demande, contre un gist en
// mémoire, une autorisation et un accès doublés ; son clone est le dépôt de
// mirrorscreen, écrit sur le disque.
// `ouvrir` : ce que le test fait quand la station ouvre le ticket qui prépare
// le dépôt — le premier de sa cuisine ; `ecrite` : quand elle a écrit sa ligne.
// Un GitHub doublé : il retient les issues créées, et rend leurs numéros à partir de 42.
function unGitHub() {
  const creees: Array<{ titre: string; corps: string; labels: string[] }> = [];
  let panne: string | null = null;
  return {
    creees,
    tomber: (raison: string | null) => void (panne = raison),
    github: {
      async creerIssue(issue: { titre: string; corps: string; labels: string[] }) {
        if (panne !== null) throw new Error(panne);
        creees.push(issue);
        return 41 + creees.length;
      },
      issuesDepuis: async () => [],
      fermer: () => {},
    },
  };
}

function uneStation(t: TestContext, sonde: Sonde, { ouvrir, ecrite, github }: { ouvrir?: (repertoireEtat: string) => void; ecrite?: () => void; github?: ReturnType<typeof unGitHub>["github"] } = {}) {
  const racine = repertoireTemporaire(t);
  writeFileSync(join(racine, FICHIER_LOCAL), JSON.stringify({ gist: "gist1", appairee: true, code: null, expireLe: null, echus: [] }));
  const fichiers: Fichiers = {};
  const canal: Canal = {
    creer: async () => assert.fail("la station ne crée aucun gist pour ses projets"),
    async ecrire(_id, ecrits) {
      Object.assign(fichiers, ecrits);
      return "ecrit";
    },
    lire: async () => ({ ...fichiers }),
  };
  const projets = tenirProjetsDeLApp({
    racine,
    canal,
    station: "box",
    env: {},
    servis: { projets: () => [], refus: () => null },
    apresEcriture: () => ecrite?.(),
    dire: () => {},
    cadenceMs: 3_600_000,
    maintenant: () => Date.parse("2026-10-22T12:00:00Z"),
    autoriser: async () => ({ autorisee: true }),
    cloner: async (_depot, clone) => {
      mkdirSync(join(clone, ".git"), { recursive: true });
      for (const [chemin, contenu] of Object.entries(MIRRORSCREEN)) {
        mkdirSync(dirname(join(clone, chemin)), { recursive: true });
        writeFileSync(join(clone, chemin), contenu);
      }
    },
    verifierAcces: async () => ({ etat: "libre" as const }),
    ouvrirLaPreparation: async (_projet, repertoireEtat) => {
      ouvrir?.(repertoireEtat);
      return { ticket: 7, ouvert: true };
    },
    ouvrirLesTicketsDesBesoins: (projet, repertoireEtat) =>
      ouvrirLesTicketsDans(repertoireEtat, { projet: projet.nom, auteur: "station:box" }, () => github ?? assert.fail("aucun ticket de besoin n'est ouvert dans ce test")),
    sonde,
  });
  aArreter(t, () => projets.arreter());
  const demander = (choix?: Record<string, string>) =>
    void (fichiers[FICHIER_PROJETS] = JSON.stringify({ brigade: "projets", format: 1, projets: [{ nom: "mirrorscreen", depot: "BOBL-tech/mirrorscreen", base: "main", principale: true, cooks: 2, ...(choix === undefined ? {} : { choix }) }] }));
  const suivi = () => (JSON.parse(fichiers[FICHIER_SUIVI] ?? "null") as { projets: SuiviDuProjet[] }).projets[0]!;
  return { racine, projets, demander, suivi };
}

test("les choix sont publiés dans le suivi du projet, à côté de ses blocages ; le chef en retient un depuis l'app, il n'est plus en attente", async (t) => {
  const station = uneStation(t, BOX);
  station.demander();
  await station.projets.relire();
  const lu = station.suivi();
  assert.equal(lu.choix?.length, 1);
  const [choix] = lu.choix!;
  assert.equal(choix!.id, "need:postgres");
  assert.equal(choix!.status, "pending");
  assert.deepEqual(choix!.options.map(({ id }) => id), [AILLEURS, ICI, TESTS, PROJET]);
  assert.deepEqual(lu.blocages, [{ id: "need:postgres", message: choix!.message, cause: choix!.cause, action: ACTION_DU_CHOIX }]);
  // Le suivi ne porte que des phrases : aucune n'est la sortie d'une commande.
  assert.ok([choix!.message, choix!.cause, ...choix!.options.map(({ consequence }) => consequence)].every((phrase) => !estUneSortieBrute(phrase)));

  station.demander({ "need:postgres": ICI });
  await station.projets.relire();
  const apres = station.suivi();
  assert.equal(apres.choix?.length, 1);
  assert.equal(apres.choix![0]!.status, "chosen");
  assert.equal(apres.choix![0]!.status === "chosen" ? apres.choix![0]!.selected : null, ICI);
  assert.equal(apres.blocages, undefined);
  assert.equal(enAttente(lireChoix(join(station.racine, "etat/mirrorscreen"))).length, 0);
});

test("le chef laisse la base au setup du projet : un seul ticket s'ouvre sur le projet, qui nomme le besoin ; le choix n'est plus une carte en attente, et dit son ticket", async (t) => {
  const gh = unGitHub();
  const station = uneStation(t, machineAvec(unPostgres("refuse"), ...SERVEUR_PG), { github: gh.github });
  station.demander();
  await station.projets.relire();
  // En attente, rien ne part vers GitHub.
  assert.equal(station.suivi().choix![0]!.status, "pending");
  assert.equal(gh.creees.length, 0);

  // GitHub en panne : le choix est retenu, son ticket attend la lecture suivante.
  gh.tomber("HTTP 502");
  station.demander({ "need:postgres": PROJET });
  await station.projets.relire();
  assert.equal(gh.creees.length, 0);
  assert.equal(station.suivi().choix![0]!.status, "chosen");
  gh.tomber(null);
  await station.projets.relire();

  assert.equal(gh.creees.length, 1);
  const [ouvert] = gh.creees;
  assert.equal(ouvert!.titre, "Make the worktree setup of mirrorscreen bring a Postgres database itself");
  assert.match(ouvert!.corps, /^<!-- brigade:need-setup mirrorscreen postgres \d+ -->$/m);
  assert.match(ouvert!.corps, /its worktree setup \(`\.claude\/brigade\/worktree-setup\.sh`\) must provide a Postgres database to the tests on its own, so nothing is installed on the station\./);
  assert.match(ouvert!.corps, /The tests of mirrorscreen need a Postgres database, which box does not have\./);
  assert.deepEqual(ouvert!.labels, ["fire", "model:opus", "effort:high"]);

  const lu = station.suivi();
  assert.deepEqual(
    lu.choix?.map((choix) => (choix.status === "chosen" ? [choix.id, choix.status, choix.selected, choix.ticket] : [choix.id, choix.status])),
    [["need:postgres", "chosen", PROJET, 42]],
  );
  assert.equal(lu.blocages, undefined);

  // Relu, et relu encore : aucun autre ticket, rien de plus au journal.
  const journal = ouvrirJournal(join(station.racine, "etat/mirrorscreen"), { lectureSeule: true });
  aArreter(t, () => journal.fermer());
  const avant = journal.dernierSeq();
  await station.projets.relire();
  await station.projets.relire();
  assert.equal(gh.creees.length, 1);
  assert.equal(journal.dernierSeq(), avant);
  assert.deepEqual(
    journal
      .tout()
      .filter(({ type }) => type.startsWith("need.ticket-"))
      .map(({ type, payload }) => [type, payload]),
    [
      ["need.ticket-opening", { id: "need:postgres", need: "postgres" }],
      ["need.ticket-opened", { id: "need:postgres", need: "postgres", ticket: 42, reconciled: false }],
    ],
  );
});

test("la station sur laquelle Postgres est installé ne publie aucun choix", async (t) => {
  const station = uneStation(t, AVEC_POSTGRES());
  station.demander();
  await station.projets.relire();
  assert.equal(station.suivi().choix, undefined);
  assert.equal(station.suivi().blocages, undefined);
});

test("à l'installation du projet, le Postgres de la station refuse son compte : le choix de la base est au journal avant son premier ticket, et avant sa ligne", async (t) => {
  const vus: Array<[string, Choix[]]> = [];
  const station = uneStation(t, machineAvec(unPostgres("refuse"), ...SERVEUR_PG), {
    ouvrir: (repertoireEtat) => vus.push(["ticket de préparation", lireChoix(repertoireEtat)]),
    ecrite: () => vus.push(["ligne", lireChoix(join(station.racine, "etat/mirrorscreen"))]),
  });
  station.demander();
  await station.projets.relire();
  assert.deepEqual(
    vus.map(([quand, choix]) => [quand, choix.map(({ id, status }) => `${id} ${status}`)]),
    [
      ["ticket de préparation", ["need:postgres pending"]],
      ["ligne", ["need:postgres pending"]],
    ],
  );
  assert.deepEqual(station.suivi().blocages?.map(({ id }) => id), ["need:postgres"]);
});

test("à l'installation du projet, la station fournit vraiment tout ce dont ses tests ont besoin : aucun choix, ni avant son premier ticket ni après", async (t) => {
  const vus: Choix[][] = [];
  const station = uneStation(t, AVEC_POSTGRES(), { ouvrir: (repertoireEtat) => vus.push(lireChoix(repertoireEtat)) });
  station.demander();
  await station.projets.relire();
  assert.deepEqual(vus, [[]]);
  assert.equal(station.suivi().choix, undefined);
  assert.equal(station.suivi().blocages, undefined);
});

test("ce fichier ne laisse rien dans le répertoire temporaire", () => rienNeReste());
