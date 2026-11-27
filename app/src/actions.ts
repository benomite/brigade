// Les gestes du chef : ceux qu'il répète. Chacun est une commande de
// docs/runtime/exploitation.md — « Piloter » —, reprise mot pour mot et lancée par le geste de la
// station de cet ordinateur, où le projet cuit (`enPoste`). Chacun part dans le second : préfixée du `!`
// qui la lance sur le Mac depuis la session `claude`, la commande y est écrite puis
// envoyée par `envoyer` (terminals.ts), et sa sortie se lit dans son fil. Elle ne part
// que d'un second dit libre : sinon rien n'est écrit, et le refus dit pourquoi.
// Un geste a l'une de deux formes (docs/superpowers/specs/2026-10-13-app-poste-de-travail-design.md,
// « Ce qu'un clic fait, geste par geste ») :
// - direct : sans jugement, il ne détruit ni n'engage rien — il part au clic ;
// - confirmé : destructif ou lourd, il ne part qu'après un « oui » du chef, devant une
//   confirmation qui dit son prix en clair (confirmation.ts) — pas un LLM. Nommé sans ce
//   « oui », il refuse, et rien n'est écrit.
// La troisième forme, le geste avec jugement, n'est pas ici : ce n'est pas une commande
// mais une demande en prose, écrite dans le second sans Entrée (request.ts).
// Ce module ne lance rien et ne demande rien de plus à la station : il n'a que cet `envoyer`
// pour toucher au monde.
// Ce qui se joue sur la machine à côté du runtime (`systemctl`, `claude /login`)
// n'est pas un geste de l'app : rien de tel n'est ici.
import { ACTION, words, type Kitchen, type Locale } from "./box.ts";
import type { Project } from "./config.ts";
import { CONTROL, WITHOUT_WRITE, type Terminal } from "./terminals.ts";

// `commande` : ce qui suit `brigade <projet>` sur sa ligne de la doc.
// `forme` : direct, il part au clic ; confirmé, il attend le « oui » du chef.
export type Action = { id: string; commande: string; forme: "direct" | "confirmé" };

export const ACTIONS: readonly Action[] = [
  // L'interrupteur du projet (#1406), un seul pour tout le projet. Allumer engage : le manager juge
  // tout le backlog, ce qu'il juge exécutable part en cuisine, et une livraison verte est mergée
  // (power-up.ts). Éteindre ne détruit rien : rien de neuf n'est pris, jugé, découpé ni mergé.
  { id: "projet-allumer", commande: "switch on", forme: "confirmé" },
  { id: "projet-eteindre", commande: "switch off", forme: "direct" },
  // Arrêter tue les cooks en vol ; reprendre relance les tickets, sur le quota du chef.
  { id: "reprendre", commande: "guardrails resume", forme: "confirmé" },
  { id: "stop", commande: "guardrails stop", forme: "confirmé" },
];

// Les gestes de chaque forme, par leur nom : la vue dit de chacun ce que son clic fait.
export const DIRECT: readonly string[] = ACTIONS.filter(({ forme: shape }) => shape === "direct").map(({ id }) => id);
export const CONFIRMED: readonly string[] = ACTIONS.filter(({ forme: shape }) => shape === "confirmé").map(({ id }) => id);

// Ce qu'un geste confirmé dit quand il est nommé sans le « oui » du chef.
export const WITHOUT_YES = "nothing was sent: this action waits for your “yes”, in front of what it costs — nothing is written into the second";

// Un mot tel que le shell du Mac le rendra : entier, sans rien en exécuter.
export const word = (text: string) => (/^[A-Za-z0-9@._:-]+$/.test(text) ? text : `'${text.replaceAll("'", `'\\''`)}'`);

// Ce que le geste écrit pour ce projet — ou pourquoi il n'écrit rien. La vue
// nomme un geste, jamais une commande ; un projet
// dont la cuisine n'est nulle part n'a rien à écrire. `cuisine` : là où elle
// tourne à cet instant (workstation/kitchen-here.ts).
export function commandOfAction(id: unknown, project: Project, kitchen: Kitchen | undefined): { commande: string } | { refus: string } | undefined {
  const action = ACTIONS.find((candidate) => candidate.id === id);
  if (action === undefined || kitchen === undefined) return undefined;
  return onWorkstation(kitchen, project.nom, action.commande);
}

// Une commande du runtime dans sa forme de poste, pour ce projet : `suite` est ce qui suit
// `brigade <nom>`, ses mots déjà cités — ou pourquoi rien n'est écrit. Sa cuisine tourne sur cet
// ordinateur : la commande part au geste de sa station, ici.
export function onWorkstation(kitchen: Kitchen, name: string, suite: string): { commande: string } | { refus: string } {
  return inLocal(kitchen.locale, name, suite);
}

// Le geste de la station de cet ordinateur, depuis le dossier du runtime et avec le répertoire de la
// station — ce que `brigade <nom> <suite>` lance, et ce que la veille lance ici (box.ts, `lancerIci`).
// Dans un sous-shell : le second garde son dossier. Un seul shell la lit : `suite` est relue mot
// à mot, puis chaque mot recité pour ce seul shell.
function inLocal(locale: Locale, name: string, suite: string): { commande: string } | { refus: string } {
  const args = words(words(suite).join(" ")).map(word);
  const command = `(cd ${word(locale.runtime)} && BRIGADE_STATION_DIR=${word(locale.racine)} ${word(locale.node)} ${ACTION} ${word(name)}${args.map((arg) => ` ${arg}`).join("")})`;
  return CONTROL.test(command) ? { refus: WITHOUT_WRITE } : { commande: command };
}

// Envoie le geste dans le second du projet — ou dit pourquoi rien n'est parti. Ce qui est
// rendu est le second, dont la note dit ce qui est parti ; le refus dit pourquoi rien ne
// l'est : un second qui n'est pas dit libre, ou un geste confirmé nommé sans `oui`. Seul
// `true` vaut « oui » : rien d'autre venu de la vue ne fait partir un geste confirmé.
type Registry = { envoyer(project: Project, command: string): Promise<Terminal | { refus: string }> };
export function writeAction(terminals: Registry, id: unknown, project: Project, yes: unknown, kitchen: Kitchen | undefined): { refus: string } | undefined | Promise<Terminal | { refus: string }> {
  const written = commandOfAction(id, project, kitchen);
  if (written === undefined || "refus" in written) return written;
  if (project.refus !== undefined) return { refus: `nothing is written: “${project.nom}” does not open — ${project.refus}` };
  if (CONFIRMED.includes(String(id)) && yes !== true) return { refus: WITHOUT_YES };
  return terminals.envoyer(project, `!${written.commande}`);
}
