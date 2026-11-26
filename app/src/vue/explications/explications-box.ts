// Les explications des mots de la cuisine, côté process principal (ticket 3308, épique 3304) : ce que le chef a vu ou écarté
// est gardé par le runtime du projet, par chef — son compte GitHub —, pour valoir sur chacun de ses appareils. Lu, marqué
// et effacé par la commande `explanations` (runtime/src/explications/commande.ts), là où la cuisine du projet tourne, comme
// ses tickets récurrents (vue/recurrents/recurrents-box.ts) :
//   - `explanations --chef <login>` : `{"seen":[<mot>…]}` ;
//   - `explanations seen <mot> --chef <login>`, `explanations reset --chef <login>` : `{"ok":true,"seen":[<mot>…]}` ;
//   - un refus : `{"ok":false,"message":<la ligne du refus>}`, avec le code de sortie 1.
// Une réponse qui ne se lit pas ne se devine pas : elle se dit, le détail au survol — jamais lue comme un registre vide.
import type { Lu, Rendu } from "../../box.ts";
import { detailDe, sansLaCommande } from "../../reglages-du-projet.ts";

export const MOTS_EXPLIQUES = ["rail", "pass", "cook", "second", "TODO", "WAITING"] as const;
export type MotExplique = (typeof MOTS_EXPLIQUES)[number];

// Ce que la lecture rend : les mots déjà vus, ou pourquoi le registre ne se lit pas.
export type LectureDesExplications = { vus: MotExplique[] } | { sans: string; detail?: string };
// Ce qu'une écriture rend : les mots vus après elle, ou la ligne du refus.
export type EcritureDesExplications = { vus: MotExplique[] } | { refus: string; detail?: string };

// Le compte GitHub de cet ordinateur : `null` quand il ne se lit pas.
export type Compte = () => Promise<string | null>;

const COMPTE = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const SANS_COMPTE = "explanations unavailable: no GitHub account is signed in on this computer — they are kept per chef";

const estObjet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
const estUnMot = (mot: unknown): mot is MotExplique => typeof mot === "string" && (MOTS_EXPLIQUES as readonly string[]).includes(mot);

// La dernière ligne de la sortie, lue en JSON ; `null` si elle ne se lit pas.
function reponseDe(rendu: Rendu): unknown {
  try {
    return JSON.parse(rendu.sortie.trim().split("\n").at(-1) ?? "");
  } catch {
    return null;
  }
}

const motsLus = (brut: unknown): MotExplique[] | null => (Array.isArray(brut) && brut.every(estUnMot) ? brut : null);

async function compteLu(compte: Compte): Promise<string | null> {
  const login = await compte().catch(() => null);
  return login !== null && COMPTE.test(login) ? login : null;
}

// Les mots dont le chef de cet ordinateur a vu ou écarté l'explication, là où la cuisine du projet tourne ; sinon, pourquoi
// ils ne se lisent pas.
export async function lireLesExplications(projet: string, lu: Lu | undefined, compte: Compte, lancer: (lu: Lu, commande: string) => Promise<Rendu>): Promise<LectureDesExplications> {
  if (lu === undefined) return { sans: `explanations unavailable: ${projet} has no station — they are kept where its kitchen runs` };
  const login = await compteLu(compte);
  if (login === null) return { sans: SANS_COMPTE };
  const rendu = await lancer(lu, `explanations --chef ${login}`);
  if (sansLaCommande(rendu)) return { sans: "explanations unavailable: this station's runtime does not keep them yet — update it", detail: detailDe(rendu) };
  const reponse = rendu.erreur === null ? reponseDe(rendu) : null;
  const vus = estObjet(reponse) ? motsLus(reponse.seen) : null;
  return vus === null ? { sans: "explanations unavailable", detail: detailDe(rendu) } : { vus };
}

// Marque l'explication d'un mot vue (`{ vu: mot }`), ou les efface toutes (`{ effacer: true }`) : chaque mot se montre de
// nouveau, sur cet appareil comme sur les autres du chef.
export async function ecrireLesExplications(projet: string, lu: Lu | undefined, compte: Compte, geste: { vu: unknown } | { effacer: true }, lancer: (lu: Lu, commande: string) => Promise<Rendu>): Promise<EcritureDesExplications> {
  if ("vu" in geste && !estUnMot(geste.vu)) return { refus: "nothing was sent: this is not one of the explained words" };
  if (lu === undefined) return { refus: `nothing was sent: “${projet}” has no station — the explanations are kept where its kitchen runs` };
  const login = await compteLu(compte);
  if (login === null) return { refus: `nothing was sent: ${SANS_COMPTE.replace("explanations unavailable: ", "")}` };
  const rendu = await lancer(lu, "vu" in geste ? `explanations seen ${geste.vu} --chef ${login}` : `explanations reset --chef ${login}`);
  if (sansLaCommande(rendu)) return { refus: "nothing was changed: this station's runtime does not keep the explanations yet — update it", detail: detailDe(rendu) };
  const reponse = reponseDe(rendu);
  if (estObjet(reponse) && reponse.ok === true) {
    const vus = motsLus(reponse.seen);
    if (vus !== null) return { vus };
  }
  if (estObjet(reponse) && reponse.ok === false && typeof reponse.message === "string" && reponse.message !== "") return { refus: reponse.message.split("\n")[0] ?? "", detail: detailDe(rendu) };
  return { refus: "nothing was changed: the runtime's answer could not be read", detail: detailDe(rendu) };
}
