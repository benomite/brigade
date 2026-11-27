// Les stations du chef sur la home : celles qu'il a appairées, lues sur GitHub
// toutes les trente secondes, chacune en une ligne — « online · version X · no
// project », ou « offline for 4 min · … ». Le gist d'une station reste quand
// elle s'éteint : elle passe hors ligne, elle ne quitte pas la liste. Une
// lecture ratée garde la liste d'avant, et dit pourquoi elle n'est pas fraîche.
//
// L'appairage : le chef tape le code que la station affiche. L'app cherche,
// parmi les gists de station du compte, celui qui publie l'empreinte de ce
// code, et y écrit l'appairage — la station le lit à son signe de vie suivant.
// Un code mal formé, inconnu ou échu est refusé en une ligne, et rien n'est écrit.
import type { PublishedConnection } from "../outages/states.ts";
import { capacitiesRead } from "../projects/request.ts";
import { outagesOf, type Outage } from "../outages/outages.ts";
import { documentOfPairing, fingerprint, FILE_PAIRING, FILE_STATION, readPairing, readDocument, normalize, type DocumentPairing, type DocumentStation } from "./document.ts";
import { followTheVersions, type VersionsViews } from "./versions.ts";
import type { GistOfStation, GitHubOfStations } from "./github.ts";

export type StateOfStation = "en-ligne" | "hors-ligne" | "illisible";
// Une station telle que la home la montre. `id` : son gist. `pannes` : chacune en une ligne, avec
// son bouton (outages/outages.ts) — sans celles que le chef a écartées. `cuisine` : faux d'un téléphone, qui ne fait tourner aucun cook ; `coeurs` : ceux de sa machine,
// quand elle les publie. Et, pour la liste de l'accueil (home.ts), ce que la ligne dit déjà, en
// morceaux : `dit`, son état en quelques mots
// (« online », « offline for 12 min ») ; sa `version` ; les `projets` qu'elle porte ; sa connexion Max
// telle qu'elle la publie — nulle quand elle n'en dit rien, ou qu'elle se tait ; `versionDit`, sa ligne de
// mise à jour (`ligneDeVersion`), vide quand il n'y a rien à en dire. `fournit` : ce que son appairage
// dit qu'elle fournit (document.ts, #1757) — absent quand il n'en dit rien.
export type StationVue = { id: string; nom: string; machine: string; coeurs?: number; cuisine?: false; fournit?: string[]; etat: StateOfStation; ligne: string; pannes: Outage[]; dit: string; version: string; projets: string[]; max: PublishedConnection["etat"] | null; maxDepuis?: string | null; versionDit?: string };
// `sans` : pourquoi la dernière lecture n'a pas abouti — la liste est alors celle d'avant.
// `limite` : c'est GitHub qui limite les appels du compte, et `reprise`, l'heure où il les rend —
// nulle quand il ne l'a pas dite.
export type SeenOfStations = { a: string; stations: StationVue[]; sans?: string; limite?: { reprise: string | null } };
// `detail` : ce que GitHub a répondu, quand c'est lui qui a manqué — il se lit au survol, jamais à plat.
export type RemovalOfStation = { retiree: string } | { refus: string; detail?: string };
export type Pairing = { appairee: string } | { refus: string; detail?: string };

// Entre deux lectures de GitHub.
export const CADENCE_MS = 30_000;

// La station est dite hors ligne quand elle a manqué deux signes de vie : à
// la minute près, sans qu'un signe en retard de quelques secondes ne la fasse
// clignoter.
export const outsideLineAfter = (cadenceMs: number) => 2 * cadenceMs + 30_000;

// Une durée, telle que la ligne la dit.
export function duration(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return "less than a minute";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return minutes % 60 === 0 ? `${hours} h` : `${hours} h ${String(minutes % 60).padStart(2, "0")}`;
  return `${Math.floor(hours / 24)} days`;
}

export const projectsOf = (projects: readonly string[]) => (projects.length === 0 ? "no project" : `${projects.length} project${projects.length > 1 ? "s" : ""}: ${projects.join(", ")}`);

// L'état d'une station, à cet instant, en quelques mots : « online », ou depuis quand elle ne l'est plus.
export function stateOf(document: DocumentStation, now: number): { etat: StateOfStation; dit: string } {
  const sign = Date.parse(document.signeDeVie);
  const stopped = document.arreteeLe === null ? null : Date.parse(document.arreteeLe);
  const since = stopped !== null && stopped >= sign ? stopped : now - sign > outsideLineAfter(document.cadenceMs) ? sign : null;
  return since === null ? { etat: "en-ligne", dit: "online" } : { etat: "hors-ligne", dit: `offline for ${duration(now - since)}` };
}

// La ligne de mise à jour de la page d'une station : « up to date · on this version for 3 days ».
// Une station hors ligne n'est dite à jour de rien ; une mise à jour ratée est déjà dite par sa
// panne (outages.ts) : la ligne ne la répète pas, et ne dit pas « up to date » par-dessus.
// `depuisLe` : l'instant où l'app a vu la station passer à cette version (`versions.ts`) — la
// station ne publie pas cette date ; sans elle, la ligne ne dit pas depuis quand.
export function lineOfVersion(document: DocumentStation, now: number, sinceThe: string | null = null): string {
  if (stateOf(document, now).etat !== "en-ligne") return "";
  const since = sinceThe === null ? "" : `on this version for ${duration(now - Date.parse(sinceThe))}`;
  return document.miseAJour === null ? ["up to date", since].filter((piece) => piece !== "").join(" · ") : since;
}

// La ligne d'une station, à cet instant.
export function lineOf(document: DocumentStation, now: number): { etat: StateOfStation; ligne: string } {
  const { etat: state, dit: said } = stateOf(document, now);
  return { etat: state, ligne: `${said} · version ${document.version} · ${projectsOf(document.projets)}` };
}

// Ce que `gh` répond quand GitHub limite les appels du compte (« API rate limit exceeded… »).
export const LIMIT = /rate limit/i;

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export type OptionsStations = {
  github: GitHubOfStations;
  surLecture: (seenOne: SeenOfStations) => void;
  cadenceMs?: number;
  maintenant?: () => number;
  // Ce que l'app a vu des versions de chaque station, d'un lancement à l'autre (versions.ts).
  versions?: VersionsViews;
};

export type Stations = {
  vu(): SeenOfStations | undefined;
  relire(): Promise<SeenOfStations>;
  // `fournit` : ce que la station fournit, quand l'app de sa machine l'appaire — l'appairage le porte.
  appairer(tape: unknown, provides?: readonly string[]): Promise<Pairing>;
  // Réécrit ce que l'appairage d'une station dit qu'elle fournit, s'il en dit autre chose — la station de cet
  // ordinateur, appairée avant que l'app ne l'y écrive. Rend vrai quand il a été réécrit.
  tenirCeQuElleFournit(id: string, provides: readonly string[]): Promise<boolean>;
  // Écarte une panne de la ligne d'une station : elle n'y revient pas, tant que l'app est ouverte.
  ecarter(id: string, key: string): SeenOfStations | undefined;
  // Retire la station de l'app : son appairage est ôté de son gist, elle n'est plus lue ni listée.
  // La station elle-même n'est pas touchée : un code neuf l'appaire de nouveau.
  retirer(id: unknown): Promise<RemovalOfStation>;
  fermer(): void;
};

export function holdStations(options: OptionsStations): Stations {
  const { github } = options;
  const now = options.maintenant ?? Date.now;
  // Ce que chaque gist appairé disait à sa dernière lecture, et quand GitHub l'a changé.
  const readOnes = new Map<string, { misAJour: string; document: DocumentStation | { illisible: string }; appairage: DocumentPairing | null }>();
  let seenOne: SeenOfStations | undefined;
  let inProgress: Promise<SeenOfStations> | undefined;
  // Les pannes écartées : `<gist> <clé>`.
  const ecartees = new Set<string>();
  const versions = followTheVersions(options.versions);

  const show = (without?: string, limit?: SeenOfStations["limite"]): SeenOfStations => {
    const instant = now();
    const stations = [...readOnes].map(([id, { document, appairage: pairing }]): StationVue =>
      "illisible" in document
        ? { id, nom: id, machine: "", etat: "illisible", ligne: `unreadable: ${document.illisible}`, pannes: [], dit: "unreadable", version: "", projets: [], max: null, versionDit: "" }
        : {
            id,
            nom: document.nom,
            machine: document.machine,
            ...(document.cuisine === false ? { cuisine: false as const } : {}),
            ...(document.coeurs === undefined ? {} : { coeurs: document.coeurs }),
            ...(pairing?.fournit === undefined ? {} : { fournit: pairing.fournit }),
            ...lineOf(document, instant),
            pannes: outagesOf(document, instant).filter(({ cle: key }) => !ecartees.has(`${id} ${key}`)),
            dit: stateOf(document, instant).dit,
            version: document.version,
            projets: document.projets,
            // Une station qui se tait ne dit plus sa connexion : ce qu'elle en a publié avant n'est plus sûr.
            max: stateOf(document, instant).etat === "en-ligne" ? (document.connexionMax?.etat ?? null) : null,
            maxDepuis: stateOf(document, instant).etat === "en-ligne" ? (document.connexionMax?.depuis ?? null) : null,
            versionDit: lineOfVersion(document, instant, versions.vue(id, document.version, instant)),
          },
    );
    stations.sort((a, b) => a.nom.localeCompare(b.nom) || a.id.localeCompare(b.id));
    seenOne = { a: new Date(instant).toISOString(), stations, ...(without === undefined ? {} : { sans: without }), ...(limit === undefined ? {} : { limite: limit }) };
    options.surLecture(seenOne);
    return seenOne;
  };

  const readGist = async (gist: GistOfStation) => {
    const before = readOnes.get(gist.id);
    if (before !== undefined && before.misAJour === gist.misAJour && gist.misAJour !== "") return before;
    const files = await github.lire(gist.id);
    if (files === null) return undefined;
    const raw = files[FILE_STATION];
    return { misAJour: gist.misAJour, document: raw === undefined ? { illisible: "its gist no longer holds its state" } : readDocument(raw), appairage: readPairing(files[FILE_PAIRING]) };
  };

  const read = async (): Promise<SeenOfStations> => {
    try {
      const paired = (await github.lister()).filter(({ appairee: pairedOne }) => pairedOne);
      const rereadOnes = await Promise.all(paired.map(async (gist) => [gist.id, await readGist(gist)] as const));
      readOnes.clear();
      for (const [id, readOne] of rereadOnes) if (readOne !== undefined) readOnes.set(id, readOne);
      return show();
    } catch (error) {
      const without = `your stations could not be read on GitHub — ${message(error)}`;
      // GitHub limite les appels du compte : l'heure où il les rend se lit sans en dépenser un.
      if (!LIMIT.test(without)) return show(without);
      return show(without, { reprise: (await github.reprise?.().catch(() => null)) ?? null });
    }
  };

  const reread = () => {
    inProgress ??= read().finally(() => (inProgress = undefined));
    return inProgress;
  };

  const pair = async (tape: unknown, provides: readonly string[] = []): Promise<Pairing> => {
    const said = typeof tape === "string" ? tape.trim() : "";
    const code = normalize(said);
    if (code === null) return { refus: `“${said.slice(0, 20)}” is not a pairing code: the station shows 8 letters and digits, like 7KQ2-M9XD` };
    const searched = fingerprint(code);
    let name: string;
    try {
      const candidates = (await github.lister()).filter(({ appairee: pairedOne }) => !pairedOne);
      const documents = await Promise.all(
        candidates.map(async ({ id }) => {
          const raw = (await github.lire(id))?.[FILE_STATION];
          const document = raw === undefined ? undefined : readDocument(raw);
          return document === undefined || "illisible" in document ? undefined : { id, document };
        }),
      );
      const instant = now();
      const found = documents.find((readOne) => readOne?.document.appairage?.empreinte === searched || readOne?.document.echus.includes(searched) === true);
      if (found === undefined) return { refus: "no station shows this code: check it on the station, it is 8 letters and digits" };
      const { appairage: pairing } = found.document;
      name = found.document.nom;
      if (pairing?.empreinte !== searched || Date.parse(pairing.expireLe) <= instant) return { refus: `this code has expired: station ${name} shows a new one in its log — type that one` };
      await github.ecrire(found.id, { [FILE_PAIRING]: documentOfPairing({ appaireeLe: new Date(instant).toISOString(), empreinte: searched, fournit: [...provides] }) });
    } catch (error) {
      return { refus: "nothing was paired: GitHub could not be read or written", detail: message(error) };
    }
    // La home la montre tout de suite : une lecture partie avant l'écriture ne la verrait pas.
    await inProgress;
    await reread();
    return { appairee: name };
  };

  const holdWhatItProvides = async (id: string, provides: readonly string[]): Promise<boolean> => {
    const readOne = readOnes.get(id);
    const pairing = readOne?.appairage ?? null;
    const wanted = capacitiesRead(provides);
    if (pairing === null || (pairing.fournit ?? []).join("+") === wanted.join("+")) return false;
    await github.ecrire(id, { [FILE_PAIRING]: documentOfPairing({ ...pairing, fournit: wanted }) });
    await inProgress;
    await reread();
    return true;
  };

  const remove = async (id: unknown): Promise<RemovalOfStation> => {
    const station = seenOne?.stations.find((candidate) => candidate.id === id);
    if (station === undefined) return { refus: "this station is no longer paired with this app" };
    try {
      await github.supprimer(station.id, FILE_PAIRING);
    } catch (error) {
      return { refus: `${station.nom} was not removed: GitHub could not be written`, detail: message(error) };
    }
    // L'accueil ne la montre plus tout de suite : une lecture partie avant la suppression la verrait encore.
    await inProgress;
    readOnes.delete(station.id);
    show(seenOne?.sans, seenOne?.limite);
    await reread();
    return { retiree: station.nom };
  };

  void reread();
  const standby = setInterval(() => void reread(), options.cadenceMs ?? CADENCE_MS);

  return {
    vu: () => seenOne,
    relire: reread,
    appairer: pair,
    tenirCeQuElleFournit: holdWhatItProvides,
    ecarter(id, key) {
      ecartees.add(`${id} ${key}`);
      return seenOne === undefined ? undefined : show(seenOne.sans, seenOne.limite);
    },
    retirer: remove,
    fermer: () => clearInterval(standby),
  };
}
