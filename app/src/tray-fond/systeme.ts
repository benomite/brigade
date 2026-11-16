// L'icône de fond (#3631) et le système : ce qui la lance à l'ouverture de session, et ce que « Quit the station » arrête.
// L'icône est un process du binaire de l'app, lancé avec `--tray-fond` (entree.ts) : seul Electron sait la dessiner, et
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
import { estUnMac } from "../plateforme.ts";
import { INSCRITE_PAR_L_APP } from "../station-fond/inscription.ts";

const ETIQUETTE_DE_LA_STATION = "brigade.station";
const ETIQUETTE_DU_FOND = "brigade.tray-fond";
const CLE_RUN = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const VALEUR_RUN = "brigade-tray";
export const ARGUMENT = "--tray-fond";

// Une commande du système, lancée une fois : son code de sortie (null : elle n'a pas pu partir) et ce qu'elle a écrit.
type Executer = (commande: string, args: readonly string[]) => Promise<{ code: number | null; sortie: string }>;

// Celle du système : la commande lancée sans shell, ses deux sorties lues ensemble.
export const executer: Executer = (commande, args) =>
  new Promise((resoudre) => {
    let sortie = "";
    const enfant = spawn(commande, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    enfant.stdout.on("data", (morceau) => (sortie += morceau));
    enfant.stderr.on("data", (morceau) => (sortie += morceau));
    enfant.once("error", (erreur) => resoudre({ code: null, sortie: erreur.message }));
    enfant.once("close", (code) => resoudre({ code, sortie }));
  });

type Systeme = {
  plateforme: NodeJS.Platform;
  // Le dossier de l'utilisateur (`~`) et, sous Windows, `%LOCALAPPDATA%`.
  maison: string;
  localAppData: string | undefined;
  // `id -u` : le domaine launchd de la session, `gui/<uid>`.
  uid: number;
  // Le binaire de l'app, que l'icône relance avec `--tray-fond`.
  binaire: string;
  executer: Executer;
};

const plist = (s: Pick<Systeme, "maison">) => join(s.maison, "Library", "LaunchAgents", `${ETIQUETTE_DU_FOND}.plist`);
const dossierDeLaStationWindows = (s: Pick<Systeme, "localAppData">) => (s.localAppData === undefined ? undefined : join(s.localAppData, "brigade-station"));

// La station de fond est-elle installée sur cet ordinateur — son agent launchd, ou son lanceur Windows ? Sans elle, rien
// ne tourne l'app fermée, et l'icône de fond n'a rien à montrer : c'est l'app qui garde la sienne (barre-de-menus.ts).
export function stationDeFondInstallee(s: Pick<Systeme, "plateforme" | "maison" | "localAppData">): boolean {
  if (estUnMac(s.plateforme)) return existsSync(join(s.maison, "Library", "LaunchAgents", `${ETIQUETTE_DE_LA_STATION}.plist`));
  const dossier = dossierDeLaStationWindows(s);
  // Le lanceur de l'installeur, ou la station de fond que l'app a inscrite elle-même (station-fond/inscription.ts, #3630).
  if (s.plateforme === "win32") return dossier !== undefined && (existsSync(join(dossier, "lancer-station.ps1")) || existsSync(join(dossier, INSCRITE_PAR_L_APP)));
  return false;
}

const xml = (texte: string) => texte.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

// L'agent launchd de l'icône : lancé à l'ouverture de session, relancé quelle que soit sa sortie — un 0 compris (#3711) : rien d'autre ne le ramène. Une
// deuxième icône s'efface en quittant, et launchd la relance au bout de `ThrottleInterval` : l'agent tient la place.
function plistDuFond(binaire: string, journal: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- Written by the brigade app (app/src/tray-fond/systeme.ts), and rewritten when it changes: do not edit. -->
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${ETIQUETTE_DU_FOND}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(binaire)}</string>
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
  <string>${xml(journal)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(journal)}</string>
</dict>
</plist>
`;
}

const echec = (quoi: string, { code, sortie }: { code: number | null; sortie: string }) => `${quoi} (${code === null ? "it could not be run" : `exit code ${code}`})${sortie.trim() === "" ? "" : `: ${sortie.trim()}`}`;

// Inscrit l'icône à l'ouverture de session et la lance si elle ne tourne pas. Rejoué à chaque ouverture de l'app, il ne
// réécrit que ce qui a changé. Rend ce qui a échoué, ou rien.
export async function inscrireLeFond(s: Systeme): Promise<string | undefined> {
  if (estUnMac(s.plateforme)) {
    const chemin = plist(s);
    const voulu = plistDuFond(s.binaire, join(s.maison, "Library", "Logs", "brigade-tray.log"));
    let ecrit: string | undefined;
    try {
      ecrit = readFileSync(chemin, "utf8");
    } catch {
      ecrit = undefined;
    }
    try {
      if (ecrit !== voulu) {
        mkdirSync(dirname(chemin), { recursive: true });
        writeFileSync(chemin, voulu);
      }
    } catch (erreur) {
      return `the menu bar icon's login item could not be written (${chemin}): ${erreur instanceof Error ? erreur.message : String(erreur)}`;
    }
    const domaine = `gui/${s.uid}`;
    const charge = (await s.executer("launchctl", ["print", `${domaine}/${ETIQUETTE_DU_FOND}`])).code === 0;
    if (charge && ecrit === voulu) return undefined;
    // Un plist changé ne se relit qu'en rechargeant l'agent.
    if (charge) await s.executer("launchctl", ["bootout", `${domaine}/${ETIQUETTE_DU_FOND}`]);
    const lance = await s.executer("launchctl", ["bootstrap", domaine, chemin]);
    return lance.code === 0 ? undefined : echec(`launchd refused the menu bar icon's agent ${chemin}`, lance);
  }
  if (s.plateforme === "win32") {
    const inscrit = await s.executer("reg", ["add", CLE_RUN, "/v", VALEUR_RUN, "/t", "REG_SZ", "/d", `"${s.binaire}" ${ARGUMENT}`, "/f"]);
    if (inscrit.code !== 0) return echec(`the notification area icon's logon start could not be written (${CLE_RUN}, ${VALEUR_RUN})`, inscrit);
    return undefined;
  }
  return undefined;
}

const ATTENTE_APRES_LANCEMENT_MS = 3000;

// Sur un Mac, l'agent de l'icône tourne-t-il ? Sinon, il est relancé (`launchctl kickstart`), puis relu. Rend ce qui
// l'empêche de tourner, ou rien — ailleurs que sur un Mac, rien : l'icône y a sa valeur `Run`, sans agent à relire.
// À rejouer toutes les minutes : un agent tombé revient dans la minute, même si launchd ne l'a pas relancé.
export async function garderLIcone(s: Systeme, attendre: (ms: number) => Promise<void> = (ms) => new Promise((fini) => setTimeout(fini, ms))): Promise<string | undefined> {
  if (!estUnMac(s.plateforme)) return undefined;
  const refus = await inscrireLeFond(s);
  if (refus !== undefined) return refus;
  const cible = `gui/${s.uid}/${ETIQUETTE_DU_FOND}`;
  const tourne = async () => {
    const lu = await s.executer("launchctl", ["print", cible]);
    return lu.code === 0 && /^\s*state = running$/m.test(lu.sortie);
  };
  if (await tourne()) return undefined;
  const lance = await s.executer("launchctl", ["kickstart", cible]);
  if (lance.code !== 0) return echec(`the menu bar icon is not running and launchd would not start it (${cible})`, lance);
  await attendre(ATTENTE_APRES_LANCEMENT_MS);
  return (await tourne()) ? undefined : `the menu bar icon is not running: launchd started it (${cible}) and it ended again — see ${join(s.maison, "Library", "Logs", "brigade-tray.log")}`;
}

const pidLu = (fichier: string): number | undefined => {
  try {
    const lu = readFileSync(fichier, "utf8").trim();
    return /^[0-9]+$/.test(lu) ? Number(lu) : undefined;
  } catch {
    return undefined;
  }
};

// Ce que « Quit the station » fait, une fois confirmé : la station s'arrête, et ses cooks avec elle. Rend ce qui a
// échoué, une ligne par chose — vide quand tout est passé. Sur un Mac, l'agent de l'icône part en dernier : son
// `bootout` arrête ce process-ci.
export async function quitterLaStation(s: Systeme): Promise<string[]> {
  if (estUnMac(s.plateforme)) {
    const domaine = `gui/${s.uid}`;
    const station = await s.executer("launchctl", ["bootout", `${domaine}/${ETIQUETTE_DE_LA_STATION}`]);
    const echecs = station.code === 0 ? [] : [echec(`launchd did not stop the station (${domaine}/${ETIQUETTE_DE_LA_STATION})`, station)];
    const fond = await s.executer("launchctl", ["bootout", `${domaine}/${ETIQUETTE_DU_FOND}`]);
    return fond.code === 0 ? echecs : [...echecs, echec(`launchd did not unload the menu bar icon (${domaine}/${ETIQUETTE_DU_FOND})`, fond)];
  }
  if (s.plateforme === "win32") {
    const dossier = dossierDeLaStationWindows(s);
    if (dossier === undefined) return ["LOCALAPPDATA is not set: the station's launcher cannot be found"];
    const echecs: string[] = [];
    // Le lanceur d'abord : sinon il relance la station cinq secondes après son arrêt.
    for (const [fichier, quoi, args] of [
      ["lanceur.pid", "the station's launcher", ["/F"]],
      ["station.pid", "the station and its cooks", ["/T", "/F"]],
    ] as const) {
      const pid = pidLu(join(dossier, fichier));
      if (pid === undefined) continue;
      // Un pid resté d'un process mort a pu être repris : seul un `node` est arrêté, comme l'installeur le vérifie.
      const arret = await s.executer("taskkill", ["/PID", String(pid), "/FI", "IMAGENAME eq node.exe", ...args]);
      if (arret.code !== 0) echecs.push(echec(`${quoi} (pid ${pid}) did not stop`, arret));
    }
    return echecs;
  }
  return [`quitting the station is not handled on ${s.plateforme}`];
}
