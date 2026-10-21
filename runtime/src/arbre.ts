// L'arbre d'un process : lui, et tout ce qu'il a lancé. Le runtime arrête un
// cook, un script de gates, un serveur par son arbre entier — rien ne survit à
// celui qui l'a lancé.
//
// Sous macOS et Linux, l'arbre est le groupe de process : lancé détaché, le
// process en est le chef, et un signal au groupe (`kill(-pid)`) atteint tout ce
// qu'il a lancé, même après sa mort. SIGTERM laisse sa grâce, SIGKILL n'en
// laisse aucune.
//
// Sous Windows, il n'y a ni groupe ni signal : `process.kill` y tue un seul
// process, sur-le-champ, et laisse ses enfants. L'arbre s'y lit dans la table
// des process, de parent en enfant — Windows garde le pid d'un parent mort, si
// bien que les enfants d'un cook déjà sorti s'y retrouvent aussi —, et chacun
// est tué sur-le-champ : SIGTERM y vaut SIGKILL, il n'y a pas de grâce. Un
// process né avant `depuis` n'est pas de l'arbre : son pid a été repris.
//
// L'appel rend la main une fois l'arbre tué : ce qui suit — la fin d'un cook
// écrite — ne voit plus rien de lui.
import { spawnSync } from "./sans-invite.ts";

export type OptionsArbre = {
  // L'instant (ms depuis l'époque) où la racine a été lancée. Sous Windows, un
  // process né avant n'est pas de l'arbre.
  depuis?: number;
  // Pour les tests : la plateforme qu'on simule.
  plateforme?: NodeJS.Platform;
};

// Ce qui tue l'arbre sous Windows : PowerShell, présent sur toute machine
// Windows, lit la table des process (`Win32_Process`).
export const POWERSHELL = "powershell.exe";

// Le script PowerShell qui tue l'arbre de `racine`. Il refait le tour tant
// qu'un process de l'arbre vit encore : un enfant lancé pendant qu'on tuait son
// parent est pris au tour suivant.
export function scriptDeLArbre(racine: number, depuis?: number): string {
  // Une seconde de marge : l'heure de création de Windows et celle de Node ne
  // se lisent pas à la même horloge.
  const borne = depuis === undefined ? "$null" : `[DateTimeOffset]::FromUnixTimeMilliseconds(${Math.floor(depuis) - 1000}).UtcDateTime`;
  return [
    "$ErrorActionPreference = 'SilentlyContinue'",
    `$racine = ${racine}`,
    `$depuis = ${borne}`,
    "for ($tour = 0; $tour -lt 5; $tour++) {",
    "  $table = @(Get-CimInstance Win32_Process | ForEach-Object { [pscustomobject]@{ Id = [int]$_.ProcessId; Parent = [int]$_.ParentProcessId; Ne = $(if ($_.CreationDate) { $_.CreationDate.ToUniversalTime() } else { [DateTime]::MinValue }) } })",
    "  $ne = @{}",
    "  foreach ($p in $table) { $ne[$p.Id] = $p.Ne }",
    // La racine vit, mais est née avant son lancement : ce pid n'est plus le sien.
    "  if ($null -ne $depuis -and $ne.ContainsKey($racine) -and $ne[$racine] -lt $depuis) { exit 0 }",
    "  $arbre = @{ $racine = $true }",
    "  do {",
    "    $ajoutes = 0",
    "    foreach ($p in $table) {",
    "      if ($arbre.ContainsKey($p.Id) -or -not $arbre.ContainsKey($p.Parent) -or $p.Id -eq $PID) { continue }",
    "      if ($null -ne $depuis -and $p.Ne -lt $depuis) { continue }",
    "      if ($ne.ContainsKey($p.Parent) -and $p.Ne -lt $ne[$p.Parent]) { continue }",
    "      $arbre[$p.Id] = $true",
    "      $ajoutes++",
    "    }",
    "  } while ($ajoutes -gt 0)",
    "  $vivants = @($arbre.Keys | Where-Object { $ne.ContainsKey($_) })",
    "  if ($vivants.Count -eq 0) { exit 0 }",
    "  foreach ($id in $vivants) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }",
    "}",
  ].join("\n");
}

// Envoie `signal` à l'arbre de `pid`. Ne lève pas : un arbre qui n'existe plus
// n'a plus personne à arrêter.
export function signalerLArbre(pid: number, signal: NodeJS.Signals, options: OptionsArbre = {}): void {
  if (!Number.isSafeInteger(pid) || pid <= 0) return;
  if ((options.plateforme ?? process.platform) !== "win32") {
    try {
      process.kill(-pid, signal);
    } catch {
      // Le groupe n'existe plus.
    }
    return;
  }
  // `-EncodedCommand` : le script passe tel quel, sans les règles de guillemets
  // de la ligne de commande de Windows.
  const encode = Buffer.from(scriptDeLArbre(pid, options.depuis), "utf16le").toString("base64");
  spawnSync(POWERSHELL, ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encode], { stdio: "ignore", windowsHide: true, timeout: 60_000 });
}
