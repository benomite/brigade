// #4511 — main.ts, service.ts and the bridge read nothing from the old runtime: none of them names a `runtime/src/<x>`
// but `runtime/src/kitchen/`; every channel the desktop bridge wires has its handler, and the bridge declares no channel
// that none has; what main.ts read through the old runtime's modules — the GitHub sign-in, the first ticket, a project's
// local copy, Claude Code's session — it now does itself.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { failureOfGh, readTheAccountGitHub, signInToGitHub } from "../../src/connection-github.ts";
import { create, draft } from "../../src/first-ticket.ts";
import { openTheLocalCopy, sessionOfClaude } from "../../src/local-copy.ts";
import { WITHOUT_POSIX } from "../helpers/posix.ts";

const SRC = join(import.meta.dirname, "..", "..", "src");
const read = (path: string) => readFileSync(join(SRC, path), "utf8");
const SCOPE = ["main.ts", "service.ts", "vue/bridge.d.ts"];

const folder = (t: TestContext) => {
  const made = mkdtempSync(join(tmpdir(), "brigade-4511-"));
  t.after(() => rmSync(made, { recursive: true, force: true }));
  return made;
};
// A stand-in program: a shell script that writes `output` and `errors`, and exits with `code`.
const program = (t: TestContext, body: string) => {
  const path = join(folder(t), "program");
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
};

describe("#4511 — main.ts, service.ts and the bridge read nothing from the old runtime", () => {
  test("no file of the ticket names a path of runtime/src other than runtime/src/kitchen/", () => {
    const found = SCOPE.flatMap((file) => read(file).split("\n").flatMap((line, rank) => (/runtime\/src\/(?!kitchen\/)/.test(line) ? [`${file}:${rank + 1}: ${line.trim()}`] : [])));
    assert.deepEqual(found, []);
  });

  test("main.ts loads nothing from the runtime but the kitchen", () => {
    const loads = [...read("main.ts").matchAll(/ofRuntime<[^>]*>\(([^)]*)\)/g)].map(([, args]) => args);
    assert.ok(loads.length > 0);
    for (const args of loads) assert.match(args ?? "", /^"kitchen", /);
    assert.doesNotMatch(read("main.ts"), /join\(locations\.runtime, "src", "(?!kitchen")/);
  });

  test("every channel the desktop bridge wires has a handler in the main process, and the bridge declares none that no bridge wires", () => {
    const handled = new Set<string>();
    const walk = (path: string): string[] => (statSync(path).isDirectory() ? readdirSync(path).flatMap((name) => walk(join(path, name))) : [path]);
    for (const file of walk(SRC).filter((path) => path.endsWith(".ts"))) for (const [, channel] of readFileSync(file, "utf8").matchAll(/\.(?:handle|on)\("([^"]+)"/g)) handled.add(channel ?? "");
    const preload = read("preload.cjs");
    const wired = [...preload.matchAll(/ipcRenderer\.(?:invoke|send)\("([^"]+)"/g)].map(([, channel]) => channel ?? "");
    assert.deepEqual(wired.filter((channel) => !handled.has(channel)), []);
    // The channels the old runtime's removal plans went through, which nothing handled any more.
    const bridge = read("vue/bridge.d.ts");
    for (const gone of ["direJournal", "planifier", "desinstaller"]) {
      assert.doesNotMatch(bridge, new RegExp(`\\b${gone}\\??\\(`));
      assert.doesNotMatch(preload, new RegExp(`\\b${gone}:`));
    }
  });

  test("the control of an installed project no longer runs on a timer", () => {
    assert.doesNotMatch(read("main.ts"), /setInterval\(checkAll/);
  });
});

describe("#4511 — a `gh` that fails, judged by the app", () => {
  const judged = (code: string | number | null, errors: string, killed = false) => failureOfGh("gh", 30_000, { code, killed, message: "Command failed" }, errors);

  test("no account is the step to take; no `gh`, no network, a limit, a timeout are causes", () => {
    assert.deepEqual(judged(4, "To get started with GitHub CLI, please run:  gh auth login"), { state: "sign-in-required" });
    assert.deepEqual(judged("ENOENT", ""), { state: "unavailable", cause: "gh-missing", link: "https://cli.github.com", detail: "Command failed" });
    assert.deepEqual(judged(1, "error connecting to api.github.com"), { state: "unavailable", cause: "network", detail: "error connecting to api.github.com" });
    assert.deepEqual(judged(1, "API rate limit exceeded"), { state: "unavailable", cause: "rate-limit", detail: "API rate limit exceeded" });
    assert.deepEqual(judged(null, "", true), { state: "unavailable", cause: "timeout", detail: "Command failed" });
    assert.deepEqual(judged(1, "HTTP 500: boom"), { state: "unavailable", cause: "github", detail: "HTTP 500: boom" });
  });

  test("the sign-in is `gh auth login` in the browser, over HTTPS", () => {
    assert.deepEqual(signInToGitHub("gh"), ["gh", "auth", "login", "--hostname", "github.com", "--web", "--git-protocol", "https"]);
  });

  test("the account is read with the app's own judgment when the main process passes none", { skip: WITHOUT_POSIX }, async (t) => {
    const signedOut = program(t, "echo 'To get started with GitHub CLI, please run:  gh auth login' >&2\nexit 4");
    assert.deepEqual(await readTheAccountGitHub({ gh: signedOut, env: process.env }), { nonConnecte: true });
    const offline = program(t, "echo 'error connecting to api.github.com' >&2\nexit 1");
    const readOne = await readTheAccountGitHub({ gh: offline, env: process.env });
    assert.ok("refus" in readOne && /cannot be reached/.test(readOne.refus));
  });
});

describe("#4511 — the first ticket, written by the second and created on GitHub by the app", () => {
  const DRAFT = { title: "Show the rail first", body: "## Context\nThe chef wants the rail.\n\n## Acceptance criteria\n- when I open the app, I see the rail" };

  test("the second gets the chef's answer, and its JSON is the draft; nothing it cannot read is a draft", async () => {
    const given: string[] = [];
    const launch = async (command: string, args: readonly string[], entry: string) => (given.push(`${command} ${args.join(" ")}`, entry), { code: 0, sortie: `Here it is: ${JSON.stringify(DRAFT)}`, erreur: "" });
    assert.deepEqual(await draft({ depot: "acme/parade", dossier: "/tmp", demande: { answer: "the rail" }, claude: "claude", lancer: launch }), { draft: DRAFT });
    assert.equal(given[0], "claude -p");
    assert.match(given[1] ?? "", /You are the second of the project acme\/parade[\s\S]*The chef's answer:\nthe rail$/);
    const badly = async () => ({ code: 0, sortie: '{"title": "no sections", "body": "text"}', erreur: "" });
    const refused = await draft({ depot: "acme/parade", dossier: "/tmp", demande: { answer: "x" }, claude: "claude", lancer: badly });
    assert.ok("refus" in refused && /cannot read as a ticket/.test(refused.refus) && /## Context/.test(refused.detail));
    const empty = await draft({ depot: "acme/parade", dossier: "/tmp", demande: { answer: " " }, claude: "claude", lancer: badly });
    assert.ok("refus" in empty && /nothing was sent/.test(empty.refus));
  });

  test("on the chef's yes, the issue is created with `product`, `prio:1` and `fire`; a refusal of GitHub is said", async () => {
    const posted: unknown[] = [];
    const client = { ecrire: async (method: string, path: string, body?: unknown) => (posted.push({ method, path, body }), { status: 201, data: { number: 12, html_url: "https://github.com/acme/parade/issues/12" } }) };
    assert.deepEqual(await create(client, "acme/parade", DRAFT), { ticket: 12, url: "https://github.com/acme/parade/issues/12" });
    assert.deepEqual(posted, [{ method: "POST", path: "/repos/acme/parade/issues", body: { ...DRAFT, labels: ["product", "prio:1", "fire"] } }]);
    const refusing = { ecrire: async () => ({ status: 403, data: { message: "Resource not accessible" } }) };
    assert.deepEqual(await create(refusing, "acme/parade", DRAFT), { refus: "nothing was created: GitHub refused the issue on acme/parade", detail: "HTTP 403 — Resource not accessible" });
  });
});

describe("#4511 — a project's local copy, and Claude Code's session, read by the app", { skip: WITHOUT_POSIX }, () => {
  const git = process.env.BRIGADE_GIT_BIN || "git";
  // A fake `gh` whose `repo clone <url> <dir>` makes a git clone of `acme/parade` in `<dir>`.
  const fakeGh = (t: TestContext) => program(t, `mkdir -p "$4" && cd "$4" && ${git} init -q && ${git} remote add origin "$3"`);

  test("a repository is cloned beside its place in the managed folder, then reopened without a second clone", async (t) => {
    const root = folder(t);
    const steps: string[] = [];
    const env = { ...process.env, BRIGADE_PROJECTS_DIR: root };
    const opened = await openTheLocalCopy({ repository: "acme/parade", gh: fakeGh(t), git, env, progres: ({ stage }) => void steps.push(stage) });
    assert.deepEqual(opened, { state: "open", project: "parade", repository: "acme/parade", folder: join(root, "parade"), cloned: true });
    assert.deepEqual(steps, ["looking", "cloning"]);
    assert.equal(existsSync(join(root, "parade.clonage")), false);
    const again = await openTheLocalCopy({ repository: "acme/parade", gh: "/nowhere/gh", git, env });
    assert.deepEqual(again, { state: "open", project: "parade", repository: "acme/parade", folder: join(root, "parade"), cloned: false });
  });

  test("a folder that holds something else is not cloned over; a missing `gh` and a refused clone are said", async (t) => {
    const root = folder(t);
    const env = { ...process.env, BRIGADE_PROJECTS_DIR: root };
    mkdirSync(join(root, "parade"));
    writeFileSync(join(root, "parade", "notes.txt"), "mine");
    const taken = await openTheLocalCopy({ repository: "acme/parade", gh: fakeGh(t), git, env });
    assert.ok(taken.state === "failed" && taken.cause === "folder-taken");
    const missing = await openTheLocalCopy({ repository: "acme/other", gh: join(root, "no-gh"), git, env });
    assert.ok(missing.state === "failed" && missing.cause === "gh-missing" && missing.link === "https://cli.github.com");
    const signedOut = program(t, "echo 'To get started with GitHub CLI, please run:  gh auth login' >&2\nexit 4");
    const refused = await openTheLocalCopy({ repository: "acme/third", gh: signedOut, git, env });
    assert.ok(refused.state === "failed" && refused.cause === "sign-in-required" && refused.action?.command.join(" ") === `${signedOut} auth login --hostname github.com --web --git-protocol https`);
    assert.deepEqual((await openTheLocalCopy({ repository: "not a repository", gh: signedOut, git, env })).state, "failed");
  });

  test("Claude Code's session is its `loggedIn`, missing without `claude`, unknown when it says nothing clear", async (t) => {
    assert.equal(await sessionOfClaude(program(t, `echo '{"loggedIn": true}'`), process.env), "connectee");
    assert.equal(await sessionOfClaude(program(t, `echo '{"loggedIn": false}'\nexit 1`), process.env), "absente");
    assert.equal(await sessionOfClaude(program(t, "echo nonsense"), process.env), "inconnue");
    assert.equal(await sessionOfClaude(join(folder(t), "no-claude"), process.env), "introuvable");
  });
});
