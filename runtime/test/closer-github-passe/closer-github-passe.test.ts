// The closer on the GitHub-only path (#2361): this pass runs for each project,
// at the closer's cadence — reading and writing only GitHub and the clone. What
// must not happen is checked once a pass has run, never after a duration.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import { aOuvrir, brancherCloserGithub, estUneFermeture, lectureDuClone, MERGES_PER_PASS, ONE_PASS_A_DAY_MS, type GitHubDuCloser, type LectureDuClone, type OptionsCloserGithub } from "../../src/closer-github-passe/closer-github-passe.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { coutsDesFlux, lancementsDuFlux, noterDeriveGithub, ticketDuMerge, type DeriveGithub, type MergeDuClone } from "../../src/closer-github-passe/derive-github.ts";
import { noterGitHubSeul } from "../../src/github-seul-etat.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { SANS_SEUIL } from "../../src/mesures.ts";
import type { CookMesure } from "../../src/projections/measures.ts";
import type { TempsTicket } from "../../src/temps-ticket/ligne-status.ts";
import { photoDuProjet } from "../../src/status.ts";
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
    ecrireCorps: async (numero, corps) => {
      const issue = etat.find(({ number }) => number === numero);
      if (issue) issue.body = corps;
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

// A merged ticket's record: the cook's work (`tests` of it the tests), then the CI, merged at `mergedAt`.
const enregistrement = (ticket: number, mergedAt: Date, cuisson: number, tests: number, ci: number): TempsTicket => ({ ticket, mergedAt: mergedAt.toISOString(), claimedAt: mergedAt.toISOString(), cuisson, cuissonTests: tests, attentePasse: 0, revue: 0, ci, merge: 0 });

// Six tickets ending at `fin`, an hour apart: the first three with quick tests, the last three with slow ones.
const tempsQuiDerivent = (fin: Date, premier = 200): TempsTicket[] =>
  Array.from({ length: 6 }, (_, i) => enregistrement(premier + i, new Date(fin.getTime() - (6 - i) * HEURE_MS), i < 3 ? 400 : 1000, i < 3 ? 100 : 700, 60));
const tempsStables = (fin: Date): TempsTicket[] => Array.from({ length: 6 }, (_, i) => enregistrement(200 + i, new Date(fin.getTime() - (6 - i) * HEURE_MS), 400, 100, 60));

const fermetures = (gh: { etat: IssueDuFaux[] }) => gh.etat.filter(({ body }) => estUneFermeture(body));
const corrections = (gh: { etat: IssueDuFaux[] }) => gh.etat.filter(({ labels }) => labels.includes("correction"));

describe("the times of the tickets, at the pass", () => {
  test("drifting times: the closing issue names the cause and its numbers, and one correction ticket is opened", async (t) => {
    const gh = fauxGitHub();
    const { clone } = fauxClone();
    const k = brancher(t, { github: gh.github, clone, temps: () => tempsQuiDerivent(MAINTENANT) });
    k.reveiller();
    await jusqua(() => fermetures(gh).length === 1);
    const [fermeture] = fermetures(gh);
    const [correction] = corrections(gh);
    assert.ok(fermeture && correction && corrections(gh).length === 1);
    assert.match(fermeture.body, /## Times\n\nThe tests got slow: a ticket's tests went from 1 min 40 s to 11 min 40 s/);
    assert.match(fermeture.body, new RegExp(`Correction ticket #${correction.number} opened\\.`));
    assert.match(correction.body, /The tests got slow/);
    assert.equal(correction.state, "open");
    // The candidates, the removal cap and the drift line are where they were.
    assert.match(fermeture.body, /- M1 — export `inutile`/);
    assert.match(fermeture.body, /No more than 20 lines removed/);
    assert.match(fermeture.body, /## Drift\n\n.*\n\n- last 20 merges/);
  });

  test("stable times: the body says so, and no correction ticket is opened or changed", async (t) => {
    const ouverte: IssueDuFaux = { number: 77, title: "Correct the time drift of brigade: slow-tests", body: "<!-- brigade:correction project=brigade -->\nold", labels: ["correction"], association: "MEMBER", state: "open", createdAt: "2026-10-01T00:00:00.000Z" };
    const gh = fauxGitHub(ouverte);
    const { clone } = fauxClone();
    const k = brancher(t, { github: gh.github, clone, temps: () => tempsStables(MAINTENANT) });
    k.reveiller();
    await jusqua(() => fermetures(gh).length === 1);
    assert.match(fermetures(gh)[0]!.body, /## Times\n\nTimes stable: 6 tickets measured since the last pass/);
    assert.equal(corrections(gh).length, 1);
    assert.equal(ouverte.body, "<!-- brigade:correction project=brigade -->\nold");
  });

  test("only the times since the previous pass are read", async (t) => {
    const precedente = new Date(MAINTENANT.getTime() - 2 * ONE_PASS_A_DAY_MS);
    const gh = fauxGitHub(passee(40, precedente.toISOString()));
    const { clone } = fauxClone();
    // The drift is all before the previous pass; since it, the times are stable.
    const k = brancher(t, { github: gh.github, clone, temps: () => [...tempsQuiDerivent(precedente, 100), ...tempsStables(MAINTENANT)] });
    k.reveiller();
    await jusqua(() => fermetures(gh).length === 2);
    assert.match(fermetures(gh)[1]!.body, /Times stable: 6 tickets measured since the last pass/);
    assert.equal(corrections(gh).length, 0);
  });

  test("two passes in a row with the same drift leave exactly one open correction ticket", async (t) => {
    let maintenant = MAINTENANT;
    const gh = fauxGitHubALHeure(() => maintenant);
    const { clone } = fauxClone();
    const le = new Date(MAINTENANT.getTime() + 2 * ONE_PASS_A_DAY_MS);
    const k = brancher(t, { github: gh.github, clone, maintenant: () => maintenant, temps: () => [...tempsQuiDerivent(MAINTENANT), ...tempsQuiDerivent(le, 300)].filter(({ mergedAt }) => Date.parse(mergedAt ?? "") <= maintenant.getTime()) });
    k.reveiller();
    await jusqua(() => fermetures(gh).length === 1);
    // The first pass is served, two days go by.
    fermetures(gh)[0]!.state = "closed";
    maintenant = le;
    // The merges since the first pass, for the second.
    const suivantes = merges(MERGES_PER_PASS, le);
    (clone as { merges: () => Promise<MergeDuClone[]> }).merges = async () => suivantes;
    k.reveiller();
    await jusqua(() => fermetures(gh).length === 2);
    const [premiere] = corrections(gh);
    assert.equal(corrections(gh).length, 1);
    assert.equal(premiere!.state, "open");
    assert.match(premiere!.body, /closer finding/i);
    assert.equal(premiere!.body.match(/brigade:closer-finding/g)?.length, 2);
    assert.match(fermetures(gh)[1]!.body, new RegExp(`Correction ticket #${premiere!.number} completed with this finding\\.`));
  });

  test("a project whose times are not given reads none: no section", async (t) => {
    const gh = fauxGitHub();
    const { clone } = fauxClone();
    const k = brancher(t, { github: gh.github, clone });
    k.reveiller();
    await jusqua(() => fermetures(gh).length === 1);
    assert.doesNotMatch(fermetures(gh)[0]!.body, /## Times/);
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

// The stream a GitHub-only cook leaves, launch after launch: each spends `tokens`
// (its message read twice, the last usage counting, cache reads not), and
// delivers or not.
const flux = (...lancements: Array<{ tokens: number; livre: boolean }>) =>
  lancements
    .flatMap(({ tokens, livre }, i) => [
      { type: "system", subtype: "init", model: "claude-opus-5-5" },
      { type: "assistant", message: { id: `m${i}`, usage: { input_tokens: tokens / 2, output_tokens: 0 } } },
      { type: "assistant", message: { id: `m${i}`, usage: { input_tokens: tokens / 2, output_tokens: tokens / 2, cache_read_input_tokens: 99_999 } } },
      { type: "result", subtype: "success", is_error: !livre },
    ])
    .map((evenement) => JSON.stringify(evenement))
    .join("\n");

const cook = (tokens: number, delivered: boolean): CookMesure => ({ calibration: "claude-opus-5-5", turns: 1, durationMs: null, tokens, delivered });
const SANS_CLOSER = () => ({ calibration: null, removedLines: 20 });

describe("the drift on the GitHub-only path", () => {
  test("a stream says what each launch of a ticket spent, and whether it delivered; a merge, its ticket", () => {
    assert.deepEqual(lancementsDuFlux(`${flux({ tokens: 900, livre: false }, { tokens: 700, livre: true })}\n{"type":"assistant"`), [cook(900, false), cook(700, true)]);
    assert.deepEqual(lancementsDuFlux(""), []);
    assert.equal(ticketDuMerge("Merge pull request #2365 from benomite/cook/2353-github"), 2353);
    assert.equal(ticketDuMerge("Merge branch 'main' into x"), null);
  });

  test("at a tick, the drift of the merges since the last pass is read against the chef's thresholds, closer set or not; a crossing is said once", async (t) => {
    // The last pass, five and a half hours ago: the 5 merges since count (tickets 119 to 115).
    const gh = fauxGitHub(passee(40, new Date(MAINTENANT.getTime() - 5.5 * HEURE_MS).toISOString()));
    const f = fauxClone();
    const couts: Record<number, CookMesure[]> = { 119: [cook(800, true)], 117: [cook(900, false), cook(700, true)], 101: [cook(9_000, true)] };
    const notes: DeriveGithub[] = [];
    const seuils = () => ({ ...SANS_SEUIL, merges: 5, ticketTokens: 1_000, lostTokens: 800 });
    const k = brancher(t, { github: gh.github, clone: f.clone, reglages: SANS_CLOSER, derive: { seuils, couts: (ticket) => couts[ticket] ?? [], noter: (derive) => void notes.push(derive) } });
    k.reveiller();
    await jusqua(() => notes.length === 1);
    assert.deepEqual(notes[0], {
      at: MAINTENANT.toISOString(),
      franchis: [
        { measure: "merges", observed: 5, limit: 5 },
        { measure: "tokens_ticket", observed: 1_600, limit: 1_000 },
        { measure: "tokens_perdus", observed: 900, limit: 800 },
      ],
    });
    assert.deepEqual(k.avertissements, [
      "brigade : drift — 5 merges since the last closing for a threshold of 5",
      "brigade : drift — tokens of the costliest ticket of the last 10 merges 1,600 for a threshold of 1,000",
      "brigade : drift — tokens lost over the last 10 merges 900 for a threshold of 800",
    ]);
    k.reveiller();
    await jusqua(() => notes.length === 2);
    assert.equal(k.avertissements.length, 3);
    // Read, nothing opened: the closer is not set.
    assert.deepEqual(gh.creees, []);
  });

  test("status reads its drift line from the closer's pass while the GitHub-only station runs, from the GitHub-only cooks' streams", async (t) => {
    const repertoire = repertoireTemporaire(t);
    const journal = ouvrirJournal(repertoire, { maintenant: () => MAINTENANT });
    journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
    journal.fermer();
    noterGitHubSeul(repertoire, { etat: "accepted" }, MAINTENANT);
    mkdirSync(join(repertoire, "github-seul"));
    writeFileSync(join(repertoire, "github-seul", "119-github.flux.jsonl"), flux({ tokens: 1_500, livre: true }));
    const drift = () => photoDuProjet({ BRIGADE_STATE_DIR: repertoire }, { maintenant: MAINTENANT }).filter((ligne) => ligne.startsWith("drift"));
    assert.deepEqual(drift(), []);

    const k = brancher(t, {
      github: fauxGitHub().github,
      clone: fauxClone().clone,
      reglages: SANS_CLOSER,
      derive: { seuils: () => ({ ...SANS_SEUIL, ticketTokens: 1_000 }), couts: coutsDesFlux(join(repertoire, "github-seul")), noter: (derive) => noterDeriveGithub(repertoire, derive) },
    });
    k.reveiller();
    await jusqua(() => drift().length === 1);
    assert.match(drift()[0] ?? "", /^drift +tokens of the costliest ticket of the last 10 merges 1,500 for a threshold of 1,000 — `/);
    // Refused, the station cooks nothing for the project, and no drift is said from its streams.
    noterGitHubSeul(repertoire, { etat: "refused", reason: "x" }, MAINTENANT);
    assert.deepEqual(drift(), []);
  });
});
