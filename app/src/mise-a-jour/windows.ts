// L'app installée sous Windows se remplace par la version téléchargée (etat.ts), comme celle du Mac
// (installation.ts) : un `.exe` qui tourne ne s'écrase pas, donc un installeur part à côté d'elle,
// détaché, et attend qu'elle soit fermée. Il écarte alors le dossier de l'app installée (un
// renommage : l'app en place n'est pas touchée), lance le setup téléchargé sans rien demander
// (`/S`) dans ce même dossier (`/D=`), vérifie que la version posée est bien celle qui était
// attendue, retire l'ancienne et rouvre l'app. Quoi qu'il échoue, il remet l'ancienne à sa place,
// écrit la raison dans `echec.txt`, que l'app rouverte dit, et rouvre l'ancienne.
//
// Le setup est celui qu'écrit app/packaging/windows.ts (WINDOWS.md) : il s'installe pour le compte,
// sans droits d'administrateur ni invite, et ne lance pas l'app en silence. L'installeur est un
// script PowerShell, qui est sur tout Windows : rien qui dépende de l'app qu'il remplace — le
// `node.exe` qu'elle porte est dans le dossier remplacé.
import { spawn } from "node:child_process";
import { accessSync, constants, existsSync } from "node:fs";
import { win32 } from "node:path";
import { ECHEC } from "./etat.ts";

// Ce que l'installeur pose à la racine du dossier de l'app (app/packaging/windows.ts, `EXE` et
// `DESINSTALLEUR`), et où il écrit la version installée (`resources/app/package.json`).
export const EXE = "Brigade.exe";
export const DESINSTALLEUR = "Uninstall Brigade.exe";

// Pourquoi l'app ne pourrait pas se remplacer là où elle est — rien quand elle le peut.
// `executable` : le `.exe` qui la joue (`process.execPath`).
export function installabiliteWindows(
  executable: string,
  existe: (chemin: string) => boolean = existsSync,
  acceder: (chemin: string) => void = (chemin) => accessSync(chemin, constants.W_OK),
): string | undefined {
  const dossier = win32.dirname(executable);
  if (win32.basename(executable).toLowerCase() !== EXE.toLowerCase()) return `this app does not run from its installed ${EXE} (${executable})`;
  if (!existe(win32.join(dossier, DESINSTALLEUR))) return `this app was not installed by its installer (no ${DESINSTALLEUR} in ${dossier}): install it with the Brigade setup, then open it from the Start menu`;
  for (const chemin of [win32.dirname(dossier), dossier]) {
    try {
      acceder(chemin);
    } catch {
      return `this account cannot write to ${chemin}`;
    }
  }
  return undefined;
}

export type OptionsInstallationWindows = {
  // Le pid de l'app à attendre.
  pid: number;
  // Le setup téléchargé et vérifié, et la version qu'il porte.
  installeur: string;
  version: string;
  // Le dossier de l'app installée : celui de son `Brigade.exe`.
  app: string;
  // Le dossier de la mise à jour, où écrire `echec.txt`.
  dossier: string;
  // Combien de fois, une demi-seconde d'écart, écarter le dossier de l'app avant d'y renoncer :
  // ce qu'elle a lancé (sa station, un terminal) peut le tenir encore un moment après elle.
  essais?: number;
  env?: Record<string, string | undefined>;
};

// Une chaîne PowerShell littérale : entre apostrophes, chacune doublée — PowerShell tient aussi les
// apostrophes typographiques pour des apostrophes.
const litteral = (texte: string) => `'${texte.replace(/['\u2018\u2019\u201a\u201b]/g, "$&$&")}'`;

// Le script de l'installeur, ses valeurs écrites dedans. Ce qui rouvre l'app se change par
// l'environnement (`BRIGADE_OUVRIR`, appelé avec le chemin de `Brigade.exe`) — les tests y mettent
// une doublure.
export function scriptWindows(options: OptionsInstallationWindows): string {
  return `$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$idApp = ${Math.trunc(options.pid)}
$installeur = ${litteral(options.installeur)}
$version = ${litteral(options.version)}
$app = ${litteral(options.app)}
$dossier = ${litteral(options.dossier)}
$essais = ${Math.max(1, Math.trunc(options.essais ?? 60))}
$exe = Join-Path $app ${litteral(EXE)}
$ancienne = Join-Path (Split-Path -Parent $app) ('.' + (Split-Path -Leaf $app) + '.ancienne.' + $PID)
$ecartee = $false
function Ouvrir([string] $chemin) {
  try {
    if ($env:BRIGADE_OUVRIR) { & $env:BRIGADE_OUVRIR $chemin } else { Start-Process -FilePath $chemin }
  } catch {}
}
function Echouer([string] $raison) {
  try { [System.IO.File]::WriteAllText((Join-Path $dossier ${litteral(ECHEC)}), "$raison\`n") } catch {}
  if ($script:ecartee) {
    if (Test-Path -LiteralPath $app) { Remove-Item -LiteralPath $app -Recurse -Force -ErrorAction SilentlyContinue }
    try { [System.IO.Directory]::Move($ancienne, $app) } catch {}
  }
  Remove-Item -LiteralPath $installeur -Force -ErrorAction SilentlyContinue
  Ouvrir $exe
  exit 1
}
try {
  # L'app se ferme : deux minutes au plus. Toujours ouverte, rien n'est remplacé ni rouvert.
  $enCours = Get-Process -Id $idApp -ErrorAction SilentlyContinue
  if ($null -ne $enCours -and -not $enCours.WaitForExit(120000)) {
    try { [System.IO.File]::WriteAllText((Join-Path $dossier ${litteral(ECHEC)}), "the app did not quit within two minutes\`n") } catch {}
    Remove-Item -LiteralPath $installeur -Force -ErrorAction SilentlyContinue
    exit 1
  }
  # L'app installée est écartée d'un renommage : tant qu'un de ses fichiers est ouvert, Windows le
  # refuse, et rien n'a bougé.
  for ($n = 1; -not $ecartee; $n++) {
    try {
      [System.IO.Directory]::Move($app, $ancienne)
      $ecartee = $true
    } catch {
      if ($n -ge $essais) { Echouer "the app's folder is still in use, the update was not installed ($app)" }
      Start-Sleep -Milliseconds 500
    }
  }
  # Le setup, sans rien demander, dans le dossier de l'app : \`/D=\` vient en dernier, sans guillemets.
  $demarrage = New-Object System.Diagnostics.ProcessStartInfo
  $demarrage.FileName = $installeur
  $demarrage.Arguments = "/S /D=$app"
  $demarrage.UseShellExecute = $false
  $demarrage.WorkingDirectory = $dossier
  $setup = [System.Diagnostics.Process]::Start($demarrage)
  if (-not $setup.WaitForExit(600000)) { Echouer "the installer of version $version did not finish within ten minutes" }
  if ($setup.ExitCode -ne 0) { Echouer "the installer of version $version failed (exit code $($setup.ExitCode))" }
  $posee = $null
  try { $posee = (Get-Content -LiteralPath (Join-Path (Join-Path (Join-Path $app 'resources') 'app') 'package.json') -Raw | ConvertFrom-Json).version } catch {}
  if (-not (Test-Path -LiteralPath $exe) -or $posee -ne $version) { Echouer "the installer did not lay version $version in $app" }
  Remove-Item -LiteralPath $ancienne -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $installeur -Force -ErrorAction SilentlyContinue
  Ouvrir $exe
  exit 0
} catch {
  Echouer "the update could not be installed: $($_.Exception.Message)"
}
`;
}

// Le PowerShell de Windows, là où il est sur tout Windows — `BRIGADE_POWERSHELL` en désigne un autre
// (les tests, ailleurs que sous Windows, y mettent `pwsh`).
export function powershellDe(env: Record<string, string | undefined>): string {
  if (env.BRIGADE_POWERSHELL) return env.BRIGADE_POWERSHELL;
  return win32.join(env.SystemRoot || env.windir || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

// Ce qui lance l'installeur : le process, ses arguments et son environnement. Le script passe
// encodé (UTF-16, base64) : ni guillemets à citer, ni fichier à écrire, et un chemin qui n'est pas
// en ASCII arrive tel quel.
export function commandeDInstallationWindows(options: OptionsInstallationWindows): { commande: string; args: string[]; env: Record<string, string | undefined> } {
  const env = options.env ?? process.env;
  const encode = Buffer.from(scriptWindows(options), "utf16le").toString("base64");
  return { commande: powershellDe(env), args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encode], env };
}

// Lance l'installeur, détaché et sans fenêtre : il survit à l'app, qui doit se fermer ensuite. Rend
// son pid ; lève s'il ne part pas.
export function lancerInstallationWindows(options: OptionsInstallationWindows): number {
  if (win32.basename(options.app) === "" || options.app.trim() === "") throw new Error(`not an installed app folder: ${options.app}`);
  const { commande, args, env } = commandeDInstallationWindows(options);
  // Son dossier de travail est celui de la mise à jour : jamais celui de l'app, qu'il doit écarter.
  const enfant = spawn(commande, args, { detached: true, stdio: "ignore", windowsHide: true, env, cwd: options.dossier });
  enfant.on("error", () => {});
  if (enfant.pid === undefined) throw new Error("the installer could not be launched");
  enfant.unref();
  return enfant.pid;
}
