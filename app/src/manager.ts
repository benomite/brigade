// L'état du manager d'un projet : allumé ou éteint, depuis quand et par qui, ses
// dernières décisions, ce qu'il a écarté et pourquoi. L'app le lit là où le
// runtime le montre — la sortie de `manager` (runtime/src/manager-cli.ts,
// `montrer`), relayée par l'onglet Manager comme celle des autres (onglets.ts) —
// et n'y lit que trois choses : sa ligne `manager`, les lignes sous
// `dernières décisions`, les lignes sous `écartées`. Rien n'y est deviné : une
// sortie sans cette ligne n'est pas « éteint », une section absente n'est pas
// « aucune », et une ligne qui n'a pas la forme reste telle quelle, à part. Ce
// que le runtime dit se pose mot pour mot ; la sortie entière se lit dessous.
// À côté de l'état, deux gestes du socle (gestes.ts) : allumer, confirmé — il ne part
// qu'après le « oui » du chef, devant ce qu'il engage (allumage.ts) —, et éteindre,
// direct. Tous deux partent dans le second. Ce module ne lance rien — il lit ce que
// la veille a déjà rendu.
import type { Lecture } from "./box.ts";

// Sans argument : la commande montre, elle n'allume ni n'éteint rien.
export const COMMANDE = "manager";

// Les deux gestes posés à côté de l'état, par leur nom dans le socle : la vue
// les nomme, ce qui part se décide dans gestes.ts — allumer est confirmé, éteindre direct.
export const GESTES_DU_MANAGER = [
  { id: "manager-allumer", libelle: "allumer" },
  { id: "manager-eteindre", libelle: "éteindre" },
] as const;

// `mot` : ALLUMÉ ou ÉTEINT, tel que le runtime l'écrit. `depuis`, `par` : l'instant
// de la dernière bascule et son auteur — absents d'un manager jamais allumé.
// `dit` : ce que la ligne dit ensuite, mot pour mot.
export type Interrupteur = { allume: boolean; mot: string; depuis?: string; par?: string; dit: string };
// Une décision : l'instant, l'issue, et ce que le manager en a fait, mot pour mot.
export type Decision = { a: string; ticket: number; dit: string };
// Une issue écartée : pourquoi (`motif`), et ce que la ligne dit de ce qui la rend au manager (`rend`) —
// le geste qui lève l'écart, ou qu'il n'y en a pas. Les deux mot pour mot : le tiret qui les sépare n'est à aucun.
export type Ecart = { a: string; ticket: number; motif: string; rend?: string };
// `dit` : ce que la ligne de titre dit de la section — « aucune », quand elle n'a pas de ligne.
// `illisibles` : les lignes de la section qui n'ont pas la forme, telles quelles.
export type Section<Ligne> = { dit: string; lignes: Ligne[]; illisibles: string[] };
// Une section absente : la sortie n'a pas sa ligne de titre.
export type Manager = { interrupteur: Interrupteur; decisions?: Section<Decision>; ecartees?: Section<Ecart> };

// Les titres que `manager` écrit en tête de ligne, dans son ordre : une section va
// de son titre au suivant. Les épiques et les réactions ne sont pas lues.
const DECISIONS = "dernières décisions";
const ECARTEES = "écartées";
const TITRES = [COMMANDE, DECISIONS, ECARTEES, "épiques", "réactions"];
// Un titre, complété d'espaces jusqu'à sa valeur — ou seul sur sa ligne.
const titreDe = (ligne: string) => TITRES.find((titre) => ligne === titre || ligne.startsWith(`${titre}  `));

// La ligne `manager` : `ALLUMÉ depuis le <instant> (par <auteur>) — <suite>`, `ÉTEINT` de
// même, ou `ÉTEINT — jamais allumé : <suite>`.
const INTERRUPTEUR = /^(ALLUMÉ|ÉTEINT)(?: depuis le (\S+) \(par (.*?)\))? — (.*)$/;
// Une ligne de section : `  <instant>  #<issue>  <ce qui en est dit>`.
const LIGNE = /^ {2}(\S+) {2}#(\d+) {2}(.*)$/;
// Ce par quoi une ligne d'écart, après son motif et un tiret, dit le geste qui le lève — ou qu'il n'y en a pas.
const SUITES = ["pour la lui rendre : ", "rien ne la rend au manager"];

function ecartDe({ a, ticket, dit }: Decision): Ecart {
  const coupes = SUITES.map((suite) => dit.indexOf(` — ${suite}`)).filter((coupe) => coupe !== -1);
  // Un ticket servi ailleurs, une issue déjà rendue : la ligne ne dit que cela.
  if (coupes.length === 0) return { a, ticket, motif: dit };
  const coupe = Math.min(...coupes);
  return { a, ticket, motif: dit.slice(0, coupe), rend: dit.slice(coupe + " — ".length) };
}

// Les lignes d'une section, lues une à une : celles qui n'ont pas la forme restent à part.
function sectionDe<Ligne>(lue: Ouverte | undefined, lire: (decision: Decision) => Ligne): Section<Ligne> | undefined {
  if (lue === undefined) return undefined;
  const section: Section<Ligne> = { dit: lue.dit, lignes: [], illisibles: [] };
  for (const ligne of lue.lignes) {
    const [, a, numero, dit] = LIGNE.exec(ligne) ?? [];
    const ticket = Number(numero);
    if (a !== undefined && dit !== undefined && Number.isSafeInteger(ticket)) section.lignes.push(lire({ a, ticket, dit }));
    else section.illisibles.push(ligne);
  }
  return section;
}

// Une section telle qu'elle est écrite : sa ligne de titre, ce qu'elle dit après lui, et les lignes qui la suivent.
type Ouverte = { titre: string; dit: string; lignes: string[] };

// Ce que cette sortie de `manager` dit — ou en quoi elle n'en a pas la forme.
export function managerDe(sortie: string): Manager | { informe: string } {
  const sections = new Map<string, Ouverte>();
  let courante: Ouverte | undefined;
  for (const ligne of sortie.split("\n")) {
    const titre = titreDe(ligne);
    // Seule sa première ligne ouvre une section : la même, plus bas, est une ligne de celle où elle tombe.
    if (titre !== undefined && !sections.has(titre)) sections.set(titre, (courante = { titre: ligne, dit: ligne.slice(titre.length).trim(), lignes: [] }));
    else if (ligne.trim() !== "") courante?.lignes.push(ligne);
  }

  const tete = sections.get(COMMANDE);
  if (tete === undefined) return { informe: "elle n'a pas de ligne `manager`" };
  const [, mot, depuis, par, dit] = INTERRUPTEUR.exec(tete.dit) ?? [];
  if (mot === undefined || dit === undefined) return { informe: `sa ligne \`manager\` ne dit ni ALLUMÉ ni ÉTEINT dans la forme attendue : « ${tete.titre} »` };

  const decisions = sectionDe(sections.get(DECISIONS), (decision) => decision);
  const ecartees = sectionDe(sections.get(ECARTEES), ecartDe);
  return {
    interrupteur: { allume: mot === "ALLUMÉ", mot, ...(depuis === undefined || par === undefined ? {} : { depuis, par }), dit },
    ...(decisions === undefined ? {} : { decisions }),
    ...(ecartees === undefined ? {} : { ecartees }),
  };
}

// Une liste, prête à poser. `vide` : ce qui se lit à la place de ses lignes quand elle n'en a pas.
export type Liste<Ligne> = { lignes: Ligne[]; illisibles: string[]; vide?: string };
// Ce que l'onglet Manager pose au-dessus du texte de sa lecture : la vue n'y calcule rien.
// `ton` : la couleur de l'interrupteur. `sans` : pourquoi l'état n'est pas posé — ce n'est jamais « éteint ».
export type Vu = { projet: string; demande: number; a: string } & ({ interrupteur: Interrupteur & { ton: string }; decisions: Liste<Decision>; ecartees: Liste<Ecart> } | { sans: string });

const PAS_LU = "l'état du manager n'a pas été lu : ce que l'app a obtenu à sa place est dessous. Ce n'est pas « éteint »";
const sansForme = (informe: string) => `l'état du manager n'a pas été lu dans cette sortie : ${informe}. Ce n'est pas « éteint » — elle se lit dessous, entière`;
const sansSection = (titre: string) => `pas lues : la sortie n'a pas de ligne \`${titre}\`. Ce n'est pas « aucune » — elle se lit dessous, entière`;

function liste<Ligne>(titre: string, section: Section<Ligne> | undefined): Liste<Ligne> {
  if (section === undefined) return { lignes: [], illisibles: [], vide: sansSection(titre) };
  const { dit, lignes, illisibles } = section;
  // Sans ligne, c'est le mot du runtime qui se lit : l'app n'en écrit pas d'autre.
  return { lignes, illisibles, ...(lignes.length === 0 && illisibles.length === 0 && dit !== "" ? { vide: dit } : {}) };
}

// Ce qu'une lecture de l'onglet Manager donne à poser. Ratée, ou sans la forme, elle
// ne dit rien du manager : ce que l'app a obtenu se lit dans l'onglet, comme pour les autres.
export function voir(lecture: Lecture): Vu {
  const { projet, demande, a } = lecture;
  const sortie = "erreur" in lecture ? undefined : lecture.sorties.find(({ commande }) => commande === COMMANDE)?.texte;
  if (sortie === undefined) return { projet, demande, a, sans: PAS_LU };
  const manager = managerDe(sortie);
  if ("informe" in manager) return { projet, demande, a, sans: sansForme(manager.informe) };
  const { interrupteur } = manager;
  return { projet, demande, a, interrupteur: { ...interrupteur, ton: interrupteur.allume ? "vert" : "gris" }, decisions: liste(DECISIONS, manager.decisions), ecartees: liste(ECARTEES, manager.ecartees) };
}
