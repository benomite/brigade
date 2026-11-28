// Le process de la station, remplaçable seul (#2190) : la station de fond (station-background/host.ts, #3630) tient la
// station de l'ordinateur (workstation/station.ts), mais le runtime qu'elle joue n'est plus forcément celui du paquet de
// l'app. Quand la station demande « redémarre-moi sur la version X » — sa mise à jour a téléchargé X
// et ses cooks ont fini (#2189) —, seul ce process est arrêté, et X démarre à sa place : ni
// réinstallation, ni Gatekeeper, ni relance de l'app. La fenêtre, les onglets du second, les shells
// et leurs sessions `claude` sont des process de l'app, pas de la station : rien ne les touche.
//
// - **Les versions sont dans les données de l'app.** Une version X de la station est un dossier de
//   runtime, `<versions>/<X>/` (son `src/kitchen/main.ts`, son `package.json`), posé là par la mise
//   à jour de la station. L'app n'écrit jamais dans son propre paquet, et ne lance que ce qui est
//   sous ce dossier : la demande ne porte qu'un numéro de version, pas un chemin.
// - **La demande est un fichier.** La station écrit `<BRIGADE_STATION_DIR>/redemarrage`
//   (`{"version":"X"}`) ; l'app le lit, l'efface, et joue le redémarrage. Le contrat est dans le
//   README de ce dossier.
// - **Une version est gardée quand la station s'y est dite en service** — `en-service` porte X,
//   sous un pid neuf et vivant, depuis le redémarrage, et sert au moins les projets que la version
//   d'avant servait —, comme sur la box. Sinon la
//   version d'avant est relancée, et l'issue le dit. Une version ratée n'est pas réessayée.
// - **Ce qui est gardé survit à son tenant.** La version retenue est notée sous `<versions>/` : la station de
//   fond relancée relance la station sur elle, sauf si le paquet de l'app en porte une plus récente.
// - **Le paquet mis à jour relance la station.** La station survit à l'app qui quitte pour sa mise à jour (#3632) et tient en
//   mémoire le runtime d'avant : l'hôte, qui vit, regarde la version du runtime du paquet, et la station repart dessus quand
//   elle change — le même remplacement de son seul process que pour une release, ses cooks restent sous leurs relais (#4795).
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PRINCIPAL } from "../workstation/role.ts";
import { holdStationLocale, type StateStationLocale, type OptionsStationLocale, type StationLocale } from "../workstation/station.ts";

// Ce que la station écrit pour demander son redémarrage, dans son répertoire.
export const REQUEST = "redemarrage";
// Ce que la station écrit d'elle-même quand elle a démarré.
export const IN_SERVICE = "en-service";
// Ce que l'app retient des versions de la station, sous leur dossier.
export const STATE = "etat.json";
// La variable qui dit à la station où poser les versions qu'elle télécharge.
export const VARIABLE_OF_VERSIONS = "BRIGADE_STATION_VERSIONS";
// La ligne que la station écrit quand sa mise à jour demande la relance (`LIGNE_DE_RELANCE` de la station — le test des deux
// motifs les garde d'accord) : le numéro de la release, puis son point d'entrée.
export const LINE_OF_RELAUNCH = /^brigade: station update — restart with release (\S+): (.+)$/;

// Ce que l'app donne à la station pour qu'elle se tienne à jour (#2287) : les releases publiées sur GitHub — sauf
// si l'environnement dit déjà où les prendre —, et la relance par l'app, qui seule la tient.
export const environmentOfTheStation = (env: Record<string, string | undefined>): Record<string, string | undefined> => ({
  BRIGADE_MISE_A_JOUR_SOURCE: "github:benomite/brigade",
  ...env,
  BRIGADE_STATION_RELANCE: "app",
});

// Un numéro de version tel qu'une publication `station-<version>` le porte : jamais un chemin.
const VERSION = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,99}$/;

// L'issue d'un redémarrage : passée sur X, ou revenue sur la version d'avant — `retour` dit
// pourquoi celle-ci n'a pas redémarré non plus, nul sinon.
export type Issue =
  | { quoi: "passee"; version: string; depuis: string; le: string }
  | { quoi: "revenue"; visee: string; restauree: string; motif: string; le: string; retour: string | null }
  | { quoi: "refusee"; visee: string; motif: string; le: string };

// `retenue` : la version des données de l'app sur laquelle la station tourne — nulle, celle du paquet.
export type StateOfVersions = { retenue: string | null; ratees: string[]; derniere: Issue | null };

export type OptionsProcessOfStation = Omit<OptionsStationLocale, "principal"> & {
  // Le point d'entrée du runtime livré dans le paquet de l'app : la station de départ.
  embarque: string;
  // Le dossier des versions téléchargées, dans les données de l'app.
  versions: string;
  // Où est le runtime de la version X sous `versions` ; par défaut `<versions>/<X>/`. La mise à jour de la
  // station (#2189) pose le sien sous `<versions>/<X>/runtime/`.
  dossierDuRuntime?: (version: string) => string;
  // Le temps laissé à une version pour se dire en service.
  demarrageMs?: number;
  // Entre deux regards sur la station qui démarre, et sur la demande.
  pasMs?: number;
  veilleMs?: number;
  // Entre deux regards sur la version du runtime du paquet de l'app, que sa mise à jour remplace en place (#4795).
  paquetMs?: number;
  // Un redémarrage s'est conclu.
  surIssue?: (issue: Issue) => void;
  maintenant?: () => Date;
  // Ce qui tient un process de station : workstation/station.ts.
  tenir?: (options: OptionsStationLocale) => StationLocale;
};

export type ProcessOfStation = StationLocale & {
  // La version qui tourne, telle que son `package.json` la dit.
  version(): string;
  // Redémarre la station sur la version `version` des données de l'app. Rend l'issue, ou nul quand
  // rien n'a été arrêté parce qu'il n'y avait rien à faire.
  redemarrer(version: string): Promise<Issue | null>;
  // La version que la mise à jour de la station vise tant que son process est remplacé (#3637), nulle sinon.
  redemarrage(): string | null;
  etatDesVersions(): StateOfVersions;
};

type InService = { version: string; pid: number; depuis: string; servis: string[]; refuses: Record<string, string> };

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Compare deux versions par leurs nombres, dans l'ordre — ce qui suit un `+` n'ordonne rien.
export function compareVersions(a: string, b: string): number {
  const numbers = (v: string) => (v.split("+")[0] ?? "").split(/[^0-9]+/).filter((n) => n !== "").map(Number);
  const [x, y] = [numbers(a), numbers(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const gap = (x[i] ?? 0) - (y[i] ?? 0);
    if (gap !== 0) return Math.sign(gap);
  }
  return a === b ? 0 : a < b ? -1 : 1;
}

// La version d'un runtime : celle de son `package.json`, à côté de `src/`.
export function versionOfRuntime(principal: string): string {
  try {
    const readOne = JSON.parse(readFileSync(join(dirname(dirname(dirname(principal))), "package.json"), "utf8")) as { version?: unknown };
    return typeof readOne.version === "string" && readOne.version !== "" ? readOne.version : "unknown";
  } catch {
    return "unknown";
  }
}

export const principalOf = (versions: string, version: string, folderOfRuntime = (v: string) => join(versions, v)) => join(folderOfRuntime(version), PRINCIPAL);

// La demande de la station, ou nulle. Illisible, elle est nulle aussi : `motif` dit pourquoi.
export function readRequest(root: string): { version: string } | { motif: string } | null {
  let text: string;
  try {
    text = readFileSync(join(root, REQUEST), "utf8");
  } catch {
    return null;
  }
  try {
    const { version } = JSON.parse(text) as { version?: unknown };
    if (typeof version === "string" && VERSION.test(version)) return { version };
    return { motif: `it names no valid version (${JSON.stringify(version ?? null).slice(0, 100)})` };
  } catch (error) {
    return { motif: `it is not JSON: ${message(error)}` };
  }
}

// Le geste de la station, pour sa mise à jour et pour les essais : écrit d'un coup.
export function askRestart(root: string, version: string): void {
  const file = join(root, REQUEST);
  writeFileSync(`${file}.${process.pid}`, `${JSON.stringify({ version })}\n`);
  renameSync(`${file}.${process.pid}`, file);
}

export function readStateOfVersions(versions: string): StateOfVersions {
  try {
    const readOne = JSON.parse(readFileSync(join(versions, STATE), "utf8")) as Partial<StateOfVersions>;
    return {
      retenue: typeof readOne.retenue === "string" && VERSION.test(readOne.retenue) ? readOne.retenue : null,
      ratees: Array.isArray(readOne.ratees) ? readOne.ratees.filter((v): v is string => typeof v === "string") : [],
      derniere: typeof readOne.derniere === "object" && readOne.derniere !== null ? readOne.derniere : null,
    };
  } catch {
    return { retenue: null, ratees: [], derniere: null };
  }
}

function readInService(root: string): InService | null {
  try {
    const readOne = JSON.parse(readFileSync(join(root, IN_SERVICE), "utf8")) as Partial<InService>;
    if (typeof readOne.version !== "string" || typeof readOne.pid !== "number" || typeof readOne.depuis !== "string" || !Array.isArray(readOne.servis)) return null;
    return { version: readOne.version, pid: readOne.pid, depuis: readOne.depuis, servis: readOne.servis.filter((n): n is string => typeof n === "string"), refuses: typeof readOne.refuses === "object" && readOne.refuses !== null ? readOne.refuses : {} };
  } catch {
    return null;
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function holdProcessOfStation(options: OptionsProcessOfStation): ProcessOfStation {
  const { racine: root, versions } = options;
  const folderOfRuntime = options.dossierDuRuntime ?? ((v: string) => join(versions, v));
  const principalOfTheVersion = (v: string) => principalOf(versions, v, folderOfRuntime);
  // Ce que la station dit passe par là : sa demande de relance (#2287) lance le redémarrage, la ligne reste dite.
  const tell = (line: string) => {
    options.dire(line);
    const [, aimed, main] = LINE_OF_RELAUNCH.exec(line) ?? [];
    if (aimed === undefined || main === undefined) return;
    // La demande porte un numéro, jamais un chemin : le point d'entrée dit par la station doit être celui des données de l'app.
    if (!VERSION.test(aimed) || main !== principalOfTheVersion(aimed)) return options.dire(`brigade: this computer's station asked for a restart on ${aimed} from an entry point the app does not hold (${main}) — ignored`);
    void restart(aimed);
  };
  const hold = options.tenir ?? holdStationLocale;
  const startupMs = options.demarrageMs ?? 120_000;
  const notMs = options.pasMs ?? 250;
  const standbyMs = options.veilleMs ?? 2_000;
  const now = options.maintenant ?? (() => new Date());
  const bundleMs = options.paquetMs ?? 5_000;
  const { embarque: embedded } = options;
  // Ce que chaque process de la station reçoit : ce que workstation/station.ts attend, et où poser les versions.
  const common: Omit<OptionsStationLocale, "principal"> = {
    node: options.node,
    racine: root,
    env: { ...options.env, [VARIABLE_OF_VERSIONS]: versions },
    dire: tell,
    appairer: options.appairer,
    ...(options.pid === undefined ? {} : { pid: options.pid }),
    ...(options.relanceMs === undefined ? {} : { relanceMs: options.relanceMs }),
    ...(options.reessaiMs === undefined ? {} : { reessaiMs: options.reessaiMs }),
    ...(options.gardeMs === undefined ? {} : { gardeMs: options.gardeMs }),
    ...(options.avantLancement === undefined ? {} : { avantLancement: options.avantLancement }),
    ...(options.surChangement === undefined ? {} : { surChangement: options.surChangement }),
  };

  let stateOfVersions = readStateOfVersions(versions);
  const writeState = () => {
    try {
      mkdirSync(versions, { recursive: true });
      const file = join(versions, STATE);
      writeFileSync(`${file}.neuf`, `${JSON.stringify(stateOfVersions, null, 2)}\n`);
      renameSync(`${file}.neuf`, file);
    } catch (error) {
      tell(`brigade: the station versions could not be remembered (${join(versions, STATE)}) — ${message(error)}`);
    }
  };

  // Au départ : la version retenue, si elle est encore là et plus récente que celle du paquet.
  const versionEmbedded = versionOfRuntime(embedded);
  const retainedOne = stateOfVersions.retenue;
  let principal = embedded;
  if (retainedOne !== null && existsSync(principalOfTheVersion(retainedOne)) && compareVersions(retainedOne, versionEmbedded) > 0) principal = principalOfTheVersion(retainedOne);
  let version = principal === embedded ? versionEmbedded : (retainedOne ?? versionEmbedded);

  const launch = (point: string) => hold({ ...common, principal: point });
  let station = launch(principal);
  let stopped = false;
  let inProgress: Promise<Issue | null> | null = null;
  let aimedInProgress: string | null = null;

  const conclude = (issue: Issue): Issue => {
    stateOfVersions = { ...stateOfVersions, derniere: issue };
    writeState();
    options.surIssue?.(issue);
    return issue;
  };

  // Attend que la station se dise en service en `visee`, sous un pid neuf, depuis `debut`, en
  // servant encore `servis`. Rend l'instant de son démarrage, ou pourquoi elle n'a pas démarré.
  const waitInService = async (heldOne: StationLocale, aimed: string, start: number, old: number | undefined, servedOnes: string[]): Promise<{ le: string } | { motif: string }> => {
    const end = Date.now() + startupMs;
    let wait = `it did not say it was in service in ${aimed}`;
    let launchedOne = false;
    for (;;) {
      const state: StateStationLocale = heldOne.etat();
      if (state === "refusee") return { motif: `it refused to start in ${aimed}` };
      // Morte après son lancement : workstation/station.ts la relancerait, la version ne tient pas.
      if (state === "relancee" || (launchedOne && !heldOne.tourne())) return { motif: `it stopped in ${aimed} right after its launch` };
      launchedOne ||= heldOne.tourne();
      const saidOne = readInService(root);
      if (saidOne !== null && saidOne.version === aimed && saidOne.pid !== old && Date.parse(saidOne.depuis) >= start && alive(saidOne.pid)) {
        const lost = servedOnes.filter((project) => !saidOne.servis.includes(project));
        if (lost.length === 0) return { le: saidOne.depuis };
        wait = lost.map((project) => `project ${project} is no longer served in ${aimed}${saidOne.refuses[project] ? `: ${saidOne.refuses[project]}` : ""}`).join("; ");
      }
      if (stopped) return { motif: "the app closed during the restart" };
      if (Date.now() >= end) return { motif: `${wait} within ${startupMs / 1000} s` };
      await pause(notMs);
    }
  };

  // Arrête le process de la station, puis en lance un sur `point` : rien d'autre ne s'arrête.
  const replace = async (point: string): Promise<{ tenue: StationLocale; debut: number }> => {
    await station.arreter();
    // L'horloge de la machine, celle dont la station date son démarrage.
    const start = Date.now();
    station = launch(point);
    return { tenue: station, debut: start };
  };

  const play = async (aimed: string): Promise<Issue | null> => {
    const the = () => now().toISOString();
    if (aimed === version) {
      tell(`brigade: this computer's station is already on ${aimed} — nothing is restarted`);
      return null;
    }
    const refuse = (motive: string) => {
      tell(`brigade: this computer's station is not restarted on ${aimed} — ${motive}; it stays on ${version}`);
      return conclude({ quoi: "refusee", visee: aimed, motif: motive, le: the() });
    };
    if (stateOfVersions.ratees.includes(aimed)) return refuse("that version did not start at its try, it is not tried again");
    const point = principalOfTheVersion(aimed);
    if (!existsSync(point)) return refuse(`its runtime is not in ${join(versions, aimed)}`);

    const since = version;
    const pointBefore = principal;
    const before = readInService(root);
    const servedOnes = before?.servis ?? [];
    tell(`brigade: this computer's station restarts on ${aimed} (from ${since}) — only its process; the window, the seconds and the shells keep running`);
    const trial = await replace(point);
    const finding = await waitInService(trial.tenue, aimed, trial.debut, before?.pid, servedOnes);
    if ("le" in finding) {
      principal = point;
      version = aimed;
      stateOfVersions = { ...stateOfVersions, retenue: aimed };
      tell(`brigade: this computer's station now runs ${aimed}`);
      return conclude({ quoi: "passee", version: aimed, depuis: since, le: finding.le });
    }
    if (stopped) return null;
    stateOfVersions = { ...stateOfVersions, ratees: [...new Set([...stateOfVersions.ratees, aimed])] };
    tell(`brigade: this computer's station did not start on ${aimed} (${finding.motif}) — back to ${since}`);
    const rate = readInService(root)?.pid;
    const back = await replace(pointBefore);
    const returned = await waitInService(back.tenue, since, back.debut, rate, servedOnes);
    tell(`brigade: this computer's station ${"le" in returned ? `runs ${since} again` : `did not start again on ${since} either: ${returned.motif}`}`);
    return conclude({ quoi: "revenue", visee: aimed, restauree: since, motif: finding.motif, le: the(), retour: "le" in returned ? null : returned.motif });
  };

  // Le paquet de l'app porte un autre runtime que celui que cet hôte a vu : la station repart sur lui, sauf si la version
  // retenue dans les données de l'app est encore plus récente (la même règle qu'au départ).
  const playBundle = async (bundleVersion: string): Promise<Issue | null> => {
    const retained = stateOfVersions.retenue;
    if (retained !== null && existsSync(principalOfTheVersion(retained)) && compareVersions(retained, bundleVersion) > 0) return null;
    const since = version;
    const pointBefore = principal;
    const before = readInService(root);
    tell(`brigade: the app's package now carries ${bundleVersion} (this computer's station runs ${since}) — its station restarts on it, only its process; the cooks keep running under their relays`);
    const trial = await replace(embedded);
    const finding = await waitInService(trial.tenue, bundleVersion, trial.debut, before?.pid, before?.servis ?? []);
    if ("le" in finding) {
      principal = embedded;
      version = bundleVersion;
      stateOfVersions = { ...stateOfVersions, retenue: null };
      writeState();
      tell(`brigade: this computer's station now runs ${bundleVersion}`);
      return conclude({ quoi: "passee", version: bundleVersion, depuis: since, le: finding.le });
    }
    if (stopped) return null;
    tell(`brigade: this computer's station did not start on the app's package ${bundleVersion} (${finding.motif})`);
    // Le paquet a pris la place de l'ancien runtime : rien d'autre à relancer, la station se retente d'elle-même.
    if (pointBefore !== embedded) await replace(pointBefore);
    return conclude({ quoi: "refusee", visee: bundleVersion, motif: finding.motif, le: now().toISOString() });
  };

  const restart = (aimed: string, playOne: () => Promise<Issue | null> = () => play(aimed)): Promise<Issue | null> => {
    if (stopped) return Promise.resolve(null);
    if (inProgress !== null) return inProgress;
    aimedInProgress = aimed;
    inProgress = playOne()
      .catch((error) => {
        tell(`brigade: this computer's station restart on ${aimed} failed — ${message(error)}`);
        return null;
      })
      .finally(() => {
        inProgress = null;
        aimedInProgress = null;
      });
    return inProgress;
  };

  // La demande de la station : lue par l'app qui la fait tourner, puis effacée.
  let saysUnreadable = "";
  const watch = () => {
    if (stopped || inProgress !== null || station.etat() === "tenue-ailleurs") return;
    const request = readRequest(root);
    if (request === null) return;
    rmSync(join(root, REQUEST), { force: true });
    if ("motif" in request) {
      if (request.motif !== saysUnreadable) tell(`brigade: this computer's station asked for a restart the app cannot read — ${request.motif}`);
      saysUnreadable = request.motif;
      return;
    }
    void restart(request.version);
  };
  const standby = setInterval(watch, standbyMs);
  standby.unref();

  // Le runtime du paquet de l'app, remplacé en place par sa mise à jour : relu, et suivi quand sa version change.
  let seenBundle = versionEmbedded;
  const watchBundle = () => {
    if (stopped || inProgress !== null || station.etat() === "tenue-ailleurs" || !existsSync(embedded)) return;
    const bundleVersion = versionOfRuntime(embedded);
    if (bundleVersion === "unknown" || bundleVersion === seenBundle) return;
    seenBundle = bundleVersion;
    if (bundleVersion === version && principal === embedded) return;
    void restart(bundleVersion, () => playBundle(bundleVersion));
  };
  const bundleTimer = setInterval(watchBundle, bundleMs);
  bundleTimer.unref();

  return {
    etat: () => station.etat(),
    tourne: () => station.tourne(),
    version: () => version,
    etatDesVersions: () => stateOfVersions,
    redemarrer: restart,
    redemarrage: () => (inProgress === null ? null : aimedInProgress),
    async arreter(stop) {
      stopped = true;
      clearInterval(standby);
      clearInterval(bundleTimer);
      // Pour une mise à jour de l'app, rien n'attend : la station n'est pas arrêtée, un redémarrage en cours non plus.
      if (stop?.laisser !== true) await inProgress;
      await station.arreter(stop);
    },
  };
}
