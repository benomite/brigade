// Les humains du projet, sous Settings (#2930, épique 2926) : ceux que son `.claude/brigade/projet.json` déclare, lus
// et changés par la commande du runtime `humans` (runtime/src/humains/commande.ts, #2929), là où la cuisine du projet
// tourne, comme ses réglages (settings-of-project.ts) :
//   - `humans` : `{"humans":[{login, roles}]}` ;
//   - `humans save <login> [<role>…]`, `humans remove <login>` : `{"ok":true,"pr":<adresse>}`, ou
//     `{"ok":false,"message":<la ligne du refus>}` — un login inconnu, sans accès au dépôt, rien qui change.
// L'app ne juge que ce qui ne s'écrirait pas en mots d'une commande : un login GitHub, des rôles connus. Le reste est
// jugé par le runtime, avec sa phrase.
import type { Read, Rendered } from "./box.ts";
import { detailOf, withoutTheCommand } from "./settings-of-project.ts";

export const ROLES = ["product", "design", "review", "client-contact"] as const;
export type Role = (typeof ROLES)[number];
export type Human = { login: string; roles: Role[] };
export type ReadOfHumans = Human[] | { sans: string; detail?: string };
export type WritingOfAHuman = { pr: string } | { refus: string; detail?: string };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
// Un login GitHub : des lettres, des chiffres et des tirets, 39 au plus.
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

// La dernière ligne de la sortie, lue en JSON ; `null` si elle ne se lit pas.
function answerOf(rendered: Rendered): unknown {
  try {
    return JSON.parse(rendered.sortie.trim().split("\n").at(-1) ?? "");
  } catch {
    return null;
  }
}

// Les humains déclarés, là où la cuisine du projet tourne ; sinon, pourquoi ils ne se lisent pas.
export async function readTheHumans(project: string, readOne: Read | undefined, launch: (readOne: Read, command: string) => Promise<Rendered>): Promise<ReadOfHumans> {
  if (readOne === undefined) return { sans: `${project} has no station: its humans are read where its kitchen runs` };
  const rendered = await launch(readOne, "humans");
  if (withoutTheCommand(rendered)) return { sans: "humans unavailable: this station's runtime does not give them yet — update it", detail: detailOf(rendered) };
  const answer = rendered.erreur === null ? answerOf(rendered) : null;
  const humans = isObject(answer) && Array.isArray(answer.humans) ? answer.humans : null;
  if (humans === null || !humans.every((human) => isObject(human) && typeof human.login === "string" && Array.isArray(human.roles))) {
    return { sans: "humans unavailable", detail: detailOf(rendered) };
  }
  return humans.map((human) => ({ login: human.login as string, roles: (human.roles as unknown[]).filter((role): role is Role => (ROLES as readonly unknown[]).includes(role)) }));
}

// Les mots de l'écriture, ou pourquoi elle ne s'écrit pas.
export function commandOfHumans(action: { save: unknown } | { remove: unknown }): { commande: string } | { refus: string } {
  if ("remove" in action) {
    return typeof action.remove === "string" && LOGIN.test(action.remove) ? { commande: `humans remove ${action.remove}` } : { refus: "nothing was sent: this is not a GitHub login" };
  }
  const human = action.save;
  if (!isObject(human) || typeof human.login !== "string" || !LOGIN.test(human.login.trim())) return { refus: "nothing was sent: this is not a GitHub login" };
  const roles = Array.isArray(human.roles) ? human.roles : [];
  if (!roles.every((role) => (ROLES as readonly unknown[]).includes(role))) return { refus: `nothing was sent: a role is one of ${ROLES.join(", ")}` };
  return { commande: ["humans", "save", human.login.trim(), ...(roles as Role[])].join(" ") };
}

// Ajoute, change ou retire un humain par le runtime du projet : l'adresse de la PR ouverte, ou la ligne du refus.
export async function writeTheHumans(project: string, readOne: Read | undefined, action: { save: unknown } | { remove: unknown }, launch: (readOne: Read, command: string) => Promise<Rendered>): Promise<WritingOfAHuman> {
  const writtenOne = commandOfHumans(action);
  if ("refus" in writtenOne) return writtenOne;
  if (readOne === undefined) return { refus: `nothing was sent: “${project}” has no station — there is no runtime to propose it` };
  const rendered = await launch(readOne, writtenOne.commande);
  if (withoutTheCommand(rendered)) return { refus: "nothing was proposed: this station's runtime cannot change the humans yet — update it", detail: detailOf(rendered) };
  const answer = answerOf(rendered);
  if (isObject(answer) && answer.ok === true && typeof answer.pr === "string" && URL.parse(answer.pr)?.protocol === "https:") return { pr: answer.pr };
  if (isObject(answer) && answer.ok === false && typeof answer.message === "string" && answer.message !== "") {
    return { refus: (answer.message.split("\n")[0] ?? "").replaceAll("`", ""), detail: detailOf(rendered) };
  }
  return { refus: "nothing was proposed: the runtime's answer could not be read", detail: detailOf(rendered) };
}
