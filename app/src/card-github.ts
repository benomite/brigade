// L'histoire et la discussion d'une carte du rail, sur sa fiche, lues de GitHub — jamais de la box (#1735). Le `gh` du
// poste lit l'issue du ticket dans le dépôt du projet, et les PR qui la ferment : la fiche s'ouvre box éteinte.
// Ce que GitHub ne porte pas — les tokens et la durée des cooks, la rétro, le verdict de la relecture — est écrit
// « not communicated », jamais inventé. Une issue absente de GitHub se dit en une phrase.
import { failure, lancer, type Settings } from "./question.ts";
import { NON_COMMUNIQUE, instant, type StepDite, type Histoire } from "./histoire.ts";
import type { Discussion, MessageDit } from "./discussion.ts";
import { liensDe, rendre } from "./markdown.ts";
import { PR_DU_TICKET } from "./vue/pr-du-ticket.js";

const objet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
const texte = (valeur: unknown): valeur is string => typeof valeur === "string";
const heure = (valeur: unknown): valeur is string => texte(valeur) && !Number.isNaN(Date.parse(valeur));
const numero = (ticket: unknown): ticket is number => typeof ticket === "number" && Number.isSafeInteger(ticket) && ticket >= 1;

const ILLISIBLE = "not read: GitHub did not return the issue in the expected shape";
const SANS_AUTEUR = "a deleted GitHub account";
const RETRO = "retro not communicated: GitHub does not carry it";

// L'issue n'existe pas (ou plus) dans ce dépôt : `gh` le dit ainsi.
const ABSENTE = /could not resolve to an issue|issue.*not found|HTTP 404/i;
const absente = (ticket: number, repository: string) => `${repository}#${ticket} is not on GitHub: there is nothing to read`;

type Read = { lu: Record<string, unknown> } | { sans: string };

// `gh <args>` lu en JSON : l'objet, ou la phrase qui dit pourquoi on n'en lit rien.
async function lireJson(settings: Settings, args: string[], ticket: number, repository: string): Promise<Read> {
  const rendu = await lancer(settings, args);
  if (rendu.erreur !== null) {
    if (ABSENTE.test(`${rendu.erreurs}${rendu.sortie}`)) return { sans: `no issue to read: ${absente(ticket, repository)}` };
    return { sans: `not read: ${failure(settings, args, { ...rendu, erreur: rendu.erreur })}` };
  }
  try {
    const lu: unknown = JSON.parse(rendu.sortie);
    return objet(lu) ? { lu } : { sans: ILLISIBLE };
  } catch {
    return { sans: ILLISIBLE };
  }
}

const AUTEUR = (brut: unknown) => {
  const login = objet(brut) && objet(brut.author) ? brut.author.login : undefined;
  return texte(login) && login !== "" ? login : SANS_AUTEUR;
};

function message(brut: unknown, corps: boolean, creeA: unknown): MessageDit | undefined {
  if (!objet(brut) || !heure(creeA) || !texte(brut.body)) return undefined;
  return { auteur: AUTEUR(brut), at: instant(creeA), blocs: rendre(brut.body), ...(corps ? { corps: true as const, source: brut.body } : {}) };
}

// L'issue et ses commentaires, du plus ancien au plus récent, et les adresses qu'un clic peut y ouvrir.
export async function discussionDeGitHub(settings: Settings, repository: string, ticket: unknown): Promise<Discussion> {
  if (!numero(ticket)) return { sans: "not read: the sheet names no ticket" };
  const lue = await lireJson(settings, ["issue", "view", String(ticket), "--repo", repository, "--json", "title,state,body,author,createdAt,comments"], ticket, repository);
  if ("sans" in lue) return lue;
  const { title, state, comments } = lue.lu;
  if (!texte(title) || !Array.isArray(comments)) return { sans: ILLISIBLE };
  const ouvre = message(lue.lu, true, lue.lu.createdAt);
  const suite = comments.map((comment) => message(comment, false, objet(comment) ? comment.createdAt : undefined));
  if (ouvre === undefined || suite.some((dit) => dit === undefined)) return { sans: ILLISIBLE };
  const messages = [ouvre, ...(suite as MessageDit[])];
  return { titre: title, ouverte: String(state).toUpperCase() !== "CLOSED", messages, liens: [...new Set(messages.flatMap(({ blocs }) => liensDe(blocs)))] };
}

// L'histoire d'un ticket, de ce que GitHub en garde : l'issue ouverte, chaque PR qui la ferme — livrée, puis mergée —,
// l'issue fermée. Dans l'ordre du temps. Le coût et la rétro, que seul le journal de la box porte, sont dits non communiqués.
export async function histoireDeGitHub(settings: Settings, repository: string, ticket: unknown): Promise<Histoire> {
  if (!numero(ticket)) return { sans: "not read: the sheet names no ticket" };
  const lue = await lireJson(settings, ["issue", "view", String(ticket), "--repo", repository, "--json", "createdAt,closedAt,state,closedByPullRequestsReferences"], ticket, repository);
  if ("sans" in lue) return lue;
  const { createdAt, closedAt, closedByPullRequestsReferences: refs } = lue.lu;
  if (!heure(createdAt)) return { sans: ILLISIBLE };
  const steps: { t: number; etape: StepDite }[] = [{ t: Date.parse(createdAt), etape: { libelle: "arrived", at: instant(createdAt) } }];
  let merge = false;
  for (const ref of Array.isArray(refs) ? refs : []) {
    if (!objet(ref) || !Number.isSafeInteger(ref.number)) continue;
    const pr = await lireJson(settings, ["pr", "view", String(ref.number), "--repo", repository, "--json", "createdAt,mergedAt"], ticket, repository);
    if ("sans" in pr) return pr;
    const { createdAt: livree, mergedAt } = pr.lu;
    if (heure(livree)) steps.push({ t: Date.parse(livree), etape: { libelle: `delivered (${PR_DU_TICKET(ticket)})`, at: instant(livree) } });
    if (heure(mergedAt)) {
      merge = true;
      steps.push({ t: Date.parse(mergedAt), etape: { libelle: `merged (${PR_DU_TICKET(ticket)})`, at: instant(mergedAt) } });
    }
  }
  if (!merge && heure(closedAt)) steps.push({ t: Date.parse(closedAt), etape: { libelle: "closed without a merge", at: instant(closedAt) } });
  steps.sort((a, b) => a.t - b.t);
  return {
    etapes: steps.map(({ etape: step }) => step),
    cout: { tokens: NON_COMMUNIQUE, duree: NON_COMMUNIQUE, essais: NON_COMMUNIQUE, minimum: false },
    retro: { sans: RETRO },
  };
}
