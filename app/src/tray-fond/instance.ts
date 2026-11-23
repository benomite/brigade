// Le verrou d'instance de l'icône de fond et de l'app (#3864) : un fichier qui porte le pid de celui qui tient la place, dans
// ses données à lui. Le verrou d'instance unique d'Electron ne sert plus qu'à l'app : tenu par l'icône, il passait la main
// de l'app à un process sans fenêtre, et l'app rouverte ne montrait rien.
import { execFileSync } from "node:child_process";
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

// La ligne de commande d'un process vivant, telle que le système la donne ; `undefined` quand elle ne se lit pas.
function commandeDe(pid: number, plateforme: NodeJS.Platform = process.platform): string | undefined {
  try {
    const lue =
      plateforme === "win32"
        ? execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine`], { encoding: "utf8", timeout: 10_000, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] })
        : execFileSync("ps", ["-ww", "-o", "command=", "-p", String(pid)], { encoding: "utf8", timeout: 5_000, stdio: ["ignore", "pipe", "ignore"] });
    const commande = lue.trim();
    return commande === "" ? undefined : commande;
  } catch {
    return undefined;
  }
}

// Le pid laissé par un process qui s'est arrêté est rendu par le système à un autre — l'icône de fond, l'hôte de la station,
// n'importe quel process (#4071). Ne tient la place que celui qui est lancé comme ce process-ci : le même binaire, les mêmes
// arguments — l'ancien `-psn_…` que le Mac ajoutait parfois mis à part. Une commande qui ne se lit pas ne prouve rien.
const sansPsn = (commande: string) => commande.replace(/\s+-psn_\S+/g, "").trim();
export function memeProcess(pid: number, soi: number = process.pid, lire: (pid: number) => string | undefined = commandeDe): boolean {
  const autre = lire(pid);
  const nous = lire(soi);
  return autre !== undefined && nous !== undefined && sansPsn(autre) === sansPsn(nous);
}

// Le pid d'un autre process qui tient déjà la place ; `undefined` si elle est libre — fichier absent, illisible, d'un
// process mort, ou d'un process que `estTenant` ne reconnaît pas. Une place libre est réécrite avec le pid de ce process.
export function tenuePar(fichier: string, soi: number = process.pid, estTenant: (pid: number) => boolean = () => true): number | undefined {
  let pid = 0;
  try {
    pid = Number(readFileSync(fichier, "utf8").trim());
  } catch {
    pid = 0;
  }
  return Number.isInteger(pid) && pid > 0 && pid !== soi && vivant(pid) && estTenant(pid) ? pid : undefined;
}

// Prend la place si elle est libre ; rend le pid de celui qui la tient sinon.
export function prendreLaPlace(fichier: string, soi: number = process.pid, estTenant?: (pid: number) => boolean): number | undefined {
  const tenant = tenuePar(fichier, soi, estTenant);
  if (tenant !== undefined) return tenant;
  mkdirSync(dirname(fichier), { recursive: true });
  writeFileSync(fichier, String(soi));
  return undefined;
}
