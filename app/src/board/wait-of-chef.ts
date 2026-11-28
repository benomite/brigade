// Ce qui attend le chef, lu de GitHub seul (#2460) : le TODO de l'app et la file que le second relaie à son ouverture
// (second/file.ts) sont cette lecture, et elle seule — la même source, les mêmes entrées, le même bloc `awaiting`
// (rail.ts, `blocAwaiting`). Ni tableau de la cuisine, ni box, ni station : il suffit de joindre GitHub.
//
// La règle du chef (#2455) : une entrée de TODO est un fait de GitHub — un label — et lui pose toujours une question. Seules
// sont lues les issues ouvertes que la cuisine parque pour le chef (`parked:chef`, runtime/src/kitchen/, #4474) : sa carte
// pose le dernier commentaire de la cuisine qui dit pourquoi, et se répond par Answer (board/parked-chef-github.ts). Une issue
// au label `parked` attend quelqu'un d'autre que le chef : elle n'est jamais une entrée (#3075, #4129).
//
// Chaque entrée dit sa question puis son geste, sur sa ligne du bloc, et porte ce que la carte de TODO en fait (`chef`) ; le
// bloc les range de la plus ancienne à la plus récente, et dit « nothing awaits the chef » quand il n'y en a aucune. Une
// lecture qui échoue n'est jamais « rien n'attend » : elle dit pourquoi.
import type { Share } from "../vue/cards-assigned/cards-assigned.ts";
import type { CallGitHub } from "./client.ts";
import type { IssueParkedForTheChef, ReadOfBoardOfRepository, LineOfTheFile, BoardRead } from "./read.ts";
import { LABELS } from "../../../runtime/src/kitchen/decide.ts";
import { blockAwaiting } from "./rail.ts";
import { parkedChefCard, LABEL_PARKED_CHEF, whyParked, KIND_PARKED_CHEF } from "./parked-chef-github.ts";
import { shapeOfChef, type CardOfChef } from "./todo-github.ts";

const { parked: LABEL_PARKED } = LABELS;
// Parqué (`parked`, #4129) : il attend quelqu'un d'autre que le chef — jamais une entrée.
const awaitingOneOther = (labels: readonly string[]) => labels.includes(LABEL_PARKED);
const BY_PAGE = 100;
const PAGES_AT_MOST = 10;
// Une entrée : son ticket, depuis quand elle attend, sa ligne — sa question, puis son geste —, et ce que sa carte de TODO
// en fait. `quoi` : d'où elle vient — une carte.
export type WaitOfChef = {
  ticket: number;
  titre: string;
  url: string;
  depuis: string;
  quoi: "carte";
  ligne: string;
  chef?: CardOfChef;
  // Les logins de ses assignés sur GitHub, quand elle en a : qui elle attend, à la place du chef (vue/cards-assigned/, #2761).
  assignes?: string[];
};
// Ce que la lecture rend : les entrées et l'heure de la lecture — ou pourquoi rien ne se lit. `horsLigne` : GitHub n'a
// pas été joint du tout. `illisibles` : les lignes du bloc qui ne sont pas des entrées — ce qui ne se lit pas.
export type WaitRead = { lue: true; lu: string; attentes: WaitOfChef[]; illisibles: string[] } | { lue: false; raison: string; horsLigne?: true };

type Raw = Record<string, unknown>;
const object = (value: unknown): Raw | null => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Raw) : null);
const list = (value: unknown): Raw[] => (Array.isArray(value) ? value.flatMap((oneOf: unknown) => { const o = object(oneOf); return o === null ? [] : [o]; }) : []);
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const date = (value: unknown): string | null => (typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null);
const labelsOf = (issue: Raw): string[] => list(issue.labels).flatMap(({ name }) => (typeof name === "string" ? [name] : []));

class Refusal extends Error {}
class OutsideLine extends Error {}

// La ligne d'une carte du chef : sa question, puis comment y répondre — un choix de la carte, ou ses propres mots.
function lineOfTheCard({ sorte: kind, texte: said }: CardOfChef): string {
  const { question, choix: choice } = shapeOfChef(said);
  if (kind === KIND_PARKED_CHEF && question !== null && choice.length > 0) return `${question} — on its Todo card: ${choice.map(({ texte: wording }) => `“${wording}”`).join(" or ")} — or answer in your own words`;
  if (kind === KIND_PARKED_CHEF && question !== null) return `${question} — on its Todo card: Answer, in your own words — the ticket goes back on the rail`;
  const reply = choice.length === 0 ? "answer on its Todo card, in your own words" : `answer on its Todo card: ${choice.map(({ texte: wording }) => `“${wording}”`).join(" or ")} — or in your own words`;
  return `${question ?? `A ${kind} card without its question: what does it ask you?`} — ${reply}`;
}

// Ce qui attend le chef dans `depot`, lu de GitHub. `appeler` : le `GET` de l'API — celui de l'app (sous condition, un 304
// ne coûte rien) ou le `gh` du poste, pour le second. `maintenant` : l'heure de la lecture, jusqu'à laquelle les durées
// du bloc se comptent.
// `parqueesPourLeChef` : les issues `parked:chef` que la lecture du rail a tirées de sa liste des issues ouvertes (#4474) —
// sans elles, la liste du label est lue.
export async function readWhatAwaitingTheChef(options: { depot: string; appeler: CallGitHub; maintenant?: () => Date; parqueesPourLeChef?: readonly IssueParkedForTheChef[] }): Promise<WaitRead> {
  const { depot: repository, appeler: call } = options;
  const read = async (path: string): Promise<unknown> => {
    const answer = await call(path).catch((error: unknown) => {
      throw new OutsideLine(error instanceof Error ? error.message : String(error));
    });
    if (answer.status !== 200) throw new Refusal(`GitHub answered HTTP ${answer.status} on ${path.split("?")[0]}`);
    return answer.data;
  };
  // Une liste, page après page, jusqu'à une page qui n'est pas pleine.
  const pages = async (path: string): Promise<Raw[]> => {
    const allEntries: Raw[] = [];
    for (let page = 1; page <= PAGES_AT_MOST; page++) {
      const readEntry = list(await read(`${path}${path.includes("?") ? "&" : "?"}per_page=${BY_PAGE}&page=${page}`));
      allEntries.push(...readEntry);
      if (readEntry.length < BY_PAGE) break;
    }
    return allEntries;
  };
  const comments = (number: number) => pages(`/repos/${repository}/issues/${number}/comments`);
  const created = (issue: Raw) => date(issue.created_at) ?? new Date(0).toISOString();

  try {
    const readOne = (options.maintenant ?? (() => new Date()))().toISOString();
    // Les issues `parked:chef` que la lecture du rail a déjà listées ne se relisent pas (le budget GitHub de l'app, budget-github.ts).
    const alreadyListed = options.parqueesPourLeChef?.map(({ ticket, titre: title, url, creee: created, labels, assignes }): Raw => ({ number: ticket, title: title, html_url: url, created_at: created, labels: labels.map((name) => ({ name })), assignees: (assignes ?? []).map((login) => ({ login })) }));
    const listed = alreadyListed ?? (await pages(`/repos/${repository}/issues?state=open&labels=${LABEL_PARKED_CHEF}&sort=created&direction=asc`)).filter((issue) => issue.pull_request === undefined && typeof issue.number === "number" && labelsOf(issue).includes(LABEL_PARKED_CHEF));
    // Une issue qui attend quelqu'un d'autre n'attend pas le chef.
    const parked = await Promise.all(listed.filter((issue) => !awaitingOneOther(labelsOf(issue))).map((issue) => comments(issue.number as number).then((readOnes) => ({ issue, lus: readOnes }))));
    const waits: WaitOfChef[] = parked.map(({ issue, lus: readOnes }) => {
      const assignes = list(issue.assignees).flatMap(({ login }) => (typeof login === "string" ? [login] : []));
      const chef = parkedChefCard(readOnes);
      return {
        ticket: issue.number as number,
        titre: text(issue.title),
        url: text(issue.html_url) || `https://github.com/${repository}/issues/${issue.number}`,
        ...(assignes.length === 0 ? {} : { assignes }),
        depuis: whyParked(readOnes)?.le ?? created(issue),
        quoi: "carte",
        ligne: lineOfTheCard(chef),
        chef,
      };
    });
    // La plus ancienne d'abord, comme le bloc de la box.
    const instant = (iso: string) => Date.parse(iso);
    waits.sort((a, b) => instant(a.depuis) - instant(b.depuis) || a.ticket - b.ticket);
    return { lue: true, lu: readOne, attentes: waits, illisibles: [] };
  } catch (error) {
    const said = (error instanceof Error ? error.message : String(error)).split("\n")[0]?.replace(/[.\s]+$/, "") ?? "";
    const reason = `What awaits the chef in ${repository} was not read from GitHub: ${said}.`;
    return error instanceof OutsideLine ? { lue: false, raison: reason, horsLigne: true } : { lue: false, raison: reason };
  }
}

// Les entrées comme lignes de la file, dans la forme que le bloc `awaiting` écrit (rail.ts, `blocAwaiting`).
export const fileOfChef = (waits: readonly WaitOfChef[]): LineOfTheFile[] =>
  waits.map(({ ticket, titre: title, depuis: since, quoi: what, ligne: line }) => ({ nom: `#${ticket}`, ticket, titre: title === "" ? null : title, quoi: what, depuis: since, ligne: line }));

// Le bloc `awaiting` de ce qui attend le chef, de sa tête à `end awaiting` : ce que le second relaie, et ce que le TODO
// de l'app lit.
export const blockOfChef = ({ lu: readOne, attentes: waits, illisibles: unreadable }: { lu: string; attentes: readonly WaitOfChef[]; illisibles: readonly string[] }): string[] =>
  blockAwaiting({ file: fileOfChef(waits), bilans: [...unreadable], lu: readOne });

// La lecture du rail, dont ce qui attend le chef est cette lecture, et rien d'autre : la file du bloc `awaiting` de
// `status` et `faits.attend`, que TODO dessine, dans le même ordre. `autres` : les entrées qui attendent un autre humain
// que le compte connecté, que TODO replie sous « Awaiting others » (`faits.attendAutres`, ticket 2985) — hors de la file.
export function withTheWaitOfChef(readOne: BoardRead, { attentes: waits, illisibles: unreadable, autres: others = [] }: { attentes: readonly WaitOfChef[]; illisibles: readonly string[]; autres?: Share<WaitOfChef>["autres"] }): BoardRead {
  const said = ({ ticket, titre: title, url, chef }: WaitOfChef) => ({
    ticket,
    titre: title,
    url,
    ...(chef === undefined ? {} : { chef }),
  });
  const awaiting = waits.map(said);
  return {
    ...readOne,
    file: fileOfChef(waits),
    bilans: [...unreadable],
    faits: { ...readOne.faits, attend: awaiting, ...(others.length === 0 ? {} : { attendAutres: others.map(({ attente: wait, qui: who }) => ({ ...said(wait), qui: who })) }), compteurs: { ...(object(readOne.faits.compteurs) ?? {}), attend: awaiting.length } },
  };
}

// La lecture du rail, avec ce qui attend le chef lu de GitHub comme le second le lit (main.ts) : l'app ne dit jamais autre
// chose que lui. Pas lu : une lecture ratée, jamais un TODO vide. `partager` : les cartes qui attendent le compte connecté,
// et celles qui attendent un autre humain (vue/cards-assigned/, #2761, #2985).
export async function withWhatAwaitingTheChef(readOne: ReadOfBoardOfRepository, call: CallGitHub, share?: (waits: WaitOfChef[]) => Promise<Share<WaitOfChef>>): Promise<ReadOfBoardOfRepository> {
  if (!readOne.lu) return readOne;
  const wait = await readWhatAwaitingTheChef({ depot: readOne.depot, appeler: call, maintenant: () => new Date(readOne.luLe), ...(readOne.parqueesPourLeChef === undefined ? {} : { parqueesPourLeChef: readOne.parqueesPourLeChef }) });
  if (!wait.lue) return { lu: false, depot: readOne.depot, luLe: readOne.luLe, raison: wait.raison, ...(wait.horsLigne === undefined ? {} : { horsLigne: true as const }) };
  if (share === undefined) return withTheWaitOfChef(readOne, wait);
  const { siennes: itsOwn, autres: others } = await share(wait.attentes);
  return withTheWaitOfChef(readOne, { ...wait, attentes: itsOwn, autres: others });
}
