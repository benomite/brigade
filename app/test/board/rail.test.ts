// La vue du rail d'un projet, nourrie de GitHub seul (app/src/board/rail.ts, #1694, #2061) : la lecture des issues, de
// leurs labels et des PR du dépôt donne ce que le rail lisait de la station — ses tickets et leur état, les cooks en
// cours, ce qui attend le chef —, sous la forme que ce qui le dessine reçoit déjà (facts.ts, awaiting.ts, slip.ts,
// upstream.ts). GitHub est une doublure ; tout lancement de processus — le geste de la station d'abord — fait échouer le
// test.
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { readFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { test, type TestContext } from "node:test";
import { putAPart, ticketsOf } from "../../src/awaiting.ts";
import { ACTION, launchThe } from "../../src/box.ts";
import { see as seeUpstream } from "../../src/upstream.ts";
import { holdFacts, titleOfFailure, type Drawable } from "../../src/facts.ts";
import { withWhatAwaitingTheChef } from "../../src/board/wait-of-chef.ts";
import type { CallGitHub, AnswerGitHub } from "../../src/board/client.ts";
import { readTheBoardOfRepository, type ReadOfBoardOfRepository, type LineOfTheFile, type BoardRead } from "../../src/board/read.ts";
import {
  upstreamOfBoard,
  readOfBoard,
  openStandbyOfBoard,
  outputOfBoard,
  statusOfBoard,
  holdReadsOfBoard,
  type ReadOfRail,
} from "../../src/board/rail.ts";

const REPOSITORY = "acme/brigade";
const READ_PAR_THE_APP = new Date("2026-10-12T10:05:00.000Z");
const PROJECT = { nom: "brigade" };

// Aucun processus ne part pendant le test. Chaque tentative est notée, et échoue.
function withoutProcess(t: TestContext): string[] {
  const launched: string[] = [];
  const module = childProcess as unknown as Record<string, (...args: unknown[]) => unknown>;
  for (const name of ["execFile", "execFileSync", "spawn", "spawnSync", "exec", "execSync", "fork"]) {
    t.mock.method(module, name, (command: unknown, args: unknown) => {
      launched.push([String(command), ...(Array.isArray(args) ? args.map(String) : [])].join(" "));
      throw new Error(`no process may be launched to draw the rail: ${String(command)}`);
    });
  }
  // Les imports nommés de `node:child_process` (box.ts, `execFile`) suivent la doublure.
  syncBuiltinESMExports();
  t.after(() => syncBuiltinESMExports());
  return launched;
}

const ok = (data: unknown): AnswerGitHub => ({ status: 200, data });
const issue = (number: number, labels: string[], extra: object = {}) => ({
  number,
  title: `Ticket ${number}`,
  html_url: `https://github.com/${REPOSITORY}/issues/${number}`,
  created_at: "2026-10-12T08:00:00Z",
  labels: labels.map((name) => ({ name })),
  ...extra,
});
const taking = (id: number, station: string, the: string) => ({ id, body: `<!-- brigade:prise station=${station} -->`, author_association: "OWNER", created_at: the });

// Le projet sur GitHub : #30 en attente (prio:0), #23 pris par box/claude, #17 en pass (PR #50) cuisiné par mac/claude,
// #35 parqué (`parked`, WAITING) ; #60, une épique, avant le rail ; #24, une carte du chef (`chef-todo`) qui pose une question.
// `chemins` : ce qui a été demandé.
function github(paths: string[] = []): CallGitHub {
  // #30, calibré par le manager : rien ne le bloque (le rail bloqué, #3358 : test/rail-blocked/).
  const atFire = [issue(30, ["fire", "prio:0", "model:sonnet", "effort:medium"]), issue(23, ["fire", "taken"]), issue(17, ["fire", "in-pass"]), issue(35, ["fire", "parked", "taken"])];
  return async (path) => {
    paths.push(path);
    if (path.includes("/issues?") && path.includes("labels=fire")) return ok(atFire);
    if (path.includes("/issues?") && path.includes("labels=chef-todo")) return ok([issue(24, ["chef-todo"])]);
    if (path.includes("/issues?")) return ok([...atFire, issue(60, ["epic"]), issue(24, ["chef-todo"])]);
    if (path.includes("/pulls?")) return ok([{ number: 50, html_url: `https://github.com/${REPOSITORY}/pull/50`, created_at: "2026-10-12T09:30:00Z", head: { ref: "cook/17-rail" }, body: "" }]);
    if (path === `/repos/${REPOSITORY}`) return ok({ default_branch: "main" });
    if (path.includes("/commits/main/check-runs")) return ok({ check_runs: [{ conclusion: "success" }] });
    if (path.includes("/issues/23/comments")) return ok([taking(1, "box/claude", "2026-10-12T09:00:00Z")]);
    if (path.includes("/issues/17/comments")) return ok([taking(2, "mac/claude", "2026-10-12T08:30:00Z")]);
    if (path.includes("/issues/24/comments")) return ok([{ body: "<!-- brigade:todo kind=product-question -->\nOne list per project, or one for all?" }]);
    if (/\/issues\/\d+\/(comments|events)/.test(path)) return ok([]);
    return { status: 404, data: {} };
  };
}

// La lecture d'un projet, comme le process principal la fait (main.ts) : le rail, puis ce qui attend le chef.
async function readTheProject(call: CallGitHub): Promise<ReadOfBoardOfRepository> {
  return withWhatAwaitingTheChef(await readTheBoardOfRepository({ depot: REPOSITORY, appeler: call, maintenant: () => READ_PAR_THE_APP }), call);
}
async function readOne(call: CallGitHub = github()): Promise<BoardRead> {
  const reading = await readTheProject(call);
  assert.ok(reading.lu, reading.lu ? "" : reading.raison);
  return reading;
}

// Une lecture faite à la main : ce que `status` en tire seulement. `file` : ce qui attend le chef (wait-of-chef.ts).
const writtenOne = (file: LineOfTheFile[], bilans: string[] = []): Pick<BoardRead, "file" | "bilans" | "luLe" | "cuisine" | "lignesDuRail"> => ({
  file,
  bilans,
  luLe: READ_PAR_THE_APP.toISOString(),
  cuisine: { rubriques: [{ titre: "kitchen", lignes: ["open"] }, { titre: "rail", lignes: ["1 queued"] }, { titre: "cooks", lignes: ["none running"] }] },
  lignesDuRail: [{ ticket: 30, priorite: 0, ligne: "  #30  queued  prio:0  since 2026-10-12 08:00 UTC  Ticket 30" }],
});

// Les lectures que les veilles du rail et des faits rendent, une fois chacune.
async function readParTheStandbys(call: CallGitHub) {
  const boards = holdReadsOfBoard<typeof PROJECT>({ lire: () => readTheProject(call), fraicheurMs: 60_000 });
  const readings = new Map<string, ReadOfRail>();
  const { promise: readEntries, resolve: allRead } = Promise.withResolvers<void>();
  const receive = (command: string) => (reading: ReadOfRail) => {
    readings.set(command, reading);
    if (readings.size === 2) allRead();
  };
  const standby = openStandbyOfBoard({ lire: boards.lire, intervalleMs: 3_600_000, surLecture: receive("status") });
  const factsWatch = openStandbyOfBoard({ lire: boards.lire, intervalleMs: 3_600_000, surLecture: receive("facts") });
  standby.regarder([PROJECT], ["status"], 1);
  factsWatch.regarder([PROJECT], ["facts"], 2);
  await readEntries;
  standby.fermer();
  factsWatch.fermer();
  return { status: readings.get("status") as ReadOfRail, facts: readings.get("facts") as ReadOfRail, tableaux: boards };
}

test("la garde prend le geste de la station lancé par le chemin des veilles : c'est elle qui ferait échouer le rail s'il en lançait un", async (t) => {
  const launched = withoutProcess(t);
  const locale = { node: "/usr/bin/fausse-node", runtime: "/tmp/runtime", racine: "/tmp/station", env: {} };
  await assert.rejects(launchThe({ delaiMs: 1_000 }, { nom: "brigade", cuisine: { locale } }, "facts"), /no process may be launched to draw the rail: \/usr\/bin\/fausse-node/);
  assert.equal(launched.length, 1);
  assert.match(launched[0] ?? "", new RegExp(`^/usr/bin/fausse-node ${join("/tmp/runtime", ACTION).replace(/[\\/.]/g, "\\$&")} brigade facts$`));
});

test("GitHub seul, aucune box jointe : la couche de données du rail rend les tickets et leur état, les cooks en cours, et les cartes du chef", async (t) => {
  const launched = withoutProcess(t);
  const paths: string[] = [];
  const { status, facts } = await readParTheStandbys(github(paths));
  // Les deux veilles ont lu le même rail : une seule lecture de GitHub — le rail, puis ce qui attend le chef, qui relit
  // les tickets `fire` mis de côté (wait-of-chef.ts).
  assert.equal(paths.filter((path) => path.includes("labels=fire")).length, 2);
  assert.equal(paths.filter((path) => path.includes("labels=chef-todo")).length, 1);
  assert.deepEqual([status.projet, status.demande, facts.projet, facts.demande], ["brigade", 1, "brigade", 2]);
  // L'âge du rail : l'heure de sa lecture sur GitHub.
  assert.ok(!("erreur" in facts));
  assert.equal(facts.publieLe, READ_PAR_THE_APP.toISOString());

  // Ce que le process principal en fait, tel quel : `status` mis à part, puis les faits reçus.
  const heldOnes = holdFacts();
  heldOnes.attendre(putAPart(status));
  const receivedOne: Drawable = heldOnes.recevoir(facts);
  assert.ok("tableau" in receivedOne, JSON.stringify(receivedOne).slice(0, 400));
  const { tableau: board } = receivedOne;
  const column = (name: string) => board.rail.colonnes.find((c) => c.nom === name)?.cartes.map(({ ticket, etat: state }) => [ticket, state]);

  // Les tickets et leur état, chacun dans sa colonne.
  assert.deepEqual(board.rail.colonnes.map(({ nom: name }) => name), ["On the rail", "Taken", "Pass", "Awaiting you", "Waiting", "Served"]);
  assert.deepEqual(column("On the rail"), [[30, "en attente"]]);
  assert.deepEqual(column("Taken"), [[23, "pris"]]);
  assert.deepEqual(column("Pass"), [[17, "en pass"]]);
  assert.deepEqual(column("Waiting"), [[35, "WAITING"]]);
  // Ce qu'une carte tire de la ligne `status` de son ticket : la priorité, et qui la tient.
  const card30 = board.rail.colonnes.flatMap(({ cartes: cards }) => cards).find(({ ticket }) => ticket === 30);
  assert.equal(card30?.prio, "prio:0");
  assert.ok(board.rail.railLu !== undefined, "les lignes du rail ont été lues");

  // Les cooks en cours : quel ticket, sur quelle station.
  assert.deepEqual(board.cooks.enCours.map(({ ticket, station }) => [ticket, station]).sort(), [
    [17, "mac/claude"],
    [23, "box/claude"],
  ]);

  // Ce qui attend le chef : TODO, la carte de #24 avec sa sorte et son texte.
  const todo = board.rail.colonnes.find((c) => c.nom === "Awaiting you")?.cartes ?? [];
  assert.deepEqual(todo.map(({ ticket }) => ticket), [24]);
  assert.ok(todo.every(({ attendu: expected }) => expected));
  assert.ok(board.rail.attendLu !== undefined, "le bloc `awaiting` a été pris");
  assert.deepEqual(todo[0]?.chef, { sorte: "product-question", texte: "One list per project, or one for all?" });

  assert.deepEqual(launched, [], "aucun processus n'est parti");
});

test("la sortie de `status` refaite de la lecture : ses rubriques, le bloc `awaiting` juste avant la ligne `rail`, et sous elle la ligne de chaque ticket", async () => {
  const published = await readOne();
  const text = statusOfBoard(published);
  const lines = text.split("\n");
  const rankRail = lines.findIndex((l) => /^rail\s/.test(l));
  const endAwaiting = lines.indexOf("end awaiting");
  assert.ok(lines.findIndex((l) => l.startsWith("awaiting   ")) < endAwaiting && endAwaiting < rankRail);
  assert.equal(lines[rankRail], "rail       1 taken · 1 in pass · 1 WAITING · 1 queued");
  assert.deepEqual(lines.slice(rankRail + 1, rankRail + 1 + published.lignesDuRail.length), published.lignesDuRail.map(({ ligne: line }) => line));
  assert.match(text, /^cooks {6}2 running$/m);
  // Ce que seule la box lit n'y est pas : les derniers événements.
  assert.doesNotMatch(text, /^latest events$/m);
  // Les rubriques d'avant `rail` restent avant le bloc, celles d'après après lui.
  const main = statusOfBoard(writtenOne([])).split("\n");
  assert.deepEqual(main, ["kitchen    open", "", "awaiting   nothing awaits the chef", "end awaiting", "", "rail       1 queued", "  #30  queued  prio:0  since 2026-10-12 08:00 UTC  Ticket 30", "", "cooks      none running", ""]);
});

test("le bloc `awaiting` de `status` : ce qui attend le chef, une ligne par entrée, datée jusqu'à la lecture, puis ce qui n'en est pas une", async () => {
  const entry = (ticket: number, since: string): LineOfTheFile => ({ nom: `#${ticket}`, ticket, titre: `Ticket ${ticket}`, quoi: "carte", depuis: since, ligne: "Which plan? — answer on its Todo card, in your own words" });
  const block = (file: LineOfTheFile[], bilans: string[] = []) => putAPart({ projet: "brigade", demande: 1, a: READ_PAR_THE_APP.toISOString(), sorties: [{ commande: "status", texte: statusOfBoard(writtenOne(file, bilans)) }] });
  const no = block([]);
  const two = block([entry(24, "2026-10-12T09:05:00.000Z"), entry(25, "2026-10-12T10:00:00.000Z")], ["#26 carries `chef-todo` but is not shown in Todo"]);
  assert.ok(!("erreur" in no) && !("erreur" in two));
  assert.match(no.attend ?? "", /^awaiting {3}nothing awaits the chef\nend awaiting/);
  assert.equal(
    two.attend,
    ["awaiting   2 decisions await the chef — the oldest for 1 h 00", "  #24  for 1 h 00  Which plan? — answer on its Todo card, in your own words  Ticket 24", "  #25  for 5 min  Which plan? — answer on its Todo card, in your own words  Ticket 25", "  #26 carries `chef-todo` but is not shown in Todo", "end awaiting", ""].join("\n"),
  );
  assert.deepEqual(ticketsOf(two.attend ?? "").map(({ ticket }) => ticket), [24, 25]);
  // Lue de GitHub : la carte du chef #24, sa question et son geste.
  assert.match(statusOfBoard(await readOne()), /^awaiting {3}1 decision awaits the chef — for .*\n {2}#24 {2}for .* {2}One list per project, or one for all\? — answer on its Todo card, in your own words {2}Ticket 24\nend awaiting$/m);
});

test("ce qui est avant le rail : la sortie de `manager upstream`, chaque issue avec l'adresse de son issue", async () => {
  const published = await readOne();
  const reading = readOfBoard(published, "brigade", 1, ["manager upstream"]);
  const seenOne = seeUpstream(reading);
  assert.ok("compte" in seenOne, JSON.stringify(seenOne));
  // #24, une carte du chef, est parquée pour lui (#4260) : à part, comme le runtime la lit (runtime/src/amont.ts).
  assert.deepEqual(seenOne.groupes.map(({ etat: state, issues }) => [state, issues.map(({ ticket }) => ticket)]), [
    ["epique", [60]],
    ["mise-de-cote", [24]],
  ]);
  assert.deepEqual(JSON.parse(upstreamOfBoard(published) ?? "null").issues[1], { ticket: 60, titre: "Ticket 60", priorite: null, etat: "epique", dit: "it carries `epic`: not split yet", url: `https://github.com/${REPOSITORY}/issues/60` });
});

test("ce qui est avant le rail qui n'a pas été lu n'est ni compté ni dit « pas lu » (#1770), et rien d'autre n'est lu", async (t) => {
  const launched = withoutProcess(t);
  const { avantLeRail: _before, ...withoutUpstream } = await readOne();
  assert.equal(upstreamOfBoard(withoutUpstream), undefined);
  const reading = readOfBoard(withoutUpstream, "brigade", 1, ["manager upstream"]);
  assert.ok("erreur" in reading && reading.duTableau === true && reading.pasPublie === true);
  const seenOne = seeUpstream(reading);
  assert.ok("nonPublie" in seenOne);
  assert.ok(!("sans" in seenOne) && !("compte" in seenOne));
  assert.equal(seenOne.vide, "nothing on the rail");
  assert.deepEqual(launched, []);
});

test("une commande que GitHub ne porte pas : elle n'est pas lue, et la phrase dit que seul le journal de la station la porte", async () => {
  const published = await readOne();
  assert.deepEqual(outputOfBoard(published, "manager"), { raison: "`manager` is not read from GitHub for acme/brigade: only the station's log carries it.", pasPublie: true });
  assert.deepEqual(outputOfBoard(published, () => "composée"), { raison: "This reading is not read from GitHub for acme/brigade: only the station's log carries it.", pasPublie: true });
  // La première qui ne se lit pas fait l'échec de la lecture entière.
  const reading = readOfBoard(published, "brigade", 2, ["facts", "manager", "status"]);
  assert.deepEqual(reading, { projet: "brigade", demande: 2, a: READ_PAR_THE_APP.toISOString(), erreur: "`manager` is not read from GitHub for acme/brigade: only the station's log carries it.", atteinte: true, cas: null, duTableau: true, pasPublie: true });
});

test("une lecture réussie : chaque sortie dans l'ordre demandé, et l'heure de la lecture de GitHub", async () => {
  const published = await readOne();
  const reading = readOfBoard(published, "brigade", 4, ["facts", "status"]);
  assert.ok(!("erreur" in reading));
  assert.deepEqual(reading.sorties.map(({ commande: command }) => command), ["facts", "status"]);
  assert.deepEqual(JSON.parse(reading.sorties[0]?.texte ?? ""), published.faits);
  assert.equal(reading.sorties[1]?.texte, statusOfBoard(published));
  assert.equal(reading.a, READ_PAR_THE_APP.toISOString());
  assert.equal(reading.publieLe, READ_PAR_THE_APP.toISOString());
});

test("GitHub qui ne se lit pas : un échec en une phrase, dit comme tel — ni « station injoignable », ni un rail vide ; hors ligne, il le reste", () => {
  const not: ReadOfBoardOfRepository = { lu: false, depot: REPOSITORY, luLe: READ_PAR_THE_APP.toISOString(), raison: "GitHub refused to read the rail of acme/brigade (HTTP 403)." };
  const rate = readOfBoard(not, "brigade", 3, ["facts"]);
  assert.deepEqual(rate, { projet: "brigade", demande: 3, a: READ_PAR_THE_APP.toISOString(), erreur: not.raison, atteinte: true, cas: null, duTableau: true });
  assert.ok("erreur" in rate);
  assert.equal(titleOfFailure(rate), "NOT READ FROM GITHUB");
  const receivedOne = holdFacts().recevoir(rate);
  assert.ok("titre" in receivedOne && "erreur" in receivedOne);
  assert.equal(receivedOne.titre, "NOT READ FROM GITHUB");
  // GitHub pas joint du tout (#1818) : l'échec le porte jusqu'à ce qui le dessine.
  const injoint: ReadOfBoardOfRepository = { ...not, raison: "GitHub could not be reached to read the rail of acme/brigade: getaddrinfo ENOTFOUND api.github.com.", horsLigne: true };
  assert.deepEqual(readOfBoard(injoint, "brigade", 3, ["facts"]), { projet: "brigade", demande: 3, a: READ_PAR_THE_APP.toISOString(), erreur: injoint.raison, atteinte: true, cas: null, duTableau: true, horsLigne: true });
});

test("les lectures du rail : une seule à la fois par projet, reprise tant qu'elle est fraîche ; « read again » la refait ; la dernière réussie est gardée", async () => {
  let instant = 0;
  let calls = 0;
  const boards = holdReadsOfBoard<typeof PROJECT>({
    lire: () => {
      calls += 1;
      const call: CallGitHub = calls === 3 ? async () => ({ status: 503, data: { message: "Unavailable" } }) : github();
      return readTheBoardOfRepository({ depot: REPOSITORY, appeler: call, maintenant: () => new Date(READ_PAR_THE_APP.getTime() + calls) });
    },
    fraicheurMs: 15_000, // plafonnée à 4 s
    maintenant: () => instant,
  });
  assert.equal(boards.dernier("brigade"), undefined);
  await Promise.all([boards.lire(PROJECT), boards.lire(PROJECT)]);
  assert.equal(calls, 1);
  instant = 3_999;
  await boards.lire(PROJECT);
  assert.equal(calls, 1);
  instant = 4_000;
  await boards.lire(PROJECT);
  assert.equal(calls, 2);
  const second = new Date(READ_PAR_THE_APP.getTime() + 2).toISOString();
  assert.equal(boards.dernier("brigade")?.luLe, second);
  // Relue tout de suite, sans attendre : GitHub refuse — la dernière réussie reste celle que visent les gestes.
  boards.oublier();
  const missed = await boards.lire(PROJECT);
  assert.equal(calls, 3);
  assert.equal(missed.lu, false);
  assert.equal(boards.dernier("brigade")?.luLe, second);
  assert.equal(boards.dernier(undefined), undefined);
});

test("la veille du rail ne lit que les projets dont la vue lit le rail, puis se tait quand on la ferme", async () => {
  const readOnes: string[] = [];
  const received: ReadOfRail[] = [];
  const { promise: readEntry, resolve } = Promise.withResolvers<void>();
  const standby = openStandbyOfBoard<{ nom: string; ici: boolean }>({
    lire: async (project) => {
      readOnes.push(project.nom);
      return { lu: false, depot: project.nom, luLe: READ_PAR_THE_APP.toISOString(), raison: "no rail." };
    },
    intervalleMs: 3_600_000,
    lisible: ({ ici: here }) => here,
    surLecture: (reading) => {
      received.push(reading);
      resolve();
    },
  });
  standby.regarder([{ nom: "loin", ici: false }, { nom: "brigade", ici: true }], ["facts"], 4);
  await readEntry;
  standby.fermer();
  assert.deepEqual(readOnes, ["brigade"]);
  assert.deepEqual(received.map(({ projet: project, demande: request }) => [project, request]), [["brigade", 4]]);
});

// Le graphe des imports d'un module qui restent à l'exécution — ceux de types seuls sont effacés —, de proche en
// proche, en chemins relatifs à la racine du dépôt.
const ROOT = resolve(import.meta.dirname, "..", "..", "..");
function graph(entry: string): string[] {
  const seenOnes = new Set<string>();
  const pile = [resolve(ROOT, entry)];
  while (pile.length > 0) {
    const file = pile.pop() as string;
    if (seenOnes.has(file)) continue;
    seenOnes.add(file);
    for (const [, specificateur = ""] of readFileSync(file, "utf8").matchAll(/^\s*(?:import|export)(?!\s+type\b)\b[^"'`;]*?\bfrom\s*"([^"]+)"/gm)) {
      if (specificateur.startsWith(".")) pile.push(resolve(dirname(file), specificateur));
      else seenOnes.add(specificateur);
    }
  }
  return [...seenOnes].map((path) => (path.startsWith(ROOT) ? relative(ROOT, path).split("\\").join("/") : path)).sort();
}

test("aucun chemin qui dessine le rail ne lance de processus : ses veilles lisent GitHub", () => {
  // La couche de données du rail, sa lecture et ses gestes n'importent rien qui lance un processus.
  for (const module of ["app/src/board/rail.ts", "app/src/board/read.ts", "app/src/board/todo-github.ts", "app/src/actions-github.ts"]) {
    const imported = graph(module);
    assert.ok(!imported.includes("node:child_process"), `${module} : ${imported.join(", ")}`);
    assert.ok(!imported.some((path) => /app\/src\/(box|terminaux|pty)\.ts$/.test(path)), `${module} : ${imported.join(", ")}`);
  }
  // Dans le process principal, les trois veilles qui dessinent le rail — `status`, les faits, l'amont — sont celles de
  // GitHub : aucune ne lance de processus.
  const main = readFileSync(join(ROOT, "app/src/main.ts"), "utf8");
  for (const standby of ["veille", "veilleDesFaits", "veilleDeLAmont"]) {
    const declaration = new RegExp(`^const ${standby} = (\\w+)\\(\\{([\\s\\S]*?)^\\}\\);`, "m").exec(main);
    assert.equal(declaration?.[1], "ouvrirVeilleDuTableau", standby);
  }
  // Les gestes du rail qui ont un fait sur GitHub visent la dernière lecture réussie ; seule la carte du chef lue de GitHub
  // se répond, sur son issue (#2434) — toute autre carte ne part pas.
  assert.match(main, /ipcMain\.handle\("gesteDeFiche"[\s\S]*?retirerLeLabel\(tableaux\.dernier/);
  assert.match(main, /ipcMain\.handle\("repondreCarte"[\s\S]*?if \(chef === undefined\) return \{ refus: SANS_FAIT\.carte[\s\S]*?repondreSurGithub\(/);
});
