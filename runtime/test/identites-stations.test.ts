// Les Apps des rôles rangées dans le répertoire de la station : ce que l'app y
// écrit, ce que la cuisine en lit, et ce qui ne sort jamais — la clé. Contre
// un faux GitHub local : ni réseau, ni vraie App.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { clientDuTour } from "../src/brigade-github.ts";
import { prendre } from "../src/github-etat/prise.ts";
import { masquerIdentifiants } from "../src/identifiants.ts";
import { appsRangees, principal, rangerApp, AppRefusee } from "../src/identites-stations.ts";
import { APPS_DE_LA_STATION, configIdentites, ouvrirGitHubs, ouvrirIdentites, repertoireDesApps, ROLES, type Role } from "../src/identites.ts";
import { masquerLaConsole } from "../src/jeton-claude.ts";
import { ConfigInvalide, demarrer } from "../src/runtime.ts";
import { sauvegarder } from "../src/sauvegarde.ts";
import { fauxGitHubApps, type FauxGitHubApps } from "./aides/faux-github-apps.ts";
import { appeler, DEPOT, fauxGh, horloge, issueGitHub, repertoireTemporaire } from "./outils.ts";
import { posixOnly } from "./support/plateforme.ts";

const POSIX = { skip: posixOnly("requires POSIX permissions") };

// Les lignes d'une clé, sans ses bornes : chacune suffit à la trahir.
const lignesDe = (pem: string) => pem.split("\n").filter((ligne) => ligne !== "" && !ligne.startsWith("-----"));
const sansCle = (texte: string, pem: string) => lignesDe(pem).every((ligne) => !texte.includes(ligne));

function station(t: TestContext): string {
  const racine = join(repertoireTemporaire(t), "station");
  mkdirSync(racine);
  return racine;
}

function rangerTout(racine: string, apps: FauxGitHubApps): void {
  for (const role of ROLES) rangerApp({ station: racine, role, id: apps.id(role), cle: apps.cle(role) });
}

const mode = (chemin: string) => statSync(chemin).mode & 0o777;

test("ranger une clé crée le répertoire des Apps en 700 et chaque fichier en 600", POSIX, async (t) => {
  const apps = await fauxGitHubApps(t);
  const racine = station(t);

  const rangee = rangerApp({ station: racine, role: "pass", id: apps.id("pass"), cle: apps.cle("pass") });

  assert.equal(rangee.repertoire, join(racine, APPS_DE_LA_STATION));
  assert.equal(mode(rangee.repertoire), 0o700);
  assert.equal(mode(join(rangee.repertoire, "pass.pem")), 0o600);
  assert.equal(mode(join(rangee.repertoire, "pass.id")), 0o600);
  assert.equal(readFileSync(join(rangee.repertoire, "pass.pem"), "utf8"), apps.cle("pass"));
  // Rien de provisoire ne reste à côté.
  assert.deepEqual(readdirSync(rangee.repertoire).sort(), ["pass.id", "pass.pem"]);

  // Remplacer une App garde ses droits, même sur un fichier qu'on aurait ouvert.
  chmodSync(join(rangee.repertoire, "pass.pem"), 0o644);
  rangerApp({ station: racine, role: "pass", id: apps.id("pass"), cle: apps.cle("pass") });
  assert.equal(mode(join(rangee.repertoire, "pass.pem")), 0o600);
});

test("un répertoire des Apps déjà là, ouvert à d'autres, est dit : rien n'y est écrit, et la cuisine refuse de le lire", POSIX, async (t) => {
  const apps = await fauxGitHubApps(t);
  const racine = station(t);
  rangerTout(racine, apps);
  chmodSync(repertoireDesApps(racine), 0o755);
  rmSync(join(repertoireDesApps(racine), "cook.pem"));

  assert.throws(
    () => rangerApp({ station: racine, role: "cook", id: apps.id("cook"), cle: apps.cle("cook") }),
    (erreur: Error) => erreur instanceof AppRefusee && /open to other accounts.*mode 755.*chmod 700/.test(erreur.message) && sansCle(erreur.message, apps.cle("cook")),
  );
  assert.equal(appsRangees(racine).find(({ role }) => role === "cook")?.cle, false);

  assert.throws(() => configIdentites({ BRIGADE_STATION_DIR: racine }), (erreur: Error) => erreur instanceof ConfigInvalide && /ouvert à d'autres.*mode 755.*chmod 700/.test(erreur.message));
});

test("ce que l'app remet est vérifié avant d'être rangé, et aucun refus ne cite la clé", async (t) => {
  const apps = await fauxGitHubApps(t);
  const racine = station(t);
  const refus = (options: { role?: string; id?: string; cle?: string }, motif: RegExp) =>
    assert.throws(
      () => rangerApp({ station: racine, role: "cook", id: apps.id("cook"), cle: apps.cle("cook"), ...options }),
      (erreur: Error) => erreur instanceof AppRefusee && motif.test(erreur.message) && sansCle(erreur.message, apps.cle("cook")) && !erreur.message.includes("un-secret-qui-ne-sort-pas"),
    );

  refus({ role: "reviewer" }, /unknown role.*cook, pass, manager/);
  refus({ id: "mon app" }, /App ID given for the cook role is not one/);
  refus({ cle: "un-secret-qui-ne-sort-pas\n" }, /not a private key/);
  rangerApp({ station: racine, role: "pass", id: apps.id("pass"), cle: apps.cle("pass") });
  refus({ id: apps.id("pass") }, /pass role already has the App 1002/);
  assert.deepEqual(appsRangees(racine), [
    { role: "cook", id: null, cle: false },
    { role: "pass", id: apps.id("pass"), cle: true },
    { role: "manager", id: null, cle: false },
  ]);
});

test("la commande range la clé reçue sur l'entrée, et ne la rend ni sur la sortie ni dans un refus", async (t) => {
  const apps = await fauxGitHubApps(t);
  const racine = station(t);
  const env = { BRIGADE_STATION_DIR: racine };

  const rangee = appeler((appel) => principal(appel, async () => apps.cle("manager")), ["store", "manager", apps.id("manager")], env);
  assert.equal(await rangee.fin, 0);
  assert.match(rangee.sortie(), /the manager App \(1003\) is stored in .*its key is not shown/);

  const montree = appeler((appel) => principal(appel), ["show"], env);
  assert.equal(await montree.fin, 0);
  assert.match(montree.sortie(), /^manager: App 1003, key stored$/m);
  assert.match(montree.sortie(), /^cook: no App, no key$/m);

  const refusee = appeler((appel) => principal(appel, async () => apps.cle("cook").replace("-----END", "x-----END")), ["store", "cook", apps.id("cook")], env);
  assert.equal(await refusee.fin, 1);

  const mauvaise = appeler((appel) => principal(appel, async () => apps.cle("cook")), ["store", "cook"], env);
  assert.equal(await mauvaise.fin, 2);

  for (const appel of [rangee, montree, refusee, mauvaise]) {
    assert.ok(sansCle(appel.sortie(), apps.cle("manager")) && sansCle(appel.sortie(), apps.cle("cook")), appel.sortie());
  }
});

// Sous quel rôle chaque appel du faux `gh` est parti, lu dans son jeton.
const roleDe = (jeton: string | null): string => /^ghs_([a-z]+)_/.exec(jeton ?? "")?.[1] ?? "machine";

test("les Apps rangées pour les trois rôles : la prise, les labels, le verdict, le merge et les lectures partent chacun sous le jeton de l'App de son rôle", async (t) => {
  const apps = await fauxGitHubApps(t);
  const racine = station(t);
  rangerTout(racine, apps);
  const config = configIdentites({ BRIGADE_STATION_DIR: racine, BRIGADE_PROJECT: "brigade", BRIGADE_GITHUB_API_URL: apps.url });
  assert.ok(config, "les Apps de la station sont lues");
  const identites = ouvrirIdentites({ ...config, depot: DEPOT, avertir: () => {} });
  t.after(() => identites.fermer());
  const gh = fauxGh(t);
  const githubs = ouvrirGitHubs({ depot: DEPOT, bin: gh.bin, identites });
  gh.issues([issueGitHub(14)]);
  gh.repondre(`repos/${DEPOT}/issues/14/events?per_page=100`, { corps: [] });
  gh.repondre(`repos/${DEPOT}/issues/14/comments`, { statut: 201, corps: {} });
  gh.repondre(`repos/${DEPOT}/issues/14/labels`, { corps: [] });
  gh.repondre(`repos/${DEPOT}/pulls`, { statut: 201, corps: { html_url: "https://github.com/acme/brigade/pull/40" } });
  gh.repondre(`repos/${DEPOT}/pulls/40/merge`, { corps: { merged: true } });
  // Tous les appels d'un geste, et les rôles sous lesquels ils sont partis.
  const sous = async (geste: () => Promise<unknown>): Promise<string[]> => {
    const avant = gh.jetons().length;
    await geste();
    const jetons = gh.jetons().slice(avant);
    assert.ok(jetons.length > 0, "le geste est parti vers GitHub");
    return [...new Set(jetons.map(roleDe))];
  };
  // Le client du tour d'une station sur l'état GitHub seul : celui de la pass.
  const tour = clientDuTour(githubs.pass, "main");

  // Sur l'état GitHub seul, chaque station prend, relit et merge : la pass.
  assert.deepEqual(await sous(() => prendre({ number: 14, labels: ["fire"] }, { github: tour, station: "mac" })), ["pass"]);
  assert.deepEqual(await sous(() => tour.labelliser(14, ["in-pass"])), ["pass"]);
  assert.deepEqual(await sous(() => tour.commenter(14, "<!-- brigade:verdict -->\nGreen.")), ["pass"]);
  assert.deepEqual(await sous(() => tour.merger(40, "abc")), ["pass"]);
  assert.deepEqual(await sous(() => tour.fires()), ["pass"]);
  // La PR d'un cook part sous l'identité cook.
  assert.deepEqual(await sous(() => tour.ouvrirPR({ branche: "cook/14-github", base: "main", titre: "t", corps: "c" })), ["cook"]);
  // Le manager et le rail : ses labels et ses lectures d'issues.
  assert.deepEqual(await sous(() => githubs.manager.labelliser(14, ["prio:high"])), ["manager"]);
  assert.deepEqual(await sous(() => githubs.rail.issue(14)), ["manager"]);

  // Aucun appel n'est parti sous le compte de la machine.
  assert.ok(!gh.jetons().map(roleDe).includes("machine"));
  for (const role of ROLES) assert.ok(gh.jetons().some((jeton) => apps.jetons(role).includes(jeton ?? "")), role);
});

test("aucune ligne de journal ni aucun message d'erreur ne porte la clé, même quand GitHub refuse l'App", async (t) => {
  const apps = await fauxGitHubApps(t);
  const racine = station(t);
  rangerTout(racine, apps);
  const config = configIdentites({ BRIGADE_STATION_DIR: racine, BRIGADE_GITHUB_API_URL: apps.url });
  assert.ok(config);
  const dits: string[] = [];
  const identites = ouvrirIdentites({ ...config, depot: DEPOT, avertir: (message) => dits.push(message) });
  t.after(() => identites.fermer());

  // GitHub ne reconnaît pas le JWT : l'authentification de l'App échoue.
  apps.refuser(401, "A JSON web token could not be decoded");
  const erreurs: string[] = [];
  for (const role of ROLES) await identites.jeton(role).frais().catch((erreur: Error) => erreurs.push(`${erreur.message}\n${erreur.stack ?? ""}`));
  await identites.entretenir();

  assert.equal(erreurs.length, ROLES.length);
  assert.ok(dits.length > 0);
  for (const texte of [...erreurs, ...dits]) {
    assert.match(texte, /HTTP 401/);
    for (const role of ROLES) assert.ok(sansCle(texte, apps.cle(role)), texte);
    for (const jwt of apps.jwts()) assert.ok(!texte.includes(jwt));
  }

  // Une clé que quelqu'un écrirait quand même : journald et le journal la masquent.
  const lignes: string[] = [];
  const noter = (...valeurs: unknown[]) => void lignes.push(valeurs.map(String).join(" "));
  const sortie = { log: noter, info: noter, warn: noter, error: noter };
  masquerLaConsole(sortie);
  sortie.error("brigade : clé lue", apps.cle("pass"));
  sortie.log(JSON.stringify({ cle: apps.cle("manager") }));
  assert.equal(lignes.length, 2);
  for (const ligne of lignes) for (const role of ROLES) assert.ok(sansCle(ligne, apps.cle(role)), ligne);
  const runtime = demarrer({ repertoireEtat: repertoireTemporaire(t), projet: "brigade", intervalleVeilleMs: 5, maintenant: horloge() });
  t.after(() => runtime.arreter("test"));
  runtime.journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "essai.cle", payload: { cle: apps.cle("cook") } } as never);
  const ecrit = runtime.journal.base.lire<{ payload: string }>("SELECT payload FROM events WHERE type = 'essai.cle'")[0]?.payload ?? "";
  assert.ok(ecrit !== "" && sansCle(ecrit, apps.cle("cook")), ecrit);
  assert.ok(sansCle(masquerIdentifiants(apps.cle("pass")).texte, apps.cle("pass")));
});

test("le répertoire des Apps n'est dans aucune sauvegarde, et ne peut pas être dans un dépôt", async (t) => {
  const apps = await fauxGitHubApps(t);
  const racine = station(t);
  rangerTout(racine, apps);

  // La sauvegarde d'un projet de la station : son état, sous `etat/`.
  const etat = join(racine, "etat", "brigade");
  mkdirSync(etat, { recursive: true });
  const runtime = demarrer({ repertoireEtat: etat, projet: "brigade", intervalleVeilleMs: 5, maintenant: horloge() });
  runtime.journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "essai.vu", payload: {} } as never);
  runtime.arreter("test");
  const destination = repertoireTemporaire(t);
  sauvegarder({ repertoireEtat: etat, destination, garder: 2 });
  const copies = readdirSync(destination, { recursive: true, withFileTypes: true }).filter((entree) => entree.isFile());
  assert.ok(copies.length > 0);
  for (const copie of copies) {
    const contenu = readFileSync(join(copie.parentPath, copie.name), "latin1");
    for (const role of ROLES) assert.ok(sansCle(contenu, apps.cle(role)), copie.name);
    assert.ok(!copie.name.endsWith(".pem"), copie.name);
  }

  // Une station rangée dans un dépôt git : rien n'y est écrit, rien n'y est lu.
  const depot = repertoireTemporaire(t);
  mkdirSync(join(depot, ".git"));
  const dansLeDepot = join(depot, "outils", "station");
  assert.throws(() => rangerApp({ station: dansLeDepot, role: "cook", id: apps.id("cook"), cle: apps.cle("cook") }), /inside the git repository/);
  assert.deepEqual(appsRangees(dansLeDepot).filter(({ cle }) => cle), []);
  // Ni sous l'état d'un projet, ni sous ses sauvegardes, ni sous son dépôt.
  for (const variable of ["BRIGADE_STATE_DIR", "BRIGADE_BACKUP_DIR", "BRIGADE_REPO_DIR"]) {
    assert.throws(() => rangerApp({ station: racine, role: "cook", id: apps.id("cook"), cle: apps.cle("cook"), env: { [variable]: racine } }), new RegExp(`under ${variable}`));
    assert.throws(() => configIdentites({ BRIGADE_STATION_DIR: racine, [variable]: racine }), new RegExp(`ne peut pas garder de clé.*under ${variable}`));
  }
  // Rangé sous la station d'un projet servi, il est à côté de son état, pas dessous.
  assert.ok(configIdentites({ BRIGADE_STATION_DIR: racine, BRIGADE_STATE_DIR: etat, BRIGADE_REPO_DIR: join(racine, "clones", "brigade"), BRIGADE_BACKUP_DIR: destination }));
});

test("sans App rangée, la station garde l'identité unique ; des Apps à moitié rangées font refuser, les manquantes nommées", async (t) => {
  const apps = await fauxGitHubApps(t);
  const racine = station(t);

  assert.equal(configIdentites({ BRIGADE_STATION_DIR: racine }), null);
  mkdirSync(repertoireDesApps(racine), { mode: 0o700 });
  assert.equal(configIdentites({ BRIGADE_STATION_DIR: racine }), null);

  const roles: Role[] = ["cook", "pass"];
  for (const role of roles) rangerApp({ station: racine, role, id: apps.id(role), cle: apps.cle(role) });
  assert.throws(() => configIdentites({ BRIGADE_STATION_DIR: racine }), (erreur: Error) => erreur instanceof ConfigInvalide && /il manque manager\.id, manager\.pem/.test(erreur.message));

  rangerApp({ station: racine, role: "manager", id: apps.id("manager"), cle: apps.cle("manager") });
  const config = configIdentites({ BRIGADE_STATION_DIR: racine });
  assert.deepEqual(ROLES.map((role) => config?.apps[role].id), ROLES.map((role) => apps.id(role)));

  // `BRIGADE_GITHUB_APPS_DIR`, le réglage d'avant, passe toujours devant.
  assert.equal(configIdentites({ BRIGADE_STATION_DIR: racine, BRIGADE_GITHUB_APPS_DIR: apps.repertoire })?.apps.cook.id, apps.id("cook"));
});
