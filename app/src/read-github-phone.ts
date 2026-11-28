// La lecture des projets sur le téléphone, de GitHub seul (#2501, épique #2498) : avec la session GitHub du chef (le
// ticket 2500, le jeton du coffre du téléphone), l'app Android lit l'état de chaque cuisine sur GitHub, comme le desktop
// — aucune station n'est jointe, aucune adresse de station n'est demandée. Toutes les demandes partent à l'API de GitHub
// (board/client.ts, `clientGitHub`), par l'envoi que la plateforme donne — le HTTP natif de Capacitor sur le téléphone
// (`parCapacitor`), github.com ne répondant pas à une WebView.
//
// Ce qui est lu, toutes les trente secondes et quand la vue le demande :
//   - les projets du chef : ceux que l'app a demandés à ses stations, écrits sur GitHub dans le gist de chacune, sous son
//     compte — `brigade-projets.json` (projects/request.ts, un nom et un dépôt par projet) et `brigade-selection.json`
//     (stations-of-account.ts l'écrit, des dépôts, chacun nommé comme la station le nomme). Un même dépôt
//     n'est qu'un projet ; rangés par nom ;
//   - le rail et TODO de chacun : la lecture même du desktop (main.ts, `lireLeTableau`) — `lireLeTableauDuDepot`, puis
//     ce qui attend le chef (`avecCeQuiAttendLeChef`), partagé pour le compte connecté (vue/cards-assigned/), en
//     lectures conditionnelles dont un 304 ne coûte rien.
// Ce qui en est fait est ce que fait le desktop, par les mêmes modules : `facts` passe par `tenirFaits` et devient le
// rail et ses cartes ; `status`, son bloc `attend` mis à part (`mettreAPart`), passe par `attendre` et pose TODO ; la
// lignes de l'accueil, l'activité des cooks et, dans l'espace d'un projet, ce qui est avant le rail
// suivent. La vue reçoit donc d'un projet ce que le desktop reçoit du même, à la même lecture de GitHub.
//
// Ce qui ne se lit pas se dit, jamais un écran vide : la liste qui ne se lit pas garde les projets connus — ceux de la
// dernière liste lue, que le pont garde —, et `liste` dit pourquoi : GitHub pas joint (`injoignable`), la session GitHub
// refusée (`oublie`, se reconnecter), ou un autre refus (`inattendu`). Le rail d'un projet qui ne se lit pas est l'échec
// que le desktop montre, sa raison en une phrase. Un projet sans rien — ni ticket, ni attente — est un rail vide lu, et
// « nothing awaits the chef ».
//
// Et les gestes du chef (#2502) : ce que la vue écrit — répondre à une carte de TODO, reprendre, mettre en suspens —
// s'écrit sur GitHub par les gestes du téléphone (actions-github-phone.ts, le code d'écriture du desktop), sur ce que
// la dernière lecture de chaque projet a lu : son dépôt, son dernier rail lu, la carte du chef d'un ticket. Une écriture
// que GitHub a prise relance la lecture, qui la montre ; aucune station n'est jointe pour l'écrire.
import { holdHome, type Home } from "./home.ts";
import { putAside } from "./awaiting.ts";
import { forTheBar, type Shown } from "./bar.ts";
import type { Project } from "./config.ts";
import { holdFacts, type Drawable } from "./facts.ts";
import { pageOfFacts } from "./read-only.ts";
import { openTheActionsGitHub } from "./actions-github-phone.ts";
import { clientOfThePriority, type SendGitHub } from "./priority.ts";
import { FILE_PROJECTS, readRequest } from "./projects/request.ts";
import { nameOfProject } from "./projects/projects.ts";
import { withWhatAwaitingTheChef } from "./board/wait-of-chef.ts";
import { shareOfCardsAssigned } from "./vue/cards-assigned/cards-assigned.ts";
import { clientGitHub, bodyRead, refusalOf, type CallGitHub, type Send, type AnswerGitHub } from "./board/client.ts";
import { readTheBoardOfRepository, type ReadOfBoardOfRepository, type BoardRead } from "./board/read.ts";
import { readConditional, type MemoryOfReads } from "./board/rail-github.ts";
import { FACTS, readOfBoard, STATUS } from "./board/rail.ts";
import { setTheTrace } from "./phone-connected.ts";

// Le fichier du gist d'une station où l'app écrit sa sélection (stations-of-account.ts).
const FILE_SELECTION = "brigade-selection.json";
// Les dépôts d'une sélection, aucun quand elle ne se lit pas.
function repositoriesSelected(raw: string): string[] {
  try {
    const { brigade, repositories } = (JSON.parse(raw) ?? {}) as { brigade?: unknown; repositories?: unknown };
    return brigade === "station-selection" && Array.isArray(repositories) && repositories.every((repository) => typeof repository === "string" && /^[\w.-]+\/[\w.-]+$/.test(repository)) ? repositories : [];
  } catch {
    return [];
  }
}

// Un projet du chef, tel que GitHub le dit : son nom, et son dépôt `<owner>/<repo>`.
export type ProjectOfAccount = { nom: string; depot: string };
// La dernière lecture de la liste : lue, ou ce qui l'a empêchée — un motif, et ce que GitHub ou le réseau en a dit. La
// forme est celle de la liste du téléphone appairé (vue/bridge.d.ts, `ListeDuTelephone`), ses motifs ceux que GitHub donne.
export type Reason = { reason: "injoignable" | "oublie" | "inattendu"; said: string };
export type ListRead = { a: string; lue: true } | ({ a: string; lue: false } & Reason);
// Le téléphone, tel que la vue le reçoit : connecté à GitHub — le compte, nul quand il n'est pas dit —, sans station.
export type PhoneGitHub = { github: { compte: string | null }; liste?: ListRead };
// Ce que la lecture dit à la vue, par le nom de son abonnement (app/src/vue/bridge.d.ts).
export type Tell = {
  (channel: "surConfiguration", configuration: Shown, closed: number[]): void;
  (channel: "surFaits", receivedOne: Drawable): void;
  (channel: "surAccueil", home: Home): void;
  (channel: "surTelephone", phone: PhoneGitHub): void;
};

export type Options = {
  // Le jeton GitHub du chef — celui du coffre du téléphone ; nul sans lui, et GitHub dit ce qu'il refuse.
  jeton: () => Promise<string | null>;
  // Ce qui porte une demande à l'API de GitHub (`parCapacitor` sur le téléphone).
  envoyer: Send;
  // Ce qui porte une écriture à l'API de GitHub (`ecritureParCapacitor` sur le téléphone) : sans lui, aucun geste ne part.
  ecrire?: SendGitHub;
  dire: Tell;
  // Le compte GitHub sous lequel le téléphone est connecté, quand il est su.
  compte?: string | null;
  // Les projets de la dernière liste lue, gardés par le pont : le téléphone les montre avant de relire, et quand la liste
  // ne se lit pas.
  connus?: readonly ProjectOfAccount[];
  garder?: (projects: ProjectOfAccount[]) => void;
  maintenant?: () => Date;
  // Ce qui relance la lecture plus tard ; rend de quoi l'annuler.
  planifier?: (doIt: () => void, ms: number) => () => void;
};

// Le rythme du desktop : chaque projet est relu toutes les trente secondes.
export const INTERVAL_MS = 30_000;
const BY_PAGE = 100;
const PAGES_AT_MOST = 30;

// Ce que le HTTP natif de Capacitor rend d'une demande : son code, son corps — un objet, ou du texte qu'il n'a pas lu en
// JSON —, et ses en-têtes.
export type AnswerNative = { status: number; data: unknown; headers?: Record<string, string> };
// L'envoi d'une lecture par le HTTP natif de Capacitor (`CapacitorHttp.request`) : un `GET`, ses en-têtes, et l'ETag de
// la réponse, quel que soit le nom que le téléphone donne à son en-tête.
export function byCapacitor(request: (options: { url: string; method: "GET"; headers: Record<string, string> }) => Promise<AnswerNative>): Send {
  return async (address, headerFields) => {
    const { status, data, headers = {} } = await request({ url: address, method: "GET", headers: headerFields });
    const etag = Object.entries(headers).find(([name]) => name.toLowerCase() === "etag")?.[1];
    return { status, data: typeof data === "string" ? bodyRead(data) : data, ...(typeof etag === "string" && etag !== "" ? { etag } : {}) };
  };
}

class Refusal extends Error {
  readonly motif: Reason;
  constructor(motive: Reason) {
    super(motive.said);
    this.motif = motive;
  }
}

type Raw = Record<string, unknown>;
const object = (value: unknown): Raw | null => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Raw) : null);
const saysOf = (error: unknown) => (error instanceof Error ? error.message : String(error)).trim().split("\n")[0]?.replace(/[.\s]+$/, "") ?? "";

// La réponse de GitHub, ou le refus de la liste : `quoi` nomme ce qui était demandé.
function dataOf(answer: AnswerGitHub, what: string): unknown {
  if (answer.status === 200) return answer.data;
  return new Refusal({ reason: answer.status === 401 ? "oublie" : "inattendu", said: refusalOf(what, answer).message });
}

// Les projets du chef, lus dans les gists de ses stations. Lève un `Refus` quand GitHub refuse, une erreur quand il ne
// répond pas.
export async function readTheProjectsOfAccount(call: CallGitHub): Promise<ProjectOfAccount[]> {
  const gists: string[] = [];
  for (let page = 1; page <= PAGES_AT_MOST; page++) {
    const renderedOnes = dataOf(await call(`/gists?per_page=${BY_PAGE}&page=${page}`), "the list of your gists, where your stations keep your projects");
    if (renderedOnes instanceof Refusal) throw renderedOnes;
    if (!Array.isArray(renderedOnes)) throw new Refusal({ reason: "inattendu", said: "GitHub answered the list of your gists with something that is not a list, so your projects could not be read" });
    for (const gist of renderedOnes) {
      const files = object(object(gist)?.files);
      const id = object(gist)?.id;
      if (typeof id === "string" && files !== null && (FILE_PROJECTS in files || FILE_SELECTION in files)) gists.push(id);
    }
    if (renderedOnes.length < BY_PAGE) break;
  }
  const projects = new Map<string, ProjectOfAccount>();
  const add = (name: string, repository: string) => {
    const key = repository.toLowerCase();
    if (name !== "" && !projects.has(key)) projects.set(key, { nom: name, depot: repository });
  };
  const bySelection: string[] = [];
  for (const id of gists) {
    const answer = await call(`/gists/${encodeURIComponent(id)}`);
    // Supprimé entre la liste et sa lecture : il ne porte plus rien.
    if (answer.status === 404) continue;
    const gist = dataOf(answer, "a gist of your stations");
    if (gist instanceof Refusal) throw gist;
    const files = object(object(gist)?.files) ?? {};
    const content = (name: string) => {
      const text = object(files[name])?.content;
      return typeof text === "string" ? text : undefined;
    };
    for (const { nom: name, depot: repository } of readRequest(content(FILE_PROJECTS)) ?? []) add(name, repository);
    const selection = content(FILE_SELECTION);
    if (selection !== undefined) bySelection.push(...repositoriesSelected(selection));
  }
  // Un dépôt demandé sous un nom garde ce nom ; un dépôt choisi seulement prend celui que la station lui donne.
  for (const repository of bySelection) add(nameOfProject(repository), repository);
  return [...projects.values()].sort((a, b) => a.nom.localeCompare(b.nom) || a.depot.localeCompare(b.depot));
}

// Un projet du chef, tel que la barre le reçoit : son nom, son dépôt. Aucun dossier : rien n'est ouvert sur le téléphone.
const projectOf = ({ nom: name, depot: repository }: ProjectOfAccount): Project => ({ nom: name, dossier: "", depot: repository });

export function openTheReadGitHub(options: Options) {
  const { dire: tell } = options;
  const now = options.maintenant ?? (() => new Date());
  const schedule =
    options.planifier ??
    ((doIt, ms) => {
      const timer = setTimeout(doIt, ms);
      return () => clearTimeout(timer);
    });
  // Le seul chemin des demandes : l'API de GitHub. Les réponses gardées avec leur ETag, par dépôt — et une pour les gists.
  const call = clientGitHub({ jeton: options.jeton, envoyer: options.envoyer });
  const memories = new Map<string, MemoryOfReads>();
  const memory = (key: string): MemoryOfReads => memories.get(key) ?? memories.set(key, new Map()).get(key)!;
  const readTheGists = readConditional(call, memory(""));

  const facts = holdFacts();
  let projects: ProjectOfAccount[] = [...(options.connus ?? [])];
  // La dernière lecture réussie du rail de chaque projet, par son nom : c'est elle que visent les gestes du chef, comme
  // ceux du desktop (board/rail.ts, `dernier`).
  const last = new Map<string, BoardRead>();
  const home = holdHome({ projets: () => projects.map(({ nom: name }) => ({ nom: name, servi: true })) });
  let list: ListRead | undefined;
  // La trace du téléphone connecté (#3303, phone-connected.ts) : posée une fois par lancement, après une liste lue ;
  // ratée, elle se repose à la lecture suivante. Sans `ecrire`, rien ne part.
  let drawn = false;
  const setTheTraceOneTimes = async () => {
    if (drawn || options.ecrire === undefined) return;
    try {
      await setTheTrace({ client: clientOfThePriority({ jeton: options.jeton, appeler: readTheGists, envoyer: options.ecrire }), maintenant: now });
      drawn = true;
    } catch {
      // Rien de posé : la lecture suivante réessaie, et la liste des projets n'en dépend pas.
    }
  };
  // Les demandes de la vue : celle des faits (la barre), celle de l'écran affiché, les projets dont il lit `status`, et
  // celui dont l'espace est ouvert — ce qui est avant son rail se lit aussi.
  let factsRequest: number | undefined;
  let requestVue = 0;
  let seenOnes: string[] = [];

  const configuration = (): Shown => forTheBar({ chemin: "GitHub — the projects your stations serve", projets: projects.map(projectOf) }, () => true);
  const phone = (): PhoneGitHub => ({ github: { compte: options.compte ?? null }, ...(list === undefined ? {} : { liste: list }) });
  const tellTheHome = (seenOne: Home | undefined) => {
    if (seenOne !== undefined) tell("surAccueil", seenOne);
  };

  // La lecture du desktop pour un projet : son rail, puis ce qui attend le chef. Ne lève pas.
  async function readTheProject({ depot: repository }: ProjectOfAccount): Promise<ReadOfBoardOfRepository> {
    try {
      const readOne = await readTheBoardOfRepository({ depot: repository, appeler: call, memoire: memory(repository), maintenant: now });
      const reader = readConditional(call, memory(repository));
      // Les cartes du compte connecté, et celles d'un autre humain sous « Awaiting others », comme au desktop (#2985).
      return await withWhatAwaitingTheChef(readOne, reader, shareOfCardsAssigned({ appeler: reader, depot: repository, login: async () => options.compte ?? null }));
    } catch (error) {
      return { lu: false, depot: repository, luLe: now().toISOString(), raison: `The rail of ${repository} was not read from GitHub: ${saysOf(error)}.` };
    }
  }

  // Une lecture de la liste, puis du rail de chaque projet — ceux qu'elle a lus, ou les connus quand elle ne se lit pas.
  async function readAll(): Promise<void> {
    const a = now().toISOString();
    try {
      const readOnes = await readTheProjectsOfAccount(readTheGists);
      list = { a, lue: true };
      await setTheTraceOneTimes();
      if (JSON.stringify(readOnes) !== JSON.stringify(projects)) {
        projects = readOnes;
        options.garder?.(readOnes);
        tell("surConfiguration", configuration(), []);
        tellTheHome(home.relire());
      }
    } catch (error) {
      const motive: Reason = error instanceof Refusal ? error.motif : { reason: "injoignable", said: `GitHub could not be reached to list your projects: ${saysOf(error)}` };
      list = { a, lue: false, ...motive };
    }
    tell("surTelephone", phone());
    for (const project of projects) receive(project.nom, await readTheProject(project));
  }

  // Ce que le desktop fait d'une lecture du rail : `facts` pour la barre et le rail, `status` pour l'écran affiché, et ce
  // qui est avant le rail pour l'espace ouvert.
  function receive(project: string, readOne: ReadOfBoardOfRepository): void {
    if (readOne.lu) last.set(project, readOne);
    if (factsRequest !== undefined) {
      const reading = readOfBoard(readOne, project, factsRequest, [FACTS]);
      tell("surFaits", facts.recevoir(reading));
      tellTheHome(home.faits(reading));
    }
    if (seenOnes.includes(project)) {
      const shownOne = putAside(readOfBoard(readOne, project, requestVue, [STATUS]));
      const redraws = facts.attendre(shownOne);
      if (redraws !== undefined) tell("surFaits", redraws);
      tellTheHome(home.status(shownOne));
    }
  }

  // Une lecture à la fois : une demande qui arrive pendant l'une est servie juste après elle. La suivante part trente
  // secondes après la dernière.
  let inProgress: Promise<void> | undefined;
  let still = false;
  let cancel: (() => void) | undefined;
  function read(): Promise<void> {
    if (inProgress !== undefined) {
      still = true;
      return inProgress;
    }
    cancel?.();
    cancel = undefined;
    inProgress = (async () => {
      do {
        still = false;
        await readAll();
      } while (still);
    })().finally(() => {
      inProgress = undefined;
      cancel = schedule(() => void read(), INTERVAL_MS);
    });
    return inProgress;
  }

  // Les projets dont `status` est lu désormais : ce qui était tenu des autres est lâché, comme sur le desktop.
  function lookThe(readOnes: string[], request: number): Promise<void> {
    requestVue = request;
    seenOnes = readOnes;
    for (const redraws of facts.veiller(seenOnes)) tell("surFaits", redraws);
    tellTheHome(home.veiller(seenOnes));
    return read();
  }

  // Les gestes du chef, écrits sur GitHub avec le même jeton : rien ne part sans `ecrire`.
  const withoutWriting: SendGitHub = async () => {
    throw new Error("this phone has nothing to write to GitHub with");
  };
  const actions = openTheActionsGitHub({
    jeton: options.jeton,
    appeler: call,
    envoyer: options.ecrire ?? withoutWriting,
    depot: (project) => projects.find(({ nom: name }) => name === project)?.depot,
    dernier: (project) => last.get(project),
    chef: (project, ticket) => facts.chef(project, ticket),
    // La prochaine lecture va à GitHub tout de suite, et montre l'écriture.
    ecrit: () => void read(),
  });

  return {
    configuration,
    telephone: phone,
    gestes: actions,
    // La barre est posée : son rail est lu.
    faits(request: number): Promise<void> {
      factsRequest = request;
      return read();
    },
    tous: (request: number) => lookThe(projects.map(({ nom: name }) => name), request),
    regarder: (project: string, request: number) => lookThe([project], request),
    // « réessayer maintenant » : GitHub est relu tout de suite.
    relire: () => read(),
    // Un lien de la ligne d'un projet en lecture seule (ticket 3163) : la page, pour le seul dépôt que sa dernière lecture
    // dit en lecture seule — rien sinon.
    pageDeLaLectureSeule: (project: unknown, page: unknown): string | undefined => (typeof project === "string" ? pageOfFacts(last.get(project)?.faits, page) : undefined),
  };
}
