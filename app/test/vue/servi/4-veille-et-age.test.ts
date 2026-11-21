// #3925 : la veille du rail se relit toutes les 5 s (et non 30 s), une lecture ne reste fraîche que 4 s, et l'âge d'un merge
// se dit au mot près. Tests de ce delivery, en plus des tests d'acceptation gelés.
import assert from "node:assert/strict";
import { test } from "node:test";
import { comprendre, duree, tableau as tableauDe, type Faits, type Tableau } from "../../../src/faits.ts";
import type { LectureDuTableauDuDepot } from "../../../src/tableau/lecture.ts";
import { lireLeTableauDuDepot } from "../../../src/tableau/lecture.ts";
import { ouvrirVeilleDuTableau, statusDuTableau, tenirLecturesDuTableau } from "../../../src/tableau/rail.ts";
import { FRAICHEUR_MAX_D_UNE_LECTURE_MS, INTERVALLE_DE_LA_VEILLE_MS } from "../../../src/vue/servi/fraicheur.ts";

const DEPOT = "acme/kitchen";
const T0 = Date.parse("2026-11-20T10:00:00Z");
const ok = (data: unknown) => ({ status: 200, data });

test("the rail watch waits 5 s between two readings by default", async () => {
  assert.equal(INTERVALLE_DE_LA_VEILLE_MS, 5_000);
  const attentes: number[] = [];
  let lectures = 0;
  let relue!: () => void;
  const deuxLectures = new Promise<void>((fin) => (relue = fin));
  const veille = ouvrirVeilleDuTableau<{ nom: string }>({
    lire: async () => ({ lu: false, depot: DEPOT, luLe: new Date(T0).toISOString(), raison: "x" }),
    attendre: (async (ms: number) => void attentes.push(ms)) as unknown as typeof import("node:timers/promises").setTimeout,
    surLecture: () => {
      if (++lectures === 2) relue();
    },
  });
  veille.regarder([{ nom: "parade" }], [], 1);
  await deuxLectures;
  veille.fermer();
  assert.deepEqual(attentes.slice(0, 2), [5_000, 5_000]);
});

test("a rail reading never stays fresh as long as a watch turn, whatever freshness is asked", async () => {
  let instant = 0;
  let appels = 0;
  const lectures = tenirLecturesDuTableau<{ nom: string }>({
    lire: async () => (appels++, { lu: false, depot: DEPOT, luLe: new Date(T0).toISOString(), raison: "x" }),
    fraicheurMs: 60_000,
    maintenant: () => instant,
  });
  await lectures.lire({ nom: "p" });
  instant = FRAICHEUR_MAX_D_UNE_LECTURE_MS - 1;
  await lectures.lire({ nom: "p" });
  assert.equal(appels, 1);
  instant = FRAICHEUR_MAX_D_UNE_LECTURE_MS;
  await lectures.lire({ nom: "p" });
  assert.equal(appels, 2);
  assert.ok(FRAICHEUR_MAX_D_UNE_LECTURE_MS < INTERVALLE_DE_LA_VEILLE_MS);
});

const fermee = (n: number, mergeLe: string) => ({
  number: 1000 + n, title: `#${n} — Ticket ${n}`, html_url: `https://github.com/${DEPOT}/pull/${1000 + n}`, created_at: "2026-11-20T09:00:00Z",
  updated_at: mergeLe, merged_at: mergeLe, head: { ref: `cook/${n}-github` }, body: `Closes #${n}\n\nCooked by station \`box/claude\`.`,
});
async function servis(ages: number[], maintenant: number): Promise<Tableau["rail"]["colonnes"][number]["cartes"]> {
  const fermees = ages.map((ms, i) => fermee(i + 1, new Date(maintenant - ms).toISOString()));
  const appeler = async (chemin: string) => {
    if (chemin.includes("/pulls?state=closed")) return ok(fermees);
    if (chemin.includes("/pulls?") || chemin.includes("/issues?")) return ok([]);
    if (chemin === `/repos/${DEPOT}`) return ok({ default_branch: "main" });
    if (chemin.includes("/check-runs")) return ok({ check_runs: [{ conclusion: "success" }] });
    if (/\/issues\/\d+\/(comments|events)/.test(chemin)) return ok([]);
    return { status: 404, data: {} };
  };
  const lu = await lireLeTableauDuDepot({ depot: DEPOT, appeler, maintenant: () => new Date(maintenant) });
  assert.ok(lu.lu);
  const faits = comprendre(JSON.stringify(lu.faits));
  assert.ok(!("informe" in faits));
  const vu = tableauDe(faits as Faits, undefined, { texte: statusDuTableau(lu), a: lu.luLe });
  return vu.rail.colonnes.find(({ nom }) => nom === "Served")?.cartes ?? [];
}

test("a merged card says 'merged N ago', the exact wording, at each boundary of the duration", async () => {
  const cas: [number, string][] = [[0, "0 s"], [59_999, "59 s"], [60_000, "1 min"], [59 * 60_000 + 59_000, "59 min"], [60 * 60_000, "1 h 00"], [171 * 60_000, "2 h 51"]];
  const cartes = await servis(cas.map(([ms]) => ms), T0);
  assert.equal(cartes.length, cas.length);
  for (const [i, [, dit]] of cas.entries()) {
    const carte = cartes.find((c) => c.ticket === i + 1) ?? assert.fail(`card ${i + 1}`);
    const merged = carte.dit?.find((d) => d.libelle === "merged");
    assert.equal(merged?.valeur, `${dit} ago`);
    assert.ok(!carte.dit?.some((d) => d.libelle === "served"), "'served … before the reading' is replaced, not repeated");
  }
});

test("the merge age grows with the reading time, never negative", async () => {
  const a = (await servis([10_000], T0))[0]?.dit?.find((d) => d.libelle === "merged")?.valeur;
  const b = (await servis([10_000 + 5 * 60_000], T0 + 5 * 60_000))[0]?.dit?.find((d) => d.libelle === "merged")?.valeur;
  assert.equal(a, "10 s ago");
  assert.equal(b, "5 min ago");
  assert.equal(duree(-5_000), "0 s");
});
