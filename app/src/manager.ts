// L'état du manager d'un projet : allumé ou éteint — il suit l'interrupteur du projet (#1406), et sa
// ligne le dit —, depuis quand et par qui, ses
// dernières décisions, ce qu'il a écarté et pourquoi. L'app le lit là où le
// runtime le montre — la sortie de `manager` (`montrer`), relayée par l'onglet Manager comme celle des autres (tabs.ts) —
// et n'y lit que trois choses : sa ligne `manager`, les lignes sous
// `latest decisions`, les lignes sous `set aside`. Il écrit en anglais depuis
// #951 ; l'app lit aussi les mots d'avant (`ALLUMÉ`, `ÉTEINT`, `dernières décisions`,
// `écartées`…), car une box pas encore mise à jour parle encore français. Rien n'y est deviné : une
// sortie sans cette ligne n'est pas « éteint », une section absente n'est pas
// « aucune », et une ligne qui n'a pas la forme reste telle quelle, à part. Ce
// que le runtime dit se pose mot pour mot ; la sortie entière se lit dessous.
// Le manager n'a plus de geste à lui : l'interrupteur du projet, en tête de son espace, l'allume
// et l'éteint avec le reste (actions.ts, `projet-allumer`, `projet-eteindre`). Ce module ne lance
// rien — il lit ce que la veille a déjà rendu.
import type { Reading } from "./box.ts";

// Sans argument : la commande montre, elle n'allume ni n'éteint rien.
export const COMMAND = "manager";

// `mot` : ON ou OFF (ALLUMÉ ou ÉTEINT, d'un runtime d'avant), tel que le runtime l'écrit. `depuis`, `par` : l'instant
// de la dernière bascule et son auteur — absents d'un manager jamais allumé.
// `dit` : ce que la ligne dit ensuite, mot pour mot.
export type Switch = { allume: boolean; mot: string; depuis?: string; par?: string; dit: string };
// Une décision : l'instant, l'issue, et ce que le manager en a fait, mot pour mot.
export type Decision = { a: string; ticket: number; dit: string };
// Une issue écartée : pourquoi (`motif`), et ce que la ligne dit de ce qui la rend au manager (`rend`) —
// le geste qui lève l'écart, ou qu'il n'y en a pas. Les deux mot pour mot : le tiret qui les sépare n'est à aucun.
export type Gap = { a: string; ticket: number; motif: string; rend?: string };
// `dit` : ce que la ligne de titre dit de la section — « aucune », quand elle n'a pas de ligne.
// `illisibles` : les lignes de la section qui n'ont pas la forme, telles quelles.
export type Section<Line> = { dit: string; lignes: Line[]; illisibles: string[] };
// Une section absente : la sortie n'a pas sa ligne de titre.
export type Manager = { interrupteur: Switch; decisions?: Section<Decision>; ecartees?: Section<Gap> };

// Les titres que `manager` écrit en tête de ligne, dans son ordre : une section va
// de son titre au suivant. Les épiques et les réactions ne sont pas lues.
const DECISIONS = "latest decisions";
const ECARTEES = "set aside";
// Chaque titre, et le mot d'avant qui dit la même section : une section est connue par le premier.
const TITLES: readonly (readonly [string, string])[] = [
  [COMMAND, COMMAND],
  [DECISIONS, DECISIONS],
  ["dernières décisions", DECISIONS],
  [ECARTEES, ECARTEES],
  ["écartées", ECARTEES],
  ["epics", "epics"],
  ["épiques", "epics"],
  ["reactions", "reactions"],
  ["réactions", "reactions"],
];
// Un titre, complété d'espaces jusqu'à sa valeur — ou seul sur sa ligne.
const titleOf = (line: string) => TITLES.find(([title]) => line === title || line.startsWith(`${title}  `));

// La ligne `manager` : `ON since <instant> (by <auteur>) — <suite>`, `OFF` de même, ou
// `OFF — never turned on: <suite>`. D'avant : `ALLUMÉ depuis le <instant> (par <auteur>) — <suite>`,
// `ÉTEINT` de même. Une ligne qui mêle les deux formes n'est lue d'aucune.
const SWITCH = /^(ON|OFF)(?: since (\S+) \(by (.*?)\))? — (.*)$/;
const SWITCH_OF_BEFORE = /^(ALLUMÉ|ÉTEINT)(?: depuis le (\S+) \(par (.*?)\))? — (.*)$/;
// Une ligne de section : `  <instant>  #<issue>  <ce qui en est dit>`.
const LINE = /^ {2}(\S+) {2}#(\d+) {2}(.*)$/;
// Ce par quoi une ligne d'écart, après son motif et un tiret, dit le geste qui le lève — ou qu'il n'y en a pas
// (les deux premiers : les mots d'aujourd'hui, les deux autres ceux d'avant).
const SUITES = ["to return it to the manager: ", "nothing returns it to the manager", "pour la lui rendre : ", "rien ne la rend au manager"];

function gapOf({ a, ticket, dit: said }: Decision): Gap {
  const cuts = SUITES.map((suite) => said.indexOf(` — ${suite}`)).filter((cut) => cut !== -1);
  // Un ticket servi ailleurs, une issue déjà rendue : la ligne ne dit que cela.
  if (cuts.length === 0) return { a, ticket, motif: said };
  const cut = Math.min(...cuts);
  return { a, ticket, motif: said.slice(0, cut), rend: said.slice(cut + " — ".length) };
}

// Les lignes d'une section, lues une à une : celles qui n'ont pas la forme restent à part.
function sectionOf<Line>(readEntry: Open | undefined, read: (decision: Decision) => Line): Section<Line> | undefined {
  if (readEntry === undefined) return undefined;
  const section: Section<Line> = { dit: readEntry.dit, lignes: [], illisibles: [] };
  for (const line of readEntry.lignes) {
    const [, a, number, said] = LINE.exec(line) ?? [];
    const ticket = Number(number);
    if (a !== undefined && said !== undefined && Number.isSafeInteger(ticket)) section.lignes.push(read({ a, ticket, dit: said }));
    else section.illisibles.push(line);
  }
  return section;
}

// Une section telle qu'elle est écrite : sa ligne de titre, ce qu'elle dit après lui, et les lignes qui la suivent.
type Open = { titre: string; dit: string; lignes: string[] };

// Ce que cette sortie de `manager` dit — ou en quoi elle n'en a pas la forme.
export function managerOf(output: string): Manager | { informe: string } {
  const sections = new Map<string, Open>();
  let current: Open | undefined;
  for (const line of output.split("\n")) {
    const [word, title] = titleOf(line) ?? [];
    // Seule sa première ligne ouvre une section : la même, plus bas, est une ligne de celle où elle tombe.
    if (word !== undefined && title !== undefined && !sections.has(title)) sections.set(title, (current = { titre: line, dit: line.slice(word.length).trim(), lignes: [] }));
    else if (line.trim() !== "") current?.lignes.push(line);
  }

  const head = sections.get(COMMAND);
  if (head === undefined) return { informe: "it has no `manager` line" };
  const [, word, since, by, said] = SWITCH.exec(head.dit) ?? SWITCH_OF_BEFORE.exec(head.dit) ?? [];
  if (word === undefined || said === undefined) return { informe: `its \`manager\` line says neither ON nor OFF (nor the older ALLUMÉ or ÉTEINT) in the expected form: “${head.titre}”` };

  const decisions = sectionOf(sections.get(DECISIONS), (decision) => decision);
  const ecartees = sectionOf(sections.get(ECARTEES), gapOf);
  return {
    interrupteur: { allume: word === "ON" || word === "ALLUMÉ", mot: word, ...(since === undefined || by === undefined ? {} : { depuis: since, par: by }), dit: said },
    ...(decisions === undefined ? {} : { decisions }),
    ...(ecartees === undefined ? {} : { ecartees }),
  };
}

// Une liste, prête à poser. `vide` : ce qui se lit à la place de ses lignes quand elle n'en a pas.
export type List<Line> = { lignes: Line[]; illisibles: string[]; vide?: string };
// Ce que l'onglet Manager pose au-dessus du texte de sa lecture : la vue n'y calcule rien.
// `ton` : la couleur de l'interrupteur. `sans` : pourquoi l'état n'est pas posé — ce n'est jamais « éteint ».
export type Seen = { projet: string; demande: number; a: string } & ({ interrupteur: Switch & { ton: string }; decisions: List<Decision>; ecartees: List<Gap> } | { sans: string });

const NOT_READ = "the manager's state was not read: what the app got in its place is below. This is not “off”";
const withoutShape = (informs: string) => `the manager's state was not read in this output: ${informs}. This is not “off” — it is shown below, in full`;
const withoutSection = (title: string) => `not read: the output has no \`${title}\` line. This is not “none” — it is shown below, in full`;

function list<Line>(title: string, section: Section<Line> | undefined): List<Line> {
  if (section === undefined) return { lignes: [], illisibles: [], vide: withoutSection(title) };
  const { dit: said, lignes: lines, illisibles: unreadable } = section;
  // Sans ligne, c'est le mot du runtime qui se lit : l'app n'en écrit pas d'autre.
  return { lignes: lines, illisibles: unreadable, ...(lines.length === 0 && unreadable.length === 0 && said !== "" ? { vide: said } : {}) };
}

// Ce qu'une lecture de l'onglet Manager donne à poser. Ratée, ou sans la forme, elle
// ne dit rien du manager : ce que l'app a obtenu se lit dans l'onglet, comme pour les autres.
export function see(reading: Reading): Seen {
  const { projet: project, demande: request, a } = reading;
  const output = "erreur" in reading ? undefined : reading.sorties.find(({ commande: command }) => command === COMMAND)?.texte;
  if (output === undefined) return { projet: project, demande: request, a, sans: NOT_READ };
  const manager = managerOf(output);
  if ("informe" in manager) return { projet: project, demande: request, a, sans: withoutShape(manager.informe) };
  const { interrupteur: toggle } = manager;
  return { projet: project, demande: request, a, interrupteur: { ...toggle, ton: toggle.allume ? "vert" : "gris" }, decisions: list(DECISIONS, manager.decisions), ecartees: list(ECARTEES, manager.ecartees) };
}
