// La commande d'installation d'une station sous Windows (runtime/deploy/windows/installer-station.ps1) :
// ce qu'elle installe, la configuration qu'elle écrit, les deux connexions qu'elle mène, ce
// qu'elle laisse quand on la rejoue — et que la station qu'elle lance voit la même chose que celle
// qu'installer-station.sh lance sur un Mac, pour la même version publiée. Ni Windows, ni
// identifiants : le script est joué par `pwsh` tel qu'on le colle (`… | iex`), les commandes du
// système — winget, `gh`, `claude`, le téléchargement, le registre — sont des doublures qui notent
// leurs appels, et ce qui se télécharge est servi depuis un répertoire. Le lanceur, lui, tourne pour
// de vrai, sous le `node` de ces tests.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, join, relative } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { aArreter, jusqua, repertoireTemporaire } from "../outils.ts";
import { posixOnly } from "../support/plateforme.ts";

const INSTALLER = join(import.meta.dirname, "../../deploy/windows/installer-station.ps1");
const INSTALLER_SH = join(import.meta.dirname, "../../deploy/installer-station.sh");
const VERSION_NODE = "v26.1.0";

// Le PowerShell qui joue le script, là où il y en a un.
const PWSH = (process.env.PATH ?? "")
  .split(delimiter)
  .map((dossier) => join(dossier, "pwsh"))
  .find((chemin) => chemin !== "pwsh" && existsSync(chemin));
// Les doublures sont des scripts sh : sous Windows, le script se joue sur une vraie machine.
const saut = posixOnly("the doubles of the Windows commands are POSIX shell scripts") || (PWSH === undefined && "pwsh is not installed here: the Windows installer is a PowerShell script");

type Rendu = { code: number; sortie: string };

function pwsh(commande: string, env: NodeJS.ProcessEnv = process.env): Rendu {
  const rendu = spawnSync(PWSH as string, ["-NoProfile", "-NonInteractive", "-NoLogo", "-Command", commande], { encoding: "utf8", env });
  return { code: rendu.status ?? -1, sortie: rendu.stdout + rendu.stderr };
}
const cite = (valeur: string) => `'${valeur.replaceAll("'", "''")}'`;

function zipper(source: string, zip: string) {
  const rendu = pwsh(`[IO.Compression.ZipFile]::CreateFromDirectory(${cite(source)}, ${cite(zip)}, 'Optimal', $true)`);
  assert.equal(rendu.code, 0, rendu.sortie);
}

// Ce que les releases, nodejs.org et claude.ai servent : l'archive du runtime d'une version, un
// node win-x64 avec ses empreintes, et l'installeur officiel de `claude`, qui pose sa doublure.
function serveur(t: TestContext, version: string, { empreinteFausse = false } = {}): string {
  const servi = repertoireTemporaire(t);
  const construire = repertoireTemporaire(t);
  mkdirSync(join(construire, "runtime/src/station"), { recursive: true });
  writeFileSync(join(construire, "runtime/package.json"), `{\n  "name": "brigade-runtime",\n  "version": "${version}",\n  "type": "module"\n}\n`);
  // La station : elle dit ce qu'elle voit, puis tourne — ou s'arrête sur le code qu'on lui donne.
  writeFileSync(
    join(construire, "runtime/src/station/main.ts"),
    [
      'console.log(`station src/station/main.ts dans ${process.cwd()} — BRIGADE_STATION_DIR=${process.env.BRIGADE_STATION_DIR}`);',
      "if (process.env.FAUSSE_SORTIE !== undefined) process.exit(Number(process.env.FAUSSE_SORTIE));",
      "setTimeout(() => {}, 120_000);",
      "",
    ].join("\n"),
  );
  const nomNode = `node-${VERSION_NODE}-win-x64`;
  mkdirSync(join(construire, "node", nomNode), { recursive: true });
  // Le node posé : il dit sa version, et pour le reste c'est celui de ces tests.
  writeFileSync(join(construire, "node", nomNode, "node.exe"), `#!/bin/sh\n[ "$1" = -v ] && { echo ${VERSION_NODE}; exit 0; }\nexec "${process.execPath}" "$@"\n`);
  chmodSync(join(construire, "node", nomNode, "node.exe"), 0o755);
  zipper(join(construire, "runtime"), join(servi, "brigade-station-windows.zip"));
  zipper(join(construire, "node", nomNode), join(servi, `${nomNode}.zip`));
  const empreinte = empreinteFausse ? "0".repeat(64) : createHash("sha256").update(readFileSync(join(servi, `${nomNode}.zip`))).digest("hex");
  writeFileSync(join(servi, "SHASUMS256.txt"), `${"1".repeat(64)}  node-${VERSION_NODE}-win-arm64.zip\n${empreinte}  ${nomNode}.zip\n${"2".repeat(64)}  ${nomNode}.7z\n`);
  return servi;
}

// Un PC Windows x64, sous un compte ordinaire, où git, `gh` et `claude` sont posés (sauf ceux
// qu'on retire), et ne sont connectés qu'après leur login.
function unPC(t: TestContext, servi: string, { manquants = [] as string[], winget = true, curl = true } = {}) {
  const bin = repertoireTemporaire(t);
  const etat = repertoireTemporaire(t);
  const maison = repertoireTemporaire(t);
  const local = join(maison, "AppData/Local");
  const appels = join(bin, "appels");
  const registre = join(etat, "registre");
  writeFileSync(appels, "");
  const doublure = (dans: string, nom: string, script: string) => {
    writeFileSync(join(dans, nom), `#!/bin/sh\necho "${nom} $*" >>"${appels}"\n${script}\n`);
    chmodSync(join(dans, nom), 0o755);
  };
  // Ce que winget et l'installeur de claude posent, quand ils le posent.
  const reserve = join(etat, "reserve");
  mkdirSync(reserve);
  const outils: Record<string, string> = {
    git: "exit 0",
    gh: `case "$1 $2" in "auth status") [ -f "${etat}/gh" ] ;; "auth login") : >"${etat}/gh" ;; esac`,
    claude: `case "$1 $2" in "auth status") [ -f "${etat}/claude" ] ;; "auth login") : >"${etat}/claude" ;; esac`,
  };
  for (const [nom, script] of Object.entries(outils)) doublure(manquants.includes(nom) ? reserve : bin, nom, script);
  if (curl) doublure(bin, "curl.exe", `while [ $# -gt 0 ]; do case "$1" in -o) sortie="$2"; shift ;; http*) adresse="$1" ;; esac; shift; done; [ -f "${servi}/\${adresse##*/}" ] || exit 22; /bin/cp "${servi}/\${adresse##*/}" "$sortie"`);
  if (winget) doublure(bin, "winget", `case "$*" in *Git.Git*) /bin/cp "${reserve}/git" "${bin}/git" ;; *GitHub.cli*) /bin/cp "${reserve}/gh" "${bin}/gh" ;; esac`);
  // Le PowerShell de Windows : celui de ces tests, sans ce qu'il ne fait que sous Windows.
  doublure(bin, "powershell.exe", `for a do shift; if [ -n "$saute" ]; then saute=; continue; fi; case "$a" in -WindowStyle) saute=1; continue ;; esac; set -- "$@" "$a"; done\nexec "${PWSH}" "$@"`);
  writeFileSync(join(servi, "install.ps1"), `Copy-Item -LiteralPath ${cite(join(reserve, "claude"))} -Destination ${cite(join(maison, ".local/bin/claude"))}\n`);
  mkdirSync(join(maison, ".local/bin"), { recursive: true });
  // Le registre et le lancement caché, propres à Windows : notés, et le lancement fait pour de vrai.
  const prelude = join(etat, "prelude.ps1");
  writeFileSync(
    prelude,
    [
      "function Set-ItemProperty { [CmdletBinding()] param([string]$Path, [string]$Name, $Value) Add-Content -LiteralPath $env:BRIGADE_REGISTRE -Value \"$Path\\$Name=$Value\" }",
      "function Start-Process { param([string]$FilePath, [string]$ArgumentList, [string]$WindowStyle)",
      '  Add-Content -LiteralPath $env:BRIGADE_APPELS -Value "Start-Process $FilePath $ArgumentList -WindowStyle $WindowStyle"',
      `  Microsoft.PowerShell.Management\\Start-Process -FilePath 'powershell.exe' -ArgumentList $ArgumentList -RedirectStandardOutput ${cite(join(etat, "lanceur.out"))} -RedirectStandardError ${cite(join(etat, "lanceur.err"))} }`,
      "",
    ].join("\n"),
  );
  const base = join(local, "brigade-station");
  // Ce que le lanceur a lancé ne survit pas au test : arrêté avant que ses répertoires — et les
  // pids qu'ils notent — ne soient supprimés.
  aArreter(t, () => {
    for (const fichier of ["lanceur.pid", "station.pid"]) {
      const pid = Number.parseInt(lire(join(base, fichier)), 10);
      if (Number.isInteger(pid) && pid > 0) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // Déjà parti.
        }
      }
    }
  });
  return {
    bin,
    maison,
    base,
    prelude,
    racine: join(maison, ".config/brigade/station"),
    journal: join(base, "brigade-station.log"),
    env: {
      HOME: maison,
      TMPDIR: process.env.TMPDIR ?? "/tmp",
      PATH: bin,
      OS: "Windows_NT",
      PROCESSOR_ARCHITECTURE: "AMD64",
      LOCALAPPDATA: local,
      USERPROFILE: maison,
      SystemRoot: "C:\\Windows",
      BRIGADE_DEPOT: "acme/brigade",
      BRIGADE_TERMINAL: join(bin, "aucun-terminal"),
      BRIGADE_APPELS: appels,
      BRIGADE_REGISTRE: registre,
      POWERSHELL_TELEMETRY_OPTOUT: "1",
      POWERSHELL_UPDATECHECK: "Off",
      DOTNET_CLI_TELEMETRY_OPTOUT: "1",
    } as NodeJS.ProcessEnv,
    appels: () => lire(appels).split("\n").filter(Boolean),
    registre: () => lire(registre).split("\n").filter(Boolean),
  };
}
type PC = ReturnType<typeof unPC>;

function lire(fichier: string): string {
  try {
    return readFileSync(fichier, "utf8").trim();
  } catch {
    return "";
  }
}

// Un terminal où personne ne tape rien : les connexions sont des doublures.
function unTerminal(t: TestContext): string {
  const fichier = join(repertoireTemporaire(t), "tty");
  writeFileSync(fichier, "");
  return fichier;
}

// La commande du guide : le script, collé dans PowerShell (`irm … | iex`).
function jouer(pc: PC, env: NodeJS.ProcessEnv = {}): Rendu {
  return pwsh(`. ${cite(pc.prelude)}; Get-Content -Raw ${cite(INSTALLER)} | Invoke-Expression; exit $LASTEXITCODE`, { ...pc.env, ...env });
}
// Le script lancé comme un fichier, sur une archive donnée.
function jouerSur(pc: PC, archive: string): Rendu {
  return pwsh(`. ${cite(pc.prelude)}; & ${cite(INSTALLER)} ${cite(archive)}; exit $LASTEXITCODE`, pc.env);
}

const vivant = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const pidDe = (fichier: string) => Number.parseInt(lire(fichier), 10);

describe("sous Windows", { skip: saut }, () => {
  test("la première fois : le runtime publié, son node vérifié, le lanceur écrit et démarré, puis les deux connexions", (t) => {
    const pc = unPC(t, serveur(t, "1.2.3"));
    const rendu = jouer(pc, { BRIGADE_TERMINAL: unTerminal(t) });
    assert.equal(rendu.code, 0, rendu.sortie);
    const appels = pc.appels();
    assert.deepEqual(
      appels.filter((a) => a.startsWith("curl.exe")).map((a) => a.split(" ").at(-1)),
      ["https://nodejs.org/dist/latest-v26.x/SHASUMS256.txt", `https://nodejs.org/dist/latest-v26.x/node-${VERSION_NODE}-win-x64.zip`, "https://github.com/acme/brigade/releases/latest/download/brigade-station-windows.zip"],
    );
    assert.ok(existsSync(join(pc.base, "runtime/src/station/main.ts")));
    assert.ok(existsSync(join(pc.base, "node/node.exe")));
    assert.deepEqual(
      appels.filter((a) => a.startsWith("gh") || a.startsWith("claude")),
      ["gh auth status --hostname github.com", "gh auth login --hostname github.com --web --git-protocol https", "gh auth setup-git", "claude auth status", "claude auth login"],
    );
    assert.deepEqual(appels.filter((a) => a.startsWith("winget")), []);
    assert.match(rendu.sortie, /station installed and running -- 1\.2\.3 \(its launcher: pid \d+; its log: /);
    assert.match(rendu.sortie, /the station is signed in to GitHub and to Claude/);
    // Le lanceur tourne, tient le répertoire de la station, et l'a lancée.
    const lanceur = pidDe(join(pc.base, "lanceur.pid"));
    assert.ok(vivant(lanceur));
    assert.equal(pidDe(join(pc.racine, "app.pid")), lanceur);
  });

  test("ce qui démarre à l'ouverture de session lance la station sous le compte, avec tout ce qu'il lui faut — rien n'est à écrire à la main", async (t) => {
    const pc = unPC(t, serveur(t, "1.2.3"));
    assert.equal(jouer(pc).code, 0);
    const ps1 = join(pc.base, "lancer-station.ps1");
    const lancement = `-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "${ps1}"`;
    assert.deepEqual(pc.registre(), [`HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\brigade-station="C:\\Windows/System32/WindowsPowerShell/v1.0/powershell.exe" ${lancement}`]);
    // Lancée tout de suite comme l'ouverture de session la lancera : cachée, par le même lanceur.
    assert.deepEqual(pc.appels().filter((a) => a.startsWith("Start-Process")), [`Start-Process C:\\Windows/System32/WindowsPowerShell/v1.0/powershell.exe ${lancement} -WindowStyle Hidden`]);
    const lanceur = readFileSync(ps1, "utf8");
    // Un BOM : Windows PowerShell 5.1 lit alors en UTF-8 un chemin qui porterait un accent.
    assert.ok(lanceur.startsWith("\uFEFF"));
    assert.match(lanceur, new RegExp(`\\$env:BRIGADE_STATION_DIR = '${pc.racine}'`));
    assert.match(lanceur, new RegExp(`\\$env:PATH = '${join(pc.base, "node")}:${join(pc.maison, ".local/bin")}:' \\+ \\$env:PATH`));
    // Aucun identifiant n'y est écrit : les connexions sont celles de `gh` et de `claude`.
    assert.doesNotMatch(lanceur + pc.registre().join("\n"), /TOKEN|token|sk-ant/);
    // La station voit le répertoire de celle de l'app, et tourne dans le runtime publié.
    await jusqua(() => lire(pc.journal).includes("station src/station/main.ts"));
    assert.equal(lire(pc.journal), `station src/station/main.ts dans ${join(pc.base, "runtime")} — BRIGADE_STATION_DIR=${pc.racine}`);
    assert.ok(vivant(pidDe(join(pc.base, "station.pid"))));
  });

  test("rejouée sans rien de neuf : rien ne se retélécharge, la station n'est pas relancée, et rien ne se redemande", (t) => {
    const pc = unPC(t, serveur(t, "1.2.3"));
    const terminal = unTerminal(t);
    assert.equal(jouer(pc, { BRIGADE_TERMINAL: terminal }).code, 0);
    const lanceur = pidDe(join(pc.base, "lanceur.pid"));
    const deja = pc.appels().length;
    const rendu = jouer(pc, { BRIGADE_TERMINAL: terminal });
    assert.equal(rendu.code, 0, rendu.sortie);
    const appels = pc.appels().slice(deja);
    assert.deepEqual(appels.filter((a) => a.startsWith("curl.exe")).map((a) => a.split(" ").at(-1)), ["https://github.com/acme/brigade/releases/latest/download/brigade-station-windows.zip"]);
    assert.deepEqual(appels.filter((a) => a.startsWith("Start-Process")), []);
    assert.ok(!appels.some((a) => a.includes("auth login")), appels.join("\n"));
    assert.ok(appels.includes("gh auth setup-git"), appels.join("\n"));
    assert.equal(pidDe(join(pc.base, "lanceur.pid")), lanceur);
    assert.ok(vivant(lanceur));
    assert.match(rendu.sortie, /nothing new: the station already runs this version/);
    assert.match(rendu.sortie, /GitHub: already signed in -- nothing to redo/);
    assert.match(rendu.sortie, /Claude: already signed in -- nothing to redo/);
    assert.match(rendu.sortie, /station installed and running -- 1\.2\.3/);
  });

  test("rejouée sur une version plus récente : la station est arrêtée, son runtime remplacé, et elle est relancée sur lui", async (t) => {
    const pc = unPC(t, serveur(t, "1.2.3"));
    assert.equal(jouer(pc).code, 0);
    const ancien = pidDe(join(pc.base, "lanceur.pid"));
    await jusqua(() => existsSync(join(pc.base, "station.pid")));
    const ancienneStation = pidDe(join(pc.base, "station.pid"));
    const deja = pc.appels().length;
    const rendu = jouerSur(pc, join(serveur(t, "1.2.4"), "brigade-station-windows.zip"));
    assert.equal(rendu.code, 0, rendu.sortie);
    assert.match(readFileSync(join(pc.base, "runtime/package.json"), "utf8"), /"version": "1\.2\.4"/);
    assert.ok(!vivant(ancien) && !vivant(ancienneStation));
    const neuf = pidDe(join(pc.base, "lanceur.pid"));
    assert.notEqual(neuf, ancien);
    assert.ok(vivant(neuf));
    assert.equal(pc.appels().slice(deja).filter((a) => a.startsWith("Start-Process")).length, 1);
    // Une archive donnée : rien n'est téléchargé, pas même node, déjà là.
    assert.deepEqual(pc.appels().slice(deja).filter((a) => a.startsWith("curl.exe")), []);
    assert.match(rendu.sortie, /stopping the station to move it to what changed/);
    assert.match(rendu.sortie, /station installed and running -- 1\.2\.4/);
  });

  test("un node dont l'empreinte n'est pas celle publiée n'est pas posé, et rien n'est lancé ni écrit au registre", (t) => {
    const pc = unPC(t, serveur(t, "1.2.3", { empreinteFausse: true }));
    const rendu = jouer(pc);
    assert.equal(rendu.code, 1);
    assert.match(rendu.sortie, /brigade: installation refused -- the checksum of node-v26\.1\.0-win-x64\.zip is not the one nodejs\.org publishes/);
    assert.ok(!existsSync(join(pc.base, "node")));
    assert.deepEqual(pc.registre(), []);
    assert.deepEqual(pc.appels().filter((a) => a.startsWith("Start-Process")), []);
  });

  test("sans terminal, la station est installée et la commande dit de la rejouer pour les connexions", (t) => {
    const pc = unPC(t, serveur(t, "1.2.3"));
    const rendu = jouer(pc);
    assert.equal(rendu.code, 0, rendu.sortie);
    assert.deepEqual(pc.appels().filter((a) => a.startsWith("gh") || a.startsWith("claude")), []);
    assert.match(rendu.sortie, /no terminal here for the sign-ins: rerun the same command from a PowerShell window/);
  });

  test("ce qui manque est posé : git et gh par winget, claude par son installeur officiel — puis les connexions", (t) => {
    const pc = unPC(t, serveur(t, "1.2.3"), { manquants: ["git", "gh", "claude"] });
    const rendu = jouer(pc, { BRIGADE_TERMINAL: unTerminal(t) });
    assert.equal(rendu.code, 0, rendu.sortie);
    const appels = pc.appels();
    assert.deepEqual(
      appels.filter((a) => a.startsWith("winget")),
      [
        "winget install --id Git.Git --exact --source winget --silent --accept-package-agreements --accept-source-agreements",
        "winget install --id GitHub.cli --exact --source winget --silent --accept-package-agreements --accept-source-agreements",
      ],
    );
    assert.ok(appels.some((a) => a.endsWith("https://claude.ai/install.ps1") && a.startsWith("curl.exe")), appels.join("\n"));
    assert.ok(appels.some((a) => /^powershell\.exe -NoProfile -ExecutionPolicy Bypass -File \S+install\.ps1$/.test(a)), appels.join("\n"));
    assert.ok(appels.includes("claude auth login"), appels.join("\n"));
    assert.match(rendu.sortie, /the station is signed in to GitHub and to Claude/);
  });

  test("sans winget, un outil qui manque est nommé, avec où le prendre, et rien n'est installé", (t) => {
    const pc = unPC(t, serveur(t, "1.2.3"), { manquants: ["gh"], winget: false });
    const rendu = jouer(pc);
    assert.equal(rendu.code, 1);
    assert.match(rendu.sortie, /installation refused -- gh is missing, and so is winget to install it: install gh \(https:\/\/cli\.github\.com\), then rerun the same command/);
    assert.deepEqual(pc.appels().filter((a) => a.startsWith("curl.exe") || a.startsWith("Start-Process")), []);
  });

  test("une connexion GitHub ratée est dite, et la connexion Claude n'est pas tentée", (t) => {
    const pc = unPC(t, serveur(t, "1.2.3"));
    writeFileSync(join(pc.bin, "gh"), `#!/bin/sh\necho "gh $*" >>"${join(pc.bin, "appels")}"\nexit 1\n`);
    const rendu = jouer(pc, { BRIGADE_TERMINAL: unTerminal(t) });
    assert.equal(rendu.code, 1);
    assert.match(rendu.sortie, /brigade: the station is installed, but its GitHub sign-in is not made \(the line above says why\) -- rerun the same command to resume/);
    assert.deepEqual(pc.appels().filter((a) => a.startsWith("claude")), []);
    assert.ok(vivant(pidDe(join(pc.base, "lanceur.pid"))));
  });

  test("une connexion Claude ratée est dite, avec de quoi la reprendre : rejouer la même commande", (t) => {
    const pc = unPC(t, serveur(t, "1.2.3"));
    writeFileSync(join(pc.bin, "claude"), `#!/bin/sh\necho "claude $*" >>"${join(pc.bin, "appels")}"\nexit 1\n`);
    const rendu = jouer(pc, { BRIGADE_TERMINAL: unTerminal(t) });
    assert.equal(rendu.code, 1);
    assert.match(rendu.sortie, /the station is installed, but its Claude sign-in is not made .*-- rerun the same command to resume/);
    assert.deepEqual(pc.appels().filter((a) => a.startsWith("claude")), ["claude auth status", "claude auth login"]);
    assert.doesNotMatch(rendu.sortie, /the station is signed in to GitHub and to Claude/);
  });

  test("sans argument et sans dépôt désigné, rien n'est téléchargé : le script dit quoi donner", (t) => {
    const pc = unPC(t, serveur(t, "1.2.3"));
    assert.match(readFileSync(INSTALLER, "utf8"), /\$Depot = \$env:BRIGADE_DEPOT\n\s*if \(-not \$Depot\) \{ \$Depot = '@DEPOT@' \}/);
    const rendu = jouer(pc, { BRIGADE_DEPOT: "" });
    assert.equal(rendu.code, 1);
    assert.match(rendu.sortie, /no repository is named to download the station from.*BRIGADE_DEPOT=<owner>\/<repo>/);
    assert.deepEqual(pc.appels().filter((a) => a.startsWith("curl.exe")), []);
  });

  test("ailleurs que sous Windows, sur une architecture sans node, ou sans curl.exe : refusé avant tout téléchargement", (t) => {
    const cas: [Partial<Parameters<typeof unPC>[2]>, NodeJS.ProcessEnv, RegExp][] = [
      [{}, { OS: "" }, /this command installs a station on Windows -- on Linux or macOS, the command is installer-station\.sh/],
      [{}, { PROCESSOR_ARCHITECTURE: "x86" }, /no node for the architecture x86 \(AMD64, ARM64\)/],
      [{ curl: false }, {}, /curl\.exe is missing to download the station/],
    ];
    for (const [machine, env, attendu] of cas) {
      const pc = unPC(t, serveur(t, "1.2.3"), machine);
      const rendu = jouer(pc, env);
      assert.equal(rendu.code, 1, rendu.sortie);
      assert.match(rendu.sortie, attendu);
      assert.deepEqual(pc.appels().filter((a) => a.startsWith("curl.exe") || a.startsWith("Start-Process")), []);
    }
  });

  test("le script est en ASCII : Windows PowerShell 5.1 le lit sans BOM dans la page de code de la machine", () => {
    assert.match(readFileSync(INSTALLER, "latin1"), /^[\x09\x0a\x0d\x20-\x7e]*$/);
  });
});

describe("le lanceur", { skip: saut }, () => {
  // Installe, puis arrête ce que l'installation a lancé : le lanceur se joue ensuite à la main.
  function installe(t: TestContext): PC {
    const pc = unPC(t, serveur(t, "1.2.3"));
    assert.equal(jouer(pc).code, 0);
    for (const fichier of ["lanceur.pid", "station.pid"]) {
      const pid = pidDe(join(pc.base, fichier));
      if (Number.isInteger(pid)) process.kill(pid, "SIGKILL");
    }
    writeFileSync(pc.journal, "");
    return pc;
  }
  function lanceur(t: TestContext, pc: PC, env: NodeJS.ProcessEnv = {}) {
    const enfant = spawn(PWSH as string, ["-NoProfile", "-NonInteractive", "-File", join(pc.base, "lancer-station.ps1")], { env: { ...pc.env, ...env }, stdio: "ignore" });
    aArreter(t, () => {
      const pid = pidDe(join(pc.base, "lanceur.pid"));
      if (Number.isInteger(pid) && vivant(pid)) process.kill(pid, "SIGKILL");
    });
    return new Promise<number>((fin) => enfant.once("exit", (code) => fin(code ?? -1)));
  }

  test("il ne double pas la station que l'app tient : il attend qu'elle la rende", async (t) => {
    const pc = installe(t);
    writeFileSync(join(pc.racine, "app.pid"), `${process.pid}\n`);
    void lanceur(t, pc);
    await jusqua(() => lire(pc.journal).includes("held by the app"));
    assert.match(lire(pc.journal), new RegExp(`held by the app \\(pid ${process.pid}\\)`));
    assert.doesNotMatch(lire(pc.journal), /station src\/station\/main\.ts/);
    assert.equal(pidDe(join(pc.racine, "app.pid")), process.pid);
  });

  test("une station tombée est relancée cinq secondes plus tard", async (t) => {
    const pc = installe(t);
    void lanceur(t, pc, { FAUSSE_SORTIE: "1" });
    await jusqua(() => lire(pc.journal).split("\n").filter((l) => l.startsWith("station ")).length >= 2);
    assert.match(lire(pc.journal), /this computer's station stopped \(code 1\) -- relaunched in 5 s/);
  });

  test("une station qui refuse de démarrer (code 2) n'est pas relancée, et rend son répertoire", async (t) => {
    const pc = installe(t);
    const code = await lanceur(t, pc, { FAUSSE_SORTIE: "2" });
    assert.equal(code, 2);
    assert.equal(lire(pc.journal).split("\n").filter((l) => l.startsWith("station ")).length, 1);
    assert.match(lire(pc.journal), /refused to start/);
    assert.ok(!existsSync(join(pc.racine, "app.pid")));
  });
});

// Le critère du ticket : pour la même version publiée, la station que la commande Windows lance
// voit la même configuration que celle qu'installer-station.sh lance sur un Mac — le même point
// d'entrée, dans le même runtime, le même répertoire (celui de l'app), le même node, et les mêmes
// connexions. (Sous Linux, la station est un service système, sous son propre compte brigade et
// dans /var/lib/brigade : une autre machine, pas une autre configuration de celle d'un compte.)
describe("la même station que sur un Mac", { skip: saut }, () => {
  function serveurMac(t: TestContext, version: string): string {
    const servi = repertoireTemporaire(t);
    const construire = repertoireTemporaire(t);
    mkdirSync(join(construire, "runtime/src/station"), { recursive: true });
    writeFileSync(join(construire, "runtime/package.json"), `{\n  "name": "brigade-runtime",\n  "version": "${version}",\n  "type": "module"\n}\n`);
    writeFileSync(join(construire, "runtime/src/station/main.ts"), "// la station\n");
    const nomNode = `node-${VERSION_NODE}-darwin-arm64`;
    mkdirSync(join(construire, nomNode, "bin"), { recursive: true });
    // Le node posé : il dit sa version, et ce que la station verrait.
    writeFileSync(join(construire, nomNode, "bin/node"), `#!/bin/sh\n[ "$1" = -v ] && { echo ${VERSION_NODE}; exit 0; }\necho "station $* dans $(pwd) — BRIGADE_STATION_DIR=$BRIGADE_STATION_DIR"\n`);
    chmodSync(join(construire, nomNode, "bin/node"), 0o755);
    const tar = (archive: string, ...quoi: string[]) => assert.equal(spawnSync("tar", ["-czf", join(servi, archive), "-C", construire, ...quoi]).status, 0);
    tar("brigade-station-mac.tar.gz", "runtime");
    tar(`${nomNode}.tar.gz`, nomNode);
    writeFileSync(join(servi, "SHASUMS256.txt"), `${createHash("sha256").update(readFileSync(join(servi, `${nomNode}.tar.gz`))).digest("hex")}  ${nomNode}.tar.gz\n`);
    return servi;
  }

  test("pour la même version publiée : même point d'entrée, même runtime, même répertoire, même node, mêmes connexions", async (t) => {
    // Le Mac.
    const etat = repertoireTemporaire(t);
    const maisonMac = repertoireTemporaire(t);
    const binMac = repertoireTemporaire(t);
    const appelsMac = join(binMac, "appels");
    const servi = serveurMac(t, "1.2.3");
    const doublures: Record<string, string> = {
      uname: 'case "$1" in -s) echo Darwin ;; -m) echo arm64 ;; esac',
      id: "echo 501",
      curl: `while [ $# -gt 0 ]; do case "$1" in -o) sortie="$2"; shift ;; http*) adresse="$1" ;; esac; shift; done; cp "${servi}/\${adresse##*/}" "$sortie"`,
      launchctl: `case "$1" in print) [ -f "${etat}/charge" ] && echo "state = running" ;; bootstrap) touch "${etat}/charge" ;; esac`,
      gh: `case "$1 $2" in "auth status") [ -f "${etat}/gh" ] ;; "auth login") touch "${etat}/gh" ;; esac`,
      claude: `case "$1 $2" in "auth status") [ -f "${etat}/claude" ] ;; "auth login") touch "${etat}/claude" ;; esac`,
    };
    for (const [nom, script] of Object.entries(doublures)) {
      writeFileSync(join(binMac, nom), `#!/bin/sh\necho "${nom} $*" >>"${appelsMac}"\n${script}\n`);
      chmodSync(join(binMac, nom), 0o755);
    }
    const mac = spawnSync("sh", [INSTALLER_SH], { encoding: "utf8", env: { ...process.env, PATH: `${binMac}:/usr/bin:/bin`, HOME: maisonMac, BRIGADE_DEPOT: "acme/brigade", BRIGADE_TERMINAL: unTerminal(t) } });
    assert.equal(mac.status, 0, mac.stdout + mac.stderr);
    const baseMac = join(maisonMac, ".local/share/brigade-station");
    const racineMac = join(maisonMac, ".config/brigade/station");
    const vuMac = spawnSync("/bin/sh", [join(baseMac, "lancer-station")], { encoding: "utf8", env: { PATH: "/usr/bin:/bin", BRIGADE_STATION_DIR: racineMac } }).stdout.trim();

    // Le PC, sur la même version.
    const pc = unPC(t, serveur(t, "1.2.3"));
    assert.equal(jouer(pc, { BRIGADE_TERMINAL: unTerminal(t) }).code, 0);
    await jusqua(() => lire(pc.journal).includes("station src/station/main.ts"));

    // Ce que la station voit, chaque chemin relatif à la maison du compte.
    const vu = (ligne: string, maison: string) => {
      const [, entree, dans, racine] = /^station (\S+) dans (.+) — BRIGADE_STATION_DIR=(.+)$/.exec(ligne) ?? [];
      return { entree, runtime: relative(maison, dans ?? ""), racine: relative(maison, racine ?? "") };
    };
    const surMac = vu(vuMac, maisonMac);
    const surPC = vu(lire(pc.journal), pc.maison);
    assert.equal(surPC.entree, surMac.entree);
    assert.equal(surPC.entree, "src/station/main.ts");
    // Le même répertoire : celui de l'app, sous la maison du compte, sur l'un comme sur l'autre.
    assert.equal(surPC.racine, surMac.racine);
    assert.equal(surPC.racine, ".config/brigade/station");
    // Le même runtime : celui de la version publiée, tel quel.
    assert.equal(relative(join(maisonMac, ".local/share/brigade-station"), join(maisonMac, surMac.runtime)), "runtime");
    assert.equal(relative(pc.base, join(pc.maison, surPC.runtime)), "runtime");
    assert.equal(readFileSync(join(pc.base, "runtime/package.json"), "utf8"), readFileSync(join(baseMac, "runtime/package.json"), "utf8"));
    // Le même node.
    assert.equal(spawnSync(join(pc.base, "node/node.exe"), ["-v"], { encoding: "utf8" }).stdout.trim(), spawnSync(join(baseMac, "node/bin/node"), ["-v"], { encoding: "utf8" }).stdout.trim());
    // Les mêmes connexions, dans le même ordre.
    const connexions = (appels: string[]) => appels.filter((a) => a.startsWith("gh ") || a.startsWith("claude "));
    assert.deepEqual(connexions(pc.appels()), connexions(lire(appelsMac).split("\n")));
  });
});
