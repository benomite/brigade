// L'issue d'un ticket et sa discussion, sur sa fiche — quelle que soit sa carte : ce que le runtime
// en dit par `pass <ticket> issue` (runtime/src/issue-ticket.ts) — le corps, puis les commentaires
// du plus ancien au plus récent, chacun avec son auteur et sa date —, le markdown rendu (markdown.ts).
// Et le commentaire que le chef y ajoute, et la demande au second : postés sur le tableau de la cuisine
// du projet (`/brigade comment #<ticket> <texte>`, `/brigade ask #<ticket> [contexte]`,
// docs/tableau-gestes.md, #1845), au clic et seulement au clic. La box les
// joue à son tick, comme `pass <ticket> comment` et `pass <ticket> ask` : le commentaire part sous le
// `gh` de son compte, celui du chef ; la demande, elle la compose et la rend dans le bloc machine du
// tableau. Aucun LLM, aucune reformulation : le texte part tel qu'il est écrit. Le geste se compose
// ici, jamais dans la vue.
import { echecDe, type Rendu } from "./box.ts";
import type { Projet } from "./config.ts";
import { instant } from "./histoire.ts";
import { liensDe, rendre, type Bloc } from "./markdown.ts";
import { ditParLaBox, enSuite, type DecisionDuChef, type EtatDuGeste } from "./tableau-gestes/gestes.ts";

// Un message de l'issue, dit : qui l'a écrit, quand (l'heure de GitHub), et son texte rendu.
// `corps` : c'est le corps de l'issue, le premier message — pas un commentaire.
export type MessageDit = { auteur: string; at: string; blocs: Bloc[]; corps?: true };
// La discussion lue : le titre et l'état de l'issue, ses messages dans l'ordre, et les adresses
// qu'un clic peut y ouvrir — ou pourquoi on n'en lit rien.
export type Discussion = { titre: string; ouverte: boolean; messages: MessageDit[]; liens: string[] } | { sans: string };
// Ce qu'il est advenu d'un commentaire : posté — `prix` : ce que la box dit qu'il coûte —, ou pourquoi
// il ne l'est pas. `peutEtre` : rien ne dit qu'il ne l'est pas — posté sur le tableau sans que la box
// l'ait encore joué : la discussion se relit avant d'écrire de nouveau.
export type Commente = { poste: true; prix: string } | { poste: false; refus: string; peutEtre?: true };

// GitHub refuse un commentaire plus long.
export const LONGUEUR_MAX = 65_536;

const ILLISIBLE = "not read: the station did not return the issue in the expected shape";
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
  if (objet(lu) && lu.found === false) return { sans: `no issue to read: ${texte(lu.reason) ? lu.reason : "the station does not say why"}` };
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

// Ce que la demande au second est devenue : celle que l'app écrit dans le second, sans Entrée ; ou,
// quand la box tient le second du projet, qu'elle la lui a envoyée (`auSecond`) — sa réponse vient sous
// le geste, sur le tableau ; ou pourquoi il n'y en a pas.
export type Demandee = { demande: string } | { auSecond: string } | { refus: string };

// Ce qui poste une décision sur le tableau de ce projet et la suit jusqu'à la réponse de la box (main.ts).
export type AuTableau = (decision: DecisionDuChef) => Promise<EtatDuGeste>;

// Le commentaire du chef, posté sur l'issue de ce ticket par la box de ce projet, depuis son tableau.
// Rien ne part d'un texte vide, ni d'un projet qui ne s'ouvre pas.
export async function commenter(auTableau: AuTableau, projet: Projet, ticket: unknown, saisi: unknown): Promise<Commente> {
  if (!numero(ticket)) return { poste: false, refus: "nothing was posted: the sheet names no ticket" };
  if (!texte(saisi) || saisi.trim() === "") return { poste: false, refus: "nothing was posted: the comment is empty — write something to post" };
  if (saisi.includes("\0")) return { poste: false, refus: "nothing was posted: the comment carries a NUL character" };
  if (saisi.trim().length > LONGUEUR_MAX) return { poste: false, refus: `nothing was posted: GitHub refuses a comment longer than ${LONGUEUR_MAX} characters — this one has ${saisi.trim().length}` };
  if (projet.refus !== undefined) return { poste: false, refus: `nothing was posted: “${projet.nom}” does not open — ${projet.refus}` };
  // Les retours à la ligne du poste sont ceux de GitHub : `\n`.
  const etat = await auTableau({ geste: "comment", ticket, commentaire: saisi.trim().replace(/\r\n?/g, "\n") });
  if (etat.etat === "failed") return { poste: false, refus: `nothing was posted: ${enSuite(etat.raison)}` };
  if (etat.etat === "taken") return { poste: true, prix: ditParLaBox(etat.reponse).prix || "not communicated" };
  if (etat.etat === "refused") return { poste: false, refus: `nothing was posted: ${ditParLaBox(etat.reponse).dit || "the box does not say why"}` };
  return { poste: false, refus: "not posted yet: it is on the Kitchen board, and the box posts it on the issue at its next tick — the discussion is read again, check it before posting again", peutEtre: true };
}

// La demande au second pour ce ticket, composée par la box de ce projet d'après le contexte saisi, depuis
// son tableau. Un contexte vide est permis : la demande nomme l'issue seule. Rien n'est composé d'un projet
// qui ne s'ouvre pas ; et rien n'est écrit ici : c'est l'appelant qui inscrit la demande.
export async function demanderAuSecond(auTableau: AuTableau, projet: Projet, ticket: unknown, contexte: unknown): Promise<Demandee> {
  if (!numero(ticket)) return { refus: "nothing was written: the sheet names no ticket" };
  if (contexte !== undefined && !texte(contexte)) return { refus: "nothing was written: the context is not a text" };
  const saisi = (contexte ?? "").trim();
  if (saisi.includes("\0")) return { refus: "nothing was written: the context carries a NUL character" };
  if (projet.refus !== undefined) return { refus: `nothing was written: “${projet.nom}” does not open — ${projet.refus}` };
  const etat = await auTableau({ geste: "ask", ticket, contexte: saisi.replace(/\r\n?/g, "\n") });
  if (etat.etat === "failed") return { refus: `nothing was written: ${enSuite(etat.raison)}` };
  if (etat.etat === "pending") return { refus: "nothing was written: the request is posted on the Kitchen board, and the box has not composed it yet — it does at its next tick" };
  if (etat.etat === "refused") return { refus: `nothing was written: ${ditParLaBox(etat.reponse).dit || "the box does not say why"}` };
  if (etat.lu.second !== undefined) return { auSecond: "the box holds the project's second and sent it the request: its answer comes under your gesture, on the Kitchen board" };
  const demande = etat.lu.demande ?? "";
  return demande.trim() === "" ? { refus: "nothing was written: the box did not return the request in the expected shape" } : { demande };
}
