// Le chef par défaut (#2928) : déclaré, sinon le propriétaire du dépôt quand
// c'est une personne, sinon l'auteur de la PR de `/brigade:init` ; chacun avec
// sa source, que `status` dit — et, sans chef, `status` dit pourquoi. Par le
// vrai client GitHub, sous un faux transport.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { entrerDansTodo } from "../../src/carte-todo.ts";
import { brancherLeChef, FICHIER_DU_CHEF, resolveurDuChef, resoudreLeChef, type GitHubDuChef } from "../../src/chef/chef.ts";
import { ouvrirGitHub, type Commentaire, type Transport } from "../../src/github.ts";
import { ouvrirLimitesDuCompte } from "../../src/github-limite.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { ouvrirLimite } from "../../src/limite-github.ts";
import { brancherMentionDuChef } from "../../src/mention-du-chef/mention-du-chef.ts";
import { demarrer, type CauseReveil, type Runtime } from "../../src/runtime.ts";
import { photoDuProjet } from "../../src/status.ts";
import { jusqua, JOUR_HORLOGE, repertoireTemporaire } from "../outils.ts";

const DEPOT = "o/r";
const COMMITS = `repos/${DEPOT}/commits?path=.claude%2Fbrigade%2Fgates.sh&per_page=100`;

const reponse = (statut: number, corps: unknown) => ({ erreur: null, stdout: `HTTP/2.0 ${statut} X\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(corps)}`, stderr: "" });

type Depot = { owner: { login: string; type: "User" | "Organization" }; commits?: string[]; pulls?: Record<string, unknown[]>; enPanne?: () => boolean };

// Le dépôt tel que GitHub le répond : son propriétaire, les commits qui ont
// touché aux gates (du plus récent au plus ancien), et les PR de chaque commit.
let rang = 0;
function client(depot: Depot) {
  const chemins: string[] = [];
  const transport: Transport = async (args) => {
    const chemin = args[args.length - 1] as string;
    chemins.push(chemin);
    if (depot.enPanne?.()) return reponse(502, { message: "Bad Gateway" });
    if (chemin === `repos/${DEPOT}`) return reponse(200, { full_name: DEPOT, owner: depot.owner });
    if (chemin === COMMITS) return reponse(200, (depot.commits ?? []).map((sha) => ({ sha })));
    const pulls = /^repos\/o\/r\/commits\/([^/]+)\/pulls$/.exec(chemin);
    if (pulls) return reponse(200, depot.pulls?.[pulls[1] as string] ?? []);
    return reponse(404, { message: "Not Found" });
  };
  const github = ouvrirGitHub({ depot: DEPOT, bin: `faux-gh-2928-${rang++}`, transport, limite: ouvrirLimite(), limitesDuCompte: ouvrirLimitesDuCompte() });
  return { github, chemins };
}

const PR = (numero: number, auteur: string, mergee = true) => ({ number: numero, html_url: "", state: "closed", merged_at: mergee ? "2026-10-01T00:00:00Z" : null, base: { ref: "main" }, head: { sha: "t" }, user: { login: auteur } });
const PERSONNE: Depot = { owner: { login: "benomite", type: "User" } };
const ORGANISATION: Depot = { owner: { login: "acme", type: "Organization" }, commits: ["recent", "init"], pulls: { recent: [PR(9, "bob")], init: [PR(3, "alice", false), PR(4, "carol")] } };

// Le répertoire d'état d'un projet que `status` lit.
function projet(t: TestContext) {
  const etat = repertoireTemporaire(t);
  demarrer({ repertoireEtat: etat, projet: "brigade" }).arreter("test");
  return { etat, env: { BRIGADE_STATE_DIR: etat, BRIGADE_PROJECT: "brigade", BRIGADE_REPO_DIR: repertoireTemporaire(t) } };
}
const ligneDuChef = (env: Record<string, string>) => photoDuProjet(env).find((ligne) => ligne.startsWith("chef "));

test("chef déclaré : il est rendu avec la source `declared`, sans rien lire de GitHub, et `status` le dit", async (t) => {
  const { github, chemins } = client(PERSONNE);
  assert.deepEqual(await resoudreLeChef(" lea ", github), { login: "lea", source: "declared" });
  const { etat, env } = projet(t);
  assert.deepEqual(await resolveurDuChef({ github, declare: () => "lea", repertoireEtat: etat }).resoudre(), { login: "lea", source: "declared" });
  assert.deepEqual(chemins, []);
  assert.equal(ligneDuChef(env), "chef        lea (declared)");
});

test("sans chef, un dépôt à une personne : son propriétaire, source `repo owner`, et `status` le dit", async (t) => {
  const { github } = client(PERSONNE);
  assert.deepEqual(await resoudreLeChef(undefined, github), { login: "benomite", source: "repo owner" });
  const { etat, env } = projet(t);
  await resolveurDuChef({ github, declare: () => "  ", repertoireEtat: etat }).resoudre();
  assert.equal(ligneDuChef(env), "chef        benomite (repo owner)");
});

test("sans chef, un dépôt à une organisation : l'auteur de la PR mergée qui a posé les gates, source `set up by`", async (t) => {
  const { github } = client(ORGANISATION);
  assert.deepEqual(await resoudreLeChef(null, github), { login: "carol", source: "set up by" });
  const { etat, env } = projet(t);
  await resolveurDuChef({ github, declare: () => undefined, repertoireEtat: etat }).resoudre();
  assert.equal(ligneDuChef(env), "chef        carol (set up by)");
});

test("une organisation sans PR d'init — gates jamais posées, ou poussées sans PR mergée : pas de chef, et `status` dit pourquoi", async (t) => {
  for (const depot of [{ ...ORGANISATION, commits: [] }, { ...ORGANISATION, pulls: { recent: [PR(9, "bob")], init: [PR(3, "alice", false)] } }]) {
    const { github } = client(depot);
    const resolu = await resoudreLeChef(undefined, github);
    assert.equal(resolu.login, null);
    const { etat, env } = projet(t);
    await resolveurDuChef({ github, declare: () => undefined, repertoireEtat: etat }).resoudre();
    assert.match(ligneDuChef(env) ?? "", /^chef {8}none resolved — no `chef` declared, the repo belongs to the organization acme, and no merged `\/brigade:init` PR was found: set `chef`/);
  }
});

test("`status` sans chef résolu par la cuisine, ou avec un fichier illisible : il le dit, sans tomber", (t) => {
  const { etat, env } = projet(t);
  assert.equal(ligneDuChef(env), "chef        not resolved yet — the kitchen resolves it when it runs");
  writeFileSync(join(etat, FICHIER_DU_CHEF), "{pas du json");
  assert.equal(ligneDuChef(env), "chef        unreadable — chef.json is not a resolved chef");
  writeFileSync(join(etat, FICHIER_DU_CHEF), JSON.stringify({ login: "x", source: "invented" }));
  assert.equal(ligneDuChef(env), "chef        unreadable — chef.json is not a resolved chef");
});

test("GitHub en panne : pas de chef inventé — la raison est dite, une fois ; après un chef résolu, il est gardé", async (t) => {
  let panne = true;
  let heure = 0;
  const { github } = client({ ...PERSONNE, enPanne: () => panne });
  const dits: string[] = [];
  const { etat, env } = projet(t);
  const resolveur = resolveurDuChef({ github, declare: () => undefined, repertoireEtat: etat, avertir: (ligne) => dits.push(ligne), maintenant: () => heure });
  assert.equal((await resolveur.resoudre()).login, null);
  await resolveur.resoudre();
  assert.equal(dits.length, 1);
  assert.match(dits[0] ?? "", /chef is not resolved from GitHub/);
  assert.match(ligneDuChef(env) ?? "", /^chef {8}none resolved — no `chef` declared, and GitHub did not answer/);
  panne = false;
  assert.equal((await resolveur.resoudre()).login, "benomite");
  // Une heure plus tard, GitHub relu et en panne : le chef d'avant tient.
  panne = true;
  heure = 3_600_000;
  assert.deepEqual(await resolveur.resoudre(), { login: "benomite", source: "repo owner" });
  assert.equal(ligneDuChef(env), "chef        benomite (repo owner)");
});

test("des réglages illisibles : pas de chef, et `status` dit pourquoi", async (t) => {
  const { github } = client(PERSONNE);
  const { etat, env } = projet(t);
  const resolu = await resolveurDuChef({ github, declare: () => assert.fail("projet.json: invalid"), repertoireEtat: etat }).resoudre();
  assert.equal(resolu.login, null);
  assert.match(ligneDuChef(env) ?? "", /^chef {8}none resolved — the project settings do not read: projet\.json: invalid/);
});

test("branché au runtime, sans `chef` déclaré : la carte de TODO mentionne le chef résolu, et `status` le dit dès le démarrage", async (t) => {
  const { etat, env } = projet(t);
  const journal = ouvrirJournal(etat, { maintenant: () => new Date(`${JOUR_HORLOGE}T10:00:00.000Z`) });
  t.after(() => journal.fermer());
  const ecouteurs: Array<(cause: CauseReveil) => void> = [];
  const runtime: Runtime = { projet: "brigade", journal, surReveil: (ecouter) => (ecouteurs.push(ecouter), () => {}), arreter: () => {} };
  const { github } = client(ORGANISATION);
  const postes: Array<{ numero: number; corps: string }> = [];
  const commentaires: Commentaire[] = [];
  const mention = { commentaires: async () => [...commentaires], commenter: async (numero: number, corps: string) => void postes.push({ numero, corps }) };
  const { chef } = brancherLeChef(runtime, { github: github satisfies GitHubDuChef, declare: () => undefined, repertoireEtat: etat });
  brancherMentionDuChef(runtime, { github: mention, chef });
  await jusqua(() => ligneDuChef(env) === "chef        carol (set up by)");
  entrerDansTodo(journal, "brigade", 12, { type: "product", resume: "A choice.", enonce: "One list or two?", choix: [{ texte: "One." }, { texte: "Two." }] }, "manager");
  for (const ecouter of ecouteurs) ecouter("tick");
  await jusqua(() => postes.length === 1);
  assert.equal(postes[0]?.corps.split("\n")[1], "@carol One list or two?");
});
