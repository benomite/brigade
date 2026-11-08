// Le setup du worktree rejoué dans la cloison du cook (#2889) : `npm ci` purge
// node_modules avant de réinstaller, et la cloison protège des dossiers comme
// iconv-lite/.idea. Le setup ne doit alors rien purger si node_modules est déjà
// complet pour le lockfile — la station l'a posé avant le lancement du cook.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { posixOnly } from "./support/plateforme.ts";
import { ENV_GIT, git, repertoireTemporaire } from "./outils.ts";

const SETUP = join(import.meta.dirname, "../../.claude/brigade/worktree-setup.sh");

// Un `npm` de doublure : `ci` purge node_modules comme le vrai, mais s'arrête
// sur un `.idea` protégé (marqué `.protege`), après avoir purgé ce qui précède —
// l'arbre à moitié purgé du ticket — ; sinon il pose un arbre complet.
const FAUX_NPM = `#!/usr/bin/env bash
echo "$@" >> "$FAUX_NPM_APPELS"
dossier=""
while [ $# -gt 0 ]; do [ "$1" = "--prefix" ] && dossier="$2"; shift; done
nm="$dossier/node_modules"
if [ -d "$nm" ]; then
  rm -rf "$nm/.bin" "$nm/zzz-paquet"
  if [ -e "$nm/iconv-lite/.idea/.protege" ]; then
    echo "npm error EPERM: operation not permitted, rmdir '$nm/iconv-lite/.idea'" >&2
    exit 1
  fi
  rm -rf "$nm"
fi
mkdir -p "$nm/.bin" "$nm/iconv-lite" "$nm/zzz-paquet"
echo '{}' > "$nm/iconv-lite/package.json"
`;

function projet(t: TestContext) {
  const racine = repertoireTemporaire(t);
  const wt = join(racine, "wt");
  mkdirSync(join(wt, ".claude-plugin"), { recursive: true });
  mkdirSync(join(wt, "runtime"), { recursive: true });
  writeFileSync(join(wt, ".claude-plugin/plugin.json"), "{}");
  writeFileSync(join(wt, "runtime/package.json"), "{}");
  writeFileSync(join(wt, "runtime/package-lock.json"), '{"lockfileVersion":3}');
  git(wt, "init", "-q");
  const bin = join(racine, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "npm"), FAUX_NPM);
  chmodSync(join(bin, "npm"), 0o755);
  const appels = join(racine, "appels");
  writeFileSync(appels, "");
  const env = { ...ENV_GIT, PATH: `${bin}:${process.env.PATH ?? ""}`, FAUX_NPM_APPELS: appels };
  const jouer = () => execFileSync("bash", [SETUP, "2889", wt], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const nm = join(wt, "runtime/node_modules");
  return { wt, nm, jouer, installations: () => readFileSync(appels, "utf8").split("\n").filter(Boolean).length };
}

const complet = (nm: string) => ["iconv-lite/package.json", "zzz-paquet", ".bin"].every((chemin) => existsSync(join(nm, chemin)));

describe("setup du worktree sous la cloison du cook", { skip: posixOnly("runs the setup script through bash with a fake npm on PATH; Windows cannot execute the shebang script") }, () => {
  test("avec iconv-lite/.idea protégé, le setup rejoué finit sans erreur et laisse node_modules complet", (t) => {
    const { nm, jouer, installations } = projet(t);
    jouer();
    assert.ok(complet(nm));
    // La cloison protège ce dossier : un `npm ci` y échouerait, à moitié purgé.
    mkdirSync(join(nm, "iconv-lite/.idea"));
    writeFileSync(join(nm, "iconv-lite/.idea/.protege"), "");
    jouer();
    assert.ok(complet(nm), "node_modules n'est pas à moitié purgé");
    assert.ok(existsSync(join(nm, "iconv-lite/.idea/.protege")));
    assert.equal(installations(), 1);
  });

  test("un lockfile changé réinstalle", (t) => {
    const { wt, nm, jouer, installations } = projet(t);
    jouer();
    writeFileSync(join(wt, "runtime/package-lock.json"), '{"lockfileVersion":3,"packages":{}}');
    jouer();
    assert.equal(installations(), 2);
    assert.ok(complet(nm));
  });

  test("un node_modules sans marqueur (purge entamée) est réinstallé", (t) => {
    const { nm, jouer, installations } = projet(t);
    mkdirSync(join(nm, "iconv-lite"), { recursive: true });
    jouer();
    assert.equal(installations(), 1);
    assert.ok(complet(nm));
  });
});
