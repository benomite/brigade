// #3925, critère 1 : une livraison mergée à l'instant apparaît dans Served sans rechargement, quelques secondes après le merge.
// Test d'acceptation gelé. La lecture est celle de l'app (tenirLecturesDuTableau, à sa fraîcheur de production), sur un faux GitHub.
import assert from "node:assert/strict";
import { test } from "node:test";
import { understand, board as boardOf, type Facts, type Board } from "../../../src/facts.ts";
import type { CallGitHub, AnswerGitHub } from "../../../src/board/client.ts";
import { readTheBoardOfRepository, type ReadOfBoardOfRepository } from "../../../src/board/read.ts";
import { statusOfBoard, holdReadsOfBoard } from "../../../src/board/rail.ts";

const REPOSITORY = "acme/kitchen";
const T0 = Date.parse("2026-11-20T10:00:00Z");
const ok = (data: unknown): AnswerGitHub => ({ status: 200, data });
const closedOne = (n: number, mergeThe: string) => ({
  number: 1000 + n, title: `#${n} — Ticket ${n}`, html_url: `https://github.com/${REPOSITORY}/pull/${1000 + n}`, created_at: "2026-11-20T09:00:00Z",
  updated_at: mergeThe, merged_at: mergeThe, head: { ref: `cook/${n}-github` }, body: `Closes #${n}\n\nCooked by station \`box/claude\`.`,
});
// Un faux GitHub dont la liste des PR fermées est lue à chaque appel : `fermees()` dit ce qui est mergé à cet instant.
const github = (closedEntries: () => unknown[]): CallGitHub => async (path) => {
  if (path.includes("/pulls?state=closed")) return ok(closedEntries());
  if (path.includes("/pulls?")) return ok([]);
  if (path.includes("/issues?")) return ok([]);
  if (path === `/repos/${REPOSITORY}`) return ok({ default_branch: "main" });
  if (path.includes("/check-runs")) return ok({ check_runs: [{ conclusion: "success" }] });
  if (/\/issues\/\d+\/(comments|events)/.test(path)) return ok([]);
  return { status: 404, data: {} };
};
function draws(readOne: ReadOfBoardOfRepository): Board {
  assert.ok(readOne.lu, "the rail is read");
  const facts = understand(JSON.stringify(readOne.faits));
  assert.ok(!("informe" in facts), "facts are in shape");
  return boardOf(facts as Facts, undefined, { texte: statusOfBoard(readOne), a: readOne.luLe });
}
// La colonne Served du kanban (board/kitchen-board.ts, #4507) : ce qui a été mergé dans la journée.
const servedOnes = (seenOne: Board) => seenOne.kitchenBoard?.columns.find(({ key }) => key === "served")?.cards ?? [];
const readA = (call: CallGitHub, now: number) => readTheBoardOfRepository({ depot: REPOSITORY, appeler: call, maintenant: () => new Date(now) });

const FRESHNESS_OF_THE_APP_MS = 60_000;

test("a delivery merged a moment ago is in Served at the next reading, a few seconds after its merge", async () => {
  let now = T0;
  let mergee = false;
  const call = github(() => (mergee ? [closedOne(7, new Date(T0 + 2_000).toISOString())] : []));
  const readings = holdReadsOfBoard<{ nom: string }>({ lire: () => readA(call, now), fraicheurMs: FRESHNESS_OF_THE_APP_MS, maintenant: () => now });
  assert.deepEqual(servedOnes(draws(await readings.lire({ nom: "parade" }))), [], "nothing served yet");
  mergee = true;
  now = T0 + 5_000;
  const after = servedOnes(draws(await readings.lire({ nom: "parade" })));
  assert.deepEqual(after.map(({ ticket }) => ticket), [7], "the merged delivery is in Served 3 s after its merge");
});

// #3925, critère 3 : les chiffres de la colonne Served restent, avec leurs valeurs — comme avant.
// Test d'acceptation gelé : il passe déjà sur la base, et c'est voulu.
test("the figures of the Served column stay and keep their values", async () => {
  const call = github(() => [closedOne(7, new Date(T0 - 2 * 60_000).toISOString()), closedOne(8, new Date(T0 - 30 * 60_000).toISOString())]);
  const readOne = await readA(call, T0);
  const seenOne = draws(readOne);
  assert.equal(servedOnes(seenOne).length, 2);
  assert.equal(seenOne.compteurs.find(({ libelle: wording }) => wording === "served 24 h")?.nombre, 2);
  assert.equal(readOne.faits.compteurs.livres24h, 2);
});
