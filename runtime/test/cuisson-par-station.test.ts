// La cuisine d'un projet se lance et s'arrête station par station, par le même
// geste pour une station d'ici et pour une distante (`station -- stop|start
// <station>`). Arrêter ne coupe aucun cook : celui qui tourne finit — il livre,
// ou son ticket revient au rail —, et la station ne prend plus rien. Ce que
// chaque station fait du projet se lit dans `facts` : son état (`cooking`,
// `stopped`, `saturated`, `refused`) et ses cooks en cours, chacun avec le nom
// de sa station.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Demande, Mission, Reponse } from "../src/events/remote.ts";
import { CUISSONS, faits, lireEtat, type Faits } from "../src/etat.ts";
import type { Fait } from "../src/evenements.ts";
import { principal as faitsDuProjet } from "../src/faits.ts";
import { MARQUEUR } from "../src/fiche.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { annoncerEnService, EN_SERVICE, refusDuProjet } from "../src/mise-a-jour/en-service.ts";
import { principal as station } from "../src/montrer-station.ts";
import { etatStation } from "../src/projections/stations.ts";
import { refus } from "../src/projets/refus.ts";
import { lireStations } from "../src/stations-declarees.ts";
import { demander } from "./aides/demander.ts";
import { chef, cuisine, issue } from "./aides/cuisine.ts";
import { appeler, horloge, JOUR_HORLOGE, jusqua, repertoireTemporaire } from "./outils.ts";

const [BOX, MAC] = ["box/claude", "mac/claude"];

// Le geste du chef, depuis son propre process — celui que l'app lance.
async function geste(repertoire: string, ...args: string[]) {
  const lance = appeler(station, args, { BRIGADE_STATE_DIR: repertoire });
  return { code: await lance.fin, sortie: lance.sortie() };
}

// Ce que l'app lit du projet : `facts`, depuis son propre process.
async function lireFaits(repertoire: string, env: Record<string, string> = {}): Promise<Faits> {
  const lance = appeler(faitsDuProjet, [], { BRIGADE_STATE_DIR: repertoire, ...env });
  assert.equal(await lance.fin, 0, lance.sortie());
  return JSON.parse(lance.sortie()) as Faits;
}
const ligneDe = (forme: Faits, nom: string) => forme.stations.find((ligne) => ligne.station === nom);

// Le temps qu'une prise qui ne doit pas avoir lieu aurait largement eu pour se faire.
const laisserServir = () => new Promise((resoudre) => setTimeout(resoudre, 80));

// Les faits qui diraient qu'un cook a été coupé, ou son ticket repris.
const COUPURES = ["cook.exited", "cook.interrupted", "guard.tripped", "ticket.released"];

// Un journal sans runtime, et deux stations : une d'ici, une distante.
function journalDeDeuxStations(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire, { maintenant: horloge() });
  t.after(() => journal.fermer());
  const noter = (fait: Fait, author = "runtime") => journal.ajouter({ project: "brigade", ticket: null, author, ...fait });
  noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
  noter({ type: "station.announced", payload: { station: BOX, engine: "claude", provides: ["code"], maxCooks: 2 } });
  noter({ type: "station.announced", payload: { station: MAC, engine: "claude", provides: ["chrome-connecté"], maxCooks: 1, remote: true } });
  return { repertoire, journal, noter };
}

describe("l'état de chaque station, pour l'app", () => {
  test("chaque station a son mot d'une liste fermée — refusée, puis arrêtée, puis saturée, sinon elle cuisine — le premier vrai l'emporte", (t) => {
    const { journal, noter } = journalDeDeuxStations(t);
    const a = new Date(`${JOUR_HORLOGE}T11:00:00.000Z`);
    const lire = (refusDeLaMachine: ReturnType<typeof refus> | null = null) => faits(lireEtat(journal, a), a, undefined, null, refusDeLaMachine).stations;
    const mots = (refusDeLaMachine: ReturnType<typeof refus> | null = null) => lire(refusDeLaMachine).map(({ station, cuisson }) => [station, cuisson]);

    assert.deepEqual(CUISSONS, ["cooking", "stopped", "saturated", "refused"]);
    assert.deepEqual(mots(), [[BOX, "cooking"], [MAC, "cooking"]]);

    // La machine d'ici sature : sa station seule — la box ne voit pas le poste d'une distante.
    noter({ type: "station.saturated", payload: { station: BOX, resource: "cpu", observed: 20, limit: 12 } });
    assert.deepEqual(mots(), [[BOX, "saturated"], [MAC, "cooking"]]);

    // Le chef l'arrête : arrêtée l'emporte sur saturée, et dit depuis quand.
    noter({ type: "station.stopped", payload: { station: BOX } }, "chef"); // 10:00:04
    assert.deepEqual(mots(), [[BOX, "stopped"], [MAC, "cooking"]]);
    assert.deepEqual(lire().map(({ arreteeDepuis }) => arreteeDepuis), [`${JOUR_HORLOGE}T10:00:04.000Z`, null]);
    // Un redémarrage rejoue le journal : l'arrêt tient, comme une station retirée puis redéclarée.
    journal.reconstruire();
    noter({ type: "station.withdrawn", payload: { station: BOX } });
    noter({ type: "station.announced", payload: { station: BOX, engine: "claude", provides: ["code"], maxCooks: 2 } });
    noter({ type: "station.saturated", payload: { station: BOX, resource: "cpu", observed: 20, limit: 12 } });
    assert.deepEqual(mots(), [[BOX, "stopped"], [MAC, "cooking"]]);

    // Toute la cuisine arrêtée : plus aucune station ne cuisine, sans qu'aucune soit arrêtée par son geste.
    noter({ type: "kitchen.stopped", payload: {} }, "chef");
    assert.deepEqual(mots(), [[BOX, "stopped"], [MAC, "stopped"]]);
    assert.equal(lire()[1]?.arreteeDepuis, null);
    noter({ type: "kitchen.resumed", payload: {} }, "chef");

    // La station de cette machine refuse le projet : ses stations d'ici sont refusées — pas arrêtées —, avec la cause ; une distante n'en est pas.
    const refusee = refus("sandbox-unusable");
    assert.deepEqual(mots(refusee), [[BOX, "refused"], [MAC, "cooking"]]);
    assert.deepEqual(lire(refusee).map((ligne) => ligne.refus), [refusee, null]);

    // Relancée, elle cuisine de nouveau — saturée tant que sa machine l'est.
    noter({ type: "station.started", payload: { station: BOX } }, "chef");
    noter({ type: "station.relieved", payload: { station: BOX } });
    assert.deepEqual(mots(), [[BOX, "cooking"], [MAC, "cooking"]]);
    assert.equal(lire()[0]?.arreteeDepuis, null);
  });

  test("le refus se lit dans ce que la station de la machine dit d'elle-même, avec sa cause — `facts` d'un projet refusé le porte sur ses stations d'ici", async (t) => {
    const { repertoire } = journalDeDeuxStations(t);
    const racine = repertoireTemporaire(t);
    const arreter = annoncerEnService(racine, () => ({ servis: ["autre"], refuses: { brigade: "sa porte n'est pas ouverte" }, causes: { brigade: "door-not-open" } }), { version: "1.2.0", pid: 4242 });
    arreter();

    assert.deepEqual(refusDuProjet(racine, "brigade"), refus("door-not-open"));
    assert.equal(refusDuProjet(racine, "autre"), null);
    assert.equal(refusDuProjet(undefined, "brigade"), null);
    assert.equal(refusDuProjet(racine, undefined), null);
    const forme = await lireFaits(repertoire, { BRIGADE_STATION_DIR: racine, BRIGADE_PROJECT: "brigade" });
    assert.deepEqual([ligneDe(forme, BOX)?.cuisson, ligneDe(forme, BOX)?.refus?.code, ligneDe(forme, MAC)?.cuisson], ["refused", "door-not-open", "cooking"]);
    // Sans la station de la machine, rien n'est refusé.
    assert.equal(ligneDe(await lireFaits(repertoire), BOX)?.cuisson, "cooking");

    // Une station d'avant `causes` ne dit pas pourquoi : le refus est là, sa cause inconnue.
    writeFileSync(join(racine, EN_SERVICE), `${JSON.stringify({ version: "1.1.0", pid: 1, depuis: "2026-10-15T14:02:00.000Z", servis: [], refuses: { brigade: "boum" } })}\n`);
    assert.deepEqual(refusDuProjet(racine, "brigade"), refus("unexpected"));
  });
});

describe("le geste du chef : `station -- stop|start <station>`", () => {
  test("il écrit l'arrêt ou la relance au journal, une fois — une station inconnue est refusée, et rien n'est écrit", async (t) => {
    const { repertoire, journal } = journalDeDeuxStations(t);
    const ecrits = () => journal.tout().filter(({ type }) => type === "station.stopped" || type === "station.started").map(({ type, author, payload }) => [type, author, payload]);

    const arret = await geste(repertoire, "stop", MAC);
    assert.equal(arret.code, 0, arret.sortie);
    assert.match(arret.sortie, /^brigade : mac\/claude: stopped — it takes no more tickets of this project, no cook is running there; `station -- start mac\/claude` to start it again/);
    assert.deepEqual(ecrits(), [["station.stopped", "chef", { station: MAC }]]);

    const encore = await geste(repertoire, "stop", MAC);
    assert.equal(encore.code, 0);
    assert.match(encore.sortie, /mac\/claude: already stopped since .* — nothing is written/);
    assert.equal(ecrits().length, 1);

    // `station` le montre sur la ligne de la station.
    const vue = appeler(station, [], { BRIGADE_STATE_DIR: repertoire });
    assert.equal(await vue.fin, 0);
    assert.match(vue.sortie(), /^cooking {15}STOPPED by you since .* — it takes no more tickets of this project, its running cooks finish; `station -- start mac\/claude` to start it again$/m);
    assert.match(vue.sortie(), /^cooking {15}on — `station -- stop box\/claude` to stop the project's cooking here, its running cooks finish$/m);

    const relance = await geste(repertoire, "start", MAC);
    assert.equal(relance.code, 0, relance.sortie);
    assert.match(relance.sortie, /^brigade : mac\/claude: cooking — it takes the project's tickets again at the runtime's next read/);
    assert.match((await geste(repertoire, "start", MAC)).sortie, /mac\/claude: already cooking — nothing is written/);
    assert.deepEqual(ecrits().map(([type]) => type), ["station.stopped", "station.started"]);

    // Une station que le projet ne déclare pas : refusée, en nommant les siennes.
    const inconnue = await geste(repertoire, "stop", "mac/chrome");
    assert.equal(inconnue.code, 1);
    assert.match(inconnue.sortie, /unknown station: “mac\/chrome” — the project's stations: box\/claude, mac\/claude/);
    // Mal écrit : rien n'est demandé.
    assert.equal((await geste(repertoire, "stop")).code, 2);
    assert.equal((await geste(repertoire, "start", BOX, MAC)).code, 2);
    assert.equal(ecrits().length, 2);
  });

  test("toute la cuisine arrêtée, relancer une station le dit : c'est `guardrails -- resume` qui la rouvre", async (t) => {
    const { repertoire, noter } = journalDeDeuxStations(t);
    noter({ type: "kitchen.stopped", payload: {} }, "chef");
    await geste(repertoire, "stop", BOX);
    assert.match((await geste(repertoire, "start", BOX)).sortie, /box\/claude: cooking — .*; the whole kitchen is stopped too: `guardrails -- resume` to reopen it/);
  });
});

describe("sur une cuisine qui tourne", { concurrency: 4 }, () => {
  test("lancer : arrêtée, la station ne prend rien — `stopped` ; lancée, elle prend le ticket et passe à `cooking`, son cook dit sa station", async (t) => {
    const { repertoire, journal, gh, etat, lancements, dernier } = cuisine(t, { scenario: "commite-puis-attend" });
    await jusqua(() => etatStation(journal.base, BOX) !== null);
    assert.equal((await geste(repertoire, "stop", BOX)).code, 0);

    gh.poser(issue(14));
    await jusqua(() => etat(14) === "waiting" && etatStation(journal.base, BOX)?.heldReason === "station-stopped");
    await laisserServir();
    assert.deepEqual([etat(14), lancements().length], ["waiting", 0]);
    const arretee = ligneDe(await lireFaits(repertoire), BOX);
    assert.deepEqual([arretee?.cuisson, arretee?.cooks], ["stopped", []]);
    assert.notEqual(arretee?.arreteeDepuis, null);

    assert.equal((await geste(repertoire, "start", BOX)).code, 0);
    await jusqua(() => etat(14) === "taken" && lancements().length === 1 && dernier("cook.launched", 14) !== undefined);
    const lancee = ligneDe(await lireFaits(repertoire), BOX);
    assert.deepEqual([lancee?.cuisson, lancee?.arreteeDepuis], ["cooking", null]);
    assert.deepEqual(lancee?.cooks, [{ ticket: 14, titre: "Ticket 14", station: BOX }]);
  });

  test("arrêter laisse finir le cook en cours : rien ne le coupe, il livre — rien n'est perdu — et la station ne prend plus rien", async (t) => {
    const { repertoire, journal, gh, etat, types, lancements, conclure, dernier } = cuisine(t, { scenario: "commite-puis-attend", issues: [issue(14)] });
    await jusqua(() => lancements().length === 1 && types(14).includes("cook.launched"));

    const arret = await geste(repertoire, "stop", BOX);
    assert.match(arret.sortie, /box\/claude: stopped — it takes no more tickets of this project, its 1 running cook finishes: delivered, or the ticket goes back to the rail/);
    gh.poser(issue(15));
    await jusqua(() => etat(15) === "waiting" && etatStation(journal.base, BOX)?.heldReason === "station-stopped");
    // Le cook en vol n'est pas touché : il tourne, son ticket est à lui.
    assert.deepEqual(types(14).filter((type) => COUPURES.includes(type)), []);
    assert.equal(etat(14), "taken");
    const enCours = ligneDe(await lireFaits(repertoire), BOX);
    assert.deepEqual([enCours?.cuisson, enCours?.cooks.map(({ ticket, station: sienne }) => [ticket, sienne])], ["stopped", [[14, BOX]]]);

    // Il finit de lui-même, comme il aurait fini : sa livraison va en pass.
    conclure();
    await jusqua(() => etat(14) === "pass");
    assert.equal(dernier("cook.exited", 14)?.outcome, "ok");
    // Sa place libérée, la station arrêtée ne prend toujours rien.
    await laisserServir();
    assert.deepEqual([etat(15), lancements().length], ["waiting", 1]);
    const vide = ligneDe(await lireFaits(repertoire), BOX);
    assert.deepEqual([vide?.cuisson, vide?.cooks], ["stopped", []]);
  });

  test("arrêtée, un cook qui finit sans rien livrer rend son ticket au rail — il n'est pas perdu, et la station ne le reprend qu'une fois lancée", async (t) => {
    const { repertoire, etat, types, lancements, conclure, dernier } = cuisine(t, { scenario: "attend", issues: [issue(14)] });
    await jusqua(() => lancements().length === 1 && types(14).includes("cook.launched"));
    const arret = await geste(repertoire, "stop", BOX);
    assert.equal(arret.code, 0, arret.sortie);
    assert.deepEqual(types(14).filter((type) => COUPURES.includes(type)), []);

    conclure();
    await jusqua(() => dernier("cook.reported", 14) !== undefined && etat(14) === "waiting");
    assert.equal(dernier("cook.reported", 14)?.ending, "failed");
    await laisserServir();
    assert.deepEqual([etat(14), lancements().length], ["waiting", 1]);

    await geste(repertoire, "start", BOX);
    await jusqua(() => lancements().length === 2 && etat(14) === "taken");
  });

  test("une station distante s'arrête par le même geste : son cook renouvelle et rend, son ticket revient au rail, elle ne reçoit plus rien avant d'être lancée", async (t) => {
    const lieu = cuisine(t, { stations: lireStations({ BRIGADE_STATIONS: `${BOX}:1:code,${MAC}:2:chrome-connecté:distante` }), scenario: "muet", presenceMs: 120_000 });
    const { repertoire, gh, etat, heure } = lieu;
    const tirer = (demande: Demande): Promise<Reponse> => demander(repertoire, MAC, demande, { maintenant: heure.maintenant, pasMs: 2 });
    const reclamer = async (): Promise<Mission> => {
      const reponse = await tirer({ verb: "claim" });
      assert.ok(reponse.ok && reponse.verb === "claim" && reponse.mission !== null, JSON.stringify(reponse));
      return reponse.mission;
    };
    const poser = (numero: number) => {
      gh.ficher(numero, "2026-10-08T09:00:00Z", [MARQUEUR, "- requiert : chrome-connecté"].join("\n"));
      gh.poser(issue(numero));
    };
    poser(16);
    await jusqua(() => etat(16) === "86");
    await tirer({ verb: "announce" });
    await jusqua(() => etat(16) === "waiting");
    const { run } = await reclamer();

    assert.equal((await geste(repertoire, "stop", MAC)).code, 0);
    // Son cook n'est pas arrêté : il renouvelle son bail comme avant.
    assert.equal((await tirer({ verb: "renew", run, proof: "e1", turns: 1, tokens: 10 })).ok, true);
    poser(17);
    await jusqua(() => etat(17) === "waiting");
    assert.deepEqual(await tirer({ verb: "claim" }), { ok: true, verb: "claim", mission: null, held: "station-stopped" });
    const enCours = await lireFaits(repertoire);
    assert.deepEqual(
      [ligneDe(enCours, MAC)?.cuisson, ligneDe(enCours, MAC)?.cooks.map(({ ticket, station: sienne }) => [ticket, sienne]), ligneDe(enCours, BOX)?.cuisson],
      ["stopped", [[16, MAC]], "cooking"],
    );

    // Il rend sans rien livrer : le ticket revient au rail, et n'est pas reprêté à la station arrêtée.
    assert.deepEqual(await tirer({ verb: "deliver", run, ending: "delivered", reason: null, message: "J'ai beaucoup réfléchi.", turns: 2, tokens: 20 }), { ok: true, verb: "deliver", ending: "failed", reason: "no-deliverable" });
    await jusqua(() => etat(16) === "waiting");
    assert.deepEqual(await tirer({ verb: "claim" }), { ok: true, verb: "claim", mission: null, held: "station-stopped" });
    assert.deepEqual(ligneDe(await lireFaits(repertoire), MAC)?.cooks, []);

    // Lancée, elle reçoit de nouveau — le ticket revenu d'abord.
    assert.equal((await geste(repertoire, "start", MAC)).code, 0);
    assert.equal((await reclamer()).ticket, 16);
    assert.equal(ligneDe(await lireFaits(repertoire), MAC)?.cuisson, "cooking");
  });

  test("le « stop » de toute la cuisine reste celui d'avant : il coupe les cooks, quand l'arrêt d'une station les laisse finir", async (t) => {
    const { repertoire, types, lancements, dernier } = cuisine(t, { scenario: "commite-puis-attend", issues: [issue(14)] });
    await jusqua(() => lancements().length === 1 && types(14).includes("cook.launched"));
    chef(repertoire, "kitchen.stopped");
    await jusqua(() => dernier("cook.exited", 14) !== undefined);
    assert.equal(dernier("cook.exited", 14)?.outcome, "stop");
    assert.equal(ligneDe(await lireFaits(repertoire), BOX)?.cuisson, "stopped");
  });
});
