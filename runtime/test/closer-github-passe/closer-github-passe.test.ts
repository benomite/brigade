// The closer on the GitHub-only path (#2361): with the switch on, the old
// closer stops at its entry, and this pass runs instead, for each project, at
// the closer's cadence — reading and writing only GitHub and the clone. What
// must not happen is checked once a pass has run, never after a duration.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import { aOuvrir, brancherCloserGithub, estUneFermeture, lectureDuClone, type GitHubDuCloser, type LectureDuClone, type OptionsCloserGithub } from "../../src/closer-github-passe/closer-github-passe.ts";
import { MERGES_PER_PASS, ONE_PASS_A_DAY_MS } from "../../src/closing/trigger.ts";
import { elagageDuClone, elaguerBranchesPerimees } from "../../src/github-seul/boucles-perimees/boucles-perimees.ts";
import { zoneDuCorps } from "../../src/brigade-github.ts";
import type { Runtime } from "../../src/runtime.ts";
import { demarrer } from "../../src/runtime.ts";
import { cuisineFermee } from "../closing/kitchen.ts";
import { BASE, git, jusqua, repertoireTemporaire } from "../outils.ts";

const MAINTENANT = new Date("2026-10-08T10:00:00.000Z");
const CALIBRE = { calibration: { model: "sonnet", effort: "low" }, removedLines: 20 };
const HEURE_MS = 3_600_000;

// `n` merges, an hour apart, the latest an hour ago.
const merges = (n: number, depuis = MAINTENANT) => Array.from({ length: n }, (_, i) => new Date(depuis.getTime() - (i + 1) * HEURE_MS).toISOString());

type IssueDuFaux = { number: number; title: string; body: string; labels: string[]; association: string; state: "open" | "closed"; createdAt: string };

// A GitHub of the test: its issues, those the pass opened and closed.
function fauxGitHub(...issues: IssueDuFaux[]) {
  const etat = [...issues];
  const creees: IssueDuFaux[] = [];
  const fermees: number[] = [];
  const lectures: string[] = [];
  let suivant = 500;
  const github: GitHubDuCloser = {
    issuesDepuis: async (instant) => {
      lectures.push(instant);
      return etat.filter(({ createdAt }) => createdAt >= instant);
    },
    creerIssue: async ({ titre, corps, labels }) => {
      const issue: IssueDuFaux = { number: ++suivant, title: titre, body: corps, labels, association: "MEMBER", state: "open", createdAt: MAINTENANT.toISOString() };
      etat.push(issue);
      creees.push(issue);
      return issue.number;
    },
    fermerIssue: async (numero) => {
      fermees.push(numero);
      const issue = etat.find(({ number }) => number === numero);
      if (issue) issue.state = "closed";
    },
  };
  return { github, etat, creees, fermees, lectures };
}

const passee = (number: number, createdAt: string, state: "open" | "closed" = "closed"): IssueDuFaux => ({ number, title: "Closing pass", body: "<!-- brigade:fermeture sha=abc -->\n\n## Context", labels: [], association: "MEMBER", state, createdAt });

// A clone of the test: its merges, and a base with one dead export.
function fauxClone(lus: string[] = merges(MERGES_PER_PASS)) {
  const appels = { merges: 0, observations: 0 };
  const clone: LectureDuClone = {
    merges: async () => {
      appels.merges++;
      return lus;
    },
    observer: async () => {
      appels.observations++;
      return {
        sha: "0123456789abcdef",
        merges: lus.map((at, i) => ({ sha: `m${i}`, at, ajoute: 30, retire: 10 })),
        textes: [
          { chemin: "src/a.ts", texte: "export function inutile() {\n  return 1;\n}\n" },
          { chemin: "src/b.ts", texte: "export const vit = 2;\n" },
          { chemin: "src/c.ts", texte: 'import { vit } from "./b.ts";\nconsole.log(vit);\n' },
        ],
      };
    },
  };
  return { clone, appels };
}

// A runtime that is only its wakes: its log throws at the first read or write.
function runtimeSansJournal() {
  const ecouteurs = new Set<(cause: "tick" | "log") => void>();
  const journal = new Proxy({}, {
    get() {
      throw new Error("the GitHub-only closer touched the log");
    },
  });
  const runtime = { projet: "brigade", journal, surReveil: (ecouter: (cause: "tick" | "log") => void) => (ecouteurs.add(ecouter), () => void ecouteurs.delete(ecouter)), arreter: () => {} } as unknown as Runtime;
  return { runtime, reveiller: (cause: "tick" | "log" = "tick") => ecouteurs.forEach((ecouter) => ecouter(cause)) };
}

// Branches the pass on a runtime of its wakes only, the switch a flag the test flips.
function brancher(t: TestContext, options: Partial<OptionsCloserGithub> & { github: GitHubDuCloser; clone: LectureDuClone }) {
  const sw = { allume: true };
  const avertissements: string[] = [];
  const { runtime, reveiller } = runtimeSansJournal();
  const branche = brancherCloserGithub(runtime, { perimee: () => sw.allume, reglages: () => CALIBRE, base: BASE, ecartMs: 0, maintenant: () => MAINTENANT, avertir: (m) => void avertissements.push(m), ...options });
  t.after(() => branche.arreter("test"));
  return { sw, avertissements, reveiller };
}

// A pass that has read the merges has decided: what follows is synchronous.
const apresLesMerges = async (appels: { merges: number }, avant: number) => {
  await jusqua(() => appels.merges > avant);
  await new Promise((fin) => setImmediate(fin));
};

describe("the closer's trigger, on what GitHub and the clone say", () => {
  test("due after MERGES_PER_PASS merges with no pass known", () => {
    assert.equal(aOuvrir(null, merges(MERGES_PER_PASS - 1), MAINTENANT), null);
    assert.deepEqual(aOuvrir(null, merges(MERGES_PER_PASS), MAINTENANT), { merges: MERGES_PER_PASS });
  });

  test("only the merges since the last pass count, never within a day of it, never while it is open", () => {
    const ilYaDeuxJours = new Date(MAINTENANT.getTime() - 2 * ONE_PASS_A_DAY_MS).toISOString();
    const avant = merges(MERGES_PER_PASS, new Date(Date.parse(ilYaDeuxJours)));
    assert.equal(aOuvrir({ number: 1, createdAt: ilYaDeuxJours, state: "closed" }, avant, MAINTENANT), null);
    assert.deepEqual(aOuvrir({ number: 1, createdAt: ilYaDeuxJours, state: "closed" }, merges(MERGES_PER_PASS), MAINTENANT), { merges: MERGES_PER_PASS });
    assert.equal(aOuvrir({ number: 1, createdAt: ilYaDeuxJours, state: "open" }, merges(MERGES_PER_PASS), MAINTENANT), null);
    const ceMatin = new Date(MAINTENANT.getTime() - ONE_PASS_A_DAY_MS + HEURE_MS).toISOString();
    assert.equal(aOuvrir({ number: 1, createdAt: ceMatin, state: "closed" }, merges(MERGES_PER_PASS * 2), MAINTENANT), null);
  });
});

describe("the pass, switch on", () => {
  test("opens one closing issue at a tick: fire, the closer's calibration, the drift, the candidates to prune and their zone", async (t) => {
    const gh = fauxGitHub();
    const { clone } = fauxClone();
    const k = brancher(t, { github: gh.github, clone });
    k.reveiller();
    await jusqua(() => gh.creees.length === 1);
    const [ouverte] = gh.creees;
    assert.ok(ouverte);
    assert.deepEqual(ouverte.labels, ["fire", "model:sonnet", "effort:low"]);
    assert.ok(estUneFermeture(ouverte.body));
    assert.match(ouverte.body, /## Drift\n\n.*\n\n- last 20 merges: \+600 \/ −200 \(3:1\)/);
    assert.match(ouverte.body, /- M1 — export `inutile` of `src\/a\.ts:1` — referenced nowhere/);
    assert.match(ouverte.body, /No more than 20 lines removed/);
    // The zone is the one the GitHub-only stations read: no other ticket takes these files meanwhile.
    assert.deepEqual(zoneDuCorps(ouverte.body), ["src/a.ts"]);
    assert.match(k.avertissements.join("\n"), /closing pass opened on GitHub — #501, 20 merges since the last one, 1 candidate/);
  });

  test("a wake from the log is not its cadence, and the switch off stops it", async (t) => {
    const gh = fauxGitHub();
    const f = fauxClone();
    const k = brancher(t, { github: gh.github, clone: f.clone });
    k.sw.allume = false;
    k.reveiller();
    k.sw.allume = true;
    k.reveiller("log");
    assert.equal(f.appels.merges, 0);
    assert.deepEqual(gh.lectures, []);
    k.reveiller();
    await jusqua(() => gh.creees.length === 1);
  });

  test("an open pass, or one from this morning, keeps another from opening; a closed one two days old does not", async (t) => {
    const ilYaDeuxJours = new Date(MAINTENANT.getTime() - 2 * ONE_PASS_A_DAY_MS).toISOString();
    const ouverte = passee(40, ilYaDeuxJours, "open");
    const gh = fauxGitHub(ouverte);
    const f = fauxClone();
    const k = brancher(t, { github: gh.github, clone: f.clone });
    k.reveiller();
    await apresLesMerges(f.appels, 0);
    assert.equal(f.appels.observations, 0);
    assert.deepEqual(gh.creees, []);

    gh.etat.push(passee(41, new Date(MAINTENANT.getTime() - HEURE_MS).toISOString()));
    ouverte.state = "closed";
    k.reveiller();
    await apresLesMerges(f.appels, 1);
    assert.deepEqual(gh.creees, []);

    gh.etat.pop();
    k.reveiller();
    await jusqua(() => gh.creees.length === 1);
  });

  test("an issue with the mark from an outsider is not a pass", async (t) => {
    const gh = fauxGitHub({ ...passee(40, MAINTENANT.toISOString(), "open"), association: "NONE" });
    const k = brancher(t, { github: gh.github, clone: fauxClone().clone });
    k.reveiller();
    await jusqua(() => gh.creees.length === 1);
  });

  test("two stations that open one together keep the oldest", async (t) => {
    const gh = fauxGitHub();
    const creer = gh.github.creerIssue;
    // Another station's pass lands just before this one's.
    gh.github.creerIssue = async (issue) => {
      await creer(issue);
      return creer(issue);
    };
    const k = brancher(t, { github: gh.github, clone: fauxClone().clone });
    k.reveiller();
    await jusqua(() => gh.fermees.length === 1);
    assert.deepEqual(gh.fermees, [502]);
    assert.doesNotMatch(k.avertissements.join("\n"), /opened on GitHub/);
  });

  test("with nothing to prune, no issue, said once for that base", async (t) => {
    const gh = fauxGitHub();
    const f = fauxClone();
    const observer = f.clone.observer;
    f.clone.observer = async () => ({ ...(await observer()), textes: [] });
    const k = brancher(t, { github: gh.github, clone: f.clone });
    k.reveiller();
    await jusqua(() => k.avertissements.length === 1);
    assert.match(k.avertissements[0] ?? "", /closing pass not opened — the observation spots neither duplicate nor dead code/);
    k.reveiller();
    await apresLesMerges(f.appels, 1);
    assert.equal(k.avertissements.length, 1);
    assert.deepEqual(gh.creees, []);
  });

  test("a project whose closer is not set gets no pass", async (t) => {
    const gh = fauxGitHub();
    const f = fauxClone();
    const k = brancher(t, { github: gh.github, clone: f.clone, reglages: () => ({ calibration: null, removedLines: 20 }) });
    k.reveiller();
    k.reveiller();
    assert.deepEqual(gh.lectures, []);
    assert.equal(f.appels.merges, 0);
  });

  test("GitHub refusing the read is said, and the next tick tries again", async (t) => {
    const gh = fauxGitHub();
    const lire = gh.github.issuesDepuis;
    let panne = true;
    gh.github.issuesDepuis = async (instant) => {
      if (panne) throw new Error("gh api : HTTP 502");
      return lire(instant);
    };
    const k = brancher(t, { github: gh.github, clone: fauxClone().clone });
    k.reveiller();
    await jusqua(() => k.avertissements.length === 1);
    assert.match(k.avertissements[0] ?? "", /closing pass not run — gh api : HTTP 502/);
    panne = false;
    k.reveiller();
    await jusqua(() => gh.creees.length === 1);
  });
});

describe("every project of the station", () => {
  test("each project's runtime opens its own pass, on its own GitHub, at the closer's tick", async (t) => {
    const projets = ["brigade", "compta"].map((projet) => {
      const gh = fauxGitHub();
      const socle = demarrer({ repertoireEtat: repertoireTemporaire(t), projet, intervalleVeilleMs: 5, intervalleTickMs: 20, maintenant: () => MAINTENANT });
      const runtime = brancherCloserGithub(socle, { perimee: () => true, reglages: () => CALIBRE, github: gh.github, clone: fauxClone().clone, base: BASE, ecartMs: 0, maintenant: () => MAINTENANT, avertir: () => {} });
      t.after(() => runtime.arreter("test"));
      return { gh, runtime };
    });
    for (const { gh } of projets) await jusqua(() => gh.creees.length === 1);
    // Nothing of the closer in either log: only the runtime's own facts.
    for (const { runtime } of projets) assert.deepEqual([...new Set(runtime.journal.tout().map(({ type }) => type))].filter((type) => !type.startsWith("runtime.")), []);
  });
});

describe("in the kitchen, switch on", () => {
  test("the closer's pass runs on GitHub while the old closer stays stopped: no `claude`, nothing in the log", async (t) => {
    const sw = { allume: true };
    const k = cuisineFermee(t, { perimee: () => sw.allume });
    const gh = fauxGitHub();
    const clone: LectureDuClone = { ...lectureDuClone({ depot: { rapatrier: async () => git(k.clone, "fetch", "-q", "origin") }, clone: k.clone, base: BASE }), merges: async () => merges(MERGES_PER_PASS) };
    const runtime = brancherCloserGithub(k.runtime, { perimee: () => sw.allume, reglages: () => CALIBRE, github: gh.github, clone, base: BASE, ecartMs: 0, maintenant: () => MAINTENANT, avertir: () => {} });
    t.after(() => runtime.arreter("test"));
    const avant = k.journal.tout().length;
    await jusqua(() => gh.creees.length === 1);
    // The candidates are those the old closer would have been given, on the base the origin carries.
    assert.match(gh.creees[0]?.body ?? "", /- M1 — export `inutile` of `src\/libre\/outils\.ts:2`/);
    assert.deepEqual(k.closer.lancements(), []);
    assert.equal(k.types().some((type) => type.startsWith("closing.") && type !== "closing.configured"), false);
    assert.deepEqual([...new Set(k.journal.tout().slice(avant).map(({ type }) => type))].filter((type) => type !== "runtime.ticked"), []);
  });
});

describe("the pruning on a GitHub-only project", () => {
  test("the stale `cook/<n>-github` branches of the clone are deleted, locally and on the origin; a live one stays", async (t) => {
    const k = cuisineFermee(t);
    for (const branche of ["cook/14-github", "cook/15-github"]) {
      git(k.clone, "branch", branche, `origin/${BASE}`);
      git(k.clone, "push", "-q", "origin", branche);
    }
    const fermees: Record<number, boolean> = { 14: true, 15: false };
    const elagage = elagageDuClone({ clone: k.clone, github: { issue: async (numero) => ({ number: numero, title: "", labels: [], state: fermees[numero] ? "closed" : "open", createdAt: "", updatedAt: "", url: "" }) }, avertir: () => {} });
    assert.deepEqual(await elaguerBranchesPerimees(elagage), ["cook/14-github"]);
    assert.deepEqual(k.branchesDeLOrigine().filter((branche) => branche.endsWith("-github")), ["cook/15-github"]);
    assert.equal(git(k.clone, "branch", "--list", "cook/*-github", "--format=%(refname:short)"), "cook/15-github");
  });
});
