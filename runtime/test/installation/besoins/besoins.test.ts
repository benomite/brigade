// Ce qui manque à la station pour les tests d'un projet : lu dans un vrai
// dépôt écrit sur le disque, comparé à une machine doublée, tenu dans un vrai
// journal — un choix par besoin, à trois issues, que le chef retient.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
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
  ChoixInconnu,
  ICI,
  lireChoix,
  selectionsLues,
  suivreLesBesoins,
  TESTS,
  tenirLesChoix,
  type Choix,
} from "../../../src/installation/besoins/besoins.ts";
import { besoinsDesFichiers, besoinsDuDepot, lireLeDepot } from "../../../src/installation/besoins/detecter.ts";
import { sondeDeLaMachine, type Sonde } from "../../../src/installation/besoins/fourni.ts";
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

// Une machine doublée : elle n'a que les commandes nommées.
const machine = (...commandes: string[]): Sonde => ({ commande: (nom) => commandes.includes(nom), dossier: () => false, env: {}, maison: "/nulle-part" });

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

test("les tests d'un projet ont besoin de Postgres, la station ne l'a pas : un seul choix, pour la base, à trois issues qui disent chacune ce qui en suit", (t) => {
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
  assert.deepEqual(base!.options.map(({ id }) => id), [AILLEURS, ICI, TESTS]);
  const [ailleurs, ici, tests] = base!.options;
  // Quels tickets attendent une autre station, ce qui s'installe sur la box, ce que perd la couverture.
  assert.equal(ailleurs!.consequence, "The tickets of mirrorscreen whose tests need a Postgres database wait until a station that provides `postgres` is declared for mirrorscreen; none is today, so they do not start.");
  assert.equal(ici!.label, "Provide it on box");
  assert.equal(ici!.consequence, "A PostgreSQL server (the `postgresql` package) is installed on box and runs there as a service, and the tests of mirrorscreen run there with it: no ticket waits for another station.");
  assert.match(tests!.consequence, /^A ticket of mirrorscreen rewrites its tests so they pass without a Postgres database: .*no longer checked against a real Postgres\.$/);
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

test("la station a le besoin — sur sa machine, ou déclaré pour une station d'ici — : aucun choix", (t) => {
  const besoins = besoinsDuDepot(unDepot(t, MIRRORSCREEN));
  assert.equal(besoins.length, 1);
  const station = { projet: "mirrorscreen", nom: "box", ailleurs: [] };
  assert.equal(choixDesBesoins(besoins, { ...station, sonde: machine("psql", "pg_ctlcluster"), fournit: ["code"] }).length, 0);
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
  assert.equal(suivreLesBesoins({ station: "box", sonde: machine("pg_ctlcluster") }).tenir(projet, { repertoireEtat: autre.repertoireEtat, clone }).length, 0);
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
function uneStation(t: TestContext, sonde: Sonde) {
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
    apresEcriture: () => {},
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
    ouvrirLaPreparation: async () => ({ ticket: 7, ouvert: true }),
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
  assert.deepEqual(choix!.options.map(({ id }) => id), [AILLEURS, ICI, TESTS]);
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

test("la station sur laquelle Postgres est installé ne publie aucun choix", async (t) => {
  const station = uneStation(t, machine("pg_ctlcluster"));
  station.demander();
  await station.projets.relire();
  assert.equal(station.suivi().choix, undefined);
  assert.equal(station.suivi().blocages, undefined);
});

test("ce fichier ne laisse rien dans le répertoire temporaire", () => rienNeReste());
