import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { comparerVersions, estUneVersion } from "../../../app/src/mise-a-jour/flux.ts";
import { decider, touchLApp, versionSuivante, VERSION_DE_DEPART } from "../decider.ts";

const script = fileURLToPath(new URL("../decider.ts", import.meta.url));

test("a file under app/ outside app/test/ changes the app", () => {
  assert.equal(touchLApp(["docs/a.md", "app/src/main.ts"]), true);
  assert.equal(touchLApp(["app/package.json"]), true);
});

test("runtime, docs, evals, scripts and app/test do not change the app", () => {
  assert.equal(touchLApp(["runtime/src/a.ts", "docs/app.md", "evals/x.md", "scripts/app-release/decider.ts", "app/test/vue/a.test.ts"]), false);
  assert.equal(touchLApp([]), false);
  assert.equal(touchLApp(["application/x.ts", "app-notes.md"]), false);
});

test("the patch of the latest tag is bumped", () => {
  assert.equal(versionSuivante(["app-v1.2.3"]), "1.2.4");
  assert.equal(versionSuivante(["app-v1.2.3", "app-v1.10.0", "app-v1.9.9", "station-0.2026"]), "1.10.1");
});

test("with no app-v tag, the starting version is printed", () => {
  assert.equal(versionSuivante([]), VERSION_DE_DEPART);
  assert.equal(versionSuivante(["station-0.1.0", "app-vx"]), VERSION_DE_DEPART);
});

test("the output carries the tag only when the app changed", () => {
  assert.equal(decider(["app/src/a.ts"], ["app-v1.2.3"]), "changed=true\ntag=app-v1.2.4\n");
  assert.equal(decider(["runtime/a.ts"], ["app-v1.2.3"]), "changed=false\n");
  assert.equal(decider(["app/src/a.ts"], []), `changed=true\ntag=app-v${VERSION_DE_DEPART}\n`);
});

test("the printed version is accepted by the update check of the app, and above the latest", () => {
  for (const derniere of [undefined, "app-v1.2.3", "app-v0.0.9"]) {
    const version = versionSuivante(derniere === undefined ? [] : [derniere]);
    assert.equal(estUneVersion(version), true);
    if (derniere !== undefined) assert.ok(comparerVersions(version, derniere.slice("app-v".length)) > 0);
  }
});

test("the command reads the files on stdin and the tags from --tag", () => {
  const joue = (entree: string, ...args: string[]) => execFileSync("node", [script, ...args], { input: entree, encoding: "utf8" });
  assert.equal(joue("docs/a.md\napp/src/b.ts\n", "--tag", "app-v1.2.3"), "changed=true\ntag=app-v1.2.4\n");
  assert.equal(joue("docs/a.md\napp/test/b.ts\n", "--tag", "app-v1.2.3"), "changed=false\n");
  assert.equal(joue("app/src/b.ts\n"), "changed=true\ntag=app-v1.0.0\n");
});
