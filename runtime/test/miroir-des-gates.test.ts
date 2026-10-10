// La fraîcheur du miroir Codex, jugée par le vrai `.claude/brigade/gates.sh` de
// ce dépôt sur un projet d'essai. La liste des fichiers changés y est longue :
// plus longue qu'un tube n'en retient. Tant que les gates la passaient à un
// `grep -q` par un tube, le lecteur sortait à la première ligne trouvée,
// l'écrivain mourait d'un SIGPIPE, et sous `pipefail` le tube rendait faux —
// « rien sous le miroir », ou un rôle sauté sans rien dire. Une liste courte
// fait la même chose sous forte charge, une fois de loin en loin (#278) : la
// longueur n'est là que pour le provoquer à coup sûr.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ENV_ENFANT, git, repertoireTemporaire } from "./outils.ts";

const GATES = join(import.meta.dirname, "../../.claude/brigade/gates.sh");
const ROLES = ["po", "manager", "dev", "designer"];

// Un projet aux gates vertes, commité, sans runtime : les manifests, les quatre
// rôles et leur miroir.
function projet(t: TestContext): string {
  const racine = join(repertoireTemporaire(t), "projet");
  const poser = (fichier: string, contenu: string) => {
    mkdirSync(join(racine, fichier, ".."), { recursive: true });
    writeFileSync(join(racine, fichier), contenu);
  };
  poser("CLAUDE.md", "## Équipe multi-agents (plugin brigade)\n\n- **Branche d'intégration** : `main`\n");
  poser(".gitignore", ".brigade-state/\n");
  poser(".claude-plugin/plugin.json", JSON.stringify({ commands: ROLES.map((role) => `./commands/${role}.md`) }));
  poser(".claude-plugin/marketplace.json", "{}");
  poser(".claude/settings.json", "{}");
  for (const role of ROLES) {
    poser(`commands/${role}.md`, "");
    poser(`codex/skills/${role}/SKILL.md`, "");
    poser(`codex/skills/${role}/agents/openai.yaml`, "");
  }
  git(racine, "init", "-q", "-b", "main");
  git(racine, "add", "-A");
  git(racine, "commit", "-q", "-m", "projet d'essai");
  return racine;
}

// Huit cents fichiers non suivis, sous un répertoire dont le nom commence par
// `debut` : plus de 300 Ko de chemins dans la liste triée des changements, là où
// un tube en retient 64. `codexz` les range entre les miroirs et les rôles, `z`
// après les uns et les autres.
function encombrer(racine: string, debut: string): void {
  const tas = join(racine, `${debut}${"x".repeat(200)}`);
  mkdirSync(tas);
  for (let i = 0; i < 800; i++) writeFileSync(join(tas, `${"y".repeat(200)}${i}`), "");
}

function jouer(racine: string): { code: number | null; sortie: string } {
  const passage = spawnSync("bash", [GATES, racine], { env: { ...ENV_ENFANT, HOME: join(racine, "..") }, encoding: "utf8" });
  return { code: passage.status, sortie: passage.stdout + passage.stderr };
}

// Chaque test a son projet : ils se jouent de front.
describe("la fraîcheur du miroir Codex, sur une longue liste de changements", { concurrency: 8 }, () => {
  test("un rôle et son miroir modifiés ensemble ne sont pas jugés périmés", (t) => {
    const racine = projet(t);
    writeFileSync(join(racine, "commands/manager.md"), "une règle de plus\n");
    writeFileSync(join(racine, "codex/skills/manager/SKILL.md"), "une règle de plus\n");
    encombrer(racine, "codexz");

    const { code, sortie } = jouer(racine);

    assert.doesNotMatch(sortie, /^FAIL/m);
    assert.match(sortie, /^ok {4}miroir Codex à jour pour les rôles modifiés depuis main$/m);
    assert.equal(code, 0, sortie);
  });

  test("un rôle modifié sans son miroir n'est pas sauté : il rougit, et lui seul", (t) => {
    const racine = projet(t);
    writeFileSync(join(racine, "commands/po.md"), "une règle de plus\n");
    encombrer(racine, "z");

    const { code, sortie } = jouer(racine);

    assert.deepEqual(sortie.match(/^FAIL.*$/gm), ["FAIL  miroir Codex périmé : commands/po.md modifié depuis main, rien sous codex/skills/po/"]);
    assert.equal(code, 1, sortie);
  });

  test("un fichier dont le chemin ne fait que contenir celui d'un rôle ou d'un miroir ne compte pas pour lui", (t) => {
    const racine = projet(t);
    writeFileSync(join(racine, "commands/dev.md"), "une règle de plus\n");
    mkdirSync(join(racine, "docs/codex/skills/dev"), { recursive: true });
    writeFileSync(join(racine, "docs/codex/skills/dev/notes.md"), "");
    mkdirSync(join(racine, "docs/commands"), { recursive: true });
    writeFileSync(join(racine, "docs/commands/po.md"), "");

    const { code, sortie } = jouer(racine);

    assert.deepEqual(sortie.match(/^FAIL.*$/gm), ["FAIL  miroir Codex périmé : commands/dev.md modifié depuis main, rien sous codex/skills/dev/"]);
    assert.equal(code, 1, sortie);
  });
});
