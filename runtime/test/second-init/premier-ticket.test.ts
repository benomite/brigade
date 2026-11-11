// Le projet prêt après le merge de la mise en place, et le premier ticket (#3170) :
// le constat (`checkRepoSetup`) lit la section sur la branche d'intégration quand
// la copie locale ne l'a pas encore — par l'objet, puis par la commande
// `installation repo` sur un `gh` —, et le second, lancé sur un dépôt pas préparé
// (`planDuSecond`), sait d'avance qu'une fois prêt il propose un premier ticket,
// l'écrit avec le chef et le crée sur le rail.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { checkRepoSetup, LABELS_DES_ROLES, runRepoSetup, type Repo } from "../../src/depot-prepare/preparation.ts";
import { ETIQUETTES } from "../../src/etiquettes.ts";
import { LABEL } from "../../src/github.ts";
import type { ClientGitHub, RequeteGitHub } from "../../src/proteger-branche.ts";
import { claudeMdDeLaBase, LABELS_DU_PREMIER_TICKET, messageDuPremierTicket, SECTIONS_DU_PREMIER_TICKET } from "../../src/second-init/premier-ticket.ts";
import { planDuSecond } from "../../src/second/lancement.ts";
import { DEPOT, fauxGh, repertoireTemporaire } from "../outils.ts";

const LOCAL = "# Projet\n";
const MERGE = "# Projet\n\n## Équipe multi-agents (plugin brigade)\n\n- **Branche d'intégration** : `main`\n";
const enBase64 = (texte: string) => Buffer.from(texte, "utf8").toString("base64");

function depot(t: TestContext, claudeMd: string): Repo {
  const dir = repertoireTemporaire(t);
  writeFileSync(join(dir, "CLAUDE.md"), claudeMd);
  return { dir, github: DEPOT };
}

// Un GitHub où les labels des rôles sont posés, et où la branche d'intégration
// tient `base` comme `CLAUDE.md` (null : elle n'en a pas), ou rend `statut`.
function github(base: string | null, statut?: number) {
  const lus: RequeteGitHub[] = [];
  const client: ClientGitHub = async (requete) => {
    lus.push(requete);
    if (requete.methode !== "GET") return { statut: 201, corps: {}, scopes: null };
    if (requete.chemin.includes("/contents/")) {
      if (statut !== undefined) return { statut, corps: { message: "Server Error" }, scopes: null };
      return base === null ? { statut: 404, corps: { message: "Not Found" }, scopes: null } : { statut: 200, corps: { content: enBase64(base), encoding: "base64" }, scopes: null };
    }
    if (requete.chemin.includes("/labels?")) return { statut: 200, corps: ETIQUETTES, scopes: null };
    return { statut: 200, corps: {}, scopes: null };
  };
  return { client, lus };
}

test("la PR de la mise en place mergée, la lecture qui suit dit le projet prêt, même si la copie locale ne l'a pas tirée", async (t) => {
  const repo = depot(t, LOCAL);
  assert.deepEqual(await checkRepoSetup(repo, github(null).client), { ready: false, missingBindings: true, missingLabels: [] }, "avant le merge");
  assert.deepEqual(await checkRepoSetup(repo, github(MERGE).client), { ready: true, missingBindings: false, missingLabels: [] }, "après le merge");
  // La branche d'intégration de la copie est celle qu'on lit.
  const gh = github(MERGE);
  await checkRepoSetup({ ...repo, branch: "develop" }, gh.client);
  assert.ok(gh.lus.some(({ chemin }) => chemin === `repos/${DEPOT}/contents/CLAUDE.md?ref=develop`), JSON.stringify(gh.lus));
  // Le geste rejoué sur un projet prêt n'écrit pas une seconde section dans la copie locale.
  assert.equal((await runRepoSetup(repo, github(MERGE).client)).ready, true);
  assert.equal(readFileSync(join(repo.dir, "CLAUDE.md"), "utf8"), LOCAL);
});

test("une copie locale qui porte déjà la section ne coûte aucune lecture de la branche d'intégration", async (t) => {
  const gh = github(null);
  assert.equal((await checkRepoSetup(depot(t, MERGE), gh.client)).ready, true);
  assert.ok(gh.lus.every(({ chemin }) => !chemin.includes("/contents/")), JSON.stringify(gh.lus));
});

test("un `CLAUDE.md` de la branche d'intégration que GitHub ne rend pas : le constat le dit en une phrase, il ne décide pas « pas prêt »", async (t) => {
  await assert.rejects(checkRepoSetup(depot(t, LOCAL), github(null, 500).client), { message: `GitHub did not let the \`CLAUDE.md\` of the default branch of ${DEPOT} be read (HTTP 500).` });
  await assert.rejects(claudeMdDeLaBase(async () => ({ statut: 200, corps: {}, scopes: null }), { github: DEPOT, branch: "main" }), { message: `GitHub did not let the \`CLAUDE.md\` of the branch \`main\` of ${DEPOT} be read (HTTP 200).` });
  const injoignable: ClientGitHub = async () => {
    throw new Error("`gh` est introuvable");
  };
  await assert.rejects(claudeMdDeLaBase(injoignable, { github: DEPOT }), { message: `GitHub could not be reached to read the \`CLAUDE.md\` of the default branch of ${DEPOT} (\`gh\` est introuvable).` });
});

test("`installation repo --json`, sur le `gh` du service, dit prêt le projet dont la PR est mergée", async (t) => {
  const { dir } = depot(t, LOCAL);
  const gh = fauxGh(t);
  for (const { name } of LABELS_DES_ROLES) gh.repondre(`repos/${DEPOT}/labels/${encodeURIComponent(name)}`, { corps: {} });
  gh.repondre(`repos/${DEPOT}/contents/CLAUDE.md`, { corps: { content: enBase64(MERGE), encoding: "base64" } });
  const cli = join(import.meta.dirname, "../../src/installation-cli.ts");
  const { code, sortie } = await new Promise<{ code: number | null; sortie: string }>((resoudre) => {
    execFile(process.execPath, [cli, "repo", "--json"], { env: { ...process.env, BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_REPO_DIR: dir, BRIGADE_GH_BIN: gh.bin } }, (erreur, stdout) =>
      resoudre({ code: erreur === null ? 0 : typeof erreur.code === "number" ? erreur.code : null, sortie: stdout }),
    );
  });
  assert.deepEqual(JSON.parse(sortie), { ready: true, missingBindings: false, missingLabels: [] });
  assert.equal(code, 0);
});

const fichiers = (...chemins: string[]) => {
  const tous = new Set(chemins);
  return (chemin: string) => tous.has(chemin);
};

test("lancé sur un dépôt pas préparé, le second sait qu'une fois prêt il propose un premier ticket, l'écrit avec le chef et le crée sur le rail", (t) => {
  const dossier = repertoireTemporaire(t);
  mkdirSync(join(dossier, ".git"));
  writeFileSync(join(dossier, "CLAUDE.md"), LOCAL);
  const plan = planDuSecond({
    plateforme: "linux",
    env: { PATH: "/usr/bin" },
    maison: "/home/chef",
    existe: fichiers("/usr/bin/claude", "/usr/bin/gh", "/usr/bin/git"),
    folder: dossier,
    args: ["--append-system-prompt-file", "/app/src/second/role.md"],
  });
  assert.equal(plan.state, "ready", JSON.stringify(plan));
  const message = plan.state === "ready" ? (plan.launch.args.at(-1) ?? "") : "";
  assert.ok(message.includes(messageDuPremierTicket()), message);
  assert.doesNotMatch(message, /[\r\n]/);

  const premier = messageDuPremierTicket();
  // Le moment : le projet prêt, le rôle redonné après le merge.
  assert.match(premier, /merged the setup's pull request.*the project is then ready/);
  assert.match(premier, /offer the chef, in French, to fire a first ticket/);
  // Le dialogue : ce que le chef veut, puis un titre et des critères observables, relus avec lui.
  assert.match(premier, /ask what they want done/);
  assert.match(premier, /draft a short title and two to five observable acceptance criteria/);
  assert.match(premier, /show them the draft/);
  // La création : le geste prévu du second, ses labels, son corps.
  assert.ok(premier.includes(`\`gh issue create --title <title> --body <body> ${LABELS_DU_PREMIER_TICKET.map((label) => `--label ${label}`).join(" ")}\``), premier);
  for (const section of SECTIONS_DU_PREMIER_TICKET) assert.ok(premier.includes(`\`${section}\``), section);
  assert.match(premier, /no model or effort/);
  assert.match(premier, /watch it cook in the app's board/);
});

test("le premier ticket porte `fire`, le label que le rail prend, et seulement des labels que la mise en place pose", () => {
  assert.ok((LABELS_DU_PREMIER_TICKET as readonly string[]).includes(LABEL));
  const poses = new Set(ETIQUETTES.map(({ name }) => name));
  for (const label of LABELS_DU_PREMIER_TICKET) assert.ok(poses.has(label), label);
});
