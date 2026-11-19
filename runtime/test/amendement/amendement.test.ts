// L'amendement d'un critère d'acceptation (#3729). Les tests passent par la
// station (`stationDuDepot`), sur un faux GitHub et un vrai dépôt git : le faux
// `claude` est un cook qui finit sur un `<amendement>`, ou le manager qui le
// classe, reconnu à la marque de sa consigne.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { A_LA_MAIN, brancheDuTicket, stationDuDepot, type Lancer, type OptionsDuDepot } from "../../src/brigade-github.ts";
import { MARQUE_D_ECHEC } from "../../src/qualite-github.ts";
import { FauxGitHub, STATION_DU_DEPOT, fauxClient } from "../faux-github.ts";
import { ENV_GIT, repertoireTemporaire } from "../outils.ts";

// Les marques et l'auteur que la station écrit, tels qu'ils se lisent.
const AUTEUR_DU_MANAGER = "brigade manager <manager@brigade.localhost>";
const MARQUE_DU_CLASSEMENT = "<!-- brigade:amendement-au-manager -->";
const MARQUE_DE_PROPOSITION = "<!-- brigade:amendement-propose -->";
const MARQUE_D_APPLICATION = "<!-- brigade:amendement-applique";

const TICKET = 41;
const BRANCHE = brancheDuTicket(TICKET);
const GELE = "test/acceptance/41.test.ts";
const TEST_GELE = 'test("the export button is labelled", () => {\n  assert.match(label(), /Exprot/);\n});\n';
const PROPOSITION = ["test: test/acceptance/41.test.ts", "old: the export button is labelled 'Exprot'", "new: the export button is labelled 'Export'", "why: 'Exprot' is a typo of the criterion; the ticket's context says Export"].join("\n");
const PETIT = JSON.stringify({ accepte_tout_l_ancien: true, change_ce_que_voit_l_utilisateur: false, raison: "A typo: the criterion meant Export all along.", remplacer: "/Exprot/", par: "/Export/", changement: "the label assertion reads Export instead of Exprot" });

const git = (repertoire: string, ...args: string[]) => execFileSync("git", ["-C", repertoire, ...args], { env: ENV_GIT, encoding: "utf8" }).trim();

// Une origine dont `main` porte le test gelé, et le clone de la station.
function depotDeLaStation(t: TestContext): { origine: string; depot: OptionsDuDepot["depot"] } {
  const racine = repertoireTemporaire(t);
  const [origine, source, clone, worktrees] = ["origine.git", "source", "clone", "worktrees"].map((nom) => join(racine, nom)) as [string, string, string, string];
  execFileSync("git", ["init", "--quiet", "--bare", "--initial-branch=main", origine], { env: ENV_GIT });
  execFileSync("git", ["init", "--quiet", "--initial-branch=main", source], { env: ENV_GIT });
  git(source, "remote", "add", "origin", origine);
  mkdirSync(join(source, "test", "acceptance"), { recursive: true });
  writeFileSync(join(source, GELE), TEST_GELE);
  git(source, "add", ".");
  git(source, "commit", "--quiet", "-m", "the frozen acceptance test of #41");
  git(source, "push", "--quiet", "origin", "HEAD:main");
  execFileSync("git", ["clone", "--quiet", origine, clone], { env: ENV_GIT });
  const connait = (branche: string) => git(clone, "branch", "--list", branche) !== "";
  const depot: OptionsDuDepot["depot"] = {
    connait,
    preparer: async (run) => {
      const worktree = join(worktrees, run);
      git(clone, "worktree", "add", "--quiet", "-b", `cook/${run}`, worktree, "origin/main");
      return { worktree, branche: `cook/${run}` };
    },
    reprendre: async (run, branche) => {
      const worktree = join(worktrees, run);
      git(clone, "worktree", "add", "--quiet", worktree, branche);
      return worktree;
    },
    retirer: (worktree) => void git(clone, "worktree", "remove", "--force", worktree),
    ranger: async (worktree) => {
      git(clone, "worktree", "remove", "--force", worktree);
      return null;
    },
    pousser: (branche) => void git(clone, "push", "--quiet", "--force", "origin", branche),
    commits: (branche) => (connait(branche) ? Number(git(clone, "rev-list", "--count", `origin/main..${branche}`)) : 0),
    changes: () => [],
    diff: () => "",
    lancerGit: async (args, worktree) => {
      try {
        return { code: 0, stdout: execFileSync("git", args, { cwd: worktree, env: ENV_GIT, encoding: "utf8" }), stderr: "" };
      } catch (erreur) {
        return { code: 1, stdout: "", stderr: String((erreur as { stderr?: unknown }).stderr ?? erreur) };
      }
    },
  };
  return { origine, depot };
}

// `gele` : la branche part du commit des tests gelés, qui touche le test, comme
// l'écrit l'étape des tests (#3725) avant le cook.
// `leCookRetablit` : après l'avoir touché, le cook rend le test tel qu'il était, dans un second commit.
// `leCookSupprime` : le cook retire le test gelé de la branche.
type Options = { manager?: string; proposition?: string; leCookTouche?: boolean; leCookRetablit?: boolean; leCookSupprime?: boolean; gele?: boolean };

// Une station dont le cook du ticket finit sur une proposition d'amendement,
// et dont le manager la classe par `manager`.
async function amende(t: TestContext, { manager = PETIT, proposition = PROPOSITION, leCookTouche = false, leCookRetablit = false, leCookSupprime = false, gele = false }: Options = {}) {
  const repertoire = repertoireTemporaire(t);
  const { origine, depot } = depotDeLaStation(t);
  const faux = new FauxGitHub();
  faux.feu(TICKET, ["fire", "model:opus", "effort:medium"], "## Acceptance criteria\n\n- the export button is labelled 'Exprot'");
  const briefs: string[] = [];
  const classements: string[] = [];
  const parLeCook: string[] = [];
  const lancer: Lancer = ({ args, flux, entree, cwd }) => {
    const classe = args.some((arg) => arg.startsWith(MARQUE_DU_CLASSEMENT));
    if (classe) classements.push(args[args.indexOf("-p") + 1] ?? "");
    else {
      briefs.push(entree ?? "");
      if (gele) {
        writeFileSync(join(cwd, GELE), `${TEST_GELE}// frozen for #41\n`);
        execFileSync("git", ["commit", "--quiet", "-am", "test(#41): frozen acceptance tests", "-m", "Acceptance-Tests: frozen"], { cwd, env: ENV_GIT });
      }
      if (leCookTouche) {
        writeFileSync(join(cwd, GELE), TEST_GELE.replace("Exprot", "Export"));
        execFileSync("git", ["commit", "--quiet", "-am", "fix the typo of the criterion"], { cwd, env: ENV_GIT });
        parLeCook.push(execFileSync("git", ["rev-parse", "HEAD"], { cwd, env: ENV_GIT, encoding: "utf8" }).trim());
        if (leCookRetablit) {
          execFileSync("git", ["checkout", "HEAD~1", "--", GELE], { cwd, env: ENV_GIT });
          execFileSync("git", ["commit", "--quiet", "-am", "restore the frozen test"], { cwd, env: ENV_GIT });
        }
      }
      if (leCookSupprime) {
        execFileSync("git", ["rm", "--quiet", GELE], { cwd, env: ENV_GIT });
        execFileSync("git", ["commit", "--quiet", "-m", "drop the frozen test"], { cwd, env: ENV_GIT });
        parLeCook.push(execFileSync("git", ["rev-parse", "HEAD"], { cwd, env: ENV_GIT, encoding: "utf8" }).trim());
      }
    }
    const message = classe ? manager : `The criterion is wrong.\n<livrable>\nI propose an amendment.\n<amendement>\n${proposition}\n</amendement>\n</livrable>`;
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 10, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({ ...STATION_DU_DEPOT, github: fauxClient(faux), depot, manager: () => ({ model: "opus", effort: "high" }), flux: repertoire, lancer, avertir: () => {} });
  if ("refus" in station) throw new Error(station.refus);
  await station.tour();
  await station.calme();
  const commentaires = (faux.commentaires.get(TICKET) ?? []).map((c) => c.body);
  const surLaBranche = (...args: string[]) => (git(origine, "branch", "--list", BRANCHE) === "" ? null : git(origine, ...args));
  return {
    ticket: faux.ticket(TICKET),
    briefs,
    classements,
    parLeCook,
    commentaires,
    testGele: () => surLaBranche("show", `${BRANCHE}:${GELE}`) ?? git(origine, "show", `main:${GELE}`),
    // Les commits de la branche livrée qui touchent le test gelé : auteur, puis message.
    commitsSurLeTest: () => (surLaBranche("log", "--format=%an <%ae>%x1f%B%x1e", `main..${BRANCHE}`, "--", GELE) ?? "").split("\x1e").map((c) => c.trim()).filter(Boolean),
  };
}

test("every cook's brief says how to propose an amendment instead of changing a frozen test", async (t) => {
  const { briefs } = await amende(t);
  assert.match(briefs[0] ?? "", /Tu ne modifies jamais un test d'acceptation gelé[\s\S]*<amendement> et <\/amendement>[\s\S]*`old:`[\s\S]*`new:`[\s\S]*`why:`/);
});

test("the cook's proposal appears on the issue with the old criterion, the new one and the reason", async (t) => {
  const { commentaires } = await amende(t);
  const proposition = commentaires.find((corps) => corps.startsWith(MARQUE_DE_PROPOSITION));
  assert.match(proposition ?? "", /test\/acceptance\/41\.test\.ts[\s\S]*The criterion says:[\s\S]*> the export button is labelled 'Exprot'[\s\S]*It should say:[\s\S]*> the export button is labelled 'Export'[\s\S]*Why:[\s\S]*> 'Exprot' is a typo/);
});

test("a small amendment that weakens nothing is applied without the chef: one manager commit with the trailer updates the frozen test, and the issue says what changed", async (t) => {
  const { ticket, classements, commentaires, testGele, commitsSurLeTest } = await amende(t);
  assert.equal(classements.length, 1);
  assert.match(classements[0] ?? "", /<proposition>\ntest: test\/acceptance\/41\.test\.ts\nold: the export button is labelled 'Exprot'/);
  assert.equal(testGele(), TEST_GELE.replace("/Exprot/", "/Export/").trim());
  const commits = commitsSurLeTest();
  assert.equal(commits.length, 1, "a single commit touches the frozen test: the manager's");
  const [auteur, corps] = (commits[0] ?? "").split("\x1f");
  assert.equal(auteur, AUTEUR_DU_MANAGER, "the commit is the manager's, not the cook's");
  assert.match(corps ?? "", /^test\(#41\): amendment — the label assertion reads Export instead of Exprot\n\nAmendment: #41$/);
  const applique = commentaires.find((corps) => corps.startsWith(MARQUE_D_APPLICATION));
  assert.match(applique ?? "", /amendment applied without the chef[\s\S]*with the trailer `Amendment: #41`, changes `test\/acceptance\/41\.test\.ts`: the label assertion reads Export instead of Exprot[\s\S]*- \/Exprot\/[\s\S]*\+ \/Export\//);
  assert.equal(ticket.labels.has(A_LA_MAIN), false, "nothing goes to the chef");
  assert.equal(ticket.labels.has("fire"), true, "the ticket goes back to a cook");
  assert.equal(commentaires.some((corps) => corps.startsWith(MARQUE_D_ECHEC)), false, "an applied amendment is not a failed cook");
});

test("an amendment that changes the product creates a card in the chef's TODO and changes no test", async (t) => {
  const manager = JSON.stringify({ accepte_tout_l_ancien: true, change_ce_que_voit_l_utilisateur: true, raison: "The user would read another label.", remplacer: "/Exprot/", par: "/Export/", changement: "…" });
  const { ticket, commentaires, testGele, commitsSurLeTest } = await amende(t, { manager });
  assert.equal(ticket.labels.has(A_LA_MAIN), true);
  const carte = commentaires.find((corps) => corps.startsWith("**Question for the chef"));
  assert.equal(carte?.split("\n")[0], "**Question for the chef (product):** Amend the acceptance criterion of #41 as the cook proposes below?");
  assert.match(carte ?? "", /it changes what the user sees or does\. No test was changed\.[\s\S]*The user would read another label\.[\s\S]*> the export button is labelled 'Export'/);
  assert.equal(testGele(), TEST_GELE.trim(), "the frozen test is untouched until the chef answers");
  assert.deepEqual(commitsSurLeTest(), []);
  assert.equal(commentaires.some((corps) => corps.startsWith(MARQUE_D_APPLICATION)), false);
});

test("an amendment that weakens the criterion is refused like a product change: a TODO card, nothing applied — even with a replacement in the manager's answer", async (t) => {
  const manager = JSON.stringify({ accepte_tout_l_ancien: false, change_ce_que_voit_l_utilisateur: false, raison: "The new criterion accepts any label.", remplacer: "/Exprot/", par: "/.*/", changement: "accept any label" });
  const { ticket, commentaires, testGele, commitsSurLeTest } = await amende(t, { manager });
  assert.equal(ticket.labels.has(A_LA_MAIN), true);
  const carte = commentaires.find((corps) => corps.startsWith("**Question for the chef"));
  assert.match(carte ?? "", /it weakens the criterion: a behaviour the old criterion accepted would no longer be accepted, which is treated as a product change\. No test was changed\./);
  assert.equal(testGele(), TEST_GELE.trim());
  assert.deepEqual(commitsSurLeTest(), []);
});

test("a cook cannot apply an amendment itself: its own commit on the frozen test makes the proposal refused, the manager is not asked, and no manager commit is made", async (t) => {
  const { ticket, classements, commentaires, commitsSurLeTest } = await amende(t, { leCookTouche: true });
  assert.equal(classements.length, 0);
  assert.equal(ticket.labels.has(A_LA_MAIN), false);
  assert.match(commentaires.find((corps) => corps.startsWith(MARQUE_D_ECHEC)) ?? "", /the cook's own commit [0-9a-f]{7} changes the frozen test `test\/acceptance\/41\.test\.ts`: a cook never changes it, only the manager amends it/);
  assert.equal(commitsSurLeTest().filter((commit) => commit.startsWith(AUTEUR_DU_MANAGER)).length, 0);
});

// Le commit des tests gelés, premier de la branche, n'est pas du cook (#3764) :
// il touche le test qu'il gèle, et l'amendement passe quand même ; un commit du
// cook après lui reste refusé, et seul lui est nommé.
test("the frozen acceptance commit that opens the branch is not the cook's: the small amendment is applied in the manager's commit", async (t) => {
  const { ticket, classements, commentaires, testGele, commitsSurLeTest } = await amende(t, { gele: true });
  assert.equal(commentaires.find((corps) => corps.startsWith(MARQUE_D_ECHEC)), undefined);
  assert.equal(classements.length, 1);
  assert.equal(ticket.labels.has(A_LA_MAIN), false);
  assert.match(testGele(), /\/Export\//);
  assert.equal(commitsSurLeTest().filter((commit) => commit.startsWith(AUTEUR_DU_MANAGER)).length, 1);
});

test("a cook's commit on the frozen test after the frozen acceptance commit is refused, and only that commit is named", async (t) => {
  const { ticket, classements, parLeCook, commentaires, commitsSurLeTest } = await amende(t, { gele: true, leCookTouche: true });
  assert.equal(classements.length, 0);
  assert.equal(ticket.labels.has(A_LA_MAIN), false);
  assert.equal(parLeCook.length, 1);
  const echec = commentaires.find((corps) => corps.startsWith(MARQUE_D_ECHEC)) ?? "";
  assert.ok(echec.includes(`the cook's own commit ${(parLeCook[0] ?? "").slice(0, 7)} changes the frozen test \`test/acceptance/41.test.ts\``), echec);
  assert.equal(commitsSurLeTest().filter((commit) => commit.startsWith(AUTEUR_DU_MANAGER)).length, 0);
});

// Un cook a touché le test gelé, puis l'a rendu tel que le gel l'a laissé : il
// ne le change plus, et l'amendement passe par le manager. Avant #3849, ces deux
// commits refusaient pour toujours toute proposition (#3764, la PR #3766).
test("a cook's commit on the frozen test, restored since by the cook, no longer refuses the proposal: the small amendment is applied in the manager's commit", async (t) => {
  const { ticket, classements, commentaires, testGele, commitsSurLeTest } = await amende(t, { gele: true, leCookTouche: true, leCookRetablit: true });
  assert.equal(commentaires.find((corps) => corps.startsWith(MARQUE_D_ECHEC)), undefined);
  assert.equal(classements.length, 1);
  assert.equal(ticket.labels.has(A_LA_MAIN), false);
  assert.match(testGele(), /\/Export\/[\s\S]*\/\/ frozen for #41/);
  const [dernier] = commitsSurLeTest();
  assert.ok(dernier?.startsWith(AUTEUR_DU_MANAGER), "the last commit on the frozen test is the manager's amendment");
});

// Seule la tête rendue telle que l'a laissée le dernier commit autorisé lève le
// refus : rétabli, le test passe au manager ; laissé changé, avec ou sans le
// commit des tests gelés, ou retiré de la tête, il reste refusé, et seul le
// commit du cook est nommé.
test("the head decides whether a cook's commit on the frozen test still refuses the proposal: restored, it goes to the manager; left changed or deleted, it is refused naming only the cook's commit", async (t) => {
  const retabli = await amende(t, { gele: true, leCookTouche: true, leCookRetablit: true });
  assert.equal(retabli.commentaires.find((corps) => corps.startsWith(MARQUE_D_ECHEC)), undefined);
  assert.equal(retabli.classements.length, 1);
  const refuses: Array<[string, Options]> = [
    ["changed after the frozen commit", { gele: true, leCookTouche: true }],
    ["changed with no frozen commit", { leCookTouche: true }],
    ["deleted on the head", { gele: true, leCookSupprime: true }],
  ];
  for (const [cas, options] of refuses) {
    const { classements, parLeCook, commentaires } = await amende(t, options);
    assert.equal(classements.length, 0, cas);
    assert.equal(parLeCook.length, 1, cas);
    const echec = commentaires.find((corps) => corps.startsWith(MARQUE_D_ECHEC)) ?? "";
    assert.ok(echec.includes(`the cook's own commit ${(parLeCook[0] ?? "").slice(0, 7)} changes the frozen test`), echec);
  }
});

// Ce qui ne se lit pas n'applique rien et ne va à aucun chef : un échec du ticket, dit.
const ILLISIBLES: Array<[string, Options, RegExp]> = [
  ["a proposal with a missing field", { proposition: "test: test/acceptance/41.test.ts\nold: Exprot\nwhy: a typo" }, /the cook's amendment proposal has no `new:`/],
  ["a manager answer with no JSON", { manager: "I think it is fine." }, /the manager's classification of the amendment could not be read: no JSON object in the answer/],
  ["a manager answer that does not say whether the user sees a change", { manager: JSON.stringify({ accepte_tout_l_ancien: true, raison: "A typo." }) }, /does not say whether what the user sees changes/],
  ["a replacement not in the frozen test", { manager: JSON.stringify({ ...JSON.parse(PETIT), remplacer: "/Exprt/" }) }, /the text it replaces is found 0 times in `test\/acceptance\/41\.test\.ts`, not once: nothing was applied/],
  ["a frozen test that does not exist", { proposition: PROPOSITION.replace("test/acceptance/41.test.ts", "test/acceptance/absent.test.ts") }, /the frozen test `test\/acceptance\/absent\.test\.ts` cannot be read on the branch/],
];
for (const [cas, options, motif] of ILLISIBLES) {
  test(`${cas}: nothing is applied, nothing goes to the chef, the ticket says why`, async (t) => {
    const { ticket, commentaires, testGele, commitsSurLeTest } = await amende(t, options);
    assert.match(commentaires.find((corps) => corps.startsWith(MARQUE_D_ECHEC)) ?? "", motif);
    assert.equal(ticket.labels.has(A_LA_MAIN), false);
    assert.equal(testGele(), TEST_GELE.trim());
    assert.deepEqual(commitsSurLeTest(), []);
  });
}
