// Le rail bloqué dans l'app (ticket 3358) : la ligne en tête du rail — combien, depuis combien de temps, la cause, et
// le geste quand il y en a un —, le projet « stuck » sur « Tous les projets », et rien de tout cela pour un projet calme.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { MOTS_DU_GESTE, type StationDuCompte } from "../../../runtime/src/attente-du-rail/stations.ts";
import { diagnose, type RailBlocked } from "../../src/rail-blocked/diagnostic.ts";
import { lineOfProject } from "../../src/home.ts";
import { understand, board, type Facts } from "../../src/facts.ts";
import type { CallGitHub } from "../../src/board/client.ts";
import { readTheBoardOfRepository, type BoardRead } from "../../src/board/read.ts";
import { statusOfBoard } from "../../src/board/rail.ts";
import { stateOfTheLine, STATES } from "../../src/vue/home/projects/projects.js";
import { ACTIONS, lineOfRailBlocked } from "../../src/vue/rail-blocked/line-of-rail-blocked.js";
import { railBlockedRead } from "../../src/vue/rail-blocked/rail-blocked.ts";
import { withTheRail, type RailOnGithub } from "../../src/vue/rail/github.ts";
import { Fake } from "../helpers/false-vue.ts";

const REPOSITORY = "chef/secondes";
const READ = "2026-11-12T02:30:00.000Z";
const NOW = Date.parse(READ);
const POSE = "2026-11-11T12:25:00.000Z";
const doc = { createElement: (balise: string) => new Fake(balise) };
const station = (others: Partial<StationDuCompte> = {}): StationDuCompte => ({ name: "box", lastSeen: "2026-11-12T02:29:00.000Z", stoppedAt: null, refreshMs: 120_000, selection: [REPOSITORY], ...others });
const EIGHT = [4, 5, 6, 7, 8, 9, 10, 11].map((ticket) => ({ ticket, depuis: POSE }));
const blocked = (readEntries: StationDuCompte[]) => diagnose({ depot: REPOSITORY, nonPris: EIGHT, stations: { lues: readEntries }, maintenant: NOW }) as RailBlocked;

// La lecture vide d'un projet sur GitHub seul (board/read.ts, `vide`), puis son rail.
const EMPTY: BoardRead = {
  lu: true,
  depot: REPOSITORY,
  luLe: READ,
  cuisine: { rubriques: [] },
  faits: { etat: "ouverte", lu: READ, dernierTick: null, dernierEvenement: null, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, rail: [] },
  file: [],
  bilans: [],
  lignesDuRail: [],
  activites: [],
};
const rail = (notTaken: RailOnGithub["nonPris"]): RailOnGithub => ({ lu: READ, tickets: EIGHT.map(({ ticket }) => ({ ticket, titre: `Ticket ${ticket}`, url: "", etat: "en attente", priorite: null, creeLe: POSE, pr: null, prise: null })), ...(notTaken === undefined ? {} : { nonPris: notTaken }) });
const factsOf = (readOne: BoardRead) => understand(JSON.stringify(readOne.faits)) as Facts;

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

describe("ce que la lecture du rail en pose dans `facts`", () => {
  test("des tickets non pris au-delà du délai : `railBloque` traverse `facts` jusqu'au tableau du rail", () => {
    const readOne = withTheRail(EMPTY, rail(EIGHT), { lus: [station({ selection: ["chef/autre"] })] });
    const facts = factsOf(readOne);
    assert.equal(facts.railBloque !== undefined && "phrase" in facts.railBloque ? facts.railBloque.phrase : "", "8 tickets on the rail, no manager has taken them for 14 h: no station serves this project. Add the project to a station.");
    assert.deepEqual(board(facts).railBloque, facts.railBloque);
  });

  test("aucun ticket non pris, ou le délai pas encore passé : pas de `railBloque`, ni de ligne dans `status`", () => {
    for (const notTaken of [[], [{ ticket: 4, depuis: new Date(NOW - 60_000).toISOString() }]]) {
      const readOne = withTheRail(EMPTY, rail(notTaken), { lus: [] });
      assert.equal(factsOf(readOne).railBloque, undefined);
      assert.doesNotMatch(statusOfBoard(readOne), /STUCK RAIL/);
    }
  });

  test("des tickets non pris qui ne se lisent pas : le `status` de l'app le dit sous la tête du bloc `awaiting`", () => {
    const readOne = withTheRail(EMPTY, rail({ illisible: "GitHub answered HTTP 502" }), { lus: [] });
    assert.deepEqual(factsOf(readOne).railBloque, { illisible: "GitHub answered HTTP 502" });
    assert.match(statusOfBoard(readOne), /^awaiting {3}nothing awaits the chef\n {2}STUCK RAIL {2}not checked: the `fire` tickets of chef\/secondes could not be read on GitHub — GitHub answered HTTP 502\nend awaiting$/m);
  });

  test("un `railBloque` mal formé n'est pas posé", () => {
    for (const raw of [null, "x", [], { illisible: "" }, { tickets: [], depuis: POSE, cause: "arretee", stations: [], geste: null, constat: "a", phrase: "a" }, { ...blocked([]), cause: "autre" }, { ...blocked([]), geste: "autre" }]) {
      assert.deepEqual(railBlockedRead(raw), {}, JSON.stringify(raw));
    }
  });
});

describe("la lecture du rail sur GitHub", () => {
  const FIRES = `/repos/${REPOSITORY}/issues?state=open&labels=fire&sort=created&direction=asc&per_page=100&page=1`;
  const issue = (number: number, labels: string[]) => ({ number, title: `Ticket ${number}`, html_url: "", body: "", created_at: POSE, labels: labels.map((name) => ({ name })) });
  const github = (refuses: (path: string) => boolean): CallGitHub => async (path) => {
    if (refuses(path)) return { status: 502, data: {} };
    if (path === FIRES) return { status: 200, data: [issue(4, ["fire"]), issue(5, ["fire", "model:opus", "effort:medium"])] };
    if (path.endsWith("/events?per_page=100")) return { status: 200, data: [{ event: "labeled", label: { name: "fire" }, created_at: POSE }] };
    return { status: 200, data: path === `/repos/${REPOSITORY}` ? { permissions: { push: true } } : [] };
  };

  test("le ticket en attente que rien ne calibre : ses commentaires et ses événements se lisent, et il bloque le rail", async () => {
    const readOne = await readTheBoardOfRepository({ depot: REPOSITORY, appeler: github(() => false), maintenant: () => new Date(READ), signes: async () => ({ lus: [] }) });
    assert.ok(readOne.lu);
    const railBlocked = factsOf(readOne).railBloque;
    assert.deepEqual(railBlocked !== undefined && "tickets" in railBlocked ? railBlocked.tickets : [], [4]);
  });

  test("ses commentaires refusés : le rail reste lu, et ce qui n'a pas été vérifié est dit", async () => {
    const readOne = await readTheBoardOfRepository({ depot: REPOSITORY, appeler: github((path) => path.includes("/issues/4/comments")), maintenant: () => new Date(READ), signes: async () => ({ lus: [] }) });
    assert.ok(readOne.lu, readOne.lu ? "" : readOne.raison);
    assert.equal((readOne.faits.compteurs as { rail: number }).rail, 2);
    assert.deepEqual(factsOf(readOne).railBloque, { illisible: "GitHub answered HTTP 502" });
  });
});

describe("« Tous les projets »", () => {
  const line = (readOne: BoardRead, served = true) => lineOfProject({ nom: "secondes", servi: served }, { a: READ, faits: factsOf(readOne) }, { texte: statusOfBoard(readOne) });

  test("un projet au rail bloqué est « stuck », en rouge, sa phrase entière au survol ; un projet calme est au repos", () => {
    const stuck = line(withTheRail(EMPTY, rail(EIGHT), { lus: [station({ lastSeen: "2026-11-11T12:00:00.000Z", stoppedAt: "2026-11-11T12:01:00.000Z" })] }));
    assert.equal(stuck.ton, "rouge");
    assert.equal(stuck.dit, "8 tickets no manager takes, for 14 h");
    assert.match(stuck.survol, /8 tickets on the rail, no manager has taken them for 14 h: its station box\/claude is stopped\. Start it on its computer\./);
    assert.equal(stateOfTheLine(stuck), "stuck");
    assert.equal(STATES.stuck.ton, "rouge");

    const calm = line(withTheRail(EMPTY, rail([]), { lus: [station()] }));
    assert.equal(calm.ton, "vert");
    assert.equal(calm.dit, "nothing cooking, nothing waits for you");
    assert.equal(stateOfTheLine(calm), "idle");
    // Le délai pas encore passé : calme.
    assert.equal(stateOfTheLine(line(withTheRail(EMPTY, rail([{ ticket: 4, depuis: new Date(NOW - 60_000).toISOString() }]), { lus: [] }))), "idle");
    // Un autre rouge reste « held ».
    assert.equal(stateOfTheLine({ ton: "rouge", dit: "kitchen held" }), "held");
  });

  test("aucune station ne le sert : il est « stuck », non plus muet", () => {
    const stuck = line(withTheRail(EMPTY, rail(EIGHT), { lus: [] }), false);
    assert.equal(stateOfTheLine(stuck), "stuck");
    assert.match(stuck.survol, /no station serves this project\. Add the project to a station\./);
    assert.equal(line(withTheRail(EMPTY, rail([]), { lus: [] }), false).dit, "no station: nothing is read");
  });
});
