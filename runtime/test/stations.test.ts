// Les stations qu'un projet déclare : plusieurs, de la même machine ou non, ou
// aucune. Chacune a son nom, ce qu'elle fournit et son plafond de cooks ; le
// runtime n'en tient aucune pour acquise.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { decrireEtat, lireEtat } from "../src/etat.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { prisPar } from "../src/projections/rail.ts";
import { etatStation, plafondDeCooks, sansStationDepuis, stationsAnnoncees } from "../src/projections/stations.ts";
import { lireStations } from "../src/stations-declarees.ts";
import type { Machine } from "../src/machine.ts";
import { chef, cuisine, issue, MACHINE_CALME, plafonner } from "./aides/cuisine.ts";
import { jusqua } from "./outils.ts";
import { posixOnly } from "./support/plateforme.ts";

const DEUX = lireStations({ BRIGADE_STATIONS: "box/claude:1:code+raisonnement,box/playwright:2:navigateur-headless" });
const [CLAUDE, PLAYWRIGHT] = ["box/claude", "box/playwright"];

// Le temps qu'une prise qui ne doit pas avoir lieu aurait largement eu pour se faire.
const laisserServir = () => new Promise((resoudre) => setTimeout(resoudre, 80));

describe("les stations que le projet déclare", { concurrency: 8 }, () => {
  test("deux stations déclarées, `box/claude` et `box/playwright` : le runtime les connaît toutes deux, chacune avec ce qu'elle fournit et son plafond", (t) => {
    const { journal } = cuisine(t, { stations: DEUX });

    assert.deepEqual(
      journal.tout().filter((e) => e.type === "station.announced").map((e) => [e.author, e.payload]),
      [
        ["station:box/claude", { station: "box/claude", engine: "claude", provides: ["code", "raisonnement"], maxCooks: 1, cores: 8 }],
        ["station:box/playwright", { station: "box/playwright", engine: "playwright", provides: ["navigateur-headless"], maxCooks: 2, cores: 8 }],
      ],
    );
    assert.deepEqual(stationsAnnoncees(journal.base), [CLAUDE, PLAYWRIGHT]);
    assert.deepEqual(
      [CLAUDE, PLAYWRIGHT].map((station) => {
        const etat = etatStation(journal.base, station);
        return [etat?.provides, etat && plafondDeCooks(etat)];
      }),
      [
        [["code", "raisonnement"], 1],
        [["navigateur-headless"], 2],
      ],
    );
    assert.equal(sansStationDepuis(journal.base), null);
    // `status` dit le plafond de chacune, et d'où il vient : sous les trois
    // que permettent huit cœurs, c'est celui qu'elles déclarent.
    assert.match(decrireEtat(lireEtat(journal), new Date()).join("\n"), /box\/claude: 1 at most — declared, box\/playwright: 2 at most — declared/);
  });

  test("le plafond de chaque station est respecté : celle à un cook n'en reçoit pas un second, l'autre prend les siens, et le ticket de trop attend", async (t) => {
    const { journal, etat, lancements } = cuisine(t, { stations: DEUX, scenario: "muet", issues: [issue(14), issue(15), issue(16), issue(17)] });
    await jusqua(() => lancements().length === 3);
    await laisserServir();

    assert.equal(lancements().length, 3);
    assert.deepEqual([etat(14), etat(15), etat(16), etat(17)], ["taken", "taken", "taken", "waiting"]);
    assert.deepEqual([prisPar(journal.base, CLAUDE), prisPar(journal.base, PLAYWRIGHT)], [1, 2]);
    // Chaque cook est celui de la station qui a pris son ticket — les tickets
    // sont pris dans l'ordre, leurs cooks partent quand leur worktree est prêt.
    assert.deepEqual(
      journal
        .tout()
        .flatMap((e) => (e.type === "cook.launched" ? [[e.ticket, e.payload.station]] : []))
        .sort(([a], [b]) => Number(a) - Number(b)),
      [
        [14, CLAUDE],
        [15, PLAYWRIGHT],
        [16, PLAYWRIGHT],
      ],
    );
    // Le ticket qui attend n'est pas un mystère : chaque station dit son plafond.
    assert.deepEqual(
      journal.tout().filter((e) => e.type === "station.held").map((e) => [e.author, e.payload]),
      [
        ["station:box/claude", { station: CLAUDE, reason: "cap" }],
        ["station:box/playwright", { station: PLAYWRIGHT, reason: "cap" }],
      ],
    );
  });

  test("le plafond que donnent les cœurs est tenu comme celui qu'on déclare : une station pleine laisse le ticket suivant à l'autre, puis il attend son tour", async (t) => {
    // Trente déclarés chacune, sur six cœurs : deux cooks au plus par station.
    const TRENTE = lireStations({ BRIGADE_STATIONS: "box/claude:30:code+raisonnement,box/playwright:30:navigateur-headless" });
    const six: Machine = { ...MACHINE_CALME, coeurs: 6 };
    const { journal, etat, lancements } = cuisine(t, { stations: TRENTE, scenario: "muet", machine: () => six, issues: [issue(14), issue(15), issue(16), issue(17), issue(18)] });
    await jusqua(() => lancements().length === 4);
    await laisserServir();

    assert.equal(lancements().length, 4);
    assert.deepEqual([14, 15, 16, 17, 18].map(etat), ["taken", "taken", "taken", "taken", "waiting"]);
    assert.deepEqual([prisPar(journal.base, CLAUDE), prisPar(journal.base, PLAYWRIGHT)], [2, 2]);
    // Les deux premiers dans la première station, les deux suivants dans l'autre.
    assert.deepEqual(
      journal
        .tout()
        .flatMap((e) => (e.type === "ticket.taken" ? [[e.ticket, e.author]] : [])),
      [
        [14, `station:${CLAUDE}`],
        [15, `station:${CLAUDE}`],
        [16, `station:${PLAYWRIGHT}`],
        [17, `station:${PLAYWRIGHT}`],
      ],
    );
    // Le ticket de trop attend par le même chemin qu'au plafond déclaré : chaque station le dit.
    assert.deepEqual(
      journal.tout().filter((e) => e.type === "station.held").map((e) => e.payload),
      [
        { station: CLAUDE, reason: "cap" },
        { station: PLAYWRIGHT, reason: "cap" },
      ],
    );
    assert.match(decrireEtat(lireEtat(journal), new Date()).join("\n"), /4 running — box\/claude: 2 at most — 6 cores, box\/playwright: 2 at most — 6 cores/);
  });

  test("une station à plafond 1, seule : jamais deux cooks à la fois, même devant un rail plein", async (t) => {
    const { journal, etat, lancements } = cuisine(t, { stations: [DEUX[0]!], scenario: "muet", issues: [issue(14), issue(15), issue(16)] });
    await jusqua(() => lancements().length === 1);
    await laisserServir();

    assert.equal(lancements().length, 1);
    assert.deepEqual([etat(14), etat(15), etat(16)], ["taken", "waiting", "waiting"]);
    assert.equal(etatStation(journal.base, CLAUDE)?.heldReason, "cap");
  });

  test("une place qui se libère dans une station est reprise par elle : son plafond borne à chaque prise", async (t) => {
    const { journal, etat, lancements, conclure } = cuisine(t, { stations: [DEUX[0]!], scenario: "commite-puis-attend", issues: [issue(14), issue(15)] });
    await jusqua(() => lancements().length === 1);
    await laisserServir();
    assert.deepEqual([etat(14), etat(15)], ["taken", "waiting"]);

    conclure();

    await jusqua(() => etat(14) === "pass" && lancements().length === 2);
    assert.equal(journal.duTicket(15).find((e) => e.type === "ticket.taken")?.author, "station:box/claude");
  });

  test("le chef règle le plafond d'une station à chaud : il l'emporte sur celui qu'elle déclare, sans toucher à l'autre", { skip: posixOnly("runs a kitchen over several declared stations whose cooks are the fake claude (a bash script) and counts their launches; on the Windows job: 2, + 1 - 2") }, async (t) => {
    const { repertoire, journal, lancements } = cuisine(t, { stations: DEUX, scenario: "muet", issues: [issue(14), issue(15), issue(16), issue(17)] });
    await jusqua(() => lancements().length === 3);

    plafonner(repertoire, 2, CLAUDE);

    await jusqua(() => lancements().length === 4);
    assert.deepEqual([prisPar(journal.base, CLAUDE), prisPar(journal.base, PLAYWRIGHT)], [2, 2]);
  });

  test("un projet qui ne déclare aucune station est accepté : aucun cook ne part, le ticket attend, et le journal comme `status` le disent", async (t) => {
    const { journal, etat, lancements, types, avertissements } = cuisine(t, { stations: [], issues: [issue(15)] });
    await jusqua(() => etat(15) === "waiting");
    await laisserServir();

    assert.equal(etat(15), "waiting");
    assert.deepEqual(lancements(), []);
    assert.deepEqual(types().filter((type) => type.startsWith("station.") || type.startsWith("cook.")), []);
    assert.deepEqual(
      journal.tout().filter((e) => e.type === "stations.undeclared").map((e) => [e.author, e.ticket, e.payload]),
      [["runtime", null, {}]],
    );
    assert.deepEqual(stationsAnnoncees(journal.base), []);
    assert.notEqual(sansStationDepuis(journal.base), null);
    // Rien n'a buté : il n'y a rien à avertir, c'est un état, pas une panne.
    assert.deepEqual(avertissements, []);

    const lignes = decrireEtat(lireEtat(journal), new Date());
    assert.match(
      lignes.find((ligne) => ligne.startsWith("stations")) ?? "",
      /^stations {3}NONE DECLARED for .* — no cook leaves, the tickets stay waiting: set them with `brigade <projet> station stations box\/claude:30:code\+raisonnement`, read at the next wake-up, no restart$/,
    );
    // Et sur la ligne du ticket qui attend.
    assert.match(lignes.find((ligne) => ligne.startsWith("  #15")) ?? "", /queued .*no station declared/);
  });

  test("sans station, le chef peut toujours arrêter et reprendre la cuisine : rien ne plante, rien ne part", async (t) => {
    const { repertoire, journal, etat, lancements } = cuisine(t, { stations: [], issues: [issue(15)] });
    await jusqua(() => etat(15) === "waiting");

    chef(repertoire, "kitchen.stopped");
    chef(repertoire, "kitchen.resumed");
    await jusqua(() => journal.tout().some((e) => e.type === "kitchen.resumed"));
    await laisserServir();

    assert.equal(etat(15), "waiting");
    assert.deepEqual(lancements(), []);
  });

  test("sans station, l'absence n'est écrite qu'une fois ; une station déclarée ensuite l'efface, et le ticket part", async (t) => {
    const premiere = cuisine(t, { stations: [], issues: [issue(15)] });
    await jusqua(() => premiere.etat(15) === "waiting");
    premiere.runtime.arreter("test");

    const seconde = cuisine(t, { lieux: premiere.lieux, stations: [], issues: [issue(15)] });
    assert.equal(seconde.types().filter((type) => type === "stations.undeclared").length, 1);
    seconde.runtime.arreter("test");

    const troisieme = cuisine(t, { lieux: premiere.lieux, stations: [DEUX[0]!], scenario: "muet", issues: [issue(15)] });
    await jusqua(() => troisieme.lancements().length === 1);
    assert.equal(sansStationDepuis(troisieme.journal.base), null);
    assert.equal(troisieme.etat(15), "taken");
    assert.doesNotMatch(decrireEtat(lireEtat(troisieme.journal), new Date()).join("\n"), /AUCUNE DÉCLARÉE/);
  });

  test("une station que le projet ne déclare plus est retirée au redémarrage : `status` ne la montre plus, et le cook qu'elle faisait tourner est repris — il finit comme il aurait fini, sans qu'elle ne prenne plus rien", async (t) => {
    const premiere = cuisine(t, { stations: DEUX, scenario: "commite-puis-attend", issues: [issue(14), issue(15)] });
    await jusqua(() => premiere.lancements().length === 2);
    assert.equal(prisPar(premiere.journal.base, PLAYWRIGHT), 1);
    const sien = premiere.runtime.rail.tickets().find((ticket) => ticket.station === PLAYWRIGHT)?.ticket ?? 0;
    const repertoire = premiere.repertoire;
    premiere.runtime.arreter("test");

    const seconde = cuisine(t, { lieux: premiere.lieux, stations: [DEUX[0]!], scenario: "commite-puis-attend", issues: [issue(14), issue(15)] });

    assert.deepEqual(
      seconde.journal.tout().filter((e) => e.type === "station.withdrawn").map((e) => [e.author, e.payload]),
      [["station:box/playwright", { station: PLAYWRIGHT }]],
    );
    assert.deepEqual(stationsAnnoncees(seconde.journal.base), [CLAUDE]);
    assert.equal(etatStation(seconde.journal.base, PLAYWRIGHT), null);
    assert.doesNotMatch(decrireEtat(lireEtat(seconde.journal), new Date()).join("\n"), /box\/playwright :/);
    // Ce qu'elle a cuisiné reste au relevé : le journal ne s'efface pas.
    const relu = ouvrirJournal(repertoire, { lectureSeule: true });
    t.after(() => relu.fermer());
    assert.equal(relu.tout().filter((e) => e.type === "cook.launched" && e.payload.station === PLAYWRIGHT).length, 1);
    // Son cook en vol est repris, pas relancé : il tient son ticket jusqu'à sa fin.
    assert.equal(seconde.types(sien).filter((type) => type === "cook.resumed").length, 1);
    assert.equal(prisPar(seconde.journal.base, PLAYWRIGHT), 1);
    await laisserServir();
    assert.equal(seconde.lancements().length, 2);

    seconde.conclure();
    await jusqua(() => seconde.etat(sien) === "pass");
    assert.equal(prisPar(seconde.journal.base, PLAYWRIGHT), 0);
    assert.equal(seconde.lancements().length, 2);
  });

  test("une station retirée puis déclarée à nouveau s'annonce de nouveau", async (t) => {
    const premiere = cuisine(t, { stations: DEUX });
    premiere.runtime.arreter("test");
    const seconde = cuisine(t, { lieux: premiere.lieux, stations: [DEUX[0]!] });
    seconde.runtime.arreter("test");

    const troisieme = cuisine(t, { lieux: premiere.lieux, stations: DEUX });

    assert.deepEqual(stationsAnnoncees(troisieme.journal.base), [CLAUDE, PLAYWRIGHT]);
    assert.deepEqual(
      troisieme.types().filter((type) => type === "station.announced" || type === "station.withdrawn"),
      ["station.announced", "station.announced", "station.withdrawn", "station.announced"],
    );
  });

  test("le quota est celui du compte : épuisé pour le cook d'une station, il retient toutes les stations du projet", async (t) => {
    // Trois places, quatre tickets : le premier cook lancé bute sur le quota et
    // rend sa place ; les deux autres tournent, et ne rendent pas la leur.
    const numeros = [14, 15, 16, 17];
    const { journal, etat, types } = cuisine(t, { stations: DEUX, scenario: "commite-puis-attend", suite: ["quota"], issues: numeros.map((numero) => issue(numero)) });
    const etats = () => numeros.map(etat);
    await jusqua(() => etats().includes("86") && types().filter((type) => type === "cook.launched").length === 3);
    await jusqua(() => etatStation(journal.base, PLAYWRIGHT)?.heldReason === "quota");
    await laisserServir();

    assert.deepEqual(
      journal.tout().filter((e) => e.type === "station.86").map((e) => [e.author, e.payload.station, e.payload.until]),
      [
        ["station:box/claude", CLAUDE, "2026-10-08T15:30:00.000Z"],
        ["station:box/playwright", PLAYWRIGHT, "2026-10-08T15:30:00.000Z"],
      ],
    );
    // Une place est libre, et le quatrième ticket ne part pas : ni l'une ni
    // l'autre station ne prend tant que le quota n'est pas revenu.
    assert.deepEqual(etats().sort(), ["86", "taken", "taken", "waiting"]);
    assert.equal(types().filter((type) => type === "cook.launched").length, 3);
    assert.deepEqual([etatStation(journal.base, CLAUDE)?.heldReason, etatStation(journal.base, PLAYWRIGHT)?.heldReason], ["quota", "quota"]);
  });

  test("la connexion Max est celle de la machine : absente au démarrage, elle retient toutes les stations, et l'avertissement les nomme", async (t) => {
    const { journal, etat, lancements, avertissements } = cuisine(t, { stations: DEUX, session: "absente", issues: [issue(15)] });
    await jusqua(() => journal.tout().filter((e) => e.type === "station.disconnected").length === 2);
    await laisserServir();

    assert.deepEqual(
      journal.tout().filter((e) => e.type === "station.disconnected").map((e) => e.payload),
      [
        { station: CLAUDE, reason: "not-logged-in", run: null },
        { station: PLAYWRIGHT, reason: "not-logged-in", run: null },
      ],
    );
    assert.equal(etat(15), "waiting");
    assert.deepEqual(lancements(), []);
    assert.deepEqual(avertissements, [
      "brigade : connexion Max des stations box/claude, box/playwright absente ou expirée (not-logged-in) — `claude /login` sous le compte du service — la cuisine reprend seule dans la minute",
    ]);
  });

  test("à l'arrêt, plus aucune station ne retient personne", async (t) => {
    const { repertoire, runtime, lancements } = cuisine(t, { stations: DEUX, scenario: "muet", issues: [issue(14), issue(15), issue(16), issue(17)] });
    await jusqua(() => lancements().length === 3);
    await jusqua(() => etatStation(runtime.journal.base, PLAYWRIGHT)?.heldReason === "cap");

    runtime.arreter("test");

    const relu = ouvrirJournal(repertoire, { lectureSeule: true });
    t.after(() => relu.fermer());
    assert.deepEqual([etatStation(relu.base, CLAUDE)?.heldReason, etatStation(relu.base, PLAYWRIGHT)?.heldReason], [null, null]);
  });
});
