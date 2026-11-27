// Ticket #3902 — critère 1 : chaque carte du Pass (in pass, base red) dit la station qui a cuisiné sa livraison. Lu de GitHub seul, sur un faux GitHub : le rail d'un projet, ses cartes (`facts`) et les lignes que `status` écrit.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { CallGitHub, AnswerGitHub } from "../../../src/board/client.ts";
import { readTheBoardOfRepository } from "../../../src/board/read.ts";

const REPOSITORY = "acme/kitchen";
const ok = (data: unknown): AnswerGitHub => ({ status: 200, data });
const READ = new Date("2026-11-20T12:00:00Z");
const issue = (number: number, labels: string[]) => ({ number, title: `Ticket ${number}`, html_url: `https://github.com/${REPOSITORY}/issues/${number}`, created_at: "2026-11-20T08:00:00Z", labels: labels.map((name) => ({ name })) });
const taking = (id: number, station: string, the: string) => ({ id, body: `<!-- brigade:prise station=${station} -->\nTaken by station \`${station}\`.`, author_association: "OWNER", created_at: the });
const removal = (the: string) => ({ event: "unlabeled", label: { name: "taken" }, created_at: the });
const pr = (number: number, ticket: number, body: string) => ({ number: number, state: "open", html_url: `https://github.com/${REPOSITORY}/pull/${number}`, created_at: "2026-11-20T10:00:00Z", head: { ref: `cook/${ticket}-github` }, body });
type World = { issues: unknown[]; prs?: unknown[]; commentaires?: Record<number, unknown[]>; evenements?: Record<number, unknown[]>; base?: string };
function github({ issues, prs = [], commentaires: comments = {}, evenements: events = {}, base = "success" }: World): CallGitHub {
  return async (path) => {
    if (path.includes("/issues?") && path.includes("labels=fire")) return ok(issues);
    if (path.includes("/issues?")) return ok(issues);
    if (path.includes("/pulls?state=closed")) return ok([]);
    if (path.includes("/pulls?")) return ok(prs);
    if (path === `/repos/${REPOSITORY}`) return ok({ default_branch: "main" });
    if (path.includes("/commits/main/check-runs")) return ok({ check_runs: [{ conclusion: base }] });
    const n = Number(/\/issues\/(\d+)\/(comments|events)/.exec(path)?.[1]);
    if (path.includes("/comments")) return ok(comments[n] ?? []);
    if (path.includes("/events")) return ok(events[n] ?? []);
    return { status: 404, data: {} };
  };
}
const read = async (world: World) => {
  const readOne = await readTheBoardOfRepository({ depot: REPOSITORY, appeler: github(world), maintenant: () => READ });
  assert.ok(readOne.lu, "the rail is read");
  const rail = readOne.faits.rail as { ticket: number; etat: string; station?: string }[];
  const lines = new Map(readOne.lignesDuRail.map(({ ticket, ligne: line }) => [ticket, line.replace(/^ {2}#\d+ {2}/, "")]));
  return { rail, lignes: lines };
};

for (const [base, state] of [["success", "en pass"], ["failure", "base rouge"]] as const) {
  test(`critère 1 — une carte du Pass « ${state} » montre la station de sa livraison, label taken retiré`, async () => {
    const { rail } = await read({
      base,
      issues: [issue(3891, ["fire", "in-pass"]), issue(3895, ["fire", "in-pass"])],
      prs: [pr(3892, 3891, "Delivers #3891.\n\nCooked by station `parade-box/claude`"), pr(3900, 3895, "Delivers #3895.\n\nCooked by station `macbook-air-de-benoit/claude`")],
      commentaires: { 3891: [taking(1, "parade-box/claude", "2026-11-20T09:00:00Z")], 3895: [taking(2, "macbook-air-de-benoit/claude", "2026-11-20T09:00:00Z")] },
      evenements: { 3891: [removal("2026-11-20T10:00:00Z")], 3895: [removal("2026-11-20T10:00:00Z")] },
    });
    assert.deepEqual(rail.map(({ ticket, etat: e, station }) => [ticket, e, station]), [[3891, state, "parade-box/claude"], [3895, state, "macbook-air-de-benoit/claude"]]);
  });
}

// Ticket #3902 — critère 2 : la ligne « in pass » de la file dit « cooked by <station> ». Lu de GitHub seul, sur un faux GitHub : le rail d'un projet, ses cartes (`facts`) et les lignes que `status` écrit.
// brigade:guard — moved unchanged from its own file by the closing pass #4074: it keeps guarding what main already does.
test("critère 2 — la ligne `in pass` dit « cooked by <station> » d'après la PR, label taken retiré", async () => {
  const { lignes: lines } = await read({
    issues: [issue(3893, ["fire", "in-pass"])],
    prs: [pr(3894, 3893, "Delivers #3893.\n\nCooked by station `parade-box/claude`")],
    commentaires: { 3893: [taking(1, "parade-box/claude", "2026-11-20T09:00:00Z")] },
    evenements: { 3893: [removal("2026-11-20T10:00:00Z")] },
  });
  assert.equal(lines.get(3893), "in pass  -  since 2026-11-20 10:00 UTC, cooked by parade-box/claude  Ticket 3893");
});

// Ticket #3902 — critère 3 : une livraison sans marque de station ne montre aucune puce, rien n'est deviné. Lu de GitHub seul, sur un faux GitHub : le rail d'un projet, ses cartes (`facts`) et les lignes que `status` écrit.
test("critère 3 — une PR sans marque « Cooked by station » : ni puce ni « cooked by », même si une prise a existé", async () => {
  const { rail, lignes: lines } = await read({
    issues: [issue(3891, ["fire", "in-pass"])],
    prs: [pr(3892, 3891, "Delivers #3891.")],
    commentaires: { 3891: [taking(1, "parade-box/claude", "2026-11-20T09:00:00Z")] },
    evenements: { 3891: [removal("2026-11-20T10:00:00Z")] },
  });
  assert.equal(rail[0]?.etat, "en pass");
  assert.equal(rail[0]?.station, undefined);
  assert.doesNotMatch(lines.get(3891) ?? "", /cooked by/);
});

// Ticket #3902 — critère 4 : une carte taken ne perd jamais sa station pendant qu'elle passe en pass. Lu de GitHub seul, sur un faux GitHub : le rail d'un projet, ses cartes (`facts`) et les lignes que `status` écrit.
// brigade:guard — moved unchanged from its own file by the closing pass #4074: it keeps guarding what main already does.
test("critère 4 — label `taken` encore là, mais `unlabeled taken` déjà lu : la carte garde sa station et sa ligne `taken`", async () => {
  const { rail, lignes: lines } = await read({
    issues: [issue(3895, ["fire", "taken"])],
    commentaires: { 3895: [taking(1, "macbook-air-de-benoit/claude", "2026-11-20T09:00:00Z")] },
    evenements: { 3895: [removal("2026-11-20T10:00:00Z")] },
  });
  assert.deepEqual(rail.map(({ ticket, etat: state, station }) => [ticket, state, station]), [[3895, "pris", "macbook-air-de-benoit/claude"]]);
  assert.equal(lines.get(3895), "taken  -  by macbook-air-de-benoit/claude since 2026-11-20 09:00 UTC  Ticket 3895");
});
