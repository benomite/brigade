import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const script = join(import.meta.dirname, "..", "publier.sh");

// A fake `gh`: the release is the file `release` (its draft state, `true` or `false`), absent when
// there is none; `echecs-create` holds how many `gh release create` refuse before one passes, and
// `erreur-view` an error `gh release view` gives instead of an answer. Each call is logged.
const fauxGh = `#!/usr/bin/env bash
set -eu
d="$FAUX_GH"
echo "$*" >> "$d/appels"
case "$1 $2" in
  "release view")
    if [ -f "$d/erreur-view" ]; then cat "$d/erreur-view" >&2; exit 1; fi
    [ -f "$d/release" ] || { echo "release not found" >&2; exit 1; }
    cat "$d/release" ;;
  "release create")
    n=$(cat "$d/echecs-create" 2>/dev/null || echo 0)
    if [ "$n" -gt 0 ]; then
      echo $((n - 1)) > "$d/echecs-create"
      echo "HTTP 403: You have exceeded a secondary rate limit." >&2
      echo "(https://api.github.com/repos/o/r/releases)" >&2
      exit 1
    fi
    echo false > "$d/release" ;;
  "release upload") ;;
  "release edit")
    case " $* " in *" --draft=false "*) echo false > "$d/release" ;; esac ;;
  *) echo "unexpected: gh $*" >&2; exit 3 ;;
esac
`;

function preparer(etat: { release?: "true" | "false"; echecsCreate?: number; erreurView?: string } = {}) {
  const d = mkdtempSync(join(tmpdir(), "publier-"));
  writeFileSync(join(d, "gh"), fauxGh);
  chmodSync(join(d, "gh"), 0o755);
  writeFileSync(join(d, "notes.md"), "notes");
  if (etat.release !== undefined) writeFileSync(join(d, "release"), `${etat.release}\n`);
  if (etat.echecsCreate !== undefined) writeFileSync(join(d, "echecs-create"), `${etat.echecsCreate}\n`);
  if (etat.erreurView !== undefined) writeFileSync(join(d, "erreur-view"), etat.erreurView);
  return d;
}

function publier(d: string, essais = 3) {
  const r = spawnSync("bash", [script, "app-v1.2.3", join(d, "notes.md"), "Brigade-1.2.3-mac-arm64.dmg", "latest-mac.yml"], {
    cwd: d,
    encoding: "utf8",
    env: { ...process.env, PATH: `${d}:${process.env.PATH}`, FAUX_GH: d, GITHUB_SHA: "abc123", BRIGADE_PUBLIER_ESSAIS: String(essais), BRIGADE_PUBLIER_PAUSE: "0" },
  });
  const appels = existsSync(join(d, "appels")) ? readFileSync(join(d, "appels"), "utf8").trim().split("\n") : [];
  const release = existsSync(join(d, "release")) ? readFileSync(join(d, "release"), "utf8").trim() : undefined;
  return { code: r.status, sortie: r.stdout, erreurs: r.stderr, appels, release };
}

test("with no release for the tag, it creates it on the commit, as latest, with its files", () => {
  const d = preparer();
  const r = publier(d);
  assert.equal(r.code, 0, r.erreurs);
  assert.equal(r.release, "false");
  assert.deepEqual(r.appels.slice(1), [
    `release create app-v1.2.3 Brigade-1.2.3-mac-arm64.dmg latest-mac.yml --target abc123 --title Brigade 1.2.3 --notes-file ${join(d, "notes.md")} --latest`,
  ]);
});

test("a draft left by an earlier attempt is completed and published, not created twice", () => {
  const r = publier(preparer({ release: "true" }));
  assert.equal(r.code, 0, r.erreurs);
  assert.equal(r.release, "false");
  assert.match(r.sortie, /A draft release app-v1\.2\.3 is left from an earlier attempt/);
  assert.equal(r.appels.filter((a) => a.startsWith("release create")).length, 0);
  assert.match(r.appels.find((a) => a.startsWith("release upload")) ?? "", /^release upload app-v1\.2\.3 Brigade-1\.2\.3-mac-arm64\.dmg latest-mac\.yml --clobber$/);
  assert.match(r.appels.find((a) => a.startsWith("release edit")) ?? "", /--draft=false .*--latest$/);
});

test("a published release (a re-run) gets its files replaced and stays published", () => {
  const r = publier(preparer({ release: "false" }));
  assert.equal(r.code, 0, r.erreurs);
  assert.equal(r.release, "false");
  assert.doesNotMatch(r.sortie, /draft/);
  assert.deepEqual(r.appels.map((a) => a.split(" ").slice(0, 2).join(" ")), ["release view", "release upload", "release edit"]);
});

test("a refused attempt is tried again, with a warning that carries gh's error", () => {
  const r = publier(preparer({ echecsCreate: 2 }));
  assert.equal(r.code, 0, r.erreurs);
  assert.equal(r.release, "false");
  assert.equal(r.appels.filter((a) => a.startsWith("release create")).length, 3);
  assert.match(r.sortie, /::warning::Publishing app-v1\.2\.3 failed \(attempt 1 of 3\), trying again in 0s: HTTP 403: You have exceeded a secondary rate limit\. \(https:/);
  assert.match(r.sortie, /attempt 2 of 3/);
});

test("when every attempt fails, it ends red with gh's error as an ::error:: annotation, on one line", () => {
  const r = publier(preparer({ echecsCreate: 5 }), 2);
  assert.equal(r.code, 1);
  assert.equal(r.release, undefined);
  assert.equal(r.appels.filter((a) => a.startsWith("release create")).length, 2);
  assert.match(r.sortie, /^::error::app-v1\.2\.3 was not published after 2 attempts: HTTP 403: You have exceeded a secondary rate limit\. \(https:\/\/api\.github\.com\/repos\/o\/r\/releases\)$/m);
});

test("an error reading the release is not taken for a missing release: nothing is created", () => {
  const r = publier(preparer({ erreurView: "HTTP 502: Bad Gateway\n" }), 1);
  assert.equal(r.code, 1);
  assert.equal(r.appels.filter((a) => a.startsWith("release create")).length, 0);
  assert.match(r.sortie, /::error::app-v1\.2\.3 was not published after 1 attempts: HTTP 502: Bad Gateway$/m);
});

test("a tag that is not an app tag is refused", () => {
  const d = preparer();
  const r = spawnSync("bash", [script, "station-1", join(d, "notes.md"), "x"], { encoding: "utf8", env: { ...process.env, GITHUB_SHA: "abc123" } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /tag inconnu/);
});
