// Les gestes du superviseur (#3944, spec 2026-11-20-kitchen-spinning,
// section B) : ce que le manager peut faire d'un réveil, sur GitHub, et rien
// d'autre. Six gestes, un jeu fermé :
//   1. `rerun` — relancer les jobs en échec des checks rouges de la base ;
//   2. `back-on-rail` — remettre un ticket sur le rail, avec une note ;
//   3. `waiting` — mettre un ticket de côté en WAITING pour un tiers nommé ;
//   4. `close-duplicate` — fermer un doublon ;
//   5. `fix` — ouvrir UN ticket `fix` pour une cause neuve, sans doublon ouvert ;
//   6. `todo` — poser une carte TODO, seulement pour une question de produit ou
//      de design.
// Toute autre action est refusée, et rien n'est fait.
//
// Chaque run écrit UN commentaire sur le ticket où il a agi : ce qu'il a vu et
// ce qu'il a fait. Un geste n'écrit pas le sien par-dessus : il joue sur un
// GitHub dont `commenter` ne part pas, et ce qu'il y aurait écrit — la marque
// de WAITING (attente-github/attente-github.ts), la carte de TODO
// (github-seul/carte-todo/carte-todo.ts), que leurs lecteurs relisent en tête
// d'un commentaire — ouvre le seul commentaire du run.
//
// Une base rouge se relance d'abord : un `fix` sur un check rouge ne s'ouvre
// que si sa relance est finie et que le check reste rouge, un seul par check.
// Seul `fix` crée un ticket, jamais un ticket sur un ticket. Le chef n'est
// jamais prié d'une relance, d'un merge, d'un rebase ni d'une lecture de log :
// aucune carte de TODO pour eux.
import { DE_CONFIANCE } from "../alimenter.ts";
import { mettreEnAttenteGitHub } from "../attente-github/attente-github.ts";
import { gesteGit, LABELS_DE_REPARATION } from "../garde-todo/geste-git.ts";
import { LABEL_IN_PASS, LABEL_TAKEN, LABEL_PARKED } from "../github-etat/etats.ts";
import { carteQuestionProduit, poserCarte, type Carte } from "../github-seul/carte-todo/carte-todo.ts";
import type { Check } from "../events/pass.ts";
import { jobDuCheck, LABEL, MIS_DE_COTE, type GitHub } from "../github.ts";
import { exigerNonParque, GesteRefuse } from "../rail.ts";
import { causeDuCheck, LABELS_REPARATION, marqueDeCause } from "../reparation.ts";
import { OUTCOME, type Geste as GesteDuJournal } from "../autonomie/agents/gestes.ts";
import type { Reveil } from "./declencheur.ts";

const GESTES = ["rerun", "back-on-rail", "waiting", "close-duplicate", "fix", "todo"] as const;

// Un geste lu de la réponse du manager. `rerun.ticket` : le ticket pour lequel
// il relance, nul quand c'est la base seule. `fix.check` : le check rouge de la
// base dont il est la réparation, nul pour une autre cause.
export type Geste =
  | { gesture: "rerun"; ticket: number | null }
  | { gesture: "back-on-rail"; ticket: number; note: string }
  | { gesture: "waiting"; ticket: number; what: string; who: string }
  | { gesture: "close-duplicate"; ticket: number; of: number }
  | { gesture: "fix"; cause: string; title: string; body: string; check: string | null }
  | { gesture: "todo"; ticket: number; kind: "product" | "design"; question: string };

// Ce que le manager rend : ce qu'il a vu, et le geste qu'il demande, tel quel.
export type Decision = { saw: unknown; gesture: unknown };

export type GitHubDesGestes = Pick<GitHub, "issue" | "commentaires" | "commenter" | "labelliser" | "delabelliser" | "ouvertes" | "fermerIssue" | "creerIssue" | "relancerLesEchecs" | "etatDuRun" | "ci"> & {
  teteDeLaBase(branche: string): Promise<string>;
};

export type ContexteDesGestes = { github: GitHubDesGestes; depot: string; branche: string; maintenant: Date };

// Ce que le run a fait, et le commentaire qu'il a écrit — nul quand il n'a agi
// sur aucun ticket (une relance de la base seule). `gesture` : le geste fait,
// tel que le journal des gestes du superviseur le garde (#4037) ; nul quand
// rien n'a été fait, refusé ou en échec.
export type Trace = { outcome: "done" | "refused" | "failed"; ticket: number | null; comment: string | null; gesture: Omit<GesteDuJournal, "at"> | null };

const MARQUE_DU_SUPERVISEUR = "<!-- brigade:supervisor -->";

// Ce qu'une question pour le chef ne demande jamais : lire un log.
const LECTURE_DE_LOG = /\b(?:read|look(?:ing)? at|check|inspect|go through|open|dig into)\b[^.?]{0,40}\blogs?\b/i;
// Un ticket qui porte sur un ticket : son titre ou sa cause en nomment un.
const NOMME_UN_TICKET = /#\d+/;

// Un refus : rien n'est fait. `ticket` : celui où le dire, quand ce n'est pas
// la cible du geste (le doublon ouvert d'un `fix`).
class Refus extends Error {
  readonly ticket: number | undefined;
  constructor(message: string, ticket?: number) {
    super(message);
    this.ticket = ticket;
  }
}

type Effet = { ticket: number | null; fait: string; defaire?: () => Promise<void> };

const texte = (valeur: unknown): string | null => (typeof valeur === "string" && valeur.trim() !== "" ? valeur.trim() : null);
const numero = (valeur: unknown): number | null => (typeof valeur === "number" && Number.isSafeInteger(valeur) && valeur > 0 ? valeur : null);

// Le geste que dit la réponse du manager, ou le refus qui dit pourquoi il n'en
// est pas un.
function lireGeste(brut: unknown): Geste | { refus: string } {
  const lu = typeof brut === "object" && brut !== null ? (brut as Record<string, unknown>) : {};
  const nom = lu.gesture;
  const manque = (champ: string) => ({ refus: `the ${String(nom)} gesture needs ${champ}: nothing was done` });
  const ticket = numero(lu.ticket);
  switch (nom) {
    case "rerun":
      if (lu.ticket !== undefined && lu.ticket !== null && ticket === null) return manque("a ticket number, or none");
      return { gesture: "rerun", ticket };
    case "back-on-rail": {
      const note = texte(lu.note);
      if (ticket === null || note === null) return manque("its ticket and a note");
      return { gesture: "back-on-rail", ticket, note };
    }
    case "waiting": {
      const what = texte(lu.what);
      const who = texte(lu.who);
      if (ticket === null || what === null || who === null) return manque("its ticket, what it waits for, and the third party it waits for");
      return { gesture: "waiting", ticket, what, who };
    }
    case "close-duplicate": {
      const of = numero(lu.of);
      if (ticket === null || of === null) return manque("the duplicate and the ticket it duplicates");
      return { gesture: "close-duplicate", ticket, of };
    }
    case "fix": {
      const cause = texte(lu.cause);
      const title = texte(lu.title);
      const body = texte(lu.body);
      const check = texte(lu.check);
      if (cause === null || title === null || body === null) return manque("its cause, a title and a body");
      return { gesture: "fix", cause, title, body, check };
    }
    case "todo": {
      const question = texte(lu.question);
      if (ticket === null || question === null) return manque("its ticket and its question");
      if (lu.kind !== "product" && lu.kind !== "design") return { refus: `a TODO card is only for a product or a design question, not “${String(lu.kind)}”: no card was posted` };
      return { gesture: "todo", ticket, kind: lu.kind, question };
    }
    default:
      return { refus: `“${typeof nom === "string" ? nom : JSON.stringify(nom) ?? "nothing"}” is not one of the supervisor's six gestures (${GESTES.join(", ")}): nothing was done` };
  }
}

// Le geste que le manager demande, en une ligne, avant qu'il ne soit joué : ce que la porte des gestes garde en
// attente ou consigne sans le faire (#4039).
export function annonceDuGeste(brut: unknown): string {
  const { gesture, ...champs } = typeof brut === "object" && brut !== null ? (brut as Record<string, unknown>) : { gesture: brut };
  return `${typeof gesture === "string" ? gesture : JSON.stringify(gesture) ?? "no gesture"} ${JSON.stringify(champs)}`;
}

// L'issue ouverte du ticket, ou le refus.
async function issueOuverte(github: Pick<GitHubDesGestes, "issue">, ticket: number) {
  const issue = await github.issue(ticket);
  if (issue === null || issue.pr === true) throw new Refus(`#${ticket} is not an issue of the repository`);
  if (issue.state !== "open") throw new Refus(`#${ticket} is closed`);
  return issue;
}

// Les checks rouges de la tête de la base.
async function rougesDeLaBase({ github, branche }: ContexteDesGestes) {
  return (await github.ci(await github.teteDeLaBase(branche))).filter(({ outcome }) => outcome === "red");
}

// Le geste `rerun` même : relance les jobs en échec des checks rouges de la
// base, et dit ce qu'il a relancé ; nul quand aucun n'est un job de GitHub
// Actions. L'invariant 4 du rail le joue aussi (invariants/base-rouge.ts, #4026).
export async function relancerLesRouges(github: Pick<GitHub, "relancerLesEchecs">, branche: string, rouges: readonly { name?: string; url?: string | null }[]): Promise<string | null> {
  const runs = [...new Set(rouges.flatMap((check) => jobDuCheck({ url: check.url ?? null } as Check)?.run ?? []))];
  if (runs.length === 0) return null;
  for (const run of runs) await github.relancerLesEchecs(run);
  return `reran the failed jobs of ${branche} (${rouges.map(({ name }) => name).join(", ")}; run ${runs.join(", ")})`;
}

async function relancer(ctx: ContexteDesGestes, ticket: number | null): Promise<Effet> {
  const rouges = await rougesDeLaBase(ctx);
  if (rouges.length === 0) throw new Refus(`${ctx.branche} has no red check on its head: there is nothing to rerun`);
  const fait = await relancerLesRouges(ctx.github, ctx.branche, rouges);
  if (fait === null) throw new Refus(`the red checks of ${ctx.branche} (${rouges.map(({ name }) => name).join(", ")}) are not GitHub Actions jobs: none can be rerun`);
  return { ticket, fait };
}

// Le geste `back-on-rail` ; l'invariant 3 du rail le joue aussi, sur un ticket mis de côté dont la date est passée (#4026).
export async function remettreSurLeRail({ github }: { github: Pick<GitHubDesGestes, "issue" | "labelliser" | "delabelliser"> }, ticket: number, note: string): Promise<Effet> {
  const issue = await issueOuverte(github, ticket);
  const tenu = [LABEL_TAKEN, LABEL_IN_PASS].find((label) => issue.labels.includes(label));
  if (tenu !== undefined) throw new Refus(`#${ticket} carries \`${tenu}\`: the kitchen holds it`);
  exigerNonParque(issue.labels, ticket);
  const retenus = MIS_DE_COTE.filter((label) => issue.labels.includes(label));
  const sansFeu = !issue.labels.includes(LABEL);
  if (retenus.length === 0 && !sansFeu) throw new Refus(`#${ticket} is already on the rail: nothing holds it`);
  if (sansFeu) await github.labelliser(ticket, [LABEL]);
  for (const label of retenus) await github.delabelliser(ticket, label);
  const faits = [...(sansFeu ? [`\`${LABEL}\` added`] : []), ...retenus.map((label) => `\`${label}\` removed`)];
  return { ticket, fait: `put #${ticket} back on the rail (${faits.join(", ")}). Note: ${note}` };
}

async function mettreDeCote(ctx: ContexteDesGestes, gh: GitHubDesGestes, ticket: number, what: string, who: string): Promise<Effet> {
  // Parqué, pour le chef comme pour un autre, il attend déjà quelqu'un : le superviseur ne le prend pas (#4129).
  exigerNonParque((await issueOuverte(gh, ticket)).labels, ticket);
  await mettreEnAttenteGitHub(gh, { depot: ctx.depot, numero: ticket }, { quoi: what, qui: who }, ctx.maintenant);
  return { ticket, fait: `parked #${ticket}, waiting for ${who}: ${what}`, defaire: () => ctx.github.delabelliser(ticket, LABEL_PARKED) };
}

async function fermerLeDoublon({ github }: ContexteDesGestes, ticket: number, of: number): Promise<Effet> {
  if (ticket === of) throw new Refus(`#${ticket} cannot duplicate itself`);
  await issueOuverte(github, ticket);
  const original = await github.issue(of);
  if (original === null || original.pr === true) throw new Refus(`#${of} is not an issue of the repository: #${ticket} is not its duplicate`);
  await github.fermerIssue(ticket);
  return { ticket, fait: `closed #${ticket} as a duplicate of #${of}` };
}

async function ouvrirLeFix(ctx: ContexteDesGestes, reveil: Reveil, { cause, title, body, check }: Extract<Geste, { gesture: "fix" }>): Promise<Effet> {
  const { github } = ctx;
  if (NOMME_UN_TICKET.test(`${title} ${cause}`)) throw new Refus("a fix ticket is never a ticket about a ticket: its title and its cause name no ticket");
  if (reveil.cause === "main-red" && check === null) throw new Refus(`${ctx.branche} is red: a fix ticket names the red check it repairs`);
  let labels = LABELS_DE_REPARATION;
  let cle = cause;
  if (check !== null) {
    const rouge = (await rougesDeLaBase(ctx)).find(({ name }) => name === check);
    if (rouge === undefined) throw new Refus(`${check} is not red on the head of ${ctx.branche}: no fix ticket for it`);
    const run = jobDuCheck(rouge)?.run;
    // Un check qui n'est pas un job de GitHub Actions ne se relance pas : sa réparation s'ouvre sans relance.
    if (run !== undefined) {
      const { tentative, termine } = await github.etatDuRun(run);
      if (tentative <= 1) {
        await github.relancerLesEchecs(run);
        return { ticket: reveil.ticket, fait: `reran the failed jobs of ${check} (run ${run}) first: a fix ticket is filed only if the rerun stays red` };
      }
      if (!termine) throw new Refus(`the rerun of ${check} (run ${run}) is still running: a fix ticket waits for it to stay red`);
    }
    labels = [...LABELS_REPARATION, "fix"];
    cle = causeDuCheck(check);
  }
  const lues = await github.ouvertes();
  if (lues.inchange) throw new Refus("the open tickets could not be read: no fix ticket is filed without checking that none has the same cause");
  const marque = marqueDeCause(cle);
  const doublon = lues.issues.find(
    ({ body, association }) => DE_CONFIANCE.includes(association) && body.includes(marque),
  );
  if (doublon !== undefined) throw new Refus(`#${doublon.number} is already open for this cause: no second fix ticket`, doublon.number);
  const cree = await github.creerIssue({ titre: title, corps: `${body}\n\n${marque}`, labels });
  return { ticket: cree, fait: `filed #${cree}, one fix ticket for a new cause (${cause}), after checking that no open ticket has it` };
}

async function poserLaQuestion(gh: GitHubDesGestes, ticket: number, kind: "product" | "design", question: string): Promise<Effet> {
  if (gesteGit({ enonce: question }) !== null || LECTURE_DE_LOG.test(question)) {
    throw new Refus("the chef is never asked for a rerun, a merge, a rebase or a log reading: the kitchen does it, and no TODO card was posted");
  }
  const produit = carteQuestionProduit(ticket, question);
  const carte: Carte = kind === "product" ? produit : { ...produit, texte: produit.texte.replace("a product question", "a design question") };
  const pose = await poserCarte(ticket, carte, gh);
  if (pose === "absente") throw new Refus(`#${ticket} is not an issue of the repository`);
  if (pose === "deja") throw new Refus(`a question card already awaits the chef on #${ticket}: no second one`);
  return { ticket, fait: `posted a TODO card for the chef on #${ticket}, a ${kind} question: ${question}` };
}

// Ce que le réveil dit, la raison d'un geste au journal des gestes.
export const direReveil = (reveil: Reveil): string =>
  reveil.cause === "main-red"
    ? `the base has been red since ${reveil.since}`
    : reveil.cause === "takes"
      ? `#${reveil.ticket} was taken ${reveil.takes} times without delivering`
      : reveil.cause === "no-progress"
        ? `#${reveil.ticket} (${reveil.state}) has made no progress since ${reveil.since}`
        : `nothing was merged since ${reveil.since} while #${reveil.ticket} is cookable`;

const ETATS = { done: "did", refused: "refused", failed: "failed" } as const;

// Joue la décision du manager sur ce réveil, puis écrit le seul commentaire du
// run sur le ticket où il a agi — ou, refusé, sur celui que le geste visait.
// Un commentaire qui ne part pas défait ce qui n'a pas de sens sans lui (le
// label `waiting` sans sa marque), et l'échec est rendu.
export async function jouerLeRun(ctx: ContexteDesGestes, reveil: Reveil, decision: Decision): Promise<Trace> {
  const ecrits: string[] = [];
  // Le GitHub des gestes : tout, sauf `commenter`, dont le corps est gardé pour le commentaire du run.
  const gh: GitHubDesGestes = Object.assign(Object.create(ctx.github) as GitHubDesGestes, {
    commenter: async (_numero: number, corps: string) => void ecrits.push(corps),
  });
  const geste = lireGeste(decision.gesture);
  const cible = "refus" in geste ? reveil.ticket : "ticket" in geste ? (geste.ticket ?? reveil.ticket) : reveil.ticket;
  let resultat: { outcome: Trace["outcome"]; ticket: number | null; dit: string; defaire?: () => Promise<void> };
  if ("refus" in geste) resultat = { outcome: "refused", ticket: cible, dit: geste.refus };
  else {
    try {
      const effet =
        geste.gesture === "rerun"
          ? await relancer(ctx, cible)
          : geste.gesture === "back-on-rail"
            ? await remettreSurLeRail(ctx, geste.ticket, geste.note)
            : geste.gesture === "waiting"
              ? await mettreDeCote(ctx, gh, geste.ticket, geste.what, geste.who)
              : geste.gesture === "close-duplicate"
                ? await fermerLeDoublon(ctx, geste.ticket, geste.of)
                : geste.gesture === "fix"
                  ? await ouvrirLeFix(ctx, reveil, geste)
                  : await poserLaQuestion(gh, geste.ticket, geste.kind, geste.question);
      resultat = { outcome: "done", ticket: effet.ticket, dit: effet.fait, ...(effet.defaire === undefined ? {} : { defaire: effet.defaire }) };
    } catch (erreur) {
      const refuse = erreur instanceof Refus || erreur instanceof GesteRefuse;
      const ticket = erreur instanceof Refus && erreur.ticket !== undefined ? erreur.ticket : cible;
      resultat = { outcome: refuse ? "refused" : "failed", ticket, dit: `${geste.gesture}: ${erreur instanceof Error ? erreur.message : String(erreur)}` };
    }
  }
  const saw = texte(decision.saw) ?? "the manager did not say what it saw";
  const trace = [MARQUE_DU_SUPERVISEUR, `**Supervisor** — woke because ${direReveil(reveil)}.`, "", `- **saw**: ${saw}`, `- **${ETATS[resultat.outcome]}**: ${resultat.dit}`].join("\n");
  // Une carte TODO remet la question au chef ; tout autre geste fait, la cuisine l'a réglé seule.
  const fait = "refus" in geste || resultat.outcome !== "done" ? null : { line: resultat.dit, reason: direReveil(reveil), outcome: geste.gesture === "todo" ? OUTCOME.HANDED_TO_CHEF : OUTCOME.FIXED_BY_SELF };
  if (resultat.ticket === null) return { outcome: resultat.outcome, ticket: null, comment: null, gesture: fait };
  const corps = [...ecrits, trace].join("\n\n");
  try {
    await ctx.github.commenter(resultat.ticket, corps);
  } catch (erreur) {
    await resultat.defaire?.().catch(() => undefined);
    throw erreur;
  }
  return { outcome: resultat.outcome, ticket: resultat.ticket, comment: corps, gesture: fait };
}
