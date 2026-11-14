// Un ticket dont les gates ne se jouent pas sur une station — une dépendance
// qui y manque, un service local qui n'y répond pas — va à une autre station
// du projet, jamais au chef en geste (#3057). Le 2026-11-09, mirrorlab#674
// s'arrêtait sur une station sans ce que ses gates demandent, quand box/claude
// pouvait les jouer : la question du cook partait au chef.
//
// Le cook le dit dans son `<bloque>` : les gates (ou les tests) ne tournent pas
// ici, faute d'une dépendance, d'une commande, d'un service (`gatesInjouables`).
// La station écrit alors sur l'issue la marque de son incapacité, qui la nomme,
// et rend le ticket sans compter d'essai. Sa porte de prise ne le reprend plus
// (`incapables`) : une autre station du projet, qui n'est pas marquée, le
// prend à son tour. Si le projet n'en a pas d'autre, le ticket reste sur le
// rail, retenu sur cette station : c'est elle qu'il faut réparer, ce que son
// journal et la ligne de saut de sa porte disent — ni `blocked-on-human`, ni
// carte TODO, ni manager.
//
// Les marques comptent depuis le dernier retrait de `fire` ou de
// `served-elsewhere` : remettre le ticket sur le rail les oublie toutes.
import { DE_CONFIANCE } from "../alimenter.ts";
import { LABEL, MIS_DE_COTE } from "../github.ts";

// La marque du commentaire d'incapacité, suivie de la station qu'elle nomme.
export const MARQUE_D_INCAPACITE = "<!-- brigade:station-incapable";
const LIRE_LA_MARQUE = /^<!-- brigade:station-incapable station=([A-Za-z0-9._/-]+) -->/;

// Ce que le cook dit des gates : elles, ou les tests qu'elles jouent.
const GATES = /\bgates?\b|test suite|\btests?\b|suite de tests/i;
// Ce qui leur manque sur la station : une dépendance, un outil, un service.
const ENVIRONNEMENT = /depend|d[ée]pendance|package|paquet|module|binar|command|commande|service|database|base de données|server|serveur|docker|postgres|redis|mysql|toolchain|runtime|sdk|this station|cette station|this machine|cette machine/i;
// Et qu'il ne l'a pas : absent, pas installé, injoignable.
const MANQUE = /missing|not installed|isn't installed|not available|unavailable|command not found|not found|no such|cannot find|can't find|unreachable|not reachable|ECONNREFUSED|connection refused|could not connect|cannot connect|can't connect|not running|cannot run|can't run|could not run|manque|absente?s?\b|pas install|introuvable|injoignable|ne répond pas|ne tourne pas|ne peu[tx] pas (?:jouer|tourner|lancer)/i;

// Le cook dit-il, dans son blocage, que les gates ne tournent pas sur sa
// station ? Il faut les trois dans une même phrase : les gates, ce qui leur
// manque sur la machine, et ce manque. Une autre question suit sa voie.
export function gatesInjouables(question: string): boolean {
  return question.split(/(?<=[.!?;])\s+|\n+/).some((phrase) => GATES.test(phrase) && ENVIRONNEMENT.test(phrase) && MANQUE.test(phrase));
}

// Les stations que l'issue marque incapables de jouer les gates du ticket,
// depuis qu'il a été remis sur le rail. Seuls comptent les commentaires du
// dépôt, comme pour la prise.
export function incapables(commentaires: readonly { body: string; association: string; createdAt: string }[], retraits: readonly { label: string; createdAt: string }[]): Set<string> {
  const relance = Math.max(0, ...retraits.filter((r) => r.label === LABEL || (MIS_DE_COTE as readonly string[]).includes(r.label)).map((r) => Date.parse(r.createdAt)).filter((t) => !Number.isNaN(t)));
  const marquees = new Set<string>();
  for (const c of commentaires) {
    if (!DE_CONFIANCE.includes(c.association) || Date.parse(c.createdAt) <= relance) continue;
    const station = LIRE_LA_MARQUE.exec(c.body)?.[1];
    if (station !== undefined) marquees.add(station);
  }
  return marquees;
}

// Où va le ticket : les autres stations du projet qu'aucune marque n'écarte.
// Aucune : il reste retenu sur cette station.
export function stationsCapables(station: string, stationsDuProjet: readonly string[], marquees: ReadonlySet<string>): string[] {
  return [...new Set(stationsDuProjet)].filter((autre) => autre !== station && !marquees.has(autre));
}

const citer = (texte: string) =>
  texte
    .trim()
    .split("\n")
    .map((ligne) => `> ${ligne}`)
    .join("\n");

const liste = (stations: readonly string[]) => stations.map((s) => `\`${s}\``).join(", ");

// Le commentaire qui marque la station incapable : sa marque, que toute
// station relit à sa porte de prise, puis où va le ticket.
export function corpsDeLIncapacite({ station, vers, question }: { station: string; vers: readonly string[]; question: string }): string {
  const suite =
    vers.length > 0
      ? `The ticket is given back for another station of the project (${liste(vers)}); \`${station}\` does not take it again.`
      : `No other station of the project can take it: the ticket stays on the rail, held on \`${station}\`, until that station can run the gates. This is the station's setup, not a question for the chef.`;
  return [`${MARQUE_D_INCAPACITE} station=${station} -->`, `Station \`${station}\` cannot run this ticket's gates: the cook stopped on what this station lacks. ${suite} This stop is not counted among the ticket's tries; putting the ticket back on the rail (removing and re-adding \`${LABEL}\`) clears this mark.`, "", "The cook's words:", "", citer(question)].join("\n");
}

// Pourquoi la porte de prise d'une station marquée saute le ticket.
export function direIncapacite(station: string, vers: readonly string[]): string {
  return vers.length > 0 ? `station ${station} cannot run its gates — it goes to ${vers.join(", ")}` : `station ${station} cannot run its gates and no other station of the project can — the station is to be fixed`;
}
