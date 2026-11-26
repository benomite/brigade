// #3925, critère 1 : une livraison mergée à l'instant apparaît dans Served sans rechargement, quelques secondes après le merge.
// Test d'acceptation gelé. La lecture est celle de l'app (tenirLecturesDuTableau, à sa fraîcheur de production), sur un faux GitHub.
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

const FRAICHEUR_DE_L_APP_MS = 60_000;

test("a delivery merged a moment ago is in Served at the next reading, a few seconds after its merge", async () => {
  let maintenant = T0;
  let mergee = false;
  const appeler = github(() => (mergee ? [fermee(7, new Date(T0 + 2_000).toISOString())] : []));
  const lectures = tenirLecturesDuTableau<{ nom: string }>({ lire: () => lireA(appeler, maintenant), fraicheurMs: FRAICHEUR_DE_L_APP_MS, maintenant: () => maintenant });
  assert.deepEqual(servis(dessine(await lectures.lire({ nom: "parade" }))), [], "nothing served yet");
  mergee = true;
  maintenant = T0 + 5_000;
  const apres = servis(dessine(await lectures.lire({ nom: "parade" })));
  assert.deepEqual(apres.map(({ ticket }) => ticket), [7], "the merged delivery is in Served 3 s after its merge");
});

// #3925, critère 2 : chaque livraison servie dit quand elle a été mergée (« merged 2 min ago »), et cet âge avance à chaque lecture.
// Test d'acceptation gelé.
const textes = (vu: Tableau, ticket: number): string => {
  const carte = servis(vu).find((c) => c.ticket === ticket) ?? assert.fail(`no card #${ticket} in Served`);
  return [carte.ligne ?? "", ...(carte.dit ?? []).map((d) => `${d.libelle} ${d.valeur}`)].join(" | ");
};

// brigade:guard — moved unchanged from its own file by the closing pass #4074: it keeps guarding what main already does.
test("a served delivery says how long ago it was merged, and the age moves with the reading", async () => {
  const appeler = github(() => [fermee(7, new Date(T0 - 2 * 60_000).toISOString())]);
  assert.match(textes(dessine(await lireA(appeler, T0)), 7), /merged 2 min ago/);
  assert.match(textes(dessine(await lireA(appeler, T0 + 3 * 60_000)), 7), /merged 5 min ago/);
});

// #3925, critère 3 : les chiffres de la colonne Served restent, avec leurs valeurs — comme avant.
// Test d'acceptation gelé : il passe déjà sur la base, et c'est voulu.
test("the figures of the Served column stay and keep their values", async () => {
  const appeler = github(() => [fermee(7, new Date(T0 - 2 * 60_000).toISOString()), fermee(8, new Date(T0 - 30 * 60_000).toISOString())]);
  const lu = await lireA(appeler, T0);
  const vu = dessine(lu);
  assert.equal(servis(vu).length, 2);
  assert.equal(vu.compteurs.find(({ libelle }) => libelle === "served 24 h")?.nombre, 2);
  assert.equal(lu.faits.compteurs.livres24h, 2);
});
