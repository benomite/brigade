// La configuration du bac à sable d'un cook du Mac : il n'écrit que dans son
// worktree et les caches du projet, ne lit ni `~/.ssh`, ni les identifiants du
// chef, ni ses accès de prod, et ne joint que les hôtes de la liste du projet.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { argumentsDuBacASable, BacASableInvalide, configurer, LECTURES_INTERDITES, type Cook } from "../../src/bac-a-sable/configuration.ts";
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
  assert.equal(args.length, 4);
});

// Le démarrage de pnpm 10 interroge le registre par le `fetch` de Node. Ce test
// lance un vrai Node, avec l'environnement que le bac à sable donne (ses
// variables de proxy) et celui des réglages, et regarde par où part la requête
// vers l'hôte du registre : un faux proxy local la reçoit, ou rien ne la reçoit.
// L'hôte est en `.invalid` : sans proxy, la requête échoue au DNS et ne sort pas.
const HOTE_DU_REGISTRE = "registry.pnpm-test.invalid";
async function requetesRecues(envReglages: Record<string, string>): Promise<{ hotes: string[]; sortie: string }> {
  const hotes: string[] = [];
  const proxy = createServer((req, res) => {
    hotes.push(String(req.headers.host));
    res.end("ok");
  });
  await new Promise<void>((resoudre) => proxy.listen(0, "127.0.0.1", resoudre));
  const adresse = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
  try {
    const sortie = await new Promise<string>((resoudre) => {
      const fils = spawn(process.execPath, ["-e", `fetch("http://${HOTE_DU_REGISTRE}/pnpm").then((r) => r.text(), (e) => "erreur").then((t) => process.stdout.write(t))`], {
        env: { PATH: process.env.PATH ?? "", HTTP_PROXY: adresse, HTTPS_PROXY: adresse, http_proxy: adresse, https_proxy: adresse, ...envReglages },
        stdio: ["ignore", "pipe", "inherit"],
      });
      let texte = "";
      fils.stdout.on("data", (morceau) => (texte += morceau));
      fils.on("close", () => resoudre(texte));
    });
    return { hotes, sortie };
  } finally {
    proxy.close();
  }
}

test("avec l'environnement des réglages du bac à sable, la requête de démarrage de pnpm vers le registre passe par le proxy ; sans lui, elle n'y passe pas", async () => {
  const { reglages } = configurer(projet(["registry.npmjs.org"]));
  assert.equal(reglages.sandbox.network.allowedDomains.includes("registry.npmjs.org"), true);
  const avec = await requetesRecues(reglages.env);
  assert.deepEqual(avec.hotes, [HOTE_DU_REGISTRE]);
  assert.equal(avec.sortie, "ok");
  const sans = await requetesRecues({});
  assert.deepEqual(sans.hotes, []);
  assert.equal(sans.sortie, "erreur");
});
