// L'aide de la commande `brigade` est la même sous Linux, macOS et Windows (#3940) : `brigade --help`
// et `brigade <project> help` passent tous par le geste du runtime (src/station/geste.ts), qui la
// tient seul. Chaque entrée que cette machine sait lancer est jouée telle que son installation la
// pose — le geste du paquet Linux, ~/.local/bin/brigade d'installer-station.sh, brigade.cmd
// d'installer-station.ps1 — et ce qu'elle dit est comparé, mot pour mot, au texte du runtime.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, linkSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { repertoireDuFichier } from "../outils.ts";
import { posixOnly } from "../support/plateforme.ts";
import { GESTE_LINUX, SRC, commandeWindows, installerMac, nodePose, rendu, runtimeDEssai, serveurMac, unMac, type Rendu } from "./aides.ts";

const USAGE = 64;
const MODE_D_EMPLOI = "usage: brigade <project> <command> [arguments…]\n       brigade <project> help    lists the commands\n";
// L'aide des commandes, telle que le runtime la dit.
const AIDE = spawnSync(process.execPath, [join(SRC, "aide.ts")], { encoding: "utf8" }).stdout;

type Entree = { plateforme: string; lancer: (args: string[]) => Rendu; dossier: string; racine?: string };

// Le paquet Linux : le geste à côté du runtime et de son `node`, et une unité de station qui tourne
// sous le compte de qui lance — `systemctl` est une doublure.
function linux(): Entree {
  const racine = repertoireDuFichier("brigade-test-commande-");
  const paquet = join(racine, "usr/lib/brigade-station");
  const bin = join(racine, "bin");
  const station = join(racine, "var/lib/brigade");
  for (const dossier of [join(paquet, "node/bin"), bin, station]) mkdirSync(dossier, { recursive: true });
  copyFileSync(GESTE_LINUX, join(paquet, "brigade"));
  chmodSync(join(paquet, "brigade"), 0o755);
  nodePose(join(paquet, "node/bin/node"));
  runtimeDEssai(paquet, "1.2.3");
  writeFileSync(join(station, "projets"), "calculus acme/calculus main\n");
  writeFileSync(join(bin, "systemctl"), `#!/bin/sh\ncase "$3" in User) id -un ;; Environment) echo "BRIGADE_STATION_DIR=${station}" ;; esac\n`);
  chmodSync(join(bin, "systemctl"), 0o755);
  return { plateforme: "linux", dossier: paquet, lancer: (args) => rendu(spawnSync(join(paquet, "brigade"), args, { encoding: "utf8", env: { PATH: `${bin}:/usr/bin:/bin`, HOME: racine } })) };
}

// Un Mac où installer-station.sh a posé la station, et sa commande.
function macos(): Entree {
  const mac = unMac(null, serveurMac(null, "1.2.3"));
  const installation = installerMac(mac);
  assert.equal(installation.code, 0, installation.sortie + installation.erreur);
  return { plateforme: "macos", dossier: mac.base, lancer: (args) => rendu(spawnSync(mac.commande, args, { encoding: "utf8", env: { PATH: "/usr/bin:/bin", HOME: mac.home } })) };
}

// Un PC où brigade.cmd est posé comme installer-station.ps1 le pose, à côté du runtime et du node.
function windows(): Entree {
  // Effacé par `after`, avec reprises : sous Windows, le `node.exe` que `cmd.exe` vient de lancer tient
  // encore ses fichiers un moment (EPERM), et l'effacement de fin de process, sans reprise, ferait
  // échouer tout le fichier.
  const maison = mkdtempSync(join(tmpdir(), "brigade-test-commande-"));
  const base = join(maison, "AppData/Local/brigade-station");
  for (const dossier of [join(base, "bin"), join(base, "node"), join(maison, ".config/brigade/station")]) mkdirSync(dossier, { recursive: true });
  writeFileSync(join(base, "bin/brigade.cmd"), commandeWindows());
  try {
    linkSync(process.execPath, join(base, "node/node.exe"));
  } catch {
    copyFileSync(process.execPath, join(base, "node/node.exe"));
  }
  runtimeDEssai(base, "1.2.3");
  writeFileSync(join(maison, ".config/brigade/station/projets"), "calculus acme/calculus main\n");
  return { plateforme: "windows", dossier: base, racine: maison, lancer: (args) => rendu(spawnSync("cmd.exe", ["/d", "/c", join(base, "bin/brigade.cmd"), ...args], { encoding: "utf8", env: { ...process.env, USERPROFILE: maison } })) };
}

// Les entrées que cette machine sait lancer : chacune est comparée au même texte, celui du runtime —
// deux qui diffèrent font échouer l'une d'elles.
const ENTREES: Record<string, () => Entree> = process.platform === "win32" ? { windows } : { linux, macos };

for (const [plateforme, poser] of Object.entries(ENTREES)) {
  describe(`l'aide de la commande brigade, sous ${plateforme}`, () => {
    let lancer: Entree["lancer"] = () => assert.fail("la commande n'est pas posée");
    let racine: string | undefined;
    before(() => {
      const entree = poser();
      lancer = entree.lancer;
      racine = entree.racine;
    });
    after(async () => {
      if (racine !== undefined) await rm(racine, { recursive: true, force: true, maxRetries: 50, retryDelay: 100 });
    });

    test("`brigade --help` dit le texte du runtime, le même sous Linux, macOS et Windows", () => {
      assert.deepEqual(lancer(["--help"]), { code: 0, sortie: MODE_D_EMPLOI, erreur: "" });
    });

    test("sans commande, le refus est en 64, avec le même texte sous Linux, macOS et Windows", () => {
      assert.deepEqual(lancer(["calculus"]), { code: USAGE, sortie: "", erreur: MODE_D_EMPLOI });
    });

    test("`brigade <project> help` dit l'aide du runtime, la même sous Linux, macOS et Windows", () => {
      assert.match(AIDE, /^usage: brigade <project> <command> \[arguments…\]\n\nCommands:\n {2}status /);
      assert.deepEqual(lancer(["calculus", "help"]), { code: 0, sortie: AIDE, erreur: "" });
    });

    test("`brigade <project> --help` est `help`", () => {
      assert.deepEqual(lancer(["calculus", "--help"]), { code: 0, sortie: AIDE, erreur: "" });
    });
  });
}

describe("sous Linux, la commande du paquet", { skip: posixOnly("runs the extensionless bash command of the Linux package") }, () => {
  test("après l'installation du paquet, `brigade <project> status` marche comme avant", () => {
    const r = linux().lancer(["calculus", "status", "--suivre"]);

    assert.equal(r.code, 0, r.erreur);
    assert.deepEqual(JSON.parse(r.sortie).args, ["--suivre"]);
  });

  test("sans le `node` du paquet, `brigade --help` le dit, avec son code et ce qui le remet", () => {
    const { dossier, lancer } = linux();
    rmSync(join(dossier, "node/bin/node"));

    const r = lancer(["--help"]);

    assert.equal(r.code, 70);
    assert.equal(r.erreur, `brigade : le \`node\` de la station (${join(dossier, "node/bin/node")}) n'est pas là — le paquet brigade-station le pose à côté de ce geste : \`sudo apt install --reinstall brigade-station\` (docs/bascule.md, « Le geste brigade »)\n`);
  });

  test("sans le runtime du paquet, `brigade --help` le dit, avec le même code", () => {
    const { dossier, lancer } = linux();
    rmSync(join(dossier, "runtime"), { recursive: true });

    const r = lancer(["--help"]);

    assert.equal(r.code, 70);
    assert.equal(r.erreur, `brigade : le runtime de la station (${join(dossier, "runtime")}) n'est pas là — le paquet brigade-station le pose à côté de ce geste : \`sudo apt install --reinstall brigade-station\` (docs/bascule.md, « Le geste brigade »)\n`);
  });
});
