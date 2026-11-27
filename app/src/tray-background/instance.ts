// Le verrou d'instance de l'icône de fond et de l'app (#3864) : un fichier qui porte le pid de celui qui tient la place, dans
// ses données à lui. Le verrou d'instance unique d'Electron ne sert plus qu'à l'app : tenu par l'icône, il passait la main
// de l'app à un process sans fenêtre, et l'app rouverte ne montrait rien.
import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

// La ligne de commande d'un process vivant, telle que le système la donne ; `undefined` quand elle ne se lit pas. `ps` la
// lit sous POSIX, PowerShell sous Windows — sans fenêtre de console, que chaque démarrage de l'app ferait clignoter.
type Launch = (command: string, args: string[], options: ExecFileSyncOptionsWithStringEncoding) => string;
export function readTheCommand(pid: number, platform: NodeJS.Platform = process.platform, launch: Launch = execFileSync): string | undefined {
  const options: ExecFileSyncOptionsWithStringEncoding = { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] };
  try {
    const readEntry =
      platform === "win32"
        ? launch("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine`], { ...options, timeout: 10_000, windowsHide: true })
        : launch("ps", ["-ww", "-o", "command=", "-p", String(pid)], { ...options, timeout: 5_000 });
    return readEntry.trim() === "" ? undefined : readEntry.trim();
  } catch {
    return undefined;
  }
}

// Le pid laissé par un process qui s'est arrêté est rendu par le système à un autre — l'icône de fond, l'hôte de la station,
// n'importe quel process (#4071). Ne tient la place que celui qui est lancé comme ce process-ci : le même binaire, les mêmes
// arguments — l'ancien `-psn_…` que le Mac ajoutait parfois, et les guillemets qu'un raccourci Windows met autour du binaire,
// mis à part. Une commande qui ne se lit pas ne prouve rien : `undefined`.
const withoutPsn = (command: string) => command.replace(/\s+-psn_\S+/g, "").replaceAll('"', "").trim();
function launchesAsItself(pid: number, itself: number, read: (pid: number) => string | undefined): boolean | undefined {
  const other = read(pid);
  const we = read(itself);
  if (other === undefined || we === undefined) return undefined;
  return withoutPsn(other) === withoutPsn(we);
}
export const sameProcess = (pid: number, itself: number, read: (pid: number) => string | undefined): boolean => launchesAsItself(pid, itself, read) === true;
// Le contraire prudent : un process qu'on sait lancé autrement que celui-ci. Une commande qui ne se lit pas n'en dit rien.
const otherProcess = (pid: number, itself: number): boolean => launchesAsItself(pid, itself, readTheCommand) === false;

// Le pid d'un autre process qui tient déjà la place ; `undefined` si elle est libre — fichier absent, illisible, d'un
// process mort, ou d'un process que `estTenant` ne reconnaît pas — par défaut, un process qu'on sait lancé autrement que
// celui-ci : le pid d'une icône arrêtée peut être rendu à l'app, ou à l'hôte de la station (#4071). Une place libre est
// réécrite avec le pid de ce process.
export function heldPar(file: string, itself: number = process.pid, isHolding: (pid: number) => boolean = (pid) => !otherProcess(pid, itself)): number | undefined {
  let pid = 0;
  try {
    pid = Number(readFileSync(file, "utf8").trim());
  } catch {
    pid = 0;
  }
  if (!Number.isInteger(pid) || pid <= 0 || pid === itself || !alive(pid)) return undefined;
  return isHolding(pid) ? pid : undefined;
}

// Prend la place si elle est libre ; rend le pid de celui qui la tient sinon.
export function takeThePlace(file: string, itself: number = process.pid, isHolding?: (pid: number) => boolean): number | undefined {
  const holding = heldPar(file, itself, isHolding);
  if (holding !== undefined) return holding;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, String(itself));
  return undefined;
}
