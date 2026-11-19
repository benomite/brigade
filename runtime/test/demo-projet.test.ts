// Le projet de démo du premier lancement (#3734, né projet d'essai, #3227) : l'instant du premier
// lancement noté une fois, la durée jusqu'au premier merge, le dépôt privé créé avec trois tickets
// prêts à cuire, le service lu sur GitHub, et la suppression qui n'atteint que le dépôt noté — GitHub
// doublé en mémoire.
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { brancheDuTicket } from "../src/brigade-github.ts";
import { checkRepoSetup } from "../src/depot-prepare/preparation.ts";
import { ETIQUETTES } from "../src/etiquettes.ts";
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
  TICKETS,
} from "../src/demo/projet-de-demo.ts";
import type { ClientGitHub, RequeteGitHub, ReponseGitHub } from "../src/proteger-branche.ts";
import { LABELS_DU_PREMIER_TICKET } from "../src/second-init/premier-ticket.ts";
import { repertoireTemporaire, temporaireDuFichier } from "./outils.ts";

const rienNeReste = temporaireDuFichier();

const LANCEMENT = new Date("2026-11-11T10:00:00.000Z");
const CREATION = new Date("2026-11-11T10:01:00.000Z");
const DEPOT = "chef/brigade-demo";

// Un GitHub où chaque requête est notée, et rendue par `repondre` — ou par celui d'un compte ordinaire, qui crée.
function github(repondre: (requete: RequeteGitHub) => Partial<ReponseGitHub> | undefined = () => undefined) {
  const appels: RequeteGitHub[] = [];
  // Les numéros des issues, par dépôt : 1, 2, 3…
  const numeros = new Map<string, number>();
  const client: ClientGitHub = async (requete) => {
    appels.push(requete);
    const dicte = repondre(requete);
    if (dicte !== undefined) return { statut: 200, corps: null, scopes: null, ...dicte };
    if (requete.methode === "POST" && requete.chemin === "user/repos") {
      const { name } = requete.corps as { name: string };
      return { statut: 201, corps: { full_name: `chef/${name}`, html_url: `https://github.com/chef/${name}`, default_branch: "main" }, scopes: null };
    }
    if (requete.methode === "PUT") return { statut: 201, corps: {}, scopes: null };
    if (requete.methode === "POST" && requete.chemin.endsWith("/issues")) {
      const depot = requete.chemin.slice("repos/".length, -"/issues".length);
      const numero = (numeros.get(depot) ?? 0) + 1;
      numeros.set(depot, numero);
      return { statut: 201, corps: { number: numero, html_url: `https://github.com/${depot}/issues/${numero}` }, scopes: null };
    }
    // Les PR fermées d'une branche : aucune, tant qu'on n'en dicte pas.
    if (requete.methode === "GET" && requete.chemin.includes("/pulls?")) return { statut: 200, corps: [], scopes: null };
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

test("créer le projet de démo : un dépôt privé, le projet minimal sur sa branche, et trois tickets ouverts prêts à cuire, chacun noté", async (t: TestContext) => {
  const dossier = repertoireTemporaire(t);
  noterLePremierLancement(dossier, LANCEMENT);
  const { client, appels } = github();
  const cree = await creerLeProjetDEssai(client, dossier, CREATION);
  const attendu = { repository: DEPOT, url: `https://github.com/${DEPOT}`, base: "main", createdAt: CREATION.toISOString(), ticket: 1, ticketUrl: `https://github.com/${DEPOT}/issues/1`, tickets: [1, 2, 3] };
  assert.deepEqual(cree, { sample: attendu });
  assert.deepEqual(appels[0], { methode: "POST", chemin: "user/repos", corps: { name: "brigade-demo", private: true, auto_init: true, description: "A demo project Brigade created to try a kitchen on: 3 tickets ready to cook." } });
  assert.deepEqual(
    appels.slice(1, -TICKETS.length).map(({ methode, chemin, corps }) => [methode, chemin, (corps as { branch: string }).branch]),
    fichiersDuProjet("main").map(({ chemin }) => ["PUT", `repos/${DEPOT}/contents/${chemin}`, "main"]),
  );
  const issues = appels.filter(({ chemin }) => chemin.endsWith("/issues"));
  assert.ok(TICKETS.length >= 3);
  assert.deepEqual(issues, TICKETS.map((ticket) => ({ methode: "POST", chemin: `repos/${DEPOT}/issues`, corps: { ...ticket, labels: [...LABELS_DU_PREMIER_TICKET] } })));
  assert.equal(new Set(TICKETS.map(({ title }) => title)).size, TICKETS.length, "trois tickets différents");
  assert.ok(LABELS_DU_PREMIER_TICKET.includes("fire" as never), "les tickets sont sur le rail");
  // Rien d'autre que le dépôt créé : aucun autre dépôt du compte n'est ni lu ni écrit.
  assert.deepEqual(appels.slice(1).filter(({ chemin }) => !chemin.startsWith(`repos/${DEPOT}/`)), []);
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
    if (requete.chemin === "user/repos" && (requete.corps as { name: string }).name === "brigade-demo") return { statut: 422, corps: { message: "name already exists on this account" } };
    if (requete.chemin.endsWith("/issues") && ticketRefuse) return { statut: 410, corps: { message: "Issues are disabled for this repo" } };
    return undefined;
  });
  const rate = await creerLeProjetDEssai(client, dossier, CREATION);
  assert.deepEqual(rate, { refus: "GitHub refused to create the tickets of chef/brigade-demo-2 (HTTP 410: Issues are disabled for this repo)." });
  assert.equal(lu(dossier).sample.repository, "chef/brigade-demo-2", "noté dès qu'il existe : c'est lui que la suppression atteint");
  ticketRefuse = false;
  const reprise = await creerLeProjetDEssai(client, dossier, new Date());
  assert.ok("sample" in reprise && reprise.sample.repository === "chef/brigade-demo-2" && reprise.sample.ticket === 1, JSON.stringify(reprise));
  assert.equal(appels.filter(({ chemin }) => chemin === "user/repos").length, 2, "aucun troisième dépôt");
});

test("un des trois tickets refusé : ceux déjà créés restent notés, et le clic suivant crée seulement ceux qui manquent", async (t: TestContext) => {
  const dossier = repertoireTemporaire(t);
  let refuse = true;
  let issues = 0;
  const { client, appels } = github((requete) => {
    if (requete.methode !== "POST" || !requete.chemin.endsWith("/issues")) return undefined;
    issues++;
    return issues === 2 && refuse ? { statut: 502, corps: { message: "Bad Gateway" } } : undefined;
  });
  const rate = await creerLeProjetDEssai(client, dossier, CREATION);
  assert.deepEqual(rate, { refus: `GitHub refused to create the tickets of ${DEPOT} (HTTP 502: Bad Gateway).` });
  assert.deepEqual(lu(dossier).sample.tickets, [1], "le premier ticket est noté dès sa création");
  refuse = false;
  const reprise = await creerLeProjetDEssai(client, dossier, new Date());
  assert.ok("sample" in reprise && reprise.sample.tickets?.length === 3 && reprise.sample.ticket === 1, JSON.stringify(reprise));
  const titres = appels.filter(({ chemin }) => chemin.endsWith("/issues")).map(({ corps }) => (corps as { title: string }).title);
  assert.deepEqual(titres, [TICKETS[0]?.title, TICKETS[1]?.title, TICKETS[1]?.title, TICKETS[2]?.title], "le premier ticket n'est pas recréé");
  assert.equal(appels.filter(({ chemin }) => chemin === "user/repos").length, 1, "aucun second dépôt");
});

test("un projet d'essai noté avant la démo, à un seul ticket : rendu tel quel, sans ticket ajouté", async (t: TestContext) => {
  const dossier = repertoireTemporaire(t);
  const ancien = { repository: "chef/brigade-sample", url: "https://github.com/chef/brigade-sample", base: "main", createdAt: CREATION.toISOString(), ticket: 1, ticketUrl: "https://github.com/chef/brigade-sample/issues/1" };
  writeFileSync(join(dossier, FICHIER), JSON.stringify({ sample: ancien }));
  const { client, appels } = github();
  assert.deepEqual(await creerLeProjetDEssai(client, dossier, new Date()), { sample: ancien });
  assert.deepEqual(appels, []);
});

test("le service de la démo : le premier ticket mergé, quel qu'il soit, chacune des branches de ses tickets lue", async (t: TestContext) => {
  const dossier = repertoireTemporaire(t);
  noterLePremierLancement(dossier, LANCEMENT);
  await creerLeProjetDEssai(github().client, dossier, CREATION);
  const pulls = (ticket: number) => `repos/${DEPOT}/pulls?head=chef:${brancheDuTicket(ticket)}&state=closed&per_page=10`;
  const { client, appels } = github(({ chemin }) =>
    chemin === pulls(3) ? { corps: [{ merged_at: "2026-11-11T10:05:00Z", html_url: `https://github.com/${DEPOT}/pull/4` }] } : chemin === pulls(2) ? { corps: [{ merged_at: "2026-11-11T10:09:00Z", html_url: `https://github.com/${DEPOT}/pull/5` }] } : undefined,
  );
  const vu = await suivreLeProjetDEssai(client, dossier);
  assert.deepEqual(appels.map(({ chemin }) => chemin), [pulls(1), pulls(2), pulls(3)]);
  assert.equal(vu.served, "Your first ticket was served in 5 minutes.");
  assert.equal(vu.sample?.pullRequest, `https://github.com/${DEPOT}/pull/4`);
});

test("GitHub injoignable à la création : une phrase, et rien de noté", async (t: TestContext) => {
  const dossier = repertoireTemporaire(t);
  const client: ClientGitHub = async () => {
    throw new Error("`gh` est introuvable");
  };
  assert.deepEqual(await creerLeProjetDEssai(client, dossier, CREATION), { refus: "GitHub could not be reached to create the demo repository (`gh` est introuvable)." });
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
  assert.deepEqual(await supprimerLeProjetDEssai(client, dossier, DEPOT, new Date()), { refus: "Brigade has no demo repository left to delete." });
  await creerLeProjetDEssai(client, dossier, CREATION);
  appels.length = 0;
  for (const autre of ["chef/brigade", "chef/brigade-demo-2", "CHEF/brigade-demo", `${DEPOT}/`, "", undefined, 7]) {
    assert.deepEqual(await supprimerLeProjetDEssai(client, dossier, autre, new Date()), { refus: `Brigade only deletes the demo repository it created, ${DEPOT}.` }, String(autre));
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
  assert.deepEqual(await supprimerLeProjetDEssai(avecDroit.client, dossier, DEPOT, new Date()), { refus: "Brigade has no demo repository left to delete." });
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

test("un projet noté sans son dépôt, son adresse, sa branche ou sa date de création n'est pas un projet de démo : il le dit", (t: TestContext) => {
  const complet = { repository: DEPOT, url: `https://github.com/${DEPOT}`, base: "main", createdAt: CREATION.toISOString() };
  for (const manque of ["repository", "url", "base", "createdAt"] as const) {
    const dossier = repertoireTemporaire(t);
    const { [manque]: _, ...sample } = complet;
    writeFileSync(join(dossier, FICHIER), JSON.stringify({ sample }));
    const lecture = lireLEnregistrement(dossier);
    assert.ok("illisible" in lecture && lecture.illisible.includes("is not a demo project"), `${manque} : ${JSON.stringify(lecture)}`);
  }
});

test("une PR fermée dont la date de merge ne se lit pas n'est pas un ticket servi", async (t: TestContext) => {
  const dossier = repertoireTemporaire(t);
  noterLePremierLancement(dossier, LANCEMENT);
  await creerLeProjetDEssai(github().client, dossier, CREATION);
  const { client } = github(({ chemin }) => (chemin.includes("/pulls?") ? { corps: [{ merged_at: "not a date", html_url: `https://github.com/${DEPOT}/pull/2` }] } : undefined));
  const vu = await suivreLeProjetDEssai(client, dossier);
  assert.equal(vu.served, undefined);
  assert.equal(vu.sample?.servedAt, undefined);
  assert.equal(lu(dossier).sample.servedAt, undefined);
});

test("demo-projet.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
