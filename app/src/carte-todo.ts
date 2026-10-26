// La carte de TODO (#1281, épique #1277) : ce que le runtime laisse entrer dans TODO — un choix de
// produit ou une validation de design (runtime/src/carte-todo.ts) — porte une seule question, ses
// choix et, pour un écran, ses captures avant et après. `facts` la donne dans `attend[].carte`
// (docs/runtime/manager.md, « What enters TODO, and how you answer »). La carte du rail la montre
// telle quelle : la question, un bouton par choix, un champ pour répondre en texte libre, et les
// captures quand il y en a — une carte sans écran n'a pas de zone de captures.
//
// Un clic sur un choix, ou le texte envoyé, est la réponse du chef : un seul appel du runtime la
// règle — `rail choose <ticket> <n>` ou `rail answer <ticket> <texte>`, sur la box du projet. La
// réponse est écrite sur l'issue, la carte quitte TODO et le ticket avance ; l'app n'en double rien.
// La commande se compose ici, jamais dans la vue : la vue nomme le ticket, la question qu'elle
// montre, et le rang du choix ou le texte.
import { echecDe, lancerGeste, type Reglages, type Servi } from "./box.ts";
import { capturesDeCarte, type CapturesDeCarte, type CapturesLues } from "./captures.ts";
import { citer, LONGUEUR_MAX } from "./discussion.ts";

// La carte telle que `facts` la donne : sa sorte (`product`, `design`), sa question, ses choix —
// chacun son texte et sa suite (`resume`, `merge`), dans l'ordre que `rail choose` numérote à partir
// de 1 —, et ses captures, nulles sur une carte sans écran.
export type ChoixLu = { texte: string; suite: string };
export type CarteLue = { type: string; question: string; choix: ChoixLu[]; captures: CapturesLues | null };

// La carte telle que la vue la pose : sa sorte, sa question, ses choix — chacun avec son prix, qui
// passe au survol —, le prix d'une réponse en texte libre, et ses captures, absentes sans écran.
export type ChoixDeCarte = { texte: string; prix: string };
export type CarteDeTodo = { sorte: string; question: string; choix: ChoixDeCarte[]; prixDuTexte: string; captures?: CapturesDeCarte };

// Ce que la vue envoie : la question qu'elle montre — rien ne part sur une carte qui a changé sous
// les yeux du chef —, et le rang d'un choix, à partir de 1, ou le texte du chef.
export type Reponse = { question: string } & ({ choix: number } | { texte: string });
// Ce qu'il en est advenu : la réponse est écrite — `dit`, ce que la box en dit —, ou rien ne l'est, et
// pourquoi, en une ligne, ce que la box a rendu au survol.
export type Rendu = { repondue: true; dit: string } | { refus: string; detail: string };

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
// d'un ticket qui t'attend, sans question ni choix. Un runtime d'avant ce champ n'en donne pas.
export function carteLue(brute: unknown): CarteLue | undefined {
  const lue = objet(brute);
  if (lue === undefined || !texte(lue.type) || !texte(lue.question) || lue.question.trim() === "" || !Array.isArray(lue.choix)) return undefined;
  const choix = lue.choix.flatMap((brut: unknown) => {
    const un = objet(brut);
    return un !== undefined && texte(un.texte) && texte(un.suite) ? [{ texte: un.texte, suite: un.suite }] : [];
  });
  // Un choix illisible décalerait les rangs que `rail choose` numérote : la carte n'est pas lue.
  if (choix.length !== lue.choix.length) return undefined;
  return { type: lue.type, question: lue.question, choix, captures: lue.captures === null || lue.captures === undefined ? null : capturesLues(lue.captures) };
}

// Ce que la carte du rail pose.
export function carteDeTodo({ type, question, choix, captures }: CarteLue): CarteDeTodo {
  return {
    sorte: type,
    question,
    choix: choix.map(({ texte, suite }) => ({ texte, prix: PRIX_DE_SUITE[suite] ?? PRIX_DU_TEXTE })),
    prixDuTexte: PRIX_DU_TEXTE,
    ...(captures === null ? {} : { captures: capturesDeCarte(captures) }),
  };
}

// Les deux commandes du runtime, telles qu'elles partent après `brigade <projet>`.
export const choisir = (ticket: number, choix: number) => `rail choose ${ticket} ${choix}`;
export const repondre = (ticket: number, texte: string) => `rail answer ${ticket} ${citer(texte)}`;

export const INCONNUE = "nothing was sent: this card is not in the latest facts read — it was answered elsewhere, or it left TODO";
export const CHANGEE = "nothing was sent: the card's question changed since you read it — read it again";
export const VIDE = "nothing was sent: your answer is empty — write something to send";
// Un constat, pas une consigne : la commande et ce que la box a rendu sont au survol.
export const SANS_GESTE = "nothing was sent: this station cannot take your answer yet";
const PAS_DEMANDE = "nothing was sent: the station could not be asked";

// La dernière ligne non vide d'une sortie : ce que le runtime dit en dernier.
const derniere = (sortie: string) => sortie.split("\n").map((ligne) => ligne.trim()).filter(Boolean).at(-1) ?? "";

// La réponse du chef à la carte de TODO de `ticket`, lue de ce que la vue envoie : le rang d'un choix, ou son texte —
// ou pourquoi rien ne part. `connue` : la carte que les derniers faits lus portent pour ce ticket — sans elle, ou sur une
// autre question, rien ne part. Le même contrôle vaut sur la box et sur le tableau de la cuisine (tableau-gestes/rail.ts).
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

// La réponse du chef à la carte de TODO de `ticket`, sur la box du projet (`reponseLue`).
//   0  la réponse est écrite : la carte quitte TODO
//   1  le runtime a refusé — sa dernière ligne le dit
//   2, 66  le runtime de la station ne connaît pas ce geste
// Jamais d'exception.
export async function repondreALaCarte(reglages: Reglages, servi: Servi, connue: CarteLue | undefined, ticket: unknown, brute: unknown): Promise<Rendu> {
  const lue = reponseLue(connue, ticket, brute);
  if ("refus" in lue) return lue;
  const commande = "choix" in lue ? choisir(lue.ticket, lue.choix) : repondre(lue.ticket, lue.texte);
  const rendu = await lancerGeste(reglages, servi, commande);
  const { erreur } = rendu;
  if (erreur === null) return { repondue: true, dit: derniere(rendu.sortie) };
  const echec = echecDe({ ...rendu, erreur }, reglages.delaiMs);
  if (erreur.killed !== true && erreur.code === 1) {
    const dit = derniere(rendu.erreurs) || derniere(rendu.sortie);
    return { refus: `nothing was recorded${dit === "" ? "" : ` — ${dit}`}`, detail: echec.erreur };
  }
  if (erreur.killed !== true && (erreur.code === 2 || erreur.code === 66)) return { refus: SANS_GESTE, detail: echec.erreur };
  return { refus: `${PAS_DEMANDE} — ${echec.atteinte ? "reached, but it did not answer: your answer may be on the issue, read it before answering again" : "not reached"}`, detail: echec.erreur };
}
