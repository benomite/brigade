// Le rail bloqué dans l'app (ticket 3358) : la ligne en tête du rail — combien, depuis combien de temps, la cause, et
// le geste quand il y en a un —, et ce que `facts` en porte.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { MOTS_DU_GESTE, type StationDuCompte } from "../../../runtime/src/attente-du-rail/stations.ts";
import { diagnose, type RailBlocked } from "../../src/rail-blocked/diagnostic.ts";
import { ACTIONS, lineOfRailBlocked } from "../../src/vue/rail-blocked/line-of-rail-blocked.js";
import { railBlockedRead } from "../../src/vue/rail-blocked/rail-blocked.ts";
import { Fake } from "../helpers/false-vue.ts";

const REPOSITORY = "chef/secondes";
const READ = "2026-11-12T02:30:00.000Z";
const NOW = Date.parse(READ);
const POSE = "2026-11-11T12:25:00.000Z";
const doc = { createElement: (balise: string) => new Fake(balise) };
const station = (others: Partial<StationDuCompte> = {}): StationDuCompte => ({ name: "box", lastSeen: "2026-11-12T02:29:00.000Z", stoppedAt: null, refreshMs: 120_000, selection: [REPOSITORY], ...others });
const EIGHT = [4, 5, 6, 7, 8, 9, 10, 11].map((ticket) => ({ ticket, depuis: POSE }));
const blocked = (readEntries: StationDuCompte[]) => diagnose({ depot: REPOSITORY, nonPris: EIGHT, stations: { lues: readEntries }, maintenant: NOW }) as RailBlocked;

describe("la ligne en tête du rail", () => {
  test("le compte, la durée et la cause, marqués FAULT ; le geste est le bouton recommandé, qui ouvre Stations", () => {
    const calls: string[] = [];
    const [line] = lineOfRailBlocked(doc, blocked([]), { ouvrirStations: () => calls.push("stations") }) as unknown as Fake[];
    assert.ok(line !== undefined);
    assert.equal(line.role, "alert");
    assert.deepEqual(line.children.map((child) => child.textContent), ["FAULT", "8 tickets on the rail, no manager has taken them for 14 h: no station serves this project.", "Add the project to a station"]);
    const [button] = line.dessous("button");
    assert.equal(button?.className, "recommande");
    button?.click();
    assert.deepEqual(calls, ["stations"]);
    assert.match(line.title, /^#4, #5, #6, #7, #8, #9, #10, #11 — no manager has taken them\.$/);
  });

  test("la station arrêtée est celle de cet ordinateur : « Start this computer's station » la démarre, FAULT et la cause restent (#3637)", () => {
    const calls: string[] = [];
    const stopped = blocked([station({ lastSeen: "2026-11-11T12:00:00.000Z", stoppedAt: "2026-11-11T12:01:00.000Z" })]);
    const [line] = lineOfRailBlocked(doc, stopped, { ouvrirStations: () => calls.push("stations"), demarrerIci: () => calls.push("demarrer") }) as unknown as Fake[];
    assert.equal(line?.role, "alert");
    assert.deepEqual(line?.children.map((child) => child.textContent), ["FAULT", "8 tickets on the rail, no manager has taken them for 14 h: its station box/claude is stopped.", "Start this computer's station"]);
    const [button] = line?.dessous("button") ?? [];
    assert.equal(button?.className, "recommande");
    button?.click();
    assert.deepEqual(calls, ["demarrer"]);
  });

  test("le démarrage refusé par la station dit sa raison à côté du bouton (#3637)", () => {
    const stopped = blocked([station({ lastSeen: "2026-11-11T12:00:00.000Z", stoppedAt: "2026-11-11T12:01:00.000Z" })]);
    const [line] = lineOfRailBlocked(doc, stopped, { ouvrirStations: () => {}, demarrerIci: () => {}, demarrageRefuse: "exit code 2" }) as unknown as Fake[];
    assert.match(line?.textContent ?? "", /Start this computer's station.*The station did not start: exit code 2$/);
  });

  test("la station arrêtée est celle d'un autre ordinateur : aucun bouton, la phrase dit où la démarrer (#3637)", () => {
    const [line] = lineOfRailBlocked(doc, blocked([station({ lastSeen: "2026-11-11T12:00:00.000Z", stoppedAt: "2026-11-11T12:01:00.000Z" })]), { ouvrirStations: () => {} }) as unknown as Fake[];
    assert.deepEqual(line?.children.map((child) => child.textContent), ["FAULT", "8 tickets on the rail, no manager has taken them for 14 h: its station box/claude is stopped. Start it on its computer."]);
    assert.deepEqual(line?.dessous("button"), []);
  });

  test("aucune station ne le sert : « Add the project to a station »", () => {
    const [line] = lineOfRailBlocked(doc, blocked([]), { ouvrirStations: () => {} }) as unknown as Fake[];
    assert.match(line?.textContent ?? "", /no station serves this project\.Add the project to a station$/);
  });

  test("sans geste — le manager tourne mais ne prend rien —, ou en lecture seule : aucun bouton", () => {
    const [silent] = lineOfRailBlocked(doc, blocked([station()]), { ouvrirStations: () => {} }) as unknown as Fake[];
    assert.equal(silent?.textContent, "FAULT8 tickets on the rail, no manager has taken them for 14 h: the manager runs on box/claude but takes nothing.");
    assert.deepEqual(silent?.dessous("button"), []);
    const [only] = lineOfRailBlocked(doc, blocked([]), null) as unknown as Fake[];
    assert.deepEqual(only?.dessous("button"), []);
  });

  test("les mots du bouton qui ouvre Stations sont ceux du runtime ; « Start the station » n'est le mot d'aucun geste du runtime (#3637)", () => {
    assert.deepEqual(ACTIONS, { "ajouter-a-une-station": MOTS_DU_GESTE["ajouter-a-une-station"] });
    assert.ok(!Object.values(MOTS_DU_GESTE).includes("Start the station"));
  });

  test("rien de bloqué, ou des tickets non pris qui ne se lisent pas : aucune ligne sur le rail", () => {
    assert.deepEqual(lineOfRailBlocked(doc, undefined, { ouvrirStations: () => {} }), []);
    assert.deepEqual(lineOfRailBlocked(doc, { illisible: "GitHub answered HTTP 502" }, { ouvrirStations: () => {} }), []);
  });
});

describe("ce que `facts` en porte", () => {
  test("un `railBloque` mal formé n'est pas posé", () => {
    for (const raw of [null, "x", [], { illisible: "" }, { tickets: [], depuis: POSE, cause: "arretee", stations: [], geste: null, constat: "a", phrase: "a" }, { ...blocked([]), cause: "autre" }, { ...blocked([]), geste: "autre" }]) {
      assert.deepEqual(railBlockedRead(raw), {}, JSON.stringify(raw));
    }
  });
});
