// Les stations que l'app appaire à un projet en plus de sa principale : lues
// dans les gists appairés du compte, déclarées au journal du projet sans
// commande du chef, avec ce qu'elles fournissent, et dites atteintes ou non.
// D'abord de bout en bout, sur un GitHub doublé où la station publie son état
// par sa vraie présence ; puis chaque cas, sur une lecture faite à la main.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { canalGitHub } from "../../src/appairage/canal.ts";
import { FICHIER_APPAIRAGE } from "../../src/appairage/document.ts";
import { FICHIER_LOCAL, tenirPresence } from "../../src/appairage/presence.ts";
import { lireLesStationsEtLeursGists } from "../../src/appairage/stations-du-chef.ts";
import { decisionsPosees } from "../../src/decisions.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { documentDeDemande, FICHIER_PROJETS, type ProjetDemande } from "../../src/projets/demande.ts";
import { declarationDe, declarerLesSecondaires, injoignables, secondairesDuProjet } from "../../src/projets/secondaires.ts";
import { lireStations } from "../../src/stations-declarees.ts";
import { lectureDesAppairees, type Publiee } from "../aides/appairees.ts";
import { repertoireTemporaire, temporaireDuFichier } from "../outils.ts";
import { FAUX_GH_GISTS as FAUX_GH } from "../appairage/doublure-des-gists.ts";

const rienNeReste = temporaireDuFichier();

const INSTANT = Date.parse("2026-10-26T10:00:00Z");
const BOX = { nom: "box", gist: "gistbox" };
const SHOP: ProjetDemande = { nom: "shop", depot: "acme/shop", base: "main", principale: false, cooks: 2, manager: null, reviewer: null, ouvertLe: null, demandeLe: null, fournit: ["macos"] };

// Un journal de projet où la station principale a posé ses décisions du parcours.
function unProjet(t: TestContext, declaration = "box/claude:2:code+raisonnement") {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire);
  journal.ajouter({ project: "shop", ticket: null, author: "chef", type: "decision.set", payload: { name: "BRIGADE_STATIONS", value: declaration, previous: null } });
  journal.fermer();
  const declaree = () => {
    const lu = ouvrirJournal(repertoire, { lectureSeule: true });
    try {
      return decisionsPosees(lu.base).BRIGADE_STATIONS;
    } finally {
      lu.fermer();
    }
  };
  return { repertoire, declaree };
}

const lecture = (...publiees: Publiee[]) => lectureDesAppairees(INSTANT, ...publiees);

test("de bout en bout : un Mac appairé, ajouté au projet par l'app sans en être la principale, est lu dans son gist et déclaré au journal du projet avec `macos` — aucune commande du chef", async (t) => {
  const gists = repertoireTemporaire(t);
  const avant = process.env.FAUX_GISTS;
  process.env.FAUX_GISTS = gists;
  t.after(() => (avant === undefined ? delete process.env.FAUX_GISTS : (process.env.FAUX_GISTS = avant)));
  // Le Mac publie son état par sa vraie présence, sur le vrai canal.
  const racine = join(repertoireTemporaire(t), "mac");
  mkdirSync(racine);
  const presence = tenirPresence({ racine, canal: canalGitHub({ gh: FAUX_GH }), identite: { nom: "MacBook Air de Benoit", machine: "macOS 25.0.0", version: "1.4.0" }, projets: () => [], dire: () => {}, apres: () => () => {} });
  await presence.publier();
  const { gist } = JSON.parse(readFileSync(join(racine, FICHIER_LOCAL), "utf8")) as { gist: string };
  // Ce que l'app écrit dans son gist : appairé, puis le projet ajouté, sans en être la principale.
  const fichier = join(gists, `${gist}.gist.json`);
  const ecrit = JSON.parse(readFileSync(fichier, "utf8")) as { files: Record<string, { filename: string; content: string }> };
  ecrit.files[FICHIER_APPAIRAGE] = { filename: FICHIER_APPAIRAGE, content: JSON.stringify({ appaireeLe: new Date().toISOString(), empreinte: "e" }) };
  ecrit.files[FICHIER_PROJETS] = { filename: FICHIER_PROJETS, content: documentDeDemande([SHOP]) };
  writeFileSync(fichier, JSON.stringify(ecrit));

  const lue = await lireLesStationsEtLeursGists({ gh: FAUX_GH, env: { PATH: process.env.PATH ?? "", FAUX_GISTS: gists } });
  const trouvees = secondairesDuProjet(lue, "acme/shop", BOX);
  assert.deepEqual(trouvees, [{ nom: "MacBook Air de Benoit", station: "macbook-air-de-benoit/claude", gist, cooks: 2, fournit: ["code", "raisonnement", "macos"], atteinte: true, dit: "reached: it is online on GitHub" }]);
  assert.ok(Array.isArray(trouvees));

  const projet = unProjet(t);
  assert.deepEqual(declarerLesSecondaires(projet.repertoire, "shop", trouvees), { ecrites: ["macbook-air-de-benoit/claude"], refusees: [] });
  assert.equal(projet.declaree(), "box/claude:2:code+raisonnement,macbook-air-de-benoit/claude:2:code+raisonnement+macos:distante+ensemble");
  // Le runtime la lit : une station de plus du projet, qui tire son travail et fournit `macos`.
  const [, mac] = lireStations({ BRIGADE_STATIONS: projet.declaree() });
  assert.deepEqual(mac, { nom: "macbook-air-de-benoit/claude", moteur: "claude", fournit: ["code", "raisonnement", "macos"], cooks: 2, distante: true, ordinaires: true, ensemble: true });

  // Arrêté proprement, il n'est plus atteint, et dit pourquoi.
  await presence.arreter();
  const apres = secondairesDuProjet(await lireLesStationsEtLeursGists({ gh: FAUX_GH, env: { PATH: process.env.PATH ?? "", FAUX_GISTS: gists } }), "acme/shop", BOX);
  assert.ok(Array.isArray(apres));
  assert.equal(apres[0]?.atteinte, false);
  assert.match(apres[0]?.dit ?? "", /^not reached: it stopped at \d{4}-/);
});

test("seules sont secondaires les stations qui cuisent et que l'app ajoute à ce dépôt sans en faire la principale — ni la principale elle-même, ni un téléphone, ni une station qui remet le projet", () => {
  const autre: ProjetDemande = { ...SHOP, nom: "cantine", depot: "acme/cantine" };
  const lue = lecture(
    { id: "gistmac", nom: "mac", projets: [SHOP, autre] },
    // La principale se lit aussi dans les gists du compte : par son gist, ou par son nom.
    { id: BOX.gist, nom: "box", projets: [{ ...SHOP, principale: true }] },
    { id: "gistbox2", nom: "Box", projets: [SHOP] },
    { id: "gisttel", nom: "telephone", sorte: "telephone", projets: [SHOP] },
    { id: "gistpc", nom: "pc", projets: [{ ...SHOP, principale: true }] },
    { id: "gistvieux", nom: "vieux", projets: [{ ...SHOP, remise: { vers: "box", gist: BOX.gist, demandeLe: "2026-10-26T09:00:00.000Z" } }] },
    { id: "gistnu", nom: "nu" },
  );
  const trouvees = secondairesDuProjet(lue, "Acme/Shop", BOX);
  assert.ok(Array.isArray(trouvees));
  assert.deepEqual(
    trouvees.map(({ station, fournit }) => [station, fournit]),
    [["mac/claude", ["code", "raisonnement", "macos"]]],
  );
});

test("sans capacité cochée, une secondaire fournit ce que fournit son moteur ; deux stations au même nom de machine, la première lue est gardée", () => {
  const { fournit: _fournit, ...sansCapacite } = SHOP;
  const trouvees = secondairesDuProjet(lecture({ id: "a", nom: "mac", projets: [{ ...sansCapacite, cooks: 1 }] }, { id: "b", nom: "Mac", projets: [SHOP] }), "acme/shop", BOX);
  assert.deepEqual(trouvees, [{ nom: "mac", station: "mac/claude", gist: "a", cooks: 1, fournit: ["code", "raisonnement"], atteinte: true, dit: "reached: it is online on GitHub" }]);
});

test("atteinte ou non : en ligne, arrêtée proprement, ou muette depuis plus de deux signes de vie — chacune dite en une phrase", () => {
  const trouvees = secondairesDuProjet(lecture({ id: "a", nom: "mac", projets: [SHOP], signe: 4 }, { id: "b", nom: "pc", projets: [SHOP], signe: 2, arretee: true }, { id: "c", nom: "linux", projets: [SHOP], signe: 11 }), "acme/shop", BOX);
  assert.ok(Array.isArray(trouvees));
  assert.deepEqual(
    trouvees.map(({ station, atteinte, dit }) => [station, atteinte, dit]),
    [
      ["mac/claude", true, "reached: it is online on GitHub"],
      ["pc/claude", false, "not reached: it stopped at 2026-10-26T09:58:00.000Z"],
      ["linux/claude", false, "not reached: no sign of life on GitHub since 2026-10-26T09:49:00.000Z"],
    ],
  );
});

test("GitHub illisible : rien n'est trouvé ni retiré — celles qu'une lecture précédente a trouvées restent, non atteintes, et la raison est dite", () => {
  assert.deepEqual(secondairesDuProjet({ etat: { state: "unavailable", cause: "network", reason: "GitHub cannot be reached from this computer." }, gists: new Map() }, "acme/shop", BOX), { illisible: "GitHub cannot be reached from this computer." });
  const connues = secondairesDuProjet(lecture({ id: "a", nom: "mac", projets: [SHOP] }), "acme/shop", BOX);
  assert.ok(Array.isArray(connues));
  assert.deepEqual(
    injoignables(connues, "GitHub cannot be reached from this computer.").map(({ station, atteinte, dit }) => [station, atteinte, dit]),
    [["mac/claude", false, "not reached: its gist could not be read on GitHub — GitHub cannot be reached from this computer"]],
  );
});

test("la déclaration : ajoutée à celles du projet, réécrite seule quand l'app change son plafond ou ses capacités, rien de réécrit quand rien ne change ; la box reste écrite telle quelle", (t) => {
  const projet = unProjet(t, "box/claude:3:code+raisonnement , box/playwright:1:navigateur-headless");
  const mac = { nom: "mac", station: "mac/claude", gist: "a", cooks: 2, fournit: ["code", "raisonnement", "macos"], atteinte: true, dit: "" };
  assert.deepEqual(declarerLesSecondaires(projet.repertoire, "shop", [mac]).ecrites, ["mac/claude"]);
  assert.equal(projet.declaree(), "box/claude:3:code+raisonnement,box/playwright:1:navigateur-headless,mac/claude:2:code+raisonnement+macos:distante+ensemble");
  assert.deepEqual(declarerLesSecondaires(projet.repertoire, "shop", [mac]).ecrites, []);
  assert.deepEqual(declarerLesSecondaires(projet.repertoire, "shop", [{ ...mac, cooks: 1, fournit: ["code", "raisonnement", "macos", "enregistrement-ecran"] }]).ecrites, ["mac/claude"]);
  assert.equal(projet.declaree(), "box/claude:3:code+raisonnement,box/playwright:1:navigateur-headless,mac/claude:1:code+raisonnement+macos+enregistrement-ecran:distante+ensemble");
  // Une station que le chef avait déclarée à la main sous ce nom suit désormais son appairage.
  const main = unProjet(t, "box/claude:2:code,mac/claude:1:chrome-connecte:distante");
  assert.deepEqual(declarerLesSecondaires(main.repertoire, "shop", [mac]).ecrites, ["mac/claude"]);
  assert.equal(main.declaree(), "box/claude:2:code,mac/claude:2:code+raisonnement+macos:distante+ensemble");
  assert.deepEqual(declarationDe(mac), { nom: "mac/claude", moteur: "claude", fournit: ["code", "raisonnement", "macos"], cooks: 2, distante: true, ordinaires: true, ensemble: true });
});

test("secondaires.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
