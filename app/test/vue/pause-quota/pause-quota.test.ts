// La pause de quota GitHub du compte (ticket 3482) : les stations tournent mais ne peuvent plus écrire leur signe de vie.
// Ni FAULT, ni rouge, ni « offline », ni « Start it on its computer » : une ligne calme en tête de l'app, dite une fois pour tout
// le compte, et chaque projet qui dit seulement qu'il est en pause pour la même raison. Les fixtures ont la forme du
// contrat : l'état de chaque station porte `quotaGithub` = { limite, pauseJusqua, utilise, maximum, renouvellement,
// parStationEtProjet }.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Drawable } from "../../../src/facts.ts";
import { openTheReadGitHub } from "../../../src/read-github-phone.ts";
import { withTheirState, type StationsOfAccount } from "../../../src/stations-of-account.ts";
import { API_GITHUB, type Send } from "../../../src/board/client.ts";
import { signsOf } from "../../../src/vue/cooks/signs-of-life.ts";
import { whatTheRailSays, inHowMany, pauseOfProjects, holdThePause } from "../../../src/vue/pause-quota/line-of-the-pause.js";
import { withThePresenceLocale, withTheStationLocale, pauseOfAccount, pauseQuotaRead, quotaGithubRead, signOfTheRecording } from "../../../src/vue/pause-quota/pause-quota.ts";
import { Fake } from "../../helpers/false-vue.ts";

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
const inPause = (others: Partial<Quota> = {}) => ({ ...box(), quotaGithub: quotaGithubRead(quota(others)) ?? assert.fail("quota illisible") });


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

describe("la pause du compte", () => {
  test("plusieurs stations en pause : la reprise la plus tardive, et une reprise inconnue l'emporte", () => {
    const mac = { ...inPause({ limite: "ecriture", pauseJusqua: minutes(30) }), name: "mac" };
    assert.deepEqual(pauseOfAccount([inPause(), mac], A), { limite: "ecriture", jusqua: minutes(30) });
    assert.deepEqual(pauseOfAccount([inPause(), { ...inPause({ pauseJusqua: null }), name: "mac" }], A), { limite: "core", jusqua: null });
    assert.deepEqual(pauseOfProjects([undefined, { limite: "core", jusqua: RESUMPTION }, { limite: "core", jusqua: minutes(2) }], A), { limite: "core", jusqua: RESUMPTION });
  });
});

describe("la station que l'app voit tourner sur cet ordinateur", () => {
  test("son signe de vie a quinze minutes, mais elle tourne ici : elle est vue à l'instant ; sans elle, rien ne change", () => {
    const signs = withTheStationLocale([box()], "gistbox", A);
    assert.equal(signs[0]?.lastSeen, READ);
    assert.deepEqual(withTheStationLocale([box()], null, A), [box()]);
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
  const readBy = async (files: Record<string, string>) => {
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
    const seenOne = await readBy({ "brigade-enregistrement.json": recording(quota()), "brigade-selection.json": selection });
    assert.deepEqual(seenOne.pauseQuota, { limite: "core", jusqua: RESUMPTION });
    // La vue du téléphone est celle du desktop : la même tête de rail, des mêmes mots.
    assert.deepEqual(whatTheRailSays(seenOne, A).enPause, true);
  });

  test("sans quota, ou un enregistrement qui ne se lit pas : aucune pause n'est dite", async () => {
    assert.equal((await readBy({ "brigade-enregistrement.json": recording(undefined), "brigade-selection.json": selection })).pauseQuota, undefined);
    assert.equal((await readBy({ "brigade-enregistrement.json": "pas du json", "brigade-selection.json": selection })).pauseQuota, undefined);
    assert.equal(signOfTheRecording(undefined), null);
  });
});
