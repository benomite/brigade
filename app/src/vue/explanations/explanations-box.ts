// Les explications des mots de la cuisine, côté process principal (ticket 3308, épique 3304) : ce que le chef a vu ou écarté
// est gardé par le runtime du projet, par chef — son compte GitHub —, pour valoir sur chacun de ses appareils. Lu, marqué
// et effacé par la commande `explanations` (runtime/src/explications/commande.ts), là où la cuisine du projet tourne, comme
// ses tickets récurrents (vue/recurring/recurring-box.ts) :
//   - `explanations --chef <login>` : `{"seen":[<mot>…]}` ;
//   - `explanations seen <mot> --chef <login>`, `explanations reset --chef <login>` : `{"ok":true,"seen":[<mot>…]}` ;
//   - un refus : `{"ok":false,"message":<la ligne du refus>}`, avec le code de sortie 1.
// Une réponse qui ne se lit pas ne se devine pas : elle se dit, le détail au survol — jamais lue comme un registre vide.
import type { Lu, Rendu } from "../../box.ts";
import { detailDe, sansLaCommand } from "../../settings-du-project.ts";

export const MOTS_EXPLIQUES = ["rail", "pass", "cook", "second", "TODO", "WAITING"] as const;
export type WordExplique = (typeof MOTS_EXPLIQUES)[number];

// Ce que la lecture rend : les mots déjà vus, ou pourquoi le registre ne se lit pas.
export type ReadDesExplanations = { vus: WordExplique[] } | { sans: string; detail?: string };
// Ce qu'une écriture rend : les mots vus après elle, ou la ligne du refus.
export type EcritureDesExplanations = { vus: WordExplique[] } | { refus: string; detail?: string };

// Le compte GitHub de cet ordinateur : `null` quand il ne se lit pas.
export type Account = () => Promise<string | null>;

const ACCOUNT = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const SANS_ACCOUNT = "explanations unavailable: no GitHub account is signed in on this computer — they are kept per chef";

const estObjet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
const estUnWord = (word: unknown): word is WordExplique => typeof word === "string" && (MOTS_EXPLIQUES as readonly string[]).includes(word);

// La dernière ligne de la sortie, lue en JSON ; `null` si elle ne se lit pas.
function answerDe(rendu: Rendu): unknown {
  try {
    return JSON.parse(rendu.sortie.trim().split("\n").at(-1) ?? "");
  } catch {
    return null;
  }
}

const motsLus = (brut: unknown): WordExplique[] | null => (Array.isArray(brut) && brut.every(estUnWord) ? brut : null);

async function accountLu(account: Account): Promise<string | null> {
  const login = await account().catch(() => null);
  return login !== null && ACCOUNT.test(login) ? login : null;
}

// Les mots dont le chef de cet ordinateur a vu ou écarté l'explication, là où la cuisine du projet tourne ; sinon, pourquoi
// ils ne se lisent pas.
export async function lireLesExplanations(project: string, lu: Lu | undefined, account: Account, lancer: (lu: Lu, command: string) => Promise<Rendu>): Promise<ReadDesExplanations> {
  if (lu === undefined) return { sans: `explanations unavailable: ${project} has no station — they are kept where its kitchen runs` };
  const login = await accountLu(account);
  if (login === null) return { sans: SANS_ACCOUNT };
  const rendu = await lancer(lu, `explanations --chef ${login}`);
  if (sansLaCommand(rendu)) return { sans: "explanations unavailable: this station's runtime does not keep them yet — update it", detail: detailDe(rendu) };
  const answer = rendu.erreur === null ? answerDe(rendu) : null;
  const vus = estObjet(answer) ? motsLus(answer.seen) : null;
  return vus === null ? { sans: "explanations unavailable", detail: detailDe(rendu) } : { vus };
}

// Marque l'explication d'un mot vue (`{ vu: mot }`), ou les efface toutes (`{ effacer: true }`) : chaque mot se montre de
// nouveau, sur cet appareil comme sur les autres du chef.
export async function ecrireLesExplanations(project: string, lu: Lu | undefined, account: Account, action: { vu: unknown } | { effacer: true }, lancer: (lu: Lu, command: string) => Promise<Rendu>): Promise<EcritureDesExplanations> {
  if ("vu" in action && !estUnWord(action.vu)) return { refus: "nothing was sent: this is not one of the explained words" };
  if (lu === undefined) return { refus: `nothing was sent: “${project}” has no station — the explanations are kept where its kitchen runs` };
  const login = await accountLu(account);
  if (login === null) return { refus: `nothing was sent: ${SANS_ACCOUNT.replace("explanations unavailable: ", "")}` };
  const rendu = await lancer(lu, "vu" in action ? `explanations seen ${action.vu} --chef ${login}` : `explanations reset --chef ${login}`);
  if (sansLaCommand(rendu)) return { refus: "nothing was changed: this station's runtime does not keep the explanations yet — update it", detail: detailDe(rendu) };
  const answer = answerDe(rendu);
  if (estObjet(answer) && answer.ok === true) {
    const vus = motsLus(answer.seen);
    if (vus !== null) return { vus };
  }
  if (estObjet(answer) && answer.ok === false && typeof answer.message === "string" && answer.message !== "") return { refus: answer.message.split("\n")[0] ?? "", detail: detailDe(rendu) };
  return { refus: "nothing was changed: the runtime's answer could not be read", detail: detailDe(rendu) };
}
