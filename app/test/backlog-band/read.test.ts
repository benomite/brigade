// Ce que le bandeau Backlog lit de GitHub (#3460, board/read.ts) : chaque besoin hors du rail, et pour un besoin
// découpé, ses tickets — la liste que le runtime écrit dans son corps, et les issues ouvertes qui se réclament de lui —,
// ceux d'entre eux qui sont fermés, son contexte ; les tickets d'un découpage ne sont pas des besoins ; une épique
// découpée fermée depuis moins de 24 h, tous ses tickets servis, est encore lue. Une lecture des fermées qui rate n'en
// montre aucune et laisse le reste se lire. Puis ce que upstream.ts en garde, champ pour champ. Rien ne passe par le
// réseau : GitHub est une doublure, qui répond selon le chemin demandé.
import assert from "node:assert/strict";
import { test } from "node:test";
import { understand, COMMAND, see } from "../../src/upstream.ts";
import type { CallGitHub } from "../../src/board/client.ts";
import { contextOf, readTheBoardOfRepository, type BoardRead } from "../../src/board/read.ts";
import { readOfBoard } from "../../src/board/rail.ts";

const REPOSITORY = "chef/parade";
const READ_THE = new Date("2026-11-13T12:00:00.000Z");
const LIST = (tickets: number[]) => ["<!-- brigade:tickets -->", "| # | Title |", "|---|---|", ...tickets.map((t) => `| #${t} | Ticket ${t} |`), "<!-- /brigade:tickets -->"].join("\n");

type Raw = { number: number; title: string; labels: { name: string }[]; created_at: string; html_url: string; body?: string; state?: string; closed_at?: string };
const issue = (number: number, labels: string[], body = "", others: Partial<Raw> = {}): Raw => ({
  number,
  title: `Issue ${number}`,
  labels: labels.map((name) => ({ name })),
  created_at: "2026-11-01T00:00:00Z",
  html_url: `https://github.com/${REPOSITORY}/issues/${number}`,
  body,
  ...others,
});

// #7, une épique découpée en #20, #21, #22 (fermé) et #23 (fermé) — #20 au feu, #21 sans `fire` ; #24 se réclame de #7 sans
// être dans sa liste. #8, une épique pas découpée, avec son contexte. #9, une issue non lue.
const OPEN = [
  issue(7, ["epic", "prio:1"], `## Context\n\nGroups book in one gesture.\n\n${LIST([20, 21, 22, 23])}`),
  issue(8, ["epic", "prio:2"], "Epic: #99\n\n## Context\nThe evening menu changes every night.\n\n## Acceptance criteria\n- a"),
  issue(9, []),
  issue(20, ["fire", "model:sonnet", "effort:low"], "Epic: #7\n\n<!-- brigade:decoupage #7.1 -->\n\n## Context\n\nOne ticket."),
  issue(21, ["model:sonnet", "effort:low"], "Epic: #7"),
  issue(24, [], "Epic: #7\n\nAdded by hand."),
];
// Les fermées depuis 24 h : #40, une épique découpée fermée il y a 23 h 59 — ses tickets #41 et #42 fermés ; #43, fermée
// il y a 2 h, dont le ticket #9 est encore ouvert ; #44, une issue fermée sans liste ; #45, fermée il y a 25 h.
const CLOSED = [
  issue(40, ["epic", "prio:2"], LIST([41, 42]), { state: "closed", closed_at: "2026-11-12T12:01:00Z" }),
  issue(43, ["epic"], LIST([9]), { state: "closed", closed_at: "2026-11-13T10:00:00Z" }),
  issue(44, [], "", { state: "closed", closed_at: "2026-11-13T10:00:00Z" }),
  issue(45, ["epic"], LIST([46]), { state: "closed", closed_at: "2026-11-12T11:00:00Z" }),
];

function github(closedEntries: () => { status: number; data: unknown } = () => ({ status: 200, data: CLOSED })): { appeler: CallGitHub; chemins: string[] } {
  const paths: string[] = [];
  return {
    chemins: paths,
    appeler: async (path) => {
      paths.push(path);
      if (path.includes("/issues?") && path.includes("labels=fire")) return { status: 200, data: OPEN.filter(({ labels }) => labels.some(({ name }) => name === "fire")) };
      if (path.includes("/issues?state=closed")) return closedEntries();
      if (path.includes("/issues?")) return { status: 200, data: OPEN };
      if (path.includes("/pulls?")) return { status: 200, data: [] };
      if (/\/issues\/\d+\/(comments|events)/.test(path)) return { status: 200, data: [] };
      return { status: 404, data: {} };
    },
  };
}

async function read(call: CallGitHub): Promise<BoardRead> {
  const readOne = await readTheBoardOfRepository({ depot: REPOSITORY, appeler: call, maintenant: () => READ_THE });
  assert.ok(readOne.lu, readOne.lu ? "" : readOne.raison);
  return readOne;
}

test("un besoin découpé : ses tickets — sa liste et ceux qui se réclament de lui —, les fermés comptés servis ; ses tickets ne sont pas des besoins", async () => {
  const { appeler: call, chemins: paths } = github();
  const readOne = await read(call);
  const issues = readOne.avantLeRail?.issues ?? assert.fail("rien avant le rail");
  assert.deepEqual(issues.map(({ ticket, etat: state }) => [ticket, state]), [
    [7, "decoupee"],
    [8, "epique"],
    [40, "servie"],
    [9, "non-lue"],
  ]);
  const seven = issues.find(({ ticket }) => ticket === 7) ?? assert.fail("pas de #7");
  assert.deepEqual(seven.tickets, [20, 21, 22, 23, 24]);
  assert.deepEqual(seven.servis, [22, 23]);
  assert.equal(seven.dit, "split into 5 tickets, 2 served");
  assert.equal(seven.contexte, "Groups book in one gesture.");
  // Pas découpé : ni tickets ni servis ; son contexte, sous son titre.
  const eight = issues.find(({ ticket }) => ticket === 8) ?? assert.fail("pas de #8");
  assert.equal(eight.tickets, undefined);
  assert.equal(eight.contexte, "The evening menu changes every night.");
  // La lecture des fermées : depuis 24 h, une page.
  assert.ok(paths.includes(`/repos/${REPOSITORY}/issues?state=closed&sort=updated&direction=desc&since=2026-11-12T12:00:00.000Z&per_page=100`), paths.join("\n"));
});

test("une épique découpée fermée depuis moins de 24 h, tous ses tickets servis, est lue avec l'heure de sa fermeture ; ni une autre fermée, ni une plus vieille", async () => {
  const readOne = await read(github().appeler);
  const forty = readOne.avantLeRail?.issues.find(({ ticket }) => ticket === 40) ?? assert.fail("pas de #40");
  assert.deepEqual(forty, { ticket: 40, titre: "Issue 40", priorite: 2, etat: "servie", dit: "split, all 2 tickets served", tickets: [41, 42], servis: [41, 42], servieLe: "2026-11-12T12:01:00Z" });
  assert.deepEqual(readOne.avantLeRail?.issues.filter(({ ticket }) => [43, 44, 45].includes(ticket)), []);
});

test("une épique ouverte dont tous les tickets sont servis : marquée servie, sans heure — elle reste jusqu'à sa fermeture", async () => {
  const allEntries = [issue(7, ["epic"], LIST([22, 23]))];
  const readOne = await read(async (path) => (path.includes("/issues?state=closed") ? { status: 200, data: [] } : path.includes("/issues?") && !path.includes("labels=fire") ? { status: 200, data: allEntries } : github().appeler(path)));
  assert.deepEqual(readOne.avantLeRail?.issues.map(({ ticket, etat: state, servieLe: servedThe }) => [ticket, state, servedThe]), [[7, "servie", undefined]]);
});

test("la lecture des fermées rate : aucune n'est montrée, et les besoins ouverts se lisent", async () => {
  for (const closedEntries of [() => ({ status: 403, data: { message: "Forbidden" } }), () => ({ status: 200, data: { message: "odd" } })]) {
    const readOne = await read(github(closedEntries).appeler);
    assert.deepEqual(readOne.avantLeRail?.issues.map(({ ticket }) => ticket), [7, 8, 9]);
  }
  const rate = await read(async (path) => {
    if (path.includes("/issues?state=closed")) throw new Error("socket hang up");
    return github().appeler(path);
  });
  assert.deepEqual(rate.avantLeRail?.issues.map(({ ticket }) => ticket), [7, 8, 9]);
});

test("ce que upstream.ts garde d'un besoin : ses tickets, ses servis, son contexte, sa fermeture — un champ qui n'a pas sa forme refuse tout", async () => {
  const readOne = await read(github().appeler);
  const seenOne = see(readOfBoard(readOne, "parade", 3, [COMMAND]));
  assert.ok("groupes" in seenOne, JSON.stringify(seenOne));
  const all = seenOne.groupes.flatMap(({ issues }) => issues);
  const seven = all.find(({ ticket }) => ticket === 7) ?? assert.fail("pas de #7");
  assert.deepEqual([seven.priorite, seven.tickets, seven.servis, seven.contexte], [1, [20, 21, 22, 23, 24], [22, 23], "Groups book in one gesture."]);
  assert.equal(all.find(({ ticket }) => ticket === 40)?.servieLe, "2026-11-12T12:01:00Z");
  assert.deepEqual(seenOne.groupes.map(({ etat: state, nom: name }) => [state, name]), [["non-lue", "not read yet"], ["epique", "epic, not split yet"], ["decoupee", "split into tickets"], ["servie", "served"]]);

  const one = { ticket: 3, titre: "t", url: "https://github.com/x/y/issues/3", priorite: 2, etat: "decoupee", dit: "d" };
  assert.deepEqual(understand(JSON.stringify({ lu: "x", depot: REPOSITORY, issues: [{ ...one, tickets: [4], servis: [], contexte: "c", servieLe: "s" }] })), { lu: "x", depot: REPOSITORY, issues: [{ ...one, tickets: [4], servis: [], contexte: "c", servieLe: "s" }] });
  assert.deepEqual(understand(JSON.stringify({ lu: "x", depot: REPOSITORY, issues: [{ ...one, tickets: ["4"] }] })), { informe: "“issues[0].tickets[0]” is not a non-negative integer" });
  assert.deepEqual(understand(JSON.stringify({ lu: "x", depot: REPOSITORY, issues: [{ ...one, servis: 4 }] })), { informe: "“issues[0].servis” is not a list" });
  assert.deepEqual(understand(JSON.stringify({ lu: "x", depot: REPOSITORY, issues: [{ ...one, contexte: 1 }] })), { informe: "“issues[0].contexte” is not a string" });
});

test("le contexte d'un besoin : le paragraphe sous `Context`, sinon le premier du corps — jamais un titre, une ligne `Epic:`, un commentaire, la liste ou du code", () => {
  assert.equal(contextOf("## Context\n\nWhy it matters.\n\n## Done when\n\n- x"), "Why it matters.");
  assert.equal(contextOf("## Context\nOn the next line.\n\nOther."), "On the next line.");
  assert.equal(contextOf("Epic: #3\n\n<!-- brigade:decoupage #3.1 -->\n\n# Title\n\n```sh\nnpm test\n```\n\nThe first   real\nparagraph."), "The first real paragraph.");
  assert.equal(contextOf(`${LIST([1, 2])}\n\nAfter the list.`), "After the list.");
  assert.equal(contextOf(""), undefined);
  assert.equal(contextOf("## Context\n\n## Next"), undefined);
  const long = contextOf(`${"word ".repeat(100)}end`) ?? assert.fail("pas de contexte");
  assert.ok(long.length <= 401 && long.endsWith("word…"), long);
});

test("les fermées ne se relisent que quand les ouvertes changent de numéros — une épique ou un ticket qui se ferme quitte la liste ; un échec ne se garde pas", async () => {
  const memory = new Map();
  let openEntries = OPEN;
  let closedRead = 0;
  let rate = false;
  const call: CallGitHub = async (path) => {
    if (path.includes("/issues?state=closed")) {
      closedRead++;
      return rate ? { status: 500, data: {} } : { status: 200, data: CLOSED };
    }
    if (path.includes("/issues?") && !path.includes("labels=fire")) return { status: 200, data: openEntries };
    return github().appeler(path);
  };
  const read = () => readTheBoardOfRepository({ depot: REPOSITORY, appeler: call, memoire: memory, maintenant: () => READ_THE });
  const first = await read();
  assert.ok(first.lu);
  assert.equal(closedRead, 1);
  // Les mêmes numéros ouverts — un label a changé : les fermées gardées, et #40 toujours là.
  openEntries = OPEN.map((issue) => (issue.number === 9 ? { ...issue, labels: [{ name: "prio:3" }] } : issue));
  const second = await read();
  assert.equal(closedRead, 1);
  assert.ok(second.lu && second.avantLeRail?.issues.some(({ ticket }) => ticket === 40));
  // #9 se ferme : la liste change, les fermées se relisent — et l'échec ne se garde pas : la lecture suivante réessaie.
  openEntries = OPEN.filter(({ number }) => number !== 9);
  rate = true;
  const third = await read();
  assert.equal(closedRead, 2);
  assert.ok(third.lu && !third.avantLeRail?.issues.some(({ ticket }) => ticket === 40));
  rate = false;
  const fourth = await read();
  assert.equal(closedRead, 3);
  assert.ok(fourth.lu && fourth.avantLeRail?.issues.some(({ ticket }) => ticket === 40));
});

// Le Backlog du chef (#3589) : une idée en réserve a son propre état ; la roadmap n'est jamais une ligne.
const withOpen = (openEntries: Raw[], content?: () => Promise<{ status: number; data: unknown }>): CallGitHub => async (path) => {
  if (path === `/repos/${REPOSITORY}/contents/CLAUDE.md` && content !== undefined) return content();
  if (path.includes("/issues?state=closed")) return { status: 200, data: [] };
  if (path.includes("/issues?") && !path.includes("labels=fire")) return { status: 200, data: openEntries };
  return github().appeler(path);
};
const claudeMd = (text: string) => async () => ({ status: 200, data: { content: Buffer.from(text).toString("base64") } });

test("une issue au label `idea` est une idée en réserve, quels que soient ses autres labels ; une liste dans son corps ne la découpe pas", async () => {
  const readOne = await read(withOpen([issue(30, ["idea", "model:opus", "effort:low", "epic"], "## Context\n\nA loyalty card."), issue(31, ["idea"], LIST([9])), issue(9, [])]));
  assert.deepEqual(readOne.avantLeRail?.issues.map(({ ticket, etat: state, tickets }) => [ticket, state, tickets]), [
    [9, "non-lue", undefined],
    [30, "idee", undefined],
    [31, "idee", undefined],
  ]);
  assert.equal(readOne.avantLeRail?.issues.find(({ ticket }) => ticket === 30)?.contexte, "A loyalty card.");
  const seenOne = see(readOfBoard(readOne, "parade", 3, [COMMAND]));
  assert.ok("groupes" in seenOne, JSON.stringify(seenOne));
  assert.deepEqual(seenOne.groupes.map(({ etat: state, nom: name }) => [state, name]), [["non-lue", "not read yet"], ["idee", "ideas in reserve"]]);
});

test("la roadmap n'est pas un besoin : l'issue au label `roadmap`, ou celle que la ligne « Roadmap » du CLAUDE.md nomme — ce qu'elle liste reste chacun son besoin", async () => {
  const openEntries = [issue(1, [], LIST([9])), issue(2, ["roadmap"], LIST([21])), issue(9, []), issue(21, ["model:sonnet", "effort:low"])];
  const readOne = await read(withOpen(openEntries, claudeMd("## Équipe\n\n- **Roadmap** : issue #1 (writer unique = Manager)\n")));
  assert.deepEqual(readOne.avantLeRail?.issues.map(({ ticket, etat: state }) => [ticket, state]), [
    [9, "non-lue"],
    [21, "prete"],
  ]);
});

test("un CLAUDE.md sans ligne « Roadmap », absent ou illisible ne nomme aucune roadmap : rien n'est écarté sur une supposition — le label `roadmap` écarte toujours —, et le reste se lit", async () => {
  const openEntries = [issue(1, [], LIST([9])), issue(2, ["roadmap"]), issue(9, [])];
  for (const content of [claudeMd("- **Doc vivante** : `docs/` — see issue #1"), async () => ({ status: 404, data: { message: "Not Found" } }), async () => ({ status: 200, data: { content: 7 } }), async () => Promise.reject(new Error("socket hang up"))]) {
    let request = false;
    const readOne = await read(withOpen(openEntries, async () => {
      request = true;
      return content();
    }));
    assert.ok(request, "le CLAUDE.md est demandé à GitHub");
    assert.deepEqual(readOne.avantLeRail?.issues.map(({ ticket, etat: state }) => [ticket, state]), [[1, "decoupee"]]);
  }
});
