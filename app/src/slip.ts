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

// Ce dont un bon se compose, pour un ticket.
// `lignes` : les siennes sous la ligne `rail` de `status` — absentes, cette ligne
// n'a pas été lue ; vides, elle l'a été et ne dit rien de lui.
// `stations` : celles de ses cooks en cours, d'après `faits` — absentes, le
// runtime ne donne pas les cooks.
// `bloque` : le bloc `attend` dit ce qui l'arrête, et le bon le porte à part.
// `enCeMoment` : ce que la cuisine fait du ticket, tel que `faits` le donne et que
// l'app l'écrit (facts.ts, `direEnCeMoment`) — absent, le bon ne porte pas cette ligne.
// `attente` : pour un ticket mis de côté, la raison en clair que le runtime donne
// dans `faits` — elle remplace sa ligne brute de `status`, qui n'est plus relayée.
// `revenu` : pour un ticket revenu de WAITING, le motif que le runtime en donne dans `faits`.
// `lieux` : où cuit chaque station que `faits` donne (`lieuDe`) — absents, le runtime ne
// donne pas les stations.
export type Sources = { lignes?: readonly string[]; stations?: readonly string[]; bloque: boolean; enCeMoment?: string; attente?: string; revenu?: string; lieux?: ReadonlyMap<string, string> };

// Où cuit un ticket en cours : sur la box, ou sur le Mac du chef — une station distante, qui
// tire son travail depuis son poste. C'est ce que `faits` dit de la station qui le tient
// (`stations[].distante`), rien d'autre : une station qu'il ne donne pas n'est nulle part.
export const ON_THE_BOX = "main station";
export const ON_THE_MAC = "Mac";
export const placeOf = ({ distante: remote }: { distante: boolean }): string => (remote ? ON_THE_MAC : ON_THE_BOX);

const HEAD_OF_TICKET = /^ {2}#(\d+) {2}(.*)$/;

// Les lignes de chaque ticket sous la ligne `rail` de `status`, sans leur tête —
// rien, si la sortie n'a pas cette ligne, ou en a plusieurs. Seules les lignes en
// retrait qui la suivent en sont : un numéro plus bas, sous `cooks` ou `serveurs`,
// n'est pas une ligne du rail.
export function linesOfRail(status: string): Map<number, string[]> | undefined {
  const lines = status.split("\n");
  const heads = lines.flatMap((line, rank) => (/^rail\s/.test(line) ? [rank] : []));
  const [head] = heads;
  if (head === undefined || heads.length !== 1) return undefined;
  const readEntries = new Map<number, string[]>();
  for (let rank = head + 1; lines[rank]?.startsWith("  ") === true; rank++) {
    const [, number, suite] = HEAD_OF_TICKET.exec(lines[rank] as string) ?? [];
    const ticket = Number(number);
    if (number === undefined || suite === undefined || !Number.isSafeInteger(ticket)) continue;
    readEntries.set(ticket, [...(readEntries.get(ticket) ?? []), suite]);
  }
  return readEntries;
}

// Une durée, telle que `status` l'écrit : `j` pour les jours en
// français, `d` en anglais.
const duration = (days: string) => String.raw`\d+ (?:s|min|${days}|h \d\d)`;
const DURATION = duration("j");
// En anglais, `status` écrit la durée ; le rail lu sur GitHub écrit l'heure à la place
// (`2026-10-12 10:00 UTC`).
const HOUR_IN = String.raw`\d{4}-\d\d-\d\d \d\d:\d\d UTC`;
const DURATION_IN = `(?:${duration("d")}|${HOUR_IN})`;
type Read = { tient?: string; depuis: string; bail?: string; bloque?: string; cuisine?: string };
// Le détail d'une ligne, par état : la forme que le runtime écrit pour lui, et ce
// qu'elle donne. Un état qui n'est pas ici — `86`, un mot inconnu — n'en a pas.
// Chaque forme existe dans les deux langues, état compris : une ligne qui mêle les deux
// (un état français, un détail anglais) n'est la forme d'aucune des deux.
const SHAPES: { etats: readonly string[]; forme: RegExp; lire(finds: RegExpExecArray): Read }[] = [
  {
    // `par <station> depuis <durée>, [COINCE : ][sans progrès depuis <durée>, ]bail encore <durée>` — ou `bail échu depuis`.
    etats: ["pris"],
    forme: new RegExp(`^par (\\S.*?) depuis (${DURATION}), ((?:COINC[EÉ] : )?(?:sans progrès depuis ${DURATION}, )?bail (?:encore|échu depuis) ${DURATION})$`),
    lire: ([, holds = "", since = "", lease = ""]) => ({ tient: holds, depuis: since, bail: lease }),
  },
  {
    // `by <station> since <duration>, [STUCK: ][no progress since <duration>, ]lease <duration> left` — or `lease expired since`.
    // Sans bail, sur GitHub seul (vue/rail/github.ts, #2220) : une prise tient jusqu'à son lâcher.
    etats: ["taken"],
    forme: new RegExp(`^by (\\S.*?) since (${DURATION_IN})(?:, ((?:STUCK: )?(?:no progress since ${DURATION_IN}, )?lease (?:${DURATION_IN} left|expired since ${DURATION_IN})))?$`),
    lire: ([, holds = "", since = "", lease]) => ({ tient: holds, depuis: since, ...(lease === undefined ? {} : { bail: lease }) }),
  },
  {
    // `[<ce qui le retient> — ]depuis <durée>`.
    etats: ["en attente", "tests écrits", "BLOQUÉ"],
    forme: new RegExp(`^(?:(\\S.*) — )?depuis (${DURATION})$`),
    lire: ([, blocked, since = ""]) => ({ depuis: since, ...(blocked === undefined ? {} : { bloque: blocked }) }),
  },
  {
    // `[<what holds it> — ]since <duration>`.
    etats: ["queued", "tests written", "BLOCKED"],
    forme: new RegExp(`^(?:(\\S.*) — )?since (${DURATION_IN})$`),
    lire: ([, blocked, since = ""]) => ({ depuis: since, ...(blocked === undefined ? {} : { bloque: blocked }) }),
  },
  {
    // `depuis <durée>, cuisiné par <station>`.
    etats: ["en pass", "servi"],
    forme: new RegExp(`^depuis (${DURATION}), cuisiné par (\\S.*)$`),
    lire: ([, since = "", kitchen = ""]) => ({ depuis: since, cuisine: kitchen }),
  },
  {
    // `since <duration>, cooked by <station>`.
    etats: ["in pass", "served"],
    forme: new RegExp(`^since (${DURATION_IN}), cooked by (\\S.*)$`),
    lire: ([, since = "", kitchen = ""]) => ({ depuis: since, cuisine: kitchen }),
  },
];

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

// Ce que la ligne d'un ticket dit de lui — ou rien, si elle n'est pas celle que
// le runtime écrit pour cet état et ce titre.
function split(line: string, state: string, title: string): Read | undefined {
  const readOne = middle(line, state, title);
  const detail = readOne?.detail;
  const readEntry = SHAPES.find(({ etats: states }) => states.includes(readOne?.etat ?? state));
  const finds = detail === undefined ? null : (readEntry?.forme.exec(detail) ?? null);
  return readEntry === undefined || finds === null ? undefined : readEntry.lire(finds);
}

// Les cinq choses qu'un bon porte, dans l'ordre où elles se lisent : le libellé
// de chacune quand la file la dit, et comment elle se nomme quand elle ne la dit pas.
const THINGS = [
  { cle: "tient", libelle: "taken by", tu: "who holds it" },
  { cle: "depuis", libelle: "since", tu: "since when" },
  { cle: "bail", libelle: "lease", tu: "its lease" },
  { cle: "brule", libelle: "burns", tu: "what it burns" },
  { cle: "bloque", libelle: "blocked by", tu: "what blocks it" },
] as const;

// Le bon d'un ticket : ce que la file en dit, ce qu'elle n'en dit pas, et sa
// ligne de `status` telle quelle quand elle n'a pas pu être découpée. `etat` et
// `titre` : ceux que `faits` donne — absents, le ticket n'est pas sur le rail.
export function carry({ etat: state, titre: title }: { etat?: string; titre?: string }, { lignes: lines, stations, bloque: blocked, enCeMoment: inThisMoment, attente: wait, revenu: back, lieux: places }: Sources): Door {
  // Un ticket n'a qu'une ligne sur le rail : deux ne disent pas laquelle croire.
  const [line] = lines ?? [];
  const readOne = line === undefined || lines?.length !== 1 || state === undefined || title === undefined ? undefined : split(line, state, title);
  const unreadable = wait === undefined && lines !== undefined && lines.length > 0 && readOne === undefined;
  const saidEntries: Record<(typeof THINGS)[number]["cle"], Omit<Done, "libelle"> | undefined> = {
    // La station que `faits` donne d'abord : c'est la forme. À défaut, celle de la ligne.
    tient: stations !== undefined && stations.length > 0 ? { valeur: stations.join(", "), exact: true } : readOne?.tient === undefined ? undefined : { valeur: readOne.tient, exact: true },
    depuis: readOne === undefined ? undefined : { valeur: readOne.depuis },
    bail: readOne?.bail === undefined ? undefined : { valeur: readOne.bail },
    // Ce qu'il brûle, la file ne le dit pas : ni la forme, ni sa ligne sous `rail`.
    brule: undefined,
    bloque: readOne?.bloque === undefined ? undefined : { valeur: readOne.bloque },
  };
  // Où il cuit, d'après la station qui le tient : dit seulement quand `faits` les situe toutes.
  const holders = stations !== undefined && stations.length > 0 ? stations : readOne?.tient === undefined ? [] : [readOne.tient];
  const or = holders.map((station) => places?.get(station));
  const cooked = or.length > 0 && or.every((place) => place !== undefined) ? [...new Set(or)].join(", ") : undefined;
  // Ce que le bloc `attend` dit de lui est posé sur le bon, à part : c'est ce qui le bloque.
  const killed = THINGS.filter(({ cle: key }) => saidEntries[key] === undefined && !(key === "bloque" && blocked)).map(({ tu: you }) => you);
  const why = unreadable
    ? "not given by `facts`, and not read by the app in what `status` writes about this ticket, relayed below as is"
    : lines === undefined
      ? "not given by `facts`, and the `rail` line of `status` was not read"
      : "not given by the queue";
  return {
    dit: [
      // Ce qui bouge le plus souvent se lit d'abord : ce que la cuisine en fait en ce moment.
      ...(inThisMoment === undefined ? [] : [{ libelle: "right now", valeur: inThisMoment }]),
      // Un ticket mis de côté : sa raison en une ligne, jamais la ligne brute du runtime.
      ...(wait === undefined ? [] : [{ libelle: "set aside", valeur: wait }]),
      // Revenu de WAITING : le motif, mot pour mot — jamais déduit par l'app.
      ...(back === undefined ? [] : [{ libelle: "came back", valeur: back }]),
      ...THINGS.flatMap(({ cle: key, libelle: wording }) => [
        ...(saidEntries[key] === undefined ? [] : [{ libelle: wording, ...saidEntries[key] }]),
        // Où il cuit se lit sous qui le tient.
        ...(key === "tient" && cooked !== undefined ? [{ libelle: "cooks on", valeur: cooked }] : []),
      ]),
      // Qui l'a cuisiné n'est pas qui le tient : dit sous son nom, en plus des cinq.
      ...(readOne?.cuisine === undefined ? [] : [{ libelle: "cooked by", valeur: readOne.cuisine, exact: true as const }]),
    ],
    ...(killed.length === 0 ? {} : { sans: `${why} : ${killed.join(" · ")}` }),
    ...(unreadable ? { relais: (lines ?? []).join("\n") } : {}),
  };
}
