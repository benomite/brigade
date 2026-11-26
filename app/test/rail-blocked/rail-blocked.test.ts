// Le rail bloqué dans l'app (ticket 3358) : la ligne en tête du rail — combien, depuis combien de temps, la cause, et
// le geste quand il y en a un —, le projet « stuck » sur « Tous les projets », et rien de tout cela pour un projet calme.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { MOTS_DU_GESTE, type StationDuCompte } from "../../../runtime/src/attente-du-rail/stations.ts";
import { diagnostiquer, type RailBlocked } from "../../src/rail-blocked/diagnostic.ts";
import { lineDeProject } from "../../src/home.ts";
import { comprendre, tableau, type Facts } from "../../src/facts.ts";
import type { CallGitHub } from "../../src/tableau/client.ts";
import { lireLeTableauDuRepository, type TableauLu } from "../../src/tableau/read.ts";
import { statusDuTableau } from "../../src/tableau/rail.ts";
import { stateDeLaLine, STATES } from "../../src/vue/home/projects/projects.js";
import { ACTIONS, lineDuRailBlocked } from "../../src/vue/rail-blocked/line-du-rail-blocked.js";
import { railBlockedLu } from "../../src/vue/rail-blocked/rail-blocked.ts";
import { avecLeRail, type RailSurGithub } from "../../src/vue/rail/github.ts";
import { Faux } from "../aides/fausse-vue.ts";

const REPOSITORY = "chef/secondes";
const LU = "2026-11-12T02:30:00.000Z";
const MAINTENANT = Date.parse(LU);
const POSE = "2026-11-11T12:25:00.000Z";
const doc = { createElement: (balise: string) => new Faux(balise) };
const station = (autres: Partial<StationDuCompte> = {}): StationDuCompte => ({ name: "box", lastSeen: "2026-11-12T02:29:00.000Z", stoppedAt: null, refreshMs: 120_000, selection: [REPOSITORY], ...autres });
const HUIT = [4, 5, 6, 7, 8, 9, 10, 11].map((ticket) => ({ ticket, depuis: POSE }));
const blocked = (lues: StationDuCompte[]) => diagnostiquer({ depot: REPOSITORY, nonPris: HUIT, stations: { lues }, maintenant: MAINTENANT }) as RailBlocked;

// La lecture vide d'un projet sur GitHub seul (tableau/read.ts, `vide`), puis son rail.
const EMPTY: TableauLu = {
  lu: true,
  depot: REPOSITORY,
  luLe: LU,
  cuisine: { rubriques: [] },
  faits: { etat: "ouverte", lu: LU, dernierTick: null, dernierEvenement: null, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, rail: [] },
  file: [],
  bilans: [],
  lignesDuRail: [],
  activites: [],
};
const rail = (nonTaken: RailSurGithub["nonPris"]): RailSurGithub => ({ lu: LU, tickets: HUIT.map(({ ticket }) => ({ ticket, titre: `Ticket ${ticket}`, url: "", etat: "en attente", priorite: null, creeLe: POSE, pr: null, prise: null })), ...(nonTaken === undefined ? {} : { nonPris: nonTaken }) });
const factsDe = (lu: TableauLu) => comprendre(JSON.stringify(lu.faits)) as Facts;

describe("la ligne en tête du rail", () => {
  test("le compte, la durée et la cause, marqués FAULT ; le geste est le bouton recommandé, qui ouvre Stations", () => {
    const calls: string[] = [];
    const [line] = lineDuRailBlocked(doc, blocked([]), { ouvrirStations: () => calls.push("stations") }) as unknown as Faux[];
    assert.ok(line !== undefined);
    assert.equal(line.role, "alert");
    assert.deepEqual(line.children.map((enfant) => enfant.textContent), ["FAULT", "8 tickets on the rail, no manager has taken them for 14 h: no station serves this project.", "Add the project to a station"]);
    const [button] = line.dessous("button");
    assert.equal(button?.className, "recommande");
    button?.click();
    assert.deepEqual(calls, ["stations"]);
    assert.match(line.title, /^#4, #5, #6, #7, #8, #9, #10, #11 — no manager has taken them\.$/);
  });

  test("la station arrêtée est celle de cet ordinateur : « Start this computer's station » la démarre, FAULT et la cause restent (#3637)", () => {
    const calls: string[] = [];
    const arretee = blocked([station({ lastSeen: "2026-11-11T12:00:00.000Z", stoppedAt: "2026-11-11T12:01:00.000Z" })]);
    const [line] = lineDuRailBlocked(doc, arretee, { ouvrirStations: () => calls.push("stations"), demarrerIci: () => calls.push("demarrer") }) as unknown as Faux[];
    assert.equal(line?.role, "alert");
    assert.deepEqual(line?.children.map((enfant) => enfant.textContent), ["FAULT", "8 tickets on the rail, no manager has taken them for 14 h: its station box/claude is stopped.", "Start this computer's station"]);
    const [button] = line?.dessous("button") ?? [];
    assert.equal(button?.className, "recommande");
    button?.click();
    assert.deepEqual(calls, ["demarrer"]);
  });

  test("le démarrage refusé par la station dit sa raison à côté du bouton (#3637)", () => {
    const arretee = blocked([station({ lastSeen: "2026-11-11T12:00:00.000Z", stoppedAt: "2026-11-11T12:01:00.000Z" })]);
    const [line] = lineDuRailBlocked(doc, arretee, { ouvrirStations: () => {}, demarrerIci: () => {}, demarrageRefuse: "exit code 2" }) as unknown as Faux[];
    assert.match(line?.textContent ?? "", /Start this computer's station.*The station did not start: exit code 2$/);
  });

  test("la station arrêtée est celle d'un autre ordinateur : aucun bouton, la phrase dit où la démarrer (#3637)", () => {
    const [line] = lineDuRailBlocked(doc, blocked([station({ lastSeen: "2026-11-11T12:00:00.000Z", stoppedAt: "2026-11-11T12:01:00.000Z" })]), { ouvrirStations: () => {} }) as unknown as Faux[];
    assert.deepEqual(line?.children.map((enfant) => enfant.textContent), ["FAULT", "8 tickets on the rail, no manager has taken them for 14 h: its station box/claude is stopped. Start it on its computer."]);
    assert.deepEqual(line?.dessous("button"), []);
  });

  test("aucune station ne le sert : « Add the project to a station »", () => {
    const [line] = lineDuRailBlocked(doc, blocked([]), { ouvrirStations: () => {} }) as unknown as Faux[];
    assert.match(line?.textContent ?? "", /no station serves this project\.Add the project to a station$/);
  });

  test("sans geste — le manager tourne mais ne prend rien —, ou en lecture seule : aucun bouton", () => {
    const [muet] = lineDuRailBlocked(doc, blocked([station()]), { ouvrirStations: () => {} }) as unknown as Faux[];
    assert.equal(muet?.textContent, "FAULT8 tickets on the rail, no manager has taken them for 14 h: the manager runs on box/claude but takes nothing.");
    assert.deepEqual(muet?.dessous("button"), []);
    const [only] = lineDuRailBlocked(doc, blocked([]), null) as unknown as Faux[];
    assert.deepEqual(only?.dessous("button"), []);
  });

  test("les mots du bouton qui ouvre Stations sont ceux du runtime ; « Start the station » n'est le mot d'aucun geste du runtime (#3637)", () => {
    assert.deepEqual(ACTIONS, { "ajouter-a-une-station": MOTS_DU_GESTE["ajouter-a-une-station"] });
    assert.ok(!Object.values(MOTS_DU_GESTE).includes("Start the station"));
  });

  test("rien de bloqué, ou des tickets non pris qui ne se lisent pas : aucune ligne sur le rail", () => {
    assert.deepEqual(lineDuRailBlocked(doc, undefined, { ouvrirStations: () => {} }), []);
    assert.deepEqual(lineDuRailBlocked(doc, { illisible: "GitHub answered HTTP 502" }, { ouvrirStations: () => {} }), []);
  });
});

describe("ce que la lecture du rail en pose dans `facts`", () => {
  test("des tickets non pris au-delà du délai : `railBloque` traverse `facts` jusqu'au tableau du rail", () => {
    const lu = avecLeRail(EMPTY, rail(HUIT), { lus: [station({ selection: ["chef/autre"] })] });
    const facts = factsDe(lu);
    assert.equal(facts.railBloque !== undefined && "phrase" in facts.railBloque ? facts.railBloque.phrase : "", "8 tickets on the rail, no manager has taken them for 14 h: no station serves this project. Add the project to a station.");
    assert.deepEqual(tableau(facts).railBloque, facts.railBloque);
  });

  test("aucun ticket non pris, ou le délai pas encore passé : pas de `railBloque`, ni de ligne dans `status`", () => {
    for (const nonTaken of [[], [{ ticket: 4, depuis: new Date(MAINTENANT - 60_000).toISOString() }]]) {
      const lu = avecLeRail(EMPTY, rail(nonTaken), { lus: [] });
      assert.equal(factsDe(lu).railBloque, undefined);
      assert.doesNotMatch(statusDuTableau(lu), /STUCK RAIL/);
    }
  });

  test("des tickets non pris qui ne se lisent pas : le `status` de l'app le dit sous la tête du bloc `awaiting`", () => {
    const lu = avecLeRail(EMPTY, rail({ illisible: "GitHub answered HTTP 502" }), { lus: [] });
    assert.deepEqual(factsDe(lu).railBloque, { illisible: "GitHub answered HTTP 502" });
    assert.match(statusDuTableau(lu), /^awaiting {3}nothing awaits the chef\n {2}STUCK RAIL {2}not checked: the `fire` tickets of chef\/secondes could not be read on GitHub — GitHub answered HTTP 502\nend awaiting$/m);
  });

  test("un `railBloque` mal formé n'est pas posé", () => {
    for (const brut of [null, "x", [], { illisible: "" }, { tickets: [], depuis: POSE, cause: "arretee", stations: [], geste: null, constat: "a", phrase: "a" }, { ...blocked([]), cause: "autre" }, { ...blocked([]), geste: "autre" }]) {
      assert.deepEqual(railBlockedLu(brut), {}, JSON.stringify(brut));
    }
  });
});

describe("la lecture du rail sur GitHub", () => {
  const FEUX = `/repos/${REPOSITORY}/issues?state=open&labels=fire&sort=created&direction=asc&per_page=100&page=1`;
  const issue = (number: number, labels: string[]) => ({ number, title: `Ticket ${number}`, html_url: "", body: "", created_at: POSE, labels: labels.map((name) => ({ name })) });
  const github = (refuse: (chemin: string) => boolean): CallGitHub => async (chemin) => {
    if (refuse(chemin)) return { status: 502, data: {} };
    if (chemin === FEUX) return { status: 200, data: [issue(4, ["fire"]), issue(5, ["fire", "model:opus", "effort:medium"])] };
    if (chemin.endsWith("/events?per_page=100")) return { status: 200, data: [{ event: "labeled", label: { name: "fire" }, created_at: POSE }] };
    return { status: 200, data: chemin === `/repos/${REPOSITORY}` ? { permissions: { push: true } } : [] };
  };

  test("le ticket en attente que rien ne calibre : ses commentaires et ses événements se lisent, et il bloque le rail", async () => {
    const lu = await lireLeTableauDuRepository({ depot: REPOSITORY, appeler: github(() => false), maintenant: () => new Date(LU), signes: async () => ({ lus: [] }) });
    assert.ok(lu.lu);
    const railBlocked = factsDe(lu).railBloque;
    assert.deepEqual(railBlocked !== undefined && "tickets" in railBlocked ? railBlocked.tickets : [], [4]);
  });

  test("ses commentaires refusés : le rail reste lu, et ce qui n'a pas été vérifié est dit", async () => {
    const lu = await lireLeTableauDuRepository({ depot: REPOSITORY, appeler: github((chemin) => chemin.includes("/issues/4/comments")), maintenant: () => new Date(LU), signes: async () => ({ lus: [] }) });
    assert.ok(lu.lu, lu.lu ? "" : lu.raison);
    assert.equal((lu.faits.compteurs as { rail: number }).rail, 2);
    assert.deepEqual(factsDe(lu).railBloque, { illisible: "GitHub answered HTTP 502" });
  });
});

describe("« Tous les projets »", () => {
  const line = (lu: TableauLu, served = true) => lineDeProject({ nom: "secondes", servi: served }, { a: LU, faits: factsDe(lu) }, { texte: statusDuTableau(lu) });

  test("un projet au rail bloqué est « stuck », en rouge, sa phrase entière au survol ; un projet calme est au repos", () => {
    const stuck = line(avecLeRail(EMPTY, rail(HUIT), { lus: [station({ lastSeen: "2026-11-11T12:00:00.000Z", stoppedAt: "2026-11-11T12:01:00.000Z" })] }));
    assert.equal(stuck.ton, "rouge");
    assert.equal(stuck.dit, "8 tickets no manager takes, for 14 h");
    assert.match(stuck.survol, /8 tickets on the rail, no manager has taken them for 14 h: its station box\/claude is stopped\. Start it on its computer\./);
    assert.equal(stateDeLaLine(stuck), "stuck");
    assert.equal(STATES.stuck.ton, "rouge");

    const calme = line(avecLeRail(EMPTY, rail([]), { lus: [station()] }));
    assert.equal(calme.ton, "vert");
    assert.equal(calme.dit, "nothing cooking, nothing waits for you");
    assert.equal(stateDeLaLine(calme), "idle");
    // Le délai pas encore passé : calme.
    assert.equal(stateDeLaLine(line(avecLeRail(EMPTY, rail([{ ticket: 4, depuis: new Date(MAINTENANT - 60_000).toISOString() }]), { lus: [] }))), "idle");
    // Un autre rouge reste « held ».
    assert.equal(stateDeLaLine({ ton: "rouge", dit: "kitchen held" }), "held");
  });

  test("aucune station ne le sert : il est « stuck », non plus muet", () => {
    const stuck = line(avecLeRail(EMPTY, rail(HUIT), { lus: [] }), false);
    assert.equal(stateDeLaLine(stuck), "stuck");
    assert.match(stuck.survol, /no station serves this project\. Add the project to a station\./);
    assert.equal(line(avecLeRail(EMPTY, rail([]), { lus: [] }), false).dit, "no station: nothing is read");
  });
});
