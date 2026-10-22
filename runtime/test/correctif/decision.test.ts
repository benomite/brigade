// Le « oui » ou le « non » du chef sur une correction proposée. Sans geste,
// rien ne part. « Oui » : une branche qui porte exactement le diff proposé, une
// PR, et la pass qui la juge et la merge comme une livraison — sur un vrai
// dépôt git, un GitHub de test, les fausses gates et le faux reviewer.
// « Non » : la carte quitte la file, et la même cause ne revient qu'avec des
// échecs neufs.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { test, type TestContext } from "../support/posix.ts";
import { avecRail } from "../../src/alimenter.ts";
import { cartesDeCorrection } from "../../src/correctif/cartes.ts";
import { decider, decisionDe, NON, OUI } from "../../src/correctif/decision.ts";
import { detecter } from "../../src/correctif/detecter.ts";
import { brancherCorrectif, estUneLivraisonDeCorrection } from "../../src/correctif/livrer.ts";
import type { Proposee } from "../../src/correctif/proposer.ts";
import type { ReglagesDuCorrectif } from "../../src/correctif/reglages.ts";
import { ouvrirDepot } from "../../src/depot.ts";
import { brancherGardeFous } from "../../src/garde-fous.ts";
import { ouvrirJournal, type Journal } from "../../src/journal.ts";
import { brancherPass } from "../../src/pass.ts";
import { demarrer } from "../../src/runtime.ts";
import { BAIL_MS, CALIBRAGE_DU_REVIEWER, chef, fauxGitHub, MACHINE_CALME, montre, REGLAGES } from "../aides/cuisine.ts";
import { ecrireHistoire } from "../closing/history.ts";
import { BASE, DEPOT, depotGit, ENV_GIT, FAUX_CLAUDE, git, horloge, JOUR_HORLOGE, jusqua, lancementsDuFauxClaude, repertoireTemporaire } from "../outils.ts";

const PROJET = "brigade";
const FAUSSES_GATES = join(import.meta.dirname, "../aides/fausses-gates.sh");
const REGLAGES_DU_CORRECTIF: ReglagesDuCorrectif = { seuil: 3, fenetre: 20 };

// Les consignes du projet, et ce qui n'en est pas. Ses gates sont la doublure.
const FICHIERS = {
  "CLAUDE.md": "# Projet\n\n- **Gates** : `.claude/brigade/gates.sh <WT>`\n",
  "docs/equipe.md": "# L'équipe\n\nUn ticket se lit en entier.\n",
  "src/app.ts": "export const app = 1;\n",
};
const DIFFS = {
  claude: ["--- a/CLAUDE.md", "+++ b/CLAUDE.md", "@@ -1,3 +1,4 @@", " # Projet", " ", " - **Gates** : `.claude/brigade/gates.sh <WT>`", "+- **Critères** : un ticket incomplet se dit dans le compte-rendu, il ne se devine pas.", ""].join("\n"),
  equipe: ["diff --git a/docs/equipe.md b/docs/equipe.md", "--- a/docs/equipe.md", "+++ b/docs/equipe.md", "@@ -1,3 +1,4 @@", " # L'équipe", " ", " Un ticket se lit en entier.", "+Ses critères aussi, avant d'écrire.", ""].join("\n"),
};

let runs = 0;
// Un essai raté de `ticket` pour un ticket incomplet, comme le journal le dit.
function rater(journal: Journal, ticket: number): void {
  const noter = (fait: object) => journal.ajouter({ project: PROJET, ticket, author: "runtime", ...fait } as never);
  if (!journal.duTicket(ticket).some((e) => e.type === "ticket.taken")) noter({ type: "ticket.taken", payload: { station: "box/claude", leaseUntil: JOUR_HORLOGE } });
  const run = `run-${++runs}`;
  noter({ type: "cook.launched", payload: { run, limits: { turns: 100, durationMs: 3_600_000, tokens: 1_000_000, idleMs: 60_000 }, stream: `runs/${run}.jsonl`, station: "box/claude" } });
  noter({ type: "cook.reported", payload: { run, ending: "failed", reason: `ticket incomplet : le critère ${ticket} contredit le précédent`, summary: null, branch: "x", pr: null } });
  noter({ type: "cook.exited", payload: { run, outcome: "failed", code: 1, signal: null, turns: 1, tokens: 1, durationMs: 1 } });
}

// La correction proposée pour la candidate, telle que `proposer` la pose.
function proposer(journal: Journal, candidat: number, diff: string, files: string[], base: string): Proposee {
  const pose = journal.ajouter({
    project: PROJET,
    ticket: null,
    author: "runtime",
    type: "correction.proposed",
    payload: { candidate: candidat, cause: "criteres", title: "contradictory criteria or incomplete ticket", tickets: [11, 12, 13], run: `correctif-${candidat}-0000`, tokens: 4321, reason: "Les cooks devinaient.", diff, files, base },
  });
  assert.ok(pose);
  return pose as Proposee;
}

// Une cuisine : rail, garde-fous, pass, et la livraison des corrections, sur un
// vrai dépôt dont l'origine porte le projet. Trois tickets ratés pour la même
// cause, et sa candidate.
function cuisine(t: TestContext) {
  let aArreter: { arreter(signal: string): void } | undefined;
  t.after(() => aArreter?.arreter("test"));
  const repertoire = repertoireTemporaire(t);
  const { origine, clone } = depotGit(t);
  ecrireHistoire(clone, [{ commit: { ...FICHIERS, ".claude/brigade/gates.sh": { lien: FAUSSES_GATES } } }]);
  git(clone, "push", "-q", "origin", `refs/remotes/origin/${BASE}:refs/heads/${BASE}`);
  const temoin = repertoireTemporaire(t);
  const fichierGates = join(repertoire, "gates.txt");
  const env = { ...ENV_GIT, FAUX_CLAUDE: "relit-vert", FAUX_CLAUDE_TEMOIN: temoin, FAUSSES_GATES: fichierGates };
  const gh = fauxGitHub();
  const heure = montre();
  const depot = ouvrirDepot({ clone, base: BASE, worktrees: join(repertoire, "worktrees"), env: ENV_GIT });
  const socle = demarrer({ repertoireEtat: repertoire, projet: PROJET, intervalleVeilleMs: 5, intervalleTickMs: 20, maintenant: heure.maintenant });
  const garde = brancherGardeFous(REGLAGES, avecRail(socle, { depot: DEPOT, dureeBailMs: BAIL_MS, gh: "", github: gh.github, maintenant: heure.maintenant }));
  const pass = brancherPass(garde, {
    repertoireEtat: repertoire,
    depot,
    github: gh.github,
    base: BASE,
    reviewer: { calibrage: CALIBRAGE_DU_REVIEWER },
    depotGitHub: DEPOT,
    bin: FAUX_CLAUDE,
    env,
    delaiGatesMs: 60_000,
    attenteCiMs: 1_800_000,
    machine: () => MACHINE_CALME,
    maintenant: heure.maintenant,
  });
  const avertissements: string[] = [];
  const brancher = () => {
    const runtime = brancherCorrectif(pass, { depot, github: gh.github, base: BASE, env: ENV_GIT, avertir: (texte) => void avertissements.push(texte) });
    aArreter = runtime;
    return runtime;
  };
  const { journal } = pass;
  for (const ticket of [11, 12, 13]) rater(journal, ticket);
  const [candidat] = detecter(journal, PROJET, REGLAGES_DU_CORRECTIF);
  assert.ok(candidat);
  // Le geste du chef, depuis son propre process.
  const trancher = (proposition: number, reponse: typeof OUI | typeof NON) => {
    const sien = ouvrirJournal(repertoire);
    try {
      return decider(sien, PROJET, proposition, reponse);
    } finally {
      sien.fermer();
    }
  };
  const types = (ticket?: number) => (ticket === undefined ? journal.tout() : journal.duTicket(ticket)).map((e) => e.type);
  return {
    repertoire,
    origine,
    clone,
    gh,
    journal,
    candidat,
    brancher,
    trancher,
    types,
    avertissements,
    base: git(origine, "rev-parse", `refs/heads/${BASE}`),
    relectures: () => lancementsDuFauxClaude(temoin).filter((lance) => lance.args.includes("--tools")),
    branchesDeLOrigine: () => git(origine, "for-each-ref", "--format=%(refname:short)", "refs/heads").split("\n").filter(Boolean).sort(),
    livrees: () => journal.duType("correction.delivered", 100).map(({ payload }) => payload),
  };
}

// L'arbre qu'on obtient en appliquant le diff au commit `base`, sans rien toucher du clone.
function arbreAvec(t: TestContext, clone: string, base: string, diff: string): string {
  const env = { ...ENV_GIT, GIT_INDEX_FILE: join(repertoireTemporaire(t), "index") };
  const gitIci = (args: string[], input?: string) => execFileSync("git", args, { cwd: clone, env, input, encoding: "utf8" }).trim();
  gitIci(["read-tree", base]);
  gitIci(["apply", "--cached"], diff);
  return gitIci(["write-tree"]);
}

test("une proposition que personne ne tranche ne fait rien naître ; « oui » sur une autre en fait une PR qui porte exactement son diff, que la pass juge et merge comme une livraison", async (t) => {
  const { repertoire, origine, clone, gh, journal, candidat, brancher, trancher, types, base, relectures, branchesDeLOrigine, livrees } = cuisine(t);
  chef(repertoire, "grant.activated");
  // La plus ancienne, que personne ne tranche : c'est elle qui partirait la première.
  const enAttente = proposer(journal, candidat.seq, DIFFS.equipe, ["docs/equipe.md"], base);
  const acceptee = proposer(journal, candidat.seq, `${DIFFS.claude}${DIFFS.equipe}`, ["CLAUDE.md", "docs/equipe.md"], base);
  brancher();

  assert.deepEqual(trancher(acceptee.seq, OUI), { issue: "tranchee", fait: decisionDe(journal, acceptee.seq) });
  await jusqua(() => livrees().length === 1);
  const [livree] = livrees();
  assert.ok(livree);
  const pr = livree.number;
  await jusqua(() => types(pr).includes("merge.done"));

  // Rien n'est né de celle qui attend : ni branche, ni PR, ni livraison — et sa carte est toujours dans la file.
  assert.equal(journal.duType("correction.started", 10).length, 1);
  assert.ok(journal.duType("correction.started", 10).every(({ payload }) => payload.proposal === acceptee.seq));
  assert.equal(gh.prs.length, 1);
  assert.deepEqual(branchesDeLOrigine(), [livree.branch, BASE].sort());
  assert.deepEqual(
    cartesDeCorrection(journal).map(({ proposition }) => proposition),
    [enAttente.seq],
  );

  // La PR porte exactement le diff proposé : un commit, posé sur la base où il a été vérifié, et l'arbre que donne ce diff.
  assert.equal(livree.proposal, acceptee.seq);
  assert.ok(estUneLivraisonDeCorrection(livree.run));
  assert.equal(livree.sha, git(origine, "rev-parse", `refs/heads/${livree.branch}`));
  assert.equal(git(origine, "rev-parse", `${livree.sha}^`), base);
  assert.equal(git(origine, "rev-parse", `${livree.sha}^{tree}`), arbreAvec(t, clone, base, acceptee.payload.diff));
  const [ouverte] = gh.prs;
  assert.deepEqual([ouverte?.branche, ouverte?.base, ouverte?.titre], [livree.branch, BASE, "Correction des consignes — contradictory criteria or incomplete ticket"]);
  assert.match(ouverte?.corps ?? "", /`criteres`\), sur #11, #12, #13/);
  assert.match(ouverte?.corps ?? "", /\+- \*\*Critères\*\* : un ticket incomplet se dit/);

  // Le chemin de toute livraison, sans un pas de moins : entrée en pass, relue, jugée, mergée sous le grant.
  assert.deepEqual(
    types(pr).filter((type) => type !== "pass.started"),
    ["pass.entered", "gates.ran", "pass.reviewed", "pass.judged", "grant.used", "merge.done"],
  );
  assert.deepEqual(journal.duTicket(pr).find((e) => e.type === "pass.entered")?.payload, { run: livree.run, branch: livree.branch, pr: livree.pr, number: pr });
  const jugement = journal.duTicket(pr).find((e) => e.type === "pass.judged")?.payload as { sha: string; base: string; verdict: string };
  assert.deepEqual([jugement.sha, jugement.base, jugement.verdict], [livree.sha, base, "green"]);
  assert.deepEqual(gh.merges, [[pr, livree.sha]]);
  // Relue comme une correction des consignes, pas comme le retrait d'un closer.
  const consigne = relectures()[0]?.args[1] ?? "";
  assert.match(consigne, /Tu relis le diff de la PR #\d+ : une correction des consignes du projet/);
  assert.doesNotMatch(consigne, /closer/);
  // Rien n'est poussé sur la branche d'intégration.
  assert.equal(git(origine, "rev-parse", `refs/heads/${BASE}`), base);
});

test("« oui » deux fois, ou « oui » puis « non » : un seul geste compte, et une seule PR part", async (t) => {
  const { gh, journal, candidat, brancher, trancher, base, types, livrees } = cuisine(t);
  const proposee = proposer(journal, candidat.seq, DIFFS.claude, ["CLAUDE.md"], base);
  const premier = trancher(proposee.seq, OUI);
  assert.ok(premier.issue === "tranchee");
  brancher();
  const deja = { issue: "deja", fait: premier.fait };
  assert.deepEqual(trancher(proposee.seq, OUI), deja);
  assert.deepEqual(trancher(proposee.seq, NON), deja);
  await jusqua(() => livrees().length === 1);
  const pr = livrees()[0]?.number ?? 0;
  // La pass a jugé la PR : bien des réveils ont passé depuis le « oui ».
  await jusqua(() => types(pr).includes("pass.judged"));
  assert.equal(gh.prs.length, 1);
  assert.equal(journal.duType("correction.accepted", 10).length, 1);
  assert.equal(journal.duType("correction.refused", 10).length, 0);
  assert.equal(journal.duType("correction.started", 10).length, 1);
  // Une proposition que rien ne montre ne se tranche pas.
  assert.deepEqual(trancher(999_999, OUI), { issue: "inconnue" });
});

test("une livraison morte avec le runtime après avoir ouvert sa PR n'en ouvre pas une seconde : sa PR est reprise et entre en pass", async (t) => {
  const { gh, journal, candidat, brancher, trancher, base, types, livrees } = cuisine(t);
  const proposee = proposer(journal, candidat.seq, DIFFS.claude, ["CLAUDE.md"], base);
  trancher(proposee.seq, OUI);
  // La vie d'avant : partie, sa PR ouverte, et rien de conclu.
  const branche = "cook/correction-mort-0000";
  journal.ajouter({ project: PROJET, ticket: null, author: "runtime", type: "correction.started", payload: { proposal: proposee.seq, run: "correction-mort-0000", branch: branche } });
  const url = await gh.github.ouvrirPR({ branche, base: BASE, titre: "Correction des consignes", corps: "" });
  brancher();
  await jusqua(() => livrees().length === 1);
  assert.deepEqual(livrees()[0], { proposal: proposee.seq, run: "correction-mort-0000", branch: branche, pr: url, number: 101, sha: `tete-de-${branche}` });
  await jusqua(() => types(101).includes("pass.entered"));
  assert.equal(gh.prs.length, 1);
});

test("un diff qui ne se commite plus n'ouvre aucune PR : la correction est dite non livrée, et pourquoi", async (t) => {
  const { gh, journal, candidat, brancher, trancher, avertissements, branchesDeLOrigine } = cuisine(t);
  const proposee = proposer(journal, candidat.seq, DIFFS.claude, ["CLAUDE.md"], "0".repeat(40));
  trancher(proposee.seq, OUI);
  brancher();
  await jusqua(() => journal.duType("correction.undelivered", 10).length === 1);
  const [nonLivree] = journal.duType("correction.undelivered", 10);
  assert.match(nonLivree?.payload.reason ?? "", /^le diff ne se commite pas sur `0000000` — /);
  assert.equal(gh.prs.length, 0);
  assert.deepEqual(branchesDeLOrigine(), [BASE]);
  assert.match(avertissements.join("\n"), /n'est pas partie/);
});

// Le « non » et le détecteur : sans runtime, sur le journal seul.
function journalDeTest(t: TestContext): Journal {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge() });
  t.after(() => journal.fermer());
  return journal;
}

test("« non » retire la carte ; les mêmes échecs relevés à nouveau n'en refont pas une, un échec neuf de la même cause si — le seuil valant toujours", (t) => {
  const journal = journalDeTest(t);
  for (const ticket of [11, 12, 13]) rater(journal, ticket);
  const [candidat] = detecter(journal, PROJET, REGLAGES_DU_CORRECTIF);
  assert.ok(candidat);
  const proposee = proposer(journal, candidat.seq, DIFFS.claude, ["CLAUDE.md"], "base");
  assert.deepEqual(
    cartesDeCorrection(journal).map(({ proposition }) => proposition),
    [proposee.seq],
  );

  // Sans geste, la cause ne se relève pas une seconde fois.
  assert.deepEqual(detecter(journal, PROJET, REGLAGES_DU_CORRECTIF), []);
  const non = decider(journal, PROJET, proposee.seq, NON);
  assert.ok(non.issue === "tranchee");
  assert.deepEqual(non.fait.payload, { proposal: proposee.seq, candidate: candidat.seq, cause: "criteres", tickets: [11, 12, 13], runs: journal.duType("cook.launched", 10).map(({ payload }) => payload.run) });
  assert.deepEqual(cartesDeCorrection(journal), []);

  // Les mêmes échecs : rien.
  assert.deepEqual(detecter(journal, PROJET, REGLAGES_DU_CORRECTIF), []);
  assert.deepEqual(detecter(journal, PROJET, REGLAGES_DU_CORRECTIF), []);
  assert.equal(journal.duType("correction.candidate", 10).length, 1);

  // Un échec neuf, sur un ticket déjà compté : la même cause revient — mais pas sous un seuil qu'elle n'atteint plus.
  rater(journal, 12);
  assert.deepEqual(detecter(journal, PROJET, { seuil: 4, fenetre: 20 }), []);
  const [revenue] = detecter(journal, PROJET, REGLAGES_DU_CORRECTIF);
  assert.deepEqual(revenue?.payload, { cause: "criteres", title: "contradictory criteria or incomplete ticket", tickets: [11, 12, 13], failures: 4, threshold: 3, window: 20 });
  // Relevée, elle ne l'est qu'une fois.
  assert.deepEqual(detecter(journal, PROJET, REGLAGES_DU_CORRECTIF), []);

  // Un second « non », et un échec neuf ailleurs : elle revient encore.
  const seconde = proposer(journal, revenue?.seq ?? 0, DIFFS.equipe, ["docs/equipe.md"], "base");
  decider(journal, PROJET, seconde.seq, NON);
  assert.deepEqual(detecter(journal, PROJET, REGLAGES_DU_CORRECTIF), []);
  rater(journal, 14);
  assert.deepEqual(
    detecter(journal, PROJET, REGLAGES_DU_CORRECTIF).map(({ payload }) => payload.tickets),
    [[11, 12, 13, 14]],
  );
});

test("« oui » retire aussi la carte de la file : la correction part, il n'y a plus rien à trancher", (t) => {
  const journal = journalDeTest(t);
  for (const ticket of [11, 12, 13]) rater(journal, ticket);
  const [candidat] = detecter(journal, PROJET, REGLAGES_DU_CORRECTIF);
  const proposee = proposer(journal, candidat?.seq ?? 0, DIFFS.claude, ["CLAUDE.md"], "base");
  assert.equal(decider(journal, PROJET, proposee.seq, OUI).issue, "tranchee");
  assert.deepEqual(cartesDeCorrection(journal), []);
  // Accepté, ce n'est pas un refus : la cause ne revient pas sur un échec neuf.
  rater(journal, 14);
  assert.deepEqual(detecter(journal, PROJET, REGLAGES_DU_CORRECTIF), []);
});
