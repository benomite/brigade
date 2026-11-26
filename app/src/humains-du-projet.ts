// Les humains du projet, sous Settings (#2930, épique 2926) : ceux que son `.claude/brigade/projet.json` déclare, lus
// et changés par la commande du runtime `humans` (runtime/src/humains/commande.ts, #2929), là où la cuisine du projet
// tourne, comme ses réglages (reglages-du-projet.ts) :
//   - `humans` : `{"humans":[{login, roles}]}` ;
//   - `humans save <login> [<role>…]`, `humans remove <login>` : `{"ok":true,"pr":<adresse>}`, ou
//     `{"ok":false,"message":<la ligne du refus>}` — un login inconnu, sans accès au dépôt, rien qui change.
// L'app ne juge que ce qui ne s'écrirait pas en mots d'une commande : un login GitHub, des rôles connus. Le reste est
// jugé par le runtime, avec sa phrase.
import type { Lu, Rendu } from "./box.ts";
import { detailDe, sansLaCommande } from "./reglages-du-projet.ts";

export const ROLES = ["product", "design", "review", "client-contact"] as const;
export type Role = (typeof ROLES)[number];
export type Humain = { login: string; roles: Role[] };
export type LectureDesHumains = Humain[] | { sans: string; detail?: string };
export type EcritureDUnHumain = { pr: string } | { refus: string; detail?: string };

const estObjet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
// Un login GitHub : des lettres, des chiffres et des tirets, 39 au plus.
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

// La dernière ligne de la sortie, lue en JSON ; `null` si elle ne se lit pas.
function reponseDe(rendu: Rendu): unknown {
  try {
    return JSON.parse(rendu.sortie.trim().split("\n").at(-1) ?? "");
  } catch {
    return null;
  }
}

// Les humains déclarés, là où la cuisine du projet tourne ; sinon, pourquoi ils ne se lisent pas.
export async function lireLesHumains(projet: string, lu: Lu | undefined, lancer: (lu: Lu, commande: string) => Promise<Rendu>): Promise<LectureDesHumains> {
  if (lu === undefined) return { sans: `${projet} has no station: its humans are read where its kitchen runs` };
  const rendu = await lancer(lu, "humans");
  if (sansLaCommande(rendu)) return { sans: "humans unavailable: this station's runtime does not give them yet — update it", detail: detailDe(rendu) };
  const reponse = rendu.erreur === null ? reponseDe(rendu) : null;
  const humains = estObjet(reponse) && Array.isArray(reponse.humans) ? reponse.humans : null;
  if (humains === null || !humains.every((humain) => estObjet(humain) && typeof humain.login === "string" && Array.isArray(humain.roles))) {
    return { sans: "humans unavailable", detail: detailDe(rendu) };
  }
  return humains.map((humain) => ({ login: humain.login as string, roles: (humain.roles as unknown[]).filter((role): role is Role => (ROLES as readonly unknown[]).includes(role)) }));
}

// Les mots de l'écriture, ou pourquoi elle ne s'écrit pas.
export function commandeDesHumains(geste: { save: unknown } | { remove: unknown }): { commande: string } | { refus: string } {
  if ("remove" in geste) {
    return typeof geste.remove === "string" && LOGIN.test(geste.remove) ? { commande: `humans remove ${geste.remove}` } : { refus: "nothing was sent: this is not a GitHub login" };
  }
  const humain = geste.save;
  if (!estObjet(humain) || typeof humain.login !== "string" || !LOGIN.test(humain.login.trim())) return { refus: "nothing was sent: this is not a GitHub login" };
  const roles = Array.isArray(humain.roles) ? humain.roles : [];
  if (!roles.every((role) => (ROLES as readonly unknown[]).includes(role))) return { refus: `nothing was sent: a role is one of ${ROLES.join(", ")}` };
  return { commande: ["humans", "save", humain.login.trim(), ...(roles as Role[])].join(" ") };
}

// Ajoute, change ou retire un humain par le runtime du projet : l'adresse de la PR ouverte, ou la ligne du refus.
export async function ecrireLesHumains(projet: string, lu: Lu | undefined, geste: { save: unknown } | { remove: unknown }, lancer: (lu: Lu, commande: string) => Promise<Rendu>): Promise<EcritureDUnHumain> {
  const ecrite = commandeDesHumains(geste);
  if ("refus" in ecrite) return ecrite;
  if (lu === undefined) return { refus: `nothing was sent: “${projet}” has no station — there is no runtime to propose it` };
  const rendu = await lancer(lu, ecrite.commande);
  if (sansLaCommande(rendu)) return { refus: "nothing was proposed: this station's runtime cannot change the humans yet — update it", detail: detailDe(rendu) };
  const reponse = reponseDe(rendu);
  if (estObjet(reponse) && reponse.ok === true && typeof reponse.pr === "string" && URL.parse(reponse.pr)?.protocol === "https:") return { pr: reponse.pr };
  if (estObjet(reponse) && reponse.ok === false && typeof reponse.message === "string" && reponse.message !== "") {
    return { refus: (reponse.message.split("\n")[0] ?? "").replaceAll("`", ""), detail: detailDe(rendu) };
  }
  return { refus: "nothing was proposed: the runtime's answer could not be read", detail: detailDe(rendu) };
}
