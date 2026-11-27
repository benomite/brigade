// La commande d'installation d'une station (runtime/deploy/installer-station.sh),
// sous Linux et sous macOS : ce qu'elle installe, la configuration qu'elle
// écrit, les deux connexions qu'elle mène, et ce qu'elle laisse quand on la
// rejoue. Ni root, ni vraie machine, ni identifiants : les commandes du système
// — apt, systemd, launchd, `gh`, `claude`, le téléchargement — sont des
// doublures qui notent leurs appels, et ce qui se télécharge est servi depuis
// un répertoire.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { repertoireTemporaire } from "../outils.ts";
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
  function paquetPose(t: TestContext, appels: string, { code = 0, etape = true } = {}): string {
    const lib = repertoireTemporaire(t);
    mkdirSync(join(lib, "node/bin"), { recursive: true });
    writeFileSync(join(lib, "node/bin/node"), `#!/bin/sh\necho "node $*" >>"${appels}"\nexit ${code}\n`);
    chmodSync(join(lib, "node/bin/node"), 0o755);
    if (etape) {
      mkdirSync(join(lib, "runtime/src/connexion-max"), { recursive: true });
      writeFileSync(join(lib, "runtime/src/connexion-max/connecter-cli.ts"), "// l'étape de connexion Max\n");
    }
    return lib;
  }

  test("sans argument : le paquet de la dernière version publiée, pour l'architecture de la machine, remis à apt", (t) => {
    const machine = doublures(t, debian);
    const rendu = jouer([], machine.env);
    assert.equal(rendu.code, 0, rendu.sortie);
    const appels = machine.appels();
    assert.ok(appels.some((a) => /^curl -fsSL -o \S+\/brigade-station\.deb https:\/\/github\.com\/acme\/brigade\/releases\/download\/station\/brigade-station_amd64\.deb$/.test(a)), appels.join("\n"));
    assert.ok(appels.includes("apt-get update -q"), appels.join("\n"));
    assert.ok(appels.some((a) => /^apt-get install -y -q \/\S+\/brigade-station\.deb$/.test(a)), appels.join("\n"));
    assert.ok(appels.includes("systemctl --quiet is-active brigade-station.service"), appels.join("\n"));
    assert.match(rendu.sortie, /station installée et active — 1\.2\.3/);
    assert.match(rendu.sortie, /la suite : la connexion GitHub et la connexion Max du compte brigade, puis tes projets — pas de terminal ici/);
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

  test("une connexion Max ratée est dite, avec de quoi la reprendre : rejouer la même commande", (t) => {
    const machine = doublures(t, { ...debian, runuser: runuser(true) });
    const lib = paquetPose(t, join(machine.bin, "appels"), { code: 1 });
    const rendu = jouer([], { ...machine.env, BRIGADE_TERMINAL: unTerminal(t), BRIGADE_STATION_LIB: lib });
    assert.equal(rendu.code, 1);
    assert.match(rendu.sortie, /la station est installée, mais sa connexion Max n'est pas faite.*relance la même commande pour la reprendre/);
    assert.deepEqual(machine.appels().filter((a) => a.startsWith("node")), [`node ${lib}/runtime/src/connexion-max/connecter-cli.ts`]);
    assert.doesNotMatch(rendu.sortie, /la station est connectée à GitHub et à Claude/);
  });

  test("un paquet sans l'étape de connexion Max le dit, sans rien lancer, et dit de rejouer la même commande", (t) => {
    const machine = doublures(t, { ...debian, runuser: runuser(true) });
    const lib = paquetPose(t, join(machine.bin, "appels"), { etape: false });
    const rendu = jouer([], { ...machine.env, BRIGADE_TERMINAL: unTerminal(t), BRIGADE_STATION_LIB: lib });
    assert.equal(rendu.code, 1);
    assert.match(rendu.sortie, new RegExp(`la station est installée, mais l'étape de sa connexion Max manque au paquet \\(${lib}/runtime/src/connexion-max/connecter-cli\\.ts\\).*relance la même commande`));
    assert.deepEqual(machine.appels().filter((a) => a.startsWith("node")), []);
    assert.doesNotMatch(rendu.sortie, /la station est connectée à GitHub et à Claude/);
  });
});

describe("sous macOS", { skip: posixOnly("plays deploy/installer-station.sh through `sh` on a fake macOS whose uname, sudo, curl and launchctl are #!/bin/sh doubles first in a PATH joined with “:”: on Windows that PATH is one unknown directory, so neither `sh` nor the doubles are found") }, () => {
  const VERSION_NODE = "v26.1.0";
  const PAQUET_MAC = join(import.meta.dirname, "../../paquet/macos");

  // Ce que les releases et nodejs.org servent : l'archive du runtime d'une
  // version — avec l'ancre pf et ses démons, ceux du dépôt, sauf le chargeur,
  // dont la doublure note son appel et « charge » l'ancre —, et un node
  // darwin-arm64 avec ses empreintes.
  function serveur(t: TestContext, version: string, etat: string, { empreinteFausse = false } = {}): string {
    const dossier = repertoireTemporaire(t);
    const construire = repertoireTemporaire(t);
    mkdirSync(join(construire, "runtime/src/kitchen"), { recursive: true });
    mkdirSync(join(construire, "runtime/paquet/macos"), { recursive: true });
    for (const fichier of ["brigade.pf.conf", "brigade.sudoers", "com.brigade.pf.plist", "com.brigade.gate.plist"]) cpSync(join(PAQUET_MAC, fichier), join(construire, "runtime/paquet/macos", fichier));
    writeFileSync(join(construire, "runtime/paquet/macos/charger-pf.sh"), `#!/bin/sh\necho "charger-pf" >>"${etat}/appels-pf"\ntouch "${etat}/ancre"\n`);
    chmodSync(join(construire, "runtime/paquet/macos/charger-pf.sh"), 0o755);
    writeFileSync(join(construire, "runtime/package.json"), `{\n  "name": "brigade-runtime",\n  "version": "${version}",\n  "type": "module"\n}\n`);
    writeFileSync(join(construire, "runtime/src/kitchen/main.ts"), "// la cuisine\n");
    const nomNode = `node-${VERSION_NODE}-darwin-arm64`;
    mkdirSync(join(construire, nomNode, "bin"), { recursive: true });
    writeFileSync(join(construire, nomNode, "bin/node"), `#!/bin/sh\n[ "$1" = -v ] && { echo ${VERSION_NODE}; exit 0; }\n`);
    chmodSync(join(construire, nomNode, "bin/node"), 0o755);
    const tar = (archive: string, ...quoi: string[]) => assert.equal(spawnSync("tar", ["-czf", join(dossier, archive), "-C", construire, ...quoi]).status, 0);
    tar("brigade-station-mac.tar.gz", "runtime");
    tar(`${nomNode}.tar.gz`, nomNode);
    const empreinte = empreinteFausse ? "0".repeat(64) : createHash("sha256").update(readFileSync(join(dossier, `${nomNode}.tar.gz`))).digest("hex");
    writeFileSync(join(dossier, "SHASUMS256.txt"), `${"1".repeat(64)}  node-${VERSION_NODE}-darwin-x64.tar.gz\n${empreinte}  ${nomNode}.tar.gz\n${"2".repeat(64)}  ${nomNode}.pkg\n`);
    return dossier;
  }

  // Un Mac Apple Silicon, sous un compte ordinaire qui a sudo, où launchd tient
  // des démons, où `pfctl` rend les règles de l'ancre une fois chargée (sauf
  // `ancreVide`), et où `gh` et `claude` ne sont connectés qu'après leur login.
  // Le système est un répertoire d'essai : /opt, /Library et /etc y sont posés.
  function unMac(t: TestContext, version: string, { ancreVide = false, empreinteFausse = false } = {}) {
    const etat = repertoireTemporaire(t);
    const home = repertoireTemporaire(t);
    const systeme = repertoireTemporaire(t);
    const servi = serveur(t, version, etat, { empreinteFausse });
    const vide = ancreVide ? "" : "block drop out all user brigade\\npass out quick on lo0 to lo0 user brigade";
    const machine = doublures(
      t,
      {
        uname: 'case "$1" in -s) echo Darwin ;; -m) echo arm64 ;; esac',
        id: "echo 501",
        sudo: 'if [ "$1" = -u ]; then shift 2; [ "$1" = -H ] && shift; fi; exec "$@"',
        dscl: `[ -f "${etat}/compte" ]`,
        sysadminctl: `touch "${etat}/compte"`,
        openssl: "echo 0123456789abcdef",
        chown: "",
        install: 'n=$#; while [ $n -gt 0 ]; do case "$1" in -o | -g) shift; n=$((n - 1)) ;; *) set -- "$@" "$1" ;; esac; shift; n=$((n - 1)); done; exec /usr/bin/install "$@"',
        pfctl: `[ -f "${etat}/ancre" ] && printf "${vide}\\n"; exit 0`,
        curl: `while [ $# -gt 0 ]; do case "$1" in -o) sortie="$2"; shift ;; http*) adresse="$1" ;; esac; shift; done; cp "${servi}/\${adresse##*/}" "$sortie"`,
        launchctl: `etiquette="\${2##*/}"; case "$1" in print) [ -f "${etat}/charge-$etiquette" ] || exit 1; echo "state = running" ;; bootstrap) touch "${etat}/charge-$(basename "$3" .plist)" ;; bootout) rm -f "${etat}/charge-$etiquette" ;; esac; exit 0`,
        gh: `case "$1 $2" in "auth status") [ -f "${etat}/gh" ] ;; "auth login") touch "${etat}/gh" ;; esac`,
        claude: `case "$1 $2" in "auth status") [ -f "${etat}/claude" ] ;; "auth login") touch "${etat}/claude" ;; esac`,
      },
      { HOME: home, BRIGADE_MAC_OPT: join(systeme, "opt/brigade-station"), BRIGADE_MAC_APPUI: join(systeme, "Library/Application Support/brigade"), BRIGADE_MAC_DEMONS: join(systeme, "Library/LaunchDaemons"), BRIGADE_MAC_SUDOERS: join(systeme, "etc/sudoers.d"), BRIGADE_MAC_MAISON: "/Users/brigade" },
    );
    mkdirSync(join(systeme, "Library/LaunchDaemons"), { recursive: true });
    mkdirSync(join(systeme, "etc/sudoers.d"), { recursive: true });
    const base = join(systeme, "opt/brigade-station/current");
    const demons = join(systeme, "Library/LaunchDaemons");
    return { ...machine, servi, etat, home, base, demons, sudoers: join(systeme, "etc/sudoers.d/brigade"), plist: join(demons, "com.brigade.station.plist"), appelsPf: () => (existsSync(join(etat, "appels-pf")) ? readFileSync(join(etat, "appels-pf"), "utf8").trim().split("\n") : []) };
  }

  const valeurDe = (plist: string, cle: string) => new RegExp(`<key>${cle}</key>\\s*<string>([^<]*)</string>`).exec(plist)?.[1];

  test("la première fois : le compte brigade, le runtime publié, son node vérifié, l'ancre chargée, la porte et la station chargées, puis les deux connexions sous brigade", (t) => {
    const mac = unMac(t, "1.2.3");
    const rendu = jouer([], { ...mac.env, BRIGADE_TERMINAL: unTerminal(t) });
    assert.equal(rendu.code, 0, rendu.sortie);
    const appels = mac.appels();
    assert.ok(appels.some((a) => a.startsWith("sysadminctl -addUser brigade ")), appels.join("\n"));
    assert.deepEqual(
      appels.filter((a) => a.startsWith("curl")).map((a) => a.split(" ").at(-1)),
      ["https://nodejs.org/dist/latest-v26.x/SHASUMS256.txt", `https://nodejs.org/dist/latest-v26.x/node-${VERSION_NODE}-darwin-arm64.tar.gz`, "https://github.com/acme/brigade/releases/download/station/brigade-station-mac.tar.gz"],
    );
    assert.ok(existsSync(join(mac.base, "runtime/src/kitchen/main.ts")));
    assert.equal(spawnSync(join(mac.base, "node/bin/node"), ["-v"], { encoding: "utf8" }).stdout.trim(), VERSION_NODE);
    assert.deepEqual(
      appels.filter((a) => a.startsWith("launchctl bootstrap")),
      [`launchctl bootstrap system ${mac.demons}/com.brigade.gate.plist`, `launchctl bootstrap system ${mac.demons}/com.brigade.station.plist`],
    );
    assert.deepEqual(
      appels.filter((a) => /^(gh|claude) /.test(a)),
      ["gh auth status --hostname github.com", "gh auth login --hostname github.com --web --git-protocol https", "gh auth setup-git", "claude auth status", "claude auth login"],
    );
    // Les connexions sont celles du compte brigade, pas du compte qui lance la commande.
    assert.ok(appels.some((a) => /^sudo -u brigade -H env HOME=\/Users\/brigade PATH=\S+ gh auth login /.test(a)), appels.join("\n"));
    assert.ok(appels.some((a) => /^sudo -u brigade -H env HOME=\/Users\/brigade PATH=\S+ claude auth login/.test(a)), appels.join("\n"));
    assert.match(rendu.sortie, /station installée et active — 1\.2\.3 \(launchctl print system\/com\.brigade\.station/);
    assert.match(rendu.sortie, /la station est connectée à GitHub et à Claude/);
  });

  test("l'ancre pf est chargée avant la station, rechargée à chaque démarrage, et la règle sudo ne laisse que la relecture de l'ancre", (t) => {
    const mac = unMac(t, "1.2.3");
    assert.equal(jouer([], mac.env).code, 0);
    assert.deepEqual(mac.appelsPf(), ["charger-pf"]);
    const appels = mac.appels();
    assert.ok(appels.indexOf(`sudo ${mac.base}/runtime/paquet/macos/charger-pf.sh`) < appels.findIndex((a) => a.startsWith("launchctl bootstrap system") && a.endsWith("com.brigade.station.plist")), appels.join("\n"));
    // Le démon qui la recharge au boot.
    assert.match(readFileSync(join(mac.demons, "com.brigade.pf.plist"), "utf8"), /<key>RunAtLoad<\/key><true\/>/);
    assert.equal(readFileSync(mac.sudoers, "utf8"), readFileSync(join(import.meta.dirname, "../../paquet/macos/brigade.sudoers"), "utf8"));
    assert.match(readFileSync(mac.sudoers, "utf8"), /^brigade ALL=\(root\) NOPASSWD: \/sbin\/pfctl -a brigade -sr$/m);
  });

  test("la porte tourne sous root, la station sous brigade — seul root sort", (t) => {
    const mac = unMac(t, "1.2.3");
    assert.equal(jouer([], mac.env).code, 0);
    const porte = readFileSync(join(mac.demons, "com.brigade.gate.plist"), "utf8");
    assert.equal(valeurDe(porte, "UserName"), "root");
    assert.match(porte, /tenir-portes\.ts/);
    const plist = readFileSync(mac.plist, "utf8");
    assert.equal(valeurDe(plist, "UserName"), "brigade");
    assert.equal(valeurDe(plist, "Label"), "com.brigade.station");
    assert.match(plist, new RegExp(`<string>${mac.base}/node/bin/node</string>\\s*<string>src/kitchen/main\\.ts</string>`));
    assert.equal(valeurDe(plist, "WorkingDirectory"), join(mac.base, "runtime"));
    // Le répertoire d'état et le fichier des portes sont ceux que la porte (root) écrit et que la station lit.
    assert.equal(valeurDe(plist, "BRIGADE_STATION_DIR"), valeurDe(plist, "BRIGADE_STATION_PORTES")?.replace(/\/portes\.json$/, ""));
    assert.ok(existsSync(valeurDe(plist, "BRIGADE_STATION_DIR") as string));
    assert.equal(valeurDe(plist, "HOME"), "/Users/brigade");
    assert.deepEqual(valeurDe(plist, "PATH")?.split(":").slice(0, 3), [join(mac.base, "node/bin"), join(mac.base, "bin"), "/Users/brigade/.local/bin"]);
    assert.match(plist, /<key>RunAtLoad<\/key>\s*<true\/>/);
    assert.match(plist, /<key>KeepAlive<\/key>\s*<dict>\s*<key>SuccessfulExit<\/key>\s*<false\/>/);
    // Son arrêt n'emporte pas les cooks, comme KillMode=process sous Linux.
    assert.match(plist, /<key>AbandonProcessGroup<\/key>\s*<true\/>/);
    // Aucun identifiant n'y est écrit : les connexions sont celles de `gh` et de `claude`.
    assert.doesNotMatch(plist, /TOKEN|token|sk-ant/);
  });

  test("l'ancre ne bloque rien une fois chargée : la commande refuse, et la station n'est pas démarrée", (t) => {
    const mac = unMac(t, "1.2.3", { ancreVide: true });
    const rendu = jouer([], mac.env);
    assert.equal(rendu.code, 1);
    assert.match(rendu.sortie, /installation refusée — l'ancre pf brigade est chargée mais ne bloque rien/);
    assert.deepEqual(mac.appels().filter((a) => a.startsWith("launchctl bootstrap")), []);
    assert.ok(!existsSync(mac.plist));
  });

  test("rejouée sans rien de neuf : rien ne se retélécharge, rien n'est relancé, et rien ne se redemande", (t) => {
    const mac = unMac(t, "1.2.3");
    const terminal = unTerminal(t);
    assert.equal(jouer([], { ...mac.env, BRIGADE_TERMINAL: terminal }).code, 0);
    const avant = statSync(mac.plist).mtimeMs;
    const deja = mac.appels().length;
    const rendu = jouer([], { ...mac.env, BRIGADE_TERMINAL: terminal });
    assert.equal(rendu.code, 0, rendu.sortie);
    const appels = mac.appels().slice(deja);
    assert.deepEqual(appels.filter((a) => a.startsWith("curl")).map((a) => a.split(" ").at(-1)), ["https://github.com/acme/brigade/releases/download/station/brigade-station-mac.tar.gz"]);
    assert.deepEqual(appels.filter((a) => /^launchctl (bootstrap|bootout|kickstart)/.test(a)), []);
    assert.ok(!appels.some((a) => a.endsWith("auth login") || a.includes("auth login ")), appels.join("\n"));
    assert.equal(statSync(mac.plist).mtimeMs, avant);
    assert.match(rendu.sortie, /rien de neuf : la station tourne déjà sur cette version/);
    assert.match(rendu.sortie, /station installée et active — 1\.2\.3/);
  });

  test("rejouée sur une version publiée plus récente : le runtime est remplacé, et la station relancée sur lui", (t) => {
    const mac = unMac(t, "1.2.3");
    assert.equal(jouer([], mac.env).code, 0);
    const deja = mac.appels().length;
    const neuf = serveur(t, "1.2.4", mac.etat);
    const rendu = jouer([join(neuf, "brigade-station-mac.tar.gz")], mac.env);
    assert.equal(rendu.code, 0, rendu.sortie);
    assert.match(readFileSync(join(mac.base, "runtime/package.json"), "utf8"), /"version": "1\.2\.4"/);
    assert.deepEqual(
      mac.appels().slice(deja).filter((a) => /^launchctl (bootstrap|bootout|kickstart)/.test(a)),
      ["launchctl kickstart -k system/com.brigade.gate", "launchctl kickstart -k system/com.brigade.station"],
    );
    assert.match(rendu.sortie, /station installée et active — 1\.2\.4/);
  });

  test("un node dont l'empreinte n'est pas celle publiée n'est pas posé, et rien n'est lancé", (t) => {
    const mac = unMac(t, "1.2.3", { empreinteFausse: true });
    const rendu = jouer([], mac.env);
    assert.equal(rendu.code, 1);
    assert.match(rendu.sortie, /l'empreinte de node-v26\.1\.0-darwin-arm64\.tar\.gz n'est pas celle que nodejs\.org publie/);
    assert.ok(!existsSync(join(mac.base, "node")));
    assert.ok(!existsSync(mac.plist));
    assert.deepEqual(mac.appels().filter((a) => a.startsWith("launchctl")), []);
  });

  test("sans terminal, la station est installée et la commande dit de la rejouer pour les connexions", (t) => {
    const mac = unMac(t, "1.2.3");
    const rendu = jouer([], mac.env);
    assert.equal(rendu.code, 0, rendu.sortie);
    assert.deepEqual(mac.appels().filter((a) => /^(gh|claude) /.test(a)), []);
    assert.match(rendu.sortie, /pas de terminal ici pour les connexions : relance la même commande depuis un terminal/);
  });
});

test("un système qui n'est ni Linux ni macOS est refusé", { skip: posixOnly("plays deploy/installer-station.sh through `sh` with a #!/bin/sh uname double answering FreeBSD, first in a PATH joined with “:”, and expects its refusal: on Windows that PATH is one unknown directory, so `sh` itself is not found") }, (t) => {
  const machine = doublures(t, { uname: "echo FreeBSD" });
  const rendu = jouer([], machine.env);
  assert.equal(rendu.code, 1);
  assert.match(rendu.sortie, /la station s'installe sous Linux ou macOS, pas sous FreeBSD/);
});
