// Les explications des mots de la cuisine, côté process principal (ticket 3308, épique 3304) : ce que le chef a vu ou écarté
// est gardé par le runtime du projet, par chef — son compte GitHub —, pour valoir sur chacun de ses appareils. Lu, marqué
// et effacé par la commande `explanations` (runtime/src/explications/commande.ts), là où la cuisine du projet tourne, comme
// ses tickets récurrents (vue/recurring/recurring-box.ts) :
//   - `explanations --chef <login>` : `{"seen":[<mot>…]}` ;
//   - `explanations seen <mot> --chef <login>`, `explanations reset --chef <login>` : `{"ok":true,"seen":[<mot>…]}` ;
//   - un refus : `{"ok":false,"message":<la ligne du refus>}`, avec le code de sortie 1.
// Une réponse qui ne se lit pas ne se devine pas : elle se dit, le détail au survol — jamais lue comme un registre vide.
import type { Read, Rendered } from "../../box.ts";
import { detailOf, withoutTheCommand } from "../../settings-of-project.ts";

export const WORDS_EXPLAINED = ["rail", "pass", "cook", "second", "TODO", "WAITING"] as const;
export type WordExplained = (typeof WORDS_EXPLAINED)[number];

// Ce que la lecture rend : les mots déjà vus, ou pourquoi le registre ne se lit pas.
export type ReadOfExplanations = { vus: WordExplained[] } | { sans: string; detail?: string };
// Ce qu'une écriture rend : les mots vus après elle, ou la ligne du refus.
export type WritingOfExplanations = { vus: WordExplained[] } | { refus: string; detail?: string };

// Le compte GitHub de cet ordinateur : `null` quand il ne se lit pas.
export type Account = () => Promise<string | null>;

const ACCOUNT = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const WITHOUT_ACCOUNT = "explanations unavailable: no GitHub account is signed in on this computer — they are kept per chef";

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isOneWord = (word: unknown): word is WordExplained => typeof word === "string" && (WORDS_EXPLAINED as readonly string[]).includes(word);

// La dernière ligne de la sortie, lue en JSON ; `null` si elle ne se lit pas.
function answerOf(rendered: Rendered): unknown {
  try {
    return JSON.parse(rendered.sortie.trim().split("\n").at(-1) ?? "");
  } catch {
    return null;
  }
}

const wordsRead = (raw: unknown): WordExplained[] | null => (Array.isArray(raw) && raw.every(isOneWord) ? raw : null);

async function accountRead(account: Account): Promise<string | null> {
  const login = await account().catch(() => null);
  return login !== null && ACCOUNT.test(login) ? login : null;
}

// Les mots dont le chef de cet ordinateur a vu ou écarté l'explication, là où la cuisine du projet tourne ; sinon, pourquoi
// ils ne se lisent pas.
export async function readTheExplanations(project: string, readOne: Read | undefined, account: Account, launch: (readOne: Read, command: string) => Promise<Rendered>): Promise<ReadOfExplanations> {
  if (readOne === undefined) return { sans: `explanations unavailable: ${project} has no station — they are kept where its kitchen runs` };
  const login = await accountRead(account);
  if (login === null) return { sans: WITHOUT_ACCOUNT };
  const rendered = await launch(readOne, `explanations --chef ${login}`);
  if (withoutTheCommand(rendered)) return { sans: "explanations unavailable: this station's runtime does not keep them yet — update it", detail: detailOf(rendered) };
  const answer = rendered.erreur === null ? answerOf(rendered) : null;
  const seenOnes = isObject(answer) ? wordsRead(answer.seen) : null;
  return seenOnes === null ? { sans: "explanations unavailable", detail: detailOf(rendered) } : { vus: seenOnes };
}

// Marque l'explication d'un mot vue (`{ vu: mot }`), ou les efface toutes (`{ effacer: true }`) : chaque mot se montre de
// nouveau, sur cet appareil comme sur les autres du chef.
export async function writeTheExplanations(project: string, readOne: Read | undefined, account: Account, action: { vu: unknown } | { effacer: true }, launch: (readOne: Read, command: string) => Promise<Rendered>): Promise<WritingOfExplanations> {
  if ("vu" in action && !isOneWord(action.vu)) return { refus: "nothing was sent: this is not one of the explained words" };
  if (readOne === undefined) return { refus: `nothing was sent: “${project}” has no station — the explanations are kept where its kitchen runs` };
  const login = await accountRead(account);
  if (login === null) return { refus: `nothing was sent: ${WITHOUT_ACCOUNT.replace("explanations unavailable: ", "")}` };
  const rendered = await launch(readOne, "vu" in action ? `explanations seen ${action.vu} --chef ${login}` : `explanations reset --chef ${login}`);
  if (withoutTheCommand(rendered)) return { refus: "nothing was changed: this station's runtime does not keep the explanations yet — update it", detail: detailOf(rendered) };
  const answer = answerOf(rendered);
  if (isObject(answer) && answer.ok === true) {
    const seenOnes = wordsRead(answer.seen);
    if (seenOnes !== null) return { vus: seenOnes };
  }
  if (isObject(answer) && answer.ok === false && typeof answer.message === "string" && answer.message !== "") return { refus: answer.message.split("\n")[0] ?? "", detail: detailOf(rendered) };
  return { refus: "nothing was changed: the runtime's answer could not be read", detail: detailOf(rendered) };
}
