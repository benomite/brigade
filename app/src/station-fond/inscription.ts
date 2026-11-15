// La station de fond à l'ouverture de session (#3630) : l'app installée l'y inscrit, pour qu'elle tourne sans que l'app
// soit ouverte. Rejoué à chaque ouverture de l'app, il ne réécrit que ce qui a changé, et n'arrête jamais une station
// qui tourne.
//
// - **Sur un Mac**, l'agent launchd `brigade.station` (`~/Library/LaunchAgents/brigade.station.plist`) — celui que pose
//   l'installeur de docs/installation-station.md, que l'icône de fond connaît déjà (tray-fond/systeme.ts) : il joue
//   l'hôte (hote.ts) par le `node` de l'app. Pas encore chargé, il est chargé, et lance l'hôte ; chargé, il est lancé
//   s'il ne tourne pas. Un agent posé par l'installeur est laissé tel quel : c'est sa station qui tourne.
// - **Sous Windows**, la valeur `brigade-station` de `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` : le binaire
//   de l'app avec `--station-fond` (tray-fond/entree.ts), qui lance l'hôte sans console et s'en va. Le lanceur de
//   l'installeur présent (`%LOCALAPPDATA%\brigade-station\lancer-station.ps1`), rien n'est écrit.
// - **Ailleurs** (Linux de bureau), rien ne s'inscrit : l'app lance l'hôte à son ouverture, il survit à sa fermeture.
//
// Rien de cela ne lève : ce qui échoue est rendu en une ligne.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { estUnMac } from "../plateforme.ts";
import { JOURNAL } from "./fond.ts";

const ETIQUETTE = "brigade.station";
export const ARGUMENT_FOND = "--station-fond";
const CLE_RUN = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const VALEUR_RUN = "brigade-station";
// Ce que l'app écrit dans le dossier de la station Windows quand c'est elle qui l'inscrit : l'icône de fond la sait
// installée (tray-fond/systeme.ts, `stationDeFondInstallee`), et « Quit the station » arrête son hôte (`station.pid`).
export const INSCRITE_PAR_L_APP = "inscrite-par-l-app";
const MARQUE = "Written by the brigade app (app/src/station-fond/inscription.ts)";

type Executer = (commande: string, args: readonly string[]) => Promise<{ code: number | null; sortie: string }>;

export type Systeme = {
  plateforme: NodeJS.Platform;
  maison: string;
  localAppData: string | undefined;
  uid: number;
  executer: Executer;
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

export type Inscription = { par: "launchd" | "run" | "installeur" | "aucune" } | { refus: string };

const plist = (s: Pick<Systeme, "maison">) => join(s.maison, "Library", "LaunchAgents", `${ETIQUETTE}.plist`);
const dossierWindows = (localAppData: string | undefined) => (localAppData === undefined ? undefined : join(localAppData, "brigade-station"));
const xml = (texte: string) => texte.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const echec = (quoi: string, { code, sortie }: { code: number | null; sortie: string }) => `${quoi} (${code === null ? "it could not be run" : `exit code ${code}`})${sortie.trim() === "" ? "" : `: ${sortie.trim()}`}`;

// L'agent launchd de la station : lancé à l'ouverture de session, relancé s'il tombe, pas quand il quitte de lui-même.
// `AbandonProcessGroup`, comme l'installeur : son arrêt n'emporte pas les cooks d'un coup, la station les arrête.
function plistDeLaStation(s: Pick<Systeme, "node" | "hote" | "racine" | "embarque" | "chemin" | "maison">): string {
  const env = [["BRIGADE_STATION_DIR", s.racine], ["HOME", s.maison], ...(s.chemin === undefined ? [] : [["PATH", s.chemin]]), ["LANG", "en_US.UTF-8"]];
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- ${MARQUE}, and rewritten when it changes: do not edit. -->
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${ETIQUETTE}</string>
  <key>ProgramArguments</key>
  <array>
${[s.node, s.hote, s.racine, s.embarque].map((argument) => `    <string>${xml(argument)}</string>`).join("\n")}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${env.map(([cle = "", valeur = ""]) => `    <key>${cle}</key>\n    <string>${xml(valeur)}</string>`).join("\n")}
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
  <string>${xml(join(s.racine, JOURNAL))}</string>
  <key>StandardErrorPath</key>
  <string>${xml(join(s.racine, JOURNAL))}</string>
</dict>
</plist>
`;
}

// Inscrit la station de fond à l'ouverture de session. `par` dit ce qui la tient : launchd (l'agent est chargé et
// lancé — l'hôte démarre de lui-même), la valeur `Run` (l'app lance l'hôte cette fois-ci), l'installeur, ou rien.
export async function inscrireLaStationDeFond(s: Systeme): Promise<Inscription> {
  if (estUnMac(s.plateforme)) {
    const chemin = plist(s);
    let ecrit: string | undefined;
    try {
      ecrit = readFileSync(chemin, "utf8");
    } catch {
      ecrit = undefined;
    }
    if (ecrit !== undefined && !ecrit.includes(MARQUE)) return { par: "installeur" };
    const voulu = plistDeLaStation(s);
    try {
      if (ecrit !== voulu) {
        mkdirSync(dirname(chemin), { recursive: true });
        writeFileSync(chemin, voulu);
      }
    } catch (erreur) {
      return { refus: `the station's login item could not be written (${chemin}): ${erreur instanceof Error ? erreur.message : String(erreur)}` };
    }
    const domaine = `gui/${s.uid}`;
    // Chargé, il n'est pas rechargé : ce serait arrêter la station qui tourne. Le plist changé se relit à la prochaine
    // ouverture de session ; un agent qui ne tourne pas est lancé.
    if ((await s.executer("launchctl", ["print", `${domaine}/${ETIQUETTE}`])).code === 0) {
      const lance = await s.executer("launchctl", ["kickstart", `${domaine}/${ETIQUETTE}`]);
      return lance.code === 0 ? { par: "launchd" } : { refus: echec(`launchd did not start the station's agent ${domaine}/${ETIQUETTE}`, lance) };
    }
    const charge = await s.executer("launchctl", ["bootstrap", domaine, chemin]);
    return charge.code === 0 ? { par: "launchd" } : { refus: echec(`launchd refused the station's agent ${chemin}`, charge) };
  }
  if (s.plateforme === "win32") {
    const dossier = dossierWindows(s.localAppData);
    if (dossier === undefined) return { refus: "LOCALAPPDATA is not set: the station's logon start cannot be written" };
    if (existsSync(join(dossier, "lancer-station.ps1"))) return { par: "installeur" };
    const inscrit = await s.executer("reg", ["add", CLE_RUN, "/v", VALEUR_RUN, "/t", "REG_SZ", "/d", `"${s.binaire}" ${ARGUMENT_FOND}`, "/f"]);
    if (inscrit.code !== 0) return { refus: echec(`the station's logon start could not be written (${CLE_RUN}, ${VALEUR_RUN})`, inscrit) };
    try {
      mkdirSync(dossier, { recursive: true });
      writeFileSync(join(dossier, INSCRITE_PAR_L_APP), `${VALEUR_RUN}\n`);
    } catch (erreur) {
      return { refus: `the station's logon start is written, but the menu bar icon cannot know it (${dossier}): ${erreur instanceof Error ? erreur.message : String(erreur)}` };
    }
    return { par: "run" };
  }
  return { par: "aucune" };
}

// Sous Windows, l'hôte écrit son pid là où « Quit the station » de l'icône de fond le cherche (tray-fond/systeme.ts) —
// sauf quand le lanceur de l'installeur tient ce dossier. Ailleurs, rien : launchd arrête l'agent par son étiquette.
export function ecrireLePidPourLIcone(s: { plateforme: NodeJS.Platform; localAppData: string | undefined; pid: number; dire: (ligne: string) => void }): void {
  if (s.plateforme !== "win32") return;
  const dossier = dossierWindows(s.localAppData);
  if (dossier === undefined || existsSync(join(dossier, "lancer-station.ps1"))) return;
  try {
    mkdirSync(dossier, { recursive: true });
    writeFileSync(join(dossier, "station.pid"), `${s.pid}\n`);
  } catch (erreur) {
    s.dire(`brigade: the menu bar icon will not find the background station to quit it (${dossier}): ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  }
}
