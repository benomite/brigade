// La passation d'une carte de TODO au second (ticket 3133, épique 3128) : « ask the second », sur la carte, écrit dans le
// second du projet un premier message tout prêt — le numéro de l'issue, la question de la carte (ou « no question found
// on #N »), et ce que l'issue dit : son titre et son dernier message utile. Le chef ne colle rien ; c'est son Entrée qui
// le fait partir, comme pour tout ce que l'app écrit dans le second (terminaux.ts, `inscrire`).
// Le message tient sur une ligne : un retour à la ligne y serait une Entrée. L'issue est lue de GitHub par le poste
// (fiche-github.ts, `discussionDeGitHub`) ; une issue illisible ne retient pas la passation : le message dit qu'elle n'a
// pas été lue, et pourquoi, sans rien inventer à sa place.
import type { Projet } from "./config.ts";
import type { Discussion } from "./discussion.ts";
import type { Bloc, Mot } from "./markdown.ts";

// Au-delà, le dernier message est coupé : le second relit l'issue entière par `/brigade:ask`.
export const LONGUEUR_DU_MESSAGE = 1500;

export const sansQuestion = (ticket: number) => `no question found on #${ticket}`;

const numero = (ticket: unknown): ticket is number => typeof ticket === "number" && Number.isSafeInteger(ticket) && ticket >= 1;

// Une ligne : tout blanc et tout caractère de contrôle devient une espace.
const uneLigne = (texte: string) => texte.replace(/[\s\x00-\x1f\x7f]+/g, " ").trim();

function motsEnTexte(mots: readonly Mot[]): string {
  return mots
    .map((mot) => {
      if ("texte" in mot) return mot.texte;
      if ("code" in mot) return mot.code;
      if ("gras" in mot) return motsEnTexte(mot.gras);
      if ("italique" in mot) return motsEnTexte(mot.italique);
      if ("barre" in mot) return motsEnTexte(mot.barre);
      if ("lien" in mot) return motsEnTexte(mot.contenu);
      return " ";
    })
    .join("");
}

// Le texte d'un message rendu (markdown.ts), sans sa mise en forme.
export function blocsEnTexte(blocs: readonly Bloc[]): string {
  return uneLigne(
    blocs
      .map((bloc) => {
        if ("titre" in bloc) return motsEnTexte(bloc.contenu);
        if ("paragraphe" in bloc) return motsEnTexte(bloc.paragraphe);
        if ("code" in bloc) return bloc.code;
        if ("citation" in bloc) return blocsEnTexte(bloc.citation);
        if ("liste" in bloc) return bloc.liste.map(({ blocs: element }) => `- ${blocsEnTexte(element)}`).join(" ");
        if ("tableau" in bloc) return [bloc.tableau.tete, ...bloc.tableau.lignes].map((ligne) => ligne.map(motsEnTexte).join(" | ")).join(" ");
        if ("replie" in bloc) return `${motsEnTexte(bloc.replie.resume)} ${blocsEnTexte(bloc.replie.blocs)}`;
        return "";
      })
      .join(" "),
  );
}

const coupe = (texte: string, longueur: number) => (texte.length <= longueur ? texte : `${texte.slice(0, longueur - 1).trimEnd()}…`);

// Le dernier message utile de l'issue : le plus récent qui dit quelque chose — un message vide (un marqueur du runtime
// seul) ou qui ne fait que porter la question de la carte, déjà passée, ne compte pas. Le corps, faute de mieux.
function dernierUtile(discussion: Exclude<Discussion, { sans: string }>, question: string | null) {
  const lus = discussion.messages.map((message) => ({ message, texte: blocsEnTexte(message.blocs) })).filter(({ texte }) => texte !== "");
  const utiles = question === null ? lus : lus.filter(({ texte }) => !texte.includes(question));
  return utiles.at(-1) ?? lus[0];
}

// Le premier message de la passation, sur une ligne, sans Entrée : `/brigade:ask <N>` — le second lit l'issue —, puis
// la question de la carte, puis ce que l'issue dit.
export function passation(ticket: number, carte: string | null, discussion: Discussion): string {
  // Une question vide n'en est pas une.
  const question = carte === null || uneLigne(carte) === "" ? null : uneLigne(carte);
  const posee = question === null ? `${sansQuestion(ticket)}.` : `“${question}”`;
  const parties = [`/brigade:ask ${ticket} I am handing you the TODO card of #${ticket}. Its question: ${posee}`];
  if ("sans" in discussion) parties.push(`Its issue could not be read (${uneLigne(discussion.sans)}): read it yourself.`);
  else {
    parties.push(`Its issue: “${uneLigne(discussion.titre)}”${discussion.ouverte ? "" : " (closed)"}.`);
    const dernier = dernierUtile(discussion, question);
    if (dernier === undefined) parties.push("The issue says nothing more.");
    else {
      const qui = dernier.message.corps === true ? "Its description" : "Its last relevant comment";
      parties.push(`${qui} (${uneLigne(dernier.message.auteur)}, ${uneLigne(dernier.message.at)}): “${coupe(dernier.texte, LONGUEUR_DU_MESSAGE)}”`);
    }
  }
  parties.push("What does this card want from me, and what do you recommend?");
  return parties.join(" ");
}

// Ce que la note du second dit quand la passation y est écrite (terminaux.ts, `inscrire`).
export function noteDeLaPassation(devantUnDialogue = false): string {
  return devantUnDialogue
    ? "the card is handed over in the second, which is waiting for an answer to a dialogue: these characters are keystrokes there — look at the second before pressing Enter"
    : "the card is handed over in the second, without Enter — read it, then press Enter";
}

// Le geste, au clic : l'issue lue, la passation écrite dans le second du projet (`inscrire`, main.ts). Rien n'est écrit
// sans ticket, ni dans un projet qui ne s'ouvre pas ; une lecture de l'issue qui échoue — ou qui lève — est dite dans
// le message, qui part quand même avec le numéro et la question.
export async function passerAuSecond<Ecrit>(
  inscrire: (message: string) => Ecrit,
  lire: (ticket: number) => Promise<Discussion>,
  projet: Projet,
  ticket: unknown,
  question: unknown,
): Promise<Ecrit | { refus: string }> {
  if (!numero(ticket)) return { refus: "nothing was written: the card names no ticket" };
  if (projet.refus !== undefined) return { refus: `nothing was written: “${projet.nom}” does not open — ${projet.refus}` };
  let discussion: Discussion;
  try {
    discussion = await lire(ticket);
  } catch (erreur) {
    discussion = { sans: `not read: ${erreur instanceof Error ? erreur.message : String(erreur)}` };
  }
  return inscrire(passation(ticket, typeof question === "string" ? question : null, discussion));
}
