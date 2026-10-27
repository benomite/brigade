// La carte de TODO (#1281, épique #1277) : ce que le runtime laisse entrer dans TODO — un choix de
// produit ou une validation de design (runtime/src/carte-todo.ts) — porte une seule question, ses
// choix et, pour un écran, ses captures avant et après. `facts` la donne dans `attend[].carte`
// (docs/runtime/manager.md, « What enters TODO, and how you answer »). La carte du rail la montre
// telle quelle : la question, un bouton par choix, un champ pour répondre en texte libre, et les
// captures quand il y en a — une carte sans écran n'a pas de zone de captures.
//
// Un clic sur un choix, ou le texte envoyé, est la réponse du chef : elle est lue ici (`reponseLue`) avant de partir
// sur le tableau de la cuisine (tableau-gestes/rail.ts). La vue nomme le ticket, la question qu'elle montre, et le rang
// du choix ou le texte.
import { capturesDeCarte, type CapturesDeCarte, type CapturesLues } from "./captures.ts";
import { LONGUEUR_MAX } from "./discussion.ts";
import type { EnvoiDeCarte } from "./tableau/envois.ts";

// La carte telle que `facts` la donne : sa sorte (`product`, `design`), ce qui se passe en deux phrases
// au plus (`resume`, la forme unique de l'épique #1764 : runtime/src/carte-todo/forme.ts — absent d'un
// runtime d'avant elle), sa question, ses choix — chacun son texte et sa suite (`resume`, `merge`), dans
// l'ordre que `rail choose` numérote à partir de 1 —, et ses captures, nulles sur une carte sans écran.
// Une carte à un seul geste n'a rien à demander : sa question est nulle.
export type ChoixLu = { texte: string; suite: string };
export type CarteLue = { type: string; resume?: string; question: string | null; choix: ChoixLu[]; captures: CapturesLues | null };

// La dernière réponse du chef à la carte, telle que le tableau de la cuisine la montre (tableau/envois.ts, #1841) : son
// commentaire, la réponse dite en mots — le texte du choix, ou ce que le chef a écrit —, son heure, et ce que la box en a
// fait : `attente` tant qu'elle n'a rien dit, `joue`, ou `refuse` et sa raison ; `dit`, la ligne qu'elle a répondue.
export type EnvoiVu = { commentaire: number; reponse: string; le: string } & ({ etat: "attente" } | { etat: "joue"; dit: string } | { etat: "refuse"; dit: string; raison: string });

// La carte telle que la vue la pose : sa sorte, ce qui se passe, sa question — nulle sur une carte à un
// seul geste —, ses choix — chacun avec son prix, qui passe au survol —, le prix d'une réponse en texte
// libre, ses captures, absentes sans écran, et la dernière réponse que le tableau montre — absente quand il
// n'en montre pas, ou que ses commentaires ne sont pas lus.
export type ChoixDeCarte = { texte: string; prix: string };
export type CarteDeTodo = { sorte: string; resume?: string; question: string | null; choix: ChoixDeCarte[]; prixDuTexte: string; captures?: CapturesDeCarte; envoi?: EnvoiVu };

// Ce que la vue envoie : la question qu'elle montre — nulle sur une carte à un seul geste ; rien ne part
// sur une carte qui a changé sous les yeux du chef —, et le rang d'un choix, à partir de 1, ou le texte
// du chef.
export type Reponse = { question: string | null } & ({ choix: number } | { texte: string });
// Ce qu'il en est advenu : la réponse est écrite — `dit`, ce que la box en dit —, ou rien ne l'est, et
// pourquoi, en une ligne, ce que la box a rendu au survol.
// `commentaire` : celui que la réponse a posté sur le tableau de la cuisine — la carte attend la cuisine jusqu'à ce que le
// tableau dise ce qu'il en est de lui, ou d'une réponse plus récente.
export type Rendu = { repondue: true; dit: string; commentaire?: number } | { refus: string; detail: string };

// Ce que chaque suite coûte, d'après le runtime (runtime/src/reponse-carte.ts).
const ECRITE = "your answer is written on the issue in your name";
const PRIX_DE_SUITE: Readonly<Record<string, string>> = {
  merge: `${ECRITE}, and the green delivery is merged into the integration branch under the station's GitHub account — a merge is not undone from the app`,
  resume: `${ECRITE}, and the kitchen takes the ticket up again with it — a cook may be launched on the project's quota`,
};
export const PRIX_DU_TEXTE = PRIX_DE_SUITE.resume as string;

const texte = (valeur: unknown): valeur is string => typeof valeur === "string";
const objet = (valeur: unknown): Record<string, unknown> | undefined => (typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Record<string, unknown>) : undefined);

// Les captures d'une carte, venues de la box : ce qui n'a pas leur forme n'est pas lu.
function capturesLues(brutes: unknown): CapturesLues | null {
  const lues = objet(brutes);
  if (lues === undefined || typeof lues.complet !== "boolean" || !Array.isArray(lues.ecrans)) return null;
  const ecrans = lues.ecrans.flatMap((brut: unknown) => {
    const lu = objet(brut);
    const adresse = (valeur: unknown) => valeur === null || texte(valeur);
    return lu !== undefined && texte(lu.ecran) && adresse(lu.avant) && adresse(lu.apres) ? [{ ecran: lu.ecran, avant: lu.avant as string | null, apres: lu.apres as string | null }] : [];
  });
  return { complet: lues.complet, ecrans };
}

// La carte venue de la box — ou rien, si elle n'en a pas la forme : la carte du rail reste alors celle
// d'un ticket qui t'attend, sans question ni choix. Un runtime d'avant ce champ n'en donne pas. Une
// carte sans question n'est lue que si elle n'offre qu'un geste : plusieurs choix sans question ne
// disent pas ce qu'ils tranchent.
export function carteLue(brute: unknown): CarteLue | undefined {
  const lue = objet(brute);
  if (lue === undefined || !texte(lue.type) || !Array.isArray(lue.choix) || lue.choix.length === 0) return undefined;
  const sansQuestion = lue.question === null || lue.question === undefined;
  if (sansQuestion ? lue.choix.length !== 1 : !texte(lue.question) || lue.question.trim() === "") return undefined;
  const choix = lue.choix.flatMap((brut: unknown) => {
    const un = objet(brut);
    return un !== undefined && texte(un.texte) && texte(un.suite) ? [{ texte: un.texte, suite: un.suite }] : [];
  });
  // Un choix illisible décalerait les rangs que `rail choose` numérote : la carte n'est pas lue.
  if (choix.length !== lue.choix.length) return undefined;
  // Un résumé illisible ou vide n'est pas lu : la carte se pose sans lui.
  const resume = texte(lue.resume) && lue.resume.trim() !== "" ? { resume: lue.resume } : {};
  return { type: lue.type, ...resume, question: sansQuestion ? null : (lue.question as string), choix, captures: lue.captures === null || lue.captures === undefined ? null : capturesLues(lue.captures) };
}

// La réponse du chef dite en mots : le texte du choix qu'il a pris, ou ce qu'il a écrit.
export const reponseDite = (choix: readonly { texte: string }[], reponse: { choix: number } | { texte: string }): string =>
  "choix" in reponse ? (choix[reponse.choix - 1]?.texte ?? `choice ${reponse.choix}`) : reponse.texte;

// Ce que la carte du rail pose — et, quand le tableau en montre une, la dernière réponse du chef et ce qu'il en est.
export function carteDeTodo({ type, resume, question, choix, captures }: CarteLue, envoi?: EnvoiDeCarte): CarteDeTodo {
  return {
    sorte: type,
    ...(resume === undefined ? {} : { resume }),
    question,
    choix: choix.map(({ texte, suite }) => ({ texte, prix: PRIX_DE_SUITE[suite] ?? PRIX_DU_TEXTE })),
    prixDuTexte: PRIX_DU_TEXTE,
    ...(captures === null ? {} : { captures: capturesDeCarte(captures) }),
    ...(envoi === undefined ? {} : { envoi: envoiVu(choix, envoi) }),
  };
}

function envoiVu(choix: readonly ChoixLu[], envoi: EnvoiDeCarte): EnvoiVu {
  const vu = { commentaire: envoi.commentaire, reponse: reponseDite(choix, envoi), le: envoi.le };
  if (envoi.etat === "attente") return { ...vu, etat: "attente" };
  if (envoi.etat === "joue") return { ...vu, etat: "joue", dit: envoi.dit };
  return { ...vu, etat: "refuse", dit: envoi.dit, raison: envoi.raison };
}

export const INCONNUE = "nothing was sent: this card is not in the latest facts read — it was answered elsewhere, or it left TODO";
export const CHANGEE = "nothing was sent: the card's question changed since you read it — read it again";
export const VIDE = "nothing was sent: your answer is empty — write something to send";

// La réponse du chef à la carte de TODO de `ticket`, lue de ce que la vue envoie : le rang d'un choix, ou son texte —
// ou pourquoi rien ne part. `connue` : la carte que les derniers faits lus portent pour ce ticket — sans elle, ou sur une
// autre question, rien ne part. Le contrôle de la réponse écrite sur le tableau de la cuisine (tableau-gestes/rail.ts).
export function reponseLue(connue: CarteLue | undefined, ticket: unknown, brute: unknown): { ticket: number; choix: number } | { ticket: number; texte: string } | { refus: string; detail: string } {
  if (typeof ticket !== "number" || !Number.isSafeInteger(ticket) || ticket < 1 || connue === undefined) return { refus: INCONNUE, detail: "" };
  const reponse = objet(brute);
  if (reponse === undefined || reponse.question !== connue.question) return { refus: CHANGEE, detail: "" };
  if ("choix" in reponse) {
    const { choix } = reponse;
    if (typeof choix !== "number" || !Number.isSafeInteger(choix) || choix < 1 || choix > connue.choix.length) return { refus: `nothing was sent: the card offers choices 1 to ${connue.choix.length}`, detail: "" };
    return { ticket, choix };
  }
  // Les retours à la ligne du poste sont ceux de GitHub : `\n`.
  const saisi = texte(reponse.texte) ? reponse.texte.trim().replace(/\r\n?/g, "\n") : "";
  if (saisi === "") return { refus: VIDE, detail: "" };
  if (saisi.includes("\0")) return { refus: "nothing was sent: your answer carries a NUL character", detail: "" };
  if (saisi.length > LONGUEUR_MAX) return { refus: `nothing was sent: GitHub refuses a comment longer than ${LONGUEUR_MAX} characters — this one has ${saisi.length}`, detail: "" };
  return { ticket, texte: saisi };
}
