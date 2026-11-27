// La pause de quota GitHub du compte (ticket 3482) : les stations tournent mais ne peuvent plus écrire leur signe de vie.
// Ni FAULT, ni rouge, ni « offline », ni « Start it on its computer » : une ligne calme en tête de l'app, dite une fois pour tout
// le compte, et chaque projet qui dit seulement qu'il est en pause pour la même raison. Les fixtures ont la forme du
// contrat : l'état de chaque station porte `quotaGithub` = { limite, pauseJusqua, utilise, maximum, renouvellement,
// parStationEtProjet }.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { lineOfProject } from "../../../src/home.ts";
import { POWER_UP } from "../../../src/power-up.ts";
import { forTheBar } from "../../../src/bar.ts";
import type { Reading } from "../../../src/box.ts";
import { EXAMPLE, type Project } from "../../../src/config.ts";
import { PALETTE } from "../../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../../src/kitchen.ts";
import { BANNER, understand, board, holdFacts, type Drawable, type Facts } from "../../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../../src/actions.ts";
import { openTheReadGitHub } from "../../../src/read-github-phone.ts";
import { TABS, HEADINGS } from "../../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../../src/projects/projects.ts";
import { withTheirState, type StationsOfAccount } from "../../../src/stations-of-account.ts";
import { API_GITHUB, type Send } from "../../../src/board/client.ts";
import type { BoardRead } from "../../../src/board/read.ts";
import { stateOfTheLine } from "../../../src/vue/home/projects/projects.js";
import { lineOfTheWait } from "../../../src/vue/wait-of-rail/line-of-the-wait.js";
import { signsOf } from "../../../src/vue/cooks/signs-of-life.ts";
import { whatTheRailSays, inHowMany, lineOfProjectEnPause, SAME_REASON, pauseOfProjects, PROJECT_EN_PAUSE, RESUMPTION_UNKNOWN, holdThePause } from "../../../src/vue/pause-quota/line-of-the-pause.js";
import { withThePresenceLocale, withTheStationLocale, pauseOfAccount, pauseQuotaRead, quotaGithubRead, signOfTheRecording } from "../../../src/vue/pause-quota/pause-quota.ts";
import { withTheRail, type RailOnGithub, type SignsOfLife, type TicketOnGithub } from "../../../src/vue/rail/github.ts";
import { lineOfRailBlocked } from "../../../src/vue/rail-blocked/line-of-rail-blocked.js";
import { Fake, playTheVue, repos } from "../../helpers/false-vue.ts";

const REPOSITORY = "chef/parade";
const READ = "2026-11-13T18:04:00.000Z";
const A = Date.parse(READ);
const RESUMPTION = "2026-11-13T18:11:00.000Z";
const minutes = (n: number) => new Date(A + n * 60_000).toISOString();
const doc = { createElement: (balise: string) => new Fake(balise) };
// Ce qui ne se dit jamais d'une pause.
const OUTAGE = /FAULT|offline|Start the station|Start it on its computer/;

type Quota = { limite: string; pauseJusqua: string | null; utilise: number; maximum: number; renouvellement: string; parStationEtProjet: Record<string, number> };
const quota = (others: Partial<Quota> = {}): Quota => ({ limite: "core", pauseJusqua: RESUMPTION, utilise: 5000, maximum: 5000, renouvellement: RESUMPTION, parStationEtProjet: { [`box/${REPOSITORY}`]: 5000 }, ...others });
// box : vue il y a quinze minutes — elle tourne, mais le quota l'empêche d'écrire son signe de vie.
const box = (others: Record<string, unknown> = {}) => ({ id: "gistbox", name: "box", lastSeen: minutes(-15), stoppedAt: null, refreshMs: 120_000, selection: [REPOSITORY], ...others });
const enPause = (others: Partial<Quota> = {}) => ({ ...box(), quotaGithub: quotaGithubRead(quota(others)) ?? assert.fail("quota illisible") });

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
const ticket = (number: number): TicketOnGithub => ({ ticket: number, titre: `Ticket ${number}`, url: `https://github.com/${REPOSITORY}/issues/${number}`, etat: "en attente", priorite: null, creeLe: minutes(-60), pr: null, prise: null, entreLe: minutes(-20) });
// Deux tickets en file depuis vingt minutes, qu'aucun manager n'a pris.
const RAIL: RailOnGithub = { lu: READ, tickets: [ticket(4), ticket(5)], nonPris: [{ ticket: 4, depuis: minutes(-20) }, { ticket: 5, depuis: minutes(-20) }] };
const reading = (signs: SignsOfLife) => withTheRail(EMPTY, RAIL, signs);
const factsOf = (readOne: BoardRead) => understand(JSON.stringify(readOne.faits)) as Facts;
// Le texte que la tête du rail pose : rail bloqué, attente de la file, ligne de pause — comme vue.js.
function headOfRail(readFacts: Facts, now = A): string {
  const said = whatTheRailSays(board(readFacts), now);
  const actions = { ouvrirStations: () => {} };
  const lines = [...lineOfRailBlocked(doc, said.railBloque, actions), ...lineOfTheWait(doc, said.railBloque === undefined ? said.attenteDuRail : undefined, actions), ...lineOfProjectEnPause(doc, said.enPause)] as unknown as Fake[];
  return lines.map((line) => line.textContent).join("\n");
}

describe("le contrat `quotaGithub`", () => {
  test("lu tel que le runtime le publie ; une limite inconnue ou une reprise illisible ne font pas une pause", () => {
    assert.deepEqual(quotaGithubRead(quota()), { limite: "core", pauseJusqua: RESUMPTION, utilise: 5000, maximum: 5000 });
    assert.deepEqual(quotaGithubRead(quota({ limite: "ecriture", pauseJusqua: null })), { limite: "ecriture", pauseJusqua: null, utilise: 5000, maximum: 5000 });
    for (const raw of [undefined, null, [], "core", quota({ limite: "search" }), quota({ pauseJusqua: "soon" }), { pauseJusqua: RESUMPTION }]) assert.equal(quotaGithubRead(raw), null, JSON.stringify(raw));
  });

  test("la lecture des stations du compte le passe aux signes de vie, avec le gist de chacune", () => {
    const readOne = { state: "listed", unreadable: [], stations: [{ ...box(), platform: "linux", machine: "", version: "1", account: "chef", available: false, quotaGithub: quota() }, { ...box({ id: "gistmac", name: "mac" }), platform: "macos", machine: "", version: "1", account: "chef", available: true, quotaGithub: "illisible" }] } as unknown as Parameters<typeof signsOf>[0];
    const signs = signsOf(readOne);
    assert.ok("lus" in signs);
    assert.deepEqual(signs.lus[0]?.quotaGithub, quotaGithubRead(quota()));
    assert.equal(signs.lus[0]?.id, "gistbox");
    assert.equal("quotaGithub" in (signs.lus[1] ?? {}), false);
  });

  test("`pauseQuota` de `facts` : rien de mal formé ne le pose", () => {
    assert.deepEqual(pauseQuotaRead({ limite: "core", jusqua: RESUMPTION }), { pauseQuota: { limite: "core", jusqua: RESUMPTION } });
    assert.deepEqual(pauseQuotaRead({ limite: "ecriture", jusqua: null }), { pauseQuota: { limite: "ecriture", jusqua: null } });
    for (const raw of [undefined, null, {}, { limite: "core" }, { limite: "x", jusqua: null }, { limite: "core", jusqua: "demain" }]) assert.deepEqual(pauseQuotaRead(raw), {}, JSON.stringify(raw));
  });
});

describe("la pause du compte, de la lecture du rail", () => {
  test("le quota épuisé : `facts` porte la pause — la limite, la reprise —, et le rail ne dit ni FAULT, ni offline, ni « Start the station »", () => {
    const readFacts = factsOf(reading({ lus: [enPause()] }));
    assert.deepEqual(readFacts.pauseQuota, { limite: "core", jusqua: RESUMPTION });
    // La station est retenue par GitHub, pas tue : les raisons du runtime le disent déjà.
    assert.equal(readFacts.attenteDuRail?.raison, "quota-github");
    assert.ok(readFacts.railBloque !== undefined && "cause" in readFacts.railBloque && readFacts.railBloque.cause === "sans-quota");
    const head = headOfRail(readFacts);
    assert.equal(head, PROJECT_EN_PAUSE);
    assert.doesNotMatch(head, OUTAGE);
  });

  test("sans le quota, la même station muette depuis quinze minutes reste dite hors ligne : la règle d'avant", () => {
    const readFacts = factsOf(reading({ lus: [box()] }));
    assert.equal(readFacts.pauseQuota, undefined);
    assert.match(headOfRail(readFacts), /FAULT/);
  });

  test("la reprise inconnue (`pauseJusqua` nul) : la pause tient, et la vue dit qu'elle ne sait pas quand elle revient", () => {
    const readFacts = factsOf(reading({ lus: [enPause({ pauseJusqua: null })] }));
    assert.deepEqual(readFacts.pauseQuota, { limite: "core", jusqua: null });
    assert.doesNotMatch(headOfRail(readFacts), OUTAGE);
    const element = new Fake("section");
    holdThePause(element as unknown as HTMLElement, doc, { maintenant: () => A, auRetour: () => {} }).suivre(readFacts.pauseQuota);
    assert.ok(element.textContent.includes(RESUMPTION_UNKNOWN), element.textContent);
    assert.doesNotMatch(element.textContent, /Resumes at/);
  });

  test("la reprise passée, ou un quota qui dit des appels restants sans reprise : plus de pause", () => {
    assert.equal(factsOf(reading({ lus: [enPause({ pauseJusqua: minutes(-1) })] })).pauseQuota, undefined);
    assert.equal(factsOf(reading({ lus: [enPause({ pauseJusqua: null, utilise: 10 })] })).pauseQuota, undefined);
  });

  test("plusieurs stations en pause : la reprise la plus tardive, et une reprise inconnue l'emporte", () => {
    const mac = { ...enPause({ limite: "ecriture", pauseJusqua: minutes(30) }), name: "mac" };
    assert.deepEqual(pauseOfAccount([enPause(), mac], A), { limite: "ecriture", jusqua: minutes(30) });
    assert.deepEqual(pauseOfAccount([enPause(), { ...enPause({ pauseJusqua: null }), name: "mac" }], A), { limite: "core", jusqua: null });
    assert.deepEqual(pauseOfProjects([undefined, { limite: "core", jusqua: RESUMPTION }, { limite: "core", jusqua: minutes(2) }], A), { limite: "core", jusqua: RESUMPTION });
  });
});

describe("une station vraiment arrêtée", () => {
  test("arrêtée, même avec un quota en pause : FAULT et « Start it on its computer » restent, la pause ne la couvre pas", () => {
    const stopped = { ...enPause(), stoppedAt: minutes(-14) };
    const readFacts = factsOf(reading({ lus: [stopped] }));
    assert.equal(readFacts.pauseQuota, undefined);
    const head = headOfRail(readFacts);
    assert.match(head, /FAULT/);
    assert.match(head, /Start it on its computer/);
  });

  test("arrêtée pendant que le compte est en pause (une autre station la porte) : sa panne garde sa ligne et son geste", () => {
    const stopped = { ...box(), stoppedAt: minutes(-14) };
    const elsewhere = { ...enPause(), name: "mac", selection: ["chef/autre"] };
    const readFacts = factsOf(reading({ lus: [stopped, elsewhere] }));
    assert.deepEqual(readFacts.pauseQuota, { limite: "core", jusqua: RESUMPTION });
    const head = headOfRail(readFacts);
    assert.match(head, /Start it on its computer/);
    assert.ok(!head.includes(PROJECT_EN_PAUSE), head);
  });
});

describe("la station que l'app voit tourner sur cet ordinateur", () => {
  test("son signe de vie a quinze minutes, mais elle tourne ici : ni offline, ni « Start the station »", () => {
    const signs = withTheStationLocale([box()], "gistbox", A);
    assert.equal(signs[0]?.lastSeen, READ);
    // Vivante, elle ne cache pas une autre panne (ici, son manager qui ne prend rien) : elle n'est juste pas dite tue.
    const head = headOfRail(factsOf(reading({ lus: signs })));
    assert.doesNotMatch(head, /offline|Start the station|Start it on its computer/);
    // Sans elle — elle ne tourne pas ici —, rien ne change.
    assert.deepEqual(withTheStationLocale([box()], null, A), [box()]);
    assert.match(headOfRail(factsOf(reading({ lus: withTheStationLocale([box()], "autre", A) }))), /FAULT/);
  });

  test("sa mise à jour la redémarre : ni FAULT ni file bloquée, même arrêtée ou hors ligne (#3637)", () => {
    const stopped = box({ stoppedAt: "2026-11-11T12:01:00.000Z" });
    const boardOf = (readOnes: ReturnType<typeof box>[]) => board(factsOf(reading({ lus: readOnes } as unknown as SignsOfLife)));
    for (const readOnes of [[stopped], [box()]]) {
      const without = whatTheRailSays(boardOf(readOnes), A);
      const withIt = whatTheRailSays(boardOf(readOnes), A, true);
      assert.ok(without.railBloque !== undefined || without.attenteDuRail !== undefined, "sans redémarrage, la panne se lit");
      assert.equal(withIt.railBloque, undefined);
      assert.equal(withIt.attenteDuRail, undefined);
    }
  });

  test("la liste des stations du compte la dit en ligne", () => {
    const readEntries = { state: "listed", unreadable: [], stations: [{ ...box(), platform: "macos", machine: "", version: "1", account: "chef", available: false }] } as unknown as StationsOfAccount;
    const state = (presences: ReturnType<typeof withThePresenceLocale>) => {
      const readOne = withTheirState(readEntries, presences, A);
      return readOne.state === "listed" ? readOne.stations[0] : assert.fail("pas listée");
    };
    assert.equal(state(withThePresenceLocale([], [{ id: "gistbox", name: "box" }], "gistbox"))?.available, true);
    assert.equal(state(withThePresenceLocale([], [{ id: "gistbox", name: "box" }], null))?.available, false);
  });
});

describe("la ligne de tête de l'app", () => {
  test("calme, avec l'horloge : la limite nommée, la reprise, un compte à rebours qui décroît, rien à faire", () => {
    let instant = A;
    const element = new Fake("section");
    let returns = 0;
    const pause = holdThePause(element as unknown as HTMLElement, doc, { maintenant: () => instant, auRetour: () => returns++ });
    pause.suivre({ limite: "core", jusqua: RESUMPTION });
    assert.equal(element.hidden, false);
    const [line] = element.children as Fake[];
    assert.equal(line?.className, "bandeau-pause");
    assert.notEqual(line?.role, "alert");
    assert.equal(line?.children[0]?.className, "horloge");
    const hour = new Date(RESUMPTION).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    assert.equal(element.textContent, `Paused: GitHub quota of the account reached (its core quota). Resumes at ${hour} (in 7 min). Nothing to do.`);
    assert.doesNotMatch(element.textContent, OUTAGE);
    instant += 60_000;
    pause.battre();
    assert.match(element.textContent, /\(in 6 min\)/);
    instant = Date.parse(RESUMPTION) - 30_000;
    pause.battre();
    assert.match(element.textContent, /\(in 30 s\)/);
    // La reprise : la ligne tombe d'elle-même, sans un clic, et le projet affiché se redessine.
    instant = Date.parse(RESUMPTION);
    pause.battre();
    assert.equal(element.hidden, true);
    assert.equal(element.children.length, 0);
    assert.equal(returns, 1);
    pause.battre();
    assert.equal(returns, 1);
  });

  test("la limite d'écriture de GitHub se dit en clair", () => {
    const element = new Fake("section");
    holdThePause(element as unknown as HTMLElement, doc, { maintenant: () => A, auRetour: () => {} }).suivre({ limite: "ecriture", jusqua: RESUMPTION });
    assert.match(element.textContent, /^Paused: GitHub's write limit reached for the account\. /);
  });

  test("le compte à rebours, en mots", () => {
    assert.equal(inHowMany(42_000), "in 42 s");
    assert.equal(inHowMany(7 * 60_000), "in 7 min");
    assert.equal(inHowMany(65 * 60_000), "in 1 h 05");
  });
});

describe("l'accueil", () => {
  test("le projet en pause dit seulement la même raison, d'une pastille calme — pas son rail bloqué en rouge", () => {
    const readFacts = factsOf(reading({ lus: [enPause()] }));
    const line = lineOfProject({ nom: "parade", servi: true }, { a: READ, faits: readFacts }, undefined);
    assert.equal(line.ton, "bleu");
    assert.equal(line.dit, SAME_REASON);
    assert.doesNotMatch(`${line.dit} ${line.survol}`, OUTAGE);
    assert.equal(stateOfTheLine(line), "paused");
  });

  test("sans la pause, la même lecture reste un rail bloqué, en rouge", () => {
    const line = lineOfProject({ nom: "parade", servi: true }, { a: READ, faits: factsOf(reading({ lus: [box()] })) }, undefined);
    assert.equal(line.ton, "rouge");
    assert.equal(stateOfTheLine(line), "stuck");
  });
});

describe("le téléphone", () => {
  // Le compte du chef sur GitHub : le gist de box, son enregistrement — le quota épuisé — et les projets qu'elle sert.
  const recording = (quotaGithub: unknown) => JSON.stringify({ brigade: "station-registration", format: 1, name: "box", platform: "linux", machine: "Linux", version: "1", registeredAt: minutes(-600), lastSeen: minutes(-15), refreshMs: 120_000, stoppedAt: null, ...(quotaGithub === undefined ? {} : { quotaGithub }) });
  const selection = JSON.stringify({ brigade: "station-selection", format: 1, repositories: [REPOSITORY], updatedAt: minutes(-600) });
  const github = (files: Record<string, string>): Send => async (address) => {
    const path = address.slice(API_GITHUB.length);
    if (path.startsWith("/gists?")) return { status: 200, data: /[?&]page=1(&|$)/.test(path) ? [{ id: "gistbox", files: Object.fromEntries(Object.keys(files).map((name) => [name, { filename: name }])) }] : [] };
    if (path === "/gists/gistbox") return { status: 200, data: { id: "gistbox", files: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, { filename: name, content }])) } };
    if (path === `/repos/${REPOSITORY}`) return { status: 200, data: { owner: { login: "chef", type: "User" } } };
    if (path.startsWith(`/repos/${REPOSITORY}/`)) return { status: 200, data: [] };
    return { status: 404, data: { message: "Not Found" } };
  };
  const readPar = async (files: Record<string, string>) => {
    const receivedOnes: unknown[] = [];
    const reading = openTheReadGitHub({
      jeton: async () => "gho_du_coffre",
      envoyer: github(files),
      compte: "chef",
      maintenant: () => new Date(A),
      planifier: () => () => undefined,
      dire: ((channel: string, first: unknown) => void (channel === "surFaits" && receivedOnes.push(first))) as Parameters<typeof openTheReadGitHub>[0]["dire"],
    });
    await reading.faits(1);
    const draws = receivedOnes.filter((receivedOne): receivedOne is Drawable => (receivedOne as Drawable).projet === "parade").at(-1);
    assert.ok(draws !== undefined && "tableau" in draws, JSON.stringify(draws));
    return draws.tableau;
  };

  test("il lit le quota de chaque station dans son gist, et chaque projet porte la même pause que sur le desktop", async () => {
    const seenOne = await readPar({ "brigade-enregistrement.json": recording(quota()), "brigade-selection.json": selection });
    assert.deepEqual(seenOne.pauseQuota, { limite: "core", jusqua: RESUMPTION });
    // La vue du téléphone est celle du desktop : la même tête de rail, des mêmes mots.
    assert.deepEqual(whatTheRailSays(seenOne, A).enPause, true);
  });

  test("sans quota, ou un enregistrement qui ne se lit pas : aucune pause n'est dite", async () => {
    assert.equal((await readPar({ "brigade-enregistrement.json": recording(undefined), "brigade-selection.json": selection })).pauseQuota, undefined);
    assert.equal((await readPar({ "brigade-enregistrement.json": "pas du json", "brigade-selection.json": selection })).pauseQuota, undefined);
    assert.equal(signOfTheRecording(undefined), null);
  });
});

describe("à l'écran", () => {
  const facts = (pauseUntil: string | null | undefined) => {
    const now = Date.now();
    const readOne: BoardRead = { ...EMPTY, luLe: new Date(now).toISOString(), faits: { ...EMPTY.faits, lu: new Date(now).toISOString() } };
    const station = { ...box({ lastSeen: new Date(now - 15 * 60_000).toISOString() }), ...(pauseUntil === undefined ? {} : { quotaGithub: quotaGithubRead(quota({ pauseJusqua: pauseUntil })) ?? assert.fail("quota") }) };
    const rail: RailOnGithub = { lu: readOne.luLe, tickets: [{ ...ticket(4), entreLe: new Date(now - 20 * 60_000).toISOString() }], nonPris: [{ ticket: 4, depuis: new Date(now - 20 * 60_000).toISOString() }] };
    return JSON.stringify(withTheRail(readOne, rail, { lus: [station] }).faits);
  };

  test("la pause en tête de l'app, une fois ; le rail du projet dit seulement la même raison ; elle tombe d'elle-même au retour du quota", async () => {
    const projects: Project[] = [{ nom: "parade", dossier: "/tmp/parade" }, { nom: "cantine", dossier: "/tmp/cantine" }];
    const vue = await playTheVue({
      demarrage: () => ({
        configuration: forTheBar({ chemin: "/tmp/app.json", projets: projects }, () => true),
        palette: PALETTE,
        exemple: EXAMPLE,
        onglets: TABS,
        rubriques: HEADINGS,
        gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
        banniere: BANNER,
        calibrage: { modeles: MODELS, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
    });
    const readFacts = holdFacts();
    const read = (project: string, text: string) => {
      const reading: Reading = { projet: project, demande: 1, a: new Date().toISOString(), sorties: [{ commande: "facts", texte: text }] };
      vue.dire("surFaits", readFacts.recevoir(reading));
    };
    const head = vue.element("pause-quota");
    assert.equal(head.hidden, true);
    const inSevenMinutes = new Date(Date.now() + 7 * 60_000).toISOString();
    read("parade", facts(inSevenMinutes));
    read("cantine", facts(inSevenMinutes));
    await repos();
    assert.equal(head.hidden, false);
    assert.equal(head.children.length, 1);
    assert.match(head.textContent, /^Paused: GitHub quota of the account reached \(its core quota\)\. Resumes at .+ \(in [67] min\)\. Nothing to do\.$/);
    vue.element("projets").children[1]?.click();
    await repos();
    const rail = vue.element("rail");
    assert.ok(rail.textContent.includes(PROJECT_EN_PAUSE), rail.textContent);
    assert.doesNotMatch(rail.textContent, OUTAGE);
    // Le quota revenu : la lecture suivante ne porte plus la pause, et tout tombe sans un clic.
    read("parade", facts(undefined));
    read("cantine", facts(undefined));
    await repos();
    assert.equal(head.hidden, true);
    assert.ok(!rail.textContent.includes(PROJECT_EN_PAUSE), rail.textContent);
  });
});
