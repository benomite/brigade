// Une station de plus du projet — une autre machine, déclarée
// `distante+ensemble` — cuit à côté de la première, et non derrière elle : elle
// prend les tickets du projet dès qu'elle a de la place, que la box sature ou
// non, chacune à son plafond, sans qu'un ticket soit jamais pris deux fois.
// Arrêter ou perdre l'une n'empêche pas l'autre de prendre. Et la première
// garde le manager et la pass : la seconde ne reçoit que des cooks. Sur une
// cuisine complète, la seconde station jouée par le test depuis sa propre
// connexion au journal, comme le ferait sa demande.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import type { BacASableDeLaStation, Demande, Mission, Reponse } from "../src/events/remote.ts";
import { faits, lireEtat } from "../src/etat.ts";
import { principal as montrerStation } from "../src/montrer-station.ts";
import { etatStation } from "../src/projections/stations.ts";
import { lireStations } from "../src/stations-declarees.ts";
import { demander } from "./aides/demander.ts";
import { BAIL_MS, CALIBRAGE_DU_MANAGER, CALIBRAGE_DU_REVIEWER, chef, cuisine, issue, MACHINE_CALME, pousserSurLOrigine, type Options } from "./aides/cuisine.ts";
import { appeler, jusqua } from "./outils.ts";

const [BOX, MAC, PC] = ["box/claude", "mac/claude", "pc/claude"];
const PRESENCE_MS = 120_000;
// Le poste de la seconde station, tel que sa sonde le dit : le bac à sable est là.
const DISPONIBLE: BacASableDeLaStation = { available: true, version: "2.1.250", home: "/Users/chef", worktrees: "/Users/chef/brigade-cooks/brigade", caches: [] };

// Le temps qu'une prise qui ne doit pas avoir lieu aurait largement eu pour se faire.
const laisserServir = () => new Promise((resoudre) => setTimeout(resoudre, 80));

// Une cuisine dont le projet déclare ces stations, et de quoi jouer les distantes.
function service(t: TestContext, declaration: string, options: Options = {}) {
  const lieu = cuisine(t, { stations: lireStations({ BRIGADE_STATIONS: declaration }), scenario: "muet", presenceMs: PRESENCE_MS, ...options });
  const { journal, repertoire, heure } = lieu;
  const tirer = (demande: Demande, station = MAC): Promise<Reponse> => demander(repertoire, station, demande, { maintenant: heure.maintenant, pasMs: 2 });
  const annoncer = async (station = MAC) => assert.ok((await tirer({ verb: "announce", sandbox: DISPONIBLE }, station)).ok);
  const reclamer = async (station = MAC): Promise<Extract<Reponse, { verb: "claim" }>> => {
    const reponse = await tirer({ verb: "claim", sandbox: DISPONIBLE }, station);
    assert.ok(reponse.ok && reponse.verb === "claim", JSON.stringify(reponse));
    return reponse;
  };
  const mission = async (station = MAC): Promise<Mission> => {
    const { mission: recue } = await reclamer(station);
    assert.ok(recue !== null, `aucune mission pour ${station}`);
    return recue;
  };
  // Qui a pris le ticket, prise après prise.
  const prises = (ticket: number) => journal.duTicket(ticket).filter((e) => e.type === "ticket.taken").map((e) => e.author.replace(/^station:/, ""));
  const prisPar = (station: string) => journal.tout().filter((e) => e.type === "ticket.taken" && e.author === `station:${station}`).length;
  // Le geste du chef, depuis son propre process — celui que l'app lance.
  const geste = async (...args: string[]) => {
    const lance = appeler(montrerStation, args, { BRIGADE_STATE_DIR: repertoire });
    assert.equal(await lance.fin, 0, lance.sortie());
    return lance.sortie();
  };
  return { ...lieu, tirer, annoncer, reclamer, mission, prises, prisPar, geste };
}

describe("une station de plus du projet cuit à côté de la première", { concurrency: 4 }, () => {
  test("les deux stations prennent les tickets du projet, chacune jusqu'à son plafond — et la seconde le dit dans `station` et `facts`", async (t) => {
    const { gh, etat, journal, heure, annoncer, mission, reclamer, prises, prisPar, geste } = service(t, `${BOX}:2:code,${MAC}:2:code:distante+ensemble`);
    await annoncer();
    for (const numero of [17, 18, 19, 20]) gh.poser(issue(numero));
    await jusqua(() => prisPar(BOX) === 2);

    // La seconde prend ce que la box n'a pas pris, jusqu'à son propre plafond.
    const recues = [(await mission()).ticket, (await mission()).ticket];
    assert.deepEqual(await reclamer(), { ok: true, verb: "claim", mission: null, held: "cap" });
    await laisserServir();
    for (const numero of [17, 18, 19, 20]) {
      assert.equal(etat(numero), "taken");
      assert.equal(prises(numero).length, 1, `#${numero} pris par ${prises(numero).join(", ")}`);
    }
    assert.deepEqual([prisPar(BOX), prisPar(MAC)], [2, 2]);
    assert.deepEqual(recues.map(prises), [[MAC], [MAC]]);

    assert.match(await geste(), /ordinary tickets +taken alongside the box's stations, as one more station of the project — not only when the box is saturated — each cook inside the Claude Code sandbox/);
    const ligne = faits(lireEtat(journal, heure.maintenant()), heure.maintenant()).stations.find(({ station }) => station === MAC);
    assert.deepEqual([ligne?.distante, ligne?.ordinaires, ligne?.ensemble, ligne?.prendOrdinaires, ligne?.cooks?.length], [true, true, true, true, 2]);
  });

  test("la box a encore de la place — elle monte par paliers — et la seconde prend quand même ; le ticket qu'elle tient, la box ne le prend pas", async (t) => {
    // Trois cooks au plus sur la box, un seul en cours (#14), parti à l'instant :
    // compté d'avance, il mènerait la charge au seuil (12 pour 8 cœurs). La box
    // se retient le temps qu'il pèse : elle a de la place, elle ne sature pas.
    // Un renfort (`distante+ordinaires`) n'aurait rien reçu ici
    // (station-ordinaires.test.ts) ; une station de plus du projet, si.
    const { gh, etat, journal, heure, annoncer, mission, prises } = service(t, `${BOX}:3:code,${MAC}:2:code:distante+ensemble`, {
      machine: () => ({ ...MACHINE_CALME, charge: 11.5 }),
      // Aucun plafond ne tombe pendant que l'horloge avance d'une minute.
      plafonds: { durationMs: 3_600_000, idleMs: 3_600_000 },
    });
    await annoncer();
    gh.poser(issue(14));
    await jusqua(() => etat(14) === "taken");
    gh.poser(issue(17));
    gh.poser(issue(18));
    await jusqua(() => etatStation(journal.base, BOX)?.heldReason === "ramp" && etat(17) === "waiting" && etat(18) === "waiting");

    const recue = await mission();
    assert.equal(recue.ticket, 17);
    // Un ticket ordinaire ne part sur une autre machine que dans son bac à sable.
    assert.equal(recue.sandbox, true);

    // Le cook de #14 a pesé : la box reprend sa montée — avec #18, jamais #17,
    // que la seconde tient.
    heure.avancer(61_000);
    await jusqua(() => etat(18) === "taken");
    await laisserServir();
    assert.deepEqual([prises(14), prises(17), prises(18)], [[BOX], [MAC], [BOX]]);
  });

  test("deux stations de plus réclament en même temps : chaque ticket part une fois, sur une seule station, et aucune ne dépasse son plafond", async (t) => {
    const { gh, etat, annoncer, reclamer, prises, prisPar } = service(t, `${BOX}:1:code,${MAC}:2:code:distante+ensemble,${PC}:2:code:distante+ensemble`);
    gh.poser(issue(14));
    await jusqua(() => etat(14) === "taken");
    for (const numero of [17, 18, 19, 20, 21]) gh.poser(issue(numero));
    await jusqua(() => [17, 18, 19, 20, 21].every((numero) => etat(numero) === "waiting"));
    await annoncer(MAC);
    await annoncer(PC);

    const reponses = await Promise.all([MAC, PC, MAC, PC, MAC, PC].map((station) => reclamer(station).then((reponse) => ({ station, reponse }))));
    const missions = reponses.flatMap(({ station, reponse }) => (reponse.mission === null ? [] : [{ station, ticket: reponse.mission.ticket }]));
    assert.equal(missions.length, 4, JSON.stringify(reponses));
    assert.equal(new Set(missions.map(({ ticket }) => ticket)).size, 4);
    for (const station of [MAC, PC]) assert.equal(missions.filter((une) => une.station === station).length, 2);
    // Celles qui n'ont rien reçu sont à leur plafond.
    assert.deepEqual(
      reponses.filter(({ reponse }) => reponse.mission === null).map(({ reponse }) => reponse.held),
      ["cap", "cap"],
    );
    await laisserServir();
    for (const { station, ticket } of missions) assert.deepEqual(prises(ticket), [station]);
    // Le cinquième attend : la box est pleine, les deux autres aussi.
    assert.deepEqual([prisPar(BOX), prisPar(MAC), prisPar(PC)], [1, 2, 2]);
    assert.equal([17, 18, 19, 20, 21].filter((numero) => etat(numero) === "waiting").length, 1);
  });
});

describe("arrêter ou perdre une station n'empêche pas l'autre de prendre", { concurrency: 4 }, () => {
  test("la connexion Max de la box tombe : la seconde station, qui a la sienne, continue de prendre les tickets", async (t) => {
    const { gh, etat, journal, annoncer, mission, prises } = service(t, `${BOX}:2:code,${MAC}:2:code:distante+ensemble`, { session: "absente" });
    await jusqua(() => etatStation(journal.base, BOX)?.disconnectedAt != null);
    gh.poser(issue(17));
    await jusqua(() => etat(17) === "waiting");
    await annoncer();

    assert.equal((await mission()).ticket, 17);
    assert.deepEqual(prises(17), [MAC]);
  });

  test("dans le même cas, un renfort (`distante+ordinaires`) ne reçoit rien : il attend que la box sature, ce qu'une box retenue ne fait pas", async (t) => {
    const { gh, etat, journal, annoncer, reclamer } = service(t, `${BOX}:2:code,${MAC}:2:code:distante+ordinaires`, { session: "absente" });
    await jusqua(() => etatStation(journal.base, BOX)?.disconnectedAt != null);
    gh.poser(issue(17));
    await jusqua(() => etat(17) === "waiting");
    await annoncer();

    assert.deepEqual(await reclamer(), { ok: true, verb: "claim", mission: null, held: null });
    assert.equal(etat(17), "waiting");
  });

  test("le chef arrête la cuisine sur l'une : l'autre continue de prendre — dans un sens, puis dans l'autre", async (t) => {
    const { gh, etat, annoncer, mission, reclamer, prises, geste } = service(t, `${BOX}:2:code,${MAC}:2:code:distante+ensemble`);
    await annoncer();
    await geste("stop", BOX);
    gh.poser(issue(17));
    await jusqua(() => etat(17) === "waiting");
    assert.equal((await mission()).ticket, 17);

    // La seconde arrêtée, la box relancée : la box prend, la seconde ne reçoit plus rien.
    await geste("stop", MAC);
    await geste("start", BOX);
    gh.poser(issue(18));
    await jusqua(() => etat(18) === "taken");
    gh.poser(issue(19));
    await jusqua(() => etat(19) === "taken");
    assert.deepEqual(await reclamer(), { ok: true, verb: "claim", mission: null, held: "station-stopped" });
    assert.deepEqual([prises(17), prises(18), prises(19)], [[MAC], [BOX], [BOX]]);
  });

  test("la seconde station se perd en pleine cuisson : la box reprend son ticket et continue de prendre les nouveaux", async (t) => {
    const { gh, etat, journal, heure, annoncer, mission, prises, geste } = service(t, `${BOX}:2:code,${MAC}:2:code:distante+ensemble`);
    await annoncer();
    // La box arrêtée le temps que la seconde prenne #17.
    await geste("stop", BOX);
    gh.poser(issue(17));
    await jusqua(() => etat(17) === "waiting");
    const { run } = await mission();
    await geste("start", BOX);

    // Son poste se ferme : plus aucune demande. Son bail tombe — elle est
    // absente depuis longtemps —, son cook est arrêté, et son ticket revient
    // au rail, où la box le reprend.
    heure.avancer(BAIL_MS + 1_000);
    await jusqua(() => journal.tout().some((e) => e.type === "station.absent" && e.payload.station === MAC));
    await jusqua(() => prises(17).length === 2 && etat(17) === "taken");
    assert.deepEqual(prises(17), [MAC, BOX]);
    assert.deepEqual(
      journal.duTicket(17).filter((e) => e.type === "guard.tripped").map((e) => [e.payload.run, e.payload.reason]),
      [[run, "lease"]],
    );

    gh.poser(issue(19));
    await jusqua(() => etat(19) === "taken");
    assert.deepEqual(prises(19), [BOX]);
  });
});

describe("la première station garde le manager et la pass", () => {
  test("le ticket que cuit la seconde est jugé par le manager et relu par la pass de la première : la seconde ne reçoit que son cook", async (t) => {
    // La cuisine arrêtée sur la box : c'est la seconde qui cuit. Le manager et
    // la pass, eux, tournent toujours ici.
    const { gh, repertoire, journal, etat, annoncer, mission, tirer, relectures, cooks, types, geste } = service(t, `${BOX}:1:code,${MAC}:2:code:distante+ensemble`, {
      pass: true,
      manager: {},
      scenario: "livre",
    });
    chef(repertoire, "manager.enabled");
    chef(repertoire, "grant.activated");
    await geste("stop", BOX);
    await annoncer();
    // Une issue sans aucun label : le manager la juge, la lance et la calibre.
    gh.poser(issue(30, []));
    await jusqua(() => etat(30) === "waiting");

    const recue = await mission();
    assert.equal(recue.ticket, 30);
    assert.match(recue.prompt, /ticket #30/);
    pousserSurLOrigine(repertoire, recue.branch);
    const rendu = await tirer({ verb: "deliver", run: recue.run, ending: "delivered", reason: null, message: "Fait.\n<livrable>\nLe ticket est servi.\n</livrable>", turns: 3, tokens: 300 });
    assert.deepEqual(rendu, { ok: true, verb: "deliver", ending: "done", reason: null });
    await jusqua(() => types(30).includes("ticket.served"));

    // Le jugement du manager et la relecture de la pass ont tourné sur la
    // première : deux lancements de `claude` ici, aucun cook.
    // Le juge du manager et le reviewer se reconnaissent à leur calibrage.
    assert.equal(cooks().length, 0);
    const modele = (args: string[]) => args[args.indexOf("--model") + 1];
    assert.deepEqual(relectures().map((lance) => modele(lance.args)).sort(), [CALIBRAGE_DU_REVIEWER.model, CALIBRAGE_DU_MANAGER.model].sort());
    const auteurs = (prefixe: string) => [...new Set(journal.duTicket(30).filter((e) => e.type.startsWith(prefixe)).map((e) => e.author))];
    assert.deepEqual(auteurs("manager."), ["manager"]);
    assert.deepEqual(auteurs("pass."), ["pass"]);
    assert.equal(journal.duTicket(30).findLast((e) => e.type === "cook.launched")?.payload.remote, true);
    // La seconde n'a reçu que des réponses de station : s'annoncer, réclamer, rendre.
    const verbes = journal.tout().filter((e) => e.type === "remote.answered").map((e) => String(e.payload.verb));
    assert.deepEqual([...new Set(verbes)].sort(), ["announce", "claim", "deliver"]);
  });
});
