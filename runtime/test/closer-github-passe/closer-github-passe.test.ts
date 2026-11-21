// The closer on the GitHub-only path (#2361): this pass runs for each project,
// at the closer's cadence — reading and writing only GitHub and the clone. What
// must not happen is checked once a pass has run, never after a duration.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import { aOuvrir, brancherCloserGithub, estUneFermeture, lectureDuClone, MERGES_PER_PASS, ONE_PASS_A_DAY_MS, ticketDuMerge, type GitHubDuCloser, type LectureDuClone, type MergeDuClone, type OptionsCloserGithub } from "../../src/closer-github-passe/closer-github-passe.ts";
import { zoneDuCorps } from "../../src/brigade-github.ts";
import type { Runtime } from "../../src/runtime.ts";
import { demarrer } from "../../src/runtime.ts";
import { BASE, commiter, depotGit, ENV_GIT, git, jusqua, repertoireTemporaire } from "../outils.ts";

const MAINTENANT = new Date("2026-10-08T10:00:00.000Z");
const CALIBRE = { calibration: { model: "sonnet", effort: "low" }, removedLines: 20 };
const HEURE_MS = 3_600_000;

// `n` merges, an hour apart, the latest an hour ago, the most recent first: ticket `100 + n - 1` down to 100.
const merges = (n: number, depuis = MAINTENANT): MergeDuClone[] => Array.from({ length: n }, (_, i) => ({ at: new Date(depuis.getTime() - (i + 1) * HEURE_MS).toISOString(), ticket: 100 + n - 1 - i }));

type IssueDuFaux = { number: number; title: string; body: string; labels: string[]; association: string; state: "open" | "closed"; createdAt: string };

// A GitHub of the test: its issues, those the pass opened and closed.
function fauxGitHub(...issues: IssueDuFaux[]) {
  return fauxGitHubALHeure(() => MAINTENANT, ...issues);
}

function fauxGitHubALHeure(horloge: () => Date, ...issues: IssueDuFaux[]) {
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
      const issue: IssueDuFaux = { number: ++suivant, title: titre, body: corps, labels, association: "MEMBER", state: "open", createdAt: horloge().toISOString() };
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
function fauxClone(lus: MergeDuClone[] = merges(MERGES_PER_PASS)) {
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
        merges: lus.map(({ at }, i) => ({ sha: `m${i}`, at, ajoute: 30, retire: 10 })),
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

// Branches the pass on a runtime of its wakes only.
function brancher(t: TestContext, options: Partial<OptionsCloserGithub> & { github: GitHubDuCloser; clone: LectureDuClone }) {
  const avertissements: string[] = [];
  const { runtime, reveiller } = runtimeSansJournal();
  const branche = brancherCloserGithub(runtime, { reglages: () => CALIBRE, base: BASE, ecartMs: 0, maintenant: () => MAINTENANT, avertir: (m) => void avertissements.push(m), ...options });
  t.after(() => branche.arreter("test"));
  return { avertissements, reveiller };
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

const fermetures = (gh: { etat: IssueDuFaux[] }) => gh.etat.filter(({ body }) => estUneFermeture(body));

describe("the quality of the recent tickets, at the pass (#2678)", () => {
  test("the closing issue says the quality lines next to the times", async (t) => {
    const gh = fauxGitHub();
    const { clone } = fauxClone();
    const k = brancher(t, { github: gh.github, clone, qualite: () => ["- First try: 80% of the 10 recent tickets known to the log — at or over the project's threshold of 70%."] });
    k.reveiller();
    await jusqua(() => fermetures(gh).length === 1);
    assert.match(fermetures(gh)[0]!.body, /## Quality\n\n- First try: 80% of the 10 recent tickets/);
  });

  test("times a station still hands the pass are not read: no times section, no correction ticket, the quality kept", async (t) => {
    const gh = fauxGitHub();
    const { clone } = fauxClone();
    const fin = MAINTENANT.getTime();
    const temps = Array.from({ length: 6 }, (_, i) => {
      const at = new Date(fin - (6 - i) * HEURE_MS).toISOString();
      return { ticket: 200 + i, mergedAt: at, claimedAt: at, cuisson: i < 3 ? 400 : 1000, cuissonTests: i < 3 ? 100 : 700, attentePasse: 0, revue: 0, ci: 60, merge: 0 };
    });
    const k = brancher(t, { github: gh.github, clone, qualite: () => ["- First try: 80% of the 10 recent tickets."], ...({ temps: () => temps } as object) });
    k.reveiller();
    await jusqua(() => fermetures(gh).length === 1);
    const corps = fermetures(gh)[0]!.body;
    assert.doesNotMatch(corps, /## Times/);
    assert.match(corps, /## Quality\n\n- First try: 80% of the 10 recent tickets\./);
    assert.equal(gh.etat.filter(({ labels }) => labels.includes("correction")).length, 0);
  });

  test("a quality that cannot be read is said in the body and warned, and the pass still opens", async (t) => {
    const gh = fauxGitHub();
    const { clone } = fauxClone();
    const k = brancher(t, { github: gh.github, clone, qualite: () => { throw new Error("log closed"); } });
    k.reveiller();
    await jusqua(() => fermetures(gh).length === 1);
    assert.match(fermetures(gh)[0]!.body, /## Quality\n\nQuality not read: log closed\./);
    assert.ok(k.avertissements.includes("brigade : quality not read — log closed"));
  });
});

describe("the pass", () => {
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

  test("a status with blocked-on-human tickets that ask no question opens one defect naming the count, once", async (t) => {
    const gh = fauxGitHub();
    const { clone, appels } = fauxClone(merges(1));
    const k = brancher(t, { github: gh.github, clone, statut: () => ({ blockedWithoutQuestion: 2 }) });
    k.reveiller();
    await jusqua(() => gh.creees.length === 1);
    const [defaut] = gh.creees;
    assert.ok(defaut);
    assert.match(defaut.title, /\b2\b/);
    assert.deepEqual(defaut.labels, ["fire", "model:sonnet", "effort:low"]);
    // The next tick finds it open: no second defect.
    const avant = appels.merges;
    k.reveiller();
    await apresLesMerges(appels, avant);
    assert.equal(gh.creees.length, 1);
  });

  test("a defect already fixed is not reopened for the same count, but is for a higher one", async (t) => {
    const corrige: IssueDuFaux = { number: 90, title: "2 blocked-on-human without a question", body: "<!-- brigade:blocages-sans-question n=2 -->\n\nold", labels: ["fire"], association: "MEMBER", state: "closed", createdAt: "2026-10-01T00:00:00.000Z" };
    const gh = fauxGitHub(corrige);
    const { clone, appels } = fauxClone(merges(1));
    let compte = 2;
    const k = brancher(t, { github: gh.github, clone, statut: () => ({ blockedWithoutQuestion: compte }) });
    k.reveiller();
    await apresLesMerges(appels, 0);
    assert.equal(gh.creees.length, 0);
    compte = 3;
    const avant = appels.merges;
    k.reveiller();
    await jusqua(() => gh.creees.length === 1);
    assert.match(gh.creees[0]!.title, /\b3\b/);
    assert.ok(avant >= 1);
  });

  test("a clean status opens no defect, and a status that is not a count is said", async (t) => {
    const propre = fauxGitHub();
    const a = fauxClone(merges(1));
    const k = brancher(t, { github: propre.github, clone: a.clone, statut: () => ({ blockedWithoutQuestion: 0 }) });
    k.reveiller();
    await apresLesMerges(a.appels, 0);
    assert.equal(propre.creees.length, 0);
    const malforme = fauxGitHub();
    const b = fauxClone(merges(1));
    const m = brancher(t, { github: malforme.github, clone: b.clone, statut: () => ({}) as never });
    m.reveiller();
    await jusqua(() => m.avertissements.some((texte) => /not handled — .*not a count/.test(texte)));
    assert.equal(malforme.creees.length, 0);
  });

  test("a wake from the log is not its cadence", async (t) => {
    const gh = fauxGitHub();
    const f = fauxClone();
    const k = brancher(t, { github: gh.github, clone: f.clone });
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
      const runtime = brancherCloserGithub(socle, { reglages: () => CALIBRE, github: gh.github, clone: fauxClone().clone, base: BASE, ecartMs: 0, maintenant: () => MAINTENANT, avertir: () => {} });
      t.after(() => runtime.arreter("test"));
      return { gh, runtime };
    });
    for (const { gh } of projets) await jusqua(() => gh.creees.length === 1);
    // Nothing of the closer in either log: only the runtime's own facts.
    for (const { runtime } of projets) assert.deepEqual([...new Set(runtime.journal.tout().map(({ type }) => type))].filter((type) => !type.startsWith("runtime.")), []);
  });
});

describe("the merges the clone says", () => {
  test("every first-parent commit of the base is a merge, a squash too; only a merge commit names its ticket", async (t) => {
    const { clone } = depotGit(t);
    git(clone, "checkout", "-q", "-b", "cook/42-github");
    commiter(clone, "livraison.txt");
    git(clone, "checkout", "-q", BASE);
    git(clone, "merge", "-q", "--no-ff", "-m", "Merge pull request #7 from acme/cook/42-github", "cook/42-github");
    commiter(clone, "squash.txt");
    git(clone, "push", "-q", "origin", BASE);
    git(clone, "update-ref", `refs/remotes/origin/${BASE}`, `${BASE}~2`);
    const lus = await lectureDuClone({ depot: { rapatrier: async () => git(clone, "fetch", "-q", "origin") }, clone, base: BASE, env: ENV_GIT }).merges();
    // The squash, the merge, then the base's first commit: the delivery's own commit is not a first parent.
    assert.deepEqual(lus.map(({ ticket }) => ticket), [null, 42, null]);
    assert.ok(lus.every(({ at }) => !Number.isNaN(Date.parse(at))));
  });
});

test("a merge says its ticket by its branch, and none when its subject carries none", () => {
  assert.equal(ticketDuMerge("Merge pull request #2365 from benomite/cook/2353-github"), 2353);
  assert.equal(ticketDuMerge("Merge branch 'main' into x"), null);
});
