// L'issue d'un ticket et sa discussion, sur sa fiche — quelle que soit sa carte : ce que le runtime
// en dit par `pass <ticket> issue` (runtime/src/issue-ticket.ts) — le corps, puis les commentaires
// du plus ancien au plus récent, chacun avec son auteur et sa date —, le markdown rendu (markdown.ts).
// Et le commentaire que le chef y ajoute : `pass <ticket> comment <texte>`, sur la box du projet,
// au clic et seulement au clic. Aucun LLM, aucune reformulation : le texte part tel qu'il est
// écrit, sous le `gh` du compte du service de la box. La commande se compose ici, jamais dans la vue.
import { echecDe, type Rendu, type Servi } from "./box.ts";
import type { Projet } from "./config.ts";
import { instant } from "./histoire.ts";
import { liensDe, rendre, type Bloc } from "./markdown.ts";

// Un message de l'issue, dit : qui l'a écrit, quand (l'heure de GitHub), et son texte rendu.
// `corps` : c'est le corps de l'issue, le premier message — pas un commentaire.
export type MessageDit = { auteur: string; at: string; blocs: Bloc[]; corps?: true };
// La discussion lue : le titre et l'état de l'issue, ses messages dans l'ordre, et les adresses
// qu'un clic peut y ouvrir — ou pourquoi on n'en lit rien.
export type Discussion = { titre: string; ouverte: boolean; messages: MessageDit[]; liens: string[] } | { sans: string };
// Ce qu'il est advenu d'un commentaire : posté — `prix` : ce que la box dit qu'il coûte —, ou pourquoi
// il ne l'est pas. `peutEtre` : rien ne dit qu'il ne l'est pas — `ssh` arrêté en route, ou GitHub qui
// n'a pas confirmé : la discussion se relit avant d'écrire de nouveau.
export type Commente = { poste: true; prix: string } | { poste: false; refus: string; peutEtre?: true };

// Les deux commandes, telles qu'elles partent après `brigade <projet>`.
export const lecture = (ticket: number) => `pass ${ticket} issue`;
export const ecriture = (ticket: number, texte: string) => `pass ${ticket} comment ${citer(texte)}`;

// Le texte tel que le shell de la box le rendra à la commande : en un seul argument, sans rien en
// exécuter — retours à la ligne compris.
export const citer = (texte: string) => `'${texte.replaceAll("'", `'\\''`)}'`;

// GitHub refuse un commentaire plus long.
export const LONGUEUR_MAX = 65_536;

const ILLISIBLE = "not read: the box did not return the issue in the expected shape";
const SANS_AUTEUR = "a deleted GitHub account";

const objet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
const texte = (valeur: unknown): valeur is string => typeof valeur === "string";
const heure = (valeur: unknown): valeur is string => texte(valeur) && !Number.isNaN(Date.parse(valeur));
const numero = (ticket: unknown): ticket is number => typeof ticket === "number" && Number.isSafeInteger(ticket) && ticket >= 1;

// La première ligne de la sortie qui se lit en JSON : la commande n'en écrit qu'une.
function json(sortie: string): unknown {
  for (const ligne of sortie.split("\n")) {
    if (!ligne.trimStart().startsWith("{")) continue;
    try {
      return JSON.parse(ligne);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function message(brut: unknown, corps: boolean): MessageDit | undefined {
  if (!objet(brut) || !texte(brut.author) || !heure(brut.at) || !texte(brut.body)) return undefined;
  return { auteur: brut.author === "" ? SANS_AUTEUR : brut.author, at: instant(brut.at), blocs: rendre(brut.body), ...(corps ? { corps: true as const } : {}) };
}

// Ce que `pass <ticket> issue` a rendu, en mots de la fiche — ou pourquoi on n'en lit rien. Une carte
// sans issue sort en 1 avec sa raison en JSON : c'est une réponse, pas une panne.
export function discussionDe({ lance, erreur, sortie, erreurs }: Rendu, delaiMs: number): Discussion {
  const lu = json(sortie);
  if (objet(lu) && lu.found === false) return { sans: `no issue to read: ${texte(lu.reason) ? lu.reason : "the box does not say why"}` };
  if (erreur !== null) return { sans: `not read: ${echecDe({ lance, erreur, sortie, erreurs }, delaiMs).erreur}` };
  if (!objet(lu) || lu.found !== true || !objet(lu.issue)) return { sans: ILLISIBLE };
  const { title, state, body, comments } = lu.issue;
  if (!texte(title) || !Array.isArray(comments)) return { sans: ILLISIBLE };
  const ouvre = message(body, true);
  const suite = comments.map((commentaire) => message(commentaire, false));
  if (ouvre === undefined || suite.some((dit) => dit === undefined)) return { sans: ILLISIBLE };
  const messages = [ouvre, ...(suite as MessageDit[])];
  return { titre: title, ouverte: state !== "closed", messages, liens: [...new Set(messages.flatMap(({ blocs }) => liensDe(blocs)))] };
}

// Ce que `pass <ticket> comment <texte>` a rendu : `done`, et ce que la box dit du geste.
export function commenteDe({ lance, erreur, sortie, erreurs }: Rendu, delaiMs: number): Commente {
  const lu = json(sortie);
  if (objet(lu) && lu.done === true) return { poste: true, prix: texte(lu.price) ? lu.price : "not communicated" };
  if (objet(lu) && lu.done === false) return { poste: false, refus: `nothing was posted: ${texte(lu.reason) ? lu.reason : "the box does not say why"}` };
  if (erreur === null) return { poste: false, refus: "not confirmed: the box did not say whether the comment was posted — the discussion is read again, check it before posting again", peutEtre: true };
  return { poste: false, refus: `not confirmed — it may have been posted: the discussion is read again, check it before posting again.\n${echecDe({ lance, erreur, sortie, erreurs }, delaiMs).erreur}`, peutEtre: true };
}

// Ce qui lance une commande sur la box du projet, et ce qu'elle a rendu (box.ts, `lancerGeste`).
export type Lancer = (servi: Servi, commande: string) => Promise<Rendu>;

// La discussion de ce ticket, lue sur la box de ce projet.
export async function lireDiscussion(lancer: Lancer, projet: Projet, ticket: unknown, delaiMs: number): Promise<Discussion> {
  if (projet.box === undefined) return { sans: "no box for this project: the app has nothing to read" };
  if (!numero(ticket)) return { sans: "not read: the sheet names no ticket" };
  return discussionDe(await lancer({ nom: projet.nom, box: projet.box }, lecture(ticket)), delaiMs);
}

// Le commentaire du chef, posté sur l'issue de ce ticket par la box de ce projet. Rien ne part d'un
// texte vide, ni d'un projet qui n'a pas de box ou qui ne s'ouvre pas.
export async function commenter(lancer: Lancer, projet: Projet, ticket: unknown, saisi: unknown, delaiMs: number): Promise<Commente> {
  if (!numero(ticket)) return { poste: false, refus: "nothing was posted: the sheet names no ticket" };
  if (!texte(saisi) || saisi.trim() === "") return { poste: false, refus: "nothing was posted: the comment is empty — write something to post" };
  if (saisi.includes("\0")) return { poste: false, refus: "nothing was posted: the comment carries a NUL character" };
  if (saisi.trim().length > LONGUEUR_MAX) return { poste: false, refus: `nothing was posted: GitHub refuses a comment longer than ${LONGUEUR_MAX} characters — this one has ${saisi.trim().length}` };
  if (projet.box === undefined) return { poste: false, refus: `nothing was posted: “${projet.nom}” has no box — there is no command to run` };
  if (projet.refus !== undefined) return { poste: false, refus: `nothing was posted: “${projet.nom}” does not open — ${projet.refus}` };
  // Les retours à la ligne du poste sont ceux de GitHub : `\n`.
  return commenteDe(await lancer({ nom: projet.nom, box: projet.box }, ecriture(ticket, saisi.trim().replace(/\r\n?/g, "\n"))), delaiMs);
}
