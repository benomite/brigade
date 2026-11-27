// La file du projet lue pour le second par un crochet SessionStart : déclaré dans les seuls réglages de l'onglet
// Second, joué à la main il rend le contexte que `claude` attend, et une file illisible est dite sans bloquer. La file
// est ce qui attend le chef, lu sur GitHub seul par le `gh` du poste (#1845, #2460) : ses issues, leurs labels, leurs
// commentaires — ni tableau de la cuisine, ni box, ni station. Que l'app et le second disent la même chose :
// test/board/wait-of-chef.test.ts.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, test, type TestContext } from "node:test";
import { hooksOfTheFile, MATCHER } from "../../src/second/hook-of-the-file.ts";
import { callByGh, contextOfTheFile, contextOfTheWriting, readTheFile } from "../../src/second/file.ts";
import { argumentsOfSecond, settingsOfSecond, type SettingsOfSecond } from "../../src/second/launch.ts";
import { openTerminals, type Launch } from "../../src/terminals.ts";
import type { CallGitHub } from "../../src/board/client.ts";

const SCRIPT = join(import.meta.dirname, "..", "..", "src", "second", "file.ts");
// Le faux `gh` est un script `sh` : un Windows ne le lance pas.
const WITHOUT_SH = process.platform === "win32" ? "le faux gh est un script sh, que Windows ne lance pas" : false;

function folder(t: TestContext): string {
  const d = mkdtempSync(join(tmpdir(), "brigade-file-"));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
}

// Un faux `gh` : il écrit ce qu'il a reçu, rend `sortie` et `erreur`, et sort avec `code`. Seul dans le PATH du crochet :
// ni `git` — il lit ses fichiers par `/bin/cat`.
function fakeGh(t: TestContext, code: number, output: string, error = ""): string {
  const d = folder(t);
  writeFileSync(join(d, "sortie"), output);
  writeFileSync(join(d, "erreur"), error);
  const gh = join(d, "gh");
  writeFileSync(gh, `#!/bin/sh\necho "$@" > '${join(d, "recu")}'\n/bin/cat '${join(d, "sortie")}'\n/bin/cat '${join(d, "erreur")}' >&2\nexit ${code}\n`);
  chmodSync(gh, 0o755);
  return gh;
}

// Un faux `gh` qui rend, chemin par chemin, ce que GitHub tient du projet (`reponseA`) : il écrit chaque appel reçu.
// `attente` : ce que chaque appel met à répondre, en secondes.
// `depot` : ce qu'il rend du dépôt lui-même (`repos/<depot>`, ses `permissions`, #3163) — `[]` sans lui.
function ghOfProject(t: TestContext, wait = 0, repository?: unknown): string {
  const d = folder(t);
  const paths = ["repos/x/issues?labels=fire", "repos/x/issues?labels=chef-todo", "repos/x/issues/8/comments", "repos/x/issues/20/comments"];
  paths.forEach((path, rank) => writeFileSync(join(d, `${rank}.json`), JSON.stringify(answerA(path))));
  const gh = join(d, "gh");
  const theCase = ["*labels=fire*", "*labels=chef-todo*", "*/issues/8/comments*", "*/issues/20/comments*"].map((motive, rank) => `  ${motive}) /bin/cat '${join(d, `${rank}.json`)}' ;;`).join("\n");
  writeFileSync(join(d, "depot.json"), JSON.stringify(repository ?? []));
  const ofRepository = `  repos/${REPOSITORY}) /bin/cat '${join(d, "depot.json")}' ;;`;
  writeFileSync(gh, `#!/bin/sh\necho "$@" >> '${join(d, "recu")}'\n${wait === 0 ? "" : `sleep ${wait}\n`}case "$2" in\n${ofRepository}\n${theCase}\n  *) echo '[]' ;;\nesac\n`);
  chmodSync(gh, 0o755);
  return gh;
}

// Le crochet tel que `claude` le joue : `node file.ts <nom> <depot> <gh>`, dans le dossier de la session.
function play(t: TestContext, gh: string, name: string, repository: string) {
  const r = spawnSync(process.execPath, [SCRIPT, name, repository, gh], { encoding: "utf8", cwd: folder(t), env: { PATH: join(gh, ".."), HOME: folder(t) } });
  return { ...r, json: r.stdout.trim() === "" ? undefined : (JSON.parse(r.stdout) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } }) };
}

const REPOSITORY = "acme/brigade";
const READ = "2026-11-05T12:00:00.000Z";

// Ce que GitHub tient du projet : #8, en pass, sa livraison touche à ce qui la juge — sa carte `chef-todo` demande au chef
// de la merger ; #20, une carte `chef-todo` ; #1, sur le rail, calibré par le manager, n'attend rien — ni le chef, ni un manager (le rail bloqué,
// #3358 : test/rail-blocked/). Rendu par chemin de l'API, comme `gh api` le rend.
const FIRE = [
  { number: 1, title: "Ticket 1", html_url: `https://github.com/${REPOSITORY}/issues/1`, created_at: "2026-11-01T00:00:00Z", labels: [{ name: "fire" }, { name: "model:sonnet" }, { name: "effort:medium" }] },
  { number: 8, title: "Ticket 8", html_url: `https://github.com/${REPOSITORY}/issues/8`, created_at: "2026-11-01T00:00:00Z", labels: [{ name: "fire" }, { name: "in-pass" }, { name: "chef-todo" }] },
];
const CHEF = [FIRE[1], { number: 20, title: "Ticket 20", html_url: `https://github.com/${REPOSITORY}/issues/20`, created_at: "2026-11-01T00:00:00Z", labels: [{ name: "chef-todo" }] }];
const COMMENTS: Record<number, unknown[]> = {
  8: [{ body: "<!-- brigade:todo kind=merge-by-hand -->\nMerge the PR of #8 by hand? It changes what judges it.\n- [merge] Merge the PR of #8", author_association: "OWNER", created_at: "2026-11-05T09:00:00Z" }],
  20: [{ body: "<!-- brigade:todo kind=blocked -->\nWhich token does the box use for the registry?", author_association: "OWNER", created_at: "2026-11-05T10:00:00Z" }],
};
// La réponse de GitHub à un chemin : la liste au label demandé, les commentaires d'une issue, rien d'autre.
function answerA(path: string): unknown {
  const label = /[?&]labels=([^&]+)/.exec(path)?.[1];
  if (label === "fire") return FIRE;
  if (label === "chef-todo") return CHEF;
  const commented = /\/issues\/(\d+)\/comments/.exec(path)?.[1];
  return commented === undefined ? [] : (COMMENTS[Number(commented)] ?? []);
}
const github: CallGitHub = async (path) => ({ status: 200, data: answerA(path) });

// Le bloc `awaiting` que l'app et le second en lisent, bords compris.
const BLOCK = [
  "awaiting   2 decisions await the chef — the oldest for 3 h 00",
  "  #8  for 3 h 00  Merge the PR of #8 by hand? It changes what judges it. — answer on its Todo card: “Merge the PR of #8” — or in your own words  Ticket 8",
  "  #20  for 2 h 00  Which token does the box use for the registry? — answer on its Todo card, in your own words  Ticket 20",
  "end awaiting",
].join("\n");

describe("le crochet de la file, dans les réglages du second", () => {
  test("SessionStart pour startup, resume et compact", () => {
    const settings = settingsOfSecond(hooksOfTheFile({ node: "/usr/bin/node", gh: "gh", cible: { nom: "brigade", depot: "acme/brigade" } }));
    const hooks = settings.hooks?.SessionStart ?? assert.fail("pas de SessionStart");
    assert.equal(hooks.length, 1);
    assert.deepEqual(MATCHER.split("|"), ["startup", "resume", "compact"]);
    assert.equal(hooks[0]?.matcher, MATCHER);
    assert.match(hooks[0]?.hooks[0]?.command ?? "", /^'\/usr\/bin\/node' '.*second\/file\.ts' 'brigade' 'acme\/brigade' 'gh'$/);
  });

  test("le lancement du second le porte, à la reprise comme en session neuve ; rien n'est écrit ailleurs", () => {
    const launched: Launch[] = [];
    const terminals = openTerminals({
      claude: "claude",
      shell: "/bin/zsh",
      node: "/usr/bin/node",
      ouvrirPty(l) {
        launched.push(l);
        return { ecrire: () => {}, redimensionner: () => {}, tuer: () => {} };
      },
      surSortie: () => {},
      surEtat: () => {},
    });
    terminals.espace({ nom: "brigade", dossier: "/projets/brigade", depot: "acme/brigade" });
    const args = launched.at(0)?.args ?? assert.fail("aucun lancement");
    const settings = JSON.parse(args[args.indexOf("--settings") + 1] ?? "") as { hooks: { SessionStart: { matcher: string; hooks: { type: "command"; command: string }[] }[] } };
    assert.equal(settings.hooks.SessionStart[0]?.matcher, "startup|resume|compact");
    assert.match(settings.hooks.SessionStart[0]?.hooks[0]?.command ?? "", /'brigade' 'acme\/brigade' 'gh'$/);
    assert.equal(argumentsOfSecond({ reprise: true, reglages: settings as SettingsOfSecond }).includes("--continue"), true);
  });

  test("sans le crochet dans aucun fichier du projet : le module n'écrit rien", () => {
    const source = readFileSync(SCRIPT, "utf8");
    assert.doesNotMatch(source, /writeFile|appendFile|\.claude/);
  });
});

describe("la file lue sur GitHub seul, sans tableau de la cuisine ni autre machine", () => {
  test("ce qui attend le chef, chaque entrée avec sa question et son geste, dans le bloc `awaiting` — et l'heure de la lecture", async () => {
    const paths: string[] = [];
    const readEntry = await readTheFile(async (path) => (paths.push(path), github(path)), REPOSITORY, () => new Date(READ));
    assert.ok(readEntry.lue, JSON.stringify(readEntry));
    assert.equal(readEntry.texte, `${BLOCK}\n`);
    assert.equal(readEntry.lu, READ);
    assert.ok(!paths.some((path) => path.includes("kitchen-board")), "the Kitchen board is never asked for");
    const context = contextOfTheFile({ nom: "brigade", depot: REPOSITORY }, readEntry);
    assert.ok(context.endsWith(`\n\n${BLOCK}`), context);
    assert.match(context, /from GitHub only — the issues of the project, their labels and their comments, not the Kitchen board/);
    assert.match(context, /the same items as the app's Todo, each with its question and its gesture/);
    assert.match(context, /do not run it again\. Read at 2026-11-05T12:00:00\.000Z, on acme\/brigade\./);
  });

  test("rien n'attend le chef : le bloc le dit, bords compris", async () => {
    const readEntry = await readTheFile(async (path) => ({ status: 200, data: path.includes("labels=fire") ? [FIRE[0]] : [] }), REPOSITORY, () => new Date(READ));
    assert.ok(readEntry.lue);
    assert.match(contextOfTheFile({ nom: "brigade" }, readEntry), /\n\nawaiting {3}nothing awaits the chef\nend awaiting$/);
  });

  test("GitHub qui refuse : dit en une phrase, jamais une file vide", async () => {
    const refusal = await readTheFile(async () => ({ status: 404, data: { message: "Not Found" } }), REPOSITORY);
    assert.ok(!refusal.lue);
    assert.match(contextOfTheFile({ nom: "brigade" }, refusal), /file non lue : GitHub n'a pas rendu ce qui attend le chef\n.*HTTP 404/);
  });

  test("GitHub pas joint : dit, sans bloquer", async () => {
    const readEntry = await readTheFile(async () => assert.fail("getaddrinfo ENOTFOUND api.github.com"), REPOSITORY);
    assert.match(contextOfTheFile({ nom: "brigade" }, readEntry), /file non lue : GitHub pas joint\n.*ENOTFOUND/);
  });
});

describe("le crochet joué à la main", () => {
  test("il lit GitHub par le `gh` du poste, et rend la file au format du contexte additionnel — rien d'autre que `gh` dans son PATH", { skip: WITHOUT_SH }, (t) => {
    const gh = ghOfProject(t);
    const r = play(t, gh, "brigade", REPOSITORY);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json?.hookSpecificOutput.hookEventName, "SessionStart");
    const context = r.json?.hookSpecificOutput.additionalContext ?? "";
    // Les durées se comptent jusqu'à la lecture : la même file que BLOC, à l'heure près.
    assert.equal(context.slice(context.indexOf("\n\nawaiting") + 2).replace(/for \d+ (?:d|h \d\d|min|s)\b/g, "for …"), BLOCK.replace(/for \d+ (?:d|h \d\d|min|s)\b/g, "for …"), context);
    const receivedOnes = readFileSync(join(gh, "..", "recu"), "utf8");
    assert.match(receivedOnes, new RegExp(`^api repos/${REPOSITORY}/issues\\?state=open&labels=fire&`, "m"));
    assert.doesNotMatch(receivedOnes, /kitchen-board/);
  });

  test("un dépôt où le compte du poste ne peut pas écrire : la file, puis la ligne `Read-only:` et ce que le second ne peut pas y faire (#3163)", { skip: WITHOUT_SH }, (t) => {
    const r = play(t, ghOfProject(t, 0, { full_name: REPOSITORY, permissions: { admin: false, push: false, pull: true } }), "brigade", REPOSITORY);
    assert.equal(r.status, 0, r.stderr);
    const context = r.json?.hookSpecificOutput.additionalContext ?? "";
    assert.match(context, /\nend awaiting\n\nRead-only: your GitHub account cannot write to acme\/brigade\. .*you cannot change anything there/);
  });

  test("un dépôt où le compte écrit, ou dont GitHub ne dit pas l'écriture : aucune ligne `Read-only:`", { skip: WITHOUT_SH }, (t) => {
    for (const repository of [{ full_name: REPOSITORY, permissions: { push: true } }, { full_name: REPOSITORY }]) {
      const r = play(t, ghOfProject(t, 0, repository), "brigade", REPOSITORY);
      assert.equal(r.status, 0, r.stderr);
      assert.doesNotMatch(r.json?.hookSpecificOutput.additionalContext ?? "", /Read-only/);
    }
    assert.equal(contextOfTheWriting(REPOSITORY, true), "");
    assert.equal(contextOfTheWriting(REPOSITORY, null), "");
  });

  test("GitHub qui refuse : dit, et la session n'est pas bloquée", { skip: WITHOUT_SH }, (t) => {
    const r = play(t, fakeGh(t, 1, JSON.stringify({ message: "Not Found" }), "gh: Not Found (HTTP 404)"), "brigade", REPOSITORY);
    assert.equal(r.status, 0);
    assert.match(r.json?.hookSpecificOutput.additionalContext ?? "", /file non lue : GitHub n'a pas rendu ce qui attend le chef\n.*HTTP 404/);
  });

  test("un projet sans dépôt, dans un dossier sans origine : dit qu'aucun dépôt n'est connu, et sort en 0", { skip: WITHOUT_SH }, (t) => {
    const r = play(t, fakeGh(t, 0, "[]"), "brigade", "");
    assert.equal(r.status, 0);
    assert.match(r.json?.hookSpecificOutput.additionalContext ?? "", /file non lue : aucun dépôt GitHub pour ce projet/);
  });

  test("la lecture entière tient dans son délai, toutes ses vagues d'appels comprises : passé, la file est dite non lue, avant que `claude` ne tue le crochet", { skip: WITHOUT_SH }, async (t) => {
    // Chaque appel répond en 0,4 s, sous le délai de 0,6 s ; mais les commentaires de #8 ne se demandent qu'une fois les
    // listes rendues : deux vagues, 0,8 s au moins — la seconde passe l'échéance commune.
    const readEntry = await readTheFile(callByGh(ghOfProject(t, 0.4), 600), REPOSITORY);
    assert.ok(!readEntry.lue, JSON.stringify(readEntry));
    assert.match(contextOfTheFile({ nom: "brigade" }, readEntry), /file non lue : GitHub pas joint\n.*no answer in 1 s/);
  });

  test("un gh introuvable : dit, et sort en 0", (t) => {
    const r = spawnSync(process.execPath, [SCRIPT, "brigade", REPOSITORY, join(folder(t), "gh-absent")], { encoding: "utf8" });
    assert.equal(r.status, 0);
    assert.match((JSON.parse(r.stdout) as { hookSpecificOutput: { additionalContext: string } }).hookSpecificOutput.additionalContext, /file non lue : GitHub pas joint/);
  });
});
