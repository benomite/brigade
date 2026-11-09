// Un dépôt prêt pour brigade, et le geste qui l'y prépare (#2626) : le constat
// sur chaque forme de dépôt, le geste rejouable, son refus en une phrase, et
// la commande `installation repo` par laquelle l'app y arrive.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { Sortie } from "../../src/appel.ts";
import { ANCIEN_NOM_DE_SERVED_ELSEWHERE as ANCIEN, ETIQUETTES } from "../../src/etiquettes.ts";
import { checkRepoSetup, commande, LABELS_DES_ROLES, runRepoSetup, type Repo } from "../../src/depot-prepare/preparation.ts";
import type { ClientGitHub, RequeteGitHub } from "../../src/proteger-branche.ts";
import { DEPOT, fauxGh, repertoireTemporaire } from "../outils.ts";

const TOUS = LABELS_DES_ROLES.map(({ name }) => name);
const BINDINGS = "# Projet\n\n## Équipe multi-agents (plugin brigade)\n\n- **Branche d'intégration** : `main`\n";

// Un GitHub en mémoire : les labels du dépôt avec leur description, les issues et
// les labels qu'elles portent (un renommage de label les suit, comme chez GitHub),
// et ce qu'il refuse de créer. `presents` : des noms, à la description du
// catalogue, ou des labels tels que le dépôt les tient.
type LabelTenu = { name: string; description: string | null };
function github(presents: Array<string | LabelTenu>, refuse: string[] = [], issues: Record<number, string[]> = {}) {
  const labels = new Map<string, LabelTenu>();
  for (const present of presents) {
    const label = typeof present === "string" ? { name: present, description: ETIQUETTES.find(({ name }) => name.toLowerCase() === present.toLowerCase())?.description ?? null } : present;
    labels.set(label.name.toLowerCase(), label);
  }
  const ecritures: RequeteGitHub[] = [];
  const reponse = (statut: number, corps: unknown = {}) => ({ statut, corps, scopes: null });
  const client: ClientGitHub = async (requete) => {
    const racine = `repos/${DEPOT}/labels`;
    if (requete.methode === "GET" && requete.chemin.startsWith(`${racine}?`)) return reponse(200, requete.chemin.endsWith("page=1") ? [...labels.values()] : []);
    if (requete.methode === "GET") {
      const lu = labels.get(decodeURIComponent(requete.chemin.slice(`${racine}/`.length)).toLowerCase());
      return lu ? reponse(200, lu) : reponse(404);
    }
    ecritures.push(requete);
    if (requete.methode === "POST") {
      const { name, description } = requete.corps as { name: string; description: string };
      if (refuse.includes(name)) return reponse(403, { message: "Resource not accessible by integration" });
      labels.set(name.toLowerCase(), { name, description });
      return reponse(201);
    }
    const ancien = decodeURIComponent(requete.chemin.slice(`${racine}/`.length));
    const tenu = labels.get(ancien.toLowerCase());
    if (!tenu) return reponse(404);
    const { new_name: nouveau, description } = requete.corps as { new_name?: string; description?: string };
    labels.delete(ancien.toLowerCase());
    labels.set((nouveau ?? tenu.name).toLowerCase(), { name: nouveau ?? tenu.name, description: description ?? tenu.description });
    if (nouveau !== undefined) for (const portes of Object.values(issues)) portes.splice(0, portes.length, ...portes.map((nom) => (nom === ancien ? nouveau : nom)));
    return reponse(200);
  };
  return { client, ecritures, labels, issues };
}

function depot(t: TestContext, claudeMd: string | null): Repo {
  const dir = repertoireTemporaire(t);
  if (claudeMd !== null) writeFileSync(join(dir, "CLAUDE.md"), claudeMd);
  return { dir, github: DEPOT };
}

describe("le constat", { concurrency: 4 }, () => {
  test("un dépôt sans section ni label : tout manque, chaque label nommé", async (t) => {
    assert.deepEqual(await checkRepoSetup(depot(t, "# Projet\n"), github([]).client), { ready: false, missingBindings: true, missingLabels: TOUS });
  });

  test("un dépôt sans CLAUDE.md : la section manque", async (t) => {
    assert.equal((await checkRepoSetup(depot(t, null), github(TOUS).client)).missingBindings, true);
  });

  test("un dépôt prêt : rien ne manque — la casse d'un label ne compte pas", async (t) => {
    assert.deepEqual(await checkRepoSetup(depot(t, BINDINGS), github(["Product", ...TOUS.slice(1)]).client), { ready: true, missingBindings: false, missingLabels: [] });
  });

  test("seulement des labels manquent", async (t) => {
    assert.deepEqual(await checkRepoSetup(depot(t, BINDINGS), github(["product", "prio:1"]).client), { ready: false, missingBindings: false, missingLabels: ["triage", "prio:2", "prio:3"] });
  });

  test("seulement la section manque", async (t) => {
    assert.deepEqual(await checkRepoSetup(depot(t, "# Projet\n\n## Autre chose\n"), github(TOUS).client), { ready: false, missingBindings: true, missingLabels: [] });
  });

  test("GitHub qui ne rend pas un label : le constat rejette en une phrase", async (t) => {
    const client: ClientGitHub = async () => ({ statut: 401, corps: { message: "Bad credentials" }, scopes: null });
    await assert.rejects(checkRepoSetup(depot(t, BINDINGS), client), { message: `GitHub did not let the label \`product\` be read on ${DEPOT} (HTTP 401: Bad credentials).` });
  });
});

describe("le geste", { concurrency: 4 }, () => {
  test("il prépare un dépôt qui ne l'est pas, et le second passage ne change rien", async (t) => {
    const repo = depot(t, "# Projet\n\nDu texte du projet.\n");
    const gh = github(["triage"]);

    assert.deepEqual(await runRepoSetup(repo, gh.client), { ready: true, missingBindings: false, missingLabels: [] });
    assert.deepEqual(await checkRepoSetup(repo, gh.client), { ready: true, missingBindings: false, missingLabels: [] });
    assert.deepEqual(gh.ecritures.map((requete) => (requete.corps as { name: string }).name), ETIQUETTES.map(({ name }) => name).filter((nom) => nom !== "triage"));
    const ecrit = readFileSync(join(repo.dir, "CLAUDE.md"), "utf8");
    assert.match(ecrit, /^# Projet\n\nDu texte du projet\.\n\n## Équipe multi-agents \(plugin brigade\)\n/);
    assert.match(ecrit, /- \*\*Branche d'intégration\*\* : `main`/);

    assert.deepEqual(await runRepoSetup(repo, gh.client), { ready: true, missingBindings: false, missingLabels: [] });
    assert.equal(gh.ecritures.length, ETIQUETTES.length - 1);
    assert.equal(readFileSync(join(repo.dir, "CLAUDE.md"), "utf8"), ecrit);
  });

  test("sur un projet vide, l'init crée chaque label du catalogue, avec son nom et sa description anglais", async (t) => {
    const gh = github([]);

    await runRepoSetup(depot(t, "# Projet\n"), gh.client);

    assert.deepEqual([...gh.labels.values()], ETIQUETTES.map(({ name, description }) => ({ name, description })));
    assert.deepEqual(gh.ecritures.map((requete) => requete.methode), ETIQUETTES.map(() => "POST"));
    assert.deepEqual(gh.ecritures.map((requete) => (requete.corps as { color: string }).color), ETIQUETTES.map(({ color }) => color));
  });

  test("à la mise à jour, les descriptions françaises et l'ancien nom du label servi ailleurs finissent en anglais, les tickets sur `served-elsewhere`", async (t) => {
    const anciens = [
      { name: "product", description: "Issue née du PO" },
      { name: "triage", description: "À qualifier" },
      { name: "prio:1", description: "À faire en premier" },
      { name: "fire", description: "brigade : à servir — l'issue entre sur le rail" },
      { name: ANCIEN, description: "Ce ticket ne se sert pas sur cette box" },
      { name: "bug", description: "Un label du projet" },
    ];
    const gh = github(anciens, [], { 7: ["fire", ANCIEN], 8: [ANCIEN, "bug"], 9: ["fire"] });

    await runRepoSetup(depot(t, "# Projet\n"), gh.client);

    const finis = new Map([...gh.labels.values()].map(({ name, description }) => [name, description]));
    for (const { name, description } of ETIQUETTES) assert.equal(finis.get(name), description, name);
    assert.equal(finis.has(ANCIEN), false);
    assert.equal(finis.get("bug"), "Un label du projet");
    assert.deepEqual(gh.issues, { 7: ["fire", "served-elsewhere"], 8: ["served-elsewhere", "bug"], 9: ["fire"] });

    const avant = gh.ecritures.length;
    await runRepoSetup(depot(t, "# Projet\n"), gh.client);
    assert.equal(gh.ecritures.length, avant);
  });

  test("GitHub qui ne rend pas la liste des labels : le geste rejette en une phrase, sans rien écrire", async (t) => {
    const ecritures: string[] = [];
    const client: ClientGitHub = async (requete) => {
      if (requete.methode !== "GET") ecritures.push(requete.chemin);
      return requete.chemin.includes("?") ? { statut: 500, corps: { message: "Server Error" }, scopes: null } : { statut: 200, corps: {}, scopes: null };
    };
    await assert.rejects(runRepoSetup(depot(t, "# Projet\n"), client), { message: `GitHub did not let the labels be read on ${DEPOT} (HTTP 500: Server Error).` });
    assert.deepEqual(ecritures, []);
  });

  test("sans CLAUDE.md, il le crée avec la seule section, sur la branche du dépôt", async (t) => {
    const repo = { ...depot(t, null), branch: "develop" };
    assert.equal((await runRepoSetup(repo, github(TOUS).client)).ready, true);
    assert.match(readFileSync(join(repo.dir, "CLAUDE.md"), "utf8"), /^## Équipe multi-agents \(plugin brigade\)\n\n- \*\*Branche d'intégration\*\* : `develop`\n/);
  });

  test("GitHub refusant un label : il rejette en une phrase, et le CLAUDE.md reste tel quel", async (t) => {
    const repo = depot(t, "# Projet\n");
    await assert.rejects(runRepoSetup(repo, github([], ["triage"]).client), (erreur: Error) => {
      assert.equal(erreur.message, `GitHub refused to create the label \`triage\` on ${DEPOT} (HTTP 403: Resource not accessible by integration).`);
      assert.doesNotMatch(erreur.message, /\n/);
      return true;
    });
    assert.equal(readFileSync(join(repo.dir, "CLAUDE.md"), "utf8"), "# Projet\n");
  });
});

describe("la commande `installation repo`", { concurrency: 4 }, () => {
  const jouer = async (args: string[], env: Record<string, string>, client: ClientGitHub) => {
    const dits: string[] = [];
    const redits: string[] = [];
    let code = 0;
    try {
      await commande({ args, env, dire: (ligne) => dits.push(ligne), redire: (ligne) => redits.push(ligne) }, client);
    } catch (erreur) {
      if (!(erreur instanceof Sortie)) throw erreur;
      code = erreur.code;
    }
    return { code, dits, redits };
  };

  test("`--json` rend le constat sur une ligne, `setup --json` le geste ; 0 prêt, 1 sinon", async (t) => {
    const { dir } = depot(t, "# Projet\n");
    const env = { BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_REPO_DIR: dir };
    const gh = github([]);

    assert.deepEqual(await jouer(["--json"], env, gh.client), { code: 1, dits: [JSON.stringify({ ready: false, missingBindings: true, missingLabels: TOUS })], redits: [] });
    assert.deepEqual(await jouer(["setup", "--json"], env, gh.client), { code: 0, dits: [JSON.stringify({ ready: true, missingBindings: false, missingLabels: [] })], redits: [] });
  });

  test("un refus de GitHub sort en 1, la raison dans `error`", async (t) => {
    const { dir } = depot(t, "# Projet\n");
    const { code, dits } = await jouer(["setup", "--json"], { BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_REPO_DIR: dir }, github([], ["product"]).client);
    assert.equal(code, 1);
    assert.match(JSON.parse(dits[0] ?? "{}").error, /^GitHub refused to create the label `product`/);
  });

  test("sans BRIGADE_REPO_DIR, ou avec un mot de trop, elle refuse en 2", async () => {
    assert.equal((await jouer(["--json"], { BRIGADE_GITHUB_REPO: DEPOT }, github([]).client)).code, 2);
    assert.equal((await jouer(["poser"], { BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_REPO_DIR: "/" }, github([]).client)).code, 2);
  });

  test("`npm --prefix runtime run installation -- repo --json` y arrive, sur le `gh` du service", async (t) => {
    const { dir } = depot(t, BINDINGS);
    const gh = fauxGh(t);
    for (const nom of TOUS) gh.repondre(`repos/${DEPOT}/labels/${encodeURIComponent(nom)}`, { statut: nom === "triage" ? 404 : 200, corps: {} });
    const cli = join(import.meta.dirname, "../../src/installation-cli.ts");
    const { code, sortie } = await new Promise<{ code: number | null; sortie: string }>((resoudre) => {
      execFile(process.execPath, [cli, "repo", "--json"], { env: { ...process.env, BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_REPO_DIR: dir, BRIGADE_GH_BIN: gh.bin } }, (erreur, stdout) =>
        resoudre({ code: erreur === null ? 0 : typeof erreur.code === "number" ? erreur.code : null, sortie: stdout }),
      );
    });
    assert.deepEqual(JSON.parse(sortie), { ready: false, missingBindings: false, missingLabels: ["triage"] });
    assert.equal(code, 1);
  });
});
