// L'icône de fond (#3631) et le système : ce qui la lance à l'ouverture de session, et ce que « Quit the station » arrête.
// L'icône est un process du binaire de l'app, lancé avec `--tray-fond` (entry.ts) : seul Electron sait la dessiner, et
// la station de fond est un `node` sans Electron. L'app l'inscrit à l'ouverture de session à côté de la station que
// posent les installeurs (docs/installation-station.md) — sans toucher à eux :
//
// - **Sur un Mac**, un agent launchd à elle, `~/Library/LaunchAgents/brigade.tray-fond.plist`, comme celui de la
//   station (`brigade.station`) ; quitter fait `launchctl bootout` de l'agent de la station, puis du sien, pour que ni
//   l'un ni l'autre ne revienne avant la prochaine ouverture de session.
// - **Sous Windows**, la valeur `brigade-tray` de `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, comme
//   `brigade-station` ; quitter arrête le lanceur de la station (`lanceur.pid`), puis la station et ses cooks
//   (`station.pid`, avec ses enfants).
//
// Rien de cela ne lève : ce qui échoue est rendu en une ligne, que l'icône dit.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isOneMac } from "../platform.ts";
import { REGISTERED_BY_THE_APP } from "../station-background/registration.ts";

const LABEL_OF_THE_STATION = "brigade.station";
const LABEL_OF_BACKGROUND = "brigade.tray-fond";
const KEY_RUN = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const VALUE_RUN = "brigade-tray";
export const ARGUMENT = "--tray-fond";
// Les données de l'icône, dans celles de l'app (process.ts), et la version qu'elle y écrit en démarrant.
export const FOLDER_OF_BACKGROUND = "tray-fond";
const VERSION_OF_BACKGROUND = "version";

export function writeTheVersionOfBackground(folder: string, version: string): void {
  writeFileSync(join(folder, VERSION_OF_BACKGROUND), version);
}

// L'icône qui tourne est-elle d'une autre version que l'app, d'après ce qu'elle a écrit dans ses données (`dossierDeLApp`
// est celui de l'app) ? Rien de lisible compte comme une autre : une icône d'avant #4071 n'en écrit pas.
export function backgroundStale(folderOfTheApp: string, version: string): boolean {
  try {
    const writtenOne = readFileSync(join(folderOfTheApp, FOLDER_OF_BACKGROUND, VERSION_OF_BACKGROUND), "utf8").trim();
    return !(writtenOne === version);
  } catch {
    return true;
  }
}

// Une commande du système, lancée une fois : son code de sortie (null : elle n'a pas pu partir) et ce qu'elle a écrit.
type Run = (command: string, args: readonly string[]) => Promise<{ code: number | null; sortie: string }>;

// Celle du système : la commande lancée sans shell, ses deux sorties lues ensemble.
export const run: Run = (command, args) =>
  new Promise((resolve) => {
    let output = "";
    const child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (piece) => (output += piece));
    child.stderr.on("data", (piece) => (output += piece));
    child.once("error", (error) => resolve({ code: null, sortie: error.message }));
    child.once("close", (code) => resolve({ code, sortie: output }));
  });

type System = {
  plateforme: NodeJS.Platform;
  // Le dossier de l'utilisateur (`~`) et, sous Windows, `%LOCALAPPDATA%`.
  maison: string;
  localAppData: string | undefined;
  // `id -u` : le domaine launchd de la session, `gui/<uid>`.
  uid: number;
  // Le binaire de l'app, que l'icône relance avec `--tray-fond`.
  binaire: string;
  executer: Run;
  // L'icône qui tourne est d'une autre version que l'app (`fondPerime`) : launchd ne la relance pas d'elle-même après
  // une mise à jour, et elle garderait le code d'avant (#4071).
  fondPerime?: boolean;
};

const plist = (s: Pick<System, "maison">) => join(s.maison, "Library", "LaunchAgents", `${LABEL_OF_BACKGROUND}.plist`);
const folderOfTheStationWindows = (s: Pick<System, "localAppData">) => (s.localAppData === undefined ? undefined : join(s.localAppData, "brigade-station"));

// La station de fond est-elle installée sur cet ordinateur — son agent launchd, ou son lanceur Windows ? Sans elle, rien
// ne tourne l'app fermée, et l'icône de fond n'a rien à montrer : c'est l'app qui garde la sienne (menu-bar.ts).
export function stationOfBackgroundInstalled(s: Pick<System, "plateforme" | "maison" | "localAppData">): boolean {
  if (isOneMac(s.plateforme)) return existsSync(join(s.maison, "Library", "LaunchAgents", `${LABEL_OF_THE_STATION}.plist`));
  const folder = folderOfTheStationWindows(s);
  // Le lanceur de l'installeur, ou la station de fond que l'app a inscrite elle-même (station-background/registration.ts, #3630).
  if (s.plateforme === "win32") return folder !== undefined && (existsSync(join(folder, "lancer-station.ps1")) || existsSync(join(folder, REGISTERED_BY_THE_APP)));
  return false;
}

const xml = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

// L'agent launchd de l'icône : lancé à l'ouverture de session, relancé quelle que soit sa sortie — un 0 compris (#3711) : rien d'autre ne le ramène. Une
// deuxième icône s'efface en quittant, et launchd la relance au bout de `ThrottleInterval` : l'agent tient la place.
function plistOfBackground(binary: string, log: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- Written by the brigade app (app/src/tray-background/system.ts), and rewritten when it changes: do not edit. -->
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL_OF_BACKGROUND}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(binary)}</string>
    <string>${ARGUMENT}</string>
  </array>
  <key>LimitLoadToSessionType</key>
  <string>Aqua</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>StandardOutPath</key>
  <string>${xml(log)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(log)}</string>
</dict>
</plist>
`;
}

const failure = (what: string, { code, sortie: output }: { code: number | null; sortie: string }) => `${what} (${code === null ? "it could not be run" : `exit code ${code}`})${output.trim() === "" ? "" : `: ${output.trim()}`}`;

// Inscrit l'icône à l'ouverture de session et la lance si elle ne tourne pas. Rejoué à chaque ouverture de l'app, il ne
// réécrit que ce qui a changé. Rend ce qui a échoué, ou rien.
export async function registerTheBackground(s: System): Promise<string | undefined> {
  if (isOneMac(s.plateforme)) {
    const path = plist(s);
    const wanted = plistOfBackground(s.binaire, join(s.maison, "Library", "Logs", "brigade-tray.log"));
    let written: string | undefined;
    try {
      written = readFileSync(path, "utf8");
    } catch {
      written = undefined;
    }
    try {
      if (written !== wanted) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, wanted);
      }
    } catch (error) {
      return `the menu bar icon's login item could not be written (${path}): ${error instanceof Error ? error.message : String(error)}`;
    }
    const domain = `gui/${s.uid}`;
    const load = (await s.executer("launchctl", ["print", `${domain}/${LABEL_OF_BACKGROUND}`])).code === 0;
    if (load && written === wanted) {
      if (!s.fondPerime) return undefined;
      // Le même agent, mais l'icône d'une version d'avant : relancée sur le binaire du paquet, sans toucher à la station.
      const relaunch = await s.executer("launchctl", ["kickstart", "-k", `${domain}/${LABEL_OF_BACKGROUND}`]);
      return relaunch.code === 0 ? undefined : failure(`launchd would not restart the menu bar icon on this version of the app (${domain}/${LABEL_OF_BACKGROUND})`, relaunch);
    }
    // Un plist changé ne se relit qu'en rechargeant l'agent.
    if (load) await s.executer("launchctl", ["bootout", `${domain}/${LABEL_OF_BACKGROUND}`]);
    const launches = await s.executer("launchctl", ["bootstrap", domain, path]);
    return launches.code === 0 ? undefined : failure(`launchd refused the menu bar icon's agent ${path}`, launches);
  }
  if (s.plateforme === "win32") {
    const registered = await s.executer("reg", ["add", KEY_RUN, "/v", VALUE_RUN, "/t", "REG_SZ", "/d", `"${s.binaire}" ${ARGUMENT}`, "/f"]);
    if (registered.code !== 0) return failure(`the notification area icon's logon start could not be written (${KEY_RUN}, ${VALUE_RUN})`, registered);
    return undefined;
  }
  return undefined;
}

const WAIT_AFTER_LAUNCH_MS = 3000;

// Sur un Mac, l'agent de l'icône tourne-t-il ? Sinon, il est relancé (`launchctl kickstart`), puis relu. Rend ce qui
// l'empêche de tourner, ou rien — ailleurs que sur un Mac, rien : l'icône y a sa valeur `Run`, sans agent à relire.
// À rejouer toutes les minutes : un agent tombé revient dans la minute, même si launchd ne l'a pas relancé.
export async function keepTheIcon(s: System, wait: (ms: number) => Promise<void> = (ms) => new Promise((finished) => setTimeout(finished, ms))): Promise<string | undefined> {
  if (!isOneMac(s.plateforme)) return undefined;
  const refusal = await registerTheBackground(s);
  if (refusal !== undefined) return refusal;
  const target = `gui/${s.uid}/${LABEL_OF_BACKGROUND}`;
  const runs = async () => {
    const readOne = await s.executer("launchctl", ["print", target]);
    return readOne.code === 0 && /^\s*state = running$/m.test(readOne.sortie);
  };
  if (await runs()) return undefined;
  const launches = await s.executer("launchctl", ["kickstart", target]);
  if (launches.code !== 0) return failure(`the menu bar icon is not running and launchd would not start it (${target})`, launches);
  await wait(WAIT_AFTER_LAUNCH_MS);
  return (await runs()) ? undefined : `the menu bar icon is not running: launchd started it (${target}) and it ended again — see ${join(s.maison, "Library", "Logs", "brigade-tray.log")}`;
}

const pidRead = (file: string): number | undefined => {
  try {
    const readOne = readFileSync(file, "utf8").trim();
    return /^[0-9]+$/.test(readOne) ? Number(readOne) : undefined;
  } catch {
    return undefined;
  }
};

// Ce que « Quit the station » fait, une fois confirmé : la station s'arrête, et ses cooks avec elle. Rend ce qui a
// échoué, une ligne par chose — vide quand tout est passé. Sur un Mac, l'agent de l'icône part en dernier : son
// `bootout` arrête ce process-ci.
export async function quitTheStation(s: System): Promise<string[]> {
  if (isOneMac(s.plateforme)) {
    const domain = `gui/${s.uid}`;
    const station = await s.executer("launchctl", ["bootout", `${domain}/${LABEL_OF_THE_STATION}`]);
    const failures = station.code === 0 ? [] : [failure(`launchd did not stop the station (${domain}/${LABEL_OF_THE_STATION})`, station)];
    const background = await s.executer("launchctl", ["bootout", `${domain}/${LABEL_OF_BACKGROUND}`]);
    return background.code === 0 ? failures : [...failures, failure(`launchd did not unload the menu bar icon (${domain}/${LABEL_OF_BACKGROUND})`, background)];
  }
  if (s.plateforme === "win32") {
    const folder = folderOfTheStationWindows(s);
    if (folder === undefined) return ["LOCALAPPDATA is not set: the station's launcher cannot be found"];
    const failures: string[] = [];
    // Le lanceur d'abord : sinon il relance la station cinq secondes après son arrêt.
    for (const [file, what, args] of [
      ["lanceur.pid", "the station's launcher", ["/F"]],
      ["station.pid", "the station and its cooks", ["/T", "/F"]],
    ] as const) {
      const pid = pidRead(join(folder, file));
      if (pid === undefined) continue;
      // Un pid resté d'un process mort a pu être repris : seul un `node` est arrêté, comme l'installeur le vérifie.
      const stop = await s.executer("taskkill", ["/PID", String(pid), "/FI", "IMAGENAME eq node.exe", ...args]);
      if (stop.code !== 0) failures.push(failure(`${what} (pid ${pid}) did not stop`, stop));
    }
    return failures;
  }
  return [`quitting the station is not handled on ${s.plateforme}`];
}
