// Les humains du projet, sous Settings (#2930, épique 2926) : ceux que son `.claude/brigade/projet.json` déclare, lus
// et changés par la commande du runtime `humans` (runtime/src/humains/commande.ts, #2929), là où la cuisine du projet
// tourne, comme ses réglages (settings-du-project.ts) :
//   - `humans` : `{"humans":[{login, roles}]}` ;
//   - `humans save <login> [<role>…]`, `humans remove <login>` : `{"ok":true,"pr":<adresse>}`, ou
//     `{"ok":false,"message":<la ligne du refus>}` — un login inconnu, sans accès au dépôt, rien qui change.
// L'app ne juge que ce qui ne s'écrirait pas en mots d'une commande : un login GitHub, des rôles connus. Le reste est
// jugé par le runtime, avec sa phrase.
import type { Lu, Rendu } from "./box.ts";
import { detailDe, sansLaCommand } from "./settings-du-project.ts";

export const ROLES = ["product", "design", "review", "client-contact"] as const;
export type Role = (typeof ROLES)[number];
export type Human = { login: string; roles: Role[] };
export type ReadDesHumans = Human[] | { sans: string; detail?: string };
export type EcritureDUnHuman = { pr: string } | { refus: string; detail?: string };

const estObjet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
// Un login GitHub : des lettres, des chiffres et des tirets, 39 au plus.
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

// La dernière ligne de la sortie, lue en JSON ; `null` si elle ne se lit pas.
function answerDe(rendu: Rendu): unknown {
  try {
    return JSON.parse(rendu.sortie.trim().split("\n").at(-1) ?? "");
  } catch {
    return null;
  }
}

// Les humains déclarés, là où la cuisine du projet tourne ; sinon, pourquoi ils ne se lisent pas.
export async function lireLesHumans(project: string, lu: Lu | undefined, lancer: (lu: Lu, command: string) => Promise<Rendu>): Promise<ReadDesHumans> {
  if (lu === undefined) return { sans: `${project} has no station: its humans are read where its kitchen runs` };
  const rendu = await lancer(lu, "humans");
  if (sansLaCommand(rendu)) return { sans: "humans unavailable: this station's runtime does not give them yet — update it", detail: detailDe(rendu) };
  const answer = rendu.erreur === null ? answerDe(rendu) : null;
  const humans = estObjet(answer) && Array.isArray(answer.humans) ? answer.humans : null;
  if (humans === null || !humans.every((human) => estObjet(human) && typeof human.login === "string" && Array.isArray(human.roles))) {
    return { sans: "humans unavailable", detail: detailDe(rendu) };
  }
  return humans.map((human) => ({ login: human.login as string, roles: (human.roles as unknown[]).filter((role): role is Role => (ROLES as readonly unknown[]).includes(role)) }));
}

// Les mots de l'écriture, ou pourquoi elle ne s'écrit pas.
export function commandDesHumans(action: { save: unknown } | { remove: unknown }): { commande: string } | { refus: string } {
  if ("remove" in action) {
    return typeof action.remove === "string" && LOGIN.test(action.remove) ? { commande: `humans remove ${action.remove}` } : { refus: "nothing was sent: this is not a GitHub login" };
  }
  const human = action.save;
  if (!estObjet(human) || typeof human.login !== "string" || !LOGIN.test(human.login.trim())) return { refus: "nothing was sent: this is not a GitHub login" };
  const roles = Array.isArray(human.roles) ? human.roles : [];
  if (!roles.every((role) => (ROLES as readonly unknown[]).includes(role))) return { refus: `nothing was sent: a role is one of ${ROLES.join(", ")}` };
  return { commande: ["humans", "save", human.login.trim(), ...(roles as Role[])].join(" ") };
}

// Ajoute, change ou retire un humain par le runtime du projet : l'adresse de la PR ouverte, ou la ligne du refus.
export async function ecrireLesHumans(project: string, lu: Lu | undefined, action: { save: unknown } | { remove: unknown }, lancer: (lu: Lu, command: string) => Promise<Rendu>): Promise<EcritureDUnHuman> {
  const ecrite = commandDesHumans(action);
  if ("refus" in ecrite) return ecrite;
  if (lu === undefined) return { refus: `nothing was sent: “${project}” has no station — there is no runtime to propose it` };
  const rendu = await lancer(lu, ecrite.commande);
  if (sansLaCommand(rendu)) return { refus: "nothing was proposed: this station's runtime cannot change the humans yet — update it", detail: detailDe(rendu) };
  const answer = answerDe(rendu);
  if (estObjet(answer) && answer.ok === true && typeof answer.pr === "string" && URL.parse(answer.pr)?.protocol === "https:") return { pr: answer.pr };
  if (estObjet(answer) && answer.ok === false && typeof answer.message === "string" && answer.message !== "") {
    return { refus: (answer.message.split("\n")[0] ?? "").replaceAll("`", ""), detail: detailDe(rendu) };
  }
  return { refus: "nothing was proposed: the runtime's answer could not be read", detail: detailDe(rendu) };
}
