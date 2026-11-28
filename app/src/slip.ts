// Ce qu'un bon du rail porte, outre son numéro, son état et son titre : ce que la
// file dit déjà du ticket — ce que la cuisine en fait en ce moment, qui le tient,
// depuis quand, son bail, ce qu'il brûle, ce qui le bloque. Rien n'y est compté ni déduit : chaque valeur est un morceau
// de ce que la box a écrit. Deux lectures y entrent :
//   - `faits`, la forme : la station du cook en cours (`cooks`), et où elle cuit (`stations`) ;
//   - `status`, du texte : la ligne du ticket sous la ligne `rail`, que la box
//     écrit ainsi —
//       `  #<ticket>  <état>  <priorité>  <détail>  <titre>`
//     Le détail n'est découpé que s'il a, pour l'état que `faits` donne, la forme
//     écrite là. Sinon la ligne est relayée entière, mot pour mot, et rien n'en
//     est tiré : un texte reformulé ne devient jamais une valeur fausse.
// Ce que la file ne dit pas est écrit comme tel, chose par chose : un bon ne se
// tait sur rien, et n'invente rien à la place.

// `exact` : ce qui se recopie tel quel — une station.
export type Done = { libelle: string; valeur: string; exact?: true };
// `dit` : ce que la file dit du ticket. `sans` : ce qu'elle n'en dit pas, parmi
// les cinq choses qu'un bon porte, et pourquoi — absent quand elle les dit toutes.
// `relais` : ce que `status` écrit du ticket sous sa ligne `rail`, mot pour mot,
// quand l'app n'a pas su le découper.
export type Door = { dit: Done[]; sans?: string; relais?: string; parque?: Parked };
// Une carte parked (#4238, spec 2026-11-24-simplified-process, règle 13) : qui elle attend — un tiers, ou ce qui la retient
// —, pour quoi (`quoi`, quand il se dit), jusqu'à quand (nul : aucune date), et `chef` quand c'est le chef qu'elle attend :
// elle est dans son TODO, et rien d'autre ne l'est (#4261).
export type Parked = { qui: string; quoi?: string; jusqua: string | null; chef?: boolean };
// Qui attend le chef : c'est ce « qui » d'un ticket parked qui le met dans son TODO.
export const THE_CHEF = "the chef";
// Le ticket parked pour `qui`, pour `quoi`, jusqu'à `jusqua` : au chef seulement, il va dans son TODO.
export const parkedOf = (who: string, what: string | undefined, until: string | null): Parked => ({ qui: who, ...(what === undefined ? {} : { quoi: what }), jusqua: until, ...(who === THE_CHEF ? { chef: true } : {}) });


// Où cuit un ticket en cours : sur la box, ou sur le Mac du chef — une station distante, qui
// tire son travail depuis son poste. C'est ce que `faits` dit de la station qui le tient
// (`stations[].distante`), rien d'autre : une station qu'il ne donne pas n'est nulle part.
export const ON_THE_BOX = "main station";
export const ON_THE_MAC = "Mac";
export const placeOf = ({ distante: remote }: { distante: boolean }): string => (remote ? ON_THE_MAC : ON_THE_BOX);




// L'état que `faits` donne est en français ; `status` l'écrit en anglais depuis #940
// (docs/glossary.md, §4), en français avant : la ligne commence par l'un ou l'autre.
// C'est aussi la seule table des mots que l'app affiche pour un état (`motDEtat`) : celui
// d'une carte du rail, celui de la cuisine d'un projet, `86` (un ticket mis de côté) — la vue
// et le rail publié n'en gardent aucune copie. Les valeurs de `faits` ne changent pas.
export const WORDS_OF_CARD: Readonly<Record<string, string>> = { pris: "taken", "en attente": "queued", "tests écrits": "tests written", "en pass": "in pass", servi: "served", BLOQUÉ: "BLOCKED", "86": "set aside", WAITING: "waiting", "base rouge": "base red" };
export const WORDS_OF_KITCHEN: Readonly<Record<string, string>> = { ouverte: "open", retenue: "held", arrêtée: "stopped", éteinte: "off" };
const IN_ENGLISH: Readonly<Record<string, string>> = { ...WORDS_OF_CARD, ...WORDS_OF_KITCHEN };
// Le mot affiché pour un état : l'anglais de la table, ou l'état tel quel quand il n'y est pas
// (un mot inconnu de la box, déjà en anglais) — rien n'est inventé.
export const wordOfState = (state: string): string => IN_ENGLISH[state] ?? state;

// Ce qui est entre l'état et le titre d'une ligne — l'un et l'autre viennent de
// `faits`, et la bornent : la priorité, puis le détail. Rien, si elle n'est pas
// celle que le runtime écrit pour cet état et ce titre. `etat` : le mot que la
// ligne écrit, dans sa langue — c'est lui qui choisit la forme du détail.
function middle(line: string, state: string, title: string): { etat: string; priorite: string; detail: string } | undefined {
  for (const written of [state, ...(IN_ENGLISH[state] === undefined ? [] : [IN_ENGLISH[state]])]) {
    const [head, foot] = [`${written}  `, `  ${title}`];
    if (line.length < head.length + foot.length || !line.startsWith(head) || !line.endsWith(foot)) continue;
    const [, priority, detail] = /^(-|prio:\S+) {2}(.*)$/.exec(line.slice(head.length, line.length - foot.length)) ?? [];
    if (priority !== undefined && detail !== undefined) return { etat: written, priorite: priority, detail };
  }
  return undefined;
}

// La priorité que la ligne d'un ticket écrit, telle quelle : `prio:<n>`, ou `-`
// quand son issue ne porte aucun `prio:` — rien, si la ligne ne se lit pas.
export const priority = (line: string, state: string, title: string): string | undefined => middle(line, state, title)?.priorite;



