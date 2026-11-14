// La pass signale, en une ligne sur la PR, les fichiers qu'une livraison touche hors de la zone annoncée
// par son ticket (#3511) — en conseil : le verdict ne change pas.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { priseDeLaStation, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { signalerHorsZone } from "../../src/passe-hors-zone/hors-zone.ts";
import { FauxGitHub, fauxClient } from "../faux-github.ts";

// La ligne que `signalerHorsZone` poserait, ou null.
async function ligneHorsZone(zone: string[], fichiers: string[]): Promise<string | null> {
  const posees: string[] = [];
  await signalerHorsZone({ zone: async () => zone, fichiers, pr: 1, commentaires: async () => [], commenter: async (_n, corps) => void posees.push(corps), avertir: () => {} });
  return posees[0] ?? null;
}

const CORPS = "## Acceptance criteria\n\n- It adds two numbers";
const FICHE = (zone: string) => `<!-- brigade:fiche -->\n- awaiting: none\n- zone: ${zone}`;

// Une livraison qui touche `fichiers`, sur un ticket dont la fiche annonce `zone` ; la relecture répond `verdict`.
async function parLaStation(t: TestContext, zone: string, fichiers: string[], verdict: "vert" | "rouge" = "vert", avertir: (texte: string) => void = () => {}) {
  const repertoire = mkdtempSync(join(tmpdir(), "hors-zone-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(11, ["fire", "model:opus", "effort:high", "tech"], CORPS);
  faux.commentaires.set(11, [{ body: FICHE(zone), station: "" } as never]);
  const lancer: Lancer = ({ args, flux }) => {
    const reviewer = args.includes("--tools");
    const relecture = { verdict, resume: "Read.", constats: verdict === "rouge" ? [{ gravite: "bloquant", categorie: "critere-non-tenu", fichier: null, constat: "no" }] : [], criteres: [{ critere: 1, tests: [], relecture: true }] };
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: reviewer ? JSON.stringify(relecture) : "done" })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 30, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({
    nom: "box",
    places: 1,
    base: "main",
    depotGitHub: "faux/depot",
    github: fauxClient(faux),
    depot: {
      connait: () => false,
      preparer: async (run) => ({ worktree: join(repertoire, run), branche: `cook/${run}` }),
      reprendre: async (run) => join(repertoire, run),
      retirer: () => {},
      ranger: async () => null,
      pousser: () => {},
      commits: () => 1,
      changes: () => fichiers,
      diff: () => "diff --git a/x b/x\n+x\n",
    },
    prise: priseDeLaStation,
    claude: "claude",
    env: { PATH: process.env.PATH },
    cloison: null,
    plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
    graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" },
    flux: repertoire,
    lancer,
    avertir,
  });
  if ("refus" in station) throw new Error(station.refus);
  for (let tour = 0; tour < 4 && faux.mergee(11) === undefined && !(faux.commentaires.get(11) ?? []).some((c) => c.body.startsWith("<!-- brigade:renvoi")); tour += 1) {
    await station.tour();
    await station.calme();
  }
  const pr = faux.prs.find((p) => p.branche === "cook/11-github")?.number ?? 0;
  const surLaPR = (faux.commentaires.get(pr) ?? []).map((c) => c.body);
  return { faux, lignes: surLaPR.filter((corps) => corps.includes("outside the zone")), verdicts: surLaPR.filter((corps) => corps.startsWith("<!-- brigade:verdict")) };
}

test("a delivery touching only files inside the zone produces no comment", async (t) => {
  const { lignes, faux } = await parLaStation(t, "runtime/src/passe-hors-zone/, runtime/test/passe-hors-zone/", ["runtime/src/passe-hors-zone/a.ts", "runtime/test/passe-hors-zone/a.test.ts"]);
  assert.deepEqual(lignes, []);
  assert.equal(faux.mergee(11)?.mergeePar, "box");
});

test("a delivery touching a file outside the zone produces exactly one comment line on the PR naming it, and is still merged", async (t) => {
  const { lignes, faux, verdicts } = await parLaStation(t, "runtime/src/passe-hors-zone/", ["runtime/src/passe-hors-zone/a.ts", "runtime/src/autre.ts", "docs/x.md"]);
  assert.equal(lignes.length, 1);
  assert.ok(!lignes[0]!.includes("\n"), "one line");
  assert.match(lignes[0]!, /`runtime\/src\/autre\.ts`, `docs\/x\.md`/);
  assert.ok(!lignes[0]!.includes("a.ts"));
  // Le verdict de la pass est celui de la relecture : approuvé, mergé.
  assert.match(verdicts[0] ?? "", /verdict=approve/);
  assert.equal(faux.mergee(11)?.mergeePar, "box");
});

test("the line does not turn a red review green, nor a green one red", async (t) => {
  const { lignes, faux, verdicts } = await parLaStation(t, "runtime/src/passe-hors-zone/", ["elsewhere.ts"], "rouge");
  assert.equal(lignes.length, 1);
  assert.match(verdicts[0] ?? "", /verdict=request-changes/);
  assert.equal(faux.mergee(11), undefined);
});

test("a file inside a folder of the zone counts as inside, a sibling folder sharing the prefix does not", async () => {
  assert.equal(await ligneHorsZone(["runtime/src/passe-hors-zone"], ["runtime/src/passe-hors-zone/deep/er/a.ts", "runtime/src/passe-hors-zone/b.ts"]), null);
  assert.match(await ligneHorsZone(["runtime/src/passe-hors-zone"], ["runtime/src/passe-hors-zone2/a.ts"]) ?? "", /`runtime\/src\/passe-hors-zone2\/a\.ts`/);
});

test("a ticket announcing no zone gets no line", async () => {
  assert.equal(await ligneHorsZone([], ["a.ts"]), null);
});

test("the same line is not posted twice, and a failing read or write is said, never thrown", async () => {
  const posees: string[] = [];
  const base = { zone: async () => ["a"], fichiers: ["b.ts"], pr: 7, avertir: () => {} };
  await signalerHorsZone({ ...base, commentaires: async () => posees, commenter: async (_n, corps) => void posees.push(corps) });
  await signalerHorsZone({ ...base, commentaires: async () => posees, commenter: async (_n, corps) => void posees.push(corps) });
  assert.equal(posees.length, 1);
  const dits: string[] = [];
  await signalerHorsZone({ ...base, avertir: (texte) => dits.push(texte), commentaires: async () => { throw new Error("read down"); }, commenter: async () => assert.fail("posted blind") });
  await signalerHorsZone({ ...base, avertir: (texte) => dits.push(texte), zone: async () => { throw new Error("zone down"); }, commentaires: async () => [], commenter: async () => assert.fail("posted blind") });
  await signalerHorsZone({ ...base, avertir: (texte) => dits.push(texte), commentaires: async () => [], commenter: async () => { throw new Error("write down"); } });
  assert.equal(dits.length, 3);
});
