// #4039: the closer's gesture — opening a closing pass on GitHub — goes through the gate of its autonomy level. On
// `propose`, its default, the pass is not opened until the chef's approval, then once and logged; on `observe`, it is
// never opened, and logged as not done. The GitHub and the clone are fakes that count their calls; the clock is given.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { enregistrementDe, OUTCOME } from "../../../src/autonomie/agents/gestes.ts";
import { magasinDeNiveaux, type Niveau } from "../../../src/autonomie/agents/niveaux.ts";
import { gestesEnAttente, porteDesGestes } from "../../../src/autonomie/agents/porte.ts";
import { brancherCloserGithub, MERGES_PER_PASS, type GitHubDuCloser } from "../../../src/closer-github-passe/closer-github-passe.ts";
import type { CauseReveil, Runtime } from "../../../src/runtime.ts";
import { repertoireTemporaire } from "../../outils.ts";

const PROJET = "brigade";
const MAINTENANT = new Date("2026-11-23T03:00:00.000Z");
const HEURE_MS = 3_600_000;

// A closer due — MERGES_PER_PASS merges and no pass known — on a base with one dead export, at the level given.
function closer(t: TestContext, niveau?: Niveau) {
  const repertoire = repertoireTemporaire(t);
  if (niveau !== undefined) magasinDeNiveaux(repertoire).poser(PROJET, "closer", niveau);
  const porte = porteDesGestes({ repertoire, projet: PROJET, horloge: () => MAINTENANT });
  const issues: { number: number; title: string; body: string; labels: string[]; association: string; state: "open" | "closed"; createdAt: string }[] = [];
  const creerIssue = { appels: 0 };
  const github: GitHubDuCloser = {
    issuesDepuis: async () => issues,
    creerIssue: async ({ titre, corps, labels }) => {
      creerIssue.appels++;
      const number = 500 + creerIssue.appels;
      issues.push({ number, title: titre, body: corps, labels, association: "MEMBER", state: "open", createdAt: MAINTENANT.toISOString() });
      return number;
    },
    ecrireCorps: async () => {},
    fermerIssue: async () => {},
  };
  const lus = Array.from({ length: MERGES_PER_PASS }, (_, i) => ({ at: new Date(MAINTENANT.getTime() - (i + 1) * HEURE_MS).toISOString(), ticket: 100 + i }));
  const clone = {
    merges: async () => lus,
    observer: async () => ({ sha: "0123456789abcdef", merges: lus.map(({ at }, i) => ({ sha: `m${i}`, at, ajoute: 30, retire: 10 })), textes: [{ chemin: "src/a.ts", texte: "export function inutile() {\n  return 1;\n}\n" }] }),
  };
  // The pass ends on what it warns: a promise per warning awaited, with no timer.
  const avertissements: string[] = [];
  const attentes: { motif: RegExp; resoudre: (texte: string) => void }[] = [];
  const avertir = (texte: string) => {
    avertissements.push(texte);
    for (const attente of attentes.filter(({ motif }) => motif.test(texte))) attente.resoudre(texte);
  };
  const averti = (motif: RegExp) => new Promise<string>((resoudre) => attentes.push({ motif, resoudre }));
  const ecouteurs = new Set<(cause: CauseReveil) => void>();
  const runtime = { projet: PROJET, journal: {}, surReveil: (ecouter: (cause: CauseReveil) => void) => (ecouteurs.add(ecouter), () => void ecouteurs.delete(ecouter)), arreter: () => {} } as unknown as Runtime;
  const branche = brancherCloserGithub(runtime, { porte, reglages: () => ({ calibration: { model: "sonnet", effort: "low" }, removedLines: 20 }), github, clone, base: "main", ecartMs: 0, maintenant: () => MAINTENANT, avertir });
  t.after(() => branche.arreter("test"));
  const reveiller = () => ecouteurs.forEach((ecouter) => ecouter("tick"));
  return { repertoire, porte, creerIssue, avertissements, averti, reveiller };
}

test("the closer on propose — its default — opens no pass until the chef's approval, then opens it once and logs it", async (t) => {
  const { repertoire, porte, creerIssue, averti, reveiller } = closer(t);
  const tenue = averti(/closing pass held/);
  reveiller();
  assert.equal(await tenue, "brigade : closing pass held for the chef's OK — `brigade <projet> manager approve 1` opens it (20 merges since the last one, 1 candidate)");
  assert.equal(creerIssue.appels, 0);
  assert.deepEqual(enregistrementDe(repertoire, "closer").gestures, []);
  assert.deepEqual(gestesEnAttente(repertoire).map(({ id, agent, line }) => ({ id, agent, line })), [{ id: 1, agent: "closer", line: "open a closing pass on `main`" }]);

  assert.equal((await porte.approuver(1))?.etat, "done");
  assert.equal(creerIssue.appels, 1);
  assert.deepEqual(enregistrementDe(repertoire, "closer").gestures, [{ at: MAINTENANT.toISOString(), line: "opened the closing pass #501 on `main`", reason: "20 merges since the last one, 1 candidate", outcome: OUTCOME.FIXED_BY_SELF }]);

  assert.equal(await porte.approuver(1), null);
  assert.equal(creerIssue.appels, 1);
  assert.equal(enregistrementDe(repertoire, "closer").gestures.length, 1);
});

test("the closer on observe never opens the pass, and logs it as not done", async (t) => {
  const { repertoire, creerIssue, averti, reveiller } = closer(t, "observe");
  const observee = averti(/the closer observes/);
  reveiller();
  assert.equal(await observee, "brigade : closing pass not opened — the closer observes: it would open a closing pass on `main` (20 merges since the last one, 1 candidate)");
  assert.equal(creerIssue.appels, 0);
  assert.deepEqual(enregistrementDe(repertoire, "closer").gestures, [{ at: MAINTENANT.toISOString(), line: "open a closing pass on `main`", reason: "20 merges since the last one, 1 candidate", outcome: OUTCOME.NOT_DONE }]);
  assert.deepEqual(gestesEnAttente(repertoire), []);
});

test("the closer on act opens the pass at once, and logs it", async (t) => {
  const { repertoire, creerIssue, averti, reveiller } = closer(t, "act");
  const ouverte = averti(/closing pass opened/);
  reveiller();
  await ouverte;
  // The pass warns before its gate logs: the log is written in the same turn of the loop.
  await new Promise((fin) => setImmediate(fin));
  assert.equal(creerIssue.appels, 1);
  assert.deepEqual(enregistrementDe(repertoire, "closer").gestures.map(({ line, outcome }) => ({ line, outcome })), [{ line: "opened the closing pass #501 on `main`", outcome: OUTCOME.FIXED_BY_SELF }]);
});
