// La grammaire des gestes du chef sur le tableau de la cuisine : un
// commentaire de l'issue « Kitchen board » dont la première ligne est
//
//   /brigade merge #<ticket>
//   /brigade send-back #<ticket> [reason…]
//   /brigade set-aside #<ticket>
//   /brigade answer #<ticket> <answer…>
//   /brigade choose #<ticket> <choice number>
//
// Le `#` devant le numéro est facultatif. La raison d'un renvoi et la réponse
// à une carte vont jusqu'au bout du commentaire : la suite de la première
// ligne, puis les lignes suivantes. Une première ligne qui ne commence pas par
// `/brigade` n'est pas un geste : le commentaire est une conversation, la box
// ne le lit pas. Le détail, avec un exemple par geste : docs/tableau-gestes.md.
//
// Pur : rien n'est lu ni joué ici.

export const PREFIXE = "/brigade";

// Les gestes, dans l'ordre où la grammaire les dit.
export const VERBES = ["merge", "send-back", "set-aside", "answer", "choose"] as const;
export type Verbe = (typeof VERBES)[number];

export type Geste =
  | { verbe: "merge" | "set-aside"; ticket: number }
  | { verbe: "send-back"; ticket: number; raison: string | null }
  | { verbe: "answer"; ticket: number; reponse: string }
  | { verbe: "choose"; ticket: number; choix: number };

// Ce qu'un commentaire est pour la box : pas un geste (`null`), un geste, ou
// un geste qu'elle ne comprend pas — et pourquoi, en une phrase.
export type Lecture = Geste | { incompris: string } | null;

// La grammaire, telle que la réponse à un geste incompris la dit.
export const GRAMMAIRE = [
  `${PREFIXE} merge #<ticket>`,
  `${PREFIXE} send-back #<ticket> [reason]`,
  `${PREFIXE} set-aside #<ticket>`,
  `${PREFIXE} answer #<ticket> <answer>`,
  `${PREFIXE} choose #<ticket> <choice number>`,
];

const TICKET = /^#?([1-9][0-9]*)$/;
const ENTIER = /^[1-9][0-9]*$/;

// Le geste que porte un commentaire, lu de sa première ligne.
export function lireLeGeste(corps: string): Lecture {
  const [premiere = "", ...suite] = corps.replace(/\r\n?/g, "\n").replace(/^\s*\n/, "").split("\n");
  const ligne = premiere.trim();
  if (ligne !== PREFIXE && !ligne.startsWith(`${PREFIXE} `) && !ligne.startsWith(`${PREFIXE}\t`)) return null;
  const mots = ligne.slice(PREFIXE.length).trim();
  const [verbe = "", numero, ...reste] = mots === "" ? [] : mots.split(/\s+/);
  if (verbe === "") return { incompris: "the gesture is missing after `/brigade`" };
  if (!(VERBES as readonly string[]).includes(verbe)) return { incompris: `unknown gesture “${verbe}”` };
  if (numero === undefined) return { incompris: `${verbe} needs the ticket number` };
  const ticket = TICKET.exec(numero)?.[1];
  if (ticket === undefined) return { incompris: `${verbe} needs the ticket number, not “${numero}”` };
  // La suite de la première ligne, mot pour mot, puis les lignes suivantes.
  const apres = mots.slice(mots.indexOf(numero) + numero.length).trim();
  const texte = [apres, ...suite].join("\n").trim();
  switch (verbe as Verbe) {
    case "merge":
    case "set-aside":
      if (reste.length > 0) return { incompris: `${verbe} takes nothing after the ticket number` };
      return { verbe: verbe as "merge" | "set-aside", ticket: Number(ticket) };
    case "send-back":
      return { verbe: "send-back", ticket: Number(ticket), raison: texte === "" ? null : texte };
    case "answer":
      if (texte === "") return { incompris: "answer needs the answer after the ticket number" };
      return { verbe: "answer", ticket: Number(ticket), reponse: texte };
    case "choose": {
      const [choix, ...deTrop] = reste;
      if (choix === undefined || !ENTIER.test(choix) || deTrop.length > 0) return { incompris: "choose needs one choice number, from 1, after the ticket number" };
      return { verbe: "choose", ticket: Number(ticket), choix: Number(choix) };
    }
  }
}
