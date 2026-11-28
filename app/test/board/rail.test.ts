// La vue du rail d'un projet, nourrie de GitHub seul (app/src/board/rail.ts, #1694, #2061) : la lecture des issues, de
// leurs labels et des PR du dépôt donne ce que le rail lisait de la station — ses tickets et leur état, les cooks en
// cours, ce qui attend le chef —, sous la forme que ce qui le dessine reçoit déjà (facts.ts, awaiting.ts, slip.ts,
// upstream.ts) ; depuis #4507, le kanban des labels de la cuisine. GitHub est une doublure ; tout lancement de processus — le geste de la station d'abord — fait échouer le
// test.
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { readFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { test, type TestContext } from "node:test";
import { putAside, ticketsOf } from "../../src/awaiting.ts";
import { see as seeUpstream } from "../../src/upstream.ts";
import { holdFacts, titleOfFailure, type Drawable } from "../../src/facts.ts";
import { withWhatAwaitingTheChef } from "../../src/board/wait-of-chef.ts";
import type { CallGitHub, AnswerGitHub } from "../../src/board/client.ts";
import { readTheBoardOfRepository, type ReadOfBoardOfRepository, type LineOfTheFile, type BoardRead } from "../../src/board/read.ts";
import {
  readOfBoard,
  UPSTREAM,
  openStandbyOfBoard,
  outputOfBoard,
  statusOfBoard,
  holdReadsOfBoard,
  type ReadOfRail,
} from "../../src/board/rail.ts";

const REPOSITORY = "acme/brigade";
const READ_BY_THE_APP = new Date("2026-10-12T10:05:00.000Z");
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
// Le projet sur GitHub, dans les labels de la cuisine : #30 prêt (prio:0), #23 pris par un cook, #17 en pass (PR #50), #35
// parqué (`parked`) ; #60, une épique, au backlog ; #24, parqué pour le chef (`parked:chef`) avec le commentaire de la cuisine
// qui dit pourquoi. `chemins` : ce qui a été demandé.
function github(paths: string[] = []): CallGitHub {
  const open = [issue(30, ["fire", "prio:0", "model:sonnet", "effort:medium"]), issue(23, ["fire", "taken"]), issue(17, ["fire", "in-pass"]), issue(35, ["fire", "parked"]), issue(60, ["epic"]), issue(24, ["fire", "parked:chef"])];
  return async (path) => {
    paths.push(path);
    if (path.includes("/issues?")) return ok(open);
    if (path.includes("/pulls?state=open")) return ok([{ number: 50, html_url: `https://github.com/${REPOSITORY}/pull/50`, created_at: "2026-10-12T09:30:00Z", head: { ref: "cook/17-github" }, body: "Closes #17" }]);
    if (path.includes("/pulls?state=closed")) return ok([]);
    if (path === `/repos/${REPOSITORY}`) return ok({ default_branch: "main" });
    if (path.includes("/issues/24/comments")) return ok([{ body: "Parked for the chef: one list per project, or one for all?", author_association: "OWNER", created_at: "2026-10-12T09:05:00Z" }]);
    return { status: 404, data: {} };
  };
}

// La lecture d'un projet, comme le process principal la fait (main.ts) : le rail, puis ce qui attend le chef.
async function readTheProject(call: CallGitHub): Promise<ReadOfBoardOfRepository> {
  return withWhatAwaitingTheChef(await readTheBoardOfRepository({ depot: REPOSITORY, appeler: call, maintenant: () => READ_BY_THE_APP }), call);
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
  luLe: READ_BY_THE_APP.toISOString(),
  cuisine: { rubriques: [{ titre: "kitchen", lignes: ["open"] }, { titre: "rail", lignes: ["1 queued"] }, { titre: "cooks", lignes: ["none running"] }] },
  lignesDuRail: [{ ticket: 30, priorite: 0, ligne: "  #30  queued  prio:0  since 2026-10-12 08:00 UTC  Ticket 30" }],
});

// Les lectures que les veilles du rail et des faits rendent, une fois chacune.
async function readByTheStandbys(call: CallGitHub) {
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

test("GitHub seul, aucune box jointe : la couche de données du rail rend le kanban des labels, et les cartes du chef", async (t) => {
  const launched = withoutProcess(t);
  const paths: string[] = [];
  const { status, facts } = await readByTheStandbys(github(paths));
  // Les deux veilles ont lu le même rail : une seule lecture de GitHub — les issues ouvertes, les PR, puis ce qui attend
  // le chef, de la même liste.
  assert.equal(paths.filter((path) => path.includes("/issues?")).length, 1);
  assert.deepEqual(paths.filter((path) => /\/(events|check-runs|contents)\b|labels=/.test(path)), [], "rien du rail d'avant n'est lu");
  assert.deepEqual([status.projet, status.demande, facts.projet, facts.demande], ["brigade", 1, "brigade", 2]);
  // L'âge du rail : l'heure de sa lecture sur GitHub.
  assert.ok(!("erreur" in facts));
  assert.equal(facts.publieLe, READ_BY_THE_APP.toISOString());

  // Ce que le process principal en fait, tel quel : `status` mis à part, puis les faits reçus.
  const heldOnes = holdFacts();
  heldOnes.attendre(putAside(status));
  const receivedOne: Drawable = heldOnes.recevoir(facts);
  assert.ok("tableau" in receivedOne, JSON.stringify(receivedOne).slice(0, 400));
  const { tableau: board } = receivedOne;

  // Les tickets, chacun dans la colonne que ses labels disent.
  assert.deepEqual(board.kitchenBoard?.columns.map(({ key, cards }) => [key, cards.map(({ ticket }) => ticket)]), [
    ["backlog", [60]],
    ["ready", [30]],
    ["cooking", [23]],
    ["pass", [17]],
    ["parked", [24, 35]],
    ["served", []],
  ]);
  // Le rail d'avant reste vide : aucune carte n'y est tirée d'une prise.
  assert.ok(board.rail.colonnes.filter(({ nom: name }) => name !== "Awaiting you").every(({ cartes: cards }) => cards.length === 0));

  // Ce qui attend le chef : TODO, la carte de #24 que la cuisine a parqué pour lui.
  const todo = board.rail.colonnes.find((c) => c.nom === "Awaiting you")?.cartes ?? [];
  assert.deepEqual(todo.map(({ ticket }) => ticket), [24]);
  assert.ok(board.rail.attendLu !== undefined, "le bloc `awaiting` a été pris");
  assert.deepEqual(todo[0]?.chef, { sorte: "parked-chef", texte: "Parked for the chef: one list per project, or one for all?" });

  assert.deepEqual(launched, [], "aucun processus n'est parti");
});

test("la sortie de `status` refaite de la lecture : ses rubriques, le bloc `awaiting` juste avant la ligne `rail`", async () => {
  const published = await readOne();
  const text = statusOfBoard(published);
  const lines = text.split("\n");
  const rankRail = lines.findIndex((l) => /^rail\s/.test(l));
  const endAwaiting = lines.indexOf("end awaiting");
  assert.ok(lines.findIndex((l) => l.startsWith("awaiting   ")) < endAwaiting && endAwaiting < rankRail);
  assert.equal(lines[rankRail], "rail       1 ready · 1 cooking · 1 in pass · 2 parked");
  // Aucune ligne par ticket : la cuisine ne les écrit pas.
  assert.equal(lines[rankRail + 1], "");
  assert.match(text, /^cooks {6}1 running$/m);
  // Ce que seule la box lit n'y est pas : les derniers événements.
  assert.doesNotMatch(text, /^latest events$/m);
  // Les rubriques d'avant `rail` restent avant le bloc, celles d'après après lui.
  const main = statusOfBoard(writtenOne([])).split("\n");
  assert.deepEqual(main, ["kitchen    open", "", "awaiting   nothing awaits the chef", "end awaiting", "", "rail       1 queued", "  #30  queued  prio:0  since 2026-10-12 08:00 UTC  Ticket 30", "", "cooks      none running", ""]);
});

test("le bloc `awaiting` de `status` : ce qui attend le chef, une ligne par entrée, datée jusqu'à la lecture, puis ce qui n'en est pas une", async () => {
  const entry = (ticket: number, since: string): LineOfTheFile => ({ nom: `#${ticket}`, ticket, titre: `Ticket ${ticket}`, quoi: "carte", depuis: since, ligne: "Which plan? — answer on its Todo card, in your own words" });
  const block = (file: LineOfTheFile[], bilans: string[] = []) => putAside({ projet: "brigade", demande: 1, a: READ_BY_THE_APP.toISOString(), sorties: [{ commande: "status", texte: statusOfBoard(writtenOne(file, bilans)) }] });
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
  assert.match(statusOfBoard(await readOne()), /^awaiting {3}1 decision awaits the chef — for 1 h 00\n {2}#24 {2}for 1 h 00 {2}Parked for the chef: one list per project, or one for all\? — on its Todo card: Answer, in your own words — the ticket goes back on the rail {2}Ticket 24\nend awaiting$/m);
});

// La cuisine n'a pas d'avant le rail (#4507) : son Backlog est une colonne du kanban.
test("ce qui est avant le rail n'est pas lu : l'amont n'est ni compté ni dit « pas lu » (#1770), et rien d'autre n'est lu", async (t) => {
  const launched = withoutProcess(t);
  const reading = readOfBoard(await readOne(), "brigade", 1, [UPSTREAM]);
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
  assert.deepEqual(reading, { projet: "brigade", demande: 2, a: READ_BY_THE_APP.toISOString(), erreur: "`manager` is not read from GitHub for acme/brigade: only the station's log carries it.", atteinte: true, cas: null, duTableau: true, pasPublie: true });
});

test("une lecture réussie : chaque sortie dans l'ordre demandé, et l'heure de la lecture de GitHub", async () => {
  const published = await readOne();
  const reading = readOfBoard(published, "brigade", 4, ["facts", "status"]);
  assert.ok(!("erreur" in reading));
  assert.deepEqual(reading.sorties.map(({ commande: command }) => command), ["facts", "status"]);
  assert.deepEqual(JSON.parse(reading.sorties[0]?.texte ?? ""), published.faits);
  assert.equal(reading.sorties[1]?.texte, statusOfBoard(published));
  assert.equal(reading.a, READ_BY_THE_APP.toISOString());
  assert.equal(reading.publieLe, READ_BY_THE_APP.toISOString());
});

test("GitHub qui ne se lit pas : un échec en une phrase, dit comme tel — ni « station injoignable », ni un rail vide ; hors ligne, il le reste", () => {
  const not: ReadOfBoardOfRepository = { lu: false, depot: REPOSITORY, luLe: READ_BY_THE_APP.toISOString(), raison: "GitHub refused to read the rail of acme/brigade (HTTP 403)." };
  const rate = readOfBoard(not, "brigade", 3, ["facts"]);
  assert.deepEqual(rate, { projet: "brigade", demande: 3, a: READ_BY_THE_APP.toISOString(), erreur: not.raison, atteinte: true, cas: null, duTableau: true });
  assert.ok("erreur" in rate);
  assert.equal(titleOfFailure(rate), "NOT READ FROM GITHUB");
  const receivedOne = holdFacts().recevoir(rate);
  assert.ok("titre" in receivedOne && "erreur" in receivedOne);
  assert.equal(receivedOne.titre, "NOT READ FROM GITHUB");
  // GitHub pas joint du tout (#1818) : l'échec le porte jusqu'à ce qui le dessine.
  const injoint: ReadOfBoardOfRepository = { ...not, raison: "GitHub could not be reached to read the rail of acme/brigade: getaddrinfo ENOTFOUND api.github.com.", horsLigne: true };
  assert.deepEqual(readOfBoard(injoint, "brigade", 3, ["facts"]), { projet: "brigade", demande: 3, a: READ_BY_THE_APP.toISOString(), erreur: injoint.raison, atteinte: true, cas: null, duTableau: true, horsLigne: true });
});

test("les lectures du rail : une seule à la fois par projet, reprise tant qu'elle est fraîche ; « read again » la refait ; la dernière réussie est gardée", async () => {
  let instant = 0;
  let calls = 0;
  const boards = holdReadsOfBoard<typeof PROJECT>({
    lire: () => {
      calls += 1;
      const call: CallGitHub = calls === 3 ? async () => ({ status: 503, data: { message: "Unavailable" } }) : github();
      return readTheBoardOfRepository({ depot: REPOSITORY, appeler: call, maintenant: () => new Date(READ_BY_THE_APP.getTime() + calls) });
    },
    fraicheurMs: 600_000, // plafonnée à 55 s
    maintenant: () => instant,
  });
  assert.equal(boards.dernier("brigade"), undefined);
  await Promise.all([boards.lire(PROJECT), boards.lire(PROJECT)]);
  assert.equal(calls, 1);
  instant = 54_999;
  await boards.lire(PROJECT);
  assert.equal(calls, 1);
  instant = 55_000;
  await boards.lire(PROJECT);
  assert.equal(calls, 2);
  const second = new Date(READ_BY_THE_APP.getTime() + 2).toISOString();
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
      return { lu: false, depot: project.nom, luLe: READ_BY_THE_APP.toISOString(), raison: "no rail." };
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
    assert.ok(!imported.some((path) => /app\/src\/(box|terminals|pty)\.ts$/.test(path)), `${module} : ${imported.join(", ")}`);
  }
  // Dans le process principal, les trois veilles qui dessinent le rail — `status`, les faits, l'amont — sont celles de
  // GitHub : aucune ne lance de processus.
  const main = readFileSync(join(ROOT, "app/src/main.ts"), "utf8");
  for (const standby of ["standby", "factsWatch", "standbyOfTheUpstream"]) {
    const declaration = new RegExp(`^const ${standby} = (\\w+)\\(\\{([\\s\\S]*?)^\\}\\);`, "m").exec(main);
    assert.equal(declaration?.[1], "openStandbyOfBoard", standby);
  }
  // Seule la carte du chef lue de GitHub se répond, sur son issue (#2434) — toute autre carte ne part pas.
  assert.match(main, /ipcMain\.handle\("repondreCarte"[\s\S]*?if \(chef === undefined\) return \{ refus: WITHOUT_DONE\.carte[\s\S]*?answerOnGithub\(/);
});
