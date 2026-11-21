// #3921, critère 2 : la pass fusionne la livraison quand ses propres critères sont tenus, même si l'un de ses tests
// d'acceptation gelés est déjà vert sur `main`. Par la pass (`stationDuDepot`), sur un vrai dépôt git : GitHub et `claude` sont faux.
// Le test gelé est le premier commit de la branche (trailer `Acceptance-Tests: frozen`) ; `main` le passe déjà.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { FauxGitHub, STATION_DU_DEPOT, fauxClient } from "../faux-github.ts";
import { git } from "../outils.ts";

const TICKET = 11;
const CORPS = "## Context\n\nThe label.\n\n## Acceptance criteria\n\n- The export button is labelled";
const CALCUL = "export const somme = (a: number, b: number) => a + b;\n";
const GELE = "lib/calcul.test.ts";
const TESTS = 'import assert from "node:assert/strict";\nimport { test } from "node:test";\nimport { somme } from "./calcul.ts";\ntest("adds two numbers", () => assert.equal(somme(2, 3), 5));\n';
const RENDU = (message: string) => `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`;

const ecrire = (dossier: string, chemin: string, contenu: string) => {
  mkdirSync(dirname(join(dossier, chemin)), { recursive: true });
  writeFileSync(join(dossier, chemin), contenu);
};

test("a delivery whose own criteria are met is merged although its frozen acceptance test is already green on main", async (t) => {
  const repertoire = mkdtempSync(join(tmpdir(), "gele-vert-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const worktree = join(repertoire, `review-${TICKET}-github`);
  ecrire(worktree, "package.json", '{"type":"module"}\n');
  ecrire(worktree, "lib/calcul.ts", CALCUL);
  git(worktree, "init", "-q");
  git(worktree, "add", ".");
  git(worktree, "commit", "-q", "-m", "base");
  git(worktree, "update-ref", "refs/remotes/origin/main", "HEAD");
  ecrire(worktree, GELE, TESTS);
  git(worktree, "add", GELE);
  git(worktree, "commit", "-q", "-m", `test(#${TICKET}): frozen acceptance tests`, "-m", "Acceptance-Tests: frozen");
  ecrire(worktree, "docs/bouton.md", "The export button.\n");
  git(worktree, "add", ".");
  git(worktree, "commit", "-q", "-m", "docs: the button");
  const faux = new FauxGitHub();
  faux.feu(TICKET, ["fire", "model:opus", "effort:high"], CORPS);
  const lancer: Lancer = ({ args, flux }) => {
    const relecture = { verdict: "vert", resume: "Looks right.", constats: [], criteres: [{ critere: 1, tests: [], relecture: true }] };
    writeFileSync(flux, RENDU(args.includes("--tools") ? JSON.stringify(relecture) : "done"));
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 30, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({
    ...STATION_DU_DEPOT,
    github: fauxClient(faux),
    depot: {
      connait: () => false,
      preparer: async (run) => ({ worktree: join(repertoire, run), branche: `cook/${run}` }),
      reprendre: async (run) => join(repertoire, run),
      retirer: () => {},
      ranger: async () => null,
      pousser: () => {},
      commits: () => 1,
      changes: () => [GELE, "docs/bouton.md"],
      diff: () => "diff --git a/docs/bouton.md b/docs/bouton.md\n+The export button.\n",
      essayer: async (nom) => {
        ecrire(join(repertoire, nom), "package.json", '{"type":"module"}\n');
        ecrire(join(repertoire, nom), "lib/calcul.ts", CALCUL);
        return join(repertoire, nom);
      },
      jeter: (nom) => void (nom === undefined || rmSync(join(repertoire, nom), { recursive: true, force: true })),
    },
    env: { PATH: process.env.PATH },
    flux: repertoire,
    lancer,
    avertir: () => {},
  });
  if ("refus" in station) throw new Error(station.refus);
  for (let tour = 0; tour < 4 && faux.mergee(TICKET) === undefined && !(faux.commentaires.get(TICKET) ?? []).some((c) => c.body.startsWith("<!-- brigade:renvoi")); tour += 1) {
    await station.tour();
    await station.calme();
  }
  assert.equal(faux.mergee(TICKET)?.mergeePar, "box", "the pass merges the delivery");
});
