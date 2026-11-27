// La station de l'ordinateur, tenue par un process : installer l'app, c'est installer la station de la
// machine. Elle est lancée comme le système lance celle d'un serveur — le même point d'entrée
// (runtime/src/station/main.ts), le même répertoire tenu (`BRIGADE_STATION_DIR`), la même
// configuration des projets, la même présence sur GitHub —, et rien d'autre ne change. Ce qui la tient
// est la station de fond (station-background/host.ts, #3630), qui ne dépend pas de l'app.
//
// - **Elle vit avec ce qui la tient.** Son entrée fermée — l'hôte arrêté, ou tué —, elle s'arrête
//   comme sur un SIGTERM (workstation/envelope.ts) : ses projets s'arrêtent, et GitHub porte l'heure de
//   son arrêt. Morte d'elle-même, elle est relancée cinq secondes plus tard. Refusée au démarrage (code 2 : une autre
//   station tenait encore le répertoire, comme à la mise à jour à chaud), elle est retentée d'elle-même, avec un délai
//   qui double jusqu'à cinq minutes (#3701) : jamais « jusqu'au redémarrage de l'app ».
// - **Elle s'appaire.** La station affiche son code dans son journal, comme sur un serveur ; ce qui la
//   tient le lit et le fait taper par le geste du champ de la home (stations/stations.ts, par l'app :
//   station-background/background.ts). Refusé — GitHub ne montre pas encore son gist —, il est retapé à chaque
//   essai, tant qu'il est le code affiché.
// - **Une seule par machine et par compte.** Le répertoire de la station porte le pid du process qui
//   la tient (`app.pid`) : un second ne lance pas une deuxième station, et le dit.
//
// Ce que la station dit passe par `dire` : le journal de la station de fond.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { uptime } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { stopTheSurviving, leaveSurvive, resumeTheSurviving } from "../update-background/survival.ts";
import type { Pairing } from "../stations/stations.ts";

// Ce que la station écrit quand elle attend d'être appairée — sa ligne, sur un serveur comme ici.
const CODE_SHOWS = /tape ce code dans l'app : ([0-9A-Z]{4}-[0-9A-Z]{4})/;
// Le code de sortie d'une station qui refuse de démarrer.
const REFUSAL = 2;
// Le plus long délai entre deux essais d'une station qui refuse de démarrer.
const REFUSAL_MAX_MS = 300_000;
// Pendant la première minute d'échecs, le délai ne grandit pas : une mise à jour à chaud démarre dans la minute.
const REFUSAL_FLAT_MS = 60_000;
const durationSaid = (ms: number) => (ms < 1000 ? `${ms} ms` : `${Math.round(ms / 1000)} s`);
export const HELD_PAR = "app.pid";
const ENVELOPE = join(import.meta.dirname, "envelope.ts");

export type StateStationLocale = "demarree" | "relancee" | "tenue-ailleurs" | "refusee" | "arretee";

export type OptionsStationLocale = {
  // Le `node` qui la joue, et son point d'entrée.
  node: string;
  principal: string;
  // Son répertoire : `BRIGADE_STATION_DIR`.
  racine: string;
  // L'environnement de l'app, que la station hérite — et chacun de ses projets.
  env: Record<string, string | undefined>;
  dire: (line: string) => void;
  // Le geste du chef qui tape un code sur la home.
  appairer: (code: string) => Promise<Pairing>;
  // Le pid de l'app qui la tient.
  pid?: number;
  relanceMs?: number;
  // Combien de temps les essais d'une station refusée restent à `relanceMs`, avant que leur délai ne double (60 s).
  platMs?: number;
  reessaiMs?: number;
  // Le temps laissé à la station pour s'arrêter, avant qu'elle soit tuée.
  gardeMs?: number;
  // Joué avant chaque lancement du process de la station : ce qu'elle doit sentir de sa configuration
  // (station-projects-put-back.ts). Il ne lève pas ; la station part quand il a fini.
  avantLancement?: () => Promise<void>;
  // La station vient de se lancer, ou de s'arrêter : `tourne()` a changé.
  surChangement?: () => void;
};

export type StationLocale = {
  etat(): StateStationLocale;
  // Un process de station tourne-t-il pour cet ordinateur ? Pas entre sa mort et sa relance, ni
  // refusée ou arrêtée ; tenue par une autre app, oui : c'est elle qui la fait tourner.
  tourne(): boolean;
  // Ferme son entrée et attend qu'elle se soit arrêtée. `laisser` : l'app se ferme pour sa mise à jour, la
  // station et ses cooks continuent (update-background/survival.ts).
  arreter(options?: { laisser?: boolean }): Promise<void>;
};

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Un pid vivant, ou que le système refuse de sonder : un autre compte l'a, il n'est pas mort.
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

// La marque `tenue` nomme-t-elle encore le process `lu` ? Il vit, et elle a été écrite depuis le démarrage du système :
// celle d'avant un redémarrage, ou une coupure, nomme un pid que le système a pu redonner à un tout autre process. La
// marge couvre l'arrondi de `uptime()`, en secondes.
function brandAlive(heldOne: string, readOne: number): boolean {
  if (!Number.isInteger(readOne) || readOne <= 0 || !alive(readOne)) return false;
  try {
    return statSync(heldOne).mtimeMs >= Date.now() - uptime() * 1000 - 2_000;
  } catch {
    return false;
  }
}

// Prend la station de ce répertoire pour le process `pid`, ou rend le pid de celui qui la tient déjà. Une marque laissée
// par un process mort, ou d'avant le démarrage du système, ne tient plus rien : elle est reprise.
export function takeTheStation(root: string, pid: number): number | undefined {
  const heldOne = join(root, HELD_PAR);
  mkdirSync(root, { recursive: true });
  for (let trial = 0; trial < 2; trial++) {
    try {
      writeFileSync(heldOne, `${pid}\n`, { flag: "wx" });
      return undefined;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const readOne = Number.parseInt(readFileSync(heldOne, "utf8"), 10);
    if (readOne === pid) return undefined;
    if (brandAlive(heldOne, readOne)) return readOne;
    // Un process parti sans rendre la station : sa marque ne tient plus rien.
    rmSync(heldOne, { force: true });
  }
  return undefined;
}

// Le pid du process vivant qui tient la station de ce répertoire, sans la prendre : aucun quand la marque manque, ne se
// lit pas, nomme un process mort, ou date d'avant le démarrage du système.
export function holdingOfTheStation(root: string): number | undefined {
  const heldOne = join(root, HELD_PAR);
  try {
    const readOne = Number.parseInt(readFileSync(heldOne, "utf8"), 10);
    return brandAlive(heldOne, readOne) ? readOne : undefined;
  } catch {
    return undefined;
  }
}

// Rend la station de ce répertoire, si c'est bien le process `pid` qui la tient : celle d'un autre n'est pas touchée.
export function renderTheStation(root: string, pid: number): void {
  const heldOne = join(root, HELD_PAR);
  try {
    if (Number.parseInt(readFileSync(heldOne, "utf8"), 10) === pid) rmSync(heldOne, { force: true });
  } catch {
    // Déjà rendue.
  }
}

// Le délai avant le `essai`-ième nouvel essai d'une station refusée : `relanceMs` tant que `platMs` n'est pas écoulé — une
// mise à jour à chaud démarre dans la minute —, puis il double d'un essai à l'autre, jusqu'à `REFUS_MAX_MS`.
function delayOfRetry(trial: number, relaunchMs: number, flatMs: number): number {
  const flat = Math.ceil(flatMs / relaunchMs);
  if (trial <= flat) return relaunchMs;
  return Math.min(relaunchMs * 2 ** (trial - flat), Math.max(REFUSAL_MAX_MS, relaunchMs));
}

export function holdStationLocale(options: OptionsStationLocale): StationLocale {
  const { racine: root, dire: tell } = options;
  const pid = options.pid ?? process.pid;
  const relaunchMs = options.relanceMs ?? 5_000;
  const retryMs = options.reessaiMs ?? 30_000;
  let state: StateStationLocale = "arretee";
  let child: ChildProcess | undefined;
  let end: Promise<void> = Promise.resolve();
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;
  let holding: number | undefined;
  // Le pid d'une station qu'une app fermée pour sa mise à jour a laissée en route, et que celle-ci a reprise.
  let resumption: number | undefined;
  // Le code que la station affiche, tant qu'il n'est pas appairé.
  let code: string | null = null;
  let last = "";
  let launched = 0;
  // Les démarrages refusés ou impossibles qui se suivent : le délai du suivant double.
  let flat = 0;
  const flatMs = options.platMs ?? REFUSAL_FLAT_MS;
  let trials = 0;
  const delayAfterFailure = () => delayOfRetry(++trials, relaunchMs, flatMs);
  const restart = () => {
    trials = 0;
  };
  // Les attentes en cours entre deux essais d'appairage : l'arrêt les lève.
  const waits = new Set<() => void>();
  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      const lift = () => {
        clearTimeout(ticker);
        waits.delete(lift);
        resolve();
      };
      const ticker = setTimeout(lift, ms);
      waits.add(lift);
    });

  const take = () => takeTheStation(root, pid);
  const render = () => renderTheStation(root, pid);

  const runs = () => child !== undefined || resumption !== undefined || state === "tenue-ailleurs";
  let said = false;
  // Dit le changement de `tourne()`, une seule fois par changement.
  const report = () => {
    const now = runs();
    if (now === said) return;
    said = now;
    // Après la lecture en cours : `tenirStationLocale` lance la station avant de rendre la main.
    if (options.surChangement !== undefined) queueMicrotask(options.surChangement);
  };

  const later = (faire: () => void, ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(faire, ms);
  };

  const pair = async (shows: string) => {
    code = shows;
    let saysRefusal = "";
    while (!stopped && code === shows) {
      const rendered = await options.appairer(shows);
      if ("appairee" in rendered) {
        if (code === shows) code = null;
        tell(`brigade: this computer's station is paired with the app, as “${rendered.appairee}” — it shows in Stations`);
        return;
      }
      if (rendered.refus !== saysRefusal) tell(`brigade: this computer's station is not paired yet — ${rendered.refus}; the app tries again every ${Math.round(retryMs / 1000)} s`);
      saysRefusal = rendered.refus;
      await wait(retryMs);
    }
  };

  const launch = () => {
    if (stopped) return;
    let other: number | undefined;
    try {
      other = take();
    } catch (error) {
      // Un répertoire qu'on ne peut pas écrire : l'app s'ouvre quand même, sans sa station.
      const delay = delayAfterFailure();
      state = "refusee";
      report();
      tell(`brigade: this computer's station is not launched — its directory ${root} cannot be written: ${message(error)}; trying again in ${durationSaid(delay)}`);
      return later(launch, delay);
    }
    if (other !== undefined) {
      if (holding !== other) tell(`brigade: this computer's station is run by another app (pid ${other}) — this one takes it over when that one closes`);
      holding = other;
      state = "tenue-ailleurs";
      report();
      return later(launch, retryMs);
    }
    holding = undefined;
    const marked = existsSync(join(root, "survit-a-l-app"));
    const survivor = resumeTheSurviving(root);
    if (survivor !== undefined) return resume(survivor);
    if (marked) tell("brigade: a station was left running for the app update but could not be confirmed as the station — not taken back, a new one starts");
    if (options.avantLancement === undefined) return start();
    // La marque de l'app est posée : une seconde app n'ouvre pas la station pendant ce temps.
    void options.avantLancement().catch(() => {}).then(() => {
      if (!stopped) start();
    });
  };

  // La station que la mise à jour de l'app a laissée en route est reprise telle quelle : une seconde ne
  // s'ouvre pas à côté. Morte d'elle-même, elle est relancée comme les autres.
  const resume = (survivor: number) => {
    resumption = survivor;
    state = launched++ === 0 ? "demarree" : "relancee";
    report();
    tell(`brigade: this computer's station kept running while the app updated (pid ${survivor}) — the app took it back`);
    const watch = () => {
      if (stopped || resumption !== survivor) return;
      try {
        process.kill(survivor, 0);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EPERM") {
          resumption = undefined;
          report();
          tell(`brigade: this computer's station stopped — relaunched in ${Math.round(relaunchMs / 1000)} s`);
          return later(launch, relaunchMs);
        }
      }
      later(watch, 2_000);
    };
    later(watch, 2_000);
  };

  const start = () => {
    const launches = spawn(options.node, [ENVELOPE, options.principal], {
      // Sous Windows, une app sans console qui lance `node` lui en ouvrirait une : elle reste cachée.
      windowsHide: true,
      // Le dossier du runtime, comme pour le service d'un serveur.
      cwd: dirname(dirname(dirname(options.principal))),
      env: { ...options.env, BRIGADE_STATION_DIR: root },
      stdio: ["pipe", "pipe", "pipe"],
    });
    child = launches;
    state = launched++ === 0 ? "demarree" : "relancee";
    report();
    for (const flux of [launches.stdout, launches.stderr]) {
      createInterface({ input: flux }).on("line", (line) => {
        tell(line);
        if (line.trim() !== "") last = line;
        const [, shows] = CODE_SHOWS.exec(line) ?? [];
        if (shows !== undefined && shows !== code) void pair(shows);
      });
    }
    launches.stdin.on("error", () => {});
    end = new Promise((resolve) => {
      let finished = false;
      let delay = relaunchMs;
      const launchedOne = Date.now();
      const finish = (said: string | undefined, relaunch: boolean) => {
        if (finished) return;
        finished = true;
        child = undefined;
        code = null;
        report();
        resolve();
        if (stopped) return;
        if (said !== undefined) tell(said);
        if (relaunch) return later(launch, relaunchMs);
        state = "refusee";
        render();
        later(launch, delay);
      };
      const fail = (why: string) => {
        // Une station qui a tourné longtemps avant de refuser repart de zéro.
        if (Date.now() - launchedOne > REFUSAL_FLAT_MS) restart();
          delay = delayAfterFailure();
        finish(`brigade: this computer's station ${why}; trying again in ${durationSaid(delay)}`, false);
      };
      launches.once("error", (error) => fail(`could not be launched — ${message(error)} (\`${options.node}\`)`));
      launches.once("close", (output, signal) => {
        if (output === REFUSAL) return fail(`refused to start — ${last}`);
        restart();
        finish(`brigade: this computer's station stopped (${signal ?? `code ${output}`}) — relaunched in ${Math.round(relaunchMs / 1000)} s`, true);
      });
    });
  };

  launch();

  return {
    etat: () => state,
    tourne: runs,
    async arreter(stop) {
      if (stopped) return end;
      stopped = true;
      clearTimeout(timer);
      for (const lift of [...waits]) lift();
      if (stop?.laisser === true) {
        // L'app se ferme pour sa mise à jour : la station et ses cooks continuent, la marque la garde en vie.
        if (child !== undefined || resumption !== undefined) leaveSurvive(root);
        state = "arretee";
        resumption = undefined;
        report();
        return render();
      }
      const survivor = resumption;
      if (survivor !== undefined) {
        resumption = undefined;
        await stopTheSurviving(survivor, options.gardeMs ?? 30_000);
        state = "arretee";
        report();
        return render();
      }
      const inProgress = child;
      if (inProgress !== undefined) {
        inProgress.stdin?.end();
        const guard = setTimeout(() => inProgress.kill("SIGKILL"), options.gardeMs ?? 30_000);
        await end;
        clearTimeout(guard);
      }
      state = "arretee";
      report();
      render();
    },
  };
}
