// Le récapitulatif d'un projet, côté process principal (ticket 3581, épique 3579) : ce que la cuisine a fait depuis que le
// chef a regardé, lu par la commande `recap` du runtime là où la cuisine du projet tourne (runtime/src/recap/), et le
// marqueur « vu jusqu'à » avancé par elle une fois le récapitulatif montré :
//   - `recap <owner>/<repo>` : le récapitulatif, une ligne de JSON ;
//   - `recap <owner>/<repo> seen <until>` : `{"ok":true,"seenUntil":<instant>}`, ou `{"ok":false,"message":<la ligne du refus>}`
//     avec le code de sortie 1.
// Une réponse qui ne se lit pas ne se devine pas : elle se dit, le détail au survol — jamais lue comme « rien ne s'est passé ».
import type { Read, Rendered } from "../../box.ts";
import { detailOf, withoutTheCommand } from "../../settings-of-project.ts";
import type { Arret } from "../../../../runtime/src/recap/arrets.ts";
import type { Recap } from "../../../../runtime/src/recap/recap.ts";
import type { Renvoye } from "../../../../runtime/src/recap/renvois.ts";
import type { Servi } from "../../../../runtime/src/recap/servis.ts";

export type { Recap };
// Ce que la lecture rend : le récapitulatif, ou pourquoi il ne se lit pas.
export type ReadOfRecap = { recap: Recap } | { sans: string; detail?: string };
// Ce que le marquage rend : le marqueur après lui, ou la ligne du refus.
export type BrandOfRecap = { seenUntil: string } | { refus: string; detail?: string };

const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const UNAVAILABLE = "recap unavailable";

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string";
const isInstant = (value: unknown): value is string => isText(value) && !Number.isNaN(Date.parse(value));
const isAddress = (value: unknown): value is string => isText(value) && value.startsWith("https://github.com/");
const isTicket = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;

// La dernière ligne de la sortie, lue en JSON ; `null` si elle ne se lit pas.
function answerOf(rendered: Rendered): unknown {
  try {
    return JSON.parse(rendered.sortie.trim().split("\n").at(-1) ?? "");
  } catch {
    return null;
  }
}

const isServed = (v: unknown): v is Servi => isObject(v) && isTicket(v.ticket) && isText(v.title) && isAddress(v.url) && isTicket(v.pr) && isAddress(v.prUrl) && isInstant(v.servedAt);
const returnedOne = (v: unknown): v is Renvoye => isObject(v) && isTicket(v.ticket) && isAddress(v.url) && (v.kind === "sent-back" || v.kind === "refused") && isText(v.reason) && isInstant(v.at);
const stop = (v: unknown): v is Arret => isObject(v) && isInstant(v.at) && (v.ticket === null || isTicket(v.ticket)) && ["stop", "breaker", "duration", "tokens"].includes(String(v.guardrail)) && isText(v.line);

// Le récapitulatif tel que le runtime l'écrit, ou null s'il n'en a pas la forme.
function recapRead(raw: unknown): Recap | null {
  if (!isObject(raw) || !isText(raw.repository) || !isInstant(raw.since) || !isInstant(raw.until)) return null;
  const { served, sentBack, stops } = raw;
  if (!Array.isArray(served) || !served.every(isServed) || !Array.isArray(sentBack) || !sentBack.every(returnedOne) || !Array.isArray(stops) || !stops.every(stop)) return null;
  return { repository: raw.repository, since: raw.since, until: raw.until, served, sentBack, stops };
}

// Le récapitulatif du projet, là où sa cuisine tourne ; sinon, pourquoi il ne se lit pas.
export async function readTheRecap(project: string, readOne: Read | undefined, repository: string, launch: (readOne: Read, command: string) => Promise<Rendered>): Promise<ReadOfRecap> {
  if (readOne === undefined) return { sans: `${UNAVAILABLE}: ${project} has no station — it is read where its kitchen runs` };
  if (!REPOSITORY.test(repository)) return { sans: `${UNAVAILABLE}: the GitHub repository of ${project} is not known` };
  const rendered = await launch(readOne, `recap ${repository}`);
  if (withoutTheCommand(rendered)) return { sans: `${UNAVAILABLE}: this station's runtime does not give it yet — update it`, detail: detailOf(rendered) };
  const recap = rendered.erreur === null ? recapRead(answerOf(rendered)) : null;
  return recap === null ? { sans: UNAVAILABLE, detail: detailOf(rendered) } : { recap };
}

// Le récapitulatif a été montré jusqu'à `until` : le marqueur du projet y avance, là où sa cuisine tourne.
export async function markTheRecap(project: string, readOne: Read | undefined, repository: string, until: unknown, launch: (readOne: Read, command: string) => Promise<Rendered>): Promise<BrandOfRecap> {
  if (!isInstant(until) || !/^[0-9TZ:.+-]+$/.test(until)) return { refus: "nothing was marked: this is not an instant" };
  if (readOne === undefined) return { refus: `nothing was marked: ${project} has no station` };
  if (!REPOSITORY.test(repository)) return { refus: `nothing was marked: the GitHub repository of ${project} is not known` };
  const rendered = await launch(readOne, `recap ${repository} seen ${until}`);
  if (withoutTheCommand(rendered)) return { refus: "nothing was marked: this station's runtime does not keep the recap yet — update it", detail: detailOf(rendered) };
  const answer = answerOf(rendered);
  if (isObject(answer) && answer.ok === true && isInstant(answer.seenUntil)) return { seenUntil: answer.seenUntil };
  if (isObject(answer) && answer.ok === false && isText(answer.message) && answer.message !== "") return { refus: answer.message.split("\n")[0] ?? "", detail: detailOf(rendered) };
  return { refus: "nothing was marked: the runtime's answer could not be read", detail: detailOf(rendered) };
}
