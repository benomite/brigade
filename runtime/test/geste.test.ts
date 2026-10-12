// Le geste de la box : `brigade <projet> <commande> [arguments…]` lance une
// commande du runtime pour un projet, sous le compte et dans l'environnement de
// son service. Ni systemd ni `sudo` ici : des doublures dans le `PATH`.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { repertoireTemporaire } from "./outils.ts";

const GESTE = join(import.meta.dirname, "../deploy/brigade");
const USAGE = 64;
const PROJET_INCONNU = 65;
const PAS_DU_RUNTIME = 66;
const SYSTEMD_MUET = 67;
const SANS_DROIT = 68;
const SUDO_ABSENT = 69;
const NODE_INAPTE = 70;

// Une session à lui, donc sans terminal, même quand la suite est lancée d'un
// terminal. `spawnSync` honore `detached` comme `spawn` ; ses types l'ignorent.
const SANS_TERMINAL = { detached: true };
// Un vrai terminal, celui que `script` ouvre : BSD (macOS) prend la commande en
// arguments, util-linux en une seule chaîne.
const cite = (mot: string) => `'${mot.replaceAll("'", `'\\''`)}'`;
const auTerminal = (commande: string[]) => (process.platform === "linux" ? ["-qec", commande.map(cite).join(" "), "/dev/null"] : ["-q", "/dev/null", ...commande]);
const terminalPossible = () => spawnSync("/usr/bin/script", auTerminal(["/bin/sh", "-c", ": </dev/tty"]), { stdio: "ignore", ...SANS_TERMINAL }).status === 0;

const NEUF = [
  "BRIGADE_STATE_DIR=/var/lib/brigade/calculus",
  "BRIGADE_PROJECT=calculus",
  "BRIGADE_REPO_DIR=/var/lib/brigade/calculus/depot",
  "BRIGADE_GITHUB_REPO=benomite/calculus",
  "BRIGADE_BASE_BRANCH=main",
  "BRIGADE_MANAGER_MODEL=opus",
  "BRIGADE_MANAGER_EFFORT=high",
  "BRIGADE_REVIEWER_MODEL=sonnet",
  "BRIGADE_REVIEWER_EFFORT=low",
];

type Box = {
  installation: string;
  // Le `PATH` que l'unité donne : le faux `npm`, `node`, et de quoi les lancer.
  chemin: string;
  // Lance le geste, sous `qui` (le chef, sinon), sans terminal — comme par `ssh`.
  geste: (args: string[], qui?: string) => { code: number | null; sortie: string; erreur: string };
  // Lance le geste dans un terminal, l'entrée laissée au terminal ou redirigée.
  // Le terminal mêle la sortie et l'erreur : seul le code en revient.
  gesteAuTerminal: (args: string[], entree: "terminal" | "redirigée") => number | null;
  // Ce que le faux `npm` a reçu, ou `null` s'il n'a pas été lancé.
  npm: () => { args: string[]; env: Record<string, string>; cwd: string } | null;
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
  // Dès lors, la box n'a pas de `sudo`.
  sansSudo: () => void;
};

// Une box : l'unité gabarit (compte `brigade`, une installation), et le projet
// `calculus` déclaré par son drop-in, avec l'environnement dicté — tel que
// `systemctl show -p Environment --value` le rend.
function box(t: TestContext, environnement?: (chemin: string) => string): Box {
  const racine = repertoireTemporaire(t);
  const sous = (nom: string) => join(racine, nom);
  const [bin, binUnite, unites, temoin, installation] = [sous("bin"), sous("bin-unite"), sous("unites"), sous("temoin"), sous("opt/brigade/runtime")];
  for (const repertoire of [bin, binUnite, temoin, installation, join(unites, "gabarit"), join(unites, "brigade@calculus.service")]) mkdirSync(repertoire, { recursive: true });
  const executable = (fichier: string, lignes: string[]) => {
    writeFileSync(fichier, ["#!/bin/sh", ...lignes, ""].join("\n"));
    chmodSync(fichier, 0o755);
  };
  // `show -p <propriété> --value <unité>` : ce que l'instance déclare, sinon ce
  // que le gabarit donne à toute instance — même à celle qui n'a jamais existé.
  executable(join(bin, "systemctl"), [
    `[ "$1 $2 $4" = "show -p --value" ] || { echo "faux systemctl : $*" >&2; exit 1; }`,
    `[ "$(cat "${unites}/en-panne" 2>/dev/null)" = "$3" ] && { echo "Failed to connect to bus" >&2; exit 1; }`,
    `for unite in "$5" gabarit; do [ -f "${unites}/$unite/$3" ] && exec cat "${unites}/$unite/$3"; done`,
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
  executable(join(binUnite, "npm"), [
    `printf '%s\\n' "$@" > "${temoin}/args"; env > "${temoin}/env"; pwd -P > "${temoin}/cwd"`,
    `echo "sortie de la commande"; exit "\${FAUX_NPM_CODE:-0}"`,
  ]);
  writeFileSync(join(installation, "package.json"), JSON.stringify({ scripts: { test: "node --test", typecheck: "tsc --noEmit", start: "node src/main.ts", status: "node src/status.ts", grant: "node src/grant-cli.ts", "plat-du-jour": "node src/plat-du-jour.ts", ailleurs: "node src/../../ailleurs.ts" } }));

  const chemin = [binUnite, dirname(process.execPath), "/usr/bin", "/bin"].join(":");
  writeFileSync(join(unites, "gabarit/User"), "brigade\n");
  writeFileSync(join(unites, "gabarit/WorkingDirectory"), `${installation}\n`);
  writeFileSync(join(unites, "gabarit/Environment"), "BRIGADE_STATE_DIR=/var/lib/brigade/%i\n");
  writeFileSync(join(unites, "gabarit/DropInPaths"), "/etc/systemd/system/brigade@.service.d/override.conf\n");
  writeFileSync(join(unites, "brigade@calculus.service/DropInPaths"), "/etc/systemd/system/brigade@.service.d/override.conf /etc/systemd/system/brigade@calculus.service.d/override.conf\n");
  writeFileSync(join(unites, "brigade@calculus.service/Environment"), `${environnement?.(chemin) ?? [...NEUF, `PATH=${chemin}`].join(" ")}\n`);

  const lire = (nom: string) => (existsSync(join(temoin, nom)) ? readFileSync(join(temoin, nom), "utf8").replace(/\n$/, "") : null);
  // Sans `sudo`, le `PATH` s'arrête aux doublures et à ce qu'elles lancent :
  // celui de la machine en a un.
  let chercher = `${bin}:${process.env.PATH}`;
  const lancement = (qui: string) => ({ cwd: racine, env: { PATH: chercher, HOME: "/home/chef", FAUX_QUI: qui, SECRET_DU_CHEF: "à lui" } });
  return {
    installation,
    chemin,
    geste: (args, qui = "chef") => {
      const fin = spawnSync(GESTE, args, { encoding: "utf8", ...SANS_TERMINAL, ...lancement(qui) });
      return { code: fin.status, sortie: fin.stdout, erreur: fin.stderr };
    },
    gesteAuTerminal: (args, entree) => {
      const commande = entree === "terminal" ? [GESTE, ...args] : ["/bin/sh", "-c", 'exec "$@" </dev/null', "sh", GESTE, ...args];
      return spawnSync("/usr/bin/script", auTerminal(commande), { stdio: "ignore", ...SANS_TERMINAL, ...lancement("chef") }).status;
    },
    npm: () => {
      const [args, env, cwd] = [lire("args"), lire("env"), lire("cwd")];
      if (args === null || env === null || cwd === null) return null;
      return { args: args.split("\n"), env: Object.fromEntries(env.split("\n").map((ligne) => [ligne.slice(0, ligne.indexOf("=")), ligne.slice(ligne.indexOf("=") + 1)])), cwd };
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

test("le nom du projet et la commande suffisent : le compte, l'installation et l'environnement viennent de l'unité", (t) => {
  const b = box(t);

  const fin = b.geste(["calculus", "status", "--suivre", "12"]);

  assert.equal(fin.erreur, "");
  assert.equal(fin.code, 0);
  assert.equal(fin.sortie, "sortie de la commande\n");
  assert.deepEqual(b.sudo(), ["-H", "-u", "brigade", "--", GESTE, "calculus", "status", "--suivre", "12"]);
  const npm = b.npm();
  assert.ok(npm);
  assert.deepEqual(npm.args, ["--silent", "--prefix", b.installation, "run", "status", "--", "--suivre", "12"]);
  for (const affectation of NEUF) assert.equal(npm.env[affectation.slice(0, affectation.indexOf("="))], affectation.slice(affectation.indexOf("=") + 1));
  assert.equal(npm.env.PATH, b.chemin);
  assert.equal(npm.env.HOME, "/home/brigade");
  assert.equal(npm.env.USER, "brigade");
  assert.equal(realpath(npm.cwd), realpath(b.installation));
});

const realpath = (chemin: string) => spawnSync("/bin/sh", ["-c", 'cd "$1" && pwd -P', "sh", chemin], { encoding: "utf8" }).stdout.trim();

test("rien de l'environnement de celui qui lance n'arrive à la commande", (t) => {
  const b = box(t);

  assert.equal(b.geste(["calculus", "status"]).code, 0);

  const env = b.npm()?.env ?? {};
  assert.equal(env.SECRET_DU_CHEF, undefined);
  assert.equal(env.FAUX_QUI, undefined);
});

test("une valeur de l'unité qui contient des espaces, des guillemets ou un dollar arrive entière", (t) => {
  const b = box(t, (chemin) => [...NEUF, String.raw`"BRIGADE_SANDBOX_PRIVATE=/srv/deux mots:/srv/\"cité\" \$HOME \\fin"`, `PATH=${chemin}`, `"VIDE="`].join(" "));

  assert.equal(b.geste(["calculus", "status"]).code, 0);

  const env = b.npm()?.env ?? {};
  assert.equal(env.BRIGADE_SANDBOX_PRIVATE, String.raw`/srv/deux mots:/srv/"cité" $HOME \fin`);
  assert.equal(env.VIDE, "");
  assert.equal(env.BRIGADE_REVIEWER_EFFORT, "low");
});

test("les arguments arrivent à la commande tels qu'ils ont été donnés, espaces compris", (t) => {
  const b = box(t);

  assert.equal(b.geste(["calculus", "grant", "activer", "merge", "--jusqu-a", "2026-10-12 18:00", "$HOME; true"]).code, 0);

  assert.deepEqual(b.npm()?.args.slice(4), ["grant", "--", "activer", "merge", "--jusqu-a", "2026-10-12 18:00", "$HOME; true"]);
});

test("un `--` devant les arguments, comme `npm run` en demandait un, ne change rien", (t) => {
  const b = box(t);

  assert.equal(b.geste(["calculus", "grant", "--", "activer", "merge"]).code, 0);

  assert.deepEqual(b.npm()?.args.slice(4), ["grant", "--", "activer", "merge"]);
});

test("lancé sous le compte du service, il ne passe pas par `sudo`", (t) => {
  const b = box(t);

  assert.equal(b.geste(["calculus", "status"], "brigade").code, 0);

  assert.equal(b.sudo(), null);
  assert.equal(b.sonde(), null);
  assert.deepEqual(b.npm()?.args.slice(3), ["run", "status", "--"]);
});

test("le code de sortie de la commande est rendu tel quel", (t) => {
  const b = box(t, (chemin) => [...NEUF, `PATH=${chemin}`, "FAUX_NPM_CODE=1"].join(" "));

  assert.equal(b.geste(["calculus", "status"]).code, 1);
});

test("un projet que cette box ne sert pas est refusé en le disant, bien que systemd réponde pour lui", (t) => {
  const b = box(t);

  const fin = b.geste(["calculs", "status"]);

  assert.equal(fin.code, PROJET_INCONNU);
  assert.match(fin.erreur, /^brigade : projet inconnu sur cette box — « calculs »/);
  assert.equal(fin.sortie, "");
  assert.equal(b.sudo(), null);
  assert.equal(b.npm(), null);
});

test("un nom qui n'est pas un nom de projet est refusé sans interroger systemd", (t) => {
  const b = box(t);

  for (const nom of ["../calculus", "calculus.service", "cal culus", ""]) {
    const fin = b.geste([nom, "status"]);
    assert.equal(fin.code, PROJET_INCONNU, nom);
    assert.doesNotMatch(fin.erreur, /faux systemctl/);
  }
  assert.equal(b.npm(), null);
});

test("une commande qui n'est pas du runtime est refusée, en nommant celles de l'installation", (t) => {
  const b = box(t);

  // `journal` est une commande du runtime de ce dépôt, pas de cette installation.
  for (const commande of ["journal", "status; true", "--version", "toString", "ailleurs"]) {
    const fin = b.geste(["calculus", commande]);
    assert.equal(fin.code, PAS_DU_RUNTIME, commande);
    assert.equal(fin.erreur, `brigade : « ${commande} » n'est pas une commande du runtime — celles de cette installation : status, grant, plat-du-jour\n`);
    assert.equal(fin.sortie, "");
  }
  assert.equal(b.npm(), null);
});

test("sans projet ou sans commande, il dit comment il se lance", (t) => {
  const b = box(t);

  for (const args of [[], ["calculus"]]) {
    const fin = b.geste(args);
    assert.equal(fin.code, USAGE);
    assert.match(fin.erreur, /^usage : brigade <projet> <commande> \[arguments…\]/);
  }
  assert.equal(b.npm(), null);
});

test("`test`, `typecheck` et `start` ne sont pas des commandes d'un projet : refusées comme les autres", (t) => {
  const b = box(t);

  for (const commande of ["test", "typecheck", "start"]) {
    const fin = b.geste(["calculus", commande, "/tmp/nimporte.ts"]);
    assert.equal(fin.code, PAS_DU_RUNTIME, commande);
    assert.match(fin.erreur, /celles de cette installation : status, grant, plat-du-jour\n$/);
  }
  assert.equal(b.npm(), null);
});

test("dans le runtime de ce dépôt, seuls `test`, `typecheck` et `start` ne lancent pas un fichier de `src/` par `node`", () => {
  const scripts: Record<string, string> = JSON.parse(readFileSync(join(import.meta.dirname, "../package.json"), "utf8")).scripts;

  const refuses = Object.entries(scripts).filter(([nom, script]) => nom === "start" || !/^node src\/[\w-]+\.ts$/.test(script)).map(([nom]) => nom);

  assert.deepEqual(refuses, ["test", "typecheck", "start"]);
});

test("un `systemctl` qui échoue arrête le geste en le disant : ni projet inconnu, ni compte ou environnement supposés", (t) => {
  for (const propriete of ["DropInPaths", "User", "WorkingDirectory", "Environment"]) {
    const b = box(t);
    b.panne(propriete);

    const fin = b.geste(["calculus", "status"]);

    assert.equal(fin.code, SYSTEMD_MUET, propriete);
    assert.match(fin.erreur, new RegExp(`brigade : systemd n'a pas répondu pour brigade@calculus\\.service \\(\`systemctl show -p ${propriete}\` rend 1\\)\n$`));
    assert.equal(fin.sortie, "");
    assert.equal(b.npm(), null);
  }
});

const REFUS = (qui: string) => `brigade : « ${qui} » n'a pas le droit de lancer le geste sur cette box — sans terminal, \`sudo\` ne le lui donne pas sous le compte « brigade » sans mot de passe (docs/installer.md, « Ajouter un humain »)\n`;

test("sans terminal, celui à qui aucune règle ne donne le geste est refusé en le disant, avec son code : `sudo` ne demande rien", (t) => {
  const b = box(t);
  b.sansDroit();

  const fin = b.geste(["calculus", "status"], "associe");

  assert.equal(fin.code, SANS_DROIT);
  assert.equal(fin.erreur, REFUS("associe"));
  assert.equal(fin.sortie, "");
  assert.equal(b.sudo(), null);
  assert.equal(b.npm(), null);
});

test("sans terminal, celui à qui `sudo` demanderait un mot de passe est refusé avec le même code, même si lister ses droits n'en demande pas", (t) => {
  const b = box(t);
  b.avecMotDePasse();

  const fin = b.geste(["calculus", "status"]);

  assert.equal(fin.code, SANS_DROIT);
  assert.equal(fin.erreur, REFUS("chef"));
  assert.equal(fin.sortie, "");
  assert.equal(b.sudo(), null);
  assert.equal(b.npm(), null);
});

test("sans terminal, le droit s'éprouve en lançant ce fichier-ci à vide sous le compte du service, et rien de cet essai n'arrive dans la sortie", (t) => {
  const b = box(t);

  const fin = b.geste(["calculus", "status"]);

  assert.equal(fin.code, 0);
  assert.equal(fin.sortie, "sortie de la commande\n");
  assert.equal(fin.erreur, "");
  assert.deepEqual(b.sonde(), ["-n", "-u", "brigade", "--", GESTE]);
});

test("dans un terminal, l'entrée redirigée ou non, `sudo` demande son mot de passe et la commande part : le geste ne l'éprouve pas d'abord", (t) => {
  if (!terminalPossible()) return t.skip("`script` n'ouvre pas de terminal ici");
  for (const entree of ["terminal", "redirigée"] as const) {
    const b = box(t);
    b.avecMotDePasse();

    assert.equal(b.gesteAuTerminal(["calculus", "status", "--suivre"], entree), 0, entree);

    assert.equal(b.sonde(), null, entree);
    assert.deepEqual(b.sudo(), ["-H", "-u", "brigade", "--", GESTE, "calculus", "status", "--suivre"], entree);
    assert.deepEqual(b.npm()?.args.slice(3), ["run", "status", "--", "--suivre"], entree);
  }
});

test("une box sans `sudo` le dit, avec son code — pas celui du droit refusé", (t) => {
  const b = box(t);
  b.sansSudo();

  const fin = b.geste(["calculus", "status"]);

  assert.equal(fin.code, SUDO_ABSENT);
  assert.equal(fin.erreur, "brigade : `sudo` manque sur cette box — le geste passe par lui sous le compte « brigade » (docs/installer.md, « Préparer la box »)\n");
  assert.equal(fin.sortie, "");
  assert.equal(b.npm(), null);
});

// Un `node` qui ne démarre pas, posé devant le vrai dans le `PATH` de l'unité.
function nodeEnPanne(t: TestContext, lignes: string[]) {
  const bin = repertoireTemporaire(t);
  writeFileSync(join(bin, "node"), ["#!/bin/sh", ...lignes, ""].join("\n"));
  chmodSync(join(bin, "node"), 0o755);
  return box(t, (chemin) => [...NEUF, `PATH=${bin}:${chemin}`].join(" "));
}

test("un `node` à qui il manque libatomic est nommé, avec le paquet qui le règle : le piège d'un Debian nu ne se découvre plus en butant dessus", (t) => {
  const b = nodeEnPanne(t, ['echo "node: error while loading shared libraries: libatomic.so.1: cannot open shared object file: No such file or directory" >&2', "exit 127"]);

  const fin = b.geste(["calculus", "installation"]);

  assert.equal(fin.code, NODE_INAPTE);
  assert.equal(
    fin.erreur,
    "brigade : `node` ne démarre pas dans l'environnement de brigade@calculus.service — node: error while loading shared libraries: libatomic.so.1: cannot open shared object file: No such file or directory\n" +
      "          → `sudo apt install libatomic1` (docs/installer.md, « Préparer la box »)\n",
  );
  assert.equal(fin.sortie, "");
  assert.equal(b.npm(), null);
});

test("un `node` qui ne démarre pas pour une autre raison est refusé avec ses mots, et le `PATH` où il a été cherché", (t) => {
  const b = nodeEnPanne(t, ['echo "node: cassé" >&2', "exit 1"]);

  const fin = b.geste(["calculus", "status"]);

  assert.equal(fin.code, NODE_INAPTE);
  assert.match(fin.erreur, /^brigade : `node` ne démarre pas dans l'environnement de brigade@calculus\.service — node: cassé\n          → Node doit se lancer par son nom dans le `PATH` de l'unité \(\S+\) \(docs\/installer\.md, « Préparer la box »\)\n$/);
  assert.equal(b.npm(), null);
});

test("un `node` plus ancien que celui que le runtime réclame est refusé en disant les deux versions", (t) => {
  const b = box(t);
  const paquet = join(b.installation, "package.json");
  writeFileSync(paquet, JSON.stringify({ ...JSON.parse(readFileSync(paquet, "utf8")), engines: { node: ">=999" } }));

  const fin = b.geste(["calculus", "status"]);

  assert.equal(fin.code, NODE_INAPTE);
  assert.equal(fin.erreur, `brigade : \`node\` est en ${process.version} dans l'environnement de brigade@calculus.service, le runtime réclame la version 999 au moins (docs/installer.md, « Préparer la box »)\n`);
  assert.equal(fin.sortie, "");
  assert.equal(b.npm(), null);
});

test("le `node` que le runtime réclame, ou plus récent, lance la commande", (t) => {
  const b = box(t);
  const paquet = join(b.installation, "package.json");
  writeFileSync(paquet, JSON.stringify({ ...JSON.parse(readFileSync(paquet, "utf8")), engines: { node: `>=${process.versions.node.split(".")[0]}` } }));

  const fin = b.geste(["calculus", "status"]);

  assert.equal(fin.code, 0);
  assert.equal(fin.erreur, "");
});
