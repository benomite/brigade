// La garde des appels d'outil d'un cook (#3506) : ses écritures et ses
// commandes qui effacent restent sous son worktree et son dossier temporaire,
// chemins résolus ; son `gh` reste sur son ticket. Chaque refus dit pourquoi.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { commandeDuCrochet, garderLeCook, jugerAppel, type Garde } from "../../src/garde-cook/garde.ts";
import { ENV_ENFANT, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";
import { posixOnly } from "../support/plateforme.ts";

const rienNeReste = temporaireDuFichier();

// Un cook : son worktree, son dossier temporaire, et un dossier à côté, hors
// des deux — le reste du disque.
function unCook(t: TestContext) {
  const racine = repertoireTemporaire(t);
  const worktree = join(racine, "worktree");
  const temporaire = join(racine, "tmp");
  const dehors = join(racine, "dehors");
  for (const dossier of [worktree, temporaire, dehors]) mkdirSync(dossier);
  writeFileSync(join(worktree, "a.ts"), "");
  writeFileSync(join(dehors, "precieux.txt"), "");
  const garde: Garde = { worktree, temporaires: [temporaire], ticket: 3506, depot: "benomite/brigade", branche: "cook/3506-github" };
  return { garde, worktree, temporaire, dehors };
}
const ecrire = (garde: Garde, outil: string, file_path: string) => jugerAppel(garde, { tool_name: outil, tool_input: { file_path }, cwd: garde.worktree }, { HOME: "/home/chef" });
const bash = (garde: Garde, command: string, env: Record<string, string> = {}) => jugerAppel(garde, { tool_name: "Bash", tool_input: { command }, cwd: garde.worktree }, { HOME: "/home/chef", ...env });

test("une écriture hors du worktree est refusée, raison dite ; dans le worktree et dans le dossier temporaire, elle passe", (t) => {
  const { garde, worktree, temporaire, dehors } = unCook(t);
  for (const outil of ["Write", "Edit", "MultiEdit"]) {
    assert.equal(ecrire(garde, outil, join(worktree, "a.ts")), null);
    assert.equal(ecrire(garde, outil, join(worktree, "neuf/b.ts")), null);
    assert.equal(ecrire(garde, outil, join(temporaire, "brouillon.md")), null);
    const dit = ecrire(garde, outil, join(dehors, "precieux.txt"));
    assert.match(dit ?? "", /^garde du cook — /);
    assert.ok(dit?.includes(join(dehors, "precieux.txt")) && dit.includes(`hors de ton worktree (${worktree})`), dit ?? "");
    // `..` qui sort du worktree.
    assert.match(ecrire(garde, outil, join(worktree, "../dehors/x.ts")) ?? "", /hors de ton worktree/);
    assert.match(ecrire(garde, outil, "/etc/profile") ?? "", /hors de ton worktree/);
  }
  assert.equal(jugerAppel(garde, { tool_name: "NotebookEdit", tool_input: { notebook_path: join(worktree, "n.ipynb") } }, {}), null);
  assert.match(jugerAppel(garde, { tool_name: "NotebookEdit", tool_input: { notebook_path: join(dehors, "n.ipynb") } }, {}) ?? "", /hors de ton worktree/);
  // Un chemin relatif se lit depuis où le cook est.
  assert.equal(jugerAppel(garde, { tool_name: "Write", tool_input: { file_path: "c.ts" }, cwd: worktree }, {}), null);
  assert.match(jugerAppel(garde, { tool_name: "Write", tool_input: { file_path: "../dehors/c.ts" }, cwd: worktree }, {}) ?? "", /hors de ton worktree/);
  // Sans chemin lisible, rien ne s'écrit.
  assert.match(jugerAppel(garde, { tool_name: "Write", tool_input: {} }, {}) ?? "", /sans chemin lisible/);
  // Ce qui n'écrit pas n'est pas jugé.
  assert.equal(jugerAppel(garde, { tool_name: "Read", tool_input: { file_path: "/etc/passwd" } }, {}), null);
});

test("une écriture par un lien du worktree qui mène dehors est refusée", { skip: posixOnly("symbolic links") }, (t) => {
  const { garde, worktree, dehors } = unCook(t);
  symlinkSync(dehors, join(worktree, "lien"));
  assert.match(ecrire(garde, "Write", join(worktree, "lien/precieux.txt")) ?? "", new RegExp(`mène à ${join(dehors, "precieux.txt").replaceAll("/", "\\/")}`));
  assert.match(ecrire(garde, "Edit", join(worktree, "lien/neuf/x.ts")) ?? "", /hors de ton worktree/);
});

test("rm -rf d'un chemin absolu hors du worktree est refusé, comme par `..` ou par un lien qui mène dehors ; rm d'un fichier du worktree passe", { skip: posixOnly("symbolic links") }, (t) => {
  const { garde, worktree, temporaire, dehors } = unCook(t);
  symlinkSync(dehors, join(worktree, "lien"));
  mkdirSync(join(worktree, "src"));
  // Ce qui passe : un fichier du worktree, un dossier dessous, le temporaire.
  for (const commande of ["rm a.ts", `rm -f ${join(worktree, "a.ts")}`, "rm -rf node_modules dist", "rm -rf ./src/*", `rm -rf ${join(temporaire, "essai")}`, "cd src && rm -rf ../dist", "mv a.ts b.ts", "rm -rf src/../dist", "echo x > notes.md 2>/dev/null", "git status; ls -la"]) {
    assert.equal(bash(garde, commande), null, commande);
  }
  // Ce qui est refusé, raison dite.
  const refus: Array<[string, RegExp]> = [
    [`rm -rf ${dehors}`, new RegExp(`mène à ${dehors.replaceAll("/", "\\/")}, hors de ton worktree`)],
    ["rm -rf /", /mène à \/, hors de ton worktree/],
    ["rm -rf ../dehors", /hors de ton worktree/],
    ["rm -rf ../*", /hors de ton worktree/],
    ["rm -rf lien/", /hors de ton worktree/],
    ["rm -rf lien/../precieux.txt", /hors de ton worktree/],
    ["rm lien/precieux.txt", /hors de ton worktree/],
    ["rm -rf ~/projets", /mène à \/home\/chef\/projets/],
    ["rm -rf $HOME/projets", /mène à \/home\/chef\/projets/],
    ["cd .. && rm -rf dehors", /hors de ton worktree/],
    ["rm -rf .", /tout entier/],
    [`mv a.ts ${dehors}/`, /hors de ton worktree/],
    [`mv ${join(dehors, "precieux.txt")} ici.txt`, /hors de ton worktree/],
    [`cp a.ts ${join(dehors, "precieux.txt")}`, /hors de ton worktree/],
    [`echo x > ${join(dehors, "precieux.txt")}`, /la redirection vers/],
    [`find ${dehors} -name '*.txt' -delete`, /hors de ton worktree/],
    [`bash -c "rm -rf ${dehors}"`, /hors de ton worktree/],
    [`echo $(rm -rf ${dehors})`, /hors de ton worktree/],
    [`ls; sudo rm -rf ${dehors}`, /hors de ton worktree/],
    ["rm -rf $INCONNUE/x", /ne sait pas où mène ce chemin/],
    [`D=${dehors}\nrm -rf $D`, /hors de ton worktree/],
  ];
  for (const [commande, raison] of refus) {
    const dit = bash(garde, commande);
    assert.match(dit ?? "", /^garde du cook — /, commande);
    assert.match(dit ?? "", raison, `${commande} : ${dit}`);
  }
  // Un document en ligne n'est pas une commande.
  assert.equal(bash(garde, `cat > notes.md <<'EOF'\nrm -rf ${dehors}\nEOF\nls`), null);
});

const gh = (garde: Garde, args: string, env: Record<string, string> = {}) => bash(garde, `gh ${args}`, env);

test("gh : l'administration, les réglages, les suppressions, un autre dépôt et la branche d'un autre ticket sont refusés ; l'issue et la PR du cook passent", (t) => {
  const { garde } = unCook(t);
  // Son issue, sa PR — celle de sa branche —, et les lectures de son dépôt.
  for (const args of [
    "issue view 3506",
    "issue comment 3506 --body 'fait'",
    "issue comment 3506 --body 'comme https://github.com/autre/depot/pull/3'",
    "issue comment https://github.com/benomite/brigade/issues/3506 -b ok",
    "issue edit 3506 --add-label cook:design",
    "pr view",
    "pr view 3510 --json files",
    "pr comment --body 'prête'",
    "pr edit cook/3506-github --title 'Guard'",
    "pr create --fill",
    "pr create --head cook/3506-github --title x --body y",
    "pr checks",
    "pr list --state open",
    "api repos/benomite/brigade/issues/3506",
    "api repos/{owner}/{repo}/pulls/3510/files",
    "api -X POST repos/benomite/brigade/issues/3506/comments -f body=ok",
    "api repos/benomite/brigade/issues/3506/labels -f 'labels[]=fire'",
    "api -X PATCH repos/benomite/brigade/git/refs/heads/cook/3506-github -f sha=abc",
    "api graphql -f query='{ repository(owner:\"benomite\", name:\"brigade\") { name } }'",
    "-R benomite/brigade issue view 3506",
    "auth status",
    "--version",
  ]) {
    assert.equal(gh(garde, args), null, args);
  }
  const refus: Array<[string, RegExp]> = [
    // L'administration et les réglages du dépôt.
    ["api repos/benomite/brigade/hooks", /administration ou aux réglages/],
    ["api -X PUT repos/benomite/brigade/collaborators/intrus", /administration ou aux réglages/],
    ["api -X PUT repos/benomite/brigade/branches/main/protection --input p.json", /administration ou aux réglages/],
    ["api repos/benomite/brigade/actions/secrets", /administration ou aux réglages/],
    ["api -X PATCH repos/benomite/brigade -f default_branch=x", /réglages du dépôt/],
    ["api -X POST orgs/benomite/repos -f name=x", /sort de ton dépôt/],
    ["api admin/users", /sort de ton dépôt/],
    ["repo edit --default-branch x", /n'est pas ouvert à un cook/],
    ["secret set JETON -b x", /n'est pas ouvert à un cook/],
    ["label create urgent", /n'est pas ouvert à un cook/],
    ["ruleset create", /n'est pas ouvert à un cook/],
    ["auth token", /n'est pas ouvert à un cook/],
    // Les suppressions.
    ["api -X DELETE repos/benomite/brigade/issues/comments/12", /supprime/],
    ["api --method delete repos/benomite/brigade/git/refs/heads/cook/3506-github", /supprime/],
    ["issue delete 3506 --yes", /supprime ou merge/],
    ["pr merge --squash", /supprime ou merge/],
    ["repo delete benomite/brigade --yes", /n'est pas ouvert à un cook/],
    ["release delete v2", /n'est pas ouvert à un cook/],
    ["run delete 42", /n'est pas ouvert à un cook/],
    // Un autre dépôt.
    ["issue view 1 -R autre/depot", /autre\/depot, un autre dépôt/],
    ["--repo=autre/depot pr list", /autre\/depot, un autre dépôt/],
    ["api repos/autre/depot/issues/1", /autre\/depot, un autre dépôt/],
    ["pr view https://github.com/autre/depot/pull/3", /autre\/depot, un autre dépôt/],
    ["repo view autre/depot", /un autre dépôt/],
    // La branche, l'issue ou la PR d'un autre ticket.
    ["pr edit cook/3499-github --add-label fire", /PR d'une autre branche/],
    ["pr create --head cook/3499-github", /branche d'un autre ticket/],
    ["api -X PATCH repos/benomite/brigade/git/refs/heads/cook/3499-github -f sha=abc -F force=true", /branche cook\/3499-github, celle d'un autre ticket/],
    ["api repos/benomite/brigade/git/refs -f ref=refs/heads/main -f sha=abc", /branche main, celle d'un autre ticket/],
    ["issue comment 3499 --body x", /l'issue d'un autre ticket/],
    ["issue close 3499", /l'issue d'un autre ticket/],
    ["api repos/benomite/brigade/issues/3499/comments -f body=x", /#3499, l'issue d'un autre ticket/],
    ["pr comment 3511 --body x", /ne sait pas, sans GitHub, si cette PR est la tienne/],
    ["api graphql -f query='mutation { deleteIssue(input:{issueId:\"x\"}) { clientMutationId } }'", /mutation GraphQL/],
  ];
  for (const [args, raison] of refus) {
    const dit = gh(garde, args);
    assert.match(dit ?? "", /^garde du cook — /, args);
    assert.match(dit ?? "", raison, `gh ${args} : ${dit}`);
  }
  // `GH_REPO`, de l'environnement ou posé devant la commande.
  assert.match(gh(garde, "issue view 1", { GH_REPO: "autre/depot" }) ?? "", /un autre dépôt/);
  assert.match(bash(garde, "GH_REPO=autre/depot gh pr list") ?? "", /un autre dépôt/);
  assert.equal(bash(garde, "GH_REPO=benomite/brigade gh pr view"), null);
  // Caché dans une autre commande, `gh` est jugé quand même.
  assert.match(bash(garde, "echo ok && bash -lc 'gh repo delete --yes'") ?? "", /n'est pas ouvert à un cook/);
});

// Le crochet tel que la station le lance : la commande de `commandeDuCrochet`,
// jouée par un shell, l'appel sur son entrée standard.
const repondre = (commande: string, entree: string) =>
  new Promise<string>((resoudre, rejeter) => {
    const enfant = spawn("/bin/sh", ["-c", commande], { stdio: ["pipe", "pipe", "pipe"], env: { ...ENV_ENFANT, HOME: "/home/chef" } });
    let sortie = "";
    enfant.stdout.setEncoding("utf8").on("data", (morceau: string) => (sortie += morceau));
    enfant.on("error", rejeter).on("close", () => resoudre(sortie));
    enfant.stdin.end(entree);
  });
const appel = (tool_name: string, tool_input: object, cwd: string) => JSON.stringify({ hook_event_name: "PreToolUse", tool_name, tool_input, cwd });
const decision = (sortie: string) => (sortie === "" ? null : (JSON.parse(sortie) as { hookSpecificOutput: { hookEventName: string; permissionDecision: string; permissionDecisionReason: string } }).hookSpecificOutput);

test("le crochet décide sur place, sous le modèle de permissions de Node : sans réseau ni process, il refuse, raison dite, ou laisse passer sans rien demander", { skip: posixOnly("the hook command is read by /bin/sh") }, async (t) => {
  const { garde, worktree, dehors } = unCook(t);
  const commande = commandeDuCrochet(garde);
  // Le node du crochet ne joint pas le réseau et ne lance rien : il ne lit
  // que le disque. Une garde qui l'essaierait échouerait, et refuserait tout.
  assert.match(commande, /--permission "--allow-fs-read=\*"/);
  assert.doesNotMatch(commande, /--allow-net|--allow-child-process|--allow-worker|--allow-fs-write/);
  const [ecrit, ecritDehors, efface, effaceDehors, ghSien, ghAutre, illisible] = await Promise.all([
    repondre(commande, appel("Write", { file_path: join(worktree, "b.ts"), content: "" }, worktree)),
    repondre(commande, appel("Write", { file_path: join(dehors, "b.ts"), content: "" }, worktree)),
    repondre(commande, appel("Bash", { command: "rm -rf dist" }, worktree)),
    repondre(commande, appel("Bash", { command: `rm -rf ${dehors}` }, worktree)),
    repondre(commande, appel("Bash", { command: "gh issue comment 3506 --body ok" }, worktree)),
    repondre(commande, appel("Bash", { command: "gh api -X DELETE repos/benomite/brigade" }, worktree)),
    repondre(commande, "{ illisible"),
  ]);
  // Ce qui passe ne reçoit aucune décision : ni `allow` qui court-circuiterait
  // une autre garde, ni `ask`, qui poserait une question au chef.
  assert.deepEqual([ecrit, efface, ghSien], ["", "", ""]);
  for (const [sortie, raison] of [
    [ecritDehors, /hors de ton worktree/],
    [effaceDehors, /hors de ton worktree/],
    [ghAutre, /supprime/],
    [illisible, /n'a pas pu lire cet appel/],
  ] as const) {
    assert.equal(decision(sortie)?.hookEventName, "PreToolUse");
    assert.equal(decision(sortie)?.permissionDecision, "deny");
    assert.match(decision(sortie)?.permissionDecisionReason ?? "", raison);
  }
  // Sa garde illisible : il refuse, il ne laisse rien passer.
  const sansGarde = await repondre(commande.replace(/"[^"]*"$/, '"%E0"'), appel("Write", { file_path: join(worktree, "b.ts") }, worktree));
  assert.match(decision(sansGarde)?.permissionDecisionReason ?? "", /n'a pas pu lire ce qu'elle garde/);
});

test("les arguments d'un cook, gardés : le crochet s'ajoute avant `--disallowedTools`, ou aux crochets PreToolUse des réglages qu'il a déjà ; rien d'autre ne change", () => {
  const cook = { worktree: "/wt/3506", ticket: 3506, depot: "benomite/brigade", branche: "cook/3506-github" };
  const nus = ["-p", "x", "--permission-mode", "bypassPermissions", "--disallowedTools", "Bash(git push:*)"];
  const gardes = garderLeCook(nus, cook);
  assert.deepEqual(gardes.slice(0, 4), nus.slice(0, 4));
  assert.deepEqual(gardes.slice(-2), nus.slice(-2));
  const reglages = JSON.parse(gardes[gardes.indexOf("--settings") + 1] ?? "") as { hooks: { PreToolUse: Array<{ matcher: string; hooks: Array<{ command: string }> }> } };
  assert.equal(reglages.hooks.PreToolUse[0]?.matcher, "Write|Edit|MultiEdit|NotebookEdit|Bash");
  assert.match(reglages.hooks.PreToolUse[0]?.hooks[0]?.command ?? "", /crochet\.ts/);
  // Le bac à sable d'un Mac pose déjà ses réglages : la garde s'y ajoute.
  const sable = ["-p", "x", "--permission-mode", "dontAsk", "--settings", JSON.stringify({ sandbox: { enabled: true }, hooks: { PreToolUse: [{ matcher: "Bash", hooks: [] }], PermissionRequest: [] } }), "--disallowedTools", "y"];
  const dansLeSable = garderLeCook(sable, cook);
  assert.equal(dansLeSable.filter((arg) => arg === "--settings").length, 1);
  const fusion = JSON.parse(dansLeSable[dansLeSable.indexOf("--settings") + 1] ?? "") as { sandbox: unknown; hooks: { PreToolUse: Array<{ matcher: string }>; PermissionRequest: unknown[] } };
  assert.deepEqual(fusion.sandbox, { enabled: true });
  assert.deepEqual(fusion.hooks.PermissionRequest, []);
  assert.deepEqual(fusion.hooks.PreToolUse.map(({ matcher }) => matcher), ["Bash", "Write|Edit|MultiEdit|NotebookEdit|Bash"]);
  assert.equal(dansLeSable[dansLeSable.indexOf("--permission-mode") + 1], "dontAsk");
});

test("garde.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
