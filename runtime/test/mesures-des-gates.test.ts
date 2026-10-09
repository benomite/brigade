// Les mesures que déclare le vrai `.claude/brigade/gates.sh` de ce dépôt, joué
// sur un projet d'essai, et ce que le runtime en relève. Le projet n'a pas de
// manifest : les gates y sont rouges — seules leurs mesures sont regardées ici.
import assert from "node:assert/strict";
import { chmodSync, cpSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { jouerGates } from "../src/gates.ts";
import { commiter, ENV_ENFANT, git, repertoireTemporaire } from "./outils.ts";

const GATES = join(import.meta.dirname, "../../.claude/brigade/gates.sh");

test("les gates du dépôt déclarent les tests, leur durée, le poids du dépôt, de la doc et du contexte, et leur propre durée", async (t) => {
  const racine = repertoireTemporaire(t);
  for (const dossier of ["runtime", "docs", ".claude/brigade"]) mkdirSync(join(racine, dossier), { recursive: true });
  cpSync(GATES, join(racine, ".claude/brigade/gates.sh"));
  chmodSync(join(racine, ".claude/brigade/gates.sh"), 0o755);
  // La suite d'essai rend le résumé du lanceur de Node, sans rien jouer.
  writeFileSync(join(racine, "runtime/package.json"), JSON.stringify({ scripts: { test: "printf 'ℹ tests 12\\nℹ pass 12\\nℹ duration_ms 3449.5\\n'" } }));
  writeFileSync(join(racine, "CLAUDE.md"), "Les règles : @docs/regles.md, et un fichier absent : @docs/absent.md\n");
  writeFileSync(join(racine, "docs/regles.md"), `${"r".repeat(40)} @annexe.md`);
  writeFileSync(join(racine, "docs/annexe.md"), "a".repeat(30));
  writeFileSync(join(racine, "docs/lue-par-personne.md"), "d".repeat(500));
  git(racine, "init", "-q");
  commiter(racine, "code.txt");
  // Le CLAUDE.md et ce qu'il importe, de proche en proche.
  const contexte = statSync(join(racine, "CLAUDE.md")).size + 51 + 30;

  const gates = await jouerGates({ worktree: racine, ticket: 17, env: ENV_ENFANT, delaiMs: 60_000 });

  const { gates_s: duree, depot_octets: depot, ...mesures } = gates.measures ?? {};
  assert.deepEqual(mesures, { tests: 12, tests_s: 3.4, doc_octets: contexte + 500, contexte_octets: contexte }, gates.tail);
  assert.ok(depot !== undefined && depot > contexte + 500, `dépôt : ${depot}`);
  assert.ok(duree !== undefined && duree >= 0, `durée : ${duree}`);
});
