// La vue du rail d'un projet, nourrie de GitHub seul (#1694, épique #1692 ; #2061) : ses colonnes, ses cartes, sa file
// TODO et l'état de sa cuisine se tirent des issues, des labels et des PR du dépôt du projet, lus par lecture.ts. Ni
// tailnet, ni box jointe : il suffit que l'app soit connectée à GitHub.
//
// Ce module rend cette lecture sous la forme de ce que le rail lisait jusqu'ici sur la box — une lecture de la veille
// (box.ts, `Lecture`) dont chaque sortie est celle de la commande qu'elle remplace — pour que ce qui la reçoit (facts.ts,
// awaiting.ts, slip.ts, alerts.ts, home.ts, upstream.ts) dessine le même rail sans rien changer :
//   - `facts`   l'objet `faits` de la lecture ;
//   - `status`  ses rubriques, le bloc `awaiting` de ce qui attend le chef, et la ligne `rail` suivie de la ligne de
//               chaque ticket (`lignesDuRail`) — ce que `status` écrit, sans ce qui ne se lit que sur la box ;
//   - `manager upstream` ce qui est avant le rail (`avantLeRail`, #1836), dans la forme de la sortie de la commande —
//               chaque issue dans l'un des cinq états, son adresse déduite du dépôt.
// Ce que GitHub ne porte pas (l'interrupteur du projet, que seul le journal de sa station tient ; une commande composée
// d'après d'autres sorties) n'est pas lu : la lecture échoue en `pasPublie`, et la vue n'en dit rien — ni nombre, ni
// « pas lu » (#1770), jamais un rail vide.
//
// La veille du rail (`ouvrirVeilleDuTableau`) a l'usage de celle des box : ce qui est affiché, et les commandes à y
// lire. Ses lectures passent par `tenirLecturesDuTableau`, qui ne demande à GitHub qu'une lecture à la fois par projet,
// reprise par toutes les veilles tant qu'elle est fraîche. Aucun import de box.ts : rien ici ne peut lancer de commande.
import { setTimeout as wait } from "node:timers/promises";
import { FRESHNESS_MAX_OF_A_READ_MS, INTERVAL_OF_THE_STANDBY_MS } from "../vue/served/freshness.ts";
import type { ReadOfBoardOfRepository, LineOfTheFile, HeadingOfBoard, BoardRead } from "./read.ts";
import { linesOfTheFile, type RailBlockedRead } from "../vue/rail-blocked/rail-blocked.ts";
import { lignesDeStatus } from "../../../runtime/src/attente-du-rail/raison.ts";
import type { AttenteDuRail } from "../../../runtime/src/attente-du-rail/raison.ts";
import type { LinesOfCards } from "../vue/wait-of-rail/wait-of-rail.ts";

// Les commandes que la lecture remplace, comme la veille des box les nomme (facts.ts, `COMMANDE` ; upstream.ts) : la vue
// du rail les demande, la lecture en rend la sortie.
export const FACTS = "facts";
export const STATUS = "status";
export const UPSTREAM = "manager upstream";

// Une lecture, de la forme de celle de la veille des box (box.ts, `Lecture`) : des sorties, ou l'échec de la lecture de
// GitHub — `duTableau` la distingue d'une commande en échec, et `erreur` est sa raison en une phrase.
export type OutputOfBoard = { commande: string; texte: string };
// `horsLigne` : GitHub n'a pas été joint (read.ts) — l'app est hors ligne, rien n'est en panne (#1818).
export type FailureOfBoard = { erreur: string; atteinte: true; cas: null; duTableau: true; pasPublie?: true; horsLigne?: true };
// `publieLe` : l'heure où l'état montré a été lu sur GitHub — l'âge du rail (#2054).
export type ReadOfRail = { projet: string; demande: number; a: string } & ({ sorties: OutputOfBoard[]; publieLe?: string } | FailureOfBoard);
// Une commande demandée : son texte — ou ce qui le compose d'après les sorties d'avant (box.ts, `Commande`), que la
// lecture ne rend pas.
export type CommandRequested = string | ((...readEntries: never[]) => string);

// Les titres de `status` sur onze colonnes (runtime/src/etat.ts, `ligne`).
const TITLE = 11;
const line = (title: string, value: string) => `${title.padEnd(TITLE)}${value}`;
// Le bord du bloc `awaiting` (runtime/src/attend.ts, `TETE_AWAITING`, `FIN_AWAITING`).
const HEAD_AWAITING = "awaiting";
const END_AWAITING = "end awaiting";

// Une durée, comme `status` la dit en anglais (runtime/src/etat.ts, `dureeEn`).
export function durationIn(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ${String(minutes % 60).padStart(2, "0")}`;
  return `${Math.floor(hours / 24)} d`;
}

// Les lignes d'une rubrique, comme `status` les écrit : la première sur la ligne de son titre, les suivantes en retrait
// — la forme que slip.ts et awaiting.ts relisent.
const linesOfHeading = ({ titre: title, lignes: lines }: HeadingOfBoard): string[] =>
  lines.map((text, rank) => (rank === 0 ? (title === "" ? text : line(title, text)) : `${" ".repeat(TITLE)}${text}`));

// Le bloc `awaiting` de `status` (runtime/src/attend.ts, `decrireAttentes`) : sa tête, une ligne par attente — son nom,
// depuis combien de temps, ce qui attend et le geste, son titre —, puis ce qui n'est pas une décision. Les durées se
// comptent jusqu'à la lecture (`lu`). Ce qui attend le chef lu de GitHub (wait-of-chef.ts, #2460) passe par lui :
// l'app et le second en lisent le même bloc. `railBloque` : le rail bloqué (#3358), sa ligne sous la tête.
export function blockAwaiting({ file, bilans, lu: readOne, depot: repository = "", railBloque: railBlocked }: { file: readonly LineOfTheFile[]; bilans: readonly string[]; lu: string; depot?: string; railBloque?: RailBlockedRead }): string[] {
  const since = (instant: string) => durationIn(Date.parse(readOne) - Date.parse(instant));
  const [first] = file;
  const head =
    first === undefined
      ? "nothing awaits the chef"
      : file.length === 1
        ? `1 decision awaits the chef — for ${since(first.depuis)}`
        : `${file.length} decisions await the chef — the oldest for ${since(first.depuis)}`;
  return [
    line(HEAD_AWAITING, head),
    ...linesOfTheFile(repository, railBlocked),
    ...file.map(({ nom: name, depuis: instant, ligne: said, titre: title }) => `  ${name}  for ${since(instant)}  ${said}${title === null ? "" : `  ${title}`}`),
    ...bilans.map((bilan) => `  ${bilan}`),
    END_AWAITING,
    "",
  ];
}

// La sortie de `status` que la lecture porte : ses rubriques dans l'ordre de `status`, le bloc `awaiting` juste avant la
// ligne `rail`, et sous elle la ligne de chaque ticket. Sans ce que la box seule lit (les serveurs, les worktrees, les
// transcripts, les derniers événements) : GitHub ne le porte pas.
export function statusOfBoard(readOne: Pick<BoardRead, "file" | "bilans" | "cuisine" | "lignesDuRail" | "luLe"> & Partial<Pick<BoardRead, "depot" | "faits">>): string {
  const { rubriques: headings } = readOne.cuisine;
  const rankOfRail = headings.findIndex(({ titre: title }) => title === "rail");
  const before = rankOfRail === -1 ? headings : headings.slice(0, rankOfRail);
  const after = rankOfRail === -1 ? [] : headings.slice(rankOfRail + 1);
  const rail = rankOfRail === -1 ? { titre: "rail", lignes: [`${readOne.lignesDuRail.length} on the rail`] } : (headings[rankOfRail] as HeadingOfBoard);
  return [
    ...before.flatMap(linesOfHeading),
    "",
    ...blockAwaiting({ file: readOne.file, bilans: readOne.bilans, lu: readOne.luLe, depot: readOne.depot, railBloque: readOne.faits?.railBloque as RailBlockedRead | undefined }),
    // Pourquoi la file ne part pas (#3433), au-dessus d'elle : les lignes mêmes que `brigade <project> status` écrit.
    ...lignesDeStatus((readOne.faits?.attenteDuRail as AttenteDuRail | undefined)?.phrase ?? null, (readOne.faits?.lignesDesCartes as LinesOfCards | undefined) ?? {}),
    line("rail", rail.lignes[0] ?? ""),
    ...readOne.lignesDuRail.map(({ ligne: itsOwnOne }) => itsOwnOne),
    "",
    ...after.flatMap(linesOfHeading),
    "",
  ].join("\n");
}

// La sortie de `manager upstream` que la lecture porte (upstream.ts, `comprendre`) : l'heure où les issues ouvertes ont été
// lues, le dépôt, et chaque issue avant le rail avec l'adresse de son issue. Rien, quand elles n'ont pas été lues.
export function upstreamOfBoard(readOne: Pick<BoardRead, "depot" | "avantLeRail">): string | undefined {
  if (readOne.avantLeRail === undefined) return undefined;
  const { lu: readThe, issues } = readOne.avantLeRail;
  return JSON.stringify({ lu: readThe, depot: readOne.depot, issues: issues.map((issue) => ({ ...issue, url: `https://github.com/${readOne.depot}/issues/${issue.ticket}` })) });
}

// La sortie d'une commande demandée, tirée de la lecture — ou pourquoi elle ne s'en tire pas, en une phrase.
export function outputOfBoard(readOne: BoardRead, command: CommandRequested): { texte: string } | { raison: string; pasPublie?: true } {
  if (command === FACTS) return { texte: JSON.stringify(readOne.faits) };
  if (command === STATUS) return { texte: statusOfBoard(readOne) };
  if (command === UPSTREAM) {
    const text = upstreamOfBoard(readOne);
    if (text !== undefined) return { texte: text };
  }
  const name = typeof command === "string" ? `\`${command}\`` : "this reading";
  return { raison: `${name.charAt(0).toUpperCase()}${name.slice(1)} is not read from GitHub for ${readOne.depot}: only the station's log carries it.`, pasPublie: true };
}

// La lecture de la veille que celle de GitHub donne, pour ces commandes, dans leur ordre : la première qui ne s'en tire
// pas fait l'échec, comme la première commande qui échoue sur une box.
export function readOfBoard(readOne: ReadOfBoardOfRepository, project: string, request: number, commands: readonly CommandRequested[]): ReadOfRail {
  const failure = (error: string, notPublished?: true, outsideLine?: true): ReadOfRail => ({ projet: project, demande: request, a: readOne.luLe, erreur: error, atteinte: true, cas: null, duTableau: true, ...(notPublished === undefined ? {} : { pasPublie: notPublished }), ...(outsideLine === undefined ? {} : { horsLigne: outsideLine }) });
  if (!readOne.lu) return failure(readOne.raison, undefined, readOne.horsLigne);
  const outputs: OutputOfBoard[] = [];
  for (const command of commands) {
    const output = outputOfBoard(readOne, command);
    if ("raison" in output) return failure(output.raison, output.pasPublie);
    outputs.push({ commande: command as string, texte: output.texte });
  }
  return { projet: project, demande: request, a: readOne.luLe, sorties: outputs, publieLe: readOne.luLe };
}

// Les lectures des projets sur GitHub : une seule à la fois par projet, reprise par qui la demande tant qu'elle a moins
// de `fraicheurMs` — les veilles du rail, des faits et de l'amont, lancées ensemble, n'en font qu'une. La dernière
// lecture réussie de chaque projet est gardée : c'est elle que visent les gestes du rail (actions-github.ts).
export function holdReadsOfBoard<P extends { nom: string }>(options: { lire: (project: P) => Promise<ReadOfBoardOfRepository>; fraicheurMs: number; maintenant?: () => number }) {
  const now = options.maintenant ?? Date.now;
  const freshnessMs = Math.min(options.fraicheurMs, FRESHNESS_MAX_OF_A_READ_MS);
  const readEntries = new Map<string, { a: number; lecture: Promise<ReadOfBoardOfRepository> }>();
  const succeeded = new Map<string, BoardRead>();
  return {
    lire(project: P): Promise<ReadOfBoardOfRepository> {
      const heldOne = readEntries.get(project.nom);
      if (heldOne !== undefined && now() - heldOne.a < freshnessMs) return heldOne.lecture;
      const reading = options.lire(project).then((readOne) => {
        if (readOne.lu) succeeded.set(project.nom, readOne);
        return readOne;
      });
      readEntries.set(project.nom, { a: now(), lecture: reading });
      return reading;
    },
    // La dernière lecture réussie de ce projet ; rien s'il n'a jamais été lu.
    dernier(name: unknown): BoardRead | undefined {
      return typeof name === "string" ? succeeded.get(name) : undefined;
    },
    // La prochaine lecture va à GitHub, sans reprendre la dernière : « read again », ou un geste posté.
    oublier(): void {
      readEntries.clear();
    },
  };
}

// La veille du rail sur GitHub : l'usage de celle des box (box.ts, `ouvrirVeille`) — ce qui est affiché, les
// commandes à y lire, la demande à laquelle chaque lecture répond. Chaque projet est lu tout de suite,
// puis à chaque intervalle. `lisible` : un projet dont la vue lit le rail (absent : tous).
export function openStandbyOfBoard<P extends { nom: string }>(options: {
  lire: (project: P) => Promise<ReadOfBoardOfRepository>;
  // Absent, la veille du rail de l'app : `INTERVALLE_DE_LA_VEILLE_MS`.
  intervalleMs?: number;
  // L'attente entre deux lectures : celle de Node, sauf aux tests, qui lisent l'intervalle demandé sans l'attendre.
  attendre?: typeof wait;
  lisible?: (project: P) => boolean;
  surLecture(reading: ReadOfRail): void;
}) {
  let tour: AbortController | undefined;

  async function follow(project: P, commands: readonly CommandRequested[], request: number, signal: AbortSignal): Promise<void> {
    for (;;) {
      if (options.lisible?.(project) ?? true) {
        // `lire` ne lève pas (read.ts) ; un pont qui lèverait quand même rend un échec, pas une veille arrêtée.
        const readOne = await options.lire(project).catch((error: unknown): ReadOfBoardOfRepository => ({ lu: false, depot: project.nom, luLe: new Date().toISOString(), raison: `The rail was not read: ${error instanceof Error ? error.message : String(error)}` }));
        if (signal.aborted) return;
        options.surLecture(readOfBoard(readOne, project.nom, request, commands));
      }
      await (options.attendre ?? wait)(options.intervalleMs ?? INTERVAL_OF_THE_STANDBY_MS, undefined, { signal }).catch(() => {});
      if (signal.aborted) return;
    }
  }

  function stop(): void {
    tour?.abort();
  }

  return {
    regarder(projects: readonly P[], commands: readonly CommandRequested[], request: number): void {
      stop();
      const { signal } = (tour = new AbortController());
      for (const project of projects) void follow(project, commands, request, signal);
    },
    fermer: stop,
  };
}
