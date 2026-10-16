// La connexion Max branchée sur de vraies cuisines — rail, garde-fous,
// station, faux `claude` : perdue, chacune suspend sans lancer de cook pour
// le découvrir ; rétablie par un login, chacune reprend seule. La veille et le
// minuteur du renouvellement tournent sur une horloge simulée.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { brancherConnexionMax } from "../../src/connexion-max/cuisine.ts";
import { configVeille, RELECTURE_MS, veillerConnexionMax } from "../../src/connexion-max/veille.ts";
import { etatDesGardeFous } from "../../src/projections/garde-fous.ts";
import { etatStation } from "../../src/projections/stations.ts";
import { chef, cuisine, issue, STATION } from "../aides/cuisine.ts";
import { aArreter, jusqua, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";
import { horlogeSimulee } from "./horloge.ts";

const rienNeReste = temporaireDuFichier();

// Le minuteur du renouvellement que le paquet livre : un passage toutes les
// trente secondes.
const PASSAGE_MS = 30_000;

// La station d'une machine : sa veille, sur une horloge simulée, et le fichier
// d'état que le renouvellement y tient.
function machine(t: TestContext) {
  const racine = repertoireTemporaire(t);
  const fichiers = configVeille({}, racine);
  mkdirSync(join(racine, ".session"), { recursive: true });
  // Le même départ que l'horloge des cuisines de test : les dates de la veille
  // et celles de leurs journaux se comparent.
  const horloge = horlogeSimulee("2026-10-08T10:00:00.000Z");
  const lignes: string[] = [];
  // Une date du fichier d'état : l'heure simulée, à la seconde, comme `date -u`.
  const date = (decalageS = 0) => new Date(Math.floor(horloge.maintenant().getTime() / 1000) * 1000 + decalageS * 1000).toISOString().replace(".000Z", "Z");
  const consigner = (texte: string) => writeFileSync(fichiers.renouvellement, texte);
  // La connexion faite il y a une heure, et le renouvellement qui le constate.
  consigner(`verifie=${date()}\necrits=${date(-3600)}\n`);
  const veille = veillerConnexionMax({ ...fichiers, dire: (ligne) => void lignes.push(ligne), maintenant: horloge.maintenant, minuterie: horloge.minuterie });
  aArreter(t, () => veille.arreter());
  return { fichiers, horloge, veille, lignes, date, consigner };
}

const cuisineServie = (t: TestContext, veille: ReturnType<typeof machine>["veille"], projet: string, numero: number) => {
  const servie = cuisine(t, { projet, issues: [issue(numero)] });
  const runtime = brancherConnexionMax(servie.runtime, veille);
  aArreter(t, () => runtime.arreter("fin du test"));
  return servie;
};

test("connexion perdue d'après le renouvellement : les cuisines de tous les projets suspendent, sans lancer un cook ni rien compter comme échec", async (t) => {
  const { veille, date, consigner, horloge } = machine(t);
  consigner(`verifie=${date(-60)}\necrits=${date(-3600)}\nechec=${date()}\nechec_nature=session-refusee\nechec_detail=Anthropic a refusé le renouvellement\n`);
  horloge.avancer(RELECTURE_MS);
  assert.equal(veille.connexion().etat, "perdue");

  const brigade = cuisineServie(t, veille, "brigade", 14);
  const espace = cuisineServie(t, veille, "espace", 15);
  for (const [projet, numero] of [[brigade, 14], [espace, 15]] as const) {
    await jusqua(() => projet.types().includes("station.disconnected"));
    await jusqua(() => projet.etat(numero) === "waiting");
  }
  // Le temps qu'un cook parte, s'il devait partir : la station a servi, le
  // rail a sondé — et rien n'est parti.
  await jusqua(() => brigade.types().filter((type) => type === "runtime.ticked").length >= 5 && espace.types().filter((type) => type === "runtime.ticked").length >= 5);

  for (const [projet, numero] of [[brigade, 14], [espace, 15]] as const) {
    assert.deepEqual(projet.dernier("station.disconnected"), { station: STATION, reason: "session-refusee", run: null });
    assert.equal(projet.lancements().length, 0);
    assert.equal(projet.etat(numero), "waiting");
    // Ni échec, ni disjoncteur, ni commentaire : la suspension n'est pas une panne.
    assert.equal(etatDesGardeFous(projet.journal.base).failures, 0);
    assert.equal(etatDesGardeFous(projet.journal.base).breakerOpenedAt, null);
    assert.deepEqual(projet.gh.commentaires, []);
    assert.equal(projet.types().filter((type) => type === "station.disconnected").length, 1);
  }
});

test("un cook qui voit la connexion tomber la fait perdre à toute la machine : l'autre projet suspend sans lancer le sien", async (t) => {
  const { veille } = machine(t);
  const premier = cuisine(t, { projet: "brigade", scenario: "non-connecte", issues: [issue(14)] });
  brancherConnexionMax(premier.runtime, veille);
  await jusqua(() => premier.types().includes("station.disconnected"));
  await jusqua(() => veille.connexion().etat === "perdue");
  assert.equal(veille.connexion().raison, "authentication_failed");

  const second = cuisineServie(t, veille, "espace", 15);
  await jusqua(() => second.types().includes("station.disconnected"));
  await jusqua(() => second.etat(15) === "waiting");
  await jusqua(() => second.types().filter((type) => type === "runtime.ticked").length >= 5);
  assert.equal(second.lancements().length, 0);
  assert.equal(second.etat(15), "waiting");
  assert.equal(premier.cooks().length, 1);
});

test("après un login — seul geste —, la cuisine reprend seule, sans redémarrage, dans la minute de l'horloge simulée", async (t) => {
  const { veille, horloge, date, consigner, lignes } = machine(t);
  // Un renouvellement refusé : la connexion tombe, la cuisine suspend.
  const refus = () => `verifie=${date(-3600)}\necrits=${date(-7200)}\nechec=${date()}\nechec_nature=session-refusee\n`;
  consigner(refus());
  horloge.avancer(RELECTURE_MS);
  const servie = cuisineServie(t, veille, "brigade", 15);
  await jusqua(() => etatStation(servie.journal.base, STATION)?.disconnectedAt != null);

  // Le minuteur du renouvellement : à chaque passage, le refus continue — tant
  // que personne ne s'est connecté.
  let login: string | null = null;
  let dernierRefus = date();
  const passage = () => {
    if (login === null) dernierRefus = date();
    // Un passage réussi garde le dernier échec, comme le renouvellement.
    consigner(login === null ? refus() : `verifie=${date()}\necrits=${login}\nechec=${dernierRefus}\nechec_nature=session-refusee\n`);
  };
  horloge.minuterie.repeter(passage, PASSAGE_MS);
  horloge.avancer(5 * 60_000);
  assert.equal(veille.connexion().etat, "perdue");
  assert.equal(servie.lancements().length, 0);

  // Le chef se connecte au pire moment : juste après un passage.
  horloge.avancer(PASSAGE_MS - (horloge.ecoule() % PASSAGE_MS) + 1_000);
  login = date();
  const depart = horloge.ecoule();
  // La minute passe, seconde par seconde : la station voit le login au
  // passage suivant, et la cuisine reprend.
  let reprise: number | null = null;
  while (horloge.ecoule() - depart < 60_000) {
    horloge.avancer(1_000);
    if (servie.types().includes("session.restored")) {
      reprise = horloge.ecoule() - depart;
      break;
    }
  }
  assert.ok(reprise !== null && reprise <= 60_000, `cuisine reprise ${reprise === null ? "jamais" : `${reprise} ms`} après le login`);
  assert.deepEqual(servie.dernier("session.restored"), { stations: [STATION], verified: new Date(login).toISOString() });
  assert.match(lignes.join("\n"), /connexion Max rétablie, la cuisine reprend/);

  // Et le ticket qui attendait part, sans « resume » ni redémarrage.
  await jusqua(() => servie.etat(15) === "pass");
  assert.equal(servie.cooks().length, 1);
});

test("le « reprendre » du chef après la perte reste le sien : la veille ne resuspend pas le projet", async (t) => {
  const { veille, date, consigner, horloge } = machine(t);
  consigner(`verifie=${date(-60)}\necrits=${date(-3600)}\nechec=${date()}\nechec_nature=session-refusee\n`);
  horloge.avancer(RELECTURE_MS);
  const servie = cuisineServie(t, veille, "brigade", 15);
  await jusqua(() => servie.types().includes("station.disconnected"));

  chef(servie.repertoire, "kitchen.resumed");
  await jusqua(() => servie.cooks().length === 1);
  horloge.avancer(RELECTURE_MS * 4);
  assert.equal(servie.types().filter((type) => type === "station.disconnected").length, 1);
});

test("rien ne reste", () => rienNeReste());

test("avec un jeton longue durée, un échec `session-refusee` du renouvellement ne fait pas tomber la connexion ; sans jeton, il la fait tomber", (t) => {
  const { fichiers, horloge, lignes, date, consigner } = machine(t);
  consigner(`verifie=${date(-60)}\nechec=${date()}\nechec_nature=session-refusee\n`);
  const avecJeton = veillerConnexionMax({ ...fichiers, jeton: true, dire: () => {}, maintenant: horloge.maintenant, minuterie: horloge.minuterie });
  aArreter(t, () => avecJeton.arreter());
  horloge.avancer(RELECTURE_MS);
  assert.equal(avecJeton.connexion().etat, "inconnue");
  const sansJeton = veillerConnexionMax({ ...fichiers, dire: (ligne) => void lignes.push(ligne), maintenant: horloge.maintenant, minuterie: horloge.minuterie });
  aArreter(t, () => sansJeton.arreter());
  assert.equal(sansJeton.connexion().etat, "perdue");
});
