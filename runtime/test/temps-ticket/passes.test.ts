// Chaque phase de la pass, passage par passage (#3512) : la mesure, la CI que
// GitHub dit, le résumé des 7 derniers jours, et la station qui l'écrit au merge.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { LieuDesGates } from "../../src/github-etat/gates-de-la-tete.ts";
import { partagerLaCi, type RunDeCi } from "../../src/temps-ticket/ci-github.ts";
import { FICHIER_DES_TEMPS, mesurer, type Etape, type Marque } from "../../src/temps-ticket/mesure.ts";
import { resumerLaPasse } from "../../src/temps-ticket/passe.ts";
import { enregistrementsDuTexte, type EnregistrementTemps, type Passage } from "../../src/temps-ticket/synthese.ts";
import { FauxGitHub } from "../faux-github.ts";

const T0 = Date.UTC(2026, 10, 14, 17);
const a = (secondes: number) => new Date(T0 + secondes * 1000).toISOString();
const marques = (...liste: Array<[Etape, number]>): Marque[] => liste.map(([etape, s]) => ({ etape, at: a(s) }));

describe("each pass of a delivery, stage by stage", () => {
  // Livrée à 100, relue de 150 à 180, CI rouge renvoyée à 300 ; recuite, relivrée à 500, gates de 520 à 610, mergée à 700.
  const e = mesurer({ ticket: 9, marques: marques(["cuisson", 0], ["attentePasse", 100], ["revue", 150], ["ci", 180], ["renvoi", 300], ["cuisson", 320], ["attentePasse", 500], ["revue", 510], ["gates", 520], ["ci", 610], ["merge", 690]), testsMs: 0 }, a(700));

  test("a sent-back delivery counts the time of each of its passes", () => {
    assert.deepEqual(e.passes, [
      { debut: a(100), fin: a(300), attente: 50, gates: 0, revue: 30, ci: 120, merge: 0, renvoyee: true },
      { debut: a(500), fin: a(700), attente: 10, gates: 90, revue: 10, ci: 80, merge: 10, renvoyee: false },
    ]);
  });
  test("the gates the pass plays are a stage of their own, and the stages still add up", () => {
    assert.equal(e.gates, 90);
    assert.equal(e.attentePasse + e.revue + (e.gates ?? 0) + e.ci + e.merge, 200 + 200);
  });
  test("a pass the station did not see arrive leaves the passes unknown, not zero", () => {
    const vuEnPass = mesurer({ ticket: 9, marques: marques(["ci", 180], ["merge", 200]), testsMs: 0 }, a(205));
    assert.equal(vuEnPass.passes, undefined);
  });
});

describe("the CI of each pass as GitHub tells it", () => {
  const passe = (debut: number, fin: number, renvoyee = false): Passage => ({ debut: a(debut), fin: a(fin), attente: 0, gates: 0, revue: 0, ci: fin - debut, merge: 0, renvoyee });
  const job = (cree: number, commence: number | null, fini: number | null) => ({ creeLe: a(cree), commenceLe: commence === null ? null : a(commence), finiLe: fini === null ? null : a(fini) });

  // PR #3537 on 2026-11-14: opened at 17:13, its jobs only started at 17:41.
  test("the time some job waits for a runner is apart from the time the jobs run", () => {
    const runs: RunDeCi[] = [{ tete: "a", creeLe: a(0), finiLe: a(2400), jobs: [job(0, 1680, 2100), job(0, 1700, 2400)] }];
    assert.deepEqual(partagerLaCi(runs, [passe(0, 2500)])[0]?.ciGitHub, { attente: 1700, course: 700, relancees: 0 });
  });
  // PR #3544: its runtime shards were cancelled at 17:41 and started again, the branch moved under them.
  test("a run cut short because the branch moved counts as restarted, in the pass it was started in", () => {
    const runs: RunDeCi[] = [
      { tete: "a", creeLe: a(10), finiLe: a(700), jobs: [job(10, 20, 700)] },
      { tete: "b", creeLe: a(600), finiLe: a(1200), jobs: [job(600, 610, 1200)] },
      { tete: "c", creeLe: a(2000), finiLe: a(2300), jobs: [job(2000, 2010, 2300)] },
    ];
    const [premier, second] = partagerLaCi(runs, [passe(0, 1500, true), passe(1900, 2400)]);
    assert.equal(premier?.ciGitHub?.relancees, 1);
    assert.equal(second?.ciGitHub?.relancees, 0);
    // Une course sur deux têtes à la fois compte une fois : 10 s d'attente, 1180 s de course.
    assert.deepEqual(premier?.ciGitHub, { attente: 10 + 10, course: 1200 - 20 - 10, relancees: 1 });
  });
  test("a job with an unreadable instant is left out, a job not finished runs to the end of the pass", () => {
    const runs: RunDeCi[] = [{ tete: "a", creeLe: a(0), finiLe: null, jobs: [{ creeLe: "?", commenceLe: null, finiLe: null }, job(0, 100, null)] }];
    assert.deepEqual(partagerLaCi(runs, [passe(0, 300)])[0]?.ciGitHub, { attente: 100, course: 200, relancees: 0 });
  });
});

describe("the pass over the last 7 days", () => {
  const MAINTENANT = Date.parse(a(0));
  const passage = (p: Partial<Passage>): Passage => ({ debut: a(-100), fin: a(-50), attente: 0, gates: 0, revue: 0, ci: 0, merge: 0, renvoyee: false, ...p });
  const livraison = (ticket: number, ilYA: number, passes: Passage[] | undefined): EnregistrementTemps => ({ ticket, claimedAt: a(-ilYA - 1000), mergedAt: a(-ilYA), cuisson: 0, cuissonTests: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0, ...(passes === undefined ? {} : { passes }) });

  test("with no delivery measured in the 7 days, there is no summary at all, not zeros", () => {
    assert.equal(resumerLaPasse([], MAINTENANT), null);
    assert.equal(resumerLaPasse([livraison(1, 60, undefined), livraison(2, 8 * 86_400, [passage({ ci: 600 })])], MAINTENANT), null);
  });

  test("each stage says its median and p75 per delivery, every pass counted, and which stage and part weigh the most", () => {
    const r = resumerLaPasse(
      [
        livraison(1, 60, [passage({ attente: 60, revue: 120, ci: 300, merge: 10, ciGitHub: { attente: 200, course: 100, relancees: 0 } })]),
        // Renvoyée une fois : ses deux passages comptent.
        livraison(2, 3600, [passage({ attente: 30, revue: 60, ci: 900, renvoyee: true, ciGitHub: { attente: 800, course: 100, relancees: 2 } }), passage({ attente: 30, revue: 60, ci: 600, merge: 20, ciGitHub: { attente: 500, course: 100, relancees: 0 } })]),
        livraison(3, 86_400, [passage({ attente: 300, revue: 90, ci: 400, merge: 10, ciGitHub: { attente: 300, course: 100, relancees: 1 } })]),
      ],
      MAINTENANT,
    );
    assert.ok(r);
    assert.equal(r.livraisons, 3);
    const part = (cle: string) => r.parts.find((p) => p.cle === cle);
    assert.deepEqual(part("ci"), { cle: "ci", nom: "CI", livraisons: 3, medianeS: 400, p75S: 1500, totalS: 2200, partPct: 74 });
    assert.deepEqual(part("attente"), { cle: "attente", nom: "waiting for the pass", livraisons: 3, medianeS: 60, p75S: 300, totalS: 420, partPct: 14 });
    assert.deepEqual(part("ciAttente"), { cle: "ciAttente", nom: "CI waiting for runners", livraisons: 3, medianeS: 300, p75S: 1300, totalS: 1800, partPct: 60 });
    assert.equal(part("gates")?.totalS, 0);
    assert.deepEqual(r.phaseLaPlusLourde, { nom: "CI", totalS: 2200 });
    assert.deepEqual(r.partLaPlusLourde, { nom: "CI", partPct: 74 });
    assert.equal(r.relancees, 3);
    assert.equal(r.renvoyees, 1);
    assert.equal(r.passesRenvoyeesS, 30 + 60 + 900);
  });

  test("a part GitHub did not tell is no measure yet, never zero", () => {
    const r = resumerLaPasse([livraison(1, 60, [passage({ attente: 60, ci: 300 })])], MAINTENANT);
    const ci = r?.parts.find((p) => p.cle === "ciAttente");
    assert.deepEqual(ci, { cle: "ciAttente", nom: "CI waiting for runners", livraisons: 0, medianeS: null, p75S: null, totalS: 0, partPct: null });
    assert.equal(r?.relancees, null);
    assert.deepEqual(r?.partLaPlusLourde, { nom: "CI", partPct: 83 });
  });

  test("an unreadable pass leaves its delivery out", () => {
    const illisible = { ...livraison(1, 60, undefined), passes: [{ attente: "?" }] } as unknown as EnregistrementTemps;
    assert.equal(resumerLaPasse([illisible], MAINTENANT), null);
  });
});

function dossier(t: TestContext): string {
  const d = mkdtempSync(join(tmpdir(), "brigade-passes-"));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
}

// Sans CI sur ses PR, la pass joue les gates : rouges une fois, la livraison repart à un cook, puis vertes, elle est mergée.
test("the station records each pass of a delivery, sent back on red gates, with the gates' own time (#3512)", async (t) => {
  const clone = dossier(t);
  let horloge = T0;
  const faux = new FauxGitHub();
  faux.feu(812);
  let fois = 0;
  const gates = async (): Promise<LieuDesGates> => ({
    jouer: async () => {
      horloge += 90_000;
      fois += 1;
      return fois === 1 ? { vert: false, resume: "FAIL  runtime/test/pass.test.ts", detail: "" } : { vert: true, resume: "", detail: "" };
    },
    liberer: () => {},
  });
  const avertis: string[] = [];
  const station = faux.station("box/claude", { ciDesPR: () => false, gates, clone, maintenant: () => new Date(horloge), avertir: (texte) => avertis.push(texte) });
  for (let i = 0; i < 12 && faux.mergee(812) === undefined; i += 1) {
    const pr = faux.prs.find((p) => p.issue === 812 && p.state === "open");
    if (pr !== undefined) faux.sansCI.add(pr.number);
    await station.tour();
    await station.calme();
    horloge += 5_000;
  }
  assert.ok(faux.mergee(812), avertis.join("\n"));
  const [temps] = enregistrementsDuTexte(readFileSync(join(clone, FICHIER_DES_TEMPS), "utf8"));
  assert.equal(temps?.ticket, 812);
  assert.equal(temps?.passes?.length, 2);
  assert.deepEqual(
    temps?.passes?.map(({ gates: g, renvoyee }) => ({ gates: g, renvoyee })),
    [
      { gates: 90, renvoyee: true },
      { gates: 90, renvoyee: false },
    ],
  );
  assert.equal(temps?.gates, 180);
});

// Au merge, la station lit les runs de la branche sur GitHub ; illisibles, le temps s'écrit sans eux, et elle le dit.
describe("the station reads the CI runs of the branch at the merge (#3512)", () => {
  const servi = async (t: TestContext, ciDeLaBranche: (branche: string) => Promise<RunDeCi[]>) => {
    const clone = dossier(t);
    const lues: string[] = [];
    // Le faux GitHub, qui dit en plus les runs de CI d'une branche.
    const faux = new (class extends FauxGitHub {
      override pour(nom: string) {
        return {
          ...super.pour(nom),
          ciDeLaBranche: (branche: string) => {
            lues.push(branche);
            return ciDeLaBranche(branche);
          },
        };
      }
    })();
    faux.feu(813);
    const avertis: string[] = [];
    const station = faux.station("box/claude", { clone, avertir: (texte) => avertis.push(texte) });
    for (let i = 0; i < 6 && faux.mergee(813) === undefined; i += 1) {
      await station.tour();
      await station.calme();
    }
    assert.ok(faux.mergee(813), avertis.join("\n"));
    const [temps] = enregistrementsDuTexte(readFileSync(join(clone, FICHIER_DES_TEMPS), "utf8"));
    return { temps, avertis, lues };
  };

  test("read, each pass carries what its CI did", async (t) => {
    const { temps, lues } = await servi(t, async () => [{ tete: "a", creeLe: "2000-01-01T00:00:00Z", finiLe: "2000-01-01T00:01:00Z", jobs: [] }]);
    assert.deepEqual(lues, ["cook/813-github"]);
    assert.deepEqual(temps?.passes?.[0]?.ciGitHub, { attente: 0, course: 0, relancees: 0 });
  });
  test("unreadable, the record is written without it, and the station says so", async (t) => {
    const { temps, avertis } = await servi(t, async () => {
      throw new Error("gh api repos/o/r/actions/runs : HTTP 502");
    });
    assert.equal(temps?.passes?.length, 1);
    assert.equal(temps?.passes?.[0]?.ciGitHub, undefined);
    assert.ok(avertis.some((texte) => /#813 .*the CI runs of its branch are unreadable, its CI's wait for runners is not recorded: .*HTTP 502/.test(texte)), avertis.join("\n"));
  });
});
