// Le projet d'essai du premier lancement (#3227) : l'instant du premier lancement noté une fois, la
// durée jusqu'au premier merge, le dépôt privé créé avec un seul ticket prêt à cuire, le service lu
// sur GitHub, et la suppression qui n'atteint que le dépôt noté — GitHub doublé en mémoire.
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { brancheDuTicket } from "../../src/brigade-github.ts";
import { checkRepoSetup } from "../../src/depot-prepare/preparation.ts";
import { ETIQUETTES } from "../../src/etiquettes.ts";
import {
  creerLeProjetDEssai,
  dureeDuPremierService,
  FICHIER,
  fichiersDuProjet,
  lireLEnregistrement,
  messageDuService,
  noterLePremierLancement,
  suivreLeProjetDEssai,
  supprimerLeProjetDEssai,
  TICKET,
} from "../../src/essai-projet/projet-d-essai.ts";
import type { ClientGitHub, RequeteGitHub, ReponseGitHub } from "../../src/proteger-branche.ts";
import { LABELS_DU_PREMIER_TICKET } from "../../src/second-init/premier-ticket.ts";
import { repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

const LANCEMENT = new Date("2026-11-11T10:00:00.000Z");
const CREATION = new Date("2026-11-11T10:01:00.000Z");
const DEPOT = "chef/brigade-sample";

// Un GitHub où chaque requête est notée, et rendue par `repondre` — ou par celui d'un compte ordinaire, qui crée.
function github(repondre: (requete: RequeteGitHub) => Partial<ReponseGitHub> | undefined = () => undefined) {
  const appels: RequeteGitHub[] = [];
  const client: ClientGitHub = async (requete) => {
    appels.push(requete);
    const dicte = repondre(requete);
    if (dicte !== undefined) return { statut: 200, corps: null, scopes: null, ...dicte };
    if (requete.methode === "POST" && requete.chemin === "user/repos") {
      const { name } = requete.corps as { name: string };
      return { statut: 201, corps: { full_name: `chef/${name}`, html_url: `https://github.com/chef/${name}`, default_branch: "main" }, scopes: null };
    }
    if (requete.methode === "PUT") return { statut: 201, corps: {}, scopes: null };
    if (requete.methode === "POST" && requete.chemin.endsWith("/issues")) return { statut: 201, corps: { number: 1, html_url: `https://github.com/${requete.chemin.slice("repos/".length, -"/issues".length)}/issues/1` }, scopes: null };
    return { statut: 404, corps: { message: "Not Found" }, scopes: null };
  };
  return { client, appels };
}

const lu = (dossier: string) => JSON.parse(readFileSync(join(dossier, FICHIER), "utf8")) as Record<string, any>;

test("l'instant du premier lancement est noté une fois : un second lancement ne le change pas", (t: TestContext) => {
  const dossier = repertoireTemporaire(t);
  assert.deepEqual(noterLePremierLancement(dossier, LANCEMENT), { enregistrement: { firstLaunch: LANCEMENT.toISOString() } });
  assert.deepEqual(noterLePremierLancement(dossier, new Date("2026-11-12T08:00:00.000Z")), { enregistrement: { firstLaunch: LANCEMENT.toISOString() } });
  assert.equal(lu(dossier).firstLaunch, LANCEMENT.toISOString());
});

test("un fichier illisible n'est ni lu vide ni écrasé : il le dit, et rien ne s'écrit", async (t: TestContext) => {
  const dossier = repertoireTemporaire(t);
  writeFileSync(join(dossier, FICHIER), "{ pas du json");
  const premier = noterLePremierLancement(dossier, LANCEMENT);
  assert.ok("illisible" in premier && premier.illisible.includes(FICHIER), JSON.stringify(premier));
  const { client, appels } = github();
  const cree = await creerLeProjetDEssai(client, dossier, CREATION);
  assert.ok("refus" in cree && cree.refus.includes("cannot be read"), JSON.stringify(cree));
  assert.deepEqual(appels, [], "aucun dépôt créé sur un fichier qu'on ne sait pas relire");
  assert.ok("illisible" in (await suivreLeProjetDEssai(client, dossier)));
  assert.equal(readFileSync(join(dossier, FICHIER), "utf8"), "{ pas du json");
});

test("la durée du premier service : les minutes entre le premier lancement et le merge, et rien d'inventé", () => {
  assert.equal(dureeDuPremierService("2026-11-11T10:00:00.000Z", "2026-11-11T10:08:00.000Z"), 8);
  assert.equal(dureeDuPremierService("2026-11-11T10:00:00.000Z", "2026-11-11T10:08:29.000Z"), 8);
  assert.equal(dureeDuPremierService("2026-11-11T10:00:00.000Z", "2026-11-11T10:08:31.000Z"), 9);
  assert.equal(dureeDuPremierService("2026-11-11T10:00:00.000Z", "2026-11-11T12:05:00.000Z"), 125);
  // Moins d'une minute se dit « 1 minute », jamais « 0 ».
  assert.equal(dureeDuPremierService("2026-11-11T10:00:00.000Z", "2026-11-11T10:00:10.000Z"), 1);
  assert.equal(dureeDuPremierService("pas une date", "2026-11-11T10:08:00.000Z"), undefined);
  assert.equal(dureeDuPremierService("2026-11-11T10:08:00.000Z", "2026-11-11T10:00:00.000Z"), undefined);
  assert.equal(messageDuService(8), "Your first ticket was served in 8 minutes.");
  assert.equal(messageDuService(1), "Your first ticket was served in 1 minute.");
});

test("créer le projet d'essai : un dépôt privé, le projet minimal sur sa branche, et exactement un ticket ouvert prêt à cuire", async (t: TestContext) => {
  const dossier = repertoireTemporaire(t);
  noterLePremierLancement(dossier, LANCEMENT);
  const { client, appels } = github();
  const cree = await creerLeProjetDEssai(client, dossier, CREATION);
  const attendu = { repository: DEPOT, url: `https://github.com/${DEPOT}`, base: "main", createdAt: CREATION.toISOString(), ticket: 1, ticketUrl: `https://github.com/${DEPOT}/issues/1` };
  assert.deepEqual(cree, { sample: attendu });
  assert.deepEqual(appels[0], { methode: "POST", chemin: "user/repos", corps: { name: "brigade-sample", private: true, auto_init: true, description: "A sample project Brigade created to try a kitchen on." } });
  assert.deepEqual(
    appels.slice(1, -1).map(({ methode, chemin, corps }) => [methode, chemin, (corps as { branch: string }).branch]),
    fichiersDuProjet("main").map(({ chemin }) => ["PUT", `repos/${DEPOT}/contents/${chemin}`, "main"]),
  );
  const issues = appels.filter(({ chemin }) => chemin.endsWith("/issues"));
  assert.deepEqual(issues, [{ methode: "POST", chemin: `repos/${DEPOT}/issues`, corps: { ...TICKET, labels: [...LABELS_DU_PREMIER_TICKET] } }]);
  assert.ok(LABELS_DU_PREMIER_TICKET.includes("fire" as never), "le ticket est sur le rail");
  // Noté : le premier lancement reste, le dépôt s'y ajoute.
  assert.deepEqual(lu(dossier), { firstLaunch: LANCEMENT.toISOString(), sample: attendu });
  // Recliqué : le même dépôt, sans rien recréer.
  assert.deepEqual(await creerLeProjetDEssai(client, dossier, new Date()), { sample: attendu });
  assert.equal(appels.filter(({ chemin }) => chemin === "user/repos").length, 1);
});

test("le projet créé est prêt pour la cuisine : sa section de bindings sur la branche, les labels des rôles une fois la mise en place jouée", async (t: TestContext) => {
  const dir = repertoireTemporaire(t);
  const claudeMd = fichiersDuProjet("main").find(({ chemin }) => chemin === "CLAUDE.md")?.contenu ?? "";
  writeFileSync(join(dir, "CLAUDE.md"), claudeMd);
  const labels: ClientGitHub = async ({ chemin }) => (chemin.includes("/labels/") ? { statut: ETIQUETTES.some(({ name }) => chemin.endsWith(`/${encodeURIComponent(name)}`)) ? 200 : 404, corps: {}, scopes: null } : { statut: 404, corps: {}, scopes: null });
  assert.deepEqual(await checkRepoSetup({ dir, github: DEPOT, branch: "main" }, labels), { ready: true, missingBindings: false, missingLabels: [] });
});

test("un nom déjà pris sur le compte : le suivant ; un ticket refusé : le dépôt reste noté, et le clic suivant le reprend", async (t: TestContext) => {
  const dossier = repertoireTemporaire(t);
  let ticketRefuse = true;
  const { client, appels } = github((requete) => {
    if (requete.chemin === "user/repos" && (requete.corps as { name: string }).name === "brigade-sample") return { statut: 422, corps: { message: "name already exists on this account" } };
    if (requete.chemin.endsWith("/issues") && ticketRefuse) return { statut: 410, corps: { message: "Issues are disabled for this repo" } };
    return undefined;
  });
  const rate = await creerLeProjetDEssai(client, dossier, CREATION);
  assert.deepEqual(rate, { refus: "GitHub refused to create the ticket of chef/brigade-sample-2 (HTTP 410: Issues are disabled for this repo)." });
  assert.equal(lu(dossier).sample.repository, "chef/brigade-sample-2", "noté dès qu'il existe : c'est lui que la suppression atteint");
  ticketRefuse = false;
  const reprise = await creerLeProjetDEssai(client, dossier, new Date());
  assert.ok("sample" in reprise && reprise.sample.repository === "chef/brigade-sample-2" && reprise.sample.ticket === 1, JSON.stringify(reprise));
  assert.equal(appels.filter(({ chemin }) => chemin === "user/repos").length, 2, "aucun troisième dépôt");
});

test("GitHub injoignable à la création : une phrase, et rien de noté", async (t: TestContext) => {
  const dossier = repertoireTemporaire(t);
  const client: ClientGitHub = async () => {
    throw new Error("`gh` est introuvable");
  };
  assert.deepEqual(await creerLeProjetDEssai(client, dossier, CREATION), { refus: "GitHub could not be reached to create the sample repository (`gh` est introuvable)." });
  assert.equal(existsSync(join(dossier, FICHIER)), false);
});

test("le service : rien tant que la PR de la branche du ticket n'est pas mergée ; mergée, la durée depuis le premier lancement, notée une fois", async (t: TestContext) => {
  const dossier = repertoireTemporaire(t);
  noterLePremierLancement(dossier, LANCEMENT);
  await creerLeProjetDEssai(github().client, dossier, CREATION);
  const pulls = `repos/${DEPOT}/pulls?head=chef:${brancheDuTicket(1)}&state=closed&per_page=10`;
  let mergee = false;
  const { client, appels } = github(({ chemin }) => (chemin === pulls ? { corps: mergee ? [{ merged_at: null, html_url: "x" }, { merged_at: "2026-11-11T10:08:00Z", html_url: `https://github.com/${DEPOT}/pull/2` }] : [{ merged_at: null }] } : undefined));
  const avant = await suivreLeProjetDEssai(client, dossier);
  assert.equal(avant.served, undefined);
  assert.equal(avant.sample?.servedAt, undefined);
  mergee = true;
  const apres = await suivreLeProjetDEssai(client, dossier);
  assert.equal(apres.served, "Your first ticket was served in 8 minutes.");
  assert.equal(apres.sample?.pullRequest, `https://github.com/${DEPOT}/pull/2`);
  assert.equal(lu(dossier).sample.servedAt, "2026-11-11T10:08:00Z");
  // Noté : GitHub n'est plus relu.
  const lus = appels.length;
  assert.equal((await suivreLeProjetDEssai(client, dossier)).served, "Your first ticket was served in 8 minutes.");
  assert.equal(appels.length, lus);
});

test("le service illisible sur GitHub : le projet reste montré, la lecture ratée se dit, rien n'est noté servi", async (t: TestContext) => {
  const dossier = repertoireTemporaire(t);
  noterLePremierLancement(dossier, LANCEMENT);
  await creerLeProjetDEssai(github().client, dossier, CREATION);
  const vu = await suivreLeProjetDEssai(github(({ chemin }) => (chemin.includes("/pulls?") ? { statut: 502, corps: { message: "Bad Gateway" } } : undefined)).client, dossier);
  assert.equal(vu.sample?.repository, DEPOT);
  assert.equal(vu.served, undefined);
  assert.equal(vu.lecture, `GitHub did not let the pull requests of ${DEPOT} be read (HTTP 502: Bad Gateway).`);
});

test("la suppression n'atteint que le dépôt noté : tout autre nom est refusé avant tout appel à GitHub", async (t: TestContext) => {
  const dossier = repertoireTemporaire(t);
  const { client, appels } = github(({ methode }) => (methode === "DELETE" ? { statut: 204 } : undefined));
  // Rien de noté : rien à supprimer, pas même un dépôt qui porte le nom d'essai.
  assert.deepEqual(await supprimerLeProjetDEssai(client, dossier, DEPOT, new Date()), { refus: "Brigade has no sample repository left to delete." });
  await creerLeProjetDEssai(client, dossier, CREATION);
  appels.length = 0;
  for (const autre of ["chef/brigade", "chef/brigade-sample-2", "CHEF/brigade-sample", `${DEPOT}/`, "", undefined, 7]) {
    assert.deepEqual(await supprimerLeProjetDEssai(client, dossier, autre, new Date()), { refus: `Brigade only deletes the sample repository it created, ${DEPOT}.` }, String(autre));
  }
  assert.deepEqual(appels, []);
  assert.equal(lu(dossier).sample.deletedAt, undefined);
});

test("supprimer sans la permission `delete_repo` : rien n'est supprimé ni noté, la permission est demandée ; accordée, un clic supprime, et plus rien n'est à supprimer", async (t: TestContext) => {
  const dossier = repertoireTemporaire(t);
  await creerLeProjetDEssai(github().client, dossier, CREATION);
  const sansDroit = github(({ methode }) => (methode === "DELETE" ? { statut: 403, corps: { message: "Must have admin rights to Repository." }, scopes: ["repo", "read:org", "gist"] } : undefined));
  assert.deepEqual(await supprimerLeProjetDEssai(sansDroit.client, dossier, DEPOT, new Date()), { permission: "delete_repo" });
  assert.equal(lu(dossier).sample.deletedAt, undefined);
  const avecDroit = github(({ methode }) => (methode === "DELETE" ? { statut: 204, scopes: ["repo", "delete_repo"] } : undefined));
  const fait = await supprimerLeProjetDEssai(avecDroit.client, dossier, DEPOT, new Date("2026-11-11T11:00:00.000Z"));
  assert.ok("supprime" in fait && fait.supprime.deletedAt === "2026-11-11T11:00:00.000Z", JSON.stringify(fait));
  assert.deepEqual(avecDroit.appels, [{ methode: "DELETE", chemin: `repos/${DEPOT}` }]);
  assert.equal(lu(dossier).sample.deletedAt, "2026-11-11T11:00:00.000Z");
  assert.deepEqual(await supprimerLeProjetDEssai(avecDroit.client, dossier, DEPOT, new Date()), { refus: "Brigade has no sample repository left to delete." });
  assert.equal(avecDroit.appels.length, 1);
  // Supprimé, le suivi ne relit plus GitHub.
  const lecture = github();
  assert.equal((await suivreLeProjetDEssai(lecture.client, dossier)).sample?.deletedAt, "2026-11-11T11:00:00.000Z");
  assert.deepEqual(lecture.appels, []);
});

test("supprimer un dépôt que GitHub ne connaît plus : noté supprimé ; un 404 alors que GitHub le connaît encore : refusé, rien de noté", async (t: TestContext) => {
  const dossier = repertoireTemporaire(t);
  await creerLeProjetDEssai(github().client, dossier, CREATION);
  const encoreLa = github(({ methode }) => (methode === "DELETE" ? { statut: 404, corps: { message: "Not Found" } } : { statut: 200, corps: { full_name: DEPOT } }));
  assert.deepEqual(await supprimerLeProjetDEssai(encoreLa.client, dossier, DEPOT, new Date()), { refus: `GitHub did not delete ${DEPOT} (HTTP 404: Not Found).` });
  assert.equal(lu(dossier).sample.deletedAt, undefined);
  const parti = github(({ methode }) => (methode === "DELETE" ? { statut: 404, corps: { message: "Not Found" } } : { statut: 404, corps: { message: "Not Found" } }));
  assert.ok("supprime" in (await supprimerLeProjetDEssai(parti.client, dossier, DEPOT, new Date())));
  const relu = lireLEnregistrement(dossier);
  assert.ok("enregistrement" in relu && relu.enregistrement.sample?.deletedAt !== undefined);
});

test("projet-d-essai.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
