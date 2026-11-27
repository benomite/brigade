// La passation d'une carte de TODO au second (ticket 3133, épique 3128) : « ask the second », sur la carte, écrit dans le
// second du projet un premier message tout prêt — le numéro de l'issue, la question de la carte (ou « no question found
// on #N »), et ce que l'issue dit : son titre et son dernier message utile. Le chef ne colle rien ; c'est son Entrée qui
// le fait partir, comme pour tout ce que l'app écrit dans le second (terminals.ts, `inscrire`).
// Le message tient sur une ligne : un retour à la ligne y serait une Entrée. L'issue est lue de GitHub par le poste
// (card-github.ts, `discussionDeGitHub`) ; une issue illisible ne retient pas la passation : le message dit qu'elle n'a
// pas été lue, et pourquoi, sans rien inventer à sa place.
import type { Project } from "./config.ts";
import type { Discussion } from "./discussion.ts";
import type { Block, Word } from "./markdown.ts";

// Au-delà, le dernier message est coupé : le second relit l'issue entière par `/brigade:ask`.
export const LENGTH_OF_MESSAGE = 1500;

export const withoutQuestion = (ticket: number) => `no question found on #${ticket}`;

const number = (ticket: unknown): ticket is number => typeof ticket === "number" && Number.isSafeInteger(ticket) && ticket >= 1;

// Une ligne : tout blanc et tout caractère de contrôle devient une espace.
const oneLine = (text: string) => text.replace(/[\s\x00-\x1f\x7f]+/g, " ").trim();

function wordsEnText(words: readonly Word[]): string {
  return words
    .map((word) => {
      if ("texte" in word) return word.texte;
      if ("code" in word) return word.code;
      if ("gras" in word) return wordsEnText(word.gras);
      if ("italique" in word) return wordsEnText(word.italique);
      if ("barre" in word) return wordsEnText(word.barre);
      if ("lien" in word) return wordsEnText(word.contenu);
      return " ";
    })
    .join("");
}

// Le texte d'un message rendu (markdown.ts), sans sa mise en forme.
export function blocksEnText(blocks: readonly Block[]): string {
  return oneLine(
    blocks
      .map((block) => {
        if ("titre" in block) return wordsEnText(block.contenu);
        if ("paragraphe" in block) return wordsEnText(block.paragraphe);
        if ("code" in block) return block.code;
        if ("citation" in block) return blocksEnText(block.citation);
        if ("liste" in block) return block.liste.map(({ blocs: element }) => `- ${blocksEnText(element)}`).join(" ");
        if ("tableau" in block) return [block.tableau.tete, ...block.tableau.lignes].map((line) => line.map(wordsEnText).join(" | ")).join(" ");
        if ("replie" in block) return `${wordsEnText(block.replie.resume)} ${blocksEnText(block.replie.blocs)}`;
        return "";
      })
      .join(" "),
  );
}

const cut = (text: string, length: number) => (text.length <= length ? text : `${text.slice(0, length - 1).trimEnd()}…`);

// Le dernier message utile de l'issue : le plus récent qui dit quelque chose — un message vide (un marqueur du runtime
// seul) ou qui ne fait que porter la question de la carte, déjà passée, ne compte pas. Le corps, faute de mieux.
function lastUseful(discussion: Exclude<Discussion, { sans: string }>, question: string | null) {
  const readOnes = discussion.messages.map((message) => ({ message, texte: blocksEnText(message.blocs) })).filter(({ texte: text }) => text !== "");
  const useful = question === null ? readOnes : readOnes.filter(({ texte: text }) => !text.includes(question));
  return useful.at(-1) ?? readOnes[0];
}

// Le premier message de la passation, sur une ligne, sans Entrée : `/brigade:ask <N>` — le second lit l'issue —, puis
// la question de la carte, puis ce que l'issue dit.
export function handover(ticket: number, card: string | null, discussion: Discussion): string {
  // Une question vide n'en est pas une.
  const question = card === null || oneLine(card) === "" ? null : oneLine(card);
  const setOne = question === null ? `${withoutQuestion(ticket)}.` : `“${question}”`;
  const parties = [`/brigade:ask ${ticket} I am handing you the TODO card of #${ticket}. Its question: ${setOne}`];
  if ("sans" in discussion) parties.push(`Its issue could not be read (${oneLine(discussion.sans)}): read it yourself.`);
  else {
    parties.push(`Its issue: “${oneLine(discussion.titre)}”${discussion.ouverte ? "" : " (closed)"}.`);
    const last = lastUseful(discussion, question);
    if (last === undefined) parties.push("The issue says nothing more.");
    else {
      const who = last.message.corps === true ? "Its description" : "Its last relevant comment";
      parties.push(`${who} (${oneLine(last.message.auteur)}, ${oneLine(last.message.at)}): “${cut(last.texte, LENGTH_OF_MESSAGE)}”`);
    }
  }
  parties.push("What does this card want from me, and what do you recommend?");
  return parties.join(" ");
}

// Ce que la note du second dit quand la passation y est écrite (terminals.ts, `inscrire`).
export function noteOfTheHandover(inFrontOneDialog = false): string {
  return inFrontOneDialog
    ? "the card is handed over in the second, which is waiting for an answer to a dialogue: these characters are keystrokes there — look at the second before pressing Enter"
    : "the card is handed over in the second, without Enter — read it, then press Enter";
}

// Le geste, au clic : l'issue lue, la passation écrite dans le second du projet (`inscrire`, main.ts). Rien n'est écrit
// sans ticket, ni dans un projet qui ne s'ouvre pas ; une lecture de l'issue qui échoue — ou qui lève — est dite dans
// le message, qui part quand même avec le numéro et la question.
export async function passAtSecond<Written>(
  register: (message: string) => Written,
  read: (ticket: number) => Promise<Discussion>,
  project: Project,
  ticket: unknown,
  question: unknown,
): Promise<Written | { refus: string }> {
  if (!number(ticket)) return { refus: "nothing was written: the card names no ticket" };
  if (project.refus !== undefined) return { refus: `nothing was written: “${project.nom}” does not open — ${project.refus}` };
  let discussion: Discussion;
  try {
    discussion = await read(ticket);
  } catch (error) {
    discussion = { sans: `not read: ${error instanceof Error ? error.message : String(error)}` };
  }
  return register(handover(ticket, typeof question === "string" ? question : null, discussion));
}
