// Le récapitulatif et le rail lisent les mêmes faits de GitHub (#3581) : sur un même faux GitHub — le Todo du chef du
// 2026-11-05 (#2422 : onze `served-elsewhere` techniques, deux livraisons à merger à la main), et des PR servies —, ce que le
// récapitulatif dit servi est ce que la colonne Served du kanban montre depuis le marqueur (#4507), avec la même PR ; ce
// qu'il dit en attente dans TODO est ce que TODO montre, et ce que la file du chef (`lireCeQuiAttendLeChef`) relaie au second.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { understand, board as boardOf, type Facts, type Board } from "../../src/facts.ts";
import { withWhatAwaitingTheChef, readWhatAwaitingTheChef } from "../../src/board/wait-of-chef.ts";
import { readTheBoardOfRepository } from "../../src/board/read.ts";
import { statusOfBoard } from "../../src/board/rail.ts";
import { readTheRecap } from "../../src/vue/recap/recap-box.ts";
import { whatAwaitingInTodo } from "../../src/vue/recap/recap.js";
import { callOfTheApp, boxOf, closedOne, issue, stationOfRecap, type World } from "./world.ts";

const REPOSITORY = "acme/kitchen";
// Le marqueur, dans le répertoire d'état du projet (runtime/src/recap/marqueur.ts).
const FILE_OF_RECAP = "recap.json";
const READ = "2026-11-05T12:00:00.000Z";
const SEEN_UNTIL = "2026-11-05T00:00:00.000Z";

const sendBack = (reason: string) => ({ id: 1, body: `<!-- brigade:renvoi n=3 sha=7579211 -->\nStation \`box/claude\`: still not mergeable after 2 sends back — ${reason}\n\nTaken off the kitchen (\`served-elsewhere\`): a human decides.`, author_association: "OWNER", created_at: "2026-11-05T01:00:00Z" });
const withoutDelivery = () => ({ id: 2, body: "<!-- brigade:echec n=3 -->\nStation `box/claude`: the cook stopped without a delivery — the cook committed nothing\n\nTaken off the kitchen (`served-elsewhere`) after 3 cooks without a delivery: a human decides.", author_association: "OWNER", created_at: "2026-11-05T01:00:00Z" });
// Une livraison à merger à la main, que la cuisine parque pour le chef (`parked:chef`, #4474) : son commentaire dit pourquoi.
const judge = (ticket: number) => ({ id: 3, body: `Parked for the chef: merge the PR of #${ticket} by hand? It changes what judges it.`, author_association: "OWNER", created_at: "2026-11-05T01:00:00Z" });
const CONFLICT = "the PR conflicts with the base: merge the base into the branch, resolve the conflicts, run the gates, and commit";
const TECHNICAL: Record<number, Record<string, unknown>> = { 2301: sendBack(CONFLICT), 2302: sendBack("the CI is red on `7579211` (PR #2400):"), 2304: withoutDelivery(), 2305: sendBack(CONFLICT) };

const WORLD: World = {
  issues: [
    ...Object.keys(TECHNICAL).map((n) => issue(REPOSITORY, Number(n), ["fire", "served-elsewhere"])),
    issue(REPOSITORY, 2408, ["in-pass", "parked:chef"]),
    issue(REPOSITORY, 2322, ["in-pass", "parked:chef"]),
    issue(REPOSITORY, 1683, ["fire", "served-elsewhere", "kitchen-board"]),
  ],
  commentaires: { ...Object.fromEntries(Object.entries(TECHNICAL).map(([n, c]) => [Number(n), [c]])), 2408: [judge(2408)], 2322: [judge(2322)] },
  fermees: [
    closedOne(REPOSITORY, 2470, 2471, "2026-11-05T11:00:00Z"),
    closedOne(REPOSITORY, 2469, 2475, "2026-11-05T09:30:00Z"),
    // Mergée avant le marqueur : dans Served (24 h), déjà vue — pas dans le récapitulatif.
    closedOne(REPOSITORY, 2461, 2462, "2026-11-04T18:54:06Z"),
    // Fermée sans merge : servie nulle part.
    closedOne(REPOSITORY, 2458, 2459, null),
  ],
};

// Le rail et TODO tels que l'app les lit (main.ts, `lireLeTableau`) puis les dessine.
async function railAndTodo(): Promise<Board> {
  const call = callOfTheApp(REPOSITORY, () => WORLD);
  const readOne = await withWhatAwaitingTheChef(await readTheBoardOfRepository({ depot: REPOSITORY, appeler: call, maintenant: () => new Date(READ) }), call);
  assert.ok(readOne.lu, "the rail is read");
  const facts = understand(JSON.stringify(readOne.faits));
  assert.ok(!("informe" in facts));
  return boardOf(facts as Facts, undefined, { texte: statusOfBoard(readOne), a: readOne.luLe });
}

async function recap(t: TestContext) {
  const station = stationOfRecap(t, { kitchen: { depot: REPOSITORY, monde: () => WORLD } }, () => READ);
  writeFileSync(join(station.etats.kitchen ?? "", FILE_OF_RECAP), JSON.stringify({ seenUntil: SEEN_UNTIL }));
  const readEntry = await readTheRecap("kitchen", boxOf("kitchen"), REPOSITORY, station.lancer);
  assert.ok("recap" in readEntry, JSON.stringify(readEntry));
  return readEntry.recap;
}

describe("the recap reads the facts the rail and TODO read (#3581)", () => {
  test("served: the tickets of the Served column merged since the marker, each with the same pull request", async (t: TestContext) => {
    const [seenOne, readOne] = await Promise.all([railAndTodo(), recap(t)]);
    const served = seenOne.kitchenBoard?.columns.find(({ key }) => key === "served")?.cards ?? [];
    assert.deepEqual(served.map(({ ticket, pr }) => ({ ticket, prUrl: pr?.url })), [
      { ticket: 2470, prUrl: `https://github.com/${REPOSITORY}/pull/2471` },
      { ticket: 2469, prUrl: `https://github.com/${REPOSITORY}/pull/2475` },
      { ticket: 2461, prUrl: `https://github.com/${REPOSITORY}/pull/2462` },
    ]);
    assert.deepEqual(readOne.served.map(({ ticket, prUrl }) => ({ ticket, prUrl })), [
      { ticket: 2470, prUrl: `https://github.com/${REPOSITORY}/pull/2471` },
      { ticket: 2469, prUrl: `https://github.com/${REPOSITORY}/pull/2475` },
    ]);
    assert.deepEqual(readOne.served.map(({ ticket }) => ticket), served.map(({ ticket }) => ticket).filter((ticket) => ticket !== 2461));
  });

  test("TODO: what the recap lists as waiting is what TODO shows, and what the chef's queue relays", async (t: TestContext) => {
    const seenOne = await railAndTodo();
    const todo = seenOne.rail.colonnes.find(({ nom: name }) => name === "Awaiting you")?.cartes ?? [];
    assert.deepEqual(todo.map(({ ticket }) => ticket), [2322, 2408]);
    const expected = whatAwaitingInTodo(seenOne.rail.colonnes);
    assert.deepEqual(expected, [
      { ticket: 2322, texte: "Parked for the chef: merge the PR of #2322 by hand? It changes what judges it." },
      { ticket: 2408, texte: "Parked for the chef: merge the PR of #2408 by hand? It changes what judges it." },
    ]);
    const file = await readWhatAwaitingTheChef({ depot: REPOSITORY, appeler: callOfTheApp(REPOSITORY, () => WORLD), maintenant: () => new Date(READ) });
    assert.ok(file.lue);
    assert.deepEqual(file.attentes.map(({ ticket }) => ticket).sort(), (expected ?? []).map(({ ticket }) => ticket).sort());
    // Le récapitulatif du runtime ne redit pas TODO : il ne porte que ce qui s'est passé.
    assert.deepEqual(Object.keys(await recap(t)).sort(), ["repository", "sentBack", "served", "since", "stops", "until"]);
  });

  test("the set-aside tickets the pass refused since the marker are in the recap with their reason; a cook without delivery is not a refusal", async (t: TestContext) => {
    const readOne = await recap(t);
    assert.deepEqual(
      readOne.sentBack.map(({ ticket, kind, reason }) => [ticket, kind, reason]).sort(),
      [
        [2301, "refused", CONFLICT],
        [2302, "refused", "the CI is red on `7579211` (PR #2400)"],
        [2305, "refused", CONFLICT],
      ],
    );
  });

  test("TODO not read yet: the recap says it is being read, never that nothing waits", () => {
    assert.equal(whatAwaitingInTodo(undefined), undefined);
    assert.equal(whatAwaitingInTodo([{ nom: "Awaiting you", ton: "rouge", compte: "?", cartes: [], vide: "" }]), undefined);
  });
});
