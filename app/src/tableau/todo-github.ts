// Les cartes du chef sur GitHub (#2221, épique #2209) : une carte par issue ouverte au label `chef-todo`, sa sorte et son
// texte tirés du commentaire que le runtime y a posé — `<!-- brigade:todo kind=<sorte> -->` puis le texte, en clair (la
// convention est celle du runtime, #2217 ; l'app la lit telle quelle). Retirer le label, ou fermer l'issue, retire la carte à
// la lecture suivante : rien n'est gardé.
//
// Ce module dit la convention ; la lecture est celle de tout ce qui attend le chef (attente-du-chef.ts, #2460), que le TODO
// de l'app et la file du second partagent.
//
// Les cartes entrent dans `faits.attend` avec leur `chef` — la sorte et le texte —, que l'app pose dans la forme de toute
// carte de TODO (#2434, carte-todo.ts, `carteDuChefDeTodo`) : la question, un bouton par choix, un champ libre. Le
// commentaire marqué porte ses choix, un par ligne après la question : `- [<geste>] <libellé>`, le geste parmi ceux de la
// forme unique (runtime/src/carte-todo/forme.ts) — `formeDuChef`. Un commentaire sans choix se lit comme avant ; sa réponse
// libre joue `resume`. La réponse part du `gh` du chef (tableau-gestes/reponse-github.ts).
import type { RevueSensible } from "../vue/carte-sensible/carte-sensible-github.ts";
import type { ValidationDesign } from "../vue/validation-design/validation-design-github.ts";

export const LABEL_DU_CHEF = "chef-todo";
const MARQUE = /^\s*<!--\s*brigade:todo\s+kind=([A-Za-z0-9_-]+)\s*-->\s*([\s\S]*)$/;
// Une carte du chef pose une question, ou n'est pas dans TODO (#2455) : sans commentaire marqué, ou sans texte, elle n'est
// pas montrée, et le second en est prévenu (attente-du-chef.ts).

// Ce que la vue pose sur une carte du chef : la sorte (`blocked`, `merge-by-hand`, `product-question`, `abandoned`, ou
// ce que le runtime ajoute un jour) et le texte du commentaire.
// `design` : sur la carte « Validate its screen » (sorte `design-validation`, ticket 3185), ce que le corps de son issue dit
// — sa PR, son ticket, ses captures (vue/validation-design/validation-design-github.ts). `sensible` : sur la carte « review
// before merge » (sorte `review-before-merge`, ticket 3224), sa PR et son ticket (vue/carte-sensible/carte-sensible-github.ts).
// `recommandee` : sur la carte d'un écart du manager (#3434, mise-de-cote-github.ts, `carteDeLEcart`), le choix qu'il
// recommande et pourquoi, en une ligne — nulle quand il n'en recommande aucun : aucun choix n'est alors mis en avant. Absente
// des autres cartes, dont le premier choix reste la réponse recommandée.
export type Recommandee = { texte: string; pourquoi: string };
export type CarteDuChef = { sorte: string; texte: string; design?: ValidationDesign; sensible?: RevueSensible; recommandee?: Recommandee | null };

// Les gestes qu'un choix de la carte joue : ceux de la forme unique (runtime/src/carte-todo/forme.ts, `GESTES`), `rail`, et
// `wait`, la mise en WAITING qu'une carte du manager propose quand sa question attend un tiers (#3434).
export const GESTES_DU_CHEF = ["resume", "merge", "drop", "close", "rail", "wait"] as const;
export type GesteDuChef = (typeof GESTES_DU_CHEF)[number];
export type ChoixDuChef = { texte: string; suite: GesteDuChef };
// Ce que le texte d'une carte du chef pose : sa question — sa première ligne écrite, nulle sur un texte vide —, ses choix,
// et le reste, qui la précise.
export type FormeDuChef = { question: string | null; choix: ChoixDuChef[]; contexte: string };

// La carte qu'un commentaire porte : sa sorte et son texte — ou rien, s'il ne commence pas par la marque.
export function carteDuCommentaire(corps: string): CarteDuChef | null {
  const lu = MARQUE.exec(corps);
  return lu === null ? null : { sorte: (lu[1] as string).toLowerCase(), texte: (lu[2] as string).trim() };
}

// Un choix : `- [<geste>] <libellé>`, sur sa ligne. Une case à cocher de GitHub (`- [ ]`, `- [x]`) n'en est pas un.
const CHOIX = new RegExp(`^\\s*[-*]\\s*\\[(${GESTES_DU_CHEF.join("|")})\\]\\s+(\\S.*)$`, "i");
// La question dite en clair : sans titre, citation ni gras autour. Un titre est un `#` suivi d'un blanc : `#30 is sensitive`,
// la question de la carte « review before merge » (ticket 3224), garde son numéro.
const enClair = (ligne: string) => ligne.replace(/^\s*(?:#+(?=\s)|>)\s*/, "").replace(/\*\*|__/g, "").trim();

// La forme d'une carte du chef, lue de son texte : la question est sa première ligne écrite ; chaque ligne
// `- [<geste>] <libellé>` qui la suit est un choix, dans l'ordre ; le reste, sans ses lignes vides en trop, la précise.
export function formeDuChef(texte: string): FormeDuChef {
  const lignes = texte.split(/\r?\n/);
  const tete = lignes.findIndex((ligne) => ligne.trim() !== "");
  if (tete === -1) return { question: null, choix: [], contexte: "" };
  const choix: ChoixDuChef[] = [];
  const reste: string[] = [];
  for (const ligne of lignes.slice(tete + 1)) {
    const lu = CHOIX.exec(ligne);
    const libelle = lu?.[2]?.trim();
    if (lu !== null && libelle !== undefined && !choix.some(({ texte: deja }) => deja === libelle)) choix.push({ texte: libelle, suite: (lu[1] as string).toLowerCase() as GesteDuChef });
    else if (lu === null) reste.push(ligne);
  }
  return { question: enClair(lignes[tete] as string), choix, contexte: reste.join("\n").replace(/\n{3,}/g, "\n\n").trim() };
}
