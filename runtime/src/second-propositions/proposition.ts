// Ce que le second propose au chef (#1519, épique #1518) : une liste de choix —
// chacun son libellé d'une ligne et sa valeur, ce que le chef aurait tapé (`A`,
// `B`…) —, ou un geste que le chef fait lui-même, sa commande exacte
// (`! gh pr merge 1480 --merge`, une ligne `ssh … brigade …`). L'app ne lit pas
// le terminal : la proposition lui arrive par un canal à elle (`canal.ts`),
// jamais tirée du texte du second.
//
// Ce module dit la forme du contrat, et rien d'autre : ce qu'une proposition
// porte, ce qui en est refusé avant d'être publié, et ce qui se lit d'un fichier
// venu d'ailleurs. Pur.
//
// Une proposition publiée a un `id`, tiré à sa publication, et son instant
// (`at`). La réponse du chef nomme cet `id` : comme la carte de TODO de #1281,
// qui envoie la question qu'elle montre, rien ne s'efface d'une proposition qui
// a changé sous les yeux du chef.
//
// La commande d'un geste est gardée telle quelle : ni coupée, ni rognée, ni
// citée. Le runtime ne la lance jamais — c'est le chef qui la fait, dans
// l'onglet Second.

// Un choix : son libellé, une ligne, et sa valeur, ce que le chef aurait tapé.
export type Choix = { label: string; value: string };

// Ce que le second publie.
export type AProposer = { kind: "choices"; choices: Choix[] } | { kind: "gesture"; command: string };

// La proposition en cours, telle qu'un abonné la reçoit.
export type Proposition = AProposer & { id: string; at: string };

// Ce que l'app signale : le chef a répondu à la proposition `id` — d'un clic
// (sur un choix, sa `value` ; sur un geste, qu'il l'a confirmé et lancé), ou en
// tapant sa réponse dans le terminal.
export type Reponse = { id: string; by: "click"; value?: string } | { id: string; by: "text" };

// Pourquoi une proposition, ou une réponse, n'est pas prise : une phrase sans
// majuscule ni point.
export class Refus extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Refus";
  }
}

const texte = (valeur: unknown): valeur is string => typeof valeur === "string";
const objet = (valeur: unknown): Record<string, unknown> | undefined => (typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Record<string, unknown>) : undefined);
const SAUT = /[\r\n]/;
const vide = (valeur: string) => valeur.trim() === "";

// Ce que le second veut publier, vérifié : la proposition à publier, ou un
// `Refus` qui dit ce qui ne va pas. Rien n'est réécrit — un libellé trop long
// n'est pas coupé, il est publié ; un libellé sur deux lignes est refusé.
export function aProposer(brute: unknown): AProposer {
  const lue = objet(brute);
  if (lue === undefined) throw new Refus("a proposal is an object");
  if (lue.kind === "choices") {
    if (!Array.isArray(lue.choices) || lue.choices.length === 0) throw new Refus("a choices proposal offers at least one choice");
    const vues = new Set<string>();
    const choices = lue.choices.map((brut: unknown, rang: number): Choix => {
      const un = objet(brut);
      const n = rang + 1;
      if (un === undefined || !texte(un.label) || !texte(un.value)) throw new Refus(`choice ${n} has no label or no value`);
      if (vide(un.label)) throw new Refus(`choice ${n} has an empty label`);
      if (SAUT.test(un.label)) throw new Refus(`the label of choice ${n} is not on one line`);
      if (vide(un.value)) throw new Refus(`choice ${n} has an empty value`);
      if (SAUT.test(un.value)) throw new Refus(`the value of choice ${n} is not on one line`);
      if (vues.has(un.value)) throw new Refus(`two choices have the value ${un.value}`);
      vues.add(un.value);
      return { label: un.label, value: un.value };
    });
    return { kind: "choices", choices };
  }
  if (lue.kind === "gesture") {
    if (!texte(lue.command) || vide(lue.command)) throw new Refus("a gesture proposal carries the command the chef types");
    // Un geste est une ligne : un saut de ligne lancerait le début de la commande
    // avant que le chef ait confirmé la fin.
    if (SAUT.test(lue.command)) throw new Refus("a gesture's command is one line");
    return { kind: "gesture", command: lue.command };
  }
  throw new Refus("a proposal is of kind choices or gesture");
}

// Une proposition lue d'un fichier qu'un autre process a écrit — ou null, si
// elle n'en a pas la forme : un abonné ne reçoit jamais une moitié de proposition.
export function propositionLue(brute: unknown): Proposition | null {
  const lue = objet(brute);
  if (lue === undefined || !texte(lue.id) || lue.id === "" || !texte(lue.at)) return null;
  try {
    return { ...aProposer(lue), id: lue.id, at: lue.at };
  } catch (erreur) {
    if (erreur instanceof Refus) return null;
    throw erreur;
  }
}

// La réponse que l'app signale, vérifiée contre la proposition en cours : un
// choix cliqué est l'un de ses choix ; un geste se clique sans valeur.
export function reponseLue(brute: unknown, actuelle: Proposition): Reponse {
  const lue = objet(brute);
  if (lue === undefined || !texte(lue.id)) throw new Refus("an answer names the proposal it answers");
  if (lue.by === "text") return { id: lue.id, by: "text" };
  if (lue.by !== "click") throw new Refus("an answer is made by click or by text");
  if (actuelle.kind === "gesture") {
    if (lue.value !== undefined) throw new Refus("a gesture is clicked without a value");
    return { id: lue.id, by: "click" };
  }
  if (!texte(lue.value) || !actuelle.choices.some(({ value }) => value === lue.value)) {
    throw new Refus(`the proposal offers ${actuelle.choices.map(({ value }) => value).join(", ")}`);
  }
  return { id: lue.id, by: "click", value: lue.value };
}
