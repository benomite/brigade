// La configuration du bac à sable d'un cook du Mac : il n'écrit que dans son
// worktree et les caches du projet, ne lit ni `~/.ssh`, ni les identifiants du
// chef, ni ses accès de prod, et ne joint que les hôtes de la liste du projet.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { argumentsDuBacASable, BacASableInvalide, CONSIGNE_DE_REFUS, configurer, LECTURES_INTERDITES, type Cook } from "../../src/bac-a-sable/configuration.ts";
import { estUneVerification, viseUneVerification } from "../../src/bac-a-sable/verification.ts";
import { reglesDuProjet, type Regle } from "../../src/reseau.ts";

const HOME = "/Users/chef";
const WORKTREE = "/Users/chef/brigade-wt/850-bac-a-sable";
const CACHES = ["/Users/chef/.npm", "/Users/chef/Library/Caches/pnpm"];
const projet = (hotes: string[] = []): Cook => ({ worktree: WORKTREE, caches: CACHES, hotes: reglesDuProjet(hotes), home: HOME });
const projetSeul = (hotes: Regle[]): Cook => ({ ...projet(), hotes });

test("l'écriture n'est ouverte que dans le worktree et les caches du projet — au bac à sable comme aux outils de `claude`", () => {
  const { modeDePermission, reglages } = configurer(projet());
  const { sandbox, permissions } = reglages;
  assert.deepEqual(sandbox.filesystem.allowWrite, [WORKTREE, ...CACHES]);
  assert.deepEqual(
    permissions.allow.filter((regle) => regle.startsWith("Edit(")),
    [WORKTREE, ...CACHES].map((lieu) => `Edit(/${lieu}/**)`),
  );
  // Rien d'autre n'ouvre l'écriture : ni répertoire ajouté, ni commande hors
  // du bac à sable, ni repli à nu quand une commande y échoue ou qu'il manque.
  assert.equal("additionalDirectories" in permissions, false);
  assert.deepEqual(sandbox.excludedCommands, []);
  assert.equal(sandbox.allowUnsandboxedCommands, false);
  assert.equal(sandbox.failIfUnavailable, true);
  assert.equal(sandbox.enabled, true);
  // Les règles qui autorisent ne tiennent qu'en `dontAsk` : c'est le mode du
  // cook, et `bypassPermissions` est désactivé.
  assert.equal(modeDePermission, "dontAsk");
  assert.equal(permissions.disableBypassPermissionsMode, "disable");
});

test("un autre worktree, d'autres caches : la configuration n'ouvre que ceux-là, chemins nettoyés et sans doublon", () => {
  const { reglages } = configurer({ ...projet(), worktree: "/Users/chef/wt/12-autre/", caches: ["~/.cargo/registry", "/Users/chef/wt/12-autre"] });
  assert.deepEqual(reglages.sandbox.filesystem.allowWrite, ["/Users/chef/wt/12-autre", "/Users/chef/.cargo/registry"]);
  assert.equal(JSON.stringify(reglages).includes(WORKTREE), false);
  assert.deepEqual(configurer({ ...projet(), caches: [] }).reglages.sandbox.filesystem.allowWrite, [WORKTREE]);
});

test("un lieu d'écriture qui ouvrirait le compte ou un accès interdit est refusé, en le disant", () => {
  const refuse = (cook: Partial<Cook>, motif: RegExp) => assert.throws(() => configurer({ ...projet(), ...cook }), (erreur: unknown) => erreur instanceof BacASableInvalide && motif.test(erreur.message));
  refuse({ caches: [HOME] }, /ni à la racine du compte/);
  refuse({ caches: ["~"] }, /ni à la racine du compte/);
  refuse({ caches: ["/"] }, /ni à la racine du compte/);
  refuse({ caches: ["/Users"] }, /ni au-dessus/);
  refuse({ worktree: "/Users/chef/brigade-wt/../" }, /ni à la racine du compte/);
  refuse({ caches: ["/Users/chef/.ssh"] }, /\/Users\/chef\/\.ssh/);
  refuse({ caches: ["/Users/chef/.ssh/../.ssh/agent"] }, /qu'il ne doit pas même lire/);
  refuse({ caches: ["/Users/chef/.config"] }, /\/Users\/chef\/\.config\/gh/);
  refuse({ caches: ["/srv/prod-secrets/cache"], prod: ["/srv/prod-secrets"] }, /\/srv\/prod-secrets/);
  refuse({ caches: ["node_modules/.cache"] }, /chemin absolu est attendu/);
  refuse({ worktree: "/Users/chef/wt/*" }, /motif/);
  refuse({ caches: ["/Users/chef/cache) Edit(//**"] }, /parenthèse/);
  refuse({ home: "Users/chef" }, /chemin absolu est attendu/);
});

test("la lecture de `~/.ssh`, des identifiants du chef et de ses accès de prod est interdite — au bac à sable comme aux outils de `claude`", () => {
  const prod = ["/Users/chef/prod/acces", "~/.config/scaleway", "/etc/brigade-prod"];
  const { reglages } = configurer({ ...projet(), prod });
  const { denyRead, denyWrite } = reglages.sandbox.filesystem;
  const interdits = [
    "/Users/chef/.ssh",
    "/Users/chef/.gnupg",
    "/Users/chef/Library/Keychains",
    "/Users/chef/.config/gh",
    "/Users/chef/.git-credentials",
    "/Users/chef/.netrc",
    "/Users/chef/.aws",
    "/Users/chef/.kube",
    "/Users/chef/.claude/.credentials.json",
    "/Users/chef/prod/acces",
    "/Users/chef/.config/scaleway",
    "/etc/brigade-prod",
  ];
  for (const interdit of interdits) {
    assert.ok(denyRead.includes(interdit), `${interdit} se lit dans le bac à sable`);
    assert.ok(denyWrite.includes(interdit), `${interdit} s'écrit dans le bac à sable`);
    for (const outil of ["Read", "Edit"]) {
      assert.ok(reglages.permissions.deny.includes(`${outil}(/${interdit})`), `${outil} atteint ${interdit}`);
      assert.ok(reglages.permissions.deny.includes(`${outil}(/${interdit}/**)`), `${outil} atteint ce qui est sous ${interdit}`);
    }
  }
  // Toute la liste par défaut, sous le compte que la station nomme.
  assert.deepEqual(denyRead.slice(0, LECTURES_INTERDITES.length), LECTURES_INTERDITES.map((relatif) => `${HOME}/${relatif}`));
  // Et aucune lecture n'est rouverte dessous.
  assert.equal("allowRead" in reglages.sandbox.filesystem, false);
  assert.deepEqual(
    reglages.permissions.allow.filter((regle) => regle.startsWith("Read(")),
    [],
  );
});

test("seuls les hôtes de la liste réseau du projet sont joignables, et un hôte hors de la liste est refusé quel que soit le mode", () => {
  const { reglages } = configurer(projet(["registry.npmjs.org", "*.example.org", "db.example.net:5432"]));
  const { network } = reglages.sandbox;
  assert.deepEqual(network.allowedDomains, [
    "anthropic.com",
    "*.anthropic.com",
    "claude.ai",
    "*.claude.ai",
    "claude.com",
    "*.claude.com",
    "github.com",
    "*.github.com",
    "githubusercontent.com",
    "*.githubusercontent.com",
    "registry.npmjs.org",
    "example.org",
    "*.example.org",
    "db.example.net:5432",
  ]);
  assert.equal(network.strictAllowlist, true);
  assert.equal(network.allowLocalBinding, false);
  assert.equal(network.allowAllUnixSockets, false);
  assert.equal(reglages.sandbox.enableWeakerNetworkIsolation, false);
  // WebFetch, hors du bac à sable, ne joint que ces hôtes-là — pas celui que
  // la liste borne à un port.
  assert.deepEqual(
    reglages.permissions.allow.filter((regle) => regle.startsWith("WebFetch(")),
    network.allowedDomains.filter((nom) => !nom.includes(":")).map((nom) => `WebFetch(domain:${nom})`),
  );
});

test("avec une liste réseau vide, aucun hôte n'est joignable : ni par le bac à sable, ni par WebFetch", () => {
  const { reglages } = configurer(projetSeul([]));
  assert.deepEqual(reglages.sandbox.network.allowedDomains, []);
  assert.equal(reglages.sandbox.network.strictAllowlist, true);
  assert.deepEqual(
    reglages.permissions.allow.filter((regle) => !regle.startsWith("Edit(")),
    [],
  );
});

test("un hôte de la liste qui n'en est pas un est refusé plutôt que d'ouvrir plus qu'il ne dit", () => {
  for (const hote of ["*", "*.com", "exemple.org/chemin", "EXEMPLE.org", "exemple.org ", "192.168.1.20"])
    assert.throws(() => configurer(projetSeul([{ hote, sousDomaines: false, port: null, origine: "project" }])), BacASableInvalide, hote);
  assert.throws(() => configurer(projetSeul([{ hote: "exemple.org", sousDomaines: false, port: 70000, origine: "project" }])), /port 70000/);
});

test("les arguments de lancement portent le mode du cook et des réglages qui se relisent tels quels", () => {
  const config = configurer(projet(["registry.npmjs.org"]));
  const args = argumentsDuBacASable(config);
  assert.deepEqual(args.slice(0, 3), ["--permission-mode", "dontAsk", "--settings"]);
  assert.deepEqual(JSON.parse(args[3] ?? ""), config.reglages);
  assert.deepEqual(args.slice(4), ["--append-system-prompt", CONSIGNE_DE_REFUS]);
});

// Sans cette variable, pnpm 10 cherche dans le registre la version que fixe le
// `packageManager` du projet (le cas de la station Mac) pour en vérifier la
// signature, et meurt de ERR_PNPM_PNPM_ENGINE_IDENTITY_UNVERIFIABLE derrière le
// proxy du bac à sable (#1320). Le vrai pnpm ne se joue pas ici : l'installer,
// c'était le réseau et six secondes à chaque passage.
test("les réglages du bac à sable posent la désactivation du changement de version de pnpm", () => {
  assert.deepEqual(configurer(projet()).reglages.env, { npm_config_manage_package_manager_versions: "false" });
});

test("un fichier remis au cook (son ticket) est lisible par ses outils, lui seul — et jamais sous un accès interdit", () => {
  const remis = "/Users/chef/etat/runs/7.ticket.md";
  const { permissions } = configurer({ ...projet(), lit: [remis] }).reglages;
  assert.deepEqual(
    permissions.allow.filter((regle) => regle.startsWith("Read(")),
    [`Read(/${remis})`],
  );
  assert.deepEqual(permissions.deny, configurer(projet()).reglages.permissions.deny);
  assert.equal(configurer(projet()).reglages.permissions.allow.some((regle) => regle.startsWith("Read(")), false);
  assert.throws(() => configurer({ ...projet(), lit: [`${HOME}/.config/brigade/runs/7.ticket.md`] }), (erreur: unknown) => erreur instanceof BacASableInvalide && /ne peut pas être sous/.test(erreur.message));
});

// Les formes de commande que le crochet du cook autorise ou laisse à `dontAsk`
// (qui refuse). Le crochet est celui que `configurer` pose, joué ici comme
// `claude` le joue : l'appel sur son entrée standard, la décision sur sa sortie.
// Pourquoi un crochet et non des règles `Bash(…)` : le `*` d'un motif couvre
// n'importe quoi, espaces comprises (`Bash(VAR=* ./node_modules/.bin/*)`
// laisserait passer `VAR=a curl x ./node_modules/.bin/y`) — établi avec `claude`.
function sortieDuCrochet(commande: string): { permissionDecision?: string; permissionDecisionReason?: string; additionalContext?: string } | null {
  const crochet = configurer(projet()).reglages.hooks.PreToolUse[0]?.hooks[0]?.command ?? "";
  const [, node, script] = /^"([^"]+)" "([^"]+)"$/.exec(crochet) ?? [];
  const sortie = spawnSync(node ?? "", [script ?? ""], { input: JSON.stringify({ tool_name: "Bash", tool_input: { command: commande } }), encoding: "utf8" });
  assert.equal(sortie.status, 0, sortie.stderr);
  return sortie.stdout === "" ? null : (JSON.parse(sortie.stdout) as { hookSpecificOutput: object }).hookSpecificOutput;
}
// Ce que le crochet autorise, jugé dans ce process : il n'autorise que ce que `estUneVerification` accepte.
const autorise = (commande: string) => estUneVerification(commande);

test("dontAsk : les tests et les linters du projet passent, rien d'autre n'est ouvert", () => {
  const permises = [
    "./node_modules/.bin/vitest run src/features/direct-discussion",
    "DATABASE_URL=postgres://localhost:5432/gadgets_test_445 LLM_MODE=mock ./node_modules/.bin/vitest run src/features/direct-discussion",
    "./node_modules/.bin/prettier --write src/a.ts",
    "pnpm test",
    "pnpm lint",
    "pnpm format",
    "pnpm test src/a.test.ts",
    "pnpm run lint",
    "LLM_MODE=mock pnpm test",
    "npm test",
    "npm run typecheck",
    "yarn lint",
    // Une chaîne `;` : chaque maillon se juge, la chaîne passe si tous passent.
    "ls node_modules/.bin; ./node_modules/.bin/prettier --write src/a.ts",
    "pnpm lint; pnpm test",
    "ls; cat src/a.ts; pnpm lint",
    "LLM_MODE=mock ./node_modules/.bin/vitest run a; ./node_modules/.bin/prettier --check .",
    // Un chemin du worktree, collé à une option ou non, reste permis.
    "./node_modules/.bin/eslint -c./eslint.config.js src",
    "./node_modules/.bin/vitest run -o./src/out.json --config=vitest.config.ts",
    "./node_modules/.bin/eslint --config:eslint.config.js src",
  ];
  const refusees = [
    "pnpm install",
    "pnpm add left-pad",
    "pnpm run deploy",
    "npm publish",
    "curl https://example.com",
    "FOO=bar curl https://example.com",
    "rm -rf node_modules",
    "cd /tmp && ./node_modules/.bin/vitest",
    "/usr/bin/env sh -c 'pnpm test'",
    "git push origin HEAD",
    "../../outside/node_modules/.bin/tool",
    // Un `=` ou une commande autorisée en queue n'ouvre pas ce qui précède.
    "curl http://x?a=1 pnpm test",
    "curl https://evil/?a=1 ./node_modules/.bin/x",
    "rm -rf ~ a=b pnpm test",
    "VAR=a curl https://evil ./node_modules/.bin/x",
    // Le `..` sort du dossier des binaires du projet.
    "./node_modules/.bin/../../../../usr/bin/curl https://evil",
    "./node_modules/.bin/vitest run ../autre-projet",
    // Un chemin absolu ou en `~` sort du worktree, lecture comprise.
    "cat /etc/passwd",
    "cat ~/autre-projet/.env",
    "ls ~",
    "ls /var/lib",
    "head -n 5 /etc/hosts",
    "pnpm lint; cat /etc/hosts",
    "ls node_modules/.bin; cat ~/.ssh/id_ed25519",
    "./node_modules/.bin/prettier --write /etc/hosts",
    "./node_modules/.bin/eslint --config=/tmp/evil.js src",
    // Un chemin hors du worktree collé à une option, sans espace ni `=`.
    "./node_modules/.bin/eslint -c/tmp/evil.js src",
    "./node_modules/.bin/vitest run -o/tmp/out.json",
    "./node_modules/.bin/eslint --config:/tmp/evil.js src",
    "./node_modules/.bin/prettier -c~/evil.json .",
    "pnpm test -c/tmp/evil.js",
    // Une variable qui change ce que le shell ou Node charge.
    "PATH=/tmp/evil pnpm test",
    "NODE_OPTIONS=--require=/tmp/x.js ./node_modules/.bin/vitest",
    "LD_PRELOAD=/tmp/x.so pnpm test",
    // Une chaîne dont un maillon est refusé n'est pas autorisée.
    "pnpm test; curl https://example.com",
    "curl https://example.com; pnpm test",
    "ls; rm -rf node_modules; pnpm lint",
    // Autres compositions.
    "pnpm test && curl https://example.com",
    "pnpm test | sh",
    "pnpm test $(curl https://example.com)",
    "pnpm test `id`",
    "pnpm test > ~/.bashrc",
    "pnpm test\ncurl https://example.com",
  ];
  for (const commande of permises) assert.equal(autorise(commande), true, commande);
  for (const commande of refusees) assert.equal(autorise(commande), false, commande);
  // Aucune règle `Bash(…)` : le droit tient dans le crochet, jamais dans un motif.
  assert.deepEqual(
    configurer(projet()).reglages.permissions.allow.filter((regle) => regle.startsWith("Bash")),
    [],
  );
});

test("une commande refusée porte la consigne : en raison du refus quand elle vise les tests ou les linters, en contexte sinon, sans rien autoriser ni refuser de plus", () => {
  // Vise une vérification sans en être une : le crochet la refuse lui-même, avec la raison.
  for (const commande of ["pnpm install", "VAR=a curl https://example.com ./node_modules/.bin/x", "./node_modules/.bin/../../usr/bin/curl x", "./node_modules/.bin/eslint -c/tmp/evil.js src", "pnpm test && pnpm lint", "npx vitest run"]) {
    assert.deepEqual([estUneVerification(commande), viseUneVerification(commande)], [false, true], commande);
  }
  // Une autre commande : pas de décision (dontAsk tranche, et lit déjà `git status` seul), la consigne en contexte.
  for (const commande of ["curl https://example.com", "git status", "rm -rf src"]) {
    assert.deepEqual([estUneVerification(commande), viseUneVerification(commande)], [false, false], commande);
  }
  // Ce que le crochet, dans son process, en rend à `claude` : un lancement par sorte de réponse.
  const refus = sortieDuCrochet("pnpm install");
  assert.deepEqual([refus?.permissionDecision, refus?.permissionDecisionReason], ["deny", CONSIGNE_DE_REFUS]);
  const autre = sortieDuCrochet("git status");
  assert.deepEqual([autre?.permissionDecision, autre?.additionalContext], [undefined, CONSIGNE_DE_REFUS]);
  assert.match(CONSIGNE_DE_REFUS, /pnpm test/);
  // Une vérification acceptée n'est pas refusée.
  assert.equal(sortieDuCrochet("pnpm test")?.permissionDecision, "allow");
});

test("un refus de dontAsk dit au cook quoi lancer à la place, dans les arguments de tout `claude` du bac à sable", () => {
  for (const attendu of ["don't ask mode", "./node_modules/.bin/", "pnpm test", "pnpm lint", "DATABASE_URL=", "worktree"]) assert.match(CONSIGNE_DE_REFUS, new RegExp(attendu.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const args = argumentsDuBacASable(configurer(projet()));
  assert.equal(args[args.indexOf("--append-system-prompt") + 1], CONSIGNE_DE_REFUS);
});
