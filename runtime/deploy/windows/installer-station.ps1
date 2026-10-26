# Installs a brigade station on Windows, in one command -- the one in the guide
# (docs/installation-station.md, "On Windows"), pasted into PowerShell, under your account:
#
#   irm https://github.com/<owner>/<repo>/releases/latest/download/installer-station.ps1 | iex
#
# It is the Windows side of runtime/deploy/installer-station.sh, and it does what that script does
# on a Mac: the same station, the same configuration, the same two sign-ins. Nothing is written by
# hand, before or after -- no environment file, no task, no shortcut.
# The station comes from the latest published version. To install another one -- built by hand, on
# a test machine --, give its archive (brigade-station-windows.zip), by its path or its address:
#
#   powershell -ExecutionPolicy Bypass -File installer-station.ps1 .\brigade-station-windows.zip
#
# Under your account, without administrator rights: the station runs under it, as the app would run
# it, with your `claude` and your `gh`. The command puts under %LOCALAPPDATA%\brigade-station the
# runtime of the published version and the `node` it requires (nodejs.org, checked against its
# checksums), writes the launcher that starts it at logon and relaunches it if it stops (the
# `brigade-station` value of HKCU\Software\Microsoft\Windows\CurrentVersion\Run), starts it, and
# waits until it runs. `git` and `gh` are installed if missing (winget -- Windows may ask you to
# allow their installers), and `claude` by its official installer. The station keeps the same
# directory as the app's (%USERPROFILE%\.config\brigade\station): only one runs at a time, the other
# waits until it stops.
#
# Then, if someone is at the terminal, the two sign-ins, once each, and nothing else:
#   - GitHub: `gh auth login --web`, then `gh auth setup-git`;
#   - Claude: `claude auth login`, like the app's button.
#
# Rerunning it is safe: it installs only what changed, leaves the station running if nothing
# changed, and does not redo a sign-in already made. It is also how a Windows station moves to the
# latest version.
#
# The file is plain ASCII: Windows PowerShell 5.1 reads a script without a byte order mark in the
# machine's code page, and `irm` hands it over in whatever encoding the download says.
#
# Exit code (`$LASTEXITCODE` when piped into `iex`, which leaves the window open):
#   0  station installed and running -- signed in, or without a terminal to be
#   1  installation refused or failed, or a sign-in not made, said in one line

$brigade = @{ code = 0 }
& {
  # The caller's session keeps its own preferences: these are this block's.
  $ErrorActionPreference = 'Continue'
  $ProgressPreference = 'SilentlyContinue'
  $PSNativeCommandUseErrorActionPreference = $false

  # The GitHub repository that publishes the station: set in this script when it is published (the
  # placeholder below), or given by BRIGADE_DEPOT. None is assumed.
  $Depot = $env:BRIGADE_DEPOT
  if (-not $Depot) { $Depot = '@DEPOT@' }
  # The time left to the station to say it runs. A guard, not a measure.
  $Garde = 60
  # The node the runtime requires (`engines` of its package.json).
  $NodeMajeur = '26'
  $NodeDist = "https://nodejs.org/dist/latest-v$NodeMajeur.x"
  $Nom = 'brigade-station'
  $Run = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
  $Sep = [IO.Path]::PathSeparator

  function Dire([string]$ligne) { Write-Host "brigade: $ligne" }
  function Refuser([string]$pourquoi) {
    [Console]::Error.WriteLine("brigade: installation refused -- $pourquoi")
    throw 'brigade-arret'
  }
  # A sign-in that did not go through: the station stays installed.
  function NonConnectee([string]$quoi) {
    [Console]::Error.WriteLine("brigade: the station is installed, but $quoi (the line above says why) -- rerun the same command to resume")
    throw 'brigade-arret'
  }
  # The terminal where the sign-ins talk. The tests give a file instead: present if it exists.
  function Terminal {
    if ($env:BRIGADE_TERMINAL) { return (Test-Path -LiteralPath $env:BRIGADE_TERMINAL) }
    return ([Environment]::UserInteractive -and -not [Console]::IsInputRedirected)
  }
  function Commande([string]$nom) { return [bool](Get-Command $nom -CommandType Application -ErrorAction SilentlyContinue) }
  # A path, without asking any drive whether it exists (Join-Path does).
  function Dans([string]$dossier, [string]$quoi) { return [IO.Path]::Combine($dossier, $quoi) }
  # A value written into the launcher, between single quotes.
  function Cite([string]$valeur) { return "'" + $valeur.Replace("'", "''") + "'" }

  function Telecharger([string]$adresse, [string]$fichier) {
    & curl.exe -fsSL -o $fichier $adresse
    return ($LASTEXITCODE -eq 0)
  }
  # Puts in the file $fichier what $source names, an address or a path.
  function Obtenir([string]$source, [string]$fichier) {
    if ($source -match '^https?://') {
      Dire "downloading the station -- $source"
      if (-not (Telecharger $source $fichier)) { Refuser "the download failed ($source)" }
    } else {
      if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { Refuser "$source does not exist" }
      Copy-Item -LiteralPath $source -Destination $fichier
    }
  }
  function Ouvrir([string]$zip, [string]$dossier) {
    try {
      Add-Type -AssemblyName System.IO.Compression.FileSystem
      [IO.Compression.ZipFile]::ExtractToDirectory($zip, $dossier)
      return $true
    } catch { return $false }
  }
  # The version a runtime's package.json carries, or nothing.
  function VersionDe([string]$paquet) {
    try { return [string](Get-Content -LiteralPath $paquet -Raw -ErrorAction Stop | ConvertFrom-Json).version } catch { return '' }
  }
  function Pareil([string]$a, [string]$b) {
    if (-not (Test-Path -LiteralPath $b -PathType Leaf)) { return $false }
    return ([IO.File]::ReadAllText($a) -ceq [IO.File]::ReadAllText($b))
  }
  # The pid a launcher wrote ($fichier), if a node process still has it.
  function PidVivant([string]$fichier) {
    try { $lu = ([IO.File]::ReadAllText($fichier)).Trim() } catch { return $null }
    if ($lu -notmatch '^[0-9]+$') { return $null }
    $process = Get-Process -Id ([int]$lu) -ErrorAction SilentlyContinue
    if ($process -and $process.ProcessName -eq 'node') { return [int]$lu }
    return $null
  }
  # The machine's and the account's PATH, read again: what winget just installed is on it.
  function RelirePath {
    foreach ($portee in 'Machine', 'User') {
      $lu = [Environment]::GetEnvironmentVariable('Path', $portee)
      if ($lu) { $env:PATH = $env:PATH + $Sep + $lu }
    }
  }
  function ParWinget([string]$outil, [string]$id, [string]$ailleurs) {
    if (-not (Commande 'winget')) { Refuser "$outil is missing, and so is winget to install it: install $outil ($ailleurs), then rerun the same command" }
    Dire "installing $outil, by winget -- Windows may ask you to allow its installer"
    & winget install --id $id --exact --source winget --silent --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { Refuser "winget could not install $outil (its output is above)" }
    RelirePath
    if (-not (Commande $outil)) { Refuser "$outil is installed but not found yet: open a new PowerShell window, and rerun the same command there" }
  }

  # The GitHub sign-in. Already made, it is not made again; `setup-git` always is -- it asks
  # nothing, and git pushes through `gh`.
  function ConnexionGithub {
    & gh auth status --hostname github.com *> $null
    if ($LASTEXITCODE -eq 0) {
      Dire 'GitHub: already signed in -- nothing to redo'
    } else {
      Write-Host ''
      Dire 'the GitHub sign-in of the station -- a code to type on the GitHub page that `gh` gives, only once'
      & gh auth login --hostname github.com --web --git-protocol https
      if ($LASTEXITCODE -ne 0) { return $false }
    }
    & gh auth setup-git
    return ($LASTEXITCODE -eq 0)
  }

  # ---------------------------------------------------------------------------------------------
  # The launcher: what the logon starts, hidden. It gives the station what it runs with, then
  # hands it to lancer-station.mjs.
  function Lanceur([string]$base, [string]$racine, [string]$node, [string]$maison) {
    $chemin = (Dans $base 'node') + $Sep + (Dans (Dans $maison '.local') 'bin') + $Sep
    return @"
# Written by installer-station.ps1, and rewritten on each run: do not edit.
# Started at logon by the '$Nom' value of HKCU\Software\Microsoft\Windows\CurrentVersion\Run.
# What the station runs with: the same as on a Mac (installer-station.sh).
`$env:BRIGADE_STATION_DIR = $(Cite $racine)
`$env:PATH = $(Cite $chemin) + `$env:PATH
& $(Cite $node) $(Cite (Dans $base 'lancer-station.mjs'))
exit `$LASTEXITCODE
"@
  }

  # What the launcher runs: the station, when the app does not already hold it. It takes the
  # directory the way the app takes it (`app.pid`, app/src/poste/station.ts) and keeps it until it
  # stops: the app opened afterwards sees it held, and does not launch a second one. Relaunched 5 s
  # after a failure, like a server's (brigade-station.service: Restart=on-failure), except when it
  # refused to start (code 2): retrying would change nothing.
  $Lancement = @'
// Written by installer-station.ps1, and rewritten on each run: do not edit.
import { spawn } from "node:child_process";
import { appendFileSync, closeSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ici = import.meta.dirname;
const racine = process.env.BRIGADE_STATION_DIR;
const tenue = join(racine, "app.pid");
const journal = join(ici, "brigade-station.log");
const dire = (ligne) => appendFileSync(journal, `brigade: ${ligne}\n`);
const attendre = (ms) => new Promise((fin) => setTimeout(fin, ms));
const lire = (fichier) => {
  try {
    return readFileSync(fichier, "utf8").trim();
  } catch {
    return "";
  }
};
// A live pid, or one the system refuses to probe: another account has it, it is not dead.
const vivant = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (erreur) {
    return erreur.code === "EPERM";
  }
};

writeFileSync(join(ici, "lanceur.pid"), `${process.pid}\n`);
mkdirSync(racine, { recursive: true });
let dit = false;
for (;;) {
  try {
    writeFileSync(tenue, `${process.pid}\n`, { flag: "wx" });
    break;
  } catch (erreur) {
    if (erreur.code !== "EEXIST") throw erreur;
  }
  const lu = lire(tenue);
  if (lu === String(process.pid)) break;
  if (!/^[0-9]+$/.test(lu)) {
    // Being written, or unreadable for good.
    await attendre(1000);
    if (lire(tenue) === lu) rmSync(tenue, { force: true });
  } else if (vivant(Number(lu))) {
    if (!dit) dire(`this computer's station is held by the app (pid ${lu}) -- this one takes it over when the app closes`);
    dit = true;
    await attendre(30_000);
  } else {
    // An app gone without giving the station back: its mark holds nothing any more.
    rmSync(tenue, { force: true });
  }
}
const rendre = () => {
  if (lire(tenue) === String(process.pid)) rmSync(tenue, { force: true });
};

for (;;) {
  const sortie = openSync(journal, "a");
  const station = spawn(process.execPath, ["src/station/main.ts"], { cwd: join(ici, "runtime"), stdio: ["ignore", sortie, sortie], windowsHide: true });
  if (station.pid !== undefined) writeFileSync(join(ici, "station.pid"), `${station.pid}\n`);
  const code = await new Promise((fin) => {
    station.once("error", () => fin(-1));
    station.once("exit", (fini) => fin(fini ?? -1));
  });
  closeSync(sortie);
  rmSync(join(ici, "station.pid"), { force: true });
  if (code === 0 || code === 2) {
    if (code === 2) dire("this computer's station refused to start (the lines above say why) -- it is not launched again until you log in again or rerun the install command");
    rendre();
    process.exit(code);
  }
  dire(`this computer's station stopped (code ${code}) -- relaunched in 5 s`);
  await attendre(5_000);
}
'@

  # ---------------------------------------------------------------------------------------------

  function Installer([string]$demande) {
    if ($env:OS -ne 'Windows_NT') { Refuser "this command installs a station on Windows -- on Linux or macOS, the command is installer-station.sh (docs/installation-station.md)" }
    $architecture = $env:PROCESSOR_ARCHITEW6432
    if (-not $architecture) { $architecture = $env:PROCESSOR_ARCHITECTURE }
    switch ($architecture) {
      'AMD64' { $narch = 'x64' }
      'ARM64' { $narch = 'arm64' }
      default { Refuser "no node for the architecture $architecture (AMD64, ARM64)" }
    }
    if ($demande) {
      $source = $demande
    } else {
      if ($Depot -notmatch '^[^/]+/[^/]+$') { Refuser "no repository is named to download the station from -- give what to install (a path or an address) as an argument, or BRIGADE_DEPOT=<owner>/<repo> of the GitHub repository that publishes brigade" }
      $source = "https://github.com/$Depot/releases/latest/download/$Nom-windows.zip"
    }
    if (-not (Commande 'curl.exe')) { Refuser 'curl.exe is missing to download the station: it comes with Windows 10 (1803) and later' }
    if (-not $env:LOCALAPPDATA -or -not $env:USERPROFILE) { Refuser 'LOCALAPPDATA or USERPROFILE is not defined' }

    $base = Dans $env:LOCALAPPDATA $Nom
    $racine = Dans (Dans (Dans $env:USERPROFILE '.config') 'brigade') 'station'
    $journal = Dans $base "$Nom.log"
    $node = Dans (Dans $base 'node') 'node.exe'
    $lanceurPid = Dans $base 'lanceur.pid'
    New-Item -ItemType Directory -Force -Path $base, $racine | Out-Null
    $travail = Dans $base (".travail-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force -Path $travail | Out-Null
    try {
      # What the station runs: git, gh and claude.
      if (-not (Commande 'git')) { ParWinget 'git' 'Git.Git' 'https://git-scm.com/download/win' }
      if (-not (Commande 'gh')) { ParWinget 'gh' 'GitHub.cli' 'https://cli.github.com' }
      if (-not (Commande 'claude')) {
        Dire 'installing claude, by its official installer'
        $installeur = Dans $travail 'install.ps1'
        if (-not (Telecharger 'https://claude.ai/install.ps1' $installeur)) { Refuser "claude's installer does not download (https://claude.ai/install.ps1)" }
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installeur
        if ($LASTEXITCODE -ne 0) { Refuser "claude's installer failed (its output is above)" }
        $env:PATH = (Dans (Dans $env:USERPROFILE '.local') 'bin') + $Sep + $env:PATH
        if (-not (Commande 'claude')) { Refuser 'claude is installed but not found yet: open a new PowerShell window, and rerun the same command there' }
      }

      # The station's node, kept as long as it is of the required version.
      $nodeNeuf = $null
      $majeur = ''
      if (Test-Path -LiteralPath $node -PathType Leaf) {
        $dit = & $node -v 2> $null
        if ("$dit" -match '^v([0-9]+)\.') { $majeur = $Matches[1] }
      }
      if ($majeur -ne $NodeMajeur) {
        $sommes = Dans $travail 'SHASUMS256.txt'
        if (-not (Telecharger "$NodeDist/SHASUMS256.txt" $sommes)) { Refuser "the node versions cannot be read ($NodeDist)" }
        $ligne = Get-Content -LiteralPath $sommes | Where-Object { $_ -match "^[0-9a-f]{64}  node-v$NodeMajeur\.[0-9.]+-win-$narch\.zip$" } | Select-Object -First 1
        if (-not $ligne) { Refuser "no node $NodeMajeur for win-$narch in $NodeDist" }
        $empreinte, $archive = $ligne -split '  ', 2
        Dire "downloading $($archive -replace '\.zip$', '')"
        $zip = Dans $travail $archive
        if (-not (Telecharger "$NodeDist/$archive" $zip)) { Refuser "node does not download ($NodeDist/$archive)" }
        if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $empreinte) { Refuser "the checksum of $archive is not the one nodejs.org publishes" }
        $ouvert = Dans $travail 'node-zip'
        if (-not (Ouvrir $zip $ouvert)) { Refuser "node's archive does not open" }
        $nodeNeuf = Dans $ouvert ($archive -replace '\.zip$', '')
        if (-not (Test-Path -LiteralPath (Dans $nodeNeuf 'node.exe') -PathType Leaf)) { Refuser "node's archive does not carry node.exe ($archive)" }
      }

      # The runtime of the published version, put in place if it is not that one already.
      $paquet = Dans $travail "$Nom-windows.zip"
      Obtenir $source $paquet
      $neuf = Dans $travail 'neuf'
      if (-not (Ouvrir $paquet $neuf)) { Refuser "the station's archive does not open ($source)" }
      if (-not (Test-Path -LiteralPath (Dans (Dans (Dans (Dans $neuf 'runtime') 'src') 'station') 'main.ts') -PathType Leaf)) { Refuser "the archive does not carry the station's runtime ($source)" }
      $version = VersionDe (Dans (Dans $neuf 'runtime') 'package.json')
      $runtime = Dans $base 'runtime'
      $runtimeChange = (-not (Test-Path -LiteralPath $runtime)) -or ($version -ne (VersionDe (Dans $runtime 'package.json')))

      # The launcher, and what it runs.
      $bom = New-Object Text.UTF8Encoding $true
      [IO.File]::WriteAllText((Dans $travail 'lancer-station.ps1'), (Lanceur $base $racine $node $env:USERPROFILE), $bom)
      [IO.File]::WriteAllText((Dans $travail 'lancer-station.mjs'), $Lancement)
      $lanceursChanges = @('lancer-station.ps1', 'lancer-station.mjs' | Where-Object { -not (Pareil (Dans $travail $_) (Dans $base $_)) })

      $change = ($null -ne $nodeNeuf) -or $runtimeChange -or ($lanceursChanges.Count -gt 0)
      $tourne = PidVivant $lanceurPid
      if ($change -and $tourne) {
        # Its node and its runtime are replaced under it: it stops first. Its cooks are left to
        # finish their work, as on a server (KillMode=process): the station that comes back takes
        # them over.
        Dire 'stopping the station to move it to what changed'
        $station = PidVivant (Dans $base 'station.pid')
        Stop-Process -Id $tourne -Force -ErrorAction SilentlyContinue
        if ($station) { Stop-Process -Id $station -Force -ErrorAction SilentlyContinue }
        $attendu = 0
        while ((PidVivant $lanceurPid) -or ($station -and (PidVivant (Dans $base 'station.pid')))) {
          $attendu++
          if ($attendu -gt $Garde) { Refuser "the running station does not stop (pid $tourne)" }
          Start-Sleep -Seconds 1
        }
        $tenue = Dans $racine 'app.pid'
        if ((Test-Path -LiteralPath $tenue) -and ([IO.File]::ReadAllText($tenue).Trim() -eq "$tourne")) { Remove-Item -LiteralPath $tenue -Force }
        $tourne = $null
      }
      if ($nodeNeuf) {
        if (Test-Path -LiteralPath (Dans $base 'node')) { Remove-Item -LiteralPath (Dans $base 'node') -Recurse -Force }
        Move-Item -LiteralPath $nodeNeuf -Destination (Dans $base 'node')
      }
      if ($runtimeChange) {
        if (Test-Path -LiteralPath $runtime) { Move-Item -LiteralPath $runtime -Destination (Dans $travail 'ancien') }
        Move-Item -LiteralPath (Dans $neuf 'runtime') -Destination $runtime
      }
      foreach ($fichier in $lanceursChanges) { Move-Item -LiteralPath (Dans $travail $fichier) -Destination (Dans $base $fichier) -Force }

      # Started at logon, hidden; written on each run, which changes nothing when it is the same.
      $powershell = Dans (Dans (Dans (Dans $env:SystemRoot 'System32') 'WindowsPowerShell') 'v1.0') 'powershell.exe'
      $arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$(Dans $base 'lancer-station.ps1')`""
      try {
        Set-ItemProperty -Path $Run -Name $Nom -Value "`"$powershell`" $arguments" -ErrorAction Stop
      } catch { Refuser "the logon start of the station cannot be written ($Run, $Nom): $($_.Exception.Message)" }

      if ($tourne) {
        Dire 'nothing new: the station already runs this version'
      } else {
        Remove-Item -LiteralPath $lanceurPid, (Dans $base 'station.pid') -Force -ErrorAction SilentlyContinue
        Start-Process -FilePath $powershell -ArgumentList $arguments -WindowStyle Hidden
        $attendu = 0
        while (-not (PidVivant $lanceurPid)) {
          $attendu++
          if ($attendu -gt $Garde) {
            if (Test-Path -LiteralPath $journal) { Get-Content -LiteralPath $journal -Tail 20 | ForEach-Object { [Console]::Error.WriteLine($_) } }
            Refuser "the station does not run $Garde s after the installation -- its log: $journal"
          }
          Start-Sleep -Seconds 1
        }
      }
    } finally {
      Remove-Item -LiteralPath $travail -Recurse -Force -ErrorAction SilentlyContinue
    }
    Write-Host ''
    Dire "station installed and running -- $version (its launcher: pid $(PidVivant $lanceurPid); its log: $journal)"

    if (-not (Terminal)) {
      Dire "next: the GitHub sign-in and the Claude sign-in, then pairing with the app -- no terminal here for the sign-ins: rerun the same command from a PowerShell window (the guide: docs/installation-station.md, repository $Depot)"
      return
    }
    if (-not (ConnexionGithub)) { NonConnectee 'its GitHub sign-in is not made' }
    & claude auth status *> $null
    if ($LASTEXITCODE -eq 0) {
      Dire 'Claude: already signed in -- nothing to redo'
    } else {
      Write-Host ''
      Dire 'the Claude sign-in -- the sign-in page opens in your browser, only once'
      & claude auth login
      if ($LASTEXITCODE -ne 0) { NonConnectee 'its Claude sign-in is not made' }
    }
    Dire "the station is signed in to GitHub and to Claude -- it sees it within the minute; next: pairing with the app (the guide: docs/installation-station.md, repository $Depot)"
  }

  try {
    Installer ([string]$args[0])
  } catch {
    if ("$_" -ne 'brigade-arret') { [Console]::Error.WriteLine("brigade: installation refused -- $_") }
    $brigade.code = 1
  }
} @args

# Run as a file, its exit code; piped into `iex`, the window stays open.
if ($PSCommandPath) { exit $brigade.code }
$global:LASTEXITCODE = $brigade.code
