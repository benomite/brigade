// Ce que l'app demande à une station, et ce que la station en dit — le format
// est celui de la station. Deux fichiers de
// plus dans le gist de chaque station appairée (stations/document.ts) :
//   - `brigade-projets.json`, écrit par l'app seule : les projets que le chef
//     demande à cette station, et si elle en est la principale — celle qui fait
//     tourner son manager et sa pass ;
//   - `brigade-projets-suivi.json`, écrit par la station seule : où en est
//     chacun — servi, à autoriser sur GitHub (avec les pages où le faire), en
//     préparation, refusé (et pourquoi), ou secondaire — et où il cuit (`cuitSur`, `ici`), et où en
//     est son déménagement (`bascule`) ; et, pour chaque projet dont elle est la principale, où en
//     est son onboarding (`onboarding`, #1110).
// Un déménagement de sa cuisine ajoute à la demande `remise`, sur la
// station qu'il quitte, et `reprise`, sur celle qui le reprend : l'app les relit et les réécrit tels
// quels — sans eux, le déménagement en cours ne serait plus qu'un changement de principale.
// `fournit` : ce que la machine de la station sait faire en plus de coder, coché par le chef à son
// ajout (#1307), et ce que l'appairage de la station dit qu'elle fournit (#1757, stations/document.ts) ; la station
// le déclare à son journal, jamais dans le dépôt. Relu et réécrit tel quel.
// Aucune liaison directe entre l'app et la station : c'est tout ce qu'elles se disent.

export const FILE_PROJECTS = "brigade-projets.json";
export const FILE_TRACKING = "brigade-projets-suivi.json";
export const FORMAT = 1;

export type Calibrated = { modele: string; effort: string };

// Le fil entre l'app et les stations garde sa clé historique `principale` : la station dont le gist porte le suivi du
// projet (son onboarding, son refus, ses choix). L'app ne le lit et ne l'écrit que par ces deux gestes.
export const doorTheTracking = (project: Pick<ProjectRequest, "principale">): boolean => project.principale;
export const withTheTracking = (project: Omit<ProjectRequest, "principale">, tracking: boolean): ProjectRequest => ({ ...project, principale: tracking });

export type ProjectRequest = {
  nom: string;
  depot: string;
  base: string;
  principale: boolean;
  cooks: number;
  manager: Calibrated;
  reviewer: Calibrated;
  // Quand le chef a ouvert le parcours, et quand il l'a validé.
  ouvertLe: string | null;
  demandeLe: string | null;
  // Le déménagement en cours, vu de la station qu'il quitte (`remise`) ou de celle qui le reprend
  // (`reprise`) : l'autre station, son gist, l'instant de la demande. Écrits par le runtime seul.
  remise?: { vers: string; gist: string; demandeLe: string };
  reprise?: { de: string; gist: string; demandeLe: string };
  // Les capacités de la machine de cette station, en plus de coder (`navigateur-headless`, `android`…).
  fournit?: string[];
  // L'issue que le chef retient pour chaque besoin qui manque à la principale (#1400), par identifiant de choix :
  // `{ "need:postgres": "provide-here" }`. La station la pose à son journal à sa lecture suivante (#1398).
  choix?: Selections;
};

export type StateOfProject = "servi" | "a-autoriser" | "en-preparation" | "refuse" | "secondaire";
// Où en est un déménagement, vu d'une station : demandé, accepté
// par celle qui le reprend, refusé par elle, remis par celle qu'il quitte, reçu — fini.
export type StepOfToggle = "demandee" | "acceptee" | "refusee" | "remise" | "recue";
export type Toggle = { de: string; vers: string; demandeLe: string; etape: StepOfToggle };
// `cuitSur` : la station où il cuit, telle que celle-ci la connaît ; `ici` : il cuit sur celle-ci, et
// c'est l'ordinateur du chef. Une station d'avant le déménagement (#1094) n'en dit rien.
// `acces` : le dépôt refuse à la station de le récupérer ou d'y pousser, avec le geste qui le lève
// (#1117) ; `worktree` : sa cuisine ne parvient pas à préparer un
// worktree, avec la raison et l'heure du prochain essai (#1118).
// Absents quand la station n'en dit rien.
// `depot`, `base`, `cooks` : ce que la station sert du projet — son dépôt, sa branche d'intégration et son
// plafond de cooks —, d'où l'app reprend ce qu'une station de plus doit servir ; nuls quand elle n'en dit rien.
export type AccessBlocked = { bloque: "fetch" | "push"; raison: string; geste: string };
export type FailureOfWorktree = { ticket: number; raison: string; prochainEssai: string | null; acces: AccessBlocked | null };
// `clone` : la station ne parvient pas à cloner le dépôt (#1390) —
// la cause en une phrase, le geste, où le faire, ses pages GitHub, le compte GitHub de la station, ce que
// gh et git ont dit (`detail`, que la page ne montre que derrière « details ») et l'écart entre deux essais,
// en secondes. Absent quand le clone n'échoue pas, ou d'une station d'avant #1390.
export type FailureOfClone = { cause: string; raison: string; geste: string; ou: string; liens: string[]; compte: string | null; detail: string; reessaieToutesLes: number };
// `refus` : pourquoi la station ne sert pas le projet, pour le chef (#1177) — un code stable, une phrase, et ce
// que le chef fait. Absent quand rien n'est refusé.
export type Refusal = { code: string; message: string; action: string };
// `blocages` : ce qui bloque le projet, de son ajout à son service (#1394) —
// pour chacun, une clé stable, ce qui est bloqué et pourquoi en une phrase chacun, et, s'il y a lieu, le geste que
// l'app sait faire (`action`, son identifiant), la page de GitHub où le faire hors de l'app (`link`) et ce qu'une
// commande a dit (`detail`, que la page ne montre que replié). Absent quand rien ne bloque, ou d'une station d'avant #1394.
export type Blockage = { id: string; message: string; cause: string; action?: string; link?: string; detail?: string };
// `choix` : ce qui manque à la principale pour les tests du projet, un choix par besoin (#1398) —
// sa clé (`need:<besoin>`, celle du blocage qui l'attend), le besoin, ce qui
// manque et pourquoi en une phrase chacun, ses issues (chacune son libellé et ce qui en suit), et s'il attend le
// chef (`pending`) ou s'il est tranché (`chosen`, l'issue retenue). Absent quand rien ne manque, ou d'une station
// d'avant #1398.
// `recommended` : posé (vrai) par la station seulement quand elle conseille cette issue (#1534).
export type OptionOfChoice = { id: string; label: string; consequence: string; recommended?: true };
export type Choice = { id: string; need: string; message: string; cause: string; options: OptionOfChoice[] } & ({ status: "pending" } | { status: "chosen"; selected: string; selectedAt: string });
// Ce que le chef retient, par identifiant de choix.
export type Selections = Record<string, string>;
// Le temps de l'ajout du projet à son premier ticket servi (#1401) : `ajouteLe` (ISO),
// `serviLe` (ISO, ou null tant qu'aucun ticket n'est servi) et `duree` (millisecondes, figée, ou null).
export type Delay = { ajouteLe: string; serviLe: string | null; duree: number | null };
// Les temps des derniers tickets mesurés du projet, tels que sa principale les lit dans `.claude/brigade/` (#2346) :
// les enregistrements (secondes entières ; la vue écarte les illisibles) et le seuil du temps
// perdu par ticket en minutes (`lostTimeMaxMin`, #2670 : la médiane du temps perdu des tickets récents ; le temps total n'a pas de plafond).
// `resume` : le résumé que la mesure écrit dans `temps-tickets.json` (#2659), relayé tel quel — la vue ne le recalcule pas.
// `passe` : le temps de chaque phase de la pass sur 7 jours (#3512), relayé tel quel.
// `chiffres` : les quatre chiffres du projet que la station publie (#2672), relayés tels quels.
export type TimePublished = { enregistrements: unknown[]; lostTimeMaxMin: number; resume?: unknown; chiffres?: unknown; passe?: unknown };
// `secondaires` : les stations que l'app appaire au projet en plus de sa principale, telles que la principale les
// tient (#1756 ; plus publiées depuis #2713) — déclarées à son journal, chacune par son gist, avec ce qu'elle
// fournit, si elle est atteinte, et pourquoi en une phrase — pas atteinte, le geste du chef qui y remédie (`geste`, #1758). Seule la principale les publie ; absentes sans elles.
export type SecondaryHeld = { nom: string; station: string; gist: string; cooks: number; fournit: string[]; atteinte: boolean; dit: string; geste?: string };
// `rejoindre` : le chef a ajouté le projet à cette station alors qu'une autre le servait déjà (#1789 ;
// plus écrit depuis #2713) — elle en a rejoint la cuisine, celle que `principale` fait tourner, ou elle refuse
// en une phrase (`phrase`), sans en ouvrir une seconde. Absent quand aucune autre station ne le sert.
export type Join = { issue: "rejointe"; principale: string } | { issue: "refusee"; phrase: string };
export type TrackingOfProject = { nom: string; etat: StateOfProject; dit: string; autoriser: string[]; serviLe: string | null; cuitSur: string | null; ici: boolean; bascule: Toggle | null; acces: AccessBlocked | null; refus: Refusal | null; worktree: FailureOfWorktree | null; clone?: FailureOfClone; blocages?: Blockage[]; delai?: Delay; temps?: TimePublished; choix?: Choice[]; secondaires?: SecondaryHeld[]; rejoindre?: Join; depot: string | null; base: string | null; cooks: number | null };

const STATES: readonly string[] = ["servi", "a-autoriser", "en-preparation", "refuse", "secondaire"];
const STEPS: readonly string[] = ["demandee", "acceptee", "refusee", "remise", "recue"];
const text = (value: unknown): value is string => typeof value === "string";
const date = (value: unknown): string | null => (text(value) && !Number.isNaN(Date.parse(value)) ? value : null);
const nameOfStation = (value: unknown): value is string => text(value) && value.trim() !== "" && value.length <= 100;
// Une capacité, telle que la station la lit (`CAPACITE`).
export const CAPACITY = /^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u;
// Les capacités lisibles, chacune une fois : la station ignore les autres.
export const capacitiesRead = (readEntries: unknown): string[] =>
  Array.isArray(readEntries) ? [...new Set(readEntries.filter((readEntry): readEntry is string => text(readEntry) && readEntry.length <= 60 && CAPACITY.test(readEntry.trim())).map((readEntry) => readEntry.trim().normalize("NFC")))] : [];
const gist = (value: unknown): value is string => text(value) && /^[A-Za-z0-9]{1,64}$/.test(value);
const readAccess = (readOne: unknown): AccessBlocked | null => {
  const { bloque: blocked, raison: reason, geste: action } = (readOne ?? {}) as Record<string, unknown>;
  return (blocked === "fetch" || blocked === "push") && text(reason) && reason.trim() !== "" && text(action) && action.trim() !== "" ? { bloque: blocked, raison: reason, geste: action } : null;
};
const readRefusal = (readOne: unknown): Refusal | null => {
  const { code, message, action } = (readOne ?? {}) as Record<string, unknown>;
  return text(code) && text(message) && message.trim() !== "" && text(action) && action.trim() !== "" ? { code, message, action } : null;
};
const readFailure = (readOne: unknown): FailureOfWorktree | null => {
  const { ticket, raison: reason, prochainEssai: nextTrial, acces: access } = (readOne ?? {}) as Record<string, unknown>;
  if (typeof ticket !== "number" || !Number.isInteger(ticket) || ticket <= 0 || !text(reason) || reason.trim() === "") return null;
  return { ticket, raison: reason, prochainEssai: date(nextTrial), acces: readAccess(access) };
};
const readClone = (readOne: unknown): FailureOfClone | null => {
  const { cause, raison: reason, geste: action, ou: or, liens: links, compte: account, detail, reessaieToutesLes: reessaieAllThe } = (readOne ?? {}) as Record<string, unknown>;
  if (!text(cause) || !text(reason) || reason.trim() === "" || !text(action) || action.trim() === "") return null;
  return {
    cause,
    raison: reason,
    geste: action,
    ou: text(or) ? or : "",
    // Seules des pages de GitHub s'ouvrent d'un geste.
    liens: Array.isArray(links) ? links.filter((url): url is string => text(url) && /^https:\/\/github\.com\//.test(url)) : [],
    compte: text(account) && account.trim() !== "" ? account : null,
    detail: text(detail) ? detail : "",
    reessaieToutesLes: typeof reessaieAllThe === "number" && Number.isFinite(reessaieAllThe) && reessaieAllThe > 0 ? reessaieAllThe : 30,
  };
};
// Un blocage illisible — sans clé, sans message ou sans cause — n'est pas montré. Comme partout dans l'app, seule
// une page de GitHub s'ouvre d'un geste : un autre lien est oublié, le blocage reste.
const readOneBlockage = (readOne: unknown): Blockage[] => {
  const { id, message, cause, action, link, detail } = (readOne ?? {}) as Record<string, unknown>;
  if (!text(id) || id.trim() === "" || !text(message) || message.trim() === "" || !text(cause) || cause.trim() === "") return [];
  return [
    {
      id,
      message,
      cause,
      ...(text(action) && /^[a-z0-9][a-z0-9.:_-]{0,79}$/.test(action) ? { action } : {}),
      ...(text(link) && /^https:\/\/github\.com\/\S*$/.test(link) ? { link } : {}),
      ...(text(detail) && detail.trim() !== "" ? { detail } : {}),
    },
  ];
};
// Un choix illisible — sans clé, sans phrase, sans issue lisible — n'est pas montré ; une issue illisible non plus.
const sentence = (value: unknown): value is string => text(value) && value.trim() !== "";
const readOneOption = (readOne: unknown): OptionOfChoice[] => {
  const { id, label, consequence, recommended } = (readOne ?? {}) as Record<string, unknown>;
  return sentence(id) && sentence(label) && sentence(consequence) ? [{ id, label, consequence, ...(recommended === true ? { recommended } : {}) }] : [];
};
const readOneChoice = (readOne: unknown): Choice[] => {
  const { id, need, message, cause, options, status, selected, selectedAt } = (readOne ?? {}) as Record<string, unknown>;
  const issues = Array.isArray(options) ? options.flatMap(readOneOption) : [];
  if (!sentence(id) || !sentence(need) || !sentence(message) || !sentence(cause) || issues.length === 0) return [];
  if (status === "pending") return [{ id, need, message, cause, options: issues, status }];
  if (status === "chosen" && sentence(selected)) return [{ id, need, message, cause, options: issues, status, selected, selectedAt: date(selectedAt) ?? "" }];
  return [];
};
// Les sélections que l'app a écrites, relues telles quelles : une clé et une issue, en texte.
const readSelections = (readOne: unknown): Selections => (readOne === null || typeof readOne !== "object" || Array.isArray(readOne) ? {} : Object.fromEntries(Object.entries(readOne as Record<string, unknown>).filter((entry): entry is [string, string] => sentence(entry[0]) && sentence(entry[1]))));
const calibrated = (readOne: unknown): Calibrated => {
  const { modele: model, effort } = (readOne ?? {}) as Record<string, unknown>;
  return { modele: text(model) ? model : "", effort: text(effort) ? effort : "" };
};

// Le fichier que l'app écrit dans le gist d'une station.
export function documentOfRequest(projects: readonly ProjectRequest[]): string {
  return `${JSON.stringify({ brigade: "projets", format: FORMAT, projets: projects }, null, 2)}\n`;
}

// Ce que l'app a écrit dans le gist d'une station, relu. Absent : rien de
// demandé. Illisible : null — l'app ne le réécrit pas sans le dire.
export function readRequest(raw: string | undefined): ProjectRequest[] | null {
  if (raw === undefined) return [];
  let readOne: { brigade?: unknown; projets?: unknown };
  try {
    readOne = JSON.parse(raw) as typeof readOne;
  } catch {
    return null;
  }
  if (readOne === null || typeof readOne !== "object" || readOne.brigade !== "projets" || !Array.isArray(readOne.projets)) return null;
  return (readOne.projets as unknown[]).flatMap((raw) => {
    const { nom: name, depot: repository, base, principale: main, cooks, fournit: provides, manager, reviewer, ouvertLe: openThe, demandeLe: requestThe, remise: putBackOne, reprise: resumption, choix: choice } = (raw ?? {}) as Record<string, unknown>;
    if (!text(name) || !text(repository) || !text(base)) return [];
    const capacities = capacitiesRead(provides);
    const thePutBack = (putBackOne ?? {}) as Record<string, unknown>;
    const theResumption = (resumption ?? {}) as Record<string, unknown>;
    const selections = readSelections(choice);
    return [
      {
        nom: name,
        depot: repository,
        base,
        principale: main === true,
        cooks: typeof cooks === "number" ? cooks : 0,
        manager: calibrated(manager),
        reviewer: calibrated(reviewer),
        ouvertLe: date(openThe),
        demandeLe: date(requestThe),
        ...(nameOfStation(thePutBack.vers) && gist(thePutBack.gist) && date(thePutBack.demandeLe) !== null ? { remise: { vers: thePutBack.vers, gist: thePutBack.gist, demandeLe: thePutBack.demandeLe as string } } : {}),
        ...(nameOfStation(theResumption.de) && gist(theResumption.gist) && date(theResumption.demandeLe) !== null ? { reprise: { de: theResumption.de, gist: theResumption.gist, demandeLe: theResumption.demandeLe as string } } : {}),
        ...(capacities.length === 0 ? {} : { fournit: capacities }),
        // Réécrites telles quelles par tout autre geste : sans elles, la station oublierait ce que le chef a choisi.
        ...(Object.keys(selections).length === 0 ? {} : { choix: selections }),
      },
    ];
  });
}

// Une station secondaire illisible — sans gist, sans nom, sans phrase — n'est pas montrée.
const readOneSecondary = (readEntry: unknown): SecondaryHeld[] => {
  const { nom: name, station, gist: itsOwn, cooks, fournit: provides, atteinte: reached, dit: said, geste: action } = (readEntry ?? {}) as Record<string, unknown>;
  if (!nameOfStation(name) || !text(station) || !gist(itsOwn) || typeof reached !== "boolean" || !sentence(said)) return [];
  return [{ nom: name, station, gist: itsOwn, cooks: typeof cooks === "number" && Number.isSafeInteger(cooks) && cooks >= 1 ? cooks : 0, fournit: capacitiesRead(provides), atteinte: reached, dit: said, ...(sentence(action) ? { geste: action } : {}) }];
};

// Une cuisine rejointe sans le nom de sa principale, ou un refus sans sa phrase, n'est pas montré.
const readJoin = (readOne: unknown): Join | null => {
  const { issue, principale: main, phrase: saidOne } = (readOne ?? {}) as Record<string, unknown>;
  if (issue === "rejointe" && nameOfStation(main)) return { issue, principale: main };
  if (issue === "refusee" && sentence(saidOne)) return { issue, phrase: saidOne };
  return null;
};

// Le délai publié d'un projet : l'instant d'ajout, et, servi, l'instant et la durée figée. Illisible : rien.
function readDelay(readOne: unknown): Delay | null {
  const { ajouteLe: addsThe, serviLe: servedAt, duree: duration } = (readOne ?? {}) as Record<string, unknown>;
  const adds = date(addsThe);
  if (adds === null) return null;
  const served = date(servedAt);
  return served !== null && typeof duration === "number" && Number.isFinite(duration) && duration >= 0 ? { ajouteLe: adds, serviLe: served, duree: duration } : { ajouteLe: adds, serviLe: null, duree: null };
}

// Les temps publiés d'un projet. Absents ou illisibles : rien — la vue dit alors que la station ne les publie pas.
function readTime(readOne: unknown): TimePublished | null {
  const { enregistrements, lostTimeMaxMin, resume, chiffres: figures, passe: pass } = (readOne ?? {}) as Record<string, unknown>;
  const withFigures = Array.isArray(figures);
  const withResume = typeof resume === "object" && resume !== null;
  const withPass = typeof pass === "object" && pass !== null;
  if (!Array.isArray(enregistrements) && !withResume && !withFigures && !withPass) return null;
  return {
    enregistrements: Array.isArray(enregistrements) ? enregistrements : [],
    lostTimeMaxMin: typeof lostTimeMaxMin === "number" && Number.isFinite(lostTimeMaxMin) && lostTimeMaxMin > 0 ? lostTimeMaxMin : 2,
    ...(withResume ? { resume } : {}),
    ...(withFigures ? { chiffres: figures } : {}),
    ...(withPass ? { passe: pass } : {}),
  };
}

// Ce que la station a écrit de ses projets demandés. Absent ou illisible : rien encore.
export function readTracking(raw: string | undefined): TrackingOfProject[] {
  if (raw === undefined) return [];
  try {
    const readOne = JSON.parse(raw) as { brigade?: unknown; projets?: unknown };
    if (readOne?.brigade !== "projets-suivi" || !Array.isArray(readOne.projets)) return [];
    return (readOne.projets as unknown[]).flatMap((raw) => {
      const { nom: name, etat: state, dit: said, autoriser: allow, serviLe: servedAt, cuitSur: cookedOn, ici: here, bascule: toggle, acces: access, refus: refusal, worktree, clone, blocages: blockages, delai: delay, temps: time, choix: choice, secondaires: secondary, rejoindre: join, depot: repository, base, cooks } = (raw ?? {}) as Record<string, unknown>;
      if (!text(name) || !text(state) || !STATES.includes(state)) return [];
      const failureOfClone = readClone(clone);
      const theBlockages = Array.isArray(blockages) ? blockages.flatMap(readOneBlockage) : [];
      const theDelay = readDelay(delay);
      const theTime = readTime(time);
      const theChoice = Array.isArray(choice) ? choice.flatMap(readOneChoice) : [];
      const theSecondary = Array.isArray(secondary) ? secondary.flatMap(readOneSecondary) : [];
      const theJunction = readJoin(join);
      return [
        {
          nom: name,
          etat: state as StateOfProject,
          dit: text(said) ? said : "",
          autoriser: Array.isArray(allow) ? allow.filter((url): url is string => text(url) && /^https:\/\/github\.com\//.test(url)) : [],
          serviLe: date(servedAt),
          cuitSur: nameOfStation(cookedOn) ? cookedOn : null,
          ici: here === true,
          bascule: readToggle(toggle),
          acces: readAccess(access),
          refus: readRefusal(refusal),
          worktree: readFailure(worktree),
          ...(failureOfClone === null ? {} : { clone: failureOfClone }),
          ...(theBlockages.length === 0 ? {} : { blocages: theBlockages }),
          ...(theDelay === null ? {} : { delai: theDelay }),
          ...(theTime === null ? {} : { temps: theTime }),
          ...(theChoice.length === 0 ? {} : { choix: theChoice }),
          ...(theSecondary.length === 0 ? {} : { secondaires: theSecondary }),
          ...(theJunction === null ? {} : { rejoindre: theJunction }),
          depot: text(repository) && repository.trim() !== "" ? repository.trim() : null,
          base: text(base) && base.trim() !== "" ? base.trim() : null,
          cooks: typeof cooks === "number" && Number.isSafeInteger(cooks) && cooks >= 1 ? cooks : null,
        },
      ];
    });
  } catch {
    return [];
  }
}

// Où en est un projet neuf, de son ajout à son premier ticket (#1110,
// `Onboarding`) : la station principale l'écrit dans son suivi, sous `onboarding`, par nom de projet.
// Quatre étapes dans l'ordre, chacune faite, courante ou à venir, avec sa phrase et, courante, le
// geste attendu du chef ; le ticket qui prépare le dépôt, son état, et, en échec, pourquoi et quand
// il repart. L'app n'en ouvre que des pages de GitHub.
export type StateOfStep = "faite" | "courante" | "a-venir";
export type ActionOfOnboarding = { quoi: string; ou: string; liens: string[] };
export type StepOfOnboarding = { etape: string; titre: string; etat: StateOfStep; dit: string; geste: ActionOfOnboarding | null };
export type StateOfPreparation = "en-cours" | "en-echec" | "a-relire" | "suspendu" | "faite" | "abandonne";
export type PreparationOfRepository = { ticket: number; url: string; etat: StateOfPreparation; raison: string | null; prochainEssai: string | null; pr: string | null };
export type Onboarding = { etat: "en-cours" | "pret"; termine: boolean; courante: string | null; etapes: StepOfOnboarding[]; preparation: PreparationOfRepository | null; sansBacASable: boolean | null; decisionAttendue: boolean };

const STATES_OF_STEP: readonly string[] = ["faite", "courante", "a-venir"];
const STATES_OF_PREPARATION: readonly string[] = ["en-cours", "en-echec", "a-relire", "suspendu", "faite", "abandonne"];
const pageGitHub = (value: unknown): value is string => text(value) && /^https:\/\/github\.com\//.test(value);

function readAction(readOne: unknown): ActionOfOnboarding | null {
  if (readOne === null || typeof readOne !== "object") return null;
  const { quoi: what, ou: or, liens: links } = readOne as Record<string, unknown>;
  if (!text(what) || what.trim() === "") return null;
  return { quoi: what, ou: text(or) ? or : "", liens: Array.isArray(links) ? links.filter(pageGitHub) : [] };
}

function readPreparation(readEntry: unknown): PreparationOfRepository | null {
  if (readEntry === null || typeof readEntry !== "object") return null;
  const { ticket, url, etat: state, raison: reason, prochainEssai: nextTrial, pr } = readEntry as Record<string, unknown>;
  if (typeof ticket !== "number" || !Number.isInteger(ticket) || ticket <= 0 || !pageGitHub(url) || !text(state) || !STATES_OF_PREPARATION.includes(state)) return null;
  return { ticket, url, etat: state as StateOfPreparation, raison: text(reason) && reason !== "" ? reason : null, prochainEssai: date(nextTrial), pr: pageGitHub(pr) ? pr : null };
}

function readOneOnboarding(readOne: unknown): Onboarding | null {
  if (readOne === null || typeof readOne !== "object") return null;
  const { etat: state, termine: finished, courante: current, etapes: steps, preparation, sansBacASable: withoutSandbox, decisionAttendue: decisionExpected } = readOne as Record<string, unknown>;
  if ((state !== "en-cours" && state !== "pret") || !Array.isArray(steps)) return null;
  const readEntries = steps.flatMap((raw): StepOfOnboarding[] => {
    const { etape: step, titre: title, etat: itsOwn, dit: said, geste: action } = (raw ?? {}) as Record<string, unknown>;
    if (!text(step) || !text(title) || !text(itsOwn) || !STATES_OF_STEP.includes(itsOwn)) return [];
    return [{ etape: step, titre: title, etat: itsOwn as StateOfStep, dit: text(said) ? said : "", geste: readAction(action) }];
  });
  if (readEntries.length === 0) return null;
  return { etat: state as Onboarding["etat"], termine: finished === true, courante: text(current) ? current : null, etapes: readEntries, preparation: readPreparation(preparation), sansBacASable: typeof withoutSandbox === "boolean" ? withoutSandbox : null, decisionAttendue: decisionExpected === true };
}

// L'onboarding de chaque projet dont la station est la principale, par son nom. Absent, illisible,
// ou d'une station d'avant #1110 : rien.
export function readOnboarding(raw: string | undefined): Record<string, Onboarding> {
  if (raw === undefined) return {};
  try {
    const readOne = JSON.parse(raw) as { brigade?: unknown; onboarding?: unknown };
    if (readOne?.brigade !== "projets-suivi" || readOne.onboarding === null || typeof readOne.onboarding !== "object" || Array.isArray(readOne.onboarding)) return {};
    return Object.fromEntries(
      Object.entries(readOne.onboarding as Record<string, unknown>).flatMap(([name, oneOf]): [string, Onboarding][] => {
        const onboarding = readOneOnboarding(oneOf);
        return onboarding === null ? [] : [[name, onboarding]];
      }),
    );
  } catch {
    return {};
  }
}

// Ce qu'une station dit d'un déménagement, ou null.
export function readToggle(readEntry: unknown): Toggle | null {
  const { de: of, vers: to, demandeLe: requestThe, etape: step } = (readEntry ?? {}) as Record<string, unknown>;
  return nameOfStation(of) && nameOfStation(to) && date(requestThe) !== null && text(step) && STEPS.includes(step) ? { de: of, vers: to, demandeLe: requestThe as string, etape: step as StepOfToggle } : null;
}
