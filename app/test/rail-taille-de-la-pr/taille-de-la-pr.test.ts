// #4051 : le rail lu de GitHub porte, pour la PR d'un ticket, ses lignes ajoutées et retirées et l'heure de son ouverture —
// et rien de tout cela quand la PR seule ne se lit pas (jamais un zéro inventé).
import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnswerGitHub } from "../../src/tableau/client.ts";
import { avecLeRail, lireLeRailSurGithub } from "../../src/vue/rail/github.ts";

const REPOSITORY = "chef/parade";
const A = "2026-11-24T12:00:00.000Z";
const ok = (data: unknown): AnswerGitHub => ({ status: 200, data });
const issue = (number: number) => ({ number, title: `Ticket ${number}`, html_url: `https://github.com/${REPOSITORY}/issues/${number}`, created_at: "2026-11-03T21:00:00Z", labels: [{ name: "fire" }, { name: "in-pass" }] });
const pr = (number: number, ticket: number) => ({ number, html_url: `https://github.com/${REPOSITORY}/pull/${number}`, created_at: "2026-11-24T11:15:00Z", head: { ref: `cook/${ticket}-github` }, body: "" });

async function railDe(pulls: (chemin: string) => Promise<AnswerGitHub>) {
  const appeler = async (chemin: string): Promise<AnswerGitHub> => {
    if (chemin.includes("/issues?")) return ok([issue(30), issue(31)]);
    if (chemin.includes("/pulls?")) return ok([pr(41, 30), pr(42, 31)]);
    if (chemin.includes("/pulls/")) return pulls(chemin);
    return ok([]);
  };
  const rail = await lireLeRailSurGithub({ depot: REPOSITORY, appeler, maintenant: () => new Date(A) });
  return (avecLeRail({ lu: true, depot: REPOSITORY, luLe: A, cuisine: { rubriques: [] }, faits: { rail: [] }, file: [], bilans: [], lignesDuRail: [], activites: [] }, rail).faits.rail as { ticket: number; pr?: Record<string, unknown> }[]).map(({ ticket, pr }) => [ticket, pr] as const);
}

test("la PR d'un ticket du rail dit ses lignes ajoutées et retirées, et son ouverture", async () => {
  const rail = await railDe(async (chemin) => ok({ additions: chemin.endsWith("/41") ? 135 : 8, deletions: chemin.endsWith("/41") ? 21 : 0 }));
  assert.deepEqual(rail[0]?.[1], { numero: 41, url: `https://github.com/${REPOSITORY}/pull/41`, additions: 135, deletions: 21, ouvertLe: "2026-11-24T11:15:00Z" });
  assert.equal(rail[1]?.[1]?.deletions, 0, "zéro retrait lu : dit tel quel");
});

test("une PR qui ne se lit pas, sans taille ou dont un côté seul se lit n'en dit aucune, et le rail se lit quand même", async () => {
  const sansTaille = [
    async (chemin: string): Promise<AnswerGitHub> => (chemin.endsWith("/41") ? { status: 500, data: {} } : ok({ title: "sans taille" })),
    async () => ok({ additions: 135 }),
    async () => ok({ deletions: 21 }),
  ];
  for (const pulls of sansTaille) {
    const rail = await railDe(pulls);
    assert.equal(rail.length, 2);
    for (const [, laPR] of rail) {
      assert.ok(laPR !== undefined && !("additions" in laPR) && !("deletions" in laPR), "ni additions ni deletions inventées");
      assert.equal(laPR.ouvertLe, "2026-11-24T11:15:00Z", "son ouverture, elle, se dit");
    }
  }
});

test("la PR d'un ticket servi dit sa taille et son ouverture dans `livres`", async () => {
  const mergee = { number: 51, html_url: `https://github.com/${REPOSITORY}/pull/51`, title: "#32 — Servi", merged_at: "2026-11-24T11:00:00Z", updated_at: "2026-11-24T11:00:00Z", head: { ref: "cook/32-github" }, body: "" };
  const appeler = async (chemin: string): Promise<AnswerGitHub> => {
    if (chemin.includes("/issues?")) return ok([]);
    if (chemin.includes("state=closed")) return ok([mergee]);
    if (chemin.endsWith("/pulls/51")) return ok({ additions: 8, deletions: 2, created_at: "2026-11-24T10:00:00Z" });
    return ok([]);
  };
  const rail = await lireLeRailSurGithub({ depot: REPOSITORY, appeler, maintenant: () => new Date(A) });
  const { faits: facts } = avecLeRail({ lu: true, depot: REPOSITORY, luLe: A, cuisine: { rubriques: [] }, faits: { rail: [] }, file: [], bilans: [], lignesDuRail: [], activites: [] }, rail);
  assert.deepEqual((facts.livres as { prLue?: unknown }[])[0]?.prLue, { additions: 8, deletions: 2, ouvertLe: "2026-11-24T10:00:00Z" });
});

test("la PR d'un ticket servi dont un côté seul de la taille se lit n'en dit aucun, mais dit son ouverture", async () => {
  const mergee = { number: 51, html_url: `https://github.com/${REPOSITORY}/pull/51`, title: "#32 — Servi", merged_at: "2026-11-24T11:00:00Z", updated_at: "2026-11-24T11:00:00Z", head: { ref: "cook/32-github" }, body: "" };
  for (const lue of [{ additions: 8 }, { deletions: 2 }]) {
    const appeler = async (chemin: string): Promise<AnswerGitHub> => {
      if (chemin.includes("/issues?")) return ok([]);
      if (chemin.includes("state=closed")) return ok([mergee]);
      if (chemin.endsWith("/pulls/51")) return ok({ ...lue, created_at: "2026-11-24T10:00:00Z" });
      return ok([]);
    };
    const rail = await lireLeRailSurGithub({ depot: REPOSITORY, appeler, maintenant: () => new Date(A) });
    const { faits: facts } = avecLeRail({ lu: true, depot: REPOSITORY, luLe: A, cuisine: { rubriques: [] }, faits: { rail: [] }, file: [], bilans: [], lignesDuRail: [], activites: [] }, rail);
    assert.deepEqual((facts.livres as { prLue?: unknown }[])[0]?.prLue, { ouvertLe: "2026-11-24T10:00:00Z" });
  }
});
