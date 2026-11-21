// Ticket #3902 — critère 3 : une livraison sans marque de station ne montre aucune puce, rien n'est deviné. Lu de GitHub seul, sur un faux GitHub : le rail d'un projet, ses cartes (`facts`) et les lignes que `status` écrit.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { AppelGitHub, ReponseGitHub } from "../../../src/tableau/client.ts";
import { lireLeTableauDuDepot } from "../../../src/tableau/lecture.ts";

const DEPOT = "acme/kitchen";
const ok = (data: unknown): ReponseGitHub => ({ status: 200, data });
const LU = new Date("2026-11-20T12:00:00Z");
const issue = (number: number, labels: string[]) => ({ number, title: `Ticket ${number}`, html_url: `https://github.com/${DEPOT}/issues/${number}`, created_at: "2026-11-20T08:00:00Z", labels: labels.map((name) => ({ name })) });
const prise = (id: number, station: string, le: string) => ({ id, body: `<!-- brigade:prise station=${station} -->\nTaken by station \`${station}\`.`, author_association: "OWNER", created_at: le });
const retrait = (le: string) => ({ event: "unlabeled", label: { name: "taken" }, created_at: le });
const pr = (numero: number, ticket: number, body: string) => ({ number: numero, state: "open", html_url: `https://github.com/${DEPOT}/pull/${numero}`, created_at: "2026-11-20T10:00:00Z", head: { ref: `cook/${ticket}-github` }, body });
type Monde = { issues: unknown[]; prs?: unknown[]; commentaires?: Record<number, unknown[]>; evenements?: Record<number, unknown[]>; base?: string };
function github({ issues, prs = [], commentaires = {}, evenements = {}, base = "success" }: Monde): AppelGitHub {
  return async (chemin) => {
    if (chemin.includes("/issues?") && chemin.includes("labels=fire")) return ok(issues);
    if (chemin.includes("/issues?")) return ok(issues);
    if (chemin.includes("/pulls?state=closed")) return ok([]);
    if (chemin.includes("/pulls?")) return ok(prs);
    if (chemin === `/repos/${DEPOT}`) return ok({ default_branch: "main" });
    if (chemin.includes("/commits/main/check-runs")) return ok({ check_runs: [{ conclusion: base }] });
    const n = Number(/\/issues\/(\d+)\/(comments|events)/.exec(chemin)?.[1]);
    if (chemin.includes("/comments")) return ok(commentaires[n] ?? []);
    if (chemin.includes("/events")) return ok(evenements[n] ?? []);
    return { status: 404, data: {} };
  };
}
const lire = async (monde: Monde) => {
  const lu = await lireLeTableauDuDepot({ depot: DEPOT, appeler: github(monde), maintenant: () => LU });
  assert.ok(lu.lu, "the rail is read");
  const rail = lu.faits.rail as { ticket: number; etat: string; station?: string }[];
  const lignes = new Map(lu.lignesDuRail.map(({ ticket, ligne }) => [ticket, ligne.replace(/^ {2}#\d+ {2}/, "")]));
  return { rail, lignes };
};

// brigade:guard
test("critère 3 — une PR sans marque « Cooked by station » : ni puce ni « cooked by », même si une prise a existé", async () => {
  const { rail, lignes } = await lire({
    issues: [issue(3891, ["fire", "in-pass"])],
    prs: [pr(3892, 3891, "Delivers #3891.")],
    commentaires: { 3891: [prise(1, "parade-box/claude", "2026-11-20T09:00:00Z")] },
    evenements: { 3891: [retrait("2026-11-20T10:00:00Z")] },
  });
  assert.equal(rail[0]?.etat, "en pass");
  assert.equal(rail[0]?.station, undefined);
  assert.doesNotMatch(lignes.get(3891) ?? "", /cooked by/);
});
