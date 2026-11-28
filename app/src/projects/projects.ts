// Confier la cuisine d'un projet à ses stations, depuis l'app, sans terminal : le chef choisit le
// dépôt GitHub et les stations qui le servent, et valide. L'app écrit la demande dans le gist de chaque
// station choisie (request.ts) ; chaque station la lit là, prépare le projet et l'ajoute à sa
// configuration. La station recommandée est une station serveur, toujours allumée ;
// choisir seulement l'app d'un ordinateur se dit au moment du choix : la cuisine s'arrête quand on la ferme.
//
// Deux portes y mènent : « + add a project », sur la page d'une station (`ajouter`), et la page d'un
// projet de l'app (#983, `confier`) — qui le confie à une première station, ou à une de plus. Ajouter
// un projet à l'app ne passe pas par ici (addition.ts) : c'est ce geste-ci, et lui seul, qui l'installe
// sur une station.
//
// Le calibrage et le plafond de cooks sont les décisions du chef, mais elles ne commencent pas vides
// (#425, #1107) : l'app propose le nombre de cooks que les cœurs de la station permettent, et le
// calibrage qui tourne déjà sur ses autres projets — ou la valeur de départ mesurée —, chacun avec
// d'où il vient. Ce qui manque est signalé champ par champ, sans rien écrire. Une station de plus
// reprend le dépôt, la branche et le calibrage que la première sert — ou que le clone du projet sur cet
// ordinateur dit (#1307) —, et n'apporte que ce qui est à sa machine : ses cooks et ses capacités.
// Retirer le projet le retire de la demande de chaque station : elle le retire de sa configuration.
//
// Une fois confiée, sa cuisine déménage d'un geste (#1095, `demenager`) : vers cet ordinateur, vers
// sa box, vers une autre station, sans retrait ni rajout — c'est l'opération du runtime qui l'écrit
// (move.ts). Où il cuit se lit dans le suivi de chaque station (`cuitSur`), pas dans la
// demande : une station qui refuse de le reprendre le laisse cuire là où il cuisait.
import type { GitHubOfStations } from "../stations/github.ts";
import type { StationVue } from "../stations/stations.ts";
import { capacitiesRead, documentOfRequest, FILE_PROJECTS, FILE_TRACKING, readRequest, readOnboarding, readTracking, doorTheTracking, type AccessBlocked, type Toggle, type Blockage, type Calibrated, type Choice, type Delay, type FailureOfClone, type FailureOfWorktree, type StateOfProject, type Onboarding, type ProjectRequest, type Refusal, type Selections, type TrackingOfProject, type TimePublished } from "./request.ts";
import type { Move, Mover } from "./move.ts";
import type { RepositoryOfChef } from "./github.ts";

// Le calibrage que la station accepte : ses deux listes fermées.
export const MODELS = ["opus", "sonnet", "haiku"] as const;
export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;


// Une station d'un projet, telle que la home la montre : toutes de la même façon, ce qu'elle en dit et les autorisations
// GitHub qu'elle attend.
export type StationOfProject = { id: string; nom: string; etat: StateOfProject | "attendu"; dit: string; autoriser: string[] };
// Où cuit un projet : la station qui le sert — son gist quand elle est appairée —, et si c'est
// celle de cet ordinateur.
export type CookedOn = { id: string | null; nom: string; ici: boolean };
// Un déménagement en cours : d'où, vers où, son étape — `dit`, pourquoi il est refusé.
export type MoveInProgress = Toggle & { dit: string };
export type ProjectSeen = {
  nom: string;
  depot: string;
  base: string;
  stations: StationOfProject[];
  // La station dont le gist porte le suivi du projet — son onboarding, son refus, ses choix — ; absente tant qu'aucune ne le porte.
  suiviPar?: { id: string; nom: string };
  // Du parcours ouvert au projet servi par cette station — la mesure que la spec borne à dix minutes.
  servi: string | null;
  // Où il cuit, tel que ses stations le disent ; nul tant qu'aucune ne le dit.
  cuitSur?: CookedOn | null;
  // Son déménagement, tant qu'il n'est pas fini.
  demenagement?: MoveInProgress | null;
  // Où il en est de son ajout à son premier ticket, tel que le suivi le publie (#1110) ; nul
  // tant qu'elle n'en dit rien.
  onboarding?: Onboarding | null;
  // Ce qui retient sa cuisine, tel que le suivi le publie (#1117, #1118) : l'accès au dépôt refusé,
  // avec son geste ; un worktree impossible à préparer, avec sa raison et l'heure du prochain essai.
  // Nuls (ou absents) quand rien ne retient.
  acces?: AccessBlocked | null;
  // Pourquoi la station refuse de le servir, en une phrase, et ce que le chef fait (#1178).
  refus?: Refusal | null;
  worktree?: FailureOfWorktree | null;
  // Le clone du dépôt en échec, en clair : la cause, le compte GitHub de la station, le geste (#1390).
  // Absent quand le clone n'échoue pas.
  clone?: FailureOfClone;
  // Ce qui bloque le projet, tel que le suivi le publie (#1394) : une ligne chacun sur sa page (#1399).
  // Absent quand rien ne bloque.
  blocages?: Blockage[];
  // Le temps de son ajout à son premier ticket servi, tel que le suivi le publie (#1401). Absent sans délai publié.
  delai?: Delay;
  // Les temps de ses derniers tickets et son plafond, tels que le suivi les publie (#2346). Absent sans temps publiés.
  temps?: TimePublished;
  // Ce qui manque à la station pour ses tests, un choix par besoin, tel qu'elle le publie (#1398) — et les
  // issues que l'app a écrites dans sa demande, que la station n'a peut-être pas encore lues (#1400). Absents quand
  // il n'y en a pas.
  choix?: Choice[];
  choisis?: Selections;
};
// Ce que l'app propose pour une station choisie (#1107) : ce que ce choix implique —
// toujours allumée, ou arrêtée avec l'app de son ordinateur —, et le nombre de cooks à la fois que
// ses cœurs permettent, avec d'où il vient.
export type MachineProposed = { toujoursAllumee: boolean; implique: string; cooks: number; cooksDit: string };
// Le calibrage que l'app propose pour un projet qui prend sa première station, et d'où il vient.
export type CalibrationRecommended = { manager: Calibrated; reviewer: Calibrated; dit: string };
// `recommandee` : la station que l'app propose d'office — un serveur en ligne ; `avertissements` :
// ce qui se dit quand le chef choisit telle station ; `machines` : ce que l'écran de
// confiance dit de chaque station, et `calibrage`, ce qu'il propose.
// `locale` : le gist de la station de cet ordinateur, nul quand l'app n'en a pas.
export type SeenOfProjects = {
  a: string;
  projets: ProjectSeen[];
  locale?: string | null;
  recommandee: string | null;
  avertissements: Record<string, string>;
  machines: Record<string, MachineProposed>;
  calibrage: CalibrationRecommended;
  sans?: string;
};
// Ce que le formulaire d'ajout d'une station montre d'emblée pour cet ordinateur (#1307), tel que l'opération du
// runtime le calcule (`defautsDeStation`) : les cooks que ses cœurs
// permettent et d'où vient ce nombre, le dossier où sa station pose les espaces de travail de ses cooks, et
// chaque capacité qu'elle peut déclarer, dite détectée ou non. `refus` : cet ordinateur n'a pas pu être lu.
export type CapacityOfTheMachine = { capacite: string; nom: string; detectee: boolean };
export type DefaultsOfTheMachine = { cooks: number; cooksDit: string; espaceDeTravail: string; capacites: CapacityOfTheMachine[] } | { refus: string; detail?: string };
// Les dossiers de la station de cet ordinateur pour un projet (#2489) : son clone, les worktrees de ses cooks.
export type FoldersOfTheStation = { clone: string; worktrees: string } | { refus: string; detail?: string };
// Ce que le clone d'un projet sur cet ordinateur dit de lui : son dépôt, sa branche d'intégration.
export type SaysOfClone = { depot: string | null; base: string | null };
export type Removal = { retire: string } | { refus: string };
export type { Move } from "./move.ts";


const text = (received: unknown) => (typeof received === "string" ? received.trim() : "");
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));


// Le nom du projet, tiré de son dépôt : celui de son état et de son clone sur la station.
export function nameOfProject(repository: string): string {
  return (repository.split("/")[1] ?? "")
    .toLowerCase()
    .replace(/\.git$/, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Une station est l'app d'un ordinateur quand sa machine est un Mac ou un PC Windows ;
// un Linux est tenu pour un serveur, allumé en permanence.
export const isOneComputer = (station: Pick<StationVue, "machine">) => /^(macOS|Windows)\b/.test(station.machine);

// Les temps de deux stations d'un même projet : un ticket n'est compté qu'une fois (le plus récent des deux enregistrements),
// le seuil du temps perdu est celui de la première station ; le résumé, les chiffres et le temps de la pass, ceux de la
// première qui en publie.
export function mergeTheTime(a: TimePublished | undefined, b: TimePublished): TimePublished {
  if (a === undefined) return b;
  const byTicket = new Map<unknown, unknown>();
  const merge: unknown[] = [];
  for (const e of [...a.enregistrements, ...b.enregistrements]) {
    const ticket = (e as { ticket?: unknown } | null)?.ticket;
    if (typeof ticket !== "number") {
      merge.push(e);
      continue;
    }
    const already = byTicket.get(ticket) as { mergedAt?: unknown } | undefined;
    if (already === undefined || Date.parse(String((e as { mergedAt?: unknown }).mergedAt)) > Date.parse(String(already.mergedAt))) byTicket.set(ticket, e);
  }
  // Le résumé est celui de la première station qui en publie un ; le seuil, celui de la première.
  const resume = a.resume ?? b.resume;
  const figures = a.chiffres ?? b.chiffres;
  // Le temps de la pass (#3512) aussi : celui de la première station qui en publie un.
  const pass = a.passe ?? b.passe;
  return { enregistrements: [...byTicket.values(), ...merge], lostTimeMaxMin: a.lostTimeMaxMin, ...(resume === undefined ? {} : { resume }), ...(figures === undefined ? {} : { chiffres: figures }), ...(pass === undefined || pass === null ? {} : { passe: pass }) };
}

// La station que l'app recommande : un serveur qui peut cuire maintenant — en ligne. Aucun en ligne : aucune ; une
// station hors ligne n'est jamais recommandée (#3187).
export function stationRecommended(stations: readonly StationVue[]): string | undefined {
  return stations.find((station) => station.etat === "en-ligne" && station.cuisine !== false && !isOneComputer(station))?.id;
}


// Le nombre de cooks que les cœurs d'une machine permettent : celui même que la station en dérive
// (`plafondDesCoeurs`, #1079) — deux cœurs gardés pour le
// runtime, la pass et ses gates, puis environ un par cook (#3560). 8 cœurs : 6.
export const cooksOfCores = (cores: number): number => Math.max(1, cores - 2);
// Une station qui ne publie pas encore ses cœurs : un départ prudent.
export const COOKS_WITHOUT_CORES = 2;

// Ce que choisir cette station implique, et ses cooks.
export function machineProposed(station: Pick<StationVue, "nom" | "machine" | "coeurs">): MachineProposed {
  const alwaysLit = !isOneComputer(station);
  const { coeurs: cores } = station;
  return {
    toujoursAllumee: alwaysLit,
    implique: alwaysLit ? "always on: it keeps cooking while your computer sleeps" : "stops when you close the app on this computer",
    cooks: cores === undefined ? COOKS_WITHOUT_CORES : cooksOfCores(cores),
    cooksDit:
      cores === undefined
        ? `${station.nom} does not publish its cores yet: ${COOKS_WITHOUT_CORES}, a careful start`
        : `from ${station.nom}'s ${cores} cores: two are kept for the kitchen itself, then about one per cook`,
  };
}

// La valeur de départ mesurée (#425) : celle sur laquelle la box de brigade tourne, qui a jugé,
// découpé et relu sans un désaccord.
export const CALIBRATION_MEASURE: Calibrated = { modele: "sonnet", effort: "medium" };

// Le calibrage que l'app propose : celui du projet confié le plus récemment à une station — ce sur
// quoi les autres projets du chef tournent —, ou, à défaut, la valeur de départ mesurée.
export function calibrationRecommended(requests: readonly ProjectRequest[]): CalibrationRecommended {
  const valid = ({ modele: model, effort }: Calibrated) => (MODELS as readonly string[]).includes(model) && (EFFORTS as readonly string[]).includes(effort);
  const last = requests
    .filter(({ manager, reviewer }) => valid(manager) && valid(reviewer))
    .reduce<ProjectRequest | undefined>((retained, project) => (retained === undefined || (project.demandeLe ?? "") > (retained.demandeLe ?? "") ? project : retained), undefined);
  if (last !== undefined) return { manager: last.manager, reviewer: last.reviewer, dit: `what ${last.nom} runs on, your project most recently given to a station` };
  return { manager: CALIBRATION_MEASURE, reviewer: CALIBRATION_MEASURE, dit: "the starting value measured on brigade's own box, for lack of another project on your stations" };
}

// Ce que l'app dit au moment où le chef choisit cette station.
export function warning(station: Pick<StationVue, "nom" | "machine"> | undefined): string | undefined {
  if (station === undefined || !isOneComputer(station)) return undefined;
  return `${station.nom} is a computer's app: this project's kitchen stops whenever you close the app there. A server station, always on, is recommended.`;
}






// Ce que la demande d'un projet porte pour une station : ce que son appairage dit qu'elle fournit (#1757,
// stations/document.ts), en plus de ce que le chef a coché — c'est par là que le suivi du projet l'apprend.
export function withWhatItProvides(station: Pick<StationVue, "fournit">, project: ProjectRequest): ProjectRequest {
  const provides = capacitiesRead([...(project.fournit ?? []), ...(station.fournit ?? [])]);
  return provides.length === 0 || provides.join("+") === (project.fournit ?? []).join("+") ? project : { ...project, fournit: provides };
}

// Ce qu'une station dit d'un projet, avec elle.
type Says = { station: StationVue; suivi: TrackingOfProject };
const ORDER_OF_STEPS: readonly Toggle["etape"][] = ["demandee", "acceptee", "remise", "refusee"];

// Où cuit un projet, d'après ce que ses stations en disent : celle qui le sert ; entre deux — celle
// qu'il quitte a fermé sa cuisine, l'autre ne l'a pas encore ouverte —, celle qu'elles nomment.
export function cookedOnOf(saidOnes: readonly Says[], locale: string | null): CookedOn | null {
  const served = saidOnes.find(({ suivi: tracking }) => tracking.etat === "servi");
  if (served !== undefined) return { id: served.station.id, nom: served.station.nom, ici: served.suivi.ici || served.station.id === locale };
  const named = saidOnes.find(({ suivi: tracking }) => tracking.cuitSur !== null)?.suivi.cuitSur;
  if (named === undefined || named === null) return null;
  const station = saidOnes.find(({ station: candidate }) => candidate.nom === named)?.station;
  return { id: station?.id ?? null, nom: named, ici: station !== undefined && station.id === locale };
}

// Le rail d'un projet que le fichier des projets ne dit pas cuit sur cet ordinateur se lit du tableau de sa
// cuisine : il se lit dès qu'une station le sert, ailleurs que sur cet ordinateur. Faux, quand aucune station ne
// le sert, ou que c'est celle de cet ordinateur.
export function servedElsewhere(seenOne: Pick<SeenOfProjects, "projets"> | undefined, name: string): boolean {
  const cooked = seenOne?.projets.find((project) => project.nom === name)?.cuitSur;
  return cooked !== undefined && cooked !== null && !cooked.ici;
}


// Le déménagement en cours d'un projet, d'après ses stations : le plus récent, à son étape la plus
// avancée. Reçu par celle qui le reprend, il est fini : rien. Refusé, `dit` dit pourquoi — ce que
// la station visée en a écrit.
export function moveOf(saidOnes: readonly Says[]): MoveInProgress | null {
  const toggles = saidOnes.flatMap(({ station, suivi: tracking }) => (tracking.bascule === null ? [] : [{ station, suivi: tracking, bascule: tracking.bascule }]));
  const last = toggles.reduce<string | undefined>((retainedOne, { bascule: toggle }) => (retainedOne === undefined || toggle.demandeLe > retainedOne ? toggle.demandeLe : retainedOne), undefined);
  const itsOwn = toggles.filter(({ bascule: toggle }) => toggle.demandeLe === last);
  if (itsOwn.length === 0 || itsOwn.some(({ bascule: toggle }) => toggle.etape === "recue")) return null;
  const rank = (step: Toggle["etape"]) => ORDER_OF_STEPS.indexOf(step);
  const retainedOne = itsOwn.reduce((more, one) => (rank(one.bascule.etape) > rank(more.bascule.etape) ? one : more));
  const { de: of, vers: to, demandeLe: requestThe, etape: step } = retainedOne.bascule;
  const aimed = itsOwn.find(({ station }) => station.nom === to);
  const said = step === "refusee" ? (aimed?.suivi.etat === "refuse" ? aimed.suivi.dit : retainedOne.suivi.dit) : (aimed ?? retainedOne).suivi.dit;
  return { de: of, vers: to, demandeLe: requestThe, etape: step, dit: said };
}

// Une durée, telle que la home la dit.
function duration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")} s`;
}

// Les projets se relisent quand les stations se relisent (stations/stations.ts) : c'est à
// chaque lecture des stations que l'app demande `relire`.
export type OptionsProjects = {
  github: GitHubOfStations;
  // Les stations appairées, telles que la dernière lecture les donne.
  stations: () => readonly StationVue[] | undefined;
  depots: () => Promise<RepositoryOfChef[]>;
  surLecture: (seenOne: SeenOfProjects) => void;
  maintenant?: () => number;
  // Le gist de la station de cet ordinateur, nul quand l'app n'en a pas.
  locale?: () => string | null;
  // L'opération du runtime qui déménage une cuisine (move.ts). Absente, l'app n'a pas de
  // runtime à côté d'elle : rien ne se déménage d'ici.
  demenager?: Mover;
  // Note la décision du chef de cuire sans bac à sable pour `station`, dans l'état de `projet` sur cet
  // ordinateur (`accepterSansBacASable`). Absente, l'app n'a pas de runtime à côté d'elle.
  accepterSansBac?: (project: string, station: string) => Promise<void>;
  // Ce que le clone du projet sur cet ordinateur dit de lui (`projetDuClone`)
  // — nul sans clone ici. Une station de plus en prend le dépôt et la branche que la
  // première ne dit pas : le chef ne les retape pas (#1307).
  leClone?: (name: string) => Promise<SaysOfClone | null>;
};

export type Projects = {
  vu(): SeenOfProjects | undefined;
  relire(): Promise<SeenOfProjects>;
  depots(): Promise<{ depots: RepositoryOfChef[] } | { refus: string }>;
  // Déménage la cuisine d'un projet vers une station appairée — son gist.
  demenager(name: unknown, to: unknown): Promise<Move>;
  // Les pages GitHub où autoriser brigade, telles que les stations les ont publiées.
  pages(): string[];
};

export function holdProjects(options: OptionsProjects): Projects {
  const { github } = options;
  const now = options.maintenant ?? Date.now;
  const locale = options.locale ?? (() => null);
  // Le clone illisible se tait : la première station, ou le chef, dit le reste.
  const readTheClone = async (name: string): Promise<SaysOfClone | null> => {
    try {
      return (await options.leClone?.(name)) ?? null;
    } catch {
      return null;
    }
  };
  let seenOne: SeenOfProjects | undefined;
  let inProgress: Promise<SeenOfProjects> | undefined;
  // Les écritures se suivent : deux gestes du chef ne réécrivent pas la même demande en même temps.
  let writes: Promise<unknown> = Promise.resolve();
  const inFile = <T>(action: () => Promise<T>): Promise<T> => {
    const suite = writes.then(action, action);
    writes = suite.catch(() => undefined);
    return suite;
  };
  const paired = () => options.stations() ?? [];

  // La demande et le suivi de chaque station appairée.
  const readAll = async () =>
    Promise.all(
      paired().map(async (station) => {
        const files = await github.lire(station.id);
        return { station, demande: readRequest(files?.[FILE_PROJECTS]), suivi: readTracking(files?.[FILE_TRACKING]), onboarding: readOnboarding(files?.[FILE_TRACKING]) };
      }),
    );

  const choice = () => {
    const stations = paired();
    return {
      recommandee: stationRecommended(stations) ?? null,
      avertissements: Object.fromEntries(stations.flatMap((station) => {
        const said = warning(station);
        return said === undefined ? [] : [[station.id, said]];
      })),
      machines: Object.fromEntries(stations.filter(({ etat: state }) => state !== "illisible").map((station) => [station.id, machineProposed(station)])),
    };
  };

  const read = async (): Promise<SeenOfProjects> => {
    const instant = now();
    try {
      const readOnes = await readAll();
      const here = locale();
      const projects = new Map<string, ProjectSeen>();
      const saidOnes = new Map<string, Says[]>();
      for (const { station, suivi: tracking } of readOnes) for (const oneOf of tracking) saidOnes.set(oneOf.nom, [...(saidOnes.get(oneOf.nom) ?? []), { station, suivi: oneOf }]);
      for (const { station, demande: request, suivi: tracking, onboarding } of readOnes) {
        for (const project of request ?? []) {
          const itsOwn = saidOnes.get(project.nom) ?? [];
          const seenOne: ProjectSeen = projects.get(project.nom) ?? { nom: project.nom, depot: project.depot, base: project.base, stations: [], servi: null, cuitSur: cookedOnOf(itsOwn, here), demenagement: moveOf(itsOwn) };
          // L'onboarding, seule la station qui porte le suivi le publie.
          const door = doorTheTracking(project);
          const ownOne = door ? onboarding[project.nom] : undefined;
          if (ownOne !== undefined) seenOne.onboarding = ownOne;
          const said = tracking.find(({ nom: name }) => name === project.nom);
          // Ce qui retient la cuisine, seule cette station le dit ; relu à chaque lecture, il s'efface quand elle ne le dit plus.
          if (door) {
            seenOne.suiviPar ??= { id: station.id, nom: station.nom };
            seenOne.acces = said?.acces ?? null;
            seenOne.refus = said?.refus ?? null;
            seenOne.worktree = said?.worktree ?? null;
            if (said?.clone !== undefined) seenOne.clone = said.clone;
            else delete seenOne.clone;
            if (said?.blocages !== undefined) seenOne.blocages = said.blocages;
            else delete seenOne.blocages;
            if (said?.delai !== undefined) seenOne.delai = said.delai;
            else delete seenOne.delai;
            if (said?.choix !== undefined) seenOne.choix = said.choix;
            else delete seenOne.choix;
            if (project.choix !== undefined) seenOne.choisis = project.choix;
            else delete seenOne.choisis;
          }
          // Les temps, toute station qui sert le projet les publie : l'app fusionne leurs enregistrements.
          if (said?.temps !== undefined) seenOne.temps = mergeTheTime(seenOne.temps, said.temps);
          seenOne.stations.push({ id: station.id, nom: station.nom, etat: said?.etat ?? "attendu", dit: said?.dit ?? `${station.nom} has not read it yet: it reads what the app asks every 30 s`, autoriser: said?.autoriser ?? [] });
          if (door && said?.etat === "servi" && said.serviLe !== null) {
            const since = project.ouvertLe ?? project.demandeLe;
            seenOne.servi = since === null ? null : `served by ${station.nom} ${duration(Date.parse(said.serviLe) - Date.parse(since))} after “add a project” was opened`;
          }
          projects.set(project.nom, seenOne);
        }
      }
      for (const project of projects.values()) project.stations.sort((a, b) => a.nom.localeCompare(b.nom));
      const calibration = calibrationRecommended(readOnes.flatMap(({ demande: request }) => request ?? []));
      seenOne = { a: new Date(instant).toISOString(), projets: [...projects.values()].sort((a, b) => a.nom.localeCompare(b.nom)), locale: here, ...choice(), calibrage: calibration };
      // Une station ajoutée avant que son appairage ne dise ce qu'elle fournit : sa demande le reprend.
      if (readOnes.some(({ station, demande: request }) => (request ?? []).some((project) => withWhatItProvides(station, project) !== project))) carryWhatEllesProvide();
    } catch (error) {
      seenOne = { a: new Date(instant).toISOString(), projets: seenOne?.projets ?? [], locale: locale(), ...choice(), calibrage: seenOne?.calibrage ?? calibrationRecommended([]), sans: `the projects on your stations could not be read on GitHub — ${message(error)}` };
    }
    options.surLecture(seenOne);
    return seenOne;
  };

  const reread = () => {
    inProgress ??= read().finally(() => (inProgress = undefined));
    return inProgress;
  };

  // Porte dans la demande de chaque station ce que son appairage dit qu'elle fournit, à la suite des gestes du
  // chef. GitHub en panne : la lecture suivante réessaie.
  let door: Promise<unknown> | undefined;
  const carryWhatEllesProvide = () => {
    door ??= inFile(() => rewrite((station, before) => before.map((project) => withWhatItProvides(station, project))))
      .catch(() => undefined)
      .finally(() => (door = undefined));
  };

  // Réécrit la demande de chaque station : `changer` rend ses projets, à partir de ceux d'avant.
  const rewrite = async (change: (station: StationVue, before: ProjectRequest[]) => ProjectRequest[]) => {
    const readOnes = await readAll();
    const unreadable = readOnes.find(({ demande: request }) => request === null);
    if (unreadable !== undefined) throw new Error(`what this app wrote on ${unreadable.station.nom}'s gist (${FILE_PROJECTS}) is unreadable: nothing was changed`);
    const writtenOnes: string[] = [];
    for (const { station, demande: request } of readOnes) {
      const before = request ?? [];
      const after = change(station, before);
      if (JSON.stringify(after) === JSON.stringify(before)) continue;
      await github.ecrire(station.id, { [FILE_PROJECTS]: documentOfRequest(after) });
      writtenOnes.push(station.nom);
    }
    return writtenOnes;
  };

  const relocate = (receivedName: unknown, receivedTo: unknown): Promise<Move> =>
    inFile(async () => {
      const name = text(receivedName);
      const to = text(receivedTo);
      if (name === "") return { refus: "which project? none was named" };
      const stations = paired();
      const aimed = stations.find(({ id }) => id === to);
      if (aimed === undefined) return { refus: "that station is no longer paired with this app: nothing was changed" };
      if (aimed.cuisine === false) return { refus: `${aimed.nom} does not cook: nothing was changed` };
      if (options.demenager === undefined) return { refus: "this app has no runtime beside it to move a kitchen: nothing was changed" };
      // La station qu'il quitte : celle où la page le dit cuire, si elle est appairée.
      const of = seenOne?.projets.find((project) => project.nom === name)?.cuitSur?.id ?? null;
      const gists = stations.map(({ id }) => id);
      const rendered = await options.demenager(name, aimed.id, gists, of !== null && gists.includes(of) ? of : undefined);
      await reread();
      return rendered;
    });

  // Continuer sans bac à sable : la décision s'écrit dans l'état du projet, sur la station de cet
  // ordinateur — la seule que l'app atteigne ; une autre station dit qui peut la prendre.
  return {
    vu: () => seenOne,
    relire: reread,
    demenager: relocate,
    async depots() {
      try {
        return { depots: await options.depots() };
      } catch (error) {
        return { refus: `your repositories could not be read on GitHub — ${message(error)}` };
      }
    },
    // Et celles que son onboarding montre : le geste attendu, le ticket de préparation, sa PR ; et celles
    // du geste d'un clone en échec (#1390) ; et celles où lever un blocage hors de l'app (#1399).
    pages: () =>
      [...new Set((seenOne?.projets ?? []).flatMap(({ stations, onboarding, clone, blocages: blockages }) => [
        ...stations.flatMap(({ autoriser: allow }) => allow),
        ...(clone?.liens ?? []),
        ...(blockages ?? []).flatMap(({ link }) => (link === undefined ? [] : [link])),
        ...(onboarding?.etapes ?? []).flatMap(({ geste: action }) => action?.liens ?? []),
        ...(onboarding?.preparation === null || onboarding?.preparation === undefined ? [] : [onboarding.preparation.url, ...(onboarding.preparation.pr === null ? [] : [onboarding.preparation.pr])]),
      ]))],
  };
}
