// La lecture des projets sur le téléphone, de GitHub seul (#2501, épique #2498) : connecté à GitHub, le téléphone liste les
// projets du chef — ceux que ses stations servent, écrits dans leurs gists — et lit le rail et TODO de chacun comme le
// desktop, par ses modules. Joué sur un faux GitHub qui rend ce que l'API REST rend, derrière l'envoi même du téléphone :
// aucune station n'existe ici, et chaque adresse demandée est notée — toutes sont celles de l'API de GitHub.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import { APP } from "../packaging/construire.ts";
import { demarrageDuPont, poserLaVue, poserLesModules } from "../packaging/android.ts";
import type { Home } from "../src/home.ts";
import { putAside } from "../src/awaiting.ts";
import { holdFacts, type Drawable, type Board } from "../src/facts.ts";
import { INTERVAL_MS, readTheProjectsOfAccount, openTheReadGitHub, byCapacitor, type ProjectOfAccount, type PhoneGitHub } from "../src/read-github-phone.ts";
import { withWhatAwaitingTheChef } from "../src/board/wait-of-chef.ts";
import { API_GITHUB, clientGitHub, type Send, type AnswerGitHub } from "../src/board/client.ts";
import { readTheBoardOfRepository } from "../src/board/read.ts";
import { FACTS, readOfBoard, STATUS } from "../src/board/rail.ts";
import type { Bridge } from "../src/vue/bridge.d.ts";
import { FakeScreen, type Fake, type Played, playTheVue, repos } from "./helpers/false-vue.ts";

const READ = "2026-11-06T09:00:00.000Z";
const now = () => new Date(READ);
const TOKEN = "gho_du_coffre";

type Issue = { labels: string[]; commentaires?: unknown[]; assignes?: string[] };
type World = { gists: Record<string, Record<string, string>>; depots: Record<string, Record<number, Issue>> };
const said = (body: string, created_at: string) => ({ id: Date.parse(created_at), body, created_at, author_association: "OWNER" });
const recording = JSON.stringify({ brigade: "station-registration", format: 1, name: "atelier", platform: "linux", machine: "Linux 6.1.0", version: "1.0.0", registeredAt: "2026-11-01T00:00:00Z", lastSeen: READ, refreshMs: 120_000, stoppedAt: null });
const selection = (repositories: string[]) => JSON.stringify({ brigade: "station-selection", format: 1, repositories: repositories, updatedAt: "2026-11-02T00:00:00Z" });
const request = (projects: { nom: string; depot: string }[]) => JSON.stringify({ brigade: "projets", format: 1, projets: projects.map((project) => ({ ...project, base: "main", principale: true, cooks: 2, manager: { modele: "opus", effort: "high" }, reviewer: { modele: "opus", effort: "high" }, ouvertLe: null, demandeLe: null })) });

// Le compte du chef : `atelier`, une station enregistrée à qui l'app a choisi `chef/parade` et `chef/cantine` ; une
// station appairée à qui elle a demandé `chef/parade` sous le nom `parade` ; et un gist sans rapport.
// `parade` : #1 prêt (`fire`), #12 et #20 parqués pour le chef par la cuisine (`parked:chef`, #4474), #6 au backlog.
// `cantine` : rien du tout — ni issue, ni attente.
const WORLD: World = {
  gists: {
    a1: { "brigade-enregistrement.json": recording, "brigade-selection.json": selection(["chef/parade", "chef/cantine"]) },
    b2: { "brigade-station.json": "{}", "brigade-projets.json": request([{ nom: "parade", depot: "chef/parade" }]) },
    c3: { "notes.md": "# rien de brigade" },
  },
  depots: {
    "chef/parade": {
      1: { labels: ["fire", "prio:2", "model:sonnet", "effort:medium"] },
      6: { labels: [] },
      12: { labels: ["parked:chef"], commentaires: [said("Parked for the chef by its cook: does the export keep the old column order?", "2026-11-06T07:00:00Z")] },
      20: { labels: ["parked:chef"], commentaires: [said("Parked for the chef: which token does the box use for the registry?", "2026-11-06T08:00:00Z")] },
    },
    "chef/cantine": {},
  },
};

// GitHub, faux : ce que l'API REST rend à chaque adresse — ou, pour une adresse que `refuser` nomme, sa réponse à la
// place. Chaque demande est notée, son adresse entière et ses en-têtes. Ce qui n'est pas l'API de GitHub ne répond pas,
// comme une station qui n'existe pas.
function github(world: World = WORLD, refuse: (path: string) => AnswerGitHub | Error | undefined = () => undefined) {
  const requests: { adresse: string; entetes: Record<string, string> }[] = [];
  const ok = (data: unknown): AnswerGitHub => ({ status: 200, data });
  const send: Send = async (address, headers) => {
    requests.push({ adresse: address, entetes: headers });
    if (!address.startsWith(`${API_GITHUB}/`)) throw new Error(`failed to connect to ${address}`);
    const path = address.slice(API_GITHUB.length);
    const refusal = refuse(path);
    if (refusal instanceof Error) throw refusal;
    if (refusal !== undefined) return refusal;
    if (path.startsWith("/gists?")) return ok(/[?&]page=1(&|$)/.test(path) ? Object.entries(world.gists).map(([id, files]) => ({ id, files: Object.fromEntries(Object.keys(files).map((filename) => [filename, { filename }])) })) : []);
    const gist = /^\/gists\/([^/?]+)$/.exec(path)?.[1];
    if (gist !== undefined) {
      const files = world.gists[gist];
      return files === undefined ? { status: 404, data: { message: "Not Found" } } : ok({ id: gist, owner: { login: "chef" }, files: Object.fromEntries(Object.entries(files).map(([filename, content]) => [filename, { filename, content }])) });
    }
    const [, repository = "", remains = ""] = /^\/repos\/([^/]+\/[^/?]+)(.*)$/.exec(path) ?? [];
    const issues = world.depots[repository];
    if (issues === undefined) return { status: 404, data: { message: "Not Found" } };
    const page = Number(/[?&]page=(\d+)/.exec(remains)?.[1] ?? "1");
    const json = (number: number, issue: Issue) => ({ number: number, title: `Ticket ${number}`, html_url: `https://github.com/${repository}/issues/${number}`, created_at: "2026-11-05T00:00:00Z", labels: issue.labels.map((name) => ({ name })), assignees: (issue.assignes ?? []).map((login) => ({ login })) });
    if (remains.startsWith("/issues?")) {
      const label = /[?&]labels=([^&]+)/.exec(remains)?.[1];
      return ok(page > 1 ? [] : Object.entries(issues).filter(([, issue]) => label === undefined || issue.labels.includes(label)).map(([number, issue]) => json(Number(number), issue)));
    }
    if (remains.startsWith("/pulls?")) return ok([]);
    // Le dépôt lui-même : son propriétaire, une personne, chef par défaut de ses cartes (#3052).
    if (remains === "") return ok({ owner: { login: repository.split("/")[0], type: "User" } });
    const [, number, what] = /^\/issues\/(\d+)\/(comments|events)/.exec(remains) ?? [];
    if (number !== undefined) return ok(page > 1 || what === "events" ? [] : (issues[Number(number)]?.commentaires ?? []));
    return { status: 404, data: { message: "Not Found" } };
  };
  return { envoyer: send, demandes: requests };
}

// Le téléphone connecté à GitHub : sa lecture ouverte sur ce GitHub, et chaque envoi à la vue noté par canal. Rien n'est
// replanifié : la lecture suivante part quand le test la demande.
function phone({ envoyer: send, connus: knownOnes = [] }: { envoyer: Send; connus?: ProjectOfAccount[] }) {
  const receivedOnes: Record<string, unknown[][]> = {};
  const guards: ProjectOfAccount[][] = [];
  const scheduled: number[] = [];
  const reading = openTheReadGitHub({
    jeton: async () => TOKEN,
    envoyer: send,
    compte: "chef",
    connus: knownOnes,
    garder: (projects) => guards.push(projects),
    maintenant: now,
    planifier: (_do, ms) => (scheduled.push(ms), () => undefined),
    dire: ((channel: string, ...args: unknown[]) => void (receivedOnes[channel] ??= []).push(args)) as Parameters<typeof openTheReadGitHub>[0]["dire"],
  });
  const last = (channel: string) => (receivedOnes[channel] ?? []).map(([first]) => first);
  // Le dernier dessin du rail de ce projet.
  const rail = (project: string) => last("surFaits").filter((receivedOne): receivedOne is Drawable => (receivedOne as Drawable).projet === project).at(-1);
  const such = () => last("surTelephone").at(-1) as PhoneGitHub | undefined;
  const home = () => last("surAccueil").at(-1) as Home | undefined;
  return { lecture: reading, recus: receivedOnes, gardes: guards, planifiees: scheduled, rail, tel: such, accueil: home };
}

const boardOf = (receivedOne: Drawable | undefined): Board => {
  assert.ok(receivedOne !== undefined && "tableau" in receivedOne, `the rail is drawn: ${JSON.stringify(receivedOne)}`);
  return receivedOne.tableau;
};
const columns = (seenOne: Board) => Object.fromEntries(seenOne.rail.colonnes.map(({ nom: name, cartes: cards }) => [name, cards.map(({ ticket }) => ticket)]));
// Le kanban de la cuisine (board/kitchen-board.ts, #4507) : chaque colonne, ses tickets.
const kanban = (seenOne: Board) => Object.fromEntries((seenOne.kitchenBoard ?? assert.fail("no kanban")).columns.map(({ key, cards }) => [key, cards.map(({ ticket }) => ticket)]));

// Ce que le desktop dessine du même projet, sur le même GitHub (main.ts : `lireLeTableau`, puis la veille des faits et
// celle de `status`) : la lecture du rail, ce qui attend le chef, `facts`, puis `status` mis à part.
async function asTheDesktop(name: string, repository: string, factsRequest: number, requestVue: number): Promise<Drawable | undefined> {
  const call = clientGitHub({ jeton: async () => TOKEN, envoyer: github().envoyer });
  const readOne = await withWhatAwaitingTheChef(await readTheBoardOfRepository({ depot: repository, appeler: call, maintenant: now }), call);
  const facts = holdFacts();
  facts.recevoir(readOfBoard(readOne, name, factsRequest, [FACTS]));
  return facts.attendre(putAside(readOfBoard(readOne, name, requestVue, [STATUS])));
}

describe("le téléphone connecté à GitHub lit ses projets, leur rail et leur TODO, sans station", () => {
  test("les projets du chef, lus dans les gists de ses stations : un dépôt, un projet, sous le nom que l'app lui a donné", async () => {
    const { envoyer: send, demandes: requests } = github();
    const { lecture: reading, recus: receivedOnes, gardes: guards } = phone({ envoyer: send });
    await reading.faits(1);
    const [configuration] = receivedOnes.surConfiguration?.at(-1) ?? [];
    assert.deepEqual((configuration as { projets: { nom: string; depot?: string; servi?: true }[] }).projets.map(({ nom: name, depot: repository, servi: served }) => ({ nom: name, depot: repository, servi: served })), [
      { nom: "cantine", depot: "chef/cantine", servi: true },
      { nom: "parade", depot: "chef/parade", servi: true },
    ]);
    assert.deepEqual(guards.at(-1), [{ nom: "cantine", depot: "chef/cantine" }, { nom: "parade", depot: "chef/parade" }]);
    assert.deepEqual(reading.configuration().projets.map(({ nom: name }) => name), ["cantine", "parade"]);
    // Le gist sans rapport n'est pas lu.
    assert.ok(!requests.some(({ adresse: address }) => address.endsWith("/gists/c3")));
  });

  test("chaque projet a son rail et son TODO, les mêmes que ceux que le desktop dessine du même projet", async () => {
    const { envoyer: send } = github();
    const { lecture: reading, rail } = phone({ envoyer: send });
    await reading.faits(1);
    await reading.regarder("parade", 2);
    const seenOne = boardOf(rail("parade"));
    assert.deepEqual(kanban(seenOne), { backlog: [6], ready: [1], cooking: [], pass: [], parked: [12, 20], served: [] });
    assert.deepEqual(columns(seenOne)["Awaiting you"], [12, 20]);
    assert.deepEqual(rail("parade"), await asTheDesktop("parade", "chef/parade", 1, 2));
    // Dans « All projects », le `status` de chacun est lu : le TODO de chacun aussi.
    await reading.tous(3);
    assert.deepEqual(rail("parade"), await asTheDesktop("parade", "chef/parade", 1, 3));
    assert.deepEqual(rail("cantine"), await asTheDesktop("cantine", "chef/cantine", 1, 3));
  });

  test("une carte assignée à un autre humain que le compte du téléphone : au pied de TODO, sous « Awaiting others », comme au desktop (#2985)", async () => {
    const parade = WORLD.depots["chef/parade"] ?? assert.fail("pas de parade");
    const { envoyer: send } = github({ ...WORLD, depots: { ...WORLD.depots, "chef/parade": { ...parade, 20: { ...parade[20]!, assignes: ["alice"] } } } });
    const { lecture: reading, rail } = phone({ envoyer: send });
    await reading.faits(1);
    await reading.regarder("parade", 2);
    const seenOne = boardOf(rail("parade"));
    const todo = seenOne.rail.colonnes.find(({ nom: name }) => name === "Awaiting you");
    assert.deepEqual(todo?.cartes.map(({ ticket }) => ticket), [12]);
    assert.deepEqual(todo?.autres?.map(({ ticket, todo: card, qui: who }) => ({ ticket, question: card?.question, qui: who })), [{ ticket: 20, question: "Parked for the chef: which token does the box use for the registry?", qui: ["alice"] }]);
    assert.deepEqual(seenOne.rail.hors, []);
  });

  test("aucune demande ne part à une station : toutes vont à l'API de GitHub, avec le jeton du chef", async () => {
    const { envoyer: send, demandes: requests } = github();
    const { lecture: reading, rail } = phone({ envoyer: send });
    await reading.faits(1);
    await reading.tous(2);
    assert.ok(requests.length > 0);
    assert.deepEqual(requests.filter(({ adresse: address }) => !address.startsWith(`${API_GITHUB}/`)), []);
    assert.ok(requests.every(({ entetes: headers }) => headers.Authorization === `Bearer ${TOKEN}`));
    assert.ok("tableau" in (rail("parade") ?? {}) && "tableau" in (rail("cantine") ?? {}));
  });

  test("un projet vide : un rail lu sans carte, un TODO lu qui dit « nothing awaits you », et sa ligne dans « All projects » — jamais un écran vide", async () => {
    const { envoyer: send } = github();
    const { lecture: reading, rail, accueil: home } = phone({ envoyer: send });
    await reading.faits(1);
    await reading.tous(2);
    const seenOne = boardOf(rail("cantine"));
    assert.deepEqual(seenOne.rail.colonnes.flatMap(({ cartes: cards }) => cards), []);
    assert.equal(seenOne.rail.aucunTicket, true);
    // TODO est lu, et vide : il le dit.
    assert.equal(seenOne.rail.attendLu, READ);
    assert.equal(seenOne.rail.colonnes.find(({ nom: name }) => name === "Awaiting you")?.vide, "nothing awaits you");
    const line = home()?.projets.find(({ nom: name }) => name === "cantine");
    assert.ok(line !== undefined && line.dit !== "", JSON.stringify(home()));
  });

  test("un compte dont aucune station ne sert de projet : la liste est lue, vide — la vue le dit, rien n'est inventé", async () => {
    const { envoyer: send } = github({ gists: { c3: WORLD.gists.c3! }, depots: {} });
    const { lecture: reading, tel: such } = phone({ envoyer: send });
    await reading.faits(1);
    assert.deepEqual(reading.configuration().projets, []);
    assert.deepEqual(such(), { github: { compte: "chef" }, liste: { a: READ, lue: true } });
  });

  test("le rail d'un projet que GitHub refuse : l'échec que le desktop montre, sa raison en une phrase", async () => {
    const { envoyer: send } = github(WORLD, (path) => (path.startsWith("/repos/chef/parade/issues?") ? { status: 403, data: { message: "Resource not accessible by integration." } } : undefined));
    const { lecture: reading, rail, accueil: home } = phone({ envoyer: send });
    await reading.faits(1);
    await reading.tous(2);
    const receivedOne = rail("parade");
    assert.ok(receivedOne !== undefined && "erreur" in receivedOne, JSON.stringify(receivedOne));
    assert.equal(receivedOne.erreur, "GitHub refused to read the rail of chef/parade (HTTP 403): Resource not accessible by integration.");
    assert.ok(receivedOne.titre !== "");
    // Les autres projets se lisent toujours.
    boardOf(rail("cantine"));
    assert.match(home()?.projets.find(({ nom: name }) => name === "parade")?.dit ?? "", /\S/);
  });

  test("la liste que GitHub refuse : les projets connus restent, lus, et la liste dit pourquoi — se reconnecter sur un 401", async () => {
    const knownOnes = [{ nom: "parade", depot: "chef/parade" }];
    const { envoyer: send } = github(WORLD, (path) => (path.startsWith("/gists?") ? { status: 401, data: { message: "Bad credentials" } } : undefined));
    const { lecture: reading, rail, tel: such, recus: receivedOnes } = phone({ envoyer: send, connus: knownOnes });
    await reading.faits(1);
    assert.deepEqual(such()?.liste, { a: READ, lue: false, reason: "oublie", said: "GitHub refused the app's GitHub sign-in (HTTP 401): Bad credentials — sign in to GitHub again" });
    assert.equal(receivedOnes.surConfiguration, undefined);
    assert.deepEqual(reading.configuration().projets.map(({ nom: name }) => name), ["parade"]);
    boardOf(rail("parade"));
  });

  test("GitHub qui ne répond pas : la liste le dit, et le rail de chaque projet connu est un échec hors ligne — jamais un écran vide", async () => {
    const knownOnes = [{ nom: "parade", depot: "chef/parade" }];
    const { envoyer: send } = github(WORLD, () => new Error("Unable to resolve host \"api.github.com\""));
    const { lecture: reading, rail, tel: such, accueil: home } = phone({ envoyer: send, connus: knownOnes });
    await reading.faits(1);
    await reading.tous(2);
    assert.deepEqual(such()?.liste, { a: READ, lue: false, reason: "injoignable", said: 'GitHub could not be reached to list your projects: Unable to resolve host "api.github.com"' });
    const receivedOne = rail("parade");
    assert.ok(receivedOne !== undefined && "erreur" in receivedOne, JSON.stringify(receivedOne));
    assert.match(receivedOne.erreur, /^GitHub could not be reached to read the rail of chef\/parade/);
    assert.ok(home()?.projets.some(({ nom: name }) => name === "parade"));
  });

  test("un autre refus de la liste se dit tel que GitHub le donne", async () => {
    const { envoyer: send } = github(WORLD, (path) => (path.startsWith("/gists?") ? { status: 500, data: "<html>oops</html>" } : undefined));
    const { lecture: reading, tel: such } = phone({ envoyer: send });
    await reading.faits(1);
    assert.deepEqual(such()?.liste, { a: READ, lue: false, reason: "inattendu", said: "GitHub refused the list of your gists, where your stations keep your projects (HTTP 500)" });
  });

  test("une lecture à la fois, la suivante trente secondes après", async () => {
    const { envoyer: send, demandes: requests } = github();
    const { lecture: reading, planifiees: scheduled } = phone({ envoyer: send });
    await Promise.all([reading.faits(1), reading.relire(), reading.relire()]);
    // La première, puis une seule de plus pour les deux demandes venues pendant elle.
    assert.equal(requests.filter(({ adresse: address }) => address.includes("/gists?")).length, 2);
    assert.deepEqual(scheduled, [INTERVAL_MS]);
  });
});

describe("ce que le téléphone envoie et lit de GitHub", () => {
  test("le HTTP natif de Capacitor : un GET, ses en-têtes, le corps lu en JSON et l'ETag, quel que soit son nom", async () => {
    const options: unknown[] = [];
    const send = byCapacitor(async (request) => (options.push(request), { status: 200, data: '{"ok":true}', headers: { ETag: 'W/"abc"' } }));
    assert.deepEqual(await send(`${API_GITHUB}/gists`, { Accept: "application/vnd.github+json" }), { status: 200, data: { ok: true }, etag: 'W/"abc"' });
    assert.deepEqual(options, [{ url: `${API_GITHUB}/gists`, method: "GET", headers: { Accept: "application/vnd.github+json" } }]);
  });

  test("un gist supprimé entre la liste et sa lecture ne porte plus rien", async () => {
    const call = clientGitHub({ jeton: async () => TOKEN, envoyer: github(WORLD, (path) => (path === "/gists/b2" ? { status: 404, data: { message: "Not Found" } } : undefined)).envoyer });
    assert.deepEqual(await readTheProjectsOfAccount(call), [{ nom: "cantine", depot: "chef/cantine" }, { nom: "parade", depot: "chef/parade" }]);
  });

  // La WebView n'a rien de Node : la lecture posée par la construction de l'APK, et tout ce qu'elle importe, se charge
  // dans un Node privé de `process` (packaging/android.ts, `poserLesModules`).
  test("un dépôt où le compte ne peut pas écrire : le rail le dit en lecture seule, et ses deux liens s'ouvrent pour lui seul (#3163)", async () => {
    const { envoyer: send } = github(WORLD, (path) => (path === "/repos/chef/parade" ? { status: 200, data: { owner: { login: "chef", type: "User" }, permissions: { push: false, pull: true } } } : undefined));
    const { lecture: reading, rail } = phone({ envoyer: send });
    await reading.faits(1);
    await reading.regarder("parade", 2);
    assert.deepEqual(boardOf(rail("parade")).lectureSeule, { depot: "chef/parade" });
    assert.equal(reading.pageDeLaLectureSeule("parade", "fork"), "https://github.com/chef/parade/fork");
    assert.match(reading.pageDeLaLectureSeule("parade", "acces") ?? "", /^https:\/\/docs\.github\.com\//);
    // `cantine` : GitHub n'y dit rien de l'écriture — ni ligne, ni lien.
    await reading.tous(3);
    assert.equal(boardOf(rail("cantine")).lectureSeule, undefined);
    assert.equal(reading.pageDeLaLectureSeule("cantine", "fork"), undefined);
    assert.equal(reading.pageDeLaLectureSeule("parade", "ailleurs"), undefined);
  });

  test("la lecture posée se charge sans rien de Node, comme dans la WebView", (t) => {
    const www = mkdtempSync(join(tmpdir(), "lecture-github-telephone-"));
    t.after(() => rmSync(www, { recursive: true, force: true }));
    poserLesModules(www, APP, join(APP, "src", "read-github-phone.ts"));
    const load = spawnSync(process.execPath, ["--input-type=module", "-e", 'const lu = process.argv[1]; delete globalThis.process; import(lu).then((module) => console.log(Object.keys(module).sort().join(" ")), (erreur) => console.log(`KO ${erreur.message}`))', pathToFileURL(join(www, "src", "read-github-phone.js")).href], { encoding: "utf8" });
    assert.equal(load.stdout.trim(), "INTERVAL_MS byCapacitor openTheReadGitHub readTheProjectsOfAccount", load.stderr);
  });
});

// Le téléphone tel que l'APK le porte : le pont (www/android/pont.js), joué comme dans la WebView, et la lecture qu'il
// charge à côté de la vue (www/src/lecture-github-telephone.js), posés par la construction. Le coffre garde le jeton du
// chef (#2500) ; le HTTP natif de Capacitor est le faux GitHub de ce fichier, qui ne joint rien d'autre que l'API de
// GitHub. Le stockage garde aussi un appairage d'avant #2500, avec l'adresse de sa station : elle n'est jamais demandée.
const SET = mkdtempSync(join(tmpdir(), "lecture-github-telephone-apk-"));
after(() => rmSync(SET, { recursive: true, force: true }));
let setOne: Promise<string> | undefined;
function theVueSet(): Promise<string> {
  setOne ??= demarrageDuPont().then((startup) => {
    poserLaVue(startup, join(SET, "www"));
    return join(SET, "www");
  });
  return setOne;
}
type CallNative = { plugin: string; methode: string; options: Record<string, unknown> };

async function phoneOfLAPK({ monde: world = WORLD, refuser: refuse, connus: knownOnes }: { monde?: World; refuser?: Parameters<typeof github>[1]; connus?: ProjectOfAccount[] } = {}) {
  const { envoyer: send, demandes: requests } = github(world, refuse);
  const native: CallNative[] = [];
  const scheduled: number[] = [];
  const storage = new Map([["brigade.github", "chef"], ...(knownOnes === undefined ? [] : [["brigade.github.projets", JSON.stringify(knownOnes)] as [string, string]])]);
  const window: Record<string, unknown> = {
    location: { href: pathToFileURL(join(await theVueSet(), "src", "vue", "index.html")).href },
    localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => void storage.set(key, value), removeItem: (key: string) => void storage.delete(key) },
    // La lecture suivante, dans trente secondes : notée, jamais courue.
    setTimeout: (_do: () => void, ms: number) => scheduled.push(ms),
    clearTimeout: () => undefined,
    Capacitor: {
      nativePromise: async (plugin: string, method: string, options: Record<string, unknown>) => {
        native.push({ plugin, methode: method, options: JSON.parse(JSON.stringify(options)) });
        if (plugin === "Coffre" && method === "lire") return { valeur: TOKEN };
        if (plugin === "Coffre") return {};
        if (plugin !== "CapacitorHttp") return assert.fail(`unexpected call: ${plugin}.${method}`);
        const { status, data, etag } = await send(String(options.url), options.headers as Record<string, string>);
        return { status, data, headers: etag === undefined ? {} : { ETag: etag } };
      },
    },
  };
  vm.runInNewContext(readFileSync(join(await theVueSet(), "android", "pont.js"), "utf8"), { window, URL }, { importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER });
  const bridge = window.brigade as Record<string, (...args: unknown[]) => unknown>;
  const http = () => native.filter(({ plugin }) => plugin === "CapacitorHttp").map(({ options }) => String(options.url));
  return { pont: bridge, natifs: native, http, demandes: requests, planifiees: scheduled, stockage: storage };
}

// La vue de l'app — celle du desktop, sur un écran de téléphone (helpers/false-vue.ts) — branchée sur ce pont : chaque
// geste de la vue lui est demandé, et chaque envoi du pont arrive à la vue.
const CHANNELS = ["surConfiguration", "surFaits", "surAlertes", "surAccueil", "surActivites", "surAmont", "surTelephone"] as const;
async function theAppOnThePhone(options: Parameters<typeof phoneOfLAPK>[0] = {}) {
  const apk = await phoneOfLAPK(options);
  let vue: Played | undefined;
  const before: [string, unknown[]][] = [];
  const pass = (channel: string, args: unknown[]) => (vue as unknown as { dire: (channel: string, ...args: unknown[]) => void }).dire(channel, ...args);
  for (const channel of CHANNELS) apk.pont[channel]!((...args: unknown[]) => {
    const receivedOnes = JSON.parse(JSON.stringify(args)) as unknown[];
    if (vue === undefined) before.push([channel, receivedOnes]);
    else pass(channel, receivedOnes);
  });
  const action = (name: string) => (...args: unknown[]) => apk.pont[name]!(...args);
  const actions = Object.fromEntries(["demarrage", "faits", "tous", "regarder", "relireBox", "onglet"].map((name) => [name, action(name)]));
  vue = await playTheVue({ ...(actions as { demarrage: Bridge["demarrage"] }), espace: () => [], machines: () => [] }, { ecran: new FakeScreen(true) });
  for (const [channel, args] of before.splice(0)) pass(channel, args);
  return { ...apk, vue };
}
// Attend un fait — la vue et le pont répondent sans horloge : il est là quand la file des promesses et des fichiers est vide.
async function until(done: () => boolean): Promise<void> {
  for (let tour = 0; tour < 2000 && !done(); tour++) await repos();
  assert.ok(done(), "the fact never came");
}
// Le kanban dessiné (vue/kitchen-board/, #4507) : chaque colonne, les tickets de ses cartes.
const columnsViews = (vue: Played) =>
  Object.fromEntries(
    vue
      .element("rail")
      .dessous("section")
      .filter((pose) => pose.className === "colonne")
      .map((column) => [column.dataset.colonne, column.dessous("li").flatMap((li) => (li.dataset.ticket === undefined ? [] : [`#${li.dataset.ticket}`]))]),
  );
// La ligne du TODO du chef, au-dessus des colonnes (vue/kitchen/kitchen.js, `setTheTodo`).
const lineOfTodo = (vue: Played) => vue.element("rail").dessous("button").find((button) => button.className.split(" ").includes("ligne-du-todo"))?.textContent;
const caseOf = (vue: Played, name: string): Fake => vue.element("projets").children.find((pose) => pose.ariaLabel?.split(" — ")[0] === name) ?? assert.fail(`no case for ${name} in the bar`);

describe("l'app Android lit ses projets sur GitHub par son pont, aucune station jointe", () => {
  test("connecté, le pont rend le téléphone connecté et lit la liste, le rail et TODO sur GitHub — l'adresse de la station appairée n'est jamais demandée", async () => {
    const { pont: bridge, http, natifs: native, stockage: storage, planifiees: scheduled } = await phoneOfLAPK();
    const receivedOnes: Record<string, unknown[]> = {};
    for (const channel of CHANNELS) bridge[channel]!((first: unknown) => void (receivedOnes[channel] ??= []).push(JSON.parse(JSON.stringify(first))));
    const startup = JSON.parse(JSON.stringify(await bridge.demarrage!()));
    assert.deepEqual(startup.telephone, { github: { compte: "chef" } });
    assert.deepEqual(startup.configuration.projets, []);
    assert.deepEqual(http(), []);
    // La barre posée, puis « All projects » : la liste se lit, et la vue, qui la reçoit, redemande les faits et l'écran.
    bridge.faits!(1);
    bridge.tous!(2);
    await until(() => receivedOnes.surConfiguration !== undefined);
    assert.deepEqual((receivedOnes.surConfiguration?.at(-1) as { projets: { nom: string }[] }).projets.map(({ nom: name }) => name), ["cantine", "parade"]);
    bridge.faits!(3);
    bridge.tous!(4);
    const drawn = () => (receivedOnes.surFaits ?? []) as Drawable[];
    await until(() => ["parade", "cantine"].every((name) => drawn().some((receivedOne) => receivedOne.projet === name && "tableau" in receivedOne && receivedOne.tableau.rail.attendLu !== undefined)));
    // Le rail et TODO de parade : ce que le desktop dessine du même projet, sur le même GitHub.
    const parade = drawn().findLast((receivedOne) => receivedOne.projet === "parade");
    assert.deepEqual(columns(boardOf(parade))["Awaiting you"], [12, 20]);
    // Le téléphone lit à l'heure qu'il est, le desktop de ce test à `LU` : seules leurs heures diffèrent, et depuis
    // combien de temps chaque carte attend.
    const withoutHour = (receivedOne: unknown) =>
      JSON.parse(
        JSON.stringify(receivedOne)
          .replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z/g, "<heure>")
          .replace(/"for [^"]*?  /g, '"for <durée>  '),
      );
    assert.deepEqual(withoutHour(parade), withoutHour(await asTheDesktop("parade", "chef/parade", 3, 4)));
    // Chaque demande est partie à l'API de GitHub, avec le jeton du coffre ; aucune ailleurs.
    assert.ok(http().length > 0);
    assert.deepEqual(http().filter((url) => !url.startsWith(`${API_GITHUB}/`)), []);
    assert.ok(native.filter(({ plugin }) => plugin === "CapacitorHttp").every(({ options }) => (options.headers as Record<string, string>).Authorization === `Bearer ${TOKEN}`));
    // La liste lue est gardée — relancée, l'app la montre avant de relire —, et la lecture suivante part dans trente secondes.
    assert.deepEqual(JSON.parse(storage.get("brigade.github.projets") ?? "null"), [{ nom: "cantine", depot: "chef/cantine" }, { nom: "parade", depot: "chef/parade" }]);
    assert.deepEqual([...new Set(scheduled)], [INTERVAL_MS]);
    assert.deepEqual((receivedOnes.surTelephone?.at(-1) as PhoneGitHub).liste, { a: (receivedOnes.surTelephone?.at(-1) as { liste: { a: string } }).liste.a, lue: true });
  });

  test("l'app connectée liste les projets du chef ; chaque projet ouvert montre son rail et son TODO, lus sur GitHub", async () => {
    const { vue, http } = await theAppOnThePhone();
    await until(() => ["cantine", "parade"].every((name) => vue.element("projets").children.some((pose) => pose.ariaLabel?.split(" — ")[0] === name)));
    assert.match(vue.element("connexion-github").textContent, /^Signed in to GitHub as chef\./);
    caseOf(vue, "parade").click();
    await until(() => lineOfTodo(vue) === "2 wait for you");
    assert.deepEqual(columnsViews(vue), { Backlog: ["#6"], Ready: ["#1"], Cooking: [], Pass: [], Parked: ["#12", "#20"], Served: [] });
    assert.ok(!("Awaiting you" in columnsViews(vue)), "TODO n'est pas une colonne");
    // Le projet vide : un kanban sans carte, dont chaque colonne le dit — pas un écran vide, et aucune ligne de TODO.
    caseOf(vue, "cantine").click();
    await until(() => /no ticket in the backlog/.test(vue.element("rail").textContent));
    assert.equal(lineOfTodo(vue), undefined);
    assert.deepEqual(Object.values(columnsViews(vue)).flat(), []);
    assert.deepEqual(http().filter((url) => !url.startsWith(`${API_GITHUB}/`)), []);
  });

  test("GitHub qui refuse la liste : « All projects » le dit en une ligne, le détail au survol — jamais un écran vide", async () => {
    const { vue } = await theAppOnThePhone({ refuser: (path) => (path.startsWith("/gists?") ? { status: 500, data: "<html>oops</html>" } : undefined) });
    await until(() => /GitHub did not give your projects\./.test(vue.element("tous").textContent));
    const line = vue.element("tous").dessous("p").find((pose) => pose.className === "indisponible");
    assert.equal(line?.dataset.etat, "injoignable");
    assert.match(line?.dessous("button").find((pose) => pose.className === "aide")?.ariaLabel ?? "", /HTTP 500.*tries again every 30 s/);
  });

  test("la session GitHub refusée (401) : la ligne le dit, avec le geste qui reconnecte le téléphone", async () => {
    const { vue } = await theAppOnThePhone({ refuser: (path) => (path.startsWith("/gists?") ? { status: 401, data: { message: "Bad credentials" } } : undefined) });
    await until(() => /GitHub no longer accepts this phone's sign-in\./.test(vue.element("tous").textContent));
    assert.deepEqual(
      vue.element("tous").dessous("button").filter((pose) => pose.parentElement?.className === "action").map((pose) => [pose.textContent, pose.className]),
      [["sign in again", "recommande"]],
    );
  });

  test("GitHub injoignable : la liste le dit, le projet connu reste, et son rail montre l'échec — jamais un écran vide", async () => {
    const { vue, http } = await theAppOnThePhone({ connus: [{ nom: "parade", depot: "chef/parade" }], refuser: () => new Error('Unable to resolve host "api.github.com"') });
    await until(() => /This phone cannot reach GitHub\./.test(vue.element("tous").textContent));
    assert.match(vue.element("tous").textContent, /parade/);
    caseOf(vue, "parade").click();
    // L'échec que le desktop montre d'un rail que GitHub ne rend pas : hors ligne, depuis la dernière lecture tentée.
    await until(() => /offline since/.test(vue.element("rail").textContent));
    assert.deepEqual(http().filter((url) => !url.startsWith(`${API_GITHUB}/`)), []);
  });
});
