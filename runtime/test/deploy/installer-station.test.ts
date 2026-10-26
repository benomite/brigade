// La commande d'installation d'une station (runtime/deploy/installer-station.sh),
// sous Linux et sous macOS : ce qu'elle installe, la configuration qu'elle
// écrit, les deux connexions qu'elle mène, et ce qu'elle laisse quand on la
// rejoue. Ni root, ni vraie machine, ni identifiants : les commandes du système
// — apt, systemd, launchd, `gh`, `claude`, le téléchargement — sont des
// doublures qui notent leurs appels, et ce qui se télécharge est servi depuis
// un répertoire.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { jusqua, repertoireTemporaire } from "../outils.ts";
import { posixOnly } from "../support/plateforme.ts";

const INSTALLER = join(import.meta.dirname, "../../deploy/installer-station.sh");

// Le script ne parle à systemd que là où il tourne.
const sansSystemd = !existsSync("/run/systemd/system") && "systemd ne tourne pas sur cette machine : la commande y refuse l'installation Linux";

type Rendu = { code: number; sortie: string };

// Des commandes du système qui notent chacun de leurs appels, une ligne
// chacun, dans `appels`. Sans terminal, sauf à en donner un.
function doublures(t: TestContext, corps: Record<string, string>, env: NodeJS.ProcessEnv = {}) {
  const bin = repertoireTemporaire(t);
  const appels = join(bin, "appels");
  writeFileSync(appels, "");
  for (const [nom, script] of Object.entries(corps)) {
    writeFileSync(join(bin, nom), `#!/bin/sh\necho "${nom} $*" >>"${appels}"\n${script}\n`);
    chmodSync(join(bin, nom), 0o755);
  }
  return {
    bin,
    env: { ...process.env, PATH: `${bin}:/usr/bin:/bin`, BRIGADE_DEPOT: "acme/brigade", BRIGADE_TERMINAL: join(bin, "aucun-terminal"), ...env },
    appels: () => readFileSync(appels, "utf8").trim().split("\n").filter(Boolean),
  };
}

// Un terminal où personne ne tape rien : les connexions sont des doublures.
function unTerminal(t: TestContext): string {
  const fichier = join(repertoireTemporaire(t), "tty");
  writeFileSync(fichier, "");
  return fichier;
}

function jouer(args: string[], env: NodeJS.ProcessEnv): Rendu {
  const rendu = spawnSync("sh", [INSTALLER, ...args], { encoding: "utf8", env });
  return { code: rendu.status ?? -1, sortie: rendu.stdout + rendu.stderr };
}

describe("sous Linux", { skip: sansSystemd }, () => {
  // Une machine Debian amd64, sous root, où apt installe et la station démarre.
  const debian = {
    uname: "echo Linux",
    id: "echo 0",
    dpkg: "echo amd64",
    "dpkg-query": "printf 1.2.3",
    "apt-get": "",
    systemctl: "",
    curl: 'while [ $# -gt 0 ]; do [ "$1" = -o ] && { echo paquet >"$2"; shift; }; shift; done',
    getent: "echo brigade:x:999:999::/home/brigade:/bin/bash",
    sudo: 'exec "$@"',
  };
  // `gh` sous le compte brigade : connecté ou non.
  const runuser = (connecte: boolean) => (connecte ? "exit 0" : 'case "$*" in *"gh auth status"*) exit 1 ;; esac');
  // Le node du paquet et son étape de connexion Max : une doublure qui note son appel.
  function paquetPose(t: TestContext, appels: string, code = 0): string {
    const lib = repertoireTemporaire(t);
    mkdirSync(join(lib, "node/bin"), { recursive: true });
    writeFileSync(join(lib, "node/bin/node"), `#!/bin/sh\necho "node $*" >>"${appels}"\nexit ${code}\n`);
    chmodSync(join(lib, "node/bin/node"), 0o755);
    return lib;
  }

  test("sans argument : le paquet de la dernière version publiée, pour l'architecture de la machine, remis à apt", (t) => {
    const machine = doublures(t, debian);
    const rendu = jouer([], machine.env);
    assert.equal(rendu.code, 0, rendu.sortie);
    const appels = machine.appels();
    assert.ok(appels.some((a) => /^curl -fsSL -o \S+\/brigade-station\.deb https:\/\/github\.com\/acme\/brigade\/releases\/latest\/download\/brigade-station_amd64\.deb$/.test(a)), appels.join("\n"));
    assert.ok(appels.includes("apt-get update -q"), appels.join("\n"));
    assert.ok(appels.some((a) => /^apt-get install -y -q \/\S+\/brigade-station\.deb$/.test(a)), appels.join("\n"));
    assert.ok(appels.includes("systemctl --quiet is-active brigade-station.service"), appels.join("\n"));
    assert.match(rendu.sortie, /station installée et active — 1\.2\.3/);
    assert.match(rendu.sortie, /la suite : la connexion GitHub et la connexion Max du compte brigade, puis l'appairage avec l'app — pas de terminal ici/);
    assert.deepEqual(appels.filter((a) => a.startsWith("runuser") || a.startsWith("sudo")), []);
  });

  test("sans argument et sans dépôt désigné, rien n'est téléchargé : le script dit quoi donner", (t) => {
    const machine = doublures(t, debian);
    assert.match(readFileSync(INSTALLER, "utf8"), /DEPOT="\$\{BRIGADE_DEPOT:-@DEPOT@\}"/);
    const rendu = jouer([], { ...machine.env, BRIGADE_DEPOT: "" });
    assert.equal(rendu.code, 1);
    assert.match(rendu.sortie, /aucun dépôt n'est désigné pour télécharger la station.*BRIGADE_DEPOT=<compte>\/<dépôt>/);
    assert.deepEqual(machine.appels().filter((a) => a.startsWith("apt-get") || a.startsWith("curl")), []);
  });

  test("un paquet donné par son chemin s'installe sans rien télécharger", (t) => {
    const machine = doublures(t, debian);
    const deb = join(repertoireTemporaire(t), "brigade-station_1.2.3_amd64.deb");
    writeFileSync(deb, "paquet");
    const rendu = jouer([deb], machine.env);
    assert.equal(rendu.code, 0, rendu.sortie);
    assert.deepEqual(machine.appels().filter((a) => a.startsWith("curl")), []);
    assert.ok(machine.appels().some((a) => /^apt-get install -y -q \/\S+\/brigade-station\.deb$/.test(a)));
  });

  test("hors root, les gestes root passent par sudo, et eux seuls", (t) => {
    const machine = doublures(t, { ...debian, id: "echo 1000" });
    const rendu = jouer([], machine.env);
    assert.equal(rendu.code, 0, rendu.sortie);
    assert.match(rendu.sortie, /les gestes root de l'installation passent par sudo/);
    const sudo = machine.appels().filter((a) => a.startsWith("sudo"));
    assert.equal(sudo.length, 2, sudo.join("\n"));
    assert.match(sudo[0] ?? "", /^sudo env DEBIAN_FRONTEND=noninteractive apt-get update -q$/);
    assert.match(sudo[1] ?? "", /^sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y -q \/\S+\/brigade-station\.deb$/);
  });

  test("une architecture sans paquet est refusée avant tout téléchargement", (t) => {
    const machine = doublures(t, { ...debian, dpkg: "echo i386" });
    const rendu = jouer([], machine.env);
    assert.equal(rendu.code, 1);
    assert.match(rendu.sortie, /aucun paquet de la station pour l'architecture i386/);
    assert.deepEqual(machine.appels().filter((a) => a.startsWith("apt-get") || a.startsWith("curl")), []);
  });

  test("un échec d'apt est dit, et la station n'est pas attendue", (t) => {
    const machine = doublures(t, { ...debian, "apt-get": '[ "$1" = install ] && exit 100; exit 0' });
    const rendu = jouer([], machine.env);
    assert.equal(rendu.code, 1);
    assert.match(rendu.sortie, /apt n'a pas pu installer le paquet/);
    assert.deepEqual(machine.appels().filter((a) => a.startsWith("systemctl")), []);
  });

  test("devant un terminal : la connexion GitHub sous le compte brigade, puis la connexion Max — et rien d'autre ne se demande", (t) => {
    const machine = doublures(t, { ...debian, runuser: runuser(false) });
    const lib = paquetPose(t, join(machine.bin, "appels"));
    const rendu = jouer([], { ...machine.env, BRIGADE_TERMINAL: unTerminal(t), BRIGADE_STATION_LIB: lib });
    assert.equal(rendu.code, 0, rendu.sortie);
    const compte = "runuser -u brigade -- env -i HOME=/home/brigade PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin LANG=C.UTF-8";
    assert.deepEqual(
      machine.appels().filter((a) => a.startsWith("runuser") || a.startsWith("node")),
      [
        `${compte} gh auth status --hostname github.com`,
        `${compte} gh auth login --hostname github.com --web --git-protocol https`,
        `${compte} gh auth setup-git`,
        `node ${lib}/runtime/src/connexion-max/connecter-cli.ts`,
      ],
    );
    assert.match(rendu.sortie, /la station est connectée à GitHub et à Claude/);
  });

  test("rejouée sur une station installée et connectée : rien ne se redemande, et la station reste active", (t) => {
    const machine = doublures(t, { ...debian, runuser: runuser(true) });
    const lib = paquetPose(t, join(machine.bin, "appels"));
    const rendu = jouer([], { ...machine.env, BRIGADE_TERMINAL: unTerminal(t), BRIGADE_STATION_LIB: lib });
    assert.equal(rendu.code, 0, rendu.sortie);
    const appels = machine.appels();
    assert.ok(!appels.some((a) => a.includes("gh auth login")), appels.join("\n"));
    assert.ok(appels.some((a) => a.endsWith("gh auth setup-git")), appels.join("\n"));
    // L'étape Max ne refait pas un jeton déjà rangé (connexion-max/connecter-cli.ts).
    assert.ok(appels.some((a) => a.startsWith("node ")), appels.join("\n"));
    assert.ok(!appels.some((a) => /^systemctl (stop|restart|disable)/.test(a)), appels.join("\n"));
    assert.match(rendu.sortie, /GitHub : déjà connecté — rien à refaire/);
  });

  test("une connexion GitHub ratée est dite, et la connexion Max n'est pas tentée", (t) => {
    const machine = doublures(t, { ...debian, runuser: 'case "$*" in *"gh auth status"* | *"gh auth login"*) exit 1 ;; esac' });
    const lib = paquetPose(t, join(machine.bin, "appels"));
    const rendu = jouer([], { ...machine.env, BRIGADE_TERMINAL: unTerminal(t), BRIGADE_STATION_LIB: lib });
    assert.equal(rendu.code, 1);
    assert.match(rendu.sortie, /la station est installée, mais sa connexion GitHub n'est pas faite.*relance la même commande/);
    assert.deepEqual(machine.appels().filter((a) => a.startsWith("node")), []);
  });
});

describe("sous macOS", { skip: posixOnly("the installer is a POSIX shell script") }, () => {
  const VERSION_NODE = "v26.1.0";

  // Ce que les releases et nodejs.org servent : l'archive du runtime d'une
  // version, et un node darwin-arm64 avec ses empreintes.
  function serveur(t: TestContext, version: string, { empreinteFausse = false } = {}): string {
    const dossier = repertoireTemporaire(t);
    const construire = repertoireTemporaire(t);
    mkdirSync(join(construire, "runtime/src/station"), { recursive: true });
    writeFileSync(join(construire, "runtime/package.json"), `{\n  "name": "brigade-runtime",\n  "version": "${version}",\n  "type": "module"\n}\n`);
    writeFileSync(join(construire, "runtime/src/station/main.ts"), "// la station\n");
    const nomNode = `node-${VERSION_NODE}-darwin-arm64`;
    mkdirSync(join(construire, nomNode, "bin"), { recursive: true });
    // Le node posé : il dit sa version, et note où et comment la station le lance.
    writeFileSync(join(construire, nomNode, "bin/node"), `#!/bin/sh\n[ "$1" = -v ] && { echo ${VERSION_NODE}; exit 0; }\necho "node $* dans $(pwd) — BRIGADE_STATION_DIR=$BRIGADE_STATION_DIR"\n`);
    chmodSync(join(construire, nomNode, "bin/node"), 0o755);
    const tar = (archive: string, ...quoi: string[]) => assert.equal(spawnSync("tar", ["-czf", join(dossier, archive), "-C", construire, ...quoi]).status, 0);
    tar("brigade-station-mac.tar.gz", "runtime");
    tar(`${nomNode}.tar.gz`, nomNode);
    const empreinte = empreinteFausse ? "0".repeat(64) : createHash("sha256").update(readFileSync(join(dossier, `${nomNode}.tar.gz`))).digest("hex");
    writeFileSync(join(dossier, "SHASUMS256.txt"), `${"1".repeat(64)}  node-${VERSION_NODE}-darwin-x64.tar.gz\n${empreinte}  ${nomNode}.tar.gz\n${"2".repeat(64)}  ${nomNode}.pkg\n`);
    return dossier;
  }

  // Un Mac Apple Silicon, sous un compte ordinaire, où launchd tient un agent
  // et où `gh` et `claude` ne sont connectés qu'après leur login.
  function unMac(t: TestContext, servi: string, { uid = "501" } = {}) {
    const etat = repertoireTemporaire(t);
    const home = repertoireTemporaire(t);
    const machine = doublures(
      t,
      {
        uname: 'case "$1" in -s) echo Darwin ;; -m) echo arm64 ;; esac',
        id: `echo ${uid}`,
        curl: `while [ $# -gt 0 ]; do case "$1" in -o) sortie="$2"; shift ;; http*) adresse="$1" ;; esac; shift; done; cp "${servi}/\${adresse##*/}" "$sortie"`,
        launchctl: `case "$1" in print) [ -f "${etat}/charge" ] && echo "state = running" ;; bootstrap) touch "${etat}/charge" ;; bootout) rm -f "${etat}/charge" ;; esac`,
        gh: `case "$1 $2" in "auth status") [ -f "${etat}/gh" ] ;; "auth login") touch "${etat}/gh" ;; esac`,
        claude: `case "$1 $2" in "auth status") [ -f "${etat}/claude" ] ;; "auth login") touch "${etat}/claude" ;; esac`,
      },
      { HOME: home },
    );
    const base = join(home, ".local/share/brigade-station");
    return { ...machine, home, base, plist: join(home, "Library/LaunchAgents/brigade.station.plist") };
  }

  test("la première fois : le runtime publié, son node vérifié, l'agent launchd écrit et chargé, puis les deux connexions", (t) => {
    const mac = unMac(t, serveur(t, "1.2.3"));
    const rendu = jouer([], { ...mac.env, BRIGADE_TERMINAL: unTerminal(t) });
    assert.equal(rendu.code, 0, rendu.sortie);
    const appels = mac.appels();
    assert.deepEqual(
      appels.filter((a) => a.startsWith("curl")).map((a) => a.split(" ").at(-1)),
      ["https://nodejs.org/dist/latest-v26.x/SHASUMS256.txt", `https://nodejs.org/dist/latest-v26.x/node-${VERSION_NODE}-darwin-arm64.tar.gz`, "https://github.com/acme/brigade/releases/latest/download/brigade-station-mac.tar.gz"],
    );
    assert.ok(existsSync(join(mac.base, "runtime/src/station/main.ts")));
    assert.equal(spawnSync(join(mac.base, "node/bin/node"), ["-v"], { encoding: "utf8" }).stdout.trim(), VERSION_NODE);
    assert.ok(appels.includes(`launchctl bootstrap gui/501 ${mac.plist}`), appels.join("\n"));
    assert.deepEqual(
      appels.filter((a) => a.startsWith("gh") || a.startsWith("claude")),
      ["gh auth status --hostname github.com", "gh auth login --hostname github.com --web --git-protocol https", "gh auth setup-git", "claude auth status", "claude auth login"],
    );
    assert.match(rendu.sortie, /station installée et active — 1\.2\.3 \(launchctl print gui\/501\/brigade\.station/);
    assert.match(rendu.sortie, /la station est connectée à GitHub et à Claude/);
  });

  test("l'agent launchd lance la station sous le compte, avec tout ce qu'il lui faut — rien n'est à écrire à la main", (t) => {
    const mac = unMac(t, serveur(t, "1.2.3"));
    assert.equal(jouer([], mac.env).code, 0);
    const plist = readFileSync(mac.plist, "utf8");
    const valeur = (cle: string) => new RegExp(`<key>${cle}</key>\\s*<string>([^<]*)</string>`).exec(plist)?.[1];
    assert.equal(valeur("Label"), "brigade.station");
    assert.match(plist, new RegExp(`<key>ProgramArguments</key>\\s*<array>\\s*<string>/bin/sh</string>\\s*<string>${mac.base}/lancer-station</string>\\s*</array>`));
    // Le même répertoire que la station de l'app : une seule tourne à la fois.
    assert.equal(valeur("BRIGADE_STATION_DIR"), join(mac.home, ".config/brigade/station"));
    assert.equal(valeur("HOME"), mac.home);
    assert.deepEqual(valeur("PATH")?.split(":").slice(0, 3), [join(mac.base, "node/bin"), join(mac.base, "bin"), join(mac.home, ".local/bin")]);
    assert.ok(valeur("PATH")?.split(":").includes("/opt/homebrew/bin"));
    assert.match(plist, /<key>RunAtLoad<\/key>\s*<true\/>/);
    assert.match(plist, /<key>KeepAlive<\/key>\s*<dict>\s*<key>SuccessfulExit<\/key>\s*<false\/>/);
    // Son arrêt n'emporte pas les cooks, comme KillMode=process sous Linux.
    assert.match(plist, /<key>AbandonProcessGroup<\/key>\s*<true\/>/);
    assert.equal(valeur("StandardOutPath"), join(mac.home, "Library/Logs/brigade-station.log"));
    // Aucun identifiant n'y est écrit : les connexions sont celles de `gh` et de `claude`.
    assert.doesNotMatch(plist, /TOKEN|token|sk-ant/);
  });

  test("le lanceur prend le répertoire de la station, garde son pid, et lance le point d'entrée du runtime", (t) => {
    const mac = unMac(t, serveur(t, "1.2.3"));
    assert.equal(jouer([], mac.env).code, 0);
    const racine = join(mac.home, ".config/brigade/station");
    // Une app partie sans rendre la station : sa marque ne tient plus rien.
    const mort = spawnSync("true");
    writeFileSync(join(racine, "app.pid"), `${mort.pid}\n`);
    const rendu = spawnSync("/bin/sh", [join(mac.base, "lancer-station")], { encoding: "utf8", env: { PATH: "/usr/bin:/bin", BRIGADE_STATION_DIR: racine } });
    assert.equal(rendu.status, 0, rendu.stderr);
    assert.equal(rendu.stdout.trim(), `node src/station/main.ts dans ${join(mac.base, "runtime")} — BRIGADE_STATION_DIR=${racine}`);
    assert.equal(readFileSync(join(racine, "app.pid"), "utf8").trim(), String(rendu.pid));
  });

  test("le lanceur ne double pas la station que l'app tient : il attend qu'elle la rende", async (t) => {
    const mac = unMac(t, serveur(t, "1.2.3"));
    assert.equal(jouer([], mac.env).code, 0);
    const racine = join(mac.home, ".config/brigade/station");
    writeFileSync(join(racine, "app.pid"), `${process.pid}\n`);
    // Son propre groupe : le `sleep` qu'il attend part avec lui.
    const lanceur = spawn("/bin/sh", [join(mac.base, "lancer-station")], { env: { PATH: "/usr/bin:/bin", BRIGADE_STATION_DIR: racine }, detached: true });
    t.after(() => void process.kill(-(lanceur.pid as number), "SIGKILL"));
    let sortie = "";
    lanceur.stdout.on("data", (bloc: Buffer) => void (sortie += bloc.toString()));
    await jusqua(() => sortie.includes("tenue par l'app"));
    assert.match(sortie, new RegExp(`tenue par l'app \\(pid ${process.pid}\\)`));
    assert.doesNotMatch(sortie, /src\/station\/main\.ts/);
    assert.equal(readFileSync(join(racine, "app.pid"), "utf8").trim(), String(process.pid));
  });

  test("rejouée sans rien de neuf : rien ne se retélécharge, la station n'est pas relancée, et rien ne se redemande", (t) => {
    const servi = serveur(t, "1.2.3");
    const mac = unMac(t, servi);
    const terminal = unTerminal(t);
    assert.equal(jouer([], { ...mac.env, BRIGADE_TERMINAL: terminal }).code, 0);
    const avant = statSync(mac.plist).mtimeMs;
    const deja = mac.appels().length;
    const rendu = jouer([], { ...mac.env, BRIGADE_TERMINAL: terminal });
    assert.equal(rendu.code, 0, rendu.sortie);
    const appels = mac.appels().slice(deja);
    assert.deepEqual(appels.filter((a) => a.startsWith("curl")).map((a) => a.split(" ").at(-1)), ["https://github.com/acme/brigade/releases/latest/download/brigade-station-mac.tar.gz"]);
    assert.deepEqual(appels.filter((a) => a.startsWith("launchctl") && !a.startsWith("launchctl print")), []);
    assert.ok(!appels.some((a) => a.endsWith("auth login") || a.includes("auth login ")), appels.join("\n"));
    assert.equal(statSync(mac.plist).mtimeMs, avant);
    assert.match(rendu.sortie, /rien de neuf : la station tourne déjà sur cette version/);
    assert.match(rendu.sortie, /station installée et active — 1\.2\.3/);
  });

  test("rejouée sur une version publiée plus récente : le runtime est remplacé, et la station relancée sur lui", (t) => {
    const mac = unMac(t, serveur(t, "1.2.3"));
    assert.equal(jouer([], mac.env).code, 0);
    const deja = mac.appels().length;
    const neuf = serveur(t, "1.2.4");
    const rendu = jouer([join(neuf, "brigade-station-mac.tar.gz")], mac.env);
    assert.equal(rendu.code, 0, rendu.sortie);
    assert.match(readFileSync(join(mac.base, "runtime/package.json"), "utf8"), /"version": "1\.2\.4"/);
    assert.deepEqual(mac.appels().slice(deja).filter((a) => a.startsWith("launchctl") && !a.startsWith("launchctl print")), ["launchctl kickstart -k gui/501/brigade.station"]);
    assert.match(rendu.sortie, /station installée et active — 1\.2\.4/);
  });

  test("un node dont l'empreinte n'est pas celle publiée n'est pas posé, et rien n'est lancé", (t) => {
    const mac = unMac(t, serveur(t, "1.2.3", { empreinteFausse: true }));
    const rendu = jouer([], mac.env);
    assert.equal(rendu.code, 1);
    assert.match(rendu.sortie, /l'empreinte de node-v26\.1\.0-darwin-arm64\.tar\.gz n'est pas celle que nodejs\.org publie/);
    assert.ok(!existsSync(join(mac.base, "node")));
    assert.ok(!existsSync(mac.plist));
    assert.deepEqual(mac.appels().filter((a) => a.startsWith("launchctl")), []);
  });

  test("sous root, rien n'est installé : la station tourne sous le compte de qui la lance", (t) => {
    const mac = unMac(t, serveur(t, "1.2.3"), { uid: "0" });
    const rendu = jouer([], mac.env);
    assert.equal(rendu.code, 1);
    assert.match(rendu.sortie, /sur un Mac, elle se fait sous ton compte, sans sudo/);
    assert.deepEqual(mac.appels().filter((a) => a.startsWith("curl") || a.startsWith("launchctl")), []);
  });

  test("sans terminal, la station est installée et la commande dit de la rejouer pour les connexions", (t) => {
    const mac = unMac(t, serveur(t, "1.2.3"));
    const rendu = jouer([], mac.env);
    assert.equal(rendu.code, 0, rendu.sortie);
    assert.deepEqual(mac.appels().filter((a) => a.startsWith("gh") || a.startsWith("claude")), []);
    assert.match(rendu.sortie, /pas de terminal ici pour les connexions : relance la même commande depuis un terminal/);
  });
});

test("un système qui n'est ni Linux ni macOS est refusé", { skip: posixOnly("the installer is a POSIX shell script") }, (t) => {
  const machine = doublures(t, { uname: "echo FreeBSD" });
  const rendu = jouer([], machine.env);
  assert.equal(rendu.code, 1);
  assert.match(rendu.sortie, /la station s'installe sous Linux ou macOS, pas sous FreeBSD/);
});
