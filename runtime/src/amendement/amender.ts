// La suite d'un amendement proposé par un cook (#3729), voir `proposition.ts`.
//
// `amenderParLeManager` fait ce qui touche au dépôt : un worktree de la branche
// du ticket, le manager qui classe la proposition en lecture, et — petite —
// le commit du manager qui change le test gelé, avec `Amendment: #<issue>`,
// poussé sur la branche. Le cook n'écrit jamais ce commit : la station refuse
// même la proposition quand l'un des commits du cook sur la branche touche le
// test gelé qu'elle amende.
//
// `traiterLAmendement` fait ce qui se voit sur l'issue : la proposition
// postée, puis l'application dite, ou la carte du chef sous
// `blocked-on-human` (`poserALaMain`, comme toute question au chef).
import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { poserALaMain } from "../blocages-sans-question.ts";
import type { GitHubDuTour } from "../brigade-github.ts";
import type { IssueAJuger } from "../juger.ts";
import { consigneDuClassement, corpsDeLApplication, corpsDeLaCarte, corpsDeLaProposition, lireLeClassement, PIED, type Classement, type Proposition } from "./proposition.ts";

// L'auteur du commit d'amendement : le manager, jamais le cook.
const AUTEUR_DU_MANAGER = "brigade manager <manager@brigade.localhost>";
const COURRIEL_DU_MANAGER = "manager@brigade.localhost";

type LancerGit = (args: string[], worktree: string) => Promise<{ code: number; stdout: string; stderr: string }>;

export type IssueDeLAmendement =
  | { applique: { sha: string; branche: string; classement: Extract<Classement, { classe: "petit" }> } }
  | { carte: Extract<Classement, { classe: "produit" | "affaiblit" }> }
  | { refus: string };

export type AmenderLeTest = (ticket: number, branche: string, proposition: Proposition) => Promise<IssueDeLAmendement>;

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

export function amenderParLeManager(deps: {
  depotGitHub: string;
  base: string;
  depot: { connait(branche: string): boolean; reprendre(run: string, branche: string): Promise<string>; retirer(worktree: string, branche?: string): void; pousser(branche: string): void };
  git: LancerGit;
  // L'issue et ses derniers commentaires ; null si elle n'existe plus.
  lire: (ticket: number) => Promise<{ issue: IssueAJuger; commentaires: string[] } | null>;
  // Le manager lancé sur la consigne, en lecture, dans le worktree : son dernier message.
  manager: (consigne: string, worktree: string, run: string, ticket: number) => Promise<{ message: string | null } | { illisible: string }>;
}): AmenderLeTest {
  const { depot, git, base } = deps;
  return async (ticket, branche, proposition) => {
    if (!depot.connait(branche)) return { refus: `the ticket's branch \`${branche}\` is not on this station` };
    let lu: Awaited<ReturnType<typeof deps.lire>>;
    try {
      lu = await deps.lire(ticket);
    } catch (erreur) {
      return { refus: `the issue could not be read for the manager: ${message(erreur)}` };
    }
    if (lu === null) return { refus: "the issue no longer exists" };
    const run = `amendement-${ticket}-github`;
    let worktree: string;
    try {
      worktree = await depot.reprendre(run, branche);
    } catch (erreur) {
      return { refus: `the ticket's branch could not be checked out: ${message(erreur)}` };
    }
    try {
      const chemin = resolve(worktree, proposition.test);
      const dedans = relative(resolve(worktree), chemin);
      if (dedans === "" || dedans.startsWith("..") || dedans.startsWith(sep) || resolve(dedans) === dedans) return { refus: `the frozen test \`${proposition.test}\` is not a path inside the repository` };
      const fichier = dedans.split(sep).join("/");
      const parLeCook = await commitsDuCookSur(git, worktree, base, fichier, ticket);
      if ("refus" in parLeCook) return parLeCook;
      if (parLeCook.commits.length > 0) return { refus: `the cook's own commit${parLeCook.commits.length === 1 ? "" : "s"} ${parLeCook.commits.map((sha) => sha.slice(0, 7)).join(", ")} change${parLeCook.commits.length === 1 ? "s" : ""} the frozen test \`${fichier}\`: a cook never changes it, only the manager amends it` };
      let contenu: string;
      try {
        contenu = readFileSync(chemin, "utf8");
      } catch (erreur) {
        return { refus: `the frozen test \`${fichier}\` cannot be read on the branch: ${message(erreur)}` };
      }
      const consigne = consigneDuClassement({ depot: deps.depotGitHub, issue: lu.issue, commentaires: lu.commentaires, proposition: { ...proposition, test: fichier } });
      const reponse = await deps.manager(consigne, worktree, run, ticket).catch((erreur: unknown) => ({ illisible: message(erreur) }));
      const classement = "illisible" in reponse ? reponse : lireLeClassement(reponse.message);
      if ("illisible" in classement) return { refus: `the manager's classification of the amendment could not be read: ${classement.illisible}` };
      if (classement.classe !== "petit") return { carte: classement };
      const fois = contenu.split(classement.remplacer).length - 1;
      if (fois !== 1) return { refus: `the manager classified the amendment as small, but the text it replaces is found ${fois} times in \`${fichier}\`, not once: nothing was applied` };
      writeFileSync(chemin, contenu.replace(classement.remplacer, () => classement.par));
      const etapes: string[][] = [
        ["add", "--", fichier],
        ["commit", "--quiet", "--no-verify", `--author=${AUTEUR_DU_MANAGER}`, "-m", `test(#${ticket}): amendment — ${classement.changement}`, "-m", PIED(ticket)],
      ];
      for (const args of etapes) {
        const fait = await git(args, worktree);
        if (fait.code !== 0) return { refus: `the amendment could not be committed (git ${args[0]}): ${fait.stderr.trim() || `code ${fait.code}`}` };
      }
      const tete = await git(["rev-parse", "HEAD"], worktree);
      const sha = tete.stdout.trim();
      if (tete.code !== 0 || sha === "") return { refus: `the amendment's commit could not be read: ${tete.stderr.trim()}` };
      try {
        depot.pousser(branche);
      } catch (erreur) {
        return { refus: `the amendment was committed (${sha.slice(0, 7)}) but \`${branche}\` could not be pushed: ${message(erreur)}` };
      }
      return { applique: { sha, branche, classement } };
    } finally {
      depot.retirer(worktree);
    }
  };
}

// Les commits de la branche, depuis la base, qui touchent le test gelé et que
// le manager n'a pas faits : son auteur et son pied, les deux.
async function commitsDuCookSur(git: LancerGit, worktree: string, base: string, fichier: string, ticket: number): Promise<{ commits: string[] } | { refus: string }> {
  const lu = await git(["log", "--format=%H%x1f%ae%x1f%B%x1e", `origin/${base}..HEAD`, "--", fichier], worktree);
  if (lu.code !== 0) return { refus: `the branch's commits on the frozen test could not be read: ${lu.stderr.trim() || `code ${lu.code}`}` };
  const commits = lu.stdout
    .split("\x1e")
    .map((bloc) => bloc.trim())
    .filter(Boolean)
    .flatMap((bloc) => {
      const [sha = "", auteur = "", corps = ""] = bloc.split("\x1f");
      const duManager = auteur === COURRIEL_DU_MANAGER && corps.split("\n").some((ligne) => ligne.trim() === PIED(ticket));
      return duManager ? [] : [sha];
    });
  return { commits };
}

// Ce que la station fait de la proposition du cook : elle la poste sur
// l'issue, puis dit l'amendement appliqué et rend le ticket à un cook, ou pose
// la carte du chef et le ticket l'attend. Ce qui ne peut se faire est un échec
// du ticket, dit : rien n'est appliqué, et rien ne va au chef.
export async function traiterLAmendement(
  { github, repertoireEtat, station, amender }: { github: Pick<GitHubDuTour, "commenter" | "labelliser">; repertoireEtat?: string | undefined; station: string; amender: AmenderLeTest | undefined },
  ticket: number,
  branche: string,
  proposition: Proposition | { illisible: string },
): Promise<"liberee" | "retenue" | { echec: string }> {
  if ("illisible" in proposition) return { echec: `${proposition.illisible}: nothing was proposed on the issue` };
  await github.commenter(ticket, corpsDeLaProposition({ station, proposition }));
  if (amender === undefined) return { echec: "the cook proposed an amendment, and this station has no manager to classify it" };
  const suite = await amender(ticket, branche, proposition).catch((erreur: unknown): IssueDeLAmendement => ({ refus: message(erreur) }));
  if ("refus" in suite) return { echec: `the cook proposed an amendment, and it was not applied: ${suite.refus}` };
  if ("applique" in suite) {
    await github.commenter(ticket, corpsDeLApplication({ issue: ticket, station, branche: suite.applique.branche, sha: suite.applique.sha, proposition, classement: suite.applique.classement }));
    return "liberee";
  }
  const pose = await poserALaMain({ github, repertoireEtat }, ticket, corpsDeLaCarte({ issue: ticket, station, proposition, classement: suite.carte }));
  if (!pose.pose) return { echec: pose.echec };
  return "retenue";
}
