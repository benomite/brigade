import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

import { ENV_ENFANT } from "../outils.ts";
import { posixOnly } from "./plateforme.ts";
import { compterLesImages, environnement, etatDuPoste, fichiersDeTest, GARDE_MS, laissesEntre, PAR_TEST_MS, part, PRECHARGE } from "./windows.ts";

// Le workflow qui joue les parts sous Windows, tel que le dépôt le porte.
const WORKFLOW = readFileSync(join(import.meta.dirname, "../../../.github/workflows/runtime-windows.yml"), "utf8");

// Ce que le garde laisse au job, une fois la part coupée : le checkout et node avant elle, le rapport et
// les annotations après.
const MARGE_MS = 2 * 60_000;

test("the part's guard falls before the job's cap, which cuts it with no annotation (#2406)", () => {
  const plafond = Number(/^\s*timeout-minutes:\s*(\d+)\s*$/m.exec(WORKFLOW)?.[1]);
  assert.ok(plafond > 0, "runtime-windows.yml gives the job no timeout-minutes");
  assert.ok(GARDE_MS + MARGE_MS <= plafond * 60_000, `the guard (${GARDE_MS / 60_000} min) leaves the job (${plafond} min) less than ${MARGE_MS / 60_000} min`);
});

test("the checkout of a part leaves out docs/captures/, whose extraction ate the margin the guard leaves the job (#3680)", () => {
  const checkout = /- uses: actions\/checkout@v\d+\n((?: {8}.*\n)*)/.exec(WORKFLOW)?.[1] ?? assert.fail("runtime-windows.yml has no checkout");
  assert.match(checkout, /^\s*sparse-checkout-cone-mode:\s*false\s*$/m);
  const motifs = /sparse-checkout: \|\n((?: {12}.*\n)+)/.exec(checkout)?.[1]?.split("\n").map((ligne) => ligne.trim()).filter(Boolean);
  assert.deepEqual(motifs, ["/*", "!/docs/captures/"]);
});

test("the matrix plays every part the command and the check name count", () => {
  const parts = /^\s*part:\s*\[([^\]]*)\]/m.exec(WORKFLOW)?.[1]?.split(",").map((p) => Number(p.trim()));
  const commande = Number(/--part \$\{\{ matrix\.part \}\}\/(\d+)/.exec(WORKFLOW)?.[1]);
  const nom = Number(/name: windows tests \(\$\{\{ matrix\.part \}\}\/(\d+)\)/.exec(WORKFLOW)?.[1]);
  assert.equal(nom, commande);
  assert.deepEqual(parts, Array.from({ length: commande }, (_, i) => i + 1));
});

test("the parts cover every test file once", () => {
  const tous = fichiersDeTest();
  const n = Number(/--part \$\{\{ matrix\.part \}\}\/(\d+)/.exec(WORKFLOW)?.[1]);
  const joues = Array.from({ length: n }, (_, i) => part(tous, `${i + 1}/${n}`)).flat();
  assert.deepEqual(joues.sort(), tous);
});

// Sous Windows, un journal resté ouvert tient son répertoire : l'effacement de fin de test se reprend
// deux minutes avant d'échouer, et quatre tests de todo-base-rouge.test.ts ont mené la part 2 au-delà
// de son garde (#2421, #2425). Sous Linux le répertoire s'efface quand même : rien d'autre ne le voit.
test("every test file that opens a journal closes it, or Windows cannot remove its directory (#2425)", () => {
  const ouvre = new RegExp(["ouvrir", "Journal\\("].join(""));
  const racine = join(import.meta.dirname, "../..");
  const ouverts = fichiersDeTest().filter((f) => {
    const source = readFileSync(join(racine, f), "utf8");
    return ouvre.test(source) && !source.includes(".fermer()");
  });
  assert.deepEqual(ouverts, []);
});

// Un runner qui ne lance plus de process n'a pas de tasklist non plus : « none » cachait qu'on n'avait pas
// pu compter (#2482).
test("the processes left say unknown when tasklist could not run, not none", () => {
  const calme = compterLesImages('"System","4","Services","0","24 K"\r\n"node.exe","10","Console","1","40 000 K"\r\n');
  const charge = compterLesImages('"System","4","Services","0","24 K"\r\n"node.exe","10","Console","1","40 000 K"\r\n"bash.exe","12","Console","1","4 000 K"\r\n');
  assert.equal(laissesEntre(calme, calme), "none");
  assert.equal(laissesEntre(calme, charge), "bash.exe ×1");
  assert.equal(laissesEntre(calme, { illisible: "spawnSync tasklist EPERM" }), "unknown: tasklist failed (spawnSync tasklist EPERM)");
  assert.equal(laissesEntre({ illisible: "exit code 1" }, charge), "unknown: tasklist failed at the start of the part (exit code 1)");
});

// Ce que la part dit du poste à sa fin : de quoi lire, sans le journal du job, un runner qui a perdu son
// disque ou son répertoire temporaire (#2482).
test("the part says the free space of its disks and whether the temp dir is still writable", (t) => {
  const temporaire = mkdtempSync(join(tmpdir(), "brigade-poste-"));
  t.after(() => rmSync(temporaire, { recursive: true, force: true }));
  assert.match(etatDuPoste({ workspace: import.meta.dirname }, temporaire), /^workspace \d+\.\d GB free, temp dir writable$/);
  const absent = join(temporaire, "absent");
  assert.match(etatDuPoste({ workspace: absent }, absent), /^workspace unreadable \(.*ENOENT.*\), temp dir not writable \(.*ENOENT.*\)$/);
});

// #3847 : un test d'acceptation gelé qui lit une PR par `gh` se saute là où `gh` n'est pas connecté —
// le runner Windows en est un — par le garde que `npm test` précharge. La part le précharge de même :
// joué avec son préchargement, un tel fichier se saute au lieu de rougir la part. Le garde y reçoit la
// limite de `--test-timeout` plutôt que ses 30 s.
test("a part's preload skips a frozen acceptance test that reads GitHub where gh is logged out", { skip: posixOnly("a fake gh shell script") }, () => {
  const { scripts } = JSON.parse(readFileSync(join(import.meta.dirname, "../../package.json"), "utf8")) as { scripts: { test: string } };
  assert.ok(scripts.test.includes(PRECHARGE.join(" ")), `npm test does not preload ${PRECHARGE.join(" ")}`);
  const racine = mkdtempSync(join(tmpdir(), "part-gh-"));
  try {
    mkdirSync(join(racine, "test/acceptation-1"), { recursive: true });
    const fichier = join(racine, "test/acceptation-1/lit-une-pr.test.ts");
    writeFileSync(fichier, ['import { execFileSync } from "node:child_process";', 'import { test } from "node:test";', 'test("reads the PR", () => { execFileSync("gh", ["pr", "view", "1"]); });', ""].join("\n"));
    mkdirSync(join(racine, "bin"));
    writeFileSync(join(racine, "bin/gh"), "#!/bin/sh\nexit 1\n");
    chmodSync(join(racine, "bin/gh"), 0o755);
    const r = spawnSync(process.execPath, [...PRECHARGE, "--test", "--test-force-exit", fichier], {
      cwd: join(import.meta.dirname, "../.."),
      encoding: "utf8",
      env: { ...environnement({ ...ENV_ENFANT }, undefined), PATH: `${join(racine, "bin")}:${dirname(process.execPath)}:/usr/bin:/bin` },
    });
    const sortie = r.stdout + r.stderr;
    assert.equal(r.status, 0, sortie);
    assert.match(sortie, /﹣ reads the PR \(.*# gh is missing or logged out/);
  } finally {
    rmSync(racine, { recursive: true, force: true });
  }
  assert.equal(environnement({}, undefined).BRIGADE_TEST_TIMEOUT_MS, PAR_TEST_MS);
  assert.equal(environnement({ BRIGADE_TEST_TIMEOUT_MS: "1000" }, undefined).BRIGADE_TEST_TIMEOUT_MS, "1000");
});
