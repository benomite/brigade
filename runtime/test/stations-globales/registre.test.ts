// Le registre des stations du chef : une machine qui se présente attend son
// acceptation, et seule une station acceptée sert — avec les capacités que le
// chef lui a reconnues. Le registre vit sur le disque, hors de tout projet.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { Base } from "../../src/base.ts";
import { cheminRegistre, ouvrirRegistre, PresentationInvalide, StationInconnue, type Presentation } from "../../src/stations-globales/registre.ts";
import { repertoireTemporaire } from "../outils.ts";

const WINDOWS: Presentation = { nom: "windows-de-test", machine: "Windows 11", capacites: ["obs", "windows"], cloisonnee: false };
const BOX: Presentation = { nom: "box", machine: "Debian 13", capacites: ["code", "raisonnement"], cloisonnee: true };

// Une horloge qui n'avance que quand le test le dit.
const horloge = (depart = "2026-10-15T09:00:00.000Z") => {
  let instant = new Date(depart);
  return { maintenant: () => instant, aller: (iso: string) => void (instant = new Date(iso)) };
};

const ouvrir = (t: TestContext, repertoire = repertoireTemporaire(t), heure = horloge()) => {
  const registre = ouvrirRegistre(repertoire, { maintenant: heure.maintenant });
  t.after(() => registre.fermer());
  return registre;
};

test("une machine qui se présente entre « en attente », sans capacité reconnue, et aucune sélection ne la renvoie", (t) => {
  const registre = ouvrir(t);
  const presentee = registre.presenter(WINDOWS);

  assert.deepEqual(presentee, {
    nom: "windows-de-test",
    machine: "Windows 11",
    declarees: ["obs", "windows"],
    capacites: [],
    cloisonnee: false,
    sorte: "ordinateur",
    cuisine: true,
    joignable: true,
    statut: "en-attente",
    presenteeLe: "2026-10-15T09:00:00.000Z",
    accepteeLe: null,
  });
  assert.deepEqual(registre.lire("windows-de-test"), presentee);
  assert.deepEqual(registre.liste(), [presentee]);
  // Ni sans demande, ni sur ce qu'elle déclare fournir.
  assert.deepEqual(registre.utilisables(), []);
  assert.deepEqual(registre.utilisables(["obs"]), []);
  assert.deepEqual(registre.utilisables(["obs", "windows"]), []);
});

test("acceptée, la station est renvoyée avec son nom, sa machine, ses capacités déclarées et son indicateur cloisonnée", (t) => {
  const heure = horloge();
  const registre = ouvrir(t, undefined, heure);
  registre.presenter(WINDOWS);
  heure.aller("2026-10-15T09:05:00.000Z");

  const acceptee = registre.accepter("windows-de-test");

  assert.deepEqual(acceptee, {
    nom: "windows-de-test",
    machine: "Windows 11",
    declarees: ["obs", "windows"],
    capacites: ["obs", "windows"],
    cloisonnee: false,
    sorte: "ordinateur",
    cuisine: true,
    joignable: true,
    statut: "acceptee",
    presenteeLe: "2026-10-15T09:00:00.000Z",
    accepteeLe: "2026-10-15T09:05:00.000Z",
  });
  assert.deepEqual(registre.utilisables(), [acceptee]);
  assert.deepEqual(registre.utilisables(["obs"]), [acceptee]);
  assert.deepEqual(registre.utilisables(["obs", "windows"]), [acceptee]);
  // Ce qu'elle ne fournit pas ne la sélectionne pas.
  assert.deepEqual(registre.utilisables(["code"]), []);
});

test("le chef accepte une station avec les capacités qu'il lui reconnaît : ce sont elles qui la sélectionnent, pas ce qu'elle déclare", (t) => {
  const registre = ouvrir(t);
  registre.presenter(WINDOWS);

  const acceptee = registre.accepter("windows-de-test", { capacites: ["obs"] });

  assert.deepEqual(acceptee.declarees, ["obs", "windows"]);
  assert.deepEqual(acceptee.capacites, ["obs"]);
  assert.deepEqual(registre.utilisables(["obs"]).map((station) => station.nom), ["windows-de-test"]);
  assert.deepEqual(registre.utilisables(["windows"]), []);
  // Il peut les régler de nouveau : la station reste acceptée.
  assert.deepEqual(registre.accepter("windows-de-test", { capacites: ["obs", "windows"] }).capacites, ["obs", "windows"]);
  assert.deepEqual(registre.utilisables(["windows"]).map((station) => station.nom), ["windows-de-test"]);
});

test("la sélection ne renvoie que les stations acceptées qui fournissent tout ce qui est demandé, dans l'ordre de leur nom", (t) => {
  const registre = ouvrir(t);
  registre.presenter(WINDOWS);
  registre.presenter(BOX);
  registre.presenter({ nom: "mac", machine: "macOS 26", capacites: ["code", "chrome-connecté"], cloisonnee: false });
  registre.accepter("windows-de-test");
  registre.accepter("box");

  const noms = (demande?: string[]) => registre.utilisables(demande).map((station) => station.nom);
  assert.deepEqual(noms(), ["box", "windows-de-test"]);
  assert.deepEqual(noms(["code"]), ["box"]);
  assert.deepEqual(noms(["chrome-connecté"]), []);
  assert.deepEqual(noms(["code", "obs"]), []);
  assert.deepEqual(registre.liste().map((station) => `${station.nom} ${station.statut}`), ["box acceptee", "mac en-attente", "windows-de-test acceptee"]);
});

test("le registre survit à un redémarrage : rouvert depuis le disque, il rend les mêmes stations, avec les mêmes statuts", (t) => {
  const repertoire = repertoireTemporaire(t);
  const heure = horloge();
  const premier = ouvrirRegistre(repertoire, { maintenant: heure.maintenant });
  premier.presenter(WINDOWS);
  premier.presenter(BOX);
  premier.presenter({ nom: "mac", machine: "macOS 26", capacites: ["code"], cloisonnee: false });
  heure.aller("2026-10-15T10:00:00.000Z");
  premier.accepter("box");
  premier.accepter("windows-de-test", { capacites: ["obs"] });
  premier.joignable("windows-de-test", false);
  const avant = premier.liste();
  premier.fermer();
  assert.ok(existsSync(cheminRegistre(repertoire)));

  const rouvert = ouvrir(t, repertoire, horloge("2026-10-16T08:00:00.000Z"));
  assert.deepEqual(rouvert.liste(), avant);
  assert.deepEqual(
    rouvert.liste().map(({ nom, statut, capacites, joignable }) => ({ nom, statut, capacites, joignable })),
    [
      { nom: "box", statut: "acceptee", capacites: ["code", "raisonnement"], joignable: true },
      { nom: "mac", statut: "en-attente", capacites: [], joignable: true },
      { nom: "windows-de-test", statut: "acceptee", capacites: ["obs"], joignable: false },
    ],
  );
  assert.deepEqual(
    rouvert.utilisables().map((station) => station.nom),
    ["box", "windows-de-test"],
  );
});

test("deux ouvertures du même registre — l'app et un runtime — voient chacune ce que l'autre écrit", (t) => {
  const repertoire = repertoireTemporaire(t);
  const app = ouvrir(t, repertoire);
  const runtime = ouvrir(t, repertoire);
  app.presenter(WINDOWS);
  assert.equal(runtime.lire("windows-de-test")?.statut, "en-attente");
  app.accepter("windows-de-test");
  assert.deepEqual(runtime.utilisables(["obs"]).map((station) => station.nom), ["windows-de-test"]);
});

test("joignable ou non est un état de la station, qu'elle soit en attente ou acceptée — il ne change ni son statut ni ce qu'elle fournit", (t) => {
  const registre = ouvrir(t);
  registre.presenter(WINDOWS);
  assert.equal(registre.joignable("windows-de-test", false).joignable, false);
  assert.equal(registre.lire("windows-de-test")?.statut, "en-attente");
  registre.accepter("windows-de-test");
  // Éteinte, elle reste acceptée : la sélection la rend, et c'est à celui qui
  // choisit de dire qu'elle est absente plutôt que manquante.
  assert.deepEqual(
    registre.utilisables(["obs"]).map(({ nom, joignable }) => ({ nom, joignable })),
    [{ nom: "windows-de-test", joignable: false }],
  );
  assert.equal(registre.joignable("windows-de-test", true).joignable, true);
  assert.equal(registre.lire("windows-de-test")?.statut, "acceptee");
});

test("une station déjà acceptée qui se présente de nouveau, telle quelle, reste acceptée, et se dit joignable", (t) => {
  const registre = ouvrir(t);
  registre.presenter(WINDOWS);
  registre.accepter("windows-de-test", { capacites: ["obs"] });
  registre.joignable("windows-de-test", false);

  const revenue = registre.presenter({ ...WINDOWS, capacites: ["obs", "windows", "gpu"] });

  assert.equal(revenue.statut, "acceptee");
  assert.equal(revenue.joignable, true);
  // Ce qu'elle déclare de plus est noté, mais elle ne se l'accorde pas : seul
  // le chef reconnaît une capacité.
  assert.deepEqual(revenue.declarees, ["obs", "windows", "gpu"]);
  assert.deepEqual(revenue.capacites, ["obs"]);
  assert.deepEqual(registre.utilisables(["gpu"]), []);
});

test("une station acceptée qui revient sous une autre machine, ou sans la cloison qu'elle avait, retourne « en attente » : l'acceptation ne se transmet pas", (t) => {
  const registre = ouvrir(t);
  registre.presenter(BOX);
  registre.accepter("box");

  const autre = registre.presenter({ ...BOX, machine: "Ubuntu 26.04" });
  assert.equal(autre.statut, "en-attente");
  assert.deepEqual(autre.capacites, []);
  assert.equal(autre.accepteeLe, null);
  assert.deepEqual(registre.utilisables(), []);

  registre.accepter("box");
  const decloisonnee = registre.presenter({ ...BOX, machine: "Ubuntu 26.04", cloisonnee: false });
  assert.equal(decloisonnee.statut, "en-attente");
  assert.equal(decloisonnee.cloisonnee, false);
  assert.deepEqual(registre.utilisables(), []);
});

test("une station en attente qui se présente de nouveau met à jour ce qu'elle déclare, sans changer la date de sa présentation", (t) => {
  const heure = horloge();
  const registre = ouvrir(t, undefined, heure);
  registre.presenter(WINDOWS);
  heure.aller("2026-10-15T11:00:00.000Z");

  const revenue = registre.presenter({ ...WINDOWS, machine: "Windows 11 Pro", capacites: ["obs"] });

  assert.equal(revenue.statut, "en-attente");
  assert.equal(revenue.machine, "Windows 11 Pro");
  assert.deepEqual(revenue.declarees, ["obs"]);
  assert.equal(revenue.presenteeLe, "2026-10-15T09:00:00.000Z");
  assert.equal(registre.liste().length, 1);
});

test("une capacité se compare sous une seule écriture : l'accent composé ou non, et un doublon ne compte qu'une fois", (t) => {
  const registre = ouvrir(t);
  const decompose = "chrome-connecté";
  const presentee = registre.presenter({ nom: "mac", machine: "macOS 26", capacites: [decompose, " code ", "code"], cloisonnee: false });
  assert.deepEqual(presentee.declarees, ["chrome-connecté", "code"]);
  registre.accepter("mac");
  assert.deepEqual(registre.utilisables(["chrome-connecté"]).map((station) => station.nom), ["mac"]);
  assert.deepEqual(registre.utilisables([decompose]).map((station) => station.nom), ["mac"]);
});

test("une présentation mal formée est refusée en nommant le champ en cause, et n'écrit rien", (t) => {
  const registre = ouvrir(t);
  for (const [presentation, champ] of [
    [{ ...WINDOWS, nom: "" }, /nom/],
    [{ ...WINDOWS, nom: "Windows De Test" }, /nom/],
    [{ ...WINDOWS, nom: "mac/claude" }, /nom/],
    [{ ...WINDOWS, machine: "  " }, /machine/],
    [{ ...WINDOWS, capacites: ["obs", "pas une capacité"] }, /capacité/],
    [{ ...WINDOWS, capacites: [""] }, /capacité/],
  ] as const) {
    assert.throws(() => registre.presenter(presentation), (erreur: unknown) => erreur instanceof PresentationInvalide && champ.test(erreur.message), JSON.stringify(presentation));
  }
  assert.throws(() => registre.presenter({ ...WINDOWS, cloisonnee: "non" as unknown as boolean }), PresentationInvalide);
  assert.deepEqual(registre.liste(), []);
});

test("le chef n'accepte, ni ne règle, une station que le registre ne connaît pas — et une capacité mal écrite est refusée à l'acceptation", (t) => {
  const registre = ouvrir(t);
  assert.throws(() => registre.accepter("fantome"), StationInconnue);
  assert.throws(() => registre.joignable("fantome", true), StationInconnue);
  assert.equal(registre.lire("fantome"), null);
  registre.presenter(WINDOWS);
  assert.throws(() => registre.accepter("windows-de-test", { capacites: ["o b s"] }), PresentationInvalide);
  assert.equal(registre.lire("windows-de-test")?.statut, "en-attente");
});

const TELEPHONE: Presentation = { nom: "pixel", machine: "Android 16", capacites: [], cloisonnee: false, sorte: "telephone" };

test("un téléphone est une station : la liste le rend, acceptée ou non, avec sa sorte et le champ qui dit qu'il ne cuisine pas (#1158)", (t) => {
  const registre = ouvrir(t);
  const presente = registre.presenter(TELEPHONE);
  assert.deepEqual(presente, {
    nom: "pixel",
    machine: "Android 16",
    declarees: [],
    capacites: [],
    cloisonnee: false,
    sorte: "telephone",
    cuisine: false,
    joignable: true,
    statut: "en-attente",
    presenteeLe: "2026-10-15T09:00:00.000Z",
    accepteeLe: null,
  });
  assert.deepEqual(registre.liste(), [presente]);
  const accepte = registre.accepter("pixel");
  assert.deepEqual([accepte.statut, accepte.sorte, accepte.cuisine], ["acceptee", "telephone", false]);
  assert.deepEqual(registre.liste(), [accepte]);
  assert.deepEqual(registre.lire("pixel"), accepte);
  // Une machine qui ne dit pas sa sorte est un ordinateur, et cuisine.
  assert.deepEqual([registre.presenter(BOX).sorte, registre.lire("box")?.cuisine], ["ordinateur", true]);
});

test("un téléphone n'est jamais candidat pour faire tourner les cooks d'un projet, même accepté, même seul au registre, quoi qu'on lui reconnaisse", (t) => {
  const registre = ouvrir(t);
  registre.presenter(TELEPHONE);
  registre.accepter("pixel");
  assert.equal(registre.liste().length, 1);
  assert.deepEqual(registre.utilisables(), []);
  // Le chef lui reconnaît des capacités : il ne cuisine pas davantage.
  registre.accepter("pixel", { capacites: ["code", "raisonnement"] });
  assert.deepEqual(registre.utilisables(), []);
  assert.deepEqual(registre.utilisables(["code"]), []);
  assert.deepEqual(registre.utilisables(["code", "raisonnement"]), []);
  // Revenu, présenté de nouveau tel quel, il reste accepté — et toujours hors de la sélection.
  assert.equal(registre.presenter(TELEPHONE).statut, "acceptee");
  assert.deepEqual(registre.utilisables(), []);
});

test("présenter, accepter ou retirer un téléphone ne change rien aux stations candidates pour cuire les projets", (t) => {
  const registre = ouvrir(t);
  registre.presenter(BOX);
  registre.presenter(WINDOWS);
  registre.accepter("box");
  registre.accepter("windows-de-test");
  const candidates = () => ({ toutes: registre.utilisables(), code: registre.utilisables(["code"]), obs: registre.utilisables(["obs"]) });
  const avant = candidates();
  assert.deepEqual(avant.toutes.map(({ nom }) => nom), ["box", "windows-de-test"]);

  registre.presenter(TELEPHONE);
  assert.deepEqual(candidates(), avant);
  registre.accepter("pixel", { capacites: ["code", "obs"] });
  assert.deepEqual(candidates(), avant);
  assert.deepEqual(registre.liste().map(({ nom }) => nom), ["box", "pixel", "windows-de-test"]);

  assert.deepEqual(registre.retirer("pixel").sorte, "telephone");
  assert.deepEqual(candidates(), avant);
  assert.deepEqual(registre.liste().map(({ nom }) => nom), ["box", "windows-de-test"]);
});

test("une station retirée quitte le registre ; revenue, elle se présente de nouveau en attente — et le registre ne retire pas ce qu'il ne connaît pas", (t) => {
  const registre = ouvrir(t);
  registre.presenter(BOX);
  const acceptee = registre.accepter("box");
  assert.deepEqual(registre.retirer("box"), acceptee);
  assert.equal(registre.lire("box"), null);
  assert.deepEqual(registre.liste(), []);
  assert.deepEqual(registre.utilisables(), []);
  assert.equal(registre.presenter(BOX).statut, "en-attente");
  assert.throws(() => registre.retirer("fantome"), StationInconnue);
});

test("un ordinateur accepté qui revient téléphone retourne « en attente », et ne cuisine plus : l'acceptation ne se transmet pas d'une sorte à l'autre", (t) => {
  const registre = ouvrir(t);
  registre.presenter({ ...TELEPHONE, sorte: "ordinateur" });
  registre.accepter("pixel");
  assert.deepEqual(registre.utilisables().map(({ nom }) => nom), ["pixel"]);

  const revenu = registre.presenter(TELEPHONE);
  assert.deepEqual([revenu.statut, revenu.sorte, revenu.cuisine, revenu.accepteeLe], ["en-attente", "telephone", false, null]);
  assert.deepEqual(registre.utilisables(), []);
});

test("une sorte inconnue est refusée en la nommant, et rien n'est écrit", (t) => {
  const registre = ouvrir(t);
  assert.throws(
    () => registre.presenter({ ...TELEPHONE, sorte: "montre" as unknown as "telephone" }),
    (erreur: unknown) => erreur instanceof PresentationInvalide && /sorte/.test(erreur.message) && /ordinateur ou telephone/.test(erreur.message),
  );
  assert.deepEqual(registre.liste(), []);
});

test("un registre de la version 1, écrit avant les sortes, s'ouvre avec ses stations intactes : ce sont des ordinateurs, qui cuisinent", (t) => {
  const repertoire = repertoireTemporaire(t);
  const ancienne = new Base(cheminRegistre(repertoire));
  ancienne.script(`
    CREATE TABLE stations (
      nom          TEXT PRIMARY KEY,
      machine      TEXT NOT NULL,
      declarees    TEXT NOT NULL,
      capacites    TEXT NOT NULL,
      cloisonnee   INTEGER NOT NULL CHECK (cloisonnee IN (0, 1)),
      joignable    INTEGER NOT NULL CHECK (joignable IN (0, 1)),
      statut       TEXT NOT NULL CHECK (statut IN ('en-attente', 'acceptee')),
      presentee_le TEXT NOT NULL,
      acceptee_le  TEXT
    ) STRICT;
    INSERT INTO stations VALUES ('box', 'Debian 13', '["code"]', '["code"]', 1, 1, 'acceptee', '2026-10-15T09:00:00.000Z', '2026-10-15T09:05:00.000Z');
    PRAGMA user_version = 1;
  `);
  ancienne.fermer();

  const registre = ouvrir(t, repertoire);
  assert.deepEqual(
    registre.liste().map(({ nom, sorte, cuisine, statut, capacites }) => ({ nom, sorte, cuisine, statut, capacites })),
    [{ nom: "box", sorte: "ordinateur", cuisine: true, statut: "acceptee", capacites: ["code"] }],
  );
  assert.deepEqual(registre.utilisables(["code"]).map(({ nom }) => nom), ["box"]);
  // Et il prend des téléphones.
  registre.presenter(TELEPHONE);
  registre.accepter("pixel");
  assert.deepEqual(registre.utilisables().map(({ nom }) => nom), ["box"]);
});

test("le registre est un fichier du répertoire qu'on lui donne, créé au besoin — il n'appartient à aucun projet", (t) => {
  const repertoire = join(repertoireTemporaire(t), "chef", "brigade");
  ouvrir(t, repertoire);
  assert.equal(cheminRegistre(repertoire), join(repertoire, "stations.db"));
  assert.ok(existsSync(cheminRegistre(repertoire)));
});
