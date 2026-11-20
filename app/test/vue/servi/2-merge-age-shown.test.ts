// #3925, critère 2 : chaque livraison servie dit quand elle a été mergée (« merged 2 min ago »), et cet âge avance à chaque lecture.
// Test d'acceptation gelé.
import assert from "node:assert/strict";
import { test } from "node:test";
import { comprendre, tableau as tableauDe, type Faits, type Tableau } from "../../../src/faits.ts";
import type { AppelGitHub, ReponseGitHub } from "../../../src/tableau/client.ts";
import { lireLeTableauDuDepot, type LectureDuTableauDuDepot } from "../../../src/tableau/lecture.ts";
import { statusDuTableau, tenirLecturesDuTableau } from "../../../src/tableau/rail.ts";

const DEPOT = "acme/kitchen";
const T0 = Date.parse("2026-11-20T10:00:00Z");
const ok = (data: unknown): ReponseGitHub => ({ status: 200, data });
const fermee = (n: number, mergeLe: string) => ({
  number: 1000 + n, title: `#${n} — Ticket ${n}`, html_url: `https://github.com/${DEPOT}/pull/${1000 + n}`, created_at: "2026-11-20T09:00:00Z",
  updated_at: mergeLe, merged_at: mergeLe, head: { ref: `cook/${n}-github` }, body: `Closes #${n}\n\nCooked by station \`box/claude\`.`,
});
// Un faux GitHub dont la liste des PR fermées est lue à chaque appel : `fermees()` dit ce qui est mergé à cet instant.
const github = (fermees: () => unknown[]): AppelGitHub => async (chemin) => {
  if (chemin.includes("/pulls?state=closed")) return ok(fermees());
  if (chemin.includes("/pulls?")) return ok([]);
  if (chemin.includes("/issues?")) return ok([]);
  if (chemin === `/repos/${DEPOT}`) return ok({ default_branch: "main" });
  if (chemin.includes("/check-runs")) return ok({ check_runs: [{ conclusion: "success" }] });
  if (/\/issues\/\d+\/(comments|events)/.test(chemin)) return ok([]);
  return { status: 404, data: {} };
};
function dessine(lu: LectureDuTableauDuDepot): Tableau {
  assert.ok(lu.lu, "the rail is read");
  const faits = comprendre(JSON.stringify(lu.faits));
  assert.ok(!("informe" in faits), "facts are in shape");
  return tableauDe(faits as Faits, undefined, { texte: statusDuTableau(lu), a: lu.luLe });
}
const servis = (vu: Tableau) => vu.rail.colonnes.find(({ nom }) => nom === "Served")?.cartes ?? [];
const lireA = (appeler: AppelGitHub, maintenant: number) => lireLeTableauDuDepot({ depot: DEPOT, appeler, maintenant: () => new Date(maintenant) });

const textes = (vu: Tableau, ticket: number): string => {
  const carte = servis(vu).find((c) => c.ticket === ticket) ?? assert.fail(`no card #${ticket} in Served`);
  return [carte.ligne ?? "", ...(carte.dit ?? []).map((d) => `${d.libelle} ${d.valeur}`)].join(" | ");
};

test("a served delivery says how long ago it was merged, and the age moves with the reading", async () => {
  const appeler = github(() => [fermee(7, new Date(T0 - 2 * 60_000).toISOString())]);
  assert.match(textes(dessine(await lireA(appeler, T0)), 7), /merged 2 min ago/);
  assert.match(textes(dessine(await lireA(appeler, T0 + 3 * 60_000)), 7), /merged 5 min ago/);
});
