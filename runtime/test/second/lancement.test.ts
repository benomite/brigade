import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Sortie } from "../../src/appel.ts";
import { ligneDeCmd } from "../../src/sans-invite.ts";
import { demarrerLeSecond, finDuSecond, planDuSecond, principal, type PlanDuSecond } from "../../src/second/lancement.ts";
import { jusqua, repertoireTemporaire } from "../outils.ts";

const fichiers = (...chemins: string[]) => {
  const tous = new Set(chemins);
  return (chemin: string) => tous.has(chemin);
};

const pret = (plan: PlanDuSecond) => {
  assert.equal(plan.state, "ready", JSON.stringify(plan));
  assert.ok(plan.state === "ready");
  return plan;
};

const refuse = (plan: PlanDuSecond) => {
  assert.equal(plan.state, "cannot-start", JSON.stringify(plan));
  assert.ok(plan.state === "cannot-start");
  assert.match(plan.reason, /^[^\n]+\.$/);
  return plan;
};

const NPM = "C:\\Users\\chef\\AppData\\Roaming\\npm";
const GIT = "C:\\Program Files\\Git\\cmd\\git.exe";
const BASH = "C:\\Program Files\\Git\\bin\\bash.exe";
const GH = "C:\\Program Files\\GitHub CLI\\gh.exe";
const SOUS_WINDOWS = {
  plateforme: "win32" as const,
  env: { Path: `${NPM};C:\\Program Files\\Git\\cmd;C:\\Program Files\\GitHub CLI`, PATHEXT: ".COM;.EXE;.BAT;.CMD", ComSpec: "C:\\Windows\\system32\\cmd.exe" },
  maison: "C:\\Users\\chef",
};

test("sous Linux, le second se lance par le `claude` du PATH, ses arguments tels quels, dans le dossier du projet", (t) => {
  const dossier = repertoireTemporaire(t);
  const plan = pret(
    planDuSecond({ plateforme: "linux", env: { PATH: "/usr/bin" }, maison: "/home/chef", existe: fichiers("/usr/bin/claude", "/usr/bin/gh", "/usr/bin/git"), folder: dossier, args: ["--continue", "/brigade:po"] }),
  );
  assert.deepEqual(plan.launch, { command: "/usr/bin/claude", args: ["--continue", "/brigade:po"], verbatim: false, folder: dossier, env: {} });
  assert.deepEqual(plan.missing, []);
  assert.equal(plan.reason, undefined);
});

test("sous Windows, un `claude` installé par npm part par `cmd.exe`, sa ligne écrite pour lui, avec le Git Bash du `git` du PATH", (t) => {
  const dossier = repertoireTemporaire(t);
  // npm pose à côté du `.cmd` un `claude` sans extension, que Windows ne sait pas lancer.
  const plan = pret(planDuSecond({ ...SOUS_WINDOWS, existe: fichiers(`${NPM}\\claude`, `${NPM}\\claude.cmd`, GIT, BASH, GH), folder: dossier, args: ["--continue", "/brigade:po"] }));
  assert.deepEqual(plan.launch, {
    command: "C:\\Windows\\system32\\cmd.exe",
    args: ["/d", "/s", "/c", `"${ligneDeCmd(`${NPM}\\claude.cmd`, ["--continue", "/brigade:po"])}"`],
    verbatim: true,
    folder: dossier,
    env: { CLAUDE_CODE_GIT_BASH_PATH: BASH },
  });
});

test("sous Windows, le `claude.exe` de l'installateur part tel quel, et un CLAUDE_CODE_GIT_BASH_PATH déjà posé reste celui du chef", (t) => {
  const dossier = repertoireTemporaire(t);
  const exe = "C:\\Users\\chef\\.local\\bin\\claude.exe";
  const env = { ...SOUS_WINDOWS.env, Path: `C:\\Users\\chef\\.local\\bin;${SOUS_WINDOWS.env.Path}`, CLAUDE_CODE_GIT_BASH_PATH: "D:\\Git\\bin\\bash.exe" };
  const plan = pret(planDuSecond({ ...SOUS_WINDOWS, env, existe: fichiers(exe, GIT, GH, "D:\\Git\\bin\\bash.exe"), folder: dossier, args: ["/brigade:po"] }));
  assert.deepEqual(plan.launch, { command: exe, args: ["/brigade:po"], verbatim: false, folder: dossier, env: {} });
});

test("sous Windows sans `git`, le second ne part pas : Claude Code y exige le Git Bash, et la phrase dit comment l'obtenir", (t) => {
  const plan = refuse(planDuSecond({ ...SOUS_WINDOWS, existe: fichiers(`${NPM}\\claude.cmd`, GH), folder: repertoireTemporaire(t) }));
  assert.equal(plan.cause, "tools-missing");
  assert.equal(plan.reason, "The second cannot start: `git` is missing on this PC.");
  const git = plan.tools?.find(({ tool }) => tool === "git");
  assert.ok(git !== undefined && !git.present);
  assert.match(git.install, /winget install --id Git\.Git/);
});

test("sous Windows, un `git` sans son Git Bash, ou un CLAUDE_CODE_GIT_BASH_PATH qui ne mène à rien : le second ne part pas, et le dit", (t) => {
  const dossier = repertoireTemporaire(t);
  const ailleurs = "D:\\outils\\git\\cmd";
  const env = { Path: `${NPM};${ailleurs};C:\\Program Files\\GitHub CLI`, PATHEXT: ".EXE;.CMD" };
  const sansBash = refuse(planDuSecond({ ...SOUS_WINDOWS, env, existe: fichiers(`${NPM}\\claude.cmd`, `${ailleurs}\\git.exe`, GH), folder: dossier }));
  assert.equal(sansBash.cause, "git-bash-missing");
  assert.match(sansBash.reason, /Claude Code runs its commands in Git Bash, and the git of this PC \(D:\\outils\\git\\cmd\\git\.exe\) comes without it/);

  const nomme = refuse(planDuSecond({ ...SOUS_WINDOWS, env: { ...env, CLAUDE_CODE_GIT_BASH_PATH: "E:\\absent\\bash.exe" }, existe: fichiers(`${NPM}\\claude.cmd`, `${ailleurs}\\git.exe`, GH), folder: dossier }));
  assert.equal(nomme.cause, "git-bash-missing");
  assert.match(nomme.reason, /CLAUDE_CODE_GIT_BASH_PATH names E:\\absent\\bash\.exe, which does not exist on this PC/);
});

test("sans `claude`, le second ne part pas, et la phrase le nomme", (t) => {
  const plan = refuse(planDuSecond({ plateforme: "linux", env: { PATH: "/usr/bin" }, maison: "/home/chef", existe: fichiers("/usr/bin/gh", "/usr/bin/git"), folder: repertoireTemporaire(t) }));
  assert.equal(plan.cause, "tools-missing");
  assert.equal(plan.reason, "The second cannot start: `claude` is missing on this computer.");
  const claude = plan.tools?.find(({ tool }) => tool === "claude");
  assert.ok(claude !== undefined && !claude.present);
  assert.match(claude.install, /install\.sh/);
});

test("sans `gh`, le second part quand même — et dit ce qui échouera tant qu'il manque", (t) => {
  const plan = pret(planDuSecond({ plateforme: "darwin", env: { PATH: "/usr/bin" }, maison: "/Users/chef", existe: fichiers("/usr/bin/claude", "/usr/bin/git"), folder: repertoireTemporaire(t) }));
  assert.deepEqual(plan.missing, ["gh"]);
  assert.equal(plan.reason, "The second starts, but `gh` is missing on this Mac, and what needs it will fail until it is installed.");
  assert.deepEqual(
    plan.tools.filter((vu) => !vu.present).map((vu) => vu.tool),
    ["gh"],
  );
});

test("un dossier de projet qui n'existe pas, un argument que `cmd.exe` couperait : le second ne part pas, et la phrase dit pourquoi", (t) => {
  const dossier = join(repertoireTemporaire(t), "absent");
  const absent = refuse(planDuSecond({ plateforme: "linux", env: { PATH: "/usr/bin" }, maison: "/home/chef", existe: fichiers("/usr/bin/claude", "/usr/bin/gh", "/usr/bin/git"), folder: dossier }));
  assert.equal(absent.cause, "folder-missing");
  assert.equal(absent.reason, `The second cannot start: the project's folder ${dossier} does not exist on this computer.`);

  const coupe = refuse(planDuSecond({ ...SOUS_WINDOWS, existe: fichiers(`${NPM}\\claude.cmd`, GIT, BASH, GH), folder: repertoireTemporaire(t), args: ["first line\nsecond line"] }));
  assert.equal(coupe.cause, "invalid");
  assert.match(coupe.reason, /cmd\.exe cuts its line at the first line break/);
});

test("un lancement que le système refuse : le démarrage le dit en une phrase, sans lever", async (t) => {
  const demarre = await demarrerLeSecond({
    plateforme: "linux",
    env: { PATH: "/usr/bin" },
    maison: "/home/chef",
    existe: fichiers("/usr/bin/claude", "/usr/bin/gh", "/usr/bin/git"),
    folder: repertoireTemporaire(t),
    ouvrir: () => Promise.reject(Object.assign(new Error("spawn /usr/bin/claude ENOENT"), { code: "ENOENT" })),
  });
  assert.equal(demarre.state, "cannot-start");
  assert.ok(demarre.state === "cannot-start");
  assert.equal(demarre.cause, "launch-refused");
  assert.equal(demarre.reason, "The second cannot start on this computer: /usr/bin/claude was not found.");
  assert.equal(demarre.detail, "spawn /usr/bin/claude ENOENT");
});

test("la fin d'un second se dit en une phrase : son code, et la dernière ligne qu'il a écrite, sans ses couleurs", () => {
  assert.deepEqual(finDuSecond(3, "working…\r\n\x1b[31mClaude Code on Windows requires git-bash.\x1b[0m\r\n\r\n"), { code: 3, reason: "The second stopped with code 3: Claude Code on Windows requires git-bash." });
  assert.deepEqual(finDuSecond(0, ""), { code: 0, reason: "The second stopped with code 0, without a word." });
});

// Un second de cette machine, par une doublure de `claude` : chaque ligne qu'il
// reçoit est une commande, qu'il joue dans le shell du système, et dont il rend
// la sortie ; `/exit <code>` l'arrête sur ce code. Sous Windows, elle est un
// lanceur `claude.cmd`, comme celui qu'npm installe.
const FAUX_SECOND = `const { execSync } = require("node:child_process");
const { createInterface } = require("node:readline");
process.stdout.write("second ready\\n");
const lignes = createInterface({ input: process.stdin });
lignes.on("line", (ligne) => {
  const fin = /^\\/exit (\\d+)$/.exec(ligne.trim());
  if (fin) {
    process.stdout.write("bye\\n");
    process.exitCode = Number(fin[1]);
    lignes.close();
    process.stdin.destroy();
    return;
  }
  process.stdout.write(execSync(ligne, { encoding: "utf8" }));
});
`;

function poserLeSecond(t: TestContext): { projet: string; env: Record<string, string | undefined> } {
  const racine = repertoireTemporaire(t);
  const outils = join(racine, "outils");
  const projet = join(racine, "projet");
  mkdirSync(outils);
  mkdirSync(projet);
  // Le PATH de ce second ne porte que ses doublures — sous Windows, il s'écrit souvent `Path` —, et
  // aucun programme que l'environnement nommerait (`BRIGADE_CLAUDE_BIN`…) n'y tient lieu d'outil.
  const env: Record<string, string | undefined> = Object.fromEntries(Object.entries(process.env).filter(([cle]) => cle.toUpperCase() !== "PATH" && !/^BRIGADE_\w+_BIN$/.test(cle)));
  env.PATH = outils;
  const script = join(racine, "faux-second.cjs");
  writeFileSync(script, FAUX_SECOND);
  if (process.platform === "win32") {
    writeFileSync(join(outils, "claude.cmd"), `@"${process.execPath}" "${script}" %*\r\n`);
    for (const outil of ["gh", "git"]) writeFileSync(join(outils, `${outil}.cmd`), "@echo off\r\n");
    // Ce que Claude Code exigerait ; la doublure n'en fait rien.
    env.CLAUDE_CODE_GIT_BASH_PATH = join(outils, "bash.exe");
    writeFileSync(env.CLAUDE_CODE_GIT_BASH_PATH, "");
  } else {
    writeFileSync(join(outils, "claude"), `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`);
    for (const outil of ["gh", "git"]) writeFileSync(join(outils, outil), "#!/bin/sh\n");
    for (const outil of ["claude", "gh", "git"]) chmodSync(join(outils, outil), 0o755);
  }
  return { projet, env };
}

test("les trois outils là, le second démarre sur cette machine — sous Windows par son lanceur `.cmd` —, reçoit une commande et rend sa sortie, puis dit sa fin", async (t) => {
  const { projet, env } = poserLeSecond(t);
  const demarre = await demarrerLeSecond({ folder: projet, env });
  assert.equal(demarre.state, "started", JSON.stringify(demarre));
  assert.ok(demarre.state === "started");
  t.after(() => demarre.second.tuer());
  assert.equal(demarre.launch.verbatim, process.platform === "win32");
  assert.deepEqual(demarre.missing, []);

  let sortie = "";
  demarre.second.surSortie((donnees) => {
    sortie += donnees;
  });
  demarre.second.ecrire("echo second-says-hello\n");
  await jusqua(() => sortie.includes("second-says-hello"));
  demarre.second.ecrire("/exit 3\n");
  assert.deepEqual(await demarre.second.fin, { code: 3, reason: "The second stopped with code 3: bye." });
});

test("la commande rend le plan en une ligne JSON — code 0 quand le second peut partir, 1 sinon, 2 sans dossier", async (t) => {
  const { projet, env } = poserLeSecond(t);
  const lignes: string[] = [];
  const jouer = (args: string[], avec = env) =>
    Promise.resolve()
      .then(() => principal({ args, env: avec, dire: (ligne) => lignes.push(ligne), redire: (ligne) => lignes.push(ligne) }))
      .then(
        () => 0,
        (erreur: unknown) => (erreur instanceof Sortie ? erreur.code : -1),
      );

  assert.equal(await jouer([projet, "--", "/brigade:po"]), 0);
  const plan = JSON.parse(lignes.at(-1) ?? "{}");
  assert.equal(plan.state, "ready");
  assert.equal(plan.launch.folder, projet);

  assert.equal(await jouer([projet], { ...env, PATH: join(projet, "vide") }), 1);
  const sans = JSON.parse(lignes.at(-1) ?? "{}");
  assert.equal(sans.state, "cannot-start");
  assert.equal(sans.cause, "tools-missing");

  assert.equal(await jouer([]), 2);
  assert.match(lignes.at(-1) ?? "", /^usage: /);
});
