// Le rôle du second redit après l'init (#2689) : une session de l'onglet Second née sans la section des bindings la
// voit apparaître sur la branche d'intégration — la PR de `/brigade:init` mergée — et son prompt suivant porte le texte
// du rôle, la section et la file lue à neuf. Une seule fois ; une session née avec la section ne lit rien à ses prompts.
// Et ni le rôle ni la fin de l'init ne renvoient vers `brigade:po` ou un rôle V1, ni n'offrent un modèle ou un effort.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { hooksOfRole } from "../../src/second/hook-of-role.ts";
import { ROLE_OF_SECOND } from "../../src/second/launch.ts";
import { start, prompt, sectionOfBindings } from "../../src/second/role-after-init.ts";
import type { CallGitHub } from "../../src/board/client.ts";
import { openTerminals, type Launch } from "../../src/terminals.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const SCRIPT = join(ROOT, "app", "src", "second", "role-after-init.ts");
const WITHOUT_SH = process.platform === "win32" ? "le faux gh est un script sh, que Windows ne lance pas" : false;

function folder(t: TestContext): string {
  const d = mkdtempSync(join(tmpdir(), "brigade-role-"));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
}

const REPOSITORY = "benomite/baloo";
const WITHOUT = "# baloo\n\nA small app.\n";
const WITH = `${WITHOUT}\n## Équipe multi-agents\n\n- **Branche d'intégration** : \`main\`\n- **Gates** : \`.claude/brigade/gates.sh <WT>\`\n\n## Other\n\nnot the bindings\n`;
const CHEF = [{ number: 20, title: "Ticket 20", html_url: `https://github.com/${REPOSITORY}/issues/20`, created_at: "2026-11-01T00:00:00Z", labels: [{ name: "chef-todo" }] }];
const TODO = [{ body: "<!-- brigade:todo kind=blocked -->\nWhich token does the box use for the registry?", author_association: "OWNER", created_at: "2026-11-05T10:00:00Z" }];

// GitHub tel que le projet le tient : le `CLAUDE.md` de la branche d'intégration (`base.claudeMd`, absent : 404), une carte
// `chef-todo` qui attend le chef. Chaque chemin demandé est noté.
function github(base: { claudeMd?: string }, requests: string[]): CallGitHub {
  return async (path) => {
    requests.push(path);
    if (path.includes("/contents/CLAUDE.md")) return base.claudeMd === undefined ? { status: 404, data: { message: "Not Found" } } : { status: 200, data: { content: Buffer.from(base.claudeMd).toString("base64"), encoding: "base64" } };
    if (path.includes("labels=chef-todo")) return { status: 200, data: CHEF };
    if (path.includes("/issues/20/comments")) return { status: 200, data: TODO };
    return { status: 200, data: [] };
  };
}

describe("le rôle du second, redit après l'init", () => {
  test("la section des bindings, de son titre au titre suivant ; rien sans elle", () => {
    assert.equal(sectionOfBindings(WITH), "## Équipe multi-agents\n\n- **Branche d'intégration** : `main`\n- **Gates** : `.claude/brigade/gates.sh <WT>`");
    assert.equal(sectionOfBindings(WITHOUT), undefined);
  });

  test("dès que CLAUDE.md porte la section sur la branche d'intégration, le prompt suivant de la session Second porte le rôle et la file — une fois", async (t) => {
    const project = folder(t);
    const notes = folder(t);
    writeFileSync(join(project, "CLAUDE.md"), WITHOUT);
    const entry = { session_id: "second-1", cwd: project };
    const target = { nom: "baloo", depot: REPOSITORY, base: "main" };
    const base: { claudeMd?: string } = {};
    const requests: string[] = [];
    start(entry, notes);

    // `/brigade:init` tourne, sa PR n'est pas mergée : rien n'est ajouté au prompt.
    assert.equal(await prompt(entry, target, github(base, requests), notes), "");
    assert.deepEqual(requests, [`/repos/${REPOSITORY}/contents/CLAUDE.md?ref=main`]);
    base.claudeMd = WITHOUT;
    assert.equal(await prompt(entry, target, github(base, requests), notes), "");

    // La PR mergée : le prompt suivant porte le rôle, les bindings lus sur GitHub, et la file lue à neuf.
    base.claudeMd = WITH;
    const output = JSON.parse(await prompt(entry, target, github(base, requests), notes)) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } };
    assert.equal(output.hookSpecificOutput.hookEventName, "UserPromptSubmit");
    const context = output.hookSpecificOutput.additionalContext;
    assert.ok(context.includes(readFileSync(ROLE_OF_SECOND, "utf8").trim()), "le texte du rôle, entier");
    assert.ok(context.includes("- **Branche d'intégration** : `main`"), "les bindings");
    assert.doesNotMatch(context, /not the bindings/);
    assert.match(context, /^awaiting/m);
    assert.match(context, /#20/);
    assert.match(context, /^end awaiting/m);
    assert.ok(requests.some((path) => path.includes("labels=chef-todo")), "la file est lue à ce prompt");

    // Redit une fois : les prompts suivants ne lisent plus rien.
    const before = requests.length;
    assert.equal(await prompt(entry, target, github(base, requests), notes), "");
    assert.equal(requests.length, before);
  });

  test("une session née avec la section : ses prompts ne lisent rien et n'ajoutent rien", async (t) => {
    const project = folder(t);
    const notes = folder(t);
    writeFileSync(join(project, "CLAUDE.md"), WITH);
    const requests: string[] = [];
    start({ session_id: "second-2", cwd: project }, notes);
    assert.equal(await prompt({ session_id: "second-2", cwd: project }, { nom: "baloo", depot: REPOSITORY }, github({ claudeMd: WITH }, requests), notes), "");
    assert.deepEqual(requests, []);
  });

  test("le lancement de l'onglet Second déclare les deux crochets, avec la branche d'intégration du projet", () => {
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
    terminals.espace({ nom: "baloo", dossier: "/projets/baloo", depot: REPOSITORY, base: "main" });
    const args = launched.at(0)?.args ?? assert.fail("aucun lancement");
    const { hooks } = JSON.parse(args[args.indexOf("--settings") + 1] ?? "") as { hooks: Record<string, { matcher?: string; hooks: { command: string }[] }[]> };
    const commands = (event: string) => (hooks[event] ?? []).flatMap((c) => c.hooks.map((h) => h.command));
    assert.ok(commands("UserPromptSubmit").some((c) => /role-after-init\.ts' 'prompt' 'baloo' 'benomite\/baloo' 'main' 'gh'$/.test(c)));
    assert.ok(commands("SessionStart").some((c) => /role-after-init\.ts' 'debut' 'baloo' 'benomite\/baloo' 'main' 'gh'$/.test(c)));
    assert.deepEqual(hooksOfRole({ node: "node", gh: "gh", cible: { nom: "baloo" } }).SessionStart?.[0]?.matcher, "startup|resume|compact");
  });

  test("joué par `claude` : l'entrée du crochet sur stdin, le gh du poste, la sortie au format du contexte additionnel", { skip: WITHOUT_SH }, (t) => {
    const project = folder(t);
    const d = folder(t);
    writeFileSync(join(d, "claude.json"), JSON.stringify({ content: Buffer.from(WITH).toString("base64"), encoding: "base64" }));
    const gh = join(d, "gh");
    writeFileSync(gh, `#!/bin/sh\necho "$@" >> '${join(d, "recu")}'\ncase "$2" in\n  *contents/CLAUDE.md*) /bin/cat '${join(d, "claude.json")}' ;;\n  *) echo '[]' ;;\nesac\n`);
    chmodSync(gh, 0o755);
    const play = (moment: string) =>
      spawnSync(process.execPath, [SCRIPT, moment, "baloo", REPOSITORY, "main", gh], { encoding: "utf8", cwd: project, input: JSON.stringify({ session_id: "second-3", cwd: project }), env: { PATH: d, HOME: d, TMPDIR: d } });
    const opening = play("debut");
    assert.equal(opening.status, 0);
    assert.equal(opening.stdout, "");
    const r = play("prompt");
    assert.equal(r.status, 0);
    const output = JSON.parse(r.stdout) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } };
    assert.equal(output.hookSpecificOutput.hookEventName, "UserPromptSubmit");
    assert.match(output.hookSpecificOutput.additionalContext, /You are \*\*the second\*\* of this project/);
    assert.match(readFileSync(join(d, "recu"), "utf8"), /^api repos\/benomite\/baloo\/contents\/CLAUDE\.md\?ref=main$/m);
  });
});

// Les deux textes qui parlent au chef autour de l'init : le rôle du second, et la fin de `/brigade:init` — celle du
// plugin de l'app comme celle du plugin V1.
const END_OF_THE_INIT = [
  ["app/src/plugin/init.md", "## 4. Résume"],
  ["commands/init.md", "## 8. Résume"],
] as const;
const TEXTS: [string, string][] = [
  ["app/src/second/role.md", readFileSync(join(ROOT, "app", "src", "second", "role.md"), "utf8")],
  ...END_OF_THE_INIT.map(([path, title]): [string, string] => {
    const text = readFileSync(join(ROOT, path), "utf8");
    const startOfTheEnd = text.indexOf(title);
    assert.ok(startOfTheEnd >= 0, `${path} : « ${title} » introuvable`);
    return [`${path} (${title})`, text.slice(startOfTheEnd)];
  }),
];

describe("ni brigade:po, ni rôle V1, ni offre de modèle ou d'effort", () => {
  for (const [name, text] of TEXTS) {
    test(name, () => {
      assert.doesNotMatch(text, /brigade:po\b/);
      assert.doesNotMatch(text, /\/brigade:(?:manager|dev|designer|sync|ask)\b/);
      assert.doesNotMatch(text, /\b(?:model|effort):(?:opus|sonnet|haiku|fable|low|medium|high|xhigh|max)\b/);
      // Une phrase qui parle de modèle ou d'effort dit qu'ils sont au manager, et rien d'autre.
      for (const sentence of text.split(/(?<=[.;!?])\s+|\n/)) if (/\b(?:model|modèle|effort)s?\b/i.test(sentence)) assert.match(sentence, /manager/, `${name} : « ${sentence.trim()} »`);
    });
  }
  test("le rôle dit que modèle et effort sont au manager", () => {
    assert.match(TEXTS[0]?.[1] ?? "", /\*\*Model and effort are the manager's\*\*/);
  });
});
