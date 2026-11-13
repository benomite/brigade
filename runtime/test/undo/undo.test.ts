// Annuler un ticket servi d'un clic (#3274) : la commande `undo` jouée par son
// `principal`, sur le faux GitHub de la pass, auquel s'ajoute l'API Git que le
// revert demande. Le revert propre est ensuite pris par la pass du chemin
// GitHub seul (`stationGitHub`), jugé et mergé comme toute livraison ; le
// revert en conflit ne laisse aucune PR, et dépose un ticket pour la cuisine.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Sortie } from "../../src/appel.ts";
import { brancheDuTicket } from "../../src/brigade-github.ts";
import { LABEL_IN_PASS } from "../../src/github-etat/etats.ts";
import type { IssueOuverte, PR as PRDeGitHub } from "../../src/github.ts";
import { principal } from "../../src/undo/commande.ts";
import { brancheDEssai, CALIBRAGE_A_LA_MAIN, CALIBRAGE_DU_REVERT, type GitHubDeLAnnulation } from "../../src/undo/undo.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

const SERVI = 21;
const PR = 121;
const MERGE = "a".repeat(40);
const AVANT = "b".repeat(40);
const TETE_DE_LA_PR = "c".repeat(40);

// Le ticket #21, servi par la PR #121 que la pass a mergée : son merge, fils de
// la base d'avant et de la tête de la PR.
function servi() {
  const faux = new FauxGitHub();
  faux.feu(SERVI, CALIBRE);
  faux.ticket(SERVI).state = "closed";
  faux.prs.push({ number: PR, issue: SERVI, branche: brancheDuTicket(SERVI), sha: TETE_DE_LA_PR, state: "closed", merged: true, enRetard: false, mergeePar: "A", fichiers: ["app/src/x.ts"] });
  faux.teteDeLaBase = "d".repeat(40);
  return faux;
}

type Git = {
  commits: Map<string, { arbre: string; parents: string[] }>;
  branches: Map<string, string>;
  crees: Array<{ message: string; arbre: string; parents: string[] }>;
  fusions: Array<{ branche: string; sha: string }>;
  supprimees: string[];
};

// Le client de l'annulation sur le faux : ce que la pass lit de lui, plus l'API
// Git. `conflit` : GitHub ne fusionne pas le revert dans la base.
function client(faux: FauxGitHub, { conflit = false, pannes = {} }: { conflit?: boolean; pannes?: Partial<GitHubDeLAnnulation> } = {}) {
  const bas = faux.pour("chef");
  const git: Git = {
    commits: new Map([
      [MERGE, { arbre: "arbre-du-merge", parents: [AVANT, TETE_DE_LA_PR] }],
      [AVANT, { arbre: "arbre-d-avant", parents: [] }],
    ]),
    branches: new Map(),
    crees: [],
    fusions: [],
    supprimees: [],
  };
  const github: GitHubDeLAnnulation & { fermer(): void } = {
    issue: async (numero) => {
      const ticket = faux.tickets.get(numero);
      return ticket === undefined ? null : { number: numero, title: ticket.title, labels: [...ticket.labels], state: ticket.state, createdAt: "", updatedAt: "", url: "", body: ticket.corps };
    },
    ouvertes: async () => ({
      inchange: false,
      issues: [...faux.tickets.values()].filter((t) => t.state === "open").map((t): IssueOuverte => ({ number: t.number, title: t.title, labels: [...t.labels], state: "open", createdAt: "", updatedAt: "", url: "", body: t.corps, association: "OWNER" })),
      confirmer: () => {},
    }),
    prQuiFerme: async (numero) => {
      const pr = faux.mergee(numero);
      return pr === undefined ? null : ({ number: pr.number, url: "", base: "main", sha: pr.sha, state: "closed", merged: true, enRetard: false, mergeePar: pr.mergeePar, commitDeMerge: MERGE } satisfies PRDeGitHub);
    },
    commenter: bas.commenter,
    labelliser: bas.labelliser,
    delabelliser: bas.delabelliser,
    creerIssue: bas.creerIssue,
    ouvrirPR: bas.ouvrirPR,
    fermerIssue: bas.fermerIssue,
    teteDeLaBase: async () => faux.teteDeLaBase,
    rouvrirIssue: async (numero) => {
      faux.ticket(numero).state = "open";
    },
    commitGit: async (sha) => git.commits.get(sha) ?? null,
    creerCommit: async (commit) => {
      git.crees.push(commit);
      const sha = faux.sha();
      git.commits.set(sha, { arbre: commit.arbre, parents: commit.parents });
      return sha;
    },
    creerBranche: async (branche, sha) => {
      if (git.branches.has(branche)) throw new Error("gh api repos/faux/depot/git/refs : HTTP 422");
      git.branches.set(branche, sha);
    },
    fusionnerDansLaBranche: async (branche, sha) => {
      git.fusions.push({ branche, sha });
      if (conflit) return { conflit: true };
      const fusion = faux.sha();
      git.branches.set(branche, fusion);
      return { sha: fusion };
    },
    supprimerBranche: async (branche) => {
      git.supprimees.push(branche);
      git.branches.delete(branche);
    },
    droits: async () => ({ login: "chef" }),
    fermer: () => {},
    ...pannes,
  };
  return { github, git };
}

async function undo(github: GitHubDeLAnnulation & { fermer(): void }, cible = `faux/depot#${SERVI}`) {
  const dits: string[] = [];
  const redits: string[] = [];
  let code = 0;
  try {
    await principal({ args: [cible], env: {}, dire: (ligne) => void dits.push(ligne), redire: (ligne) => void redits.push(ligne) }, () => github);
  } catch (erreur) {
    if (!(erreur instanceof Sortie)) throw erreur;
    code = erreur.code;
  }
  return { dits, redits, code };
}

const commentairesDe = (faux: FauxGitHub, numero: number) => (faux.commentaires.get(numero) ?? []).map(({ body }) => body);

test("undo sur un ticket servi : une PR revert son merge, son ticket est en pass, et l'original est rouvert avec qui l'a annulé", async () => {
  const faux = servi();
  const { github, git } = client(faux);

  const { dits, code } = await undo(github);

  assert.equal(code, 0);
  const [undoNo] = faux.creations;
  assert.ok(undoNo !== undefined, "un ticket porte le revert");
  const revert = faux.prs.find((pr) => pr.state === "open") ?? assert.fail("aucune PR de revert ouverte");
  assert.deepEqual(dits, [`#${SERVI} undone: PR #${revert.number} goes through the pass as ticket #${undoNo}, and #${SERVI} is reopened`]);
  // Le revert remet l'arbre de la base d'avant, fils du merge ; fusionné sur la tête de la base, dans la branche d'essai.
  assert.deepEqual(git.crees.map(({ arbre, parents }) => ({ arbre, parents })), [{ arbre: "arbre-d-avant", parents: [MERGE] }]);
  assert.match(git.crees[0]?.message ?? "", /^Revert "#21 — ticket 21"/);
  assert.deepEqual(git.fusions.map(({ branche }) => branche), [brancheDEssai(SERVI)]);
  // La livraison d'un cook : la branche du ticket, sa PR qui le ferme, `in-pass` et `fire` posés.
  assert.equal(revert.branche, brancheDuTicket(undoNo));
  assert.equal(revert.issue, undoNo);
  assert.ok(git.branches.has(brancheDuTicket(undoNo)));
  assert.ok(!git.branches.has(brancheDEssai(SERVI)), "la branche d'essai est supprimée");
  assert.deepEqual([...faux.ticket(undoNo).labels].sort(), [LABEL_IN_PASS, "fire", ...CALIBRAGE_DU_REVERT].sort());
  assert.match(faux.ticket(undoNo).corps, new RegExp(`^<!-- brigade:undo ticket=${SERVI} pr=${PR} -->`));
  // L'original : rouvert, hors du rail, et ce qui lui est arrivé, par qui.
  assert.equal(faux.ticket(SERVI).state, "open");
  assert.ok(!faux.ticket(SERVI).labels.has("fire"), "rouvert hors du rail : il ne repart pas à un cook");
  const [commentaire] = commentairesDe(faux, SERVI);
  assert.match(commentaire ?? "", /^Undone by @chef from its card: PR #\d+ reverts its merge \(PR #121\)/);
  assert.match(commentaire ?? "", new RegExp(`as #${undoNo}\\.`));

  // La pass la prend au tour suivant, la juge et la merge, comme toute livraison.
  const station = faux.station("A");
  for (let tour = 0; tour < 6 && !revert.merged; tour += 1) await station.tour();
  assert.ok(faux.relectures.some(({ pr }) => pr === revert.number), "la pass l'a relue");
  assert.ok(commentairesDe(faux, revert.number).some((corps) => corps.startsWith("<!-- brigade:verdict station=A verdict=approve")), "son verdict est sur la PR");
  assert.equal(revert.merged, true);
  assert.equal(revert.mergeePar, "A");
  assert.equal(faux.ticket(undoNo).state, "closed", "le ticket du revert est servi");
  assert.equal(faux.ticket(SERVI).state, "open", "l'original reste rouvert");
  assert.deepEqual(faux.cuissons, [], "aucun cook n'a été lancé : ni sur le revert, ni sur l'original");
});

test("undo dont le revert est en conflit : aucune PR, la carte le dit en une ligne, et un ticket est déposé pour l'annuler à la main", async () => {
  const faux = servi();
  const { github, git } = client(faux, { conflit: true });

  const { dits, code } = await undo(github);

  assert.equal(code, 0);
  const [undoNo] = faux.creations;
  assert.ok(undoNo !== undefined);
  assert.deepEqual(dits, [`#${SERVI} cannot be undone in one click: later work builds on it — ticket #${undoNo} asks the kitchen to undo it by hand`]);
  assert.equal(dits[0]?.includes("\n"), false);
  assert.deepEqual(faux.prs.filter((pr) => pr.state === "open"), [], "aucune PR de revert n'est laissée ouverte");
  assert.deepEqual([...git.branches.keys()], [], "aucune branche n'est laissée");
  assert.ok(git.supprimees.includes(brancheDEssai(SERVI)));
  // Le ticket de la cuisine : sur le rail, il nomme l'original.
  const parMain = faux.ticket(undoNo);
  assert.deepEqual([...parMain.labels].sort(), ["fire", ...CALIBRAGE_A_LA_MAIN].sort());
  assert.match(parMain.corps, new RegExp(`^<!-- brigade:undo ticket=${SERVI} pr=${PR} -->\nUndo #${SERVI} by hand`));
  assert.match(parMain.corps, /@chef asked to undo #21/);
  // L'original reste servi, et nomme le ticket qui l'annulera.
  assert.equal(faux.ticket(SERVI).state, "closed");
  assert.deepEqual(commentairesDe(faux, SERVI), [`@chef asked to undo #${SERVI}, but its revert does not apply cleanly: later work builds on it. No pull request was opened; #${undoNo} asks the kitchen to undo it by hand.`]);
});

test("un second undo pendant que le ticket de la cuisine est ouvert ne dépose rien de plus et le nomme", async () => {
  const faux = servi();
  const { github } = client(faux, { conflit: true });
  await undo(github);
  const [undoNo] = faux.creations;

  const { dits, code } = await undo(github);

  assert.equal(code, 0);
  assert.deepEqual(dits, [`#${SERVI} is already being undone: ticket #${undoNo}`]);
  assert.equal(faux.creations.length, 1);
});

test("un ticket qui n'est pas servi ne s'annule pas : rien n'est écrit, et la raison est dite", async () => {
  const ouvert = servi();
  ouvert.ticket(SERVI).state = "open";
  const surOuvert = client(ouvert);
  const lu = await undo(surOuvert.github);
  assert.equal(lu.code, 1);
  assert.deepEqual(lu.redits, [`brigade : #${SERVI} is not served: it is open`]);
  assert.deepEqual(surOuvert.git.crees, []);
  assert.deepEqual(ouvert.creations, []);

  // Fermé sans PR mergée : pas de merge à défaire.
  const sansMerge = servi();
  sansMerge.prs.length = 0;
  const surSansMerge = client(sansMerge);
  const sans = await undo(surSansMerge.github);
  assert.equal(sans.code, 1);
  assert.deepEqual(sans.redits, [`brigade : #${SERVI} was not closed by a merged pull request: there is no merge to undo`]);
  assert.deepEqual(surSansMerge.git.crees, []);

  // Un merge que GitHub ne connaît pas.
  const inconnu = servi();
  const surInconnu = client(inconnu, { pannes: { commitGit: async () => null } });
  const perdu = await undo(surInconnu.github);
  assert.equal(perdu.code, 1);
  assert.match(perdu.redits[0] ?? "", /the merge of PR #121 \(aaaaaaa\) is not known to GitHub/);
  assert.deepEqual(inconnu.creations, []);
});

test("une PR de revert que GitHub refuse : son ticket est fermé, ses branches supprimées, l'original reste servi, et le refus est dit", async () => {
  const faux = servi();
  const { github, git } = client(faux, { pannes: { ouvrirPR: async () => Promise.reject(new Error("gh api repos/faux/depot/pulls : HTTP 422")) } });

  const { redits, code } = await undo(github);

  assert.equal(code, 1);
  assert.deepEqual(redits, ["brigade : GitHub: gh api repos/faux/depot/pulls : HTTP 422"]);
  const [undoNo] = faux.creations;
  assert.ok(undoNo !== undefined);
  assert.equal(faux.ticket(undoNo).state, "closed", "sans PR, son ticket ne reste pas sur le rail");
  assert.deepEqual([...git.branches.keys()], []);
  assert.equal(faux.ticket(SERVI).state, "closed");
  assert.deepEqual(commentairesDe(faux, SERVI), []);
});

test("une branche d'essai laissée par une annulation interrompue ne bloque pas la suivante", async () => {
  const faux = servi();
  const { github, git } = client(faux);
  git.branches.set(brancheDEssai(SERVI), "e".repeat(40));

  const { code } = await undo(github);

  assert.equal(code, 0);
  assert.ok(faux.prs.some((pr) => pr.state === "open"));
});

test("le ticket se nomme <owner>/<repo>#<ticket>", async () => {
  const faux = servi();
  const { github } = client(faux);
  for (const cible of ["21", "faux/depot", "faux/depot#0"]) {
    const { code, redits } = await undo(github, cible);
    assert.equal(code, 2);
    assert.match(redits[0] ?? "", /the ticket is named <owner>\/<repo>#<ticket>/);
  }
  assert.deepEqual(faux.creations, []);
});
