// Le lancement de l'onglet Second : `claude` reçoit le rôle du second dans son prompt système, depuis le fichier
// que l'app livre, à la reprise comme dans une session neuve — et rien d'autre ne le reçoit. Contre de faux pty :
// le vrai `claude` n'est jamais lancé.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ligneDeCmd } from "../../../runtime/src/sans-invite.ts";
import { hooksOfTurns, openTurns, settingsFile } from "../../src/input.ts";
import { argumentsOfSecond, settingsOfSecond, ROLE_OF_SECOND } from "../../src/second/launch.ts";
import { openTerminals, type Launch } from "../../src/terminals.ts";

const SRC = join(import.meta.dirname, "..", "..", "src");
const OPTION_OF_ROLE = "--append-system-prompt-file";

function folder(t: TestContext, prefix = "brigade-second-"): string {
  const created = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  t.after(() => rmSync(created, { recursive: true, force: true }));
  return created;
}

// Un registre comme celui de l'app, contre de faux pty : chaque lancement est relevé. `tours` : les fichiers où
// les seconds disent leurs tours — sans eux, l'app ne les suit pas.
function registry(turns?: ReturnType<typeof openTurns>) {
  const launched: Launch[] = [];
  const terminals = openTerminals({
    claude: "claude",
    shell: "/bin/zsh",
    ouvrirPty(launch) {
      launched.push(launch);
      return { ecrire: () => {}, redimensionner: () => {}, tuer: () => {} };
    },
    surSortie: () => {},
    surEtat: () => {},
    ...(turns === undefined ? {} : { tours: (id: number) => turns.de(id) }),
  });
  const launches = (rank: number): Launch => launched.at(rank) ?? assert.fail(`aucun lancement au rang ${rank}`);
  return { terminaux: terminals, lances: launched, lance: launches };
}

// Ce qui suit l'option du rôle, et l'option elle-même : absent, `undefined`.
const roleOf = (args: readonly string[]) => {
  const rank = args.indexOf(OPTION_OF_ROLE);
  return rank === -1 ? undefined : args[rank + 1];
};
const settingsOf = (args: readonly string[]) => {
  const ranks = args.flatMap((arg, rank) => (arg === "--settings" ? [rank] : []));
  assert.equal(ranks.length, 1, `un seul --settings : ${args.join(" ")}`);
  return JSON.parse(args[(ranks[0] ?? 0) + 1] ?? "") as { hooks?: Record<string, unknown[]> };
};
// Une invocation de skill ou de commande de `claude` : un argument qui commence par `/`, ou le rôle de la V1.
const invokes = (args: readonly string[]) => args.filter((arg, rank) => args[rank - 1] !== OPTION_OF_ROLE && (arg.startsWith("/") || arg.includes("brigade:po")));

const BRIGADE = { nom: "brigade", dossier: "/projets/brigade" };

describe("le rôle du second, livré avec l'app", () => {
  test("il vit sous app/src/second/, et porte les règles du rôle — sans dépendre du plugin", () => {
    assert.equal(relative(SRC, ROLE_OF_SECOND), join("second", "role.md"));
    const text = readFileSync(ROLE_OF_SECOND, "utf8");
    // Les règles du rôle : la file lue à l'ouverture, pas de code, pas de merge, pas de secrets, et le relais d'un refus.
    for (const rule of ["brigade <name> status", "you write no application code", "You never merge a pull request", "`.env.local`", "BRIGADE_CLAUDE_TOKEN_FILE", "A refusal is said, in one sentence", "waiting for…", "An urgent blocker", "needs a human", "cannot unblock", "Closes #N"]) {
      assert.ok(text.includes(rule), rule);
    }
    // Rien qui renvoie au skill du plugin : ni `/brigade:po`, ni `$ARGUMENTS`, ni le workflow que le skill Codex relit.
    for (const plugin of ["/brigade:po", "$ARGUMENTS", "references/workflow.md", "/brigade:manager"]) assert.ok(!text.includes(plugin), plugin);
  });
});

describe("l'onglet Second lance `claude` avec le rôle dans son prompt système", () => {
  test("à l'ouverture : `claude --continue`, le rôle ajouté au prompt système depuis le fichier livré — et aucune invocation de skill", () => {
    const { terminaux: terminals, lance: launches } = registry();

    terminals.espace(BRIGADE);

    const { commande: command, args, dossier: or } = launches(0);
    assert.deepEqual([command, or], ["claude", "/projets/brigade"]);
    assert.deepEqual(args, ["--continue", OPTION_OF_ROLE, ROLE_OF_SECOND, "--settings", "{}"]);
    assert.deepEqual(invokes(args), []);
  });

  test("la reprise et la session neuve portent les mêmes drapeaux du rôle — et la relance par une touche aussi", () => {
    const { terminaux: terminals, lances: launched, lance: launches } = registry();
    const [second] = terminals.espace(BRIGADE);
    assert.ok(second);

    // `claude --continue` n'a rien repris : la session neuve part avec le rôle.
    launches(0).surFin(1);
    // Elle s'arrête : une touche relance la reprise, avec le rôle.
    launches(1).surFin(0);
    terminals.ecrire(second.id, "x");

    assert.deepEqual(
      launched.map(({ args }) => args),
      [
        ["--continue", OPTION_OF_ROLE, ROLE_OF_SECOND, "--settings", "{}"],
        [OPTION_OF_ROLE, ROLE_OF_SECOND, "--settings", "{}"],
        ["--continue", OPTION_OF_ROLE, ROLE_OF_SECOND, "--settings", "{}"],
      ],
    );
    for (const { args } of launched) assert.deepEqual(invokes(args), []);
  });

  test("un geste qui trouve le second arrêté le relance avec le rôle", async () => {
    const { terminaux: terminals, lances: launched, lance: launches } = registry();
    terminals.espace(BRIGADE);
    launches(0).surFin(0);

    terminals.inscrire(BRIGADE, "!git status");
    launches(1).surFin(0);
    await terminals.envoyer(BRIGADE, "!git status");

    assert.equal(launched.length, 3);
    for (const { args } of launched) assert.equal(roleOf(args), ROLE_OF_SECOND);
  });

  test("les réglages de ce lancement sont un seul `--settings`, donné sur la ligne de commande : les crochets des tours y sont, à la reprise comme dans la session neuve", (t) => {
    const turns = openTurns(folder(t));
    const { terminaux: terminals, lance: launches } = registry(turns);
    const [second] = terminals.espace(BRIGADE);
    assert.ok(second);
    launches(0).surFin(1);

    const expected = JSON.parse(settingsFile(turns.de(second.id).chemin));
    for (const rank of [0, 1]) {
      assert.equal(roleOf(launches(rank).args), ROLE_OF_SECOND);
      assert.deepEqual(settingsOf(launches(rank).args), expected);
    }
  });

  test("les réglages réunissent les crochets de chaque part, événement par événement, dans l'ordre donné", () => {
    const turns = hooksOfTurns("/tmp/essai/second-1.tours");
    const opening = { SessionStart: [{ matcher: "startup|resume|compact", hooks: [{ type: "command" as const, command: "lire la file" }] }] };
    const refusal = { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command" as const, command: "refuser" }] }] };

    const { hooks } = settingsOfSecond(turns, opening, refusal);

    assert.deepEqual(Object.keys(hooks ?? {}), ["UserPromptSubmit", "PreToolUse", "Stop", "SessionStart"]);
    assert.deepEqual(hooks?.PreToolUse, [...turns.PreToolUse, ...refusal.PreToolUse]);
    assert.deepEqual(hooks?.SessionStart, opening.SessionStart);
    assert.deepEqual(settingsOfSecond(), {});
  });

  test("sous Windows, un `claude.cmd` reçoit ces arguments : le texte du rôle ne passe pas par la ligne de commande, qui ne porte aucun saut de ligne", () => {
    const args = argumentsOfSecond({
      reprise: true,
      reglages: settingsOfSecond(hooksOfTurns("C:\\Users\\chef\\AppData\\Local\\Temp\\brigade-app-x\\second-1.tours", "\\")),
      role: "C:\\Users\\chef\\AppData\\Local\\Programs\\Brigade\\resources\\app\\src\\second\\role.md",
    });

    assert.ok(args.every((arg) => !/[\r\n]/.test(arg)));
    const line = ligneDeCmd("C:\\Users\\chef\\AppData\\Roaming\\npm\\claude.cmd", args);
    assert.ok(line.includes("role.md"));
    assert.ok(line.length < 8191, `la ligne de cmd.exe tient sous sa limite : ${line.length}`);
  });
});

describe("le rôle n'existe que dans l'onglet Second", () => {
  test("un shell ouvert à côté, et une session ouverte sur une commande de `claude` (`/brigade:init`), ne reçoivent pas le rôle", () => {
    const { terminaux: terminals, lance: launches } = registry();
    terminals.session(BRIGADE, "/brigade:init");
    terminals.shell(BRIGADE);

    assert.deepEqual(launches(0).args, ["/brigade:init"]);
    assert.equal(roleOf(launches(0).args), undefined);
    assert.equal(launches(1).commande, "/bin/zsh");
    assert.equal(roleOf(launches(1).args), undefined);
  });

  // La vérification que le ticket demande : rien n'est écrit dans le dossier du projet — ni `.claude/`, ni aucun
  // fichier qu'une session de `claude` y lirait —, le rôle et les réglages n'existant que dans les arguments du
  // lancement. Un `claude` lancé à la main dans ce dossier n'a donc rien d'où tenir le rôle.
  test("le dossier du projet reste tel quel : le rôle est un fichier de l'app, les réglages une valeur de la ligne de commande, les tours hors du projet", (t) => {
    const project = folder(t, "brigade-projet-");
    mkdirSync(join(project, ".claude"));
    writeFileSync(join(project, ".claude", "settings.json"), '{"permissions":{}}\n');
    writeFileSync(join(project, "CLAUDE.md"), "# Projet\n");
    const before = tree(project);
    const turns = openTurns(folder(t, "brigade-tours-"));
    const { terminaux: terminals, lances: launched, lance: launches } = registry(turns);

    const [second] = terminals.espace({ nom: "projet", dossier: project });
    assert.ok(second);
    launches(0).surFin(1);
    terminals.session({ nom: "projet", dossier: project }, "/brigade:init");

    assert.deepEqual(tree(project), before);
    for (const { args } of launched.slice(0, 2)) {
      const role = roleOf(args) ?? assert.fail("le second a son rôle");
      assert.ok(!role.startsWith(project + sep), role);
      assert.ok(existsSync(role));
      // `--settings` porte l'objet lui-même, pas un fichier à lire.
      assert.ok(settingsOf(args).hooks !== undefined);
      for (const arg of args) assert.ok(!arg.startsWith(project + sep), arg);
    }
  });
});

// Chaque fichier du dossier, avec son contenu.
function tree(root: string, under = ""): Record<string, string> {
  const seenOne: Record<string, string> = {};
  for (const entry of readdirSync(join(root, under), { withFileTypes: true })) {
    const path = join(under, entry.name);
    if (entry.isDirectory()) Object.assign(seenOne, tree(root, path));
    else seenOne[path] = readFileSync(join(root, path), "utf8");
  }
  return seenOne;
}

describe("le rôle du second, sur un projet qui vient d'être installé", () => {
  test("nomme le cas d'un rail vide avec des issues ouvertes, et ce qu'il fait", () => {
    const role = readFileSync(ROLE_OF_SECOND, "utf8");
    assert.match(role, /rail is empty/);
    assert.match(role, /open issues without `fire`/);
    assert.ok(role.includes("`backlog`"));
    assert.match(role, /proposed `prio:`/);
    assert.ok(role.includes("je mets ça sur le rail avec ces priorités ?"));
    assert.match(role, /`product` label, its `prio:` label and `fire`/);
    assert.match(role, /manager then qualifies the model and the effort/);
  });
});
