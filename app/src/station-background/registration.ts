// La station de fond à l'ouverture de session (#3630) : l'app installée l'y inscrit, pour qu'elle tourne sans que l'app
// soit ouverte. Rejoué à chaque ouverture de l'app, il ne réécrit que ce qui a changé, et n'arrête jamais une station
// qui tourne.
//
// - **Sur un Mac**, l'agent launchd `brigade.station` (`~/Library/LaunchAgents/brigade.station.plist`) — celui que pose
//   l'installeur de docs/installation-station.md, que l'icône de fond connaît déjà (tray-background/system.ts) : il joue
//   l'hôte (host.ts) par le `node` de l'app. Pas encore chargé, il est chargé, et lance l'hôte ; chargé, il est lancé
//   s'il ne tourne pas. Un agent posé par l'installeur est laissé tel quel : c'est sa station qui tourne.
// - **Sous Windows**, la valeur `brigade-station` de `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` : le binaire
//   de l'app avec `--station-fond` (tray-background/entry.ts), qui lance l'hôte sans console et s'en va. Le lanceur de
//   l'installeur présent (`%LOCALAPPDATA%\brigade-station\lancer-station.ps1`), rien n'est écrit.
// - **Ailleurs** (Linux de bureau), rien ne s'inscrit : l'app lance l'hôte à son ouverture, il survit à sa fermeture.
//
// Rien de cela ne lève : ce qui échoue est rendu en une ligne.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isOneMac } from "../platform.ts";
import { LOG } from "./background.ts";

const LABEL = "brigade.station";
export const ARGUMENT_BACKGROUND = "--station-fond";
const KEY_RUN = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const VALUE_RUN = "brigade-station";
// Ce que l'app écrit dans le dossier de la station Windows quand c'est elle qui l'inscrit : l'icône de fond la sait
// installée (tray-background/system.ts, `stationDeFondInstallee`), et « Quit the station » arrête son hôte (`station.pid`).
export const REGISTERED_BY_THE_APP = "inscrite-par-l-app";
const BRAND = "Written by the brigade app (app/src/station-background/registration.ts)";

type Run = (command: string, args: readonly string[]) => Promise<{ code: number | null; sortie: string }>;

type System = {
  plateforme: NodeJS.Platform;
  maison: string;
  localAppData: string | undefined;
  uid: number;
  executer: Run;
  // Le `node` de l'app, l'hôte et ses deux arguments : ce que l'agent launchd joue.
  node: string;
  hote: string;
  racine: string;
  embarque: string;
  // Le PATH que la station reçoit de launchd, qui n'en donne pas d'autre que celui du système.
  chemin: string | undefined;
  // Le binaire de l'app, que la valeur `Run` relance avec `--station-fond`.
  binaire: string;
};

export type Registration = { par: "launchd" | "run" | "installeur" | "aucune" } | { refus: string };

const plist = (s: Pick<System, "maison">) => join(s.maison, "Library", "LaunchAgents", `${LABEL}.plist`);
const folderWindows = (localAppData: string | undefined) => (localAppData === undefined ? undefined : join(localAppData, "brigade-station"));
const xml = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const failure = (what: string, { code, sortie: output }: { code: number | null; sortie: string }) => `${what} (${code === null ? "it could not be run" : `exit code ${code}`})${output.trim() === "" ? "" : `: ${output.trim()}`}`;

// L'agent launchd de la station : lancé à l'ouverture de session, relancé s'il tombe, pas quand il quitte de lui-même.
// `AbandonProcessGroup`, comme l'installeur : son arrêt n'emporte pas les cooks d'un coup, la station les arrête.
function plistOfTheStation(s: Pick<System, "node" | "hote" | "racine" | "embarque" | "chemin" | "maison">): string {
  const env = [["BRIGADE_STATION_DIR", s.racine], ["HOME", s.maison], ...(s.chemin === undefined ? [] : [["PATH", s.chemin]]), ["LANG", "en_US.UTF-8"]];
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- ${BRAND}, and rewritten when it changes: do not edit. -->
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${[s.node, s.hote, s.racine, s.embarque].map((argument) => `    <string>${xml(argument)}</string>`).join("\n")}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${env.map(([key = "", value = ""]) => `    <key>${key}</key>\n    <string>${xml(value)}</string>`).join("\n")}
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>AbandonProcessGroup</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xml(join(s.racine, LOG))}</string>
  <key>StandardErrorPath</key>
  <string>${xml(join(s.racine, LOG))}</string>
</dict>
</plist>
`;
}

// Inscrit la station de fond à l'ouverture de session. `par` dit ce qui la tient : launchd (l'agent est chargé et
// lancé — l'hôte démarre de lui-même), la valeur `Run` (l'app lance l'hôte cette fois-ci), l'installeur, ou rien.
export async function registerTheStationOfBackground(s: System): Promise<Registration> {
  if (isOneMac(s.plateforme)) {
    const path = plist(s);
    let written: string | undefined;
    try {
      written = readFileSync(path, "utf8");
    } catch {
      written = undefined;
    }
    if (written !== undefined && !written.includes(BRAND)) return { par: "installeur" };
    const wanted = plistOfTheStation(s);
    const change = written !== wanted;
    try {
      if (change) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, wanted);
      }
    } catch (error) {
      return { refus: `the station's login item could not be written (${path}): ${error instanceof Error ? error.message : String(error)}` };
    }
    const domain = `gui/${s.uid}`;
    // Chargé, un plist inchangé n'est pas rechargé : ce serait arrêter la station qui tourne ; un agent qui ne tourne pas
    // est lancé. Un plist réécrit est rechargé (bootout puis bootstrap, #4400) : launchd garde sinon l'ancienne définition
    // (un `node` renommé par la mise à jour) jusqu'à la prochaine ouverture de session.
    if ((await s.executer("launchctl", ["print", `${domain}/${LABEL}`])).code === 0) {
      if (change) {
        const unload = await s.executer("launchctl", ["bootout", `${domain}/${LABEL}`]);
        if (unload.code !== 0) return { refus: failure(`launchd did not unload the station's agent ${domain}/${LABEL}`, unload) };
        const reloads = await s.executer("launchctl", ["bootstrap", domain, path]);
        return reloads.code === 0 ? { par: "launchd" } : { refus: failure(`launchd refused the station's agent ${path}`, reloads) };
      }
      const launches = await s.executer("launchctl", ["kickstart", `${domain}/${LABEL}`]);
      return launches.code === 0 ? { par: "launchd" } : { refus: failure(`launchd did not start the station's agent ${domain}/${LABEL}`, launches) };
    }
    const load = await s.executer("launchctl", ["bootstrap", domain, path]);
    return load.code === 0 ? { par: "launchd" } : { refus: failure(`launchd refused the station's agent ${path}`, load) };
  }
  if (s.plateforme === "win32") {
    const folder = folderWindows(s.localAppData);
    if (folder === undefined) return { refus: "LOCALAPPDATA is not set: the station's logon start cannot be written" };
    if (existsSync(join(folder, "lancer-station.ps1"))) return { par: "installeur" };
    const registered = await s.executer("reg", ["add", KEY_RUN, "/v", VALUE_RUN, "/t", "REG_SZ", "/d", `"${s.binaire}" ${ARGUMENT_BACKGROUND}`, "/f"]);
    if (registered.code !== 0) return { refus: failure(`the station's logon start could not be written (${KEY_RUN}, ${VALUE_RUN})`, registered) };
    try {
      mkdirSync(folder, { recursive: true });
      writeFileSync(join(folder, REGISTERED_BY_THE_APP), `${VALUE_RUN}\n`);
    } catch (error) {
      return { refus: `the station's logon start is written, but the menu bar icon cannot know it (${folder}): ${error instanceof Error ? error.message : String(error)}` };
    }
    return { par: "run" };
  }
  return { par: "aucune" };
}

// Sous Windows, l'hôte écrit son pid là où « Quit the station » de l'icône de fond le cherche (tray-background/system.ts) —
// sauf quand le lanceur de l'installeur tient ce dossier. Ailleurs, rien : launchd arrête l'agent par son étiquette.
export function writeThePidForTheIcon(s: { plateforme: NodeJS.Platform; localAppData: string | undefined; pid: number; dire: (line: string) => void }): void {
  if (s.plateforme !== "win32") return;
  const folder = folderWindows(s.localAppData);
  if (folder === undefined || existsSync(join(folder, "lancer-station.ps1"))) return;
  try {
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "station.pid"), `${s.pid}\n`);
  } catch (error) {
    s.dire(`brigade: the menu bar icon will not find the background station to quit it (${folder}): ${error instanceof Error ? error.message : String(error)}`);
  }
}
