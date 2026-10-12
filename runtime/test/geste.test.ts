// Le geste de la box : `brigade <projet> <commande> [arguments…]` lance une
// commande du runtime pour un projet, sous le compte et dans l'environnement de
// son service. Ni systemd ni `sudo` ici : des doublures dans le `PATH`.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { repertoireTemporaire } from "./outils.ts";

const GESTE = join(import.meta.dirname, "../deploy/brigade");
const USAGE = 64;
const PROJET_INCONNU = 65;
const PAS_DU_RUNTIME = 66;

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
  // Lance le geste, sous `qui` (le chef, sinon).
  geste: (args: string[], qui?: string) => { code: number | null; sortie: string; erreur: string };
  // Ce que le faux `npm` a reçu, ou `null` s'il n'a pas été lancé.
  npm: () => { args: string[]; env: Record<string, string>; cwd: string } | null;
  // Les arguments du faux `sudo`, ou `null` s'il n'a pas été appelé.
  sudo: () => string[] | null;
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
    `for unite in "$5" gabarit; do [ -f "${unites}/$unite/$3" ] && exec cat "${unites}/$unite/$3"; done`,
    "exit 0",
  ]);
  executable(join(bin, "id"), [`echo "\${FAUX_QUI:-chef}"`]);
  // `sudo -H -u <compte> -- <commande…>` : la commande, sous ce compte et dans
  // son répertoire personnel.
  executable(join(bin, "sudo"), [
    `printf '%s\\n' "$@" > "${temoin}/sudo"`,
    `[ "$1 $2 $4" = "-H -u --" ] || { echo "faux sudo : $*" >&2; exit 1; }`,
    `FAUX_QUI="$3" HOME="/home/$3"; export FAUX_QUI HOME; shift 4; exec "$@"`,
  ]);
  executable(join(binUnite, "npm"), [
    `printf '%s\\n' "$@" > "${temoin}/args"; env > "${temoin}/env"; pwd -P > "${temoin}/cwd"`,
    `echo "sortie de la commande"; exit "\${FAUX_NPM_CODE:-0}"`,
  ]);
  writeFileSync(join(installation, "package.json"), JSON.stringify({ scripts: { status: "node src/status.ts", grant: "node src/grant-cli.ts", "plat-du-jour": "true" } }));

  const chemin = [binUnite, dirname(process.execPath), "/usr/bin", "/bin"].join(":");
  writeFileSync(join(unites, "gabarit/User"), "brigade\n");
  writeFileSync(join(unites, "gabarit/WorkingDirectory"), `${installation}\n`);
  writeFileSync(join(unites, "gabarit/Environment"), "BRIGADE_STATE_DIR=/var/lib/brigade/%i\n");
  writeFileSync(join(unites, "gabarit/DropInPaths"), "/etc/systemd/system/brigade@.service.d/override.conf\n");
  writeFileSync(join(unites, "brigade@calculus.service/DropInPaths"), "/etc/systemd/system/brigade@.service.d/override.conf /etc/systemd/system/brigade@calculus.service.d/override.conf\n");
  writeFileSync(join(unites, "brigade@calculus.service/Environment"), `${environnement?.(chemin) ?? [...NEUF, `PATH=${chemin}`].join(" ")}\n`);

  const lire = (nom: string) => (existsSync(join(temoin, nom)) ? readFileSync(join(temoin, nom), "utf8").replace(/\n$/, "") : null);
  return {
    installation,
    chemin,
    geste: (args, qui = "chef") => {
      const fin = spawnSync(GESTE, args, {
        encoding: "utf8",
        cwd: racine,
        env: { PATH: `${bin}:${process.env.PATH}`, HOME: "/home/chef", FAUX_QUI: qui, SECRET_DU_CHEF: "à lui" },
      });
      return { code: fin.status, sortie: fin.stdout, erreur: fin.stderr };
    },
    npm: () => {
      const [args, env, cwd] = [lire("args"), lire("env"), lire("cwd")];
      if (args === null || env === null || cwd === null) return null;
      return { args: args.split("\n"), env: Object.fromEntries(env.split("\n").map((ligne) => [ligne.slice(0, ligne.indexOf("=")), ligne.slice(ligne.indexOf("=") + 1)])), cwd };
    },
    sudo: () => lire("sudo")?.split("\n") ?? null,
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
  for (const commande of ["journal", "status; true", "--version", "toString"]) {
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
