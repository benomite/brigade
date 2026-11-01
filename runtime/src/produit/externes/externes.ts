// Les issues que d'autres que le chef ouvrent sur le dépôt du projet (#1954,
// épique #1949) : le premier canal de retours une fois le projet ouvert. Le
// rôle produit décide de chacune ; ce module fait le reste, et rien d'autre :
// - la liste de celles qui n'ont pas encore de réponse de brigade
//   (`sansReponse`) ;
// - celles qui attendent depuis plus d'un jour (`enRetard`), que la cadence
//   fait passer devant ;
// - l'application de la décision (`appliquer`) : doublon, acceptée, déclinée
//   avec sa raison, ou portée au chef dans TODO quand elle change la direction
//   du produit — seul cas où quelque chose lui est demandé.
//
// Le chef se lit dans les réglages du projet (`chef`, `projet.json`), jamais
// en dur. Rien n'est posté ailleurs que sur les issues du dépôt que le port
// sert (`DepotDesExternes`) : le doublon se dit `#n`, du même dépôt.
//
// Une réponse de brigade se reconnaît à son marqueur, que chaque réponse
// porte. Un commentaire du chef en est une aussi : il a répondu lui-même.
// Sans E/S propre : GitHub et TODO arrivent par leurs ports (`branchements.ts`).
import type { ReglagesProjet } from "../../reglages-projet/reglages.ts";

// Le marqueur des réponses de brigade à une issue venue d'ailleurs.
export const MARQUEUR = "<!-- brigade:externe -->";
// Le délai dans lequel une issue venue d'ailleurs reçoit sa réponse.
export const DELAI_DE_REPONSE_MS = 24 * 60 * 60 * 1000;

// Les labels que pose une issue acceptée : celui des issues du produit, et
// celui des issues que le rôle produit a portées (épique #1949).
export const PRODUIT = "product";
export const PORTEE_PAR_LE_PRODUIT = "filed-by:product";
export const PRIOS = ["prio:0", "prio:1", "prio:2", "prio:3"] as const;
export type Prio = (typeof PRIOS)[number];
// Une issue déjà sur le rail : quelqu'un l'a déjà prise, elle n'attend pas de
// réponse.
const SUR_LE_RAIL = "fire";

export type IssueExterne = { number: number; title: string; author: string; createdAt: string; labels: string[]; url: string; body: string };
export type CommentaireExterne = { author: string; body: string };

// Ce que ce module lit et écrit sur le dépôt du projet, et sur lui seul.
export type DepotDesExternes = {
  // Les issues ouvertes, PR écartées.
  ouvertes(): Promise<IssueExterne[]>;
  // Les commentaires d'une issue, du plus ancien au plus récent.
  commentaires(numero: number): Promise<CommentaireExterne[]>;
  commenter(numero: number, corps: string): Promise<void>;
  labelliser(numero: number, labels: string[]): Promise<void>;
  delabelliser(numero: number, label: string): Promise<void>;
  ecrireCorps(numero: number, corps: string): Promise<void>;
  fermer(numero: number): Promise<void>;
};

// Pose devant le chef, dans TODO, une issue qui changerait la direction du
// produit, avec sa raison en une ligne.
export type VersTodo = (issue: IssueExterne, raison: string) => void | Promise<void>;

// Ce que le rôle produit décide d'une issue.
export type Decision =
  | { verdict: "duplicate"; original: number }
  | { verdict: "accepted"; prio: Prio; reason: string }
  | { verdict: "declined"; reason: string }
  | { verdict: "direction"; reason: string };

export class DecisionRefusee extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecisionRefusee";
  }
}

// Le compte GitHub du chef, tel que les réglages du projet le portent. Sans
// lui, rien ne distingue ses issues de celles des autres : le dire, ne rien
// deviner.
export function chefDuProjet(reglages: Pick<ReglagesProjet, "chef"> | null): string {
  const chef = reglages?.chef?.trim() ?? "";
  if (chef === "") throw new DecisionRefusee("the project settings name no chef: set `chef` to the chef's GitHub login in `.claude/brigade/projet.json`");
  return chef;
}

const memeCompte = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
// Un compte d'application (`…[bot]`) : celui d'un rôle de brigade sous son
// identité, ou d'un autre outil — personne n'attend de réponse.
const estUnRobot = (compte: string) => compte.endsWith("[bot]");

// Ouverte par quelqu'un d'autre que le chef, une personne.
export const venueDAilleurs = (issue: IssueExterne, chef: string) => issue.author !== "" && !memeCompte(issue.author, chef) && !estUnRobot(issue.author);

// Brigade y a répondu : une de ses réponses, ou un mot du chef.
export const repondue = (commentaires: CommentaireExterne[], chef: string) => commentaires.some((commentaire) => commentaire.body.includes(MARQUEUR) || memeCompte(commentaire.author, chef));

// Les issues ouvertes par d'autres que le chef, sans réponse de brigade, de la
// plus ancienne à la plus récente. Les commentaires ne se lisent que pour
// celles qui viennent d'ailleurs.
export async function sansReponse(depot: DepotDesExternes, chef: string): Promise<IssueExterne[]> {
  const candidates = (await depot.ouvertes()).filter((issue) => venueDAilleurs(issue, chef) && !issue.labels.includes(SUR_LE_RAIL));
  const attendent: IssueExterne[] = [];
  for (const issue of candidates) if (!repondue(await depot.commentaires(issue.number), chef)) attendent.push(issue);
  return attendent.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.number - b.number);
}

// Celles qui attendent depuis plus d'un jour : en retard sur la promesse.
export function enRetard(issues: IssueExterne[], maintenant: number): IssueExterne[] {
  return issues.filter((issue) => maintenant - Date.parse(issue.createdAt) > DELAI_DE_REPONSE_MS);
}

// Ce que la cadence lit à chaque tour : ce qui attend une réponse, et ce qui
// l'attend depuis trop longtemps.
export type Releve = { aRepondre: IssueExterne[]; enRetard: IssueExterne[] };

export async function relever(depot: DepotDesExternes, chef: string, maintenant: number): Promise<Releve> {
  const aRepondre = await sansReponse(depot, chef);
  return { aRepondre, enRetard: enRetard(aRepondre, maintenant) };
}

// La raison d'une décision : dite, sur une ligne.
function raisonDe(decision: { reason: string }): string {
  const raison = decision.reason?.trim() ?? "";
  if (raison === "") throw new DecisionRefusee("a decision states its reason");
  if (/[\r\n]/.test(raison)) throw new DecisionRefusee("a decision states its reason on one line");
  return raison;
}

// La ligne qui ouvre le corps d'une issue acceptée : d'où elle vient et
// pourquoi, ce que le chef lit d'un coup d'œil.
export const ligneDAcceptation = (raison: string) => `> **${PORTEE_PAR_LE_PRODUIT}** — accepted from an outside issue: ${raison}`;

const signer = (texte: string) => `${texte}\n\n${MARQUEUR}`;

// Ce que dit chaque réponse. Elles ne nomment jamais le chef : aucune ne lui
// demande rien.
export const reponses = {
  duplicate: (original: number) => signer(`Duplicate of #${original}\n\nThanks for the report. This is already tracked in #${original}, so this issue is closed as its duplicate: follow #${original} for its progress.`),
  accepted: (prio: Prio, raison: string) => signer(`Thanks for the report. It is accepted as a product issue, labelled \`${prio}\`: ${raison}`),
  declined: (raison: string) => signer(`Thanks for the report. It is declined, and this issue is closed: ${raison}`),
  direction: () => signer("Thanks for the report. It would change the direction of the product, so it waits for a decision from the project's owner before anything is done."),
};

// Ce qui a été fait sur l'issue.
export type Applique = { numero: number; verdict: Decision["verdict"] };

// Applique la décision du rôle produit à l'issue. Tout ce qui peut la refuser
// est vu avant d'écrire. La réponse, qui porte le marqueur, part en dernier
// (le doublon et le refus ferment ensuite) : une application interrompue
// laisse l'issue sans réponse, et la suivante la reprend.
export async function appliquer(depot: DepotDesExternes, versTodo: VersTodo, chef: string, issue: IssueExterne, decision: Decision): Promise<Applique> {
  if (!venueDAilleurs(issue, chef)) throw new DecisionRefusee(`#${issue.number} was opened by ${issue.author || "no one known"}, not by someone other than the chef: nothing to answer`);
  const fait: Applique = { numero: issue.number, verdict: decision.verdict };
  switch (decision.verdict) {
    case "duplicate": {
      const { original } = decision;
      if (!Number.isSafeInteger(original) || original < 1) throw new DecisionRefusee("a duplicate names its original by its issue number");
      if (original === issue.number) throw new DecisionRefusee(`#${issue.number} cannot be a duplicate of itself`);
      await depot.commenter(issue.number, reponses.duplicate(original));
      await depot.fermer(issue.number);
      return fait;
    }
    case "accepted": {
      const raison = raisonDe(decision);
      if (!(PRIOS as readonly string[]).includes(decision.prio)) throw new DecisionRefusee(`an accepted issue gets one priority: ${PRIOS.join(", ")}`);
      for (const autre of issue.labels) if (autre !== decision.prio && (PRIOS as readonly string[]).includes(autre)) await depot.delabelliser(issue.number, autre);
      await depot.labelliser(issue.number, [PRODUIT, decision.prio, PORTEE_PAR_LE_PRODUIT]);
      const ligne = ligneDAcceptation(raison);
      if (!issue.body.startsWith(ligne)) await depot.ecrireCorps(issue.number, issue.body.trim() === "" ? ligne : `${ligne}\n\n${issue.body}`);
      await depot.commenter(issue.number, reponses.accepted(decision.prio, raison));
      return fait;
    }
    case "declined": {
      const raison = raisonDe(decision);
      await depot.commenter(issue.number, reponses.declined(raison));
      await depot.fermer(issue.number);
      return fait;
    }
    case "direction": {
      const raison = raisonDe(decision);
      await versTodo(issue, raison);
      await depot.commenter(issue.number, reponses.direction());
      return fait;
    }
    default:
      throw new DecisionRefusee(`unknown verdict “${(decision as { verdict?: unknown }).verdict}”: duplicate, accepted, declined or direction`);
  }
}
