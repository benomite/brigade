// Ce qu'engage l'allumage du projet (#1406) — et de son manager, qui le suit —, dit au moment du geste « allumer » :
// l'avertissement de docs/runtime/manager.md, « Le manager », mot pour mot, et deux
// nombres — les issues ouvertes du projet, et celles qui sont parquées
// (`parked`, #4129). Les nombres viennent de la box, par le geste qui existe
// (`brigade <nom> manager backlog`, box.ts) : une commande du runtime
// qui lit GitHub et n'écrit rien (runtime/src/manager-cli.ts). L'app ne joint
// pas GitHub elle-même, et ne demande rien de plus à la box.
// Rien n'y est deviné : une sortie sans la ligne `backlog`, une box pas jointe,
// un runtime qui ne connaît pas la commande — ce n'est jamais « aucune issue ».
// **L'avertissement est le prix de la confirmation** : « allumer » est un geste
// confirmé (actions.ts), et sa confirmation dit cet avertissement, puis ces deux
// nombres, demandés à la box dès qu'elle s'ouvre (confirmation.ts) — rien ne part
// avant le « oui » du chef, et ce « oui » n'attend pas les nombres. Ce module
// n'écrit dans aucun terminal.
import { failureOf, launchThe, type Read, type Settings } from "./box.ts";
import { titleOfFailure } from "./facts.ts";

// Le geste du socle (actions.ts) qui engage, et la lecture qui le chiffre.
export const ACTION = "projet-allumer";
export const COMMAND = "manager backlog";

// docs/runtime/manager.md, « Le manager » : son avertissement, sans sa mise en gras, dit en anglais
// côté app (la doc, elle, est en français).
export const WARNING =
  "Once on, the manager judges the whole open backlog, whatever it judges executable goes to the kitchen right away, and green deliveries are merged. Before switching the project on, park whatever must not go: a parked issue is never judged, a parked epic is never split.";

// Ce que la confirmation pose dès qu'elle s'ouvre, avant que la box ait répondu : la vue
// les nomme, elle n'en écrit aucun.
export const POWER_UP = {
  geste: ACTION,
  commande: COMMAND,
  enCours: "this project's open issues, and those parked: reading from the station…",
  parti: "the two numbers were not read: the app could not ask this project's station for them. This is not “no issue”: look at the backlog yourself before saying yes",
} as const;

export type Backlog = { ouvertes: number; retenues: number };

// La ligne `backlog` : `<n> open issue(s), of which <m> is/are parked — <suite>`. Une box d'avant #4260 la disait
// `<n> open issue(s), of which <m> carry/carries `<label>` — <suite>`, et d'avant #951 `<n> issue(s) ouverte(s), dont
// <m> porte(nt) `<label>` — <suite>` : son label d'attente d'alors.
const LINE = /^backlog {2,}(\d+) open issues?, of which (\d+) (?:is|are) parked/;
const LINES_OF_BEFORE = [/^backlog {2,}(\d+) open issues?, of which (\d+) carr(?:y|ies) `[a-z-]+`/, /^backlog {2,}(\d+) issues? ouvertes?, dont (\d+) porte(?:nt)? `[a-z-]+`/];

// Ce que cette sortie de `manager backlog` compte — ou en quoi elle n'en a pas la forme.
export function backlogOf(output: string): Backlog | { informe: string } {
  const lines = output.split("\n").filter((line) => line === "backlog" || line.startsWith("backlog "));
  const [line] = lines;
  if (line === undefined) return { informe: "it has no `backlog` line" };
  if (lines.length > 1) return { informe: "it has more than one `backlog` line" };
  const [, readEntries, scopes] = [LINE, ...LINES_OF_BEFORE].map((shape) => shape.exec(line)).find((readOne) => readOne !== null) ?? [];
  const [openEntries, retainedEntries] = [Number(readEntries), Number(scopes)];
  if (readEntries === undefined || scopes === undefined || !Number.isSafeInteger(openEntries) || !Number.isSafeInteger(retainedEntries)) return { informe: `its \`backlog\` line does not give the two numbers in the expected form: “${line}”` };
  if (retainedEntries > openEntries) return { informe: `its \`backlog\` line counts more parked issues than open issues: “${line}”` };
  return { ouvertes: openEntries, retenues: retainedEntries };
}

// Ce que la vue pose une fois la box revenue : elle n'y calcule rien. `a` : l'instant de la lecture.
// `dit` : le prix d'« allumer », en une phrase, d'après les deux nombres — ce que le manager va juger :
// les issues ouvertes, moins celles qui sont parquées, qu'il ne juge jamais (#906, #4260).
// `sans` : pourquoi ils ne sont pas posés — ce n'est jamais « aucune issue » ; `obtenu` : ce que
// l'app a eu à leur place, tel quel.
export type Account = { projet: string; a: string } & ((Backlog & { dit: string }) | { sans: string; obtenu: string });

const issues = (howMany: number) => `${howMany} open issue${howMany > 1 ? "s" : ""}`;
// La phrase des deux nombres : exportée pour l'outil de capture, qui la pose comme la box la ferait dire.
export function tell({ ouvertes: openEntries, retenues: retainedEntries }: Backlog): string {
  if (openEntries === 0) return "it will judge no issue: none is open";
  if (retainedEntries === 0) return `it will judge the ${issues(openEntries)}`;
  if (retainedEntries === openEntries) return `it will judge no issue: ${openEntries > 1 ? `all ${issues(openEntries)} are` : "the only open issue is"} parked`;
  return `it will judge ${openEntries - retainedEntries} of the ${issues(openEntries)} — ${retainedEntries} ${retainedEntries > 1 ? "are" : "is"} parked`;
}

const NOT_READ = "the two numbers were not read";
const NOT_NO = "This is not “no issue”: look at the backlog yourself before saying yes";

// Lance `manager backlog` sur la box du projet, une fois, et dit ce qu'il en est advenu. Jamais
// d'exception. Ses codes sont ceux d'une commande du runtime : 0, les nombres ; 1, GitHub n'a
// pas été lu ; 2, elle a été refusée — par un runtime d'avant elle, qui ne connaît pas `backlog`.
// Tout autre vient du geste.
export async function count(settings: Settings, served: Read): Promise<Account> {
  const rendered = await launchThe(settings, served, COMMAND);
  const [project, a] = [served.nom, new Date().toISOString()];
  const { erreur: error } = rendered;
  if (error === null) {
    const backlog = backlogOf(rendered.sortie);
    if ("informe" in backlog) return { projet: project, a, sans: `${NOT_READ} in what the station returned: ${backlog.informe}. ${NOT_NO}`, obtenu: `${rendered.lance}\n${rendered.erreurs}${rendered.sortie}` };
    return { projet: project, a, ...backlog, dit: tell(backlog) };
  }
  const failure = failureOf({ ...rendered, erreur: error }, settings.delaiMs);
  const refused = error.killed !== true && error.code === 2;
  const withoutGitHub = error.killed !== true && error.code === 1;
  const why = refused
    ? "the station's runtime refused `manager backlog` (code 2) — if it is older than this app, it does not know this reading yet: update brigade on the station"
    : withoutGitHub
      ? "the station answered, but `manager backlog` did not read GitHub (code 1) — what it says is below"
      : `${titleOfFailure(failure, "REACHED, BUT `manager backlog` DID NOT ANSWER")} — what the app got is below`;
  return { projet: project, a, sans: `${NOT_READ}: ${why}. ${NOT_NO}`, obtenu: failure.erreur };
}
