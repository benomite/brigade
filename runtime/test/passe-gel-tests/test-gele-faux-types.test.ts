// Un test d'acceptation gelé faux, par la station (#3799) : un cas que le
// contrôle de types du projet refuse est retiré comme celui qui passe déjà sur
// la base, et la livraison corrigée se juge en entier — sa preuve et ses
// mutants sont ceux de la branche corrigée.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { BON_CAS, ENTETE, livre, TICKET } from "./station-du-gel.ts";

// Le `tsc` du projet, en doublure : une erreur TS2554 sur chaque ligne du fichier gelé qui appelle `somme` avec trois nombres.
const TSC = `#!/bin/sh
cd "$(dirname "$0")/../.." || exit 1
lignes=$(grep -n 'somme(1, 2, 3)' lib/41.test.ts | cut -d: -f1)
[ -z "$lignes" ] && exit 0
for n in $lignes; do echo "lib/41.test.ts($n,48): error TS2554: Expected 2 arguments, but got 3."; done
exit 2
`;
const CAS_QUI_NE_TYPE_PAS = 'test("sums three numbers", () => assert.equal(somme(1, 2, 3), 6));\n';

// Le setup du projet, qui installe ce `tsc` : la relecture n'a pas les dépendances du projet avant lui.
const SETUP = `#!/bin/sh
mkdir -p "$2/node_modules/.bin" && cat > "$2/node_modules/.bin/tsc" <<'FIN' && chmod +x "$2/node_modules/.bin/tsc"
${TSC}FIN
`;

test("a frozen case that does not type-check does not loop the ticket: it is dropped, the issue says why, the right case is kept and the delivery is merged", async (t) => {
  const { faux, cooks, commentaires, testsGelesSurLaBranche } = await livre(t, ENTETE + BON_CAS + CAS_QUI_NE_TYPE_PAS, { base: { "tsconfig.json": "{}\n", ".claude/brigade/worktree-setup.sh": SETUP }, station: { setup: { delaiMs: 2_000 } } });
  assert.equal(faux.mergee(TICKET)?.mergeePar, "box", "the ticket goes on to its merge");
  assert.ok(cooks() <= 1, `the cook is not relaunched for it: ${cooks()} runs`);
  const gele = testsGelesSurLaBranche() ?? "";
  assert.equal(gele.includes(CAS_QUI_NE_TYPE_PAS.trim()), false, "the case that does not type-check is dropped");
  assert.ok(gele.includes(BON_CAS.trim()), "the case that proves the ticket is kept");
  const dite = commentaires.find((corps) => corps.includes("sums three numbers"));
  assert.match(dite ?? "", /does not type-check \(`TS2554: Expected 2 arguments, but got 3\.`\)/, "the issue says why it was wrong");
  assert.match(dite ?? "", /Dropped from the frozen test/, "and what was done");
});

test("once a frozen case that already passes on main is dropped, the verdict judges the corrected branch: its replay and its mutants", async (t) => {
  const { faux, surLaPR } = await livre(t, ENTETE + BON_CAS + 'test("somme is a function", () => assert.equal(typeof somme, "function"));\n');
  assert.equal(faux.mergee(TICKET)?.mergeePar, "box");
  const verdict = surLaPR.find((corps) => corps.startsWith("<!-- brigade:verdict")) ?? "";
  assert.match(verdict, /1 added test replayed alone on `main` — 1 red on `main` and green on the branch\./, "the replay is the corrected branch's");
  assert.match(verdict, /Mutation check: 1 of 1 mutations caught/, "the mutants ran against the corrected branch");
});

// Le contrôle n'a pas eu lieu : le journal le dit, rien n'est retiré, la livraison se juge comme avant.
async function controleInjouable(t: TestContext, base: Record<string, string>, dit: RegExp) {
  const { faux, avertis, testsGelesSurLaBranche } = await livre(t, ENTETE + BON_CAS + CAS_QUI_NE_TYPE_PAS, { base });
  assert.ok(avertis.some((ligne) => dit.test(ligne)), avertis.join("\n"));
  assert.equal(faux.mergee(TICKET)?.mergeePar, "box");
  assert.ok((testsGelesSurLaBranche() ?? "").includes(CAS_QUI_NE_TYPE_PAS.trim()), "nothing is dropped on a check that did not run");
}

test("a type check with no compiler installed is said in the station's log, and the delivery is judged as before", async (t) => {
  await controleInjouable(t, { "tsconfig.json": "{}\n" }, /the types of the frozen acceptance tests under `\.` are not checked: no TypeScript compiler is installed there/);
});

test("a type check whose tsc fails with nothing readable is said in the station's log, and the delivery is judged as before", async (t) => {
  await controleInjouable(t, { "tsconfig.json": "{}\n", "node_modules/.bin/tsc": "#!/bin/sh\necho 'tsc: cannot read tsconfig.json'\nexit 1\n" }, /the types of the frozen acceptance tests under `\.` are not checked: `tsc` exited with code 1 — tsc: cannot read tsconfig\.json/);
});
