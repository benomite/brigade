// Ce qui est avant le rail (#1836) : un rail vide ne veut pas dire un projet fini. L'app le lit sur GitHub
// (`avantLeRail`, board/read.ts, #2061), que board/rail.ts rend dans la forme de la sortie de `manager upstream` :
// les issues ouvertes du dépôt que le rail ne porte pas encore, chacune dans l'un des cinq états que ses labels disent,
// avec ce qui la retient en une ligne. Ce module n'y déduit rien : il compte ce que la lecture liste, range chaque
// issue sous le mot qu'elle porte, et pose ce qu'elle en dit, mot pour mot. Une lecture ratée n'est jamais « rien avant
// le rail ».
// La vue en tire, quand le rail est vide, ce qu'il y a avant lui, et si le manager le lit — son état vient de `manager`
// (manager.ts) ; les issues mises de côté et celles que la cuisine a ouvertes sur elle-même. Le bandeau Backlog qui en
// posait une étiquette par besoin au-dessus des colonnes n'est plus (#4354) : la colonne Backlog montre le backlog.
import type { Reading } from "./box.ts";
import { isOutsideLine, titleOfFailure, type Card } from "./facts.ts";
import { header, type Header } from "./card.ts";
import { see as seeManager, type Seen as SeenManager } from "./manager.ts";
import type { Progress } from "./vue/backlog/progress-github.ts";

export const COMMAND = "manager upstream";

// Une issue telle que le tableau la donne. `priorite` : celle de son label `prio:`, nulle sans. Ce que le bandeau Backlog
// lit d'un besoin (#3460), quand la lecture de GitHub le donne — la box ne le donne pas : `tickets`, ceux de son
// découpage ; `servis`, ceux d'entre eux qui sont fermés ; `contexte`, le premier paragraphe de son issue ; `servieLe`,
// la fermeture d'une épique toute servie (board/read.ts) ; `avancement`, ses tickets servis sur leur total, tels que la
// liste de cases à cocher de son corps les dit (vue/backlog/progress-github.ts, #3480) ; `horizon`, celui de son label
// `horizon:N` (1 à 3, le plus petit s'il en porte plusieurs) ; `idee`, s'il porte le label `idea` (#3590).
export type Need = { tickets?: number[]; servis?: number[]; contexte?: string; servieLe?: string; avancement?: Progress; horizon?: number; idee?: true };
export type Data = { ticket: number; titre: string; url: string; priorite: number | null; etat: string; dit: string } & Need;
// La sortie de `manager upstream` : l'heure de la box à la lecture des issues, le dépôt lu, les issues.
export type Upstream = { lu: string; depot: string; issues: Data[] };

// Les cinq états de la liste fermée (`ETATS_AVANT_LE_RAIL`), dans l'ordre où le bandeau Backlog
// les range, et ce que chacun veut dire en mots simples ; puis les deux que la lecture de GitHub ajoute d'un besoin
// découpé (#3460) : ses tickets en cours, ou tous servis. Un mot que la box ajouterait se pose après eux, tel quel.
export const GROUPS = [
  { etat: "non-lue", nom: "not read yet" },
  { etat: "incomplete", nom: "refused as incomplete" },
  { etat: "epique", nom: "epic, not split yet" },
  { etat: "prete", nom: "ready, not fired" },
  { etat: "mise-de-cote", nom: "set aside" },
  { etat: "decoupee", nom: "split into tickets" },
  { etat: "servie", nom: "served" },
  // Une idée en réserve (label `idea`) : le manager ne la lit pas ; le Backlog la range à part (#3589).
  { etat: "idee", nom: "ideas in reserve" },
] as const;

// Une issue avant le rail : son numéro, son titre, sa priorité, ce qui la retient, et ce que le bandeau Backlog lit
// d'elle (`Besoin`). `ouvrable` : son issue s'ouvre d'un clic — l'adresse reste au process principal. `fiche` :
// l'en-tête de sa fiche (card.ts). `carte` : sa carte, celle du rail, que la fiche d'un ticket hors du rail reprend.
export type Issue = { ticket: number; titre: string; priorite: number | null; dit: string; ouvrable: boolean; fiche: Header; carte: Card } & Need;
export type Group = { etat: string; nom: string; issues: Issue[] };
// Ce que la vue pose, sans rien calculer : le nombre, les groupes et ce que le titre du bandeau Backlog dit au survol (`survol`) — ou,
// `sans`, pourquoi rien n'est compté. `vide` : ce qui se lit à la place du rail quand aucun ticket n'y est.
// `nonPublie` : la lecture de GitHub, fraîche, ne porte pas ce qui est avant le rail — rien n'est dit ni compté,
// pas même « pas lu ».
// `alertes` : les issues que la cuisine a ouvertes sur elle-même (`alerteDeLaCuisine`) — jamais des besoins, jamais comptées.
export type AlertOfTheKitchen = { ticket: number; titre: string; genre: "inerte"; dit: string };
export type Seen = { projet: string; demande: number; a: string; vide: string } & ({ compte: number; lu: string; groupes: Group[]; survol: string; alertes?: AlertOfTheKitchen[] } | { sans: string } | { nonPublie: true });

class Informs extends Error {}
const refuse = (field: string, expected: string): never => {
  throw new Informs(`“${field}” is not ${expected}`);
};
const object = (value: unknown, field: string): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : refuse(field, "an object");
const text = (value: unknown, field: string): string => (typeof value === "string" ? value : refuse(field, "a string"));
const whole = (value: unknown, field: string): number => (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : refuse(field, "a non-negative integer"));
const integers = (value: unknown, field: string): number[] => (Array.isArray(value) ? value.map((oneOf: unknown, rank) => whole(oneOf, `${field}[${rank}]`)) : refuse(field, "a list"));
// Des tickets servis sur leur total : jamais plus de servis que de tickets, jamais une liste vide.
function progress(value: unknown, field: string): Progress {
  const readOne = object(value, field);
  const servedOnes = whole(readOne.servis, `${field}.servis`);
  const total = whole(readOne.total, `${field}.total`);
  return total > 0 && servedOnes <= total ? { servis: servedOnes, total } : refuse(field, "served tickets out of a non-empty total");
}
// Un horizon de la vision : 1, 2 ou 3.
const horizonRead = (value: unknown, field: string): number => (value === 1 || value === 2 || value === 3 ? value : refuse(field, "1, 2 or 3"));
// Ce qu'une issue dit d'un besoin, champ par champ : absent, il n'est pas complété ; présent, il a sa forme ou refuse tout.
function needOf(issue: Record<string, unknown>, field: string): Need {
  return {
    ...(issue.tickets === undefined ? {} : { tickets: integers(issue.tickets, `${field}.tickets`) }),
    ...(issue.servis === undefined ? {} : { servis: integers(issue.servis, `${field}.servis`) }),
    ...(issue.contexte === undefined ? {} : { contexte: text(issue.contexte, `${field}.contexte`) }),
    ...(issue.servieLe === undefined ? {} : { servieLe: text(issue.servieLe, `${field}.servieLe`) }),
    ...(issue.avancement === undefined ? {} : { avancement: progress(issue.avancement, `${field}.avancement`) }),
    ...(issue.horizon === undefined ? {} : { horizon: horizonRead(issue.horizon, `${field}.horizon`) }),
    ...(issue.idee === undefined ? {} : { idee: issue.idee === true ? (true as const) : refuse(`${field}.idee`, "true") }),
  };
}

// La sortie de `manager upstream`, champ pour champ — ou en quoi elle n'en est pas la forme. Rien
// n'y est complété : un champ qui manque refuse la forme entière ; un champ de plus est laissé de côté.
export function understand(output: string): Upstream | { informe: string } {
  if (output.trim() === "") return { informe: "the command returned nothing" };
  let readOne: unknown;
  try {
    readOne = JSON.parse(output);
  } catch {
    return { informe: "it is not JSON" };
  }
  try {
    const root = object(readOne, "the output");
    const issues = Array.isArray(root.issues) ? root.issues : refuse("issues", "a list");
    return {
      lu: text(root.lu, "lu"),
      depot: text(root.depot, "depot"),
      issues: issues.map((raw: unknown, rank) => {
        const field = `issues[${rank}]`;
        const issue = object(raw, field);
        return {
          ticket: whole(issue.ticket, `${field}.ticket`),
          titre: text(issue.titre, `${field}.titre`),
          url: text(issue.url, `${field}.url`),
          priorite: issue.priorite === null ? null : whole(issue.priorite, `${field}.priorite`),
          etat: text(issue.etat, `${field}.etat`),
          dit: text(issue.dit, `${field}.dit`),
          ...needOf(issue, field),
        };
      }),
    };
  } catch (error) {
    if (error instanceof Informs) return { informe: error.message };
    throw error;
  }
}

// Une issue que la cuisine ouvre sur elle-même : la cuisine oisive (que le runtime n'ouvre plus depuis #3945 ; celles déjà ouvertes restent lues). Le disjoncteur n'ouvre plus d'issue (#3911). Ce n'est pas un besoin : son contenu devient la ligne d'état du rail.
export function alertOfTheKitchen({ ticket, titre: title }: Pick<Data, "ticket" | "titre">): AlertOfTheKitchen | undefined {
  if (/^The kitchen is idle\b/.test(title)) return { ticket, titre: title, genre: "inerte", dit: title.replace(/^The kitchen is idle/, "Kitchen idle") };
  return undefined;
}

const openable = (url: string) => URL.parse(url)?.protocol === "https:";

// Les issues rangées sous leur mot, dans l'ordre des groupes, chacune dans l'ordre de la box.
export function group(issues: readonly Data[]): Group[] {
  const words = [...GROUPS.map(({ etat: state }) => state as string), ...new Set(issues.map(({ etat: state }) => state))];
  return [...new Set(words)].flatMap((state) => {
    const itsOwn = issues.filter((issue) => issue.etat === state);
    if (itsOwn.length === 0) return [];
    const name = GROUPS.find((groupEntry) => groupEntry.etat === state)?.nom ?? state;
    return [
      {
        etat: state,
        nom: name,
        issues: itsOwn.map(({ ticket, titre: title, url, priorite: priority, dit: said, etat: _state, ...need }) => {
          const card = header({ titre: title, url, prio: priority });
          return {
            ticket,
            titre: title,
            priorite: priority,
            dit: said,
            ...need,
            ouvrable: openable(url),
            fiche: card,
            carte: { ticket, titre: title, ouvrable: openable(url), attendu: false, attend: [], dit: [], fiche: card, ligne: said, ...(priority === null ? {} : { prio: `prio:${priority}` }) },
          };
        }),
      },
    ];
  });
}

const NOT_READ = "what is before the rail was not read";
const NOT_NOTHING = "This is not “nothing before the rail”";

// La sortie de la commande, dans une lecture qui en a une.
const outputOf = (reading: Reading) => ("erreur" in reading ? undefined : understand(reading.sorties.find(({ commande: command }) => command === COMMAND)?.texte ?? ""));

// Pourquoi la lecture ne compte rien : une sortie qui n'a pas la forme, ou l'échec de la veille.
// Les codes sont ceux d'une commande du runtime : 1, GitHub ou le journal n'a pas été lu ; 2, elle
// a été refusée — par un runtime d'avant elle, qui ne connaît pas `upstream`. Tout autre vient du
// geste. Le code, c'est l'app qui l'a écrit, au bout de ce que la commande a rendu (box.ts).
function withoutRead(reading: Reading, informs: string | undefined): string {
  if (!("erreur" in reading)) return `${NOT_READ} in what GitHub gave: ${informs ?? "it has no output"}. ${NOT_NOTHING}`;
  const code = Number(/→ exit code (\d+)$/.exec(reading.erreur)?.[1]);
  // Lue de GitHub (#1694) : sa raison, en une phrase — aucune station n'a été jointe.
  const why = reading.duTableau === true
    ? reading.erreur.replace(/[.\s]+$/, "")
    : reading.atteinte && reading.cas === null && code === 2
      ? "the station's runtime refused `manager upstream` (code 2) — if it is older than this app, it does not know this reading yet: update brigade on the station"
      : reading.atteinte && reading.cas === null && code === 1
        ? "the station answered, but `manager upstream` read neither GitHub nor its log (code 1)"
        : titleOfFailure(reading, "REACHED, BUT `manager upstream` DID NOT ANSWER");
  return `${NOT_READ}: ${why}. ${NOT_NOTHING}`;
}

const pluriel = (count: number, word: string) => `${count} ${word}${count > 1 ? "s" : ""}`;
const detailOf = (groups: Group[]) => groups.map(({ nom: name, issues }) => `${issues.length} ${name}`).join(" · ");

// Ce que le titre du bandeau Backlog dit au survol : le total, puis le compte de chaque état.
function hoverOf(issues: number, groups: Group[]): string {
  if (issues === 0) return "nothing before the rail: every open issue of the repository is on it";
  return `${pluriel(issues, "issue")} before the rail — ${detailOf(groups)}`;
}

// Ce que le manager fait de ce qui est en amont, d'après son état lu — jamais deviné.
function tellManager(manager: SeenManager | undefined): string {
  if (manager === undefined || "sans" in manager) return "the manager's state was not read: whether it is reading them is not known";
  return manager.interrupteur.allume
    ? "the manager is on: it reads them at each wake-up, judges what it has not read and splits the epics"
    : "the manager is off: it reads none of them, and nothing new enters the rail until you turn it on";
}

// Ce qui se lit à la place du rail quand aucun ticket n'y est : rien avant lui, ce qui est avant lui et ce que le
// manager en fait — ou pourquoi ce qui est avant lui n'a pas été lu.
function tellEmpty(account: { issues: number; groupes: Group[] } | { sans: string }, manager: SeenManager | undefined): string {
  if ("sans" in account) return `nothing on the rail — ${account.sans}`;
  if (account.issues === 0) return "nothing on the rail, nothing before it";
  return `nothing on the rail — ${pluriel(account.issues, "issue")} before it (${detailOf(account.groupes)}) — ${tellManager(manager)}`;
}

// Ce qu'une lecture de ce qui est avant le rail donne à poser, avec le dernier état du manager lu.
export function see(reading: Reading, manager?: SeenManager): Seen {
  const { projet: project, demande: request, a } = reading;
  // Le tableau est frais et lisible, mais ne publie pas ce qui est avant le rail : la vue n'en dit rien (#1770). Hors ligne
  // non plus : le rail gardé n'a pas à dire que ce qui est avant lui n'a pas été lu (#1818).
  if (("pasPublie" in reading && reading.pasPublie === true) || isOutsideLine(reading)) return { projet: project, demande: request, a, nonPublie: true, vide: "nothing on the rail" };
  const upstream = outputOf(reading);
  if (upstream === undefined || "informe" in upstream) {
    const without = withoutRead(reading, upstream?.informe);
    return { projet: project, demande: request, a, sans: without, vide: tellEmpty({ sans: without }, manager) };
  }
  const alerts = upstream.issues.flatMap((issue) => alertOfTheKitchen(issue) ?? []);
  const needs = upstream.issues.filter((issue) => alertOfTheKitchen(issue) === undefined);
  const groups = group(needs);
  return { projet: project, demande: request, a, compte: needs.length, lu: upstream.lu, groupes: groups, survol: hoverOf(needs.length, groups), vide: tellEmpty({ issues: needs.length, groupes: groups }, manager), ...(alerts.length === 0 ? {} : { alertes: alerts }) };
}

// Ce qui est en amont de chaque projet, tenu par le process principal : la dernière lecture, le
// dernier état du manager — de quoi redire la phrase du rail vide quand l'un ou l'autre change —,
// et l'adresse de chaque issue, que la vue ne voit jamais.
export function holdUpstream() {
  const readings = new Map<string, Reading>();
  const managers = new Map<string, SeenManager>();
  const upstreams = new Map<string, Upstream>();
  return {
    recevoir(reading: Reading): Seen {
      readings.set(reading.projet, reading);
      const readOne = outputOf(reading);
      if (readOne === undefined || "informe" in readOne) upstreams.delete(reading.projet);
      else upstreams.set(reading.projet, readOne);
      return see(reading, managers.get(reading.projet));
    },
    // Une lecture de `manager` : son état change la phrase du rail vide d'un projet dont l'amont est lu.
    manager(reading: Reading): Seen | undefined {
      managers.set(reading.projet, seeManager(reading));
      const last = readings.get(reading.projet);
      return last === undefined ? undefined : see(last, managers.get(reading.projet));
    },
    // Les projets dont l'amont se lit désormais : ce qui a été lu des autres est lâché.
    veiller(projects: readonly string[]): void {
      for (const project of [...readings.keys()]) {
        if (projects.includes(project)) continue;
        readings.delete(project);
        upstreams.delete(project);
      }
    },
    // L'adresse de l'issue de ce ticket, telle que la box l'a donnée à la dernière lecture — en https seulement.
    adresse(project: unknown, ticket: unknown): string | undefined {
      const url = typeof project === "string" ? upstreams.get(project)?.issues.find((issue) => issue.ticket === ticket)?.url : undefined;
      return url !== undefined && openable(url) ? url : undefined;
    },
  };
}
