// Un seul geste pour lancer l'app : ce que `npm start` pose avant Electron, et
// ce qu'il en dit. Rien n'est installé ici — les commandes sont relevées, pas lancées.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { prepare } from "../src/launch.ts";

// Un dossier d'app : son verrou, daté, et ce qui y est déjà posé.
function folderApp(t: TestContext, pose: { dependances?: Date; electron?: boolean } = {}): string {
  const app = mkdtempSync(join(tmpdir(), "brigade-app-"));
  t.after(() => rmSync(app, { recursive: true, force: true }));
  writeFileSync(join(app, "package-lock.json"), "{}");
  utimesSync(join(app, "package-lock.json"), LOCK, LOCK);
  if (pose.dependances !== undefined) {
    mkdirSync(join(app, "node_modules/electron"), { recursive: true });
    writeFileSync(join(app, "node_modules/.package-lock.json"), "{}");
    utimesSync(join(app, "node_modules/.package-lock.json"), pose.dependances, pose.dependances);
    if (pose.electron) writeFileSync(join(app, "node_modules/electron/path.txt"), "Electron.app");
  }
  return app;
}

const LOCK = new Date("2026-10-12T10:00:00Z");
const BEFORE = new Date("2026-10-12T09:00:00Z");
const AFTER = new Date("2026-10-12T11:00:00Z");

function launch(app: string, codes: number[] = []) {
  const launched: string[] = [];
  const saidOnes: string[] = [];
  const code = prepare({
    app,
    node: "node",
    executer: (command, args) => {
      launched.push([command, ...args].join(" "));
      return codes.shift() ?? 0;
    },
    dire: (line) => void saidOnes.push(line),
  });
  return { code, lancees: launched, dits: saidOnes };
}

describe("le lancement de l'app", () => {
  test("la première fois, il pose les dépendances puis Electron, et dit l'un et l'autre", (t) => {
    const { code, lancees: launched, dits: saidOnes } = launch(folderApp(t));

    assert.equal(code, 0);
    assert.deepEqual(launched, ["npm ci --ignore-scripts", "node node_modules/electron/install.js"]);
    assert.equal(saidOnes.length, 2);
    assert.match(saidOnes[0] ?? "", /^brigade: installing the app's dependencies \(`npm ci --ignore-scripts`\) — they are not there yet\.$/);
    assert.match(saidOnes[1] ?? "", /^brigade: installing Electron .*311 MB/);
  });

  test("tout est déjà là : rien n'est posé, et rien n'est dit", (t) => {
    const { code, lancees: launched, dits: saidOnes } = launch(folderApp(t, { dependances: AFTER, electron: true }));

    assert.equal(code, 0);
    assert.deepEqual(launched, []);
    assert.deepEqual(saidOnes, []);
  });

  test("des dépendances posées sans Electron — le setup de worktree : seul Electron est posé", (t) => {
    const { lancees: launched, dits: saidOnes } = launch(folderApp(t, { dependances: AFTER }));

    assert.deepEqual(launched, ["node node_modules/electron/install.js"]);
    assert.equal(saidOnes.length, 1);
  });

  test("un verrou qui a changé depuis — un `git pull` : les dépendances sont reposées, et la raison est dite", (t) => {
    const { lancees: launched, dits: saidOnes } = launch(folderApp(t, { dependances: BEFORE, electron: true }));

    assert.deepEqual(launched, ["npm ci --ignore-scripts", "node node_modules/electron/install.js"]);
    assert.match(saidOnes[0] ?? "", /— `package-lock\.json` has changed since they were installed\.$/);
  });

  test("une pose qui échoue arrête le lancement, avec son code : Electron n'est pas lancé sur des dépendances à moitié là", (t) => {
    const { code, lancees: launched, dits: saidOnes } = launch(folderApp(t), [7]);

    assert.equal(code, 7);
    assert.deepEqual(launched, ["npm ci --ignore-scripts"]);
    assert.match(saidOnes.at(-1) ?? "", /^brigade: `npm ci --ignore-scripts` failed \(code 7\) — the app is not launched\.$/);
  });
});
