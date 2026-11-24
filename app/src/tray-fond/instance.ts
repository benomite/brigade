// Le verrou d'instance de l'icône de fond et de l'app (#3864) : un fichier qui porte le pid de celui qui tient la place, dans
// ses données à lui. Le verrou d'instance unique d'Electron ne sert plus qu'à l'app : tenu par l'icône, il passait la main
// de l'app à un process sans fenêtre, et l'app rouverte ne montrait rien.
import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function vivant(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (erreur) {
    return (erreur as NodeJS.ErrnoException).code === "EPERM";
  }
}

// La ligne de commande d'un process vivant, telle que le système la donne ; `undefined` quand elle ne se lit pas. `ps` la
// lit sous POSIX, PowerShell sous Windows — sans fenêtre de console, que chaque démarrage de l'app ferait clignoter.
type Lancer = (commande: string, args: string[], options: ExecFileSyncOptionsWithStringEncoding) => string;
function lireLaCommande(pid: number, plateforme: NodeJS.Platform = process.platform, lancer: Lancer = execFileSync): string | undefined {
  const options: ExecFileSyncOptionsWithStringEncoding = { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] };
  try {
    const lue =
      plateforme === "win32"
        ? lancer("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine`], { ...options, timeout: 10_000, windowsHide: true })
        : lancer("ps", ["-ww", "-o", "command=", "-p", String(pid)], { ...options, timeout: 5_000 });
    return lue.trim() === "" ? undefined : lue.trim();
  } catch {
    return undefined;
  }
}

// Le pid laissé par un process qui s'est arrêté est rendu par le système à un autre — l'icône de fond, l'hôte de la station,
// n'importe quel process (#4071). Ne tient la place que celui qui est lancé comme ce process-ci : le même binaire, les mêmes
// arguments — l'ancien `-psn_…` que le Mac ajoutait parfois, et les guillemets qu'un raccourci Windows met autour du binaire,
// mis à part. Une commande qui ne se lit pas ne prouve rien : `undefined`.
const sansPsn = (commande: string) => commande.replace(/\s+-psn_\S+/g, "").replaceAll('"', "").trim();
function lanceCommeSoi(pid: number, soi: number, lire: (pid: number) => string | undefined): boolean | undefined {
  const autre = lire(pid);
  const nous = lire(soi);
  if (autre === undefined || nous === undefined) return undefined;
  return sansPsn(autre) === sansPsn(nous);
}
const memeProcess = (pid: number, soi: number, lire: (pid: number) => string | undefined): boolean => lanceCommeSoi(pid, soi, lire) === true;
// Le contraire prudent : un process qu'on sait lancé autrement que celui-ci. Une commande qui ne se lit pas n'en dit rien.
const autreProcess = (pid: number, soi: number): boolean => lanceCommeSoi(pid, soi, lireLaCommande) === false;

// Le pid d'un autre process qui tient déjà la place ; `undefined` si elle est libre — fichier absent, illisible, d'un
// process mort, ou d'un process que `estTenant` ne reconnaît pas — par défaut, un process qu'on sait lancé autrement que
// celui-ci : le pid d'une icône arrêtée peut être rendu à l'app, ou à l'hôte de la station (#4071). Une place libre est
// réécrite avec le pid de ce process.
export function tenuePar(fichier: string, soi: number = process.pid, estTenant: (pid: number) => boolean = (pid) => !autreProcess(pid, soi)): number | undefined {
  let pid = 0;
  try {
    pid = Number(readFileSync(fichier, "utf8").trim());
  } catch {
    pid = 0;
  }
  if (!Number.isInteger(pid) || pid <= 0 || pid === soi || !vivant(pid)) return undefined;
  return estTenant(pid) ? pid : undefined;
}

// Prend la place si elle est libre ; rend le pid de celui qui la tient sinon.
export function prendreLaPlace(fichier: string, soi: number = process.pid, estTenant?: (pid: number) => boolean): number | undefined {
  const tenant = tenuePar(fichier, soi, estTenant);
  if (tenant !== undefined) return tenant;
  mkdirSync(dirname(fichier), { recursive: true });
  writeFileSync(fichier, String(soi));
  return undefined;
}

// L'app qui s'ouvre passe-t-elle la main à une autre (#3864, #4071) ? Seulement quand le verrou d'Electron lui est refusé et
// que sa place est tenue par une app lancée comme elle. Le verrou rendu, aucune autre app ne tourne : la place est prise sans
// lire de ligne de commande — `ps`, ou PowerShell sous Windows, ne ralentit que le démarrage où le verrou est refusé.
export function autreAppTourne(fichier: string, verrouRendu: boolean, soi: number = process.pid, plateforme: NodeJS.Platform = process.platform, lancer: Lancer = execFileSync): boolean {
  const lire = (pid: number) => lireLaCommande(pid, plateforme, lancer);
  const tenant = prendreLaPlace(fichier, soi, (pid) => !verrouRendu && memeProcess(pid, soi, lire));
  return !verrouRendu && typeof tenant === "number";
}
