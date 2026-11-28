// Les cartes du chef sur GitHub (#2221, épique #2209) : une carte par issue ouverte au label `chef-todo`, sa sorte et son
// texte tirés du commentaire que le runtime y a posé — `<!-- brigade:todo kind=<sorte> -->` puis le texte, en clair (la
// convention est celle du runtime, #2217 ; l'app la lit telle quelle). Retirer le label, ou fermer l'issue, retire la carte à
// la lecture suivante : rien n'est gardé.
//
// Ce module dit la convention ; la lecture est celle de tout ce qui attend le chef (wait-of-chef.ts, #2460), que le TODO
// de l'app et la file du second partagent.
//
// Les cartes entrent dans `faits.attend` avec leur `chef` — la sorte et le texte —, que l'app pose dans la forme de toute
// carte de TODO (#2434, card-todo.ts, `carteDuChefDeTodo`) : la question, un bouton par choix, un champ libre. Le
// commentaire marqué porte ses choix, un par ligne après la question : `- [<geste>] <libellé>`, le geste parmi ceux de la
// forme unique — `formeDuChef`. Un commentaire sans choix se lit comme avant ; sa réponse
// libre joue `resume`. La réponse part du `gh` du chef (board-actions/answer-github.ts).

export const LABEL_OF_CHEF = "chef-todo";
// Le marqueur peut porter, après la sorte, des attributs `nom=valeur` : la validation demandée sur le ticket (#3615) y nomme
// sa PR, son ticket et sa tête.
const BRAND = /^\s*<!--\s*brigade:todo\s+kind=([A-Za-z0-9_-]+)(?:\s+[a-z]+=[^\s>]+)*\s*-->\s*([\s\S]*)$/;
// Une carte du chef pose une question, ou n'est pas dans TODO (#2455) : sans commentaire marqué, ou sans texte, elle n'est
// pas montrée, et le second en est prévenu (wait-of-chef.ts).

// Ce que la vue pose sur une carte du chef : la sorte (`blocked`, `merge-by-hand`, `product-question`, `abandoned`, ou
// ce que le runtime ajoute un jour) et le texte du commentaire.
// `recommandee` : sur la carte d'un écart du manager (#3434, set-aside-github.ts, `carteDeLEcart`), le choix qu'il
// recommande et pourquoi, en une ligne — nulle quand il n'en recommande aucun : aucun choix n'est alors mis en avant. Absente
// des autres cartes, dont le premier choix reste la réponse recommandée.
export type Recommended = { texte: string; pourquoi: string };
export type CardOfChef = { sorte: string; texte: string; recommandee?: Recommended | null };

// Les gestes qu'un choix de la carte joue : ceux de la forme unique, `rail`, et
// `wait`, la mise en WAITING qu'une carte du manager propose quand sa question attend un tiers (#3434).
export const ACTIONS_OF_CHEF = ["resume", "merge", "drop", "close", "rail", "wait"] as const;
export type ActionOfChef = (typeof ACTIONS_OF_CHEF)[number];
export type ChoiceOfChef = { texte: string; suite: ActionOfChef };
// Ce que le texte d'une carte du chef pose : sa question — sa première ligne écrite, nulle sur un texte vide —, ses choix,
// et le reste, qui la précise.
export type ShapeOfChef = { question: string | null; choix: ChoiceOfChef[]; contexte: string };

// La carte qu'un commentaire porte : sa sorte et son texte — ou rien, s'il ne commence pas par la marque.
export function cardOfComment(body: string): CardOfChef | null {
  const readOne = BRAND.exec(body);
  return readOne === null ? null : { sorte: (readOne[1] as string).toLowerCase(), texte: (readOne[2] as string).trim() };
}

// Un choix : `- [<geste>] <libellé>`, sur sa ligne. Une case à cocher de GitHub (`- [ ]`, `- [x]`) n'en est pas un.
const CHOICE = new RegExp(`^\\s*[-*]\\s*\\[(${ACTIONS_OF_CHEF.join("|")})\\]\\s+(\\S.*)$`, "i");
// La question dite en clair : sans titre, citation ni gras autour. Un titre est un `#` suivi d'un blanc : `#30 is sensitive`,
// la question de la carte « review before merge » (ticket 3224), garde son numéro.
const inClear = (line: string) => line.replace(/^\s*(?:#+(?=\s)|>)\s*/, "").replace(/\*\*|__/g, "").trim();

// La forme d'une carte du chef, lue de son texte : la question est sa première ligne écrite ; chaque ligne
// `- [<geste>] <libellé>` qui la suit est un choix, dans l'ordre ; le reste, sans ses lignes vides en trop, la précise.
export function shapeOfChef(text: string): ShapeOfChef {
  const lines = text.split(/\r?\n/);
  const head = lines.findIndex((line) => line.trim() !== "");
  if (head === -1) return { question: null, choix: [], contexte: "" };
  const choice: ChoiceOfChef[] = [];
  const remains: string[] = [];
  for (const line of lines.slice(head + 1)) {
    const readOne = CHOICE.exec(line);
    const wording = readOne?.[2]?.trim();
    if (readOne !== null && wording !== undefined && !choice.some(({ texte: already }) => already === wording)) choice.push({ texte: wording, suite: (readOne[1] as string).toLowerCase() as ActionOfChef });
    else if (readOne === null) remains.push(line);
  }
  return { question: inClear(lines[head] as string), choix: choice, contexte: remains.join("\n").replace(/\n{3,}/g, "\n\n").trim() };
}
