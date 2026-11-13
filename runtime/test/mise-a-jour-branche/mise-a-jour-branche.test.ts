// La cuisine tient la branche d'un cook à jour de `origin/<base>` (#3001). Les
// tests de bout en bout passent par la station (`stationDuDepot`) sur le vrai
// dépôt d'un projet (`ouvrirDepot`, une origine nue et le clone de la
// station) : seuls GitHub et `claude` sont faux. Le faux cook lit ce que son
// worktree porte, commite, et finit livré ou bloqué.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { test, type TestContext } from "node:test";
import { MARQUE_D_ATTENTE_DE_TICKET } from "../../src/attente-ticket/attente-ticket.ts";
import { MARQUE_DE_LA_CONSULTATION } from "../../src/blocage-au-manager.ts";
import { A_LA_MAIN, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { ouvrirDepot } from "../../src/depot.ts";
import { CHEF_TODO } from "../../src/github-seul/carte-todo/carte-todo.ts";
import { MARQUE_DU_CONFLIT_MAIN } from "../../src/conflit-main/renvoi.ts";
import type { GitHub } from "../../src/github.ts";
import type { SortieGit } from "../../src/integration-base.ts";
import { apresLaMiseAJour, demandeLaBase, mettreAJourLaBranche } from "../../src/mise-a-jour-branche/mise-a-jour-branche.ts";
import { FauxGitHub, STATION_DU_DEPOT, depotNeuf, fauxClient } from "../faux-github.ts";
import { BASE, commiter, depotGit, ENV_GIT, git, repertoireTemporaire } from "../outils.ts";

const TICKET = 7;
const BRANCHE = `cook/${TICKET}-github`;
const CALIBRE = ["fire", "model:opus", "effort:medium"];
const BESOIN = `I need the commits of #5, merged on \`origin/${BASE}\` but not on my branch: \`git merge origin/${BASE}\` was denied by the sandbox.`;

// Pose sur la base de l'origine un commit qui écrit `fichier` : un merge qui
// atterrit sur la base sans que le clone de la station l'ait vu. Un seul
// `git fast-import` dans l'origine nue, comme `poserSurLOrigine` (depot.test.ts).
// Rend la nouvelle tête.
function avancerLOrigine(origine: string, fichier: string, contenu: string): string {
  const donnees = (texte: string) => `data ${Buffer.byteLength(texte)}\n${texte}\n`;
  const flux = [`commit refs/heads/${BASE}\n`, "mark :1\n", "committer cook <cook@brigade.test> now\n", donnees(`merge de ${fichier}`), `from refs/heads/${BASE}^0\n`, `M 100644 inline ${fichier}\n${donnees(contenu)}`, "get-mark :1\n"];
  return execFileSync("git", ["fast-import", "--quiet", "--force", "--date-format=now"], { cwd: origine, env: ENV_GIT, input: flux.join(""), encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

const porte = (worktree: string, commit: string) => {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", commit, "HEAD"], { cwd: worktree, env: ENV_GIT, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

type Cook = (rang: number, worktree: string) => string;

// La station d'un projet sur un vrai dépôt, où #TICKET est prenable. `cook`
// joue chaque cook, dans son worktree, et rend son dernier message.
function station(t: TestContext, cook: Cook, avant?: (depot: { origine: string; clone: string }) => void) {
  const lieux = depotGit(t);
  avant?.(lieux);
  const worktrees = join(repertoireTemporaire(t), "worktrees");
  const depot = ouvrirDepot({ clone: lieux.clone, base: BASE, worktrees, env: ENV_GIT });
  const faux = new FauxGitHub();
  faux.feu(TICKET, CALIBRE, "## Context\n\nThe dashboard's second screen.");
  let cooks = 0;
  const consultations: string[] = [];
  const lancer: Lancer = ({ args, cwd, flux }) => {
    const consulte = args.some((arg) => arg.startsWith(MARQUE_DE_LA_CONSULTATION));
    let message = JSON.stringify({ issue: "geste", geste: "merge the branch" });
    if (consulte) consultations.push(args.join("\n"));
    else if (!args.includes("--tools")) {
      // Le `fix` qu'une station ouvre est cuisinable : son cook livre.
      if (basename(cwd) === `${TICKET}-github`) message = cook(++cooks, cwd);
      else message = "Done.\n<livrable>\nNothing.\n</livrable>";
    }
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 10, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const avertissements: string[] = [];
  const github: GitHub = { ...fauxClient(faux), creerIssue: faux.pour("box").creerIssue };
  const ouverte = stationDuDepot({
    ...STATION_DU_DEPOT,
    base: BASE,
    github,
    depot,
    manager: () => ({ model: "opus", effort: "high" }),
    flux: repertoireTemporaire(t),
    lancer,
    avertir: (texte) => void avertissements.push(texte),
  });
  if ("refus" in ouverte) throw new Error(ouverte.refus);
  const tour = async () => {
    await ouverte.tour();
    await ouverte.calme();
  };
  const commentaires = () => (faux.commentaires.get(TICKET) ?? []).map((c) => c.body);
  return { ...lieux, faux, tour, cooks: () => cooks, consultations, avertissements, commentaires };
}

const sansCarte = (s: ReturnType<typeof station>) => {
  assert.equal(s.faux.ticket(TICKET).labels.has(CHEF_TODO), false, "no TODO card");
  assert.equal(s.faux.ticket(TICKET).labels.has(A_LA_MAIN), false, "never blocked-on-human");
  assert.deepEqual(s.consultations, [], "the question never reaches the manager, who could put a card");
};

test("a cook starts on a branch that contains the current origin tip, when the origin's base has moved ahead of the station's clone", async (t) => {
  let tete = "";
  const vus: boolean[] = [];
  const s = station(
    t,
    (_rang, worktree) => {
      vus.push(porte(worktree, tete));
      commiter(worktree, "livraison.txt");
      return "Done.\n<livrable>\nDelivered.\n</livrable>";
    },
    ({ origine, clone }) => {
      tete = avancerLOrigine(origine, "nouveau.txt", "merged on the base\n");
      assert.equal(porte(clone, tete), false, "the clone's base is behind the origin");
    },
  );
  await s.tour();
  assert.deepEqual(vus, [true]);
});

test("a cook resuming a branch cut from an older base starts with the current origin tip merged into it", async (t) => {
  let tete = "";
  const vus: boolean[] = [];
  const s = station(
    t,
    (_rang, worktree) => {
      vus.push(porte(worktree, tete));
      commiter(worktree, "livraison.txt");
      return "Done.\n<livrable>\nDelivered.\n</livrable>";
    },
    ({ origine, clone }) => {
      git(clone, "branch", BRANCHE, BASE);
      tete = avancerLOrigine(origine, "nouveau.txt", "merged on the base\n");
    },
  );
  await s.tour();
  assert.deepEqual(vus, [true]);
  git(s.clone, "merge-base", "--is-ancestor", tete, BRANCHE);
});

test("a cook that stops because it needs commits on the base: the station merges origin into its branch and a cook resumes it, with no TODO card", async (t) => {
  let tete = "";
  const vus: boolean[] = [];
  let origine = "";
  const s = station(
    t,
    (rang, worktree) => {
      vus.push(porte(worktree, tete));
      commiter(worktree, `travail-${rang}.txt`);
      if (rang > 1) return "Done.\n<livrable>\nDelivered.\n</livrable>";
      // Le merge dont le cook a besoin atterrit sur la base pendant qu'il cuisine.
      tete = avancerLOrigine(origine, "de-5.txt", "the work of #5\n");
      return `I stopped.\n<livrable>\n<bloque>${BESOIN}</bloque>\n</livrable>`;
    },
    (lieux) => void (origine = lieux.origine),
  );
  await s.tour();
  assert.equal(s.cooks(), 1);
  sansCarte(s);
  assert.ok(s.commentaires().some((c) => c.includes(`merged it into \`${BRANCHE}\``)), s.commentaires().join("\n---\n"));
  assert.equal(s.faux.creations.length, 0, "no fix ticket");
  await s.tour();
  assert.equal(s.cooks(), 2, "a cook resumes the ticket");
  assert.deepEqual(vus, [false, true], "the resumed cook's branch holds the base's new tip");
  sansCarte(s);
});

test("a merge the station cannot complete sends the ticket back to its own cook, with no new ticket and no TODO card", async (t) => {
  let origine = "";
  const s = station(
    t,
    (_rang, worktree) => {
      commiter(worktree, "LISEZMOI");
      avancerLOrigine(origine, "LISEZMOI", "the base's own readme\n");
      return `I stopped.\n<livrable>\n<bloque>${BESOIN}</bloque>\n</livrable>`;
    },
    (lieux) => void (origine = lieux.origine),
  );
  await s.tour();
  sansCarte(s);
  assert.equal(s.faux.creations.length, 0, "no fix ticket");
  assert.ok(s.commentaires().some((c) => c.startsWith(MARQUE_DU_CONFLIT_MAIN) && c.includes("conflicts in `LISEZMOI`")), s.commentaires().join("\n---\n"));
  assert.ok(!s.commentaires().some((c) => c.startsWith(MARQUE_D_ATTENTE_DE_TICKET)), "the ticket waits for no other ticket");
  // La fusion tentée est défaite : la branche ne porte aucun marqueur de conflit.
  assert.equal(git(s.clone, "show", `${BRANCHE}:LISEZMOI`), "LISEZMOI");
});

test("a cook's question names the base when it says the branch lacks commits of the base", () => {
  assert.equal(demandeLaBase(BESOIN, BASE), true);
  assert.equal(demandeLaBase("Ma branche est partie d'un main plus ancien : il me manque le merge de #2905, présent sur origin/main.", "main"), true);
  assert.equal(demandeLaBase("My worktree is behind `main`, I need it updated.", "main"), true);
  assert.equal(demandeLaBase("Which palette does the chef want for the main menu?", "main"), false);
  assert.equal(demandeLaBase("Should the button be merged into the toolbar?", "main"), false);
  assert.equal(demandeLaBase("The API key is missing on the station.", "main"), false);
});

test("a fetch that fails is an echec of the fetch, and nothing is merged", async () => {
  const appels: string[] = [];
  const git = async (args: string[]): Promise<SortieGit> => {
    appels.push(args.join(" "));
    return args[0] === "fetch" ? { code: 128, stdout: "", stderr: "fatal: could not read from remote" } : { code: 0, stdout: "", stderr: "" };
  };
  assert.deepEqual(await mettreAJourLaBranche(git, "/nulle-part", "main"), { etat: "echec", etape: "fetch", detail: "fatal: could not read from remote", fichiers: [] });
  assert.deepEqual(appels, ["fetch origin main"]);
  const leve = async (): Promise<SortieGit> => {
    throw new Error("worktree hijacked");
  };
  assert.deepEqual(await mettreAJourLaBranche(leve, "/nulle-part", "main"), { etat: "echec", etape: "fetch", detail: "worktree hijacked", fichiers: [] });
});

test("a branch the station cannot bring up to date without a conflict goes back to its own cook, which updates it itself, never to the chef", async () => {
  const commentes: string[] = [];
  const suite = await apresLaMiseAJour(
    { commenter: async (_n, corps) => void commentes.push(corps) },
    { station: "box", ticket: TICKET, base: "main", branche: BRANCHE, question: BESOIN, miseAJour: { etat: "echec", etape: "fetch", detail: "fatal: could not read from remote", fichiers: [] } },
  );
  assert.match(suite.dit, /goes back to its own cook/);
  assert.equal(commentes.length, 1);
  assert.match(commentes[0] ?? "", /could not bring `cook\/7-github` up to date with `origin\/main` \(fetch: fatal: could not read from remote\)/);
  assert.doesNotMatch(commentes[0] ?? "", /brigade:attend-ticket/);
});

test("a station that cannot update the branch before the cook says so, and the cook starts from its branch as is", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const faux = new FauxGitHub();
  faux.feu(TICKET, CALIBRE);
  let cooks = 0;
  const avertissements: string[] = [];
  const ouverte = stationDuDepot({
    ...STATION_DU_DEPOT,
    github: fauxClient(faux),
    depot: { ...depotNeuf(repertoire), lancerGit: async (args) => (args[0] === "fetch" ? { code: 128, stdout: "", stderr: "fatal: unable to access" } : { code: 0, stdout: "", stderr: "" }) },
    flux: repertoire,
    lancer: ({ flux }) => {
      cooks += 1;
      writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "done" })}\n`);
      return { fin: Promise.resolve({ code: 0, signal: null, turns: 10, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
    },
    avertir: (texte) => void avertissements.push(texte),
  });
  if ("refus" in ouverte) throw new Error(ouverte.refus);
  await ouverte.tour();
  await ouverte.calme();
  assert.equal(cooks, 1);
  assert.ok(avertissements.some((a) => a.includes("could not bring `cook/7-github` up to date with `origin/main` before the cook (fetch: fatal: unable to access)")), avertissements.join("\n"));
});
