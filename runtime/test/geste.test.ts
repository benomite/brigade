// Le geste d'une station : `brigade <projet> <commande> [arguments…]` lance une
// commande du runtime pour un de ses projets, sous le compte et dans
// l'environnement de l'unité de la station, avec ce qu'elle donne au projet.
// Le geste est posé comme le paquet le pose — à côté du runtime et de son
// `node` — ; ni systemd ni `sudo` ici : des doublures dans le `PATH`, et un
// runtime d'essai dont les commandes disent ce qu'elles ont reçu.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { repertoireTemporaire } from "./outils.ts";

const SOURCE = join(import.meta.dirname, "../deploy/brigade");
const USAGE = 64;
const PROJET_INCONNU = 65;
const PAS_DU_RUNTIME = 66;
const SYSTEMD_MUET = 67;
const SANS_DROIT = 68;
const SUDO_ABSENT = 69;

// Une session à lui, donc sans terminal, même quand la suite est lancée d'un
// terminal. `spawnSync` honore `detached` comme `spawn` ; ses types l'ignorent.
const SANS_TERMINAL = { detached: true };
// Un vrai terminal, celui que `script` ouvre : BSD (macOS) prend la commande en
// arguments, util-linux en une seule chaîne.
const cite = (mot: string) => `'${mot.replaceAll("'", `'\\''`)}'`;
const auTerminal = (commande: string[]) => (process.platform === "linux" ? ["-qec", commande.map(cite).join(" "), "/dev/null"] : ["-q", "/dev/null", ...commande]);
const terminalPossible = () => spawnSync("/usr/bin/script", auTerminal(["/bin/sh", "-c", ": </dev/tty"]), { stdio: "ignore", ...SANS_TERMINAL }).status === 0;

// Une commande du runtime d'essai : elle note ses arguments, son
// environnement et son répertoire, puis sort avec le code qu'on lui dicte.
const TEMOIN = `import { writeFileSync } from "node:fs";
writeFileSync(process.env.TEMOIN_DU_TEST + "/commande.json", JSON.stringify({ args: process.argv.slice(2), env: process.env, cwd: process.cwd() }));
console.log("sortie de la commande");
process.exitCode = Number(process.env.FAUX_CODE ?? 0);
`;

type Machine = {
  // Le geste, là où le paquet le pose, et le runtime à côté de lui.
  geste: string;
  runtime: string;
  station: string;
  // Le `PATH` que l'unité donne.
  chemin: string;
  // Lance le geste, sous `qui` (le chef, sinon), sans terminal — comme par `ssh`.
  lancer: (args: string[], qui?: string) => { code: number | null; sortie: string; erreur: string };
  // Lance le geste dans un terminal, l'entrée laissée au terminal ou redirigée.
  // Le terminal mêle la sortie et l'erreur : seul le code en revient.
  lancerAuTerminal: (args: string[], entree: "terminal" | "redirigée") => number | null;
  // Ce que la commande a reçu, ou `null` si elle n'est pas partie.
  commande: () => { args: string[]; env: Record<string, string>; cwd: string } | null;
  // Les arguments du faux `sudo`, ou `null` s'il n'a pas été appelé.
  sudo: () => string[] | null;
  // Les arguments du faux `sudo` lancé sans mot de passe possible (`-n`), ou `null`.
  sonde: () => string[] | null;
  // Dès lors, `systemctl` échoue quand on lui demande cette propriété.
  panne: (propriete: string) => void;
  // Dès lors, aucune règle sudoers ne donne le geste à celui qui lance.
  sansDroit: () => void;
  // Dès lors, `sudo` lui donne le geste contre son mot de passe — et il porte
  // une entrée `NOPASSWD` sans rapport : lister ne lui en demande aucun.
  avecMotDePasse: () => void;
  // Dès lors, la machine n'a pas de `sudo`.
  sansSudo: () => void;
};

// Une machine : la station installée (compte `brigade`), son unité et
// l'environnement qu'elle déclare — tel que `systemctl show -p Environment
// --value` le rend —, et le projet `calculus` dans sa configuration.
function machine(t: TestContext, options: { environnement?: (station: string, chemin: string, temoin: string) => string; ligne?: string } = {}): Machine {
  const racine = repertoireTemporaire(t);
  const sous = (nom: string) => join(racine, nom);
  const [bin, binUnite, unites, temoin, paquet, station] = [sous("bin"), sous("bin-unite"), sous("unites"), sous("temoin"), sous("usr/lib/brigade-station"), sous("var/lib/brigade")];
  for (const repertoire of [bin, binUnite, unites, temoin, join(paquet, "node/bin"), join(paquet, "runtime/src"), station]) mkdirSync(repertoire, { recursive: true });
  const executable = (fichier: string, lignes: string[]) => {
    writeFileSync(fichier, ["#!/bin/sh", ...lignes, ""].join("\n"));
    chmodSync(fichier, 0o755);
  };
  // Ce que le paquet pose : le geste, le `node` de la station, son runtime.
  const geste = join(paquet, "brigade");
  copyFileSync(SOURCE, geste);
  chmodSync(geste, 0o755);
  symlinkSync(process.execPath, join(paquet, "node/bin/node"));
  const runtime = join(paquet, "runtime");
  symlinkSync(join(import.meta.dirname, "../src/station"), join(runtime, "src/station"));
  for (const fichier of ["temoin.ts", "ancien-nom.ts"]) writeFileSync(join(runtime, "src", fichier), TEMOIN);
  writeFileSync(
    join(runtime, "package.json"),
    JSON.stringify({ type: "module", scripts: { test: "node --test", typecheck: "tsc --noEmit", start: "node src/station/main.ts", status: "node src/temoin.ts", grant: "node src/temoin.ts", help: "node src/temoin.ts", "plat-du-jour": "node src/temoin.ts", ailleurs: "node src/../../ailleurs.ts", "plat-d-hier": "node src/ancien-nom.ts" } }),
  );
  writeFileSync(join(station, "projets"), `${options.ligne ?? "calculus benomite/calculus main BRIGADE_PROXY_PORT=8482"}\n`);

  // `show -p <propriété> --value brigade-station.service` : ce que l'unité déclare.
  executable(join(bin, "systemctl"), [
    `[ "$1 $2 $4 $5" = "show -p --value brigade-station.service" ] || { echo "faux systemctl : $*" >&2; exit 1; }`,
    `[ "$(cat "${unites}/en-panne" 2>/dev/null)" = "$3" ] && { echo "Failed to connect to bus" >&2; exit 1; }`,
    `[ -f "${unites}/$3" ] && exec cat "${unites}/$3"`,
    "exit 0",
  ]);
  executable(join(bin, "id"), [`echo "\${FAUX_QUI:-chef}"`]);
  // `sudo [-n] [-H] -u <compte> -- <commande…>` : la commande, sous ce compte.
  // Le droit est sans mot de passe, sauf `avec-mot-de-passe` ou `aucun` : `-n`
  // est alors refusé, et sans `-n` le mot de passe se demande sur le terminal —
  // jamais sur l'entrée —, où seul `avec-mot-de-passe` passe. `sudo -n -l` ne
  // sait rien de tout cela : il répond dès que lister ne demande rien.
  executable(join(bin, "sudo"), [
    `droit="$(cat "${temoin}/droit" 2>/dev/null)"`,
    `if [ "$1" = "-n" ]; then`,
    `  printf '%s\\n' "$@" > "${temoin}/sudo-sonde"`,
    `  [ "$2" = "-l" ] && [ "$droit" != aucun ] && exit 0`,
    `  [ -z "$droit" ] || { echo "sudo: a password is required" >&2; exit 1; }`,
    "  shift",
    "else",
    `  printf '%s\\n' "$@" > "${temoin}/sudo"`,
    `  [ -z "$droit" ] || (: </dev/tty) 2>/dev/null || { echo "sudo: a terminal is required to read the password" >&2; exit 1; }`,
    `  [ "$droit" != aucun ] || { echo "sudo: 3 incorrect password attempts" >&2; exit 1; }`,
    "fi",
    `[ "$1" = "-H" ] && { HOME="/home/$3"; export HOME; shift; }`,
    `[ "$1 $3" = "-u --" ] || { echo "faux sudo : $*" >&2; exit 1; }`,
    `FAUX_QUI="$2"; export FAUX_QUI; shift 3; exec "$@"`,
  ]);

  const chemin = [binUnite, "/usr/bin", "/bin"].join(":");
  writeFileSync(join(unites, "User"), "brigade\n");
  writeFileSync(join(unites, "Environment"), `${options.environnement?.(station, chemin, temoin) ?? [`BRIGADE_STATION_DIR=${station}`, "BRIGADE_SANDBOX_BIN=/usr/bin/bwrap", `PATH=${chemin}`, `TEMOIN_DU_TEST=${temoin}`].join(" ")}\n`);

  const lire = (nom: string) => (existsSync(join(temoin, nom)) ? readFileSync(join(temoin, nom), "utf8").replace(/\n$/, "") : null);
  // Sans `sudo`, le `PATH` s'arrête aux doublures et à ce qu'elles lancent :
  // celui de la machine en a un.
  let chercher = `${bin}:${process.env.PATH}`;
  const lancement = (qui: string) => ({ cwd: racine, env: { PATH: chercher, HOME: "/home/chef", FAUX_QUI: qui, SECRET_DU_CHEF: "à lui" } });
  return {
    geste,
    runtime,
    station,
    chemin,
    lancer: (args, qui = "chef") => {
      const fin = spawnSync(geste, args, { encoding: "utf8", ...SANS_TERMINAL, ...lancement(qui) });
      return { code: fin.status, sortie: fin.stdout, erreur: fin.stderr };
    },
    lancerAuTerminal: (args, entree) => {
      const commande = entree === "terminal" ? [geste, ...args] : ["/bin/sh", "-c", 'exec "$@" </dev/null', "sh", geste, ...args];
      return spawnSync("/usr/bin/script", auTerminal(commande), { stdio: "ignore", ...SANS_TERMINAL, ...lancement("chef") }).status;
    },
    commande: () => {
      const lu = lire("commande.json");
      return lu === null ? null : JSON.parse(lu);
    },
    sudo: () => lire("sudo")?.split("\n") ?? null,
    sonde: () => lire("sudo-sonde")?.split("\n") ?? null,
    panne: (propriete) => writeFileSync(join(unites, "en-panne"), propriete),
    sansDroit: () => writeFileSync(join(temoin, "droit"), "aucun"),
    avecMotDePasse: () => writeFileSync(join(temoin, "droit"), "avec-mot-de-passe"),
    sansSudo: () => {
      rmSync(join(bin, "sudo"));
      symlinkSync("/bin/cat", join(bin, "cat"));
      chercher = bin;
    },
  };
}

test("le nom du projet et la commande suffisent : le compte et l'environnement viennent de l'unité de la station, le projet de sa configuration", (t) => {
  const m = machine(t);

  const fin = m.lancer(["calculus", "status", "--suivre", "12"]);

  assert.equal(fin.erreur, "");
  assert.equal(fin.code, 0);
  assert.equal(fin.sortie, "sortie de la commande\n");
  assert.deepEqual(m.sudo(), ["-H", "-u", "brigade", "--", m.geste, "calculus", "status", "--suivre", "12"]);
  const lancee = m.commande();
  assert.ok(lancee);
  assert.deepEqual(lancee.args, ["--suivre", "12"]);
  // Ce que la station donne au projet : son nom, son dépôt, sa branche, ses
  // lieux, les réglages de sa ligne — et l'environnement de l'unité.
  assert.equal(lancee.env.BRIGADE_PROJECT, "calculus");
  assert.equal(lancee.env.BRIGADE_GITHUB_REPO, "benomite/calculus");
  assert.equal(lancee.env.BRIGADE_BASE_BRANCH, "main");
  assert.equal(lancee.env.BRIGADE_STATE_DIR, join(m.station, "etat/calculus"));
  assert.equal(lancee.env.BRIGADE_REPO_DIR, join(m.station, "clones/calculus"));
  assert.equal(lancee.env.BRIGADE_PROXY_PORT, "8482");
  assert.equal(lancee.env.BRIGADE_STATION_DIR, m.station);
  assert.equal(lancee.env.BRIGADE_SANDBOX_BIN, "/usr/bin/bwrap");
  assert.equal(lancee.env.PATH, m.chemin);
  assert.equal(lancee.env.HOME, "/home/brigade");
  assert.equal(lancee.env.USER, "brigade");
  assert.equal(realpath(lancee.cwd), realpath(m.runtime));
});

const realpath = (chemin: string) => spawnSync("/bin/sh", ["-c", 'cd "$1" && pwd -P', "sh", chemin], { encoding: "utf8" }).stdout.trim();

test("le clone que la ligne du projet nomme est celui de la commande", (t) => {
  const m = machine(t, { ligne: "calculus benomite/calculus main BRIGADE_REPO_DIR=/var/lib/brigade/calculus/depot" });

  assert.equal(m.lancer(["calculus", "status"]).code, 0);

  assert.equal(m.commande()?.env.BRIGADE_REPO_DIR, "/var/lib/brigade/calculus/depot");
});

test("rien de l'environnement de celui qui lance n'arrive à la commande", (t) => {
  const m = machine(t);

  assert.equal(m.lancer(["calculus", "status"]).code, 0);

  const env = m.commande()?.env ?? {};
  assert.equal(env.SECRET_DU_CHEF, undefined);
  assert.equal(env.FAUX_QUI, undefined);
});

test("une valeur de l'unité qui contient des espaces, des guillemets ou un dollar arrive entière", (t) => {
  const m = machine(t, { environnement: (station, chemin, temoin) => [`BRIGADE_STATION_DIR=${station}`, String.raw`"BRIGADE_SANDBOX_PRIVATE=/srv/deux mots:/srv/\"cité\" \$HOME \\fin"`, `PATH=${chemin}`, `TEMOIN_DU_TEST=${temoin}`, `"VIDE="`].join(" ") });

  assert.equal(m.lancer(["calculus", "status"]).code, 0);

  const env = m.commande()?.env ?? {};
  assert.equal(env.BRIGADE_SANDBOX_PRIVATE, String.raw`/srv/deux mots:/srv/"cité" $HOME \fin`);
  assert.equal(env.VIDE, "");
});

test("les arguments arrivent à la commande tels qu'ils ont été donnés, espaces compris", (t) => {
  const m = machine(t);

  assert.equal(m.lancer(["calculus", "grant", "activer", "merge", "--jusqu-a", "2026-10-12 18:00", "$HOME; true"]).code, 0);

  assert.deepEqual(m.commande()?.args, ["activer", "merge", "--jusqu-a", "2026-10-12 18:00", "$HOME; true"]);
});

test("un `--` devant les arguments, comme `npm run` en demandait un, ne change rien", (t) => {
  const m = machine(t);

  assert.equal(m.lancer(["calculus", "grant", "--", "activer", "merge"]).code, 0);

  assert.deepEqual(m.commande()?.args, ["activer", "merge"]);
});

test("lancé sous le compte de la station, il ne passe pas par `sudo`", (t) => {
  const m = machine(t);

  assert.equal(m.lancer(["calculus", "status"], "brigade").code, 0);

  assert.equal(m.sudo(), null);
  assert.equal(m.sonde(), null);
  assert.deepEqual(m.commande()?.args, []);
});

test("le code de sortie de la commande est rendu tel quel", (t) => {
  const m = machine(t, { environnement: (station, chemin, temoin) => [`BRIGADE_STATION_DIR=${station}`, `PATH=${chemin}`, `TEMOIN_DU_TEST=${temoin}`, "FAUX_CODE=3"].join(" ") });

  assert.equal(m.lancer(["calculus", "status"]).code, 3);
});

test("un projet que cette station ne sert pas est refusé en le disant", (t) => {
  const m = machine(t);

  const fin = m.lancer(["calculs", "status"]);

  assert.equal(fin.code, PROJET_INCONNU);
  assert.equal(fin.erreur, `brigade : projet inconnu sur cette station — « calculs » n'a pas de ligne dans sa configuration (${join(m.station, "projets")})\n`);
  assert.equal(fin.sortie, "");
  assert.equal(m.commande(), null);
});

test("un nom qui n'est pas un nom de projet est refusé sans interroger systemd", (t) => {
  const m = machine(t);

  for (const nom of ["../calculus", "calculus.service", "cal culus", ""]) {
    const fin = m.lancer([nom, "status"]);
    assert.equal(fin.code, PROJET_INCONNU, nom);
    assert.doesNotMatch(fin.erreur, /faux systemctl/);
    assert.equal(m.sudo(), null);
  }
  assert.equal(m.commande(), null);
});

test("une commande qui n'est pas du runtime est refusée, en nommant celles de la station", (t) => {
  const m = machine(t);

  // `journal` est une commande du runtime de ce dépôt, pas de cette station.
  for (const commande of ["journal", "status; true", "--version", "toString", "ailleurs"]) {
    const fin = m.lancer(["calculus", commande]);
    assert.equal(fin.code, PAS_DU_RUNTIME, commande);
    assert.equal(fin.erreur, `brigade : « ${commande} » n'est pas une commande du runtime — celles de cette station : status, grant, help, plat-du-jour\n`);
    assert.equal(fin.sortie, "");
  }
  assert.equal(m.commande(), null);
});

test("sans projet ou sans commande, il dit comment il se lance", (t) => {
  const m = machine(t);

  for (const args of [[], ["calculus"]]) {
    const fin = m.lancer(args);
    assert.equal(fin.code, USAGE);
    assert.match(fin.erreur, /^usage: brigade <project> <command> \[arguments…\]/);
  }
  assert.equal(m.commande(), null);
});

test("`--help` sans projet dit comment il se lance, en anglais, sur la sortie standard et en 0 ; avec un projet, c'est la commande `help` du runtime", (t) => {
  const m = machine(t);

  for (const option of ["--help", "-h"]) {
    const fin = m.lancer([option]);
    assert.equal(fin.code, 0, option);
    assert.equal(fin.sortie, "usage: brigade <project> <command> [arguments…]\n       brigade <project> help    lists the commands\n", option);
    assert.equal(fin.erreur, "", option);
  }
  assert.equal(m.commande(), null);

  for (const option of ["--help", "-h", "help"]) {
    assert.equal(m.lancer(["calculus", option]).code, 0, option);
    assert.equal(m.commande()?.env.npm_lifecycle_event, "help", option);
  }
});

test("un ancien nom de commande — un script qui lance `ancien-nom.ts` — est lancé comme les autres, sous le nom tapé, mais le refus d'une commande inconnue ne le nomme pas", (t) => {
  const m = machine(t);

  assert.equal(m.lancer(["calculus", "plat-d-hier", "--vite"]).code, 0);
  assert.deepEqual(m.commande()?.args, ["--vite"]);
  assert.equal(m.commande()?.env.npm_lifecycle_event, "plat-d-hier");

  const fin = m.lancer(["calculus", "plat-davant"]);
  assert.equal(fin.code, PAS_DU_RUNTIME);
  assert.doesNotMatch(fin.erreur, /plat-d-hier/);
});

test("`test`, `typecheck` et `start` ne sont pas des commandes d'un projet : refusées comme les autres", (t) => {
  const m = machine(t);

  for (const commande of ["test", "typecheck", "start"]) {
    const fin = m.lancer(["calculus", commande, "/tmp/nimporte.ts"]);
    assert.equal(fin.code, PAS_DU_RUNTIME, commande);
    assert.match(fin.erreur, /celles de cette station : status, grant, help, plat-du-jour\n$/);
  }
  assert.equal(m.commande(), null);
});

test("dans le runtime de ce dépôt, seuls `test`, `typecheck` et `start` ne lancent pas un fichier de `src/` par `node`", () => {
  const scripts: Record<string, string> = JSON.parse(readFileSync(join(import.meta.dirname, "../package.json"), "utf8")).scripts;

  const refuses = Object.entries(scripts).filter(([nom, script]) => nom === "start" || !/^node src\/[\w-]+\.ts$/.test(script)).map(([nom]) => nom);

  assert.deepEqual(refuses, ["test", "typecheck", "start"]);
  // La forme que l'app lit passe par le geste, comme les autres.
  assert.equal(scripts.facts, "node src/faits.ts");
});

test("un `systemctl` qui échoue arrête le geste en le disant : ni compte ni environnement supposés", (t) => {
  for (const propriete of ["User", "Environment"]) {
    const m = machine(t);
    m.panne(propriete);

    const fin = m.lancer(["calculus", "status"]);

    assert.equal(fin.code, SYSTEMD_MUET, propriete);
    assert.match(fin.erreur, new RegExp(`brigade : systemd n'a pas répondu pour brigade-station\\.service \\(\`systemctl show -p ${propriete}\` rend 1\\)\n$`));
    assert.equal(fin.sortie, "");
    assert.equal(m.commande(), null);
  }
});

test("une unité de la station qui ne nomme pas son répertoire : refusé, avec le code de systemd — ses projets ne se trouvent pas", (t) => {
  const m = machine(t, { environnement: (_station, chemin, temoin) => [`PATH=${chemin}`, `TEMOIN_DU_TEST=${temoin}`].join(" ") });

  const fin = m.lancer(["calculus", "status"]);

  assert.equal(fin.code, SYSTEMD_MUET);
  assert.match(fin.erreur, /l'unité de la station ne donne pas BRIGADE_STATION_DIR/);
  assert.equal(m.commande(), null);
});

const REFUS = (qui: string) => `brigade : « ${qui} » n'a pas le droit de lancer le geste sur cette machine — sans terminal, \`sudo\` ne le lui donne pas sous le compte « brigade » sans mot de passe (docs/bascule.md, « Le geste brigade »)\n`;

test("sans terminal, celui à qui aucune règle ne donne le geste est refusé en le disant, avec son code : `sudo` ne demande rien", (t) => {
  const m = machine(t);
  m.sansDroit();

  const fin = m.lancer(["calculus", "status"], "associe");

  assert.equal(fin.code, SANS_DROIT);
  assert.equal(fin.erreur, REFUS("associe"));
  assert.equal(fin.sortie, "");
  assert.equal(m.sudo(), null);
  assert.equal(m.commande(), null);
});

test("sans terminal, celui à qui `sudo` demanderait un mot de passe est refusé avec le même code, même si lister ses droits n'en demande pas", (t) => {
  const m = machine(t);
  m.avecMotDePasse();

  const fin = m.lancer(["calculus", "status"]);

  assert.equal(fin.code, SANS_DROIT);
  assert.equal(fin.erreur, REFUS("chef"));
  assert.equal(fin.sortie, "");
  assert.equal(m.sudo(), null);
  assert.equal(m.commande(), null);
});

test("sans terminal, le droit s'éprouve en lançant ce fichier-ci à vide sous le compte du service, et rien de cet essai n'arrive dans la sortie", (t) => {
  const m = machine(t);

  const fin = m.lancer(["calculus", "status"]);

  assert.equal(fin.code, 0);
  assert.equal(fin.sortie, "sortie de la commande\n");
  assert.equal(fin.erreur, "");
  assert.deepEqual(m.sonde(), ["-n", "-u", "brigade", "--", m.geste]);
});

test("dans un terminal, l'entrée redirigée ou non, `sudo` demande son mot de passe et la commande part : le geste ne l'éprouve pas d'abord", (t) => {
  if (!terminalPossible()) return t.skip("`script` n'ouvre pas de terminal ici");
  for (const entree of ["terminal", "redirigée"] as const) {
    const m = machine(t);
    m.avecMotDePasse();

    assert.equal(m.lancerAuTerminal(["calculus", "status", "--suivre"], entree), 0, entree);

    assert.equal(m.sonde(), null, entree);
    assert.deepEqual(m.sudo(), ["-H", "-u", "brigade", "--", m.geste, "calculus", "status", "--suivre"], entree);
    assert.deepEqual(m.commande()?.args, ["--suivre"], entree);
  }
});

test("une machine sans `sudo` le dit, avec son code — pas celui du droit refusé", (t) => {
  const m = machine(t);
  m.sansSudo();

  const fin = m.lancer(["calculus", "status"]);

  assert.equal(fin.code, SUDO_ABSENT);
  assert.equal(fin.erreur, "brigade : `sudo` manque sur cette machine — le geste passe par lui sous le compte « brigade » (docs/bascule.md, « Le geste brigade »)\n");
  assert.equal(fin.sortie, "");
  assert.equal(m.commande(), null);
});

