// La file du projet lue pour le second par un crochet SessionStart : déclaré dans les seuls réglages de l'onglet
// Second, joué à la main il rend le contexte que `claude` attend, et une file illisible est dite sans bloquer.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, test, type TestContext } from "node:test";
import { crochetsDeLaFile, contexteDeLaFile, MATCHER } from "../../src/second/file.ts";
import { argumentsDuSecond, reglagesDuSecond, type ReglagesDuSecond } from "../../src/second/lancement.ts";
import { ouvrirTerminaux, type Lancement } from "../../src/terminaux.ts";

const SCRIPT = join(import.meta.dirname, "..", "..", "src", "second", "file.ts");
// Le faux `ssh` est un script `sh` : un Windows ne le lance pas.
const SANS_SH = process.platform === "win32" ? "le faux ssh est un script sh, que Windows ne lance pas" : false;
const FILE = "attend\n#12 waits for the chef: merge it\nfin attend\n";

function dossier(t: TestContext): string {
  const d = mkdtempSync(join(tmpdir(), "brigade-file-"));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
}

// Un faux `ssh` : il écrit ce qu'il a reçu, rend `sortie` et sort avec `code`.
function fauxSsh(t: TestContext, code: number, sortie: string, erreur = ""): string {
  const d = dossier(t);
  writeFileSync(join(d, "sortie"), sortie);
  writeFileSync(join(d, "erreur"), erreur);
  const ssh = join(d, "ssh");
  writeFileSync(ssh, `#!/bin/sh\necho "$@" > '${join(d, "recu")}'\ncat '${join(d, "sortie")}'\ncat '${join(d, "erreur")}' >&2\nexit ${code}\n`);
  chmodSync(ssh, 0o755);
  return ssh;
}

function jouer(ssh: string, ...args: string[]) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args, ...(args.length < 2 ? [""] : []), ssh], { encoding: "utf8" });
  return { ...r, json: r.stdout.trim() === "" ? undefined : (JSON.parse(r.stdout) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } }) };
}

describe("le crochet de la file, dans les réglages du second", () => {
  test("SessionStart pour startup, resume et compact", () => {
    const reglages = reglagesDuSecond(crochetsDeLaFile({ node: "/usr/bin/node", ssh: "ssh", cible: { nom: "brigade", hote: "box" } }));
    const crochets = reglages.hooks?.SessionStart ?? assert.fail("pas de SessionStart");
    assert.equal(crochets.length, 1);
    assert.deepEqual(MATCHER.split("|"), ["startup", "resume", "compact"]);
    assert.equal(crochets[0]?.matcher, MATCHER);
    assert.match(crochets[0]?.hooks[0]?.command ?? "", /^'\/usr\/bin\/node' '.*second\/file\.ts' 'brigade' 'box' 'ssh'$/);
  });

  test("le lancement du second le porte, à la reprise comme en session neuve ; rien n'est écrit ailleurs", () => {
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
    terminaux.espace({ nom: "brigade", dossier: "/projets/brigade", box: { hote: "parade-box" } });
    const args = lances.at(0)?.args ?? assert.fail("aucun lancement");
    const reglages = JSON.parse(args[args.indexOf("--settings") + 1] ?? "") as { hooks: { SessionStart: { matcher: string; hooks: { type: "command"; command: string }[] }[] } };
    assert.equal(reglages.hooks.SessionStart[0]?.matcher, "startup|resume|compact");
    assert.match(reglages.hooks.SessionStart[0]?.hooks[0]?.command ?? "", /'brigade' 'parade-box'/);
    assert.equal(argumentsDuSecond({ reprise: true, reglages: reglages as ReglagesDuSecond }).includes("--continue"), true);
  });

  test("sans le crochet dans aucun fichier du projet : le module n'écrit rien", () => {
    const source = readFileSync(SCRIPT, "utf8");
    assert.doesNotMatch(source, /writeFile|appendFile|\.claude/);
  });
});

describe("le crochet joué à la main", () => {
  test("il rend la file au format du contexte additionnel, mot pour mot", { skip: SANS_SH }, (t) => {
    const ssh = fauxSsh(t, 0, FILE);
    const r = jouer(ssh, "brigade", "parade-box");
    assert.equal(r.status, 0);
    assert.equal(r.json?.hookSpecificOutput.hookEventName, "SessionStart");
    assert.ok(r.json?.hookSpecificOutput.additionalContext.includes(FILE.trim()));
    assert.match(readFileSync(join(ssh, "..", "recu"), "utf8"), /parade-box brigade brigade status/);
  });

  for (const [code, attendu] of [
    [255, /file non lue : box pas jointe[\s\S]*Could not resolve/],
    [68, /file non lue : box jointe, mais son geste a refusé \(code 68\)/],
    [1, /file non lue : box jointe, mais la commande a échoué \(code 1\)/],
  ] as const) {
    test(`file illisible (code ${code}) : dite, et la session n'est pas bloquée`, { skip: SANS_SH }, (t) => {
      const r = jouer(fauxSsh(t, code, "", "Could not resolve hostname"), "brigade", "parade-box");
      assert.equal(r.status, 0);
      assert.match(r.json?.hookSpecificOutput.additionalContext ?? "", attendu);
    });
  }

  test("un projet sans box : dit qu'aucun runtime n'est déclaré, et sort en 0", { skip: SANS_SH }, (t) => {
    const r = jouer(fauxSsh(t, 0, FILE), "brigade");
    assert.equal(r.status, 0);
    assert.match(r.json?.hookSpecificOutput.additionalContext ?? "", /file non lue : aucun runtime déclaré/);
  });

  test("un ssh introuvable : dit, et sort en 0", () => {
    const r = jouer("/nonexistent/ssh", "brigade", "parade-box");
    assert.equal(r.status, 0);
    assert.match(r.json?.hookSpecificOutput.additionalContext ?? "", /file non lue/);
  });

  test("délai dépassé : dit aucune réponse", () => {
    assert.match(contexteDeLaFile({ nom: "b", hote: "h" }, { code: null, sortie: "", erreurs: "", delaiDepasse: true }), /aucune réponse en 30 s/);
  });
});
