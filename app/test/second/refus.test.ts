// Les gestes que le second ne fait jamais — merger une PR, lire les secrets du chef — refusés par un crochet
// PreToolUse : déclaré dans les seuls réglages de l'onglet Second, joué à la main il refuse en nommant le geste
// que le chef tape à la place, et laisse passer le reste.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { spawnSync } from "node:child_process";
import { crochetsDuRefus, decider, MATCHER, SECRETS, sortieDuCrochet } from "../../src/second/refus.ts";
import { reglagesDuSecond } from "../../src/second/lancement.ts";
import { ouvrirTerminaux, type Lancement } from "../../src/terminaux.ts";

const SCRIPT = join(import.meta.dirname, "..", "..", "src", "second", "refus.ts");
const bash = (command: string) => ({ tool_name: "Bash", tool_input: { command } });
const lit = (file_path: string) => ({ tool_name: "Read", tool_input: { file_path } });
const JETON = "/home/chef/.config/brigade/max-token";

describe("merger une PR", () => {
  for (const commande of ["gh pr merge 12", "gh pr merge --squash 12", "cd x && gh pr merge 12", "cd x; gh pr merge 12 --merge", "(gh pr merge 12)", "echo ok | gh pr merge 12", "gh -R a/b pr merge 12", "bash -c \"gh pr merge 12\"", "true\ngh pr merge 12"]) {
    test(`refusé : ${commande.replace("\n", "\\n")}`, () => {
      const refus = decider(bash(commande));
      assert.ok(refus, commande);
      assert.match(refus.raison, /`!gh pr merge \S+ --squash`/);
    });
  }

  test("le refus nomme le geste du chef, avec le numéro de la PR", () => {
    assert.match(decider(bash("gh pr merge --squash 12"))?.raison ?? "", /`!gh pr merge 12 --squash`/);
  });

  test("gh pr view, gh pr list et des mots voisins passent", () => {
    for (const commande of ["gh pr view 12", "gh pr list --state merged", "echo ghost pr merge", "git merge main"]) {
      assert.equal(decider(bash(commande)), undefined, commande);
    }
  });
});

describe("les secrets du chef", () => {
  test("Read de .env.local, où qu'il soit : refusé, le geste du chef nommé", () => {
    for (const chemin of [".env.local", "/projets/brigade/.env.local", "C:\\projets\\.env.local", "/p/.env.local.bak"]) {
      const refus = decider(lit(chemin));
      assert.ok(refus, chemin);
      assert.match(refus.raison, /with `!` in front/);
    }
  });

  test("Bash qui lit .env.local : cat, grep, source, head", () => {
    for (const commande of ["cat .env.local", "grep TOKEN .env.local", "source .env.local", "set -a; . ./.env.local", "head -1 /p/.env.local"]) {
      const refus = decider(bash(commande));
      assert.ok(refus, commande);
      assert.match(refus.raison, /`!cat \.env\.local`/);
    }
  });

  test("le jeton Max : son fichier (Read, Bash) et sa variable", () => {
    const env = { BRIGADE_CLAUDE_TOKEN_FILE: JETON };
    assert.ok(decider(lit(JETON), env));
    assert.ok(decider({ tool_name: "Grep", tool_input: { path: JETON, pattern: "." } }, env));
    assert.ok(decider(bash(`cat ${JETON}`), env));
    assert.ok(decider(bash("cat $BRIGADE_CLAUDE_TOKEN_FILE")));
    assert.ok(decider(bash('echo "$CLAUDE_CODE_OAUTH_TOKEN"')));
    assert.ok(decider(bash("printenv")));
  });

  test("README.md, des fichiers voisins et une commande sans secret passent", () => {
    assert.equal(decider(lit("README.md")), undefined);
    assert.equal(decider(lit("/projets/brigade/.env.example")), undefined);
    assert.equal(decider(lit(JETON.replace("max-token", "autre")), { BRIGADE_CLAUDE_TOKEN_FILE: JETON }), undefined);
    assert.equal(decider(bash("cat README.md")), undefined);
    assert.equal(decider({ tool_name: "Edit", tool_input: { file_path: "a.ts" } }), undefined);
  });

  test("la liste des protégés est en un seul endroit", () => {
    assert.deepEqual(SECRETS.noms, [".env.local"]);
    assert.deepEqual(SECRETS.variablesDeFichier, ["BRIGADE_CLAUDE_TOKEN_FILE"]);
  });
});

describe("le crochet, dans les réglages du second", () => {
  test("PreToolUse sur Bash, Read et Grep ; le lancement du second le porte", () => {
    const crochets = reglagesDuSecond(crochetsDuRefus({ node: "/usr/bin/node" })).hooks?.PreToolUse ?? assert.fail("pas de PreToolUse");
    assert.equal(crochets[0]?.matcher, MATCHER);
    assert.deepEqual(MATCHER.split("|"), ["Bash", "Read", "Grep"]);
    assert.match(crochets[0]?.hooks[0]?.command ?? "", /^'\/usr\/bin\/node' '.*second\/refus\.ts'$/);

    const lances: Lancement[] = [];
    const terminaux = ouvrirTerminaux({
      claude: "claude",
      shell: "/bin/zsh",
      node: "/usr/bin/node",
      ouvrirPty(l) {
        lances.push(l);
        return { ecrire: () => {}, redimensionner: () => {}, tuer: () => {} };
      },
      surSortie: () => {},
      surEtat: () => {},
    });
    terminaux.espace({ nom: "brigade", dossier: "/projets/brigade" });
    const args = lances.at(0)?.args ?? assert.fail("aucun lancement");
    const reglages = JSON.parse(args[args.indexOf("--settings") + 1] ?? "") as { hooks: { PreToolUse: { matcher?: string }[] } };
    assert.ok(reglages.hooks.PreToolUse.some((c) => c.matcher === MATCHER));
  });

  test("le module n'écrit rien : aucun fichier du projet ne porte le crochet", () => {
    assert.doesNotMatch(readFileSync(SCRIPT, "utf8"), /writeFile|appendFile|\.claude\//);
  });
});

describe("le crochet joué à la main", () => {
  const jouer = (appel: unknown, env: Record<string, string> = {}) =>
    spawnSync(process.execPath, [SCRIPT], { input: JSON.stringify(appel), encoding: "utf8", env: { ...process.env, ...env } });

  test("un refus : JSON permissionDecision deny, la raison nomme le geste du chef", () => {
    const r = jouer(bash("gh pr merge 12"));
    assert.equal(r.status, 0);
    const sortie = JSON.parse(r.stdout) as { hookSpecificOutput: { hookEventName: string; permissionDecision: string; permissionDecisionReason: string } };
    assert.equal(sortie.hookSpecificOutput.hookEventName, "PreToolUse");
    assert.equal(sortie.hookSpecificOutput.permissionDecision, "deny");
    assert.match(sortie.hookSpecificOutput.permissionDecisionReason, /!gh pr merge 12 --squash/);
    assert.equal(r.stdout.trim(), sortieDuCrochet(decider(bash("gh pr merge 12")) ?? assert.fail("pas de refus")));
  });

  test("le fichier du jeton, désigné par l'environnement de `claude`, est refusé", () => {
    assert.match(jouer(lit(JETON), { BRIGADE_CLAUDE_TOKEN_FILE: JETON }).stdout, /"deny"/);
  });

  test("un appel permis ne rend rien ; une entrée illisible non plus — sans bloquer", () => {
    for (const appel of [bash("gh pr view 12"), lit("README.md")]) {
      const r = jouer(appel);
      assert.deepEqual([r.status, r.stdout], [0, ""]);
    }
    const r = spawnSync(process.execPath, [SCRIPT], { input: "pas du json", encoding: "utf8" });
    assert.deepEqual([r.status, r.stdout], [0, ""]);
  });
});
