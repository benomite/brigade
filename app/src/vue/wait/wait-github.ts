// Parquer un ticket depuis l'app (ticket 4129 ; d'abord WAITING, ticket 3075) : ce qu'un ticket attend se lit et s'écrit sur
// son issue, exactement comme la station et le second l'y posent — le label `parked` tant qu'il attend, et le commentaire
// marqué `<!-- brigade:parked … -->` qui dit qui il attend, pour quoi, jusqu'à quand (runtime/src/attente-github/marque.ts,
// `corpsDuParking`). Ce module en a les deux bouts :
//   - la lecture : le dernier commentaire de parking d'une issue au label `parked`, rendu dans la forme de `tiers`
//     (facts.ts, `Tiers`) — ce que sa carte dit (board/wait-of-chef.ts) ; les commentaires `**WAITING: awaiting …**`
//     d'avant ticket 4129 se lisent encore ;
//   - les gestes, tous écrits sur l'issue, sur tout projet et sans box (ticket 4262) : « waiting for… » parque le ticket
//     (`parquer` : le commentaire puis le label), « resume » et « it arrived, back to the kitchen » le déparquent
//     (actions-github.ts, `deparquer` : le label retiré) — le ticket reprend exactement où il était. Le second joue ces
//     deux mêmes fonctions (second/parking.ts) : un ticket parqué ou déparqué par lui est dans l'état exact où l'app le met.
// Rien de Node : le téléphone le charge tel quel.
import { attenteDeLIssue, corpsDuParking, direJusqua, DE_CONFIANCE } from "../../../../runtime/src/attente-github/marque.ts";
import type { Third } from "../../facts.ts";
import { LABELS_OF_ACTIONS, removeTheLabel, ticketsRead, type Written } from "../../actions-github.ts";
import type { ClientOfThePriority } from "../../priority.ts";
import { refusalOf } from "../../board/client.ts";
import type { BoardRead } from "../../board/read.ts";
import { inputRead, type Input } from "./input.ts";

// Le label d'un ticket parqué (`parked`).
export const LABEL_PARKED = LABELS_OF_ACTIONS.cuisine;
// Ce que son déparquage fait de lui.
export const AT_THE_ARRIVAL = "it resumes exactly where it was";

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Le commentaire qui parque le ticket : celui de la station, mot pour mot (`corpsDuParking`). `relance` : minuit, au jour
// du poste, du jour que le chef a choisi.
export const brandOfWait = ({ quoi: what, qui: who }: { quoi: string; qui: string }, relaunch: Date): string => corpsDuParking({ what: what, who: who, followUp: relaunch.toISOString() });

const HEAD = /^\*\*WAITING(?: — updated)?: awaiting (.+?)\.\*\* ?(.*)$/;
const INSTANT = /^(\d{1,2}) ([A-Z][a-z]{2})(?: (\d{4}))? (\d{2}):(\d{2}) UTC$/;
const DAY_MS = 86_400_000;

// Un instant tel que l'app l'écrivait avant ticket 4129, ou `direInstantEn` sans son année (« 16 Nov 23:00 UTC ») : celle qui le met
// au plus près de `repere` — avant lui, à un jour près, pour `depuis` (le commentaire est posté après la mise en
// attente) ; à partir de lui pour la relance, qui vient après. Null pour un texte qui n'a pas cette forme.
function instantSays(said: string, marker: number, meaning: "avant" | "apres"): string | null {
  const [, day, month, year, hour, minute] = INSTANT.exec(said.trim()) ?? [];
  const rank = MONTH.indexOf(month ?? "");
  if (day === undefined || rank < 0) return null;
  const en = (an: number) => Date.UTC(an, rank, Number(day), Number(hour), Number(minute));
  const an = new Date(marker).getUTCFullYear();
  const instant = year !== undefined ? en(Number(year)) : meaning === "avant" ? (en(an) > marker + DAY_MS ? en(an - 1) : en(an)) : en(an) < marker ? en(an + 1) : en(an);
  return Number.isNaN(instant) ? null : new Date(instant).toISOString();
}

// Ce qu'un commentaire d'entrée en WAITING dit, dans la forme de `tiers` — ou null pour un autre commentaire, ou une
// marque dont un morceau ne se lit pas : rien n'est inventé à sa place. `posteLe` : l'instant où il a été posté.
export function thirdOfTheBrand(body: string, workstationThe: string): Third | null {
  const lines = body.split("\n").map((line) => line.trimEnd());
  const [, who, what] = HEAD.exec(lines[0] ?? "") ?? [];
  if (who === undefined || what === undefined || what.trim() === "") return null;
  const said = (wording: string) => lines.find((line) => line.startsWith(`- **${wording}**: `))?.slice(`- **${wording}**: `.length).trim();
  const [sinceSays, relaunchSaid, atTheArrival] = [said("since"), said("follow-up"), said("on arrival")];
  const workstation = Date.parse(workstationThe);
  if (sinceSays === undefined || relaunchSaid === undefined || atTheArrival === undefined || Number.isNaN(workstation)) return null;
  const since = instantSays(sinceSays, workstation, "avant");
  const relaunch = since === null ? null : instantSays(relaunchSaid, Date.parse(since), "apres");
  if (since === null || relaunch === null) return null;
  return { quoi: what.trim(), qui: said("from whom") ?? who, depuis: since, relance: relaunch, aLArrivee: atTheArrival };
}

// Ce que dit un commentaire de parking marqué (`<!-- brigade:parked … -->`) d'un auteur du dépôt, dans la forme de
// `tiers` — depuis : l'instant où il a été posté ; à l'arrivée : il reprend où il était. Null pour un autre commentaire.
function thirdOfParking(body: string, association: unknown, workstationThe: string): Third | null {
  const wait = typeof association === "string" && DE_CONFIANCE.includes(association) ? attenteDeLIssue([{ body: body, association }]) : null;
  if (wait === null || Number.isNaN(Date.parse(workstationThe))) return null;
  return { quoi: wait.what, qui: wait.who, depuis: new Date(workstationThe).toISOString(), relance: wait.fact === undefined ? wait.followUp : null, aLArrivee: `${direJusqua(wait)}, then ${AT_THE_ARRIVAL}` };
}

// Ce que l'issue dit de son attente : son dernier commentaire de parking — null sans aucun qui se lise.
export function thirdOfComments(comments: readonly { body?: unknown; created_at?: unknown; author_association?: unknown }[]): Third | null {
  for (const { body, created_at: the, author_association: association } of [...comments].reverse()) {
    const third = typeof body === "string" && typeof the === "string" ? (thirdOfParking(body, association, the) ?? thirdOfTheBrand(body, the)) : null;
    if (third !== null) return third;
  }
  return null;
}

const number = (ticket: unknown): ticket is number => typeof ticket === "number" && Number.isSafeInteger(ticket) && ticket >= 1;
const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));
const object = (value: unknown): Record<string, unknown> => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

// « waiting for… » écrit sur l'issue : le commentaire de parking, puis le label `parked`. Rien ne part sans un
// formulaire complet, ni pour un ticket que la dernière lecture ne porte pas ; un commentaire posté dont le label est
// refusé se dit tel : le ticket n'est pas parqué.
async function setOnGithub(readOne: BoardRead | undefined, ticket: unknown, input: unknown, today: Date, client: ClientOfThePriority): Promise<Written> {
  if (!number(ticket)) return { refus: "nothing was written: the action names no ticket", detail: "" };
  const readEntry = inputRead(input, today);
  if ("refus" in readEntry) return { refus: readEntry.refus, detail: "" };
  if (readOne === undefined) return { refus: "nothing was written: the rail of this project has not been read yet — read it again", detail: "" };
  if (!ticketsRead(readOne).has(ticket)) return { refus: `nothing was written: #${ticket} is not on the latest rail read — read it again`, detail: "" };
  return park(readOne.depot, ticket, readEntry, today, client);
}

// Parquer un ticket (tickets 4262, 4129) : son commentaire de parking, puis le label `parked`, écrits sur l'issue de
// `ticket`, sur tout dépôt, sans box. C'est le seul chemin de l'app qui le parque : « waiting for… », « Wait for … » d'une
// carte du manager (board-actions/answer-github.ts, ticket 3434) et le second (second/parking.ts) le jouent. Un
// commentaire posté dont le label est refusé se dit tel : le ticket n'est pas parqué.
export async function park(repository: string, ticket: number, readEntry: Input, today: Date, client: ClientOfThePriority): Promise<Written> {
  const [an, month, day] = readEntry.relance.split("-").map(Number);
  const body = brandOfWait(readEntry, new Date(an ?? 0, (month ?? 1) - 1, day ?? 1));
  const issue = `/repos/${repository}/issues/${ticket}`;
  let address = `https://github.com/${repository}/issues/${ticket}`;
  try {
    const workstation = await client.ecrire("POST", `${issue}/comments`, { body: body });
    if (workstation.status !== 201) throw refusalOf("the comment", workstation);
    const url = object(workstation.data).html_url;
    if (typeof url === "string") address = url;
  } catch (error) {
    return { refus: `nothing was changed: GitHub did not take the WAITING comment on #${ticket}`, detail: reason(error) };
  }
  try {
    const pose = await client.ecrire("POST", `${issue}/labels`, { labels: [LABEL_PARKED] });
    if (pose.status !== 200) throw refusalOf(`\`${LABEL_PARKED}\``, pose);
  } catch (error) {
    return { refus: `#${ticket} is not parked: its comment is posted, but GitHub did not set \`${LABEL_PARKED}\` — try again`, detail: reason(error) };
  }
  return { fait: `in WAITING on GitHub: #${ticket} awaits ${readEntry.qui}, follow-up on ${readEntry.relance}`, detail: address };
}

// Un geste de WAITING écrit sur GitHub, sans runtime : « waiting for… », « resume » ou « it arrived, back to the kitchen ».
export async function waitOnGithub(options: { id: unknown; ticket: unknown; saisie: unknown; aujourdhui: Date; lu: BoardRead | undefined; client: ClientOfThePriority }): Promise<Written> {
  const { id, ticket, lu: readOne, client } = options;
  if (id === "attente-poser") return setOnGithub(readOne, ticket, options.saisie, options.aujourdhui, client);
  if (id === "attente-arrivee") return removeTheLabel(readOne, "cuisine", ticket, client);
  if (id !== "attente-reprendre") return { refus: "nothing was sent: this is not a WAITING gesture", detail: `“${String(id)}” is not one` };
  const rendered = await removeTheLabel(readOne, "cuisine", ticket, client);
  return "fait" in rendered ? { fait: `resumed on GitHub: #${String(ticket)} no longer carries \`${LABEL_PARKED}\` — it resumes exactly where it was`, detail: rendered.detail } : rendered;
}

// Un geste de parking, d'où qu'il parte, sur tout projet : écrit sur l'issue, jamais par une commande de la box (ticket 4129).
export async function playTheWait(options: { id: unknown; ticket: unknown; saisie: unknown; aujourdhui: Date; lu: () => BoardRead | undefined; client: ClientOfThePriority }): Promise<Written> {
  return waitOnGithub({ ...options, lu: options.lu() });
}
