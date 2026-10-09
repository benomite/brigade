// Les identités GitHub par rôle, contre un faux GitHub local : ni réseau, ni
// vraie App. Les clés sont fabriquées une fois pour le fichier.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ConfigInvalide } from "../src/runtime.ts";
import { configIdentites, DROITS, environnementSansGitHub, ouvrirGitHubs, ouvrirIdentites, ROLES, type Role } from "../src/identites.ts";
import { fauxGitHubApps, type FauxGitHubApps } from "./aides/faux-github-apps.ts";
import { DEPOT, fauxGh, issueGitHub, repertoireTemporaire } from "./outils.ts";

const DEPART = Date.parse("2026-10-09T10:00:00.000Z");
const MINUTE = 60_000;

async function identites(t: TestContext, options: { avertir?: (message: string) => void } = {}) {
  const apps = await fauxGitHubApps(t);
  let instant = DEPART;
  apps.horloge(() => instant);
  const config = configIdentites({ BRIGADE_GITHUB_APPS_DIR: apps.repertoire, BRIGADE_GITHUB_API_URL: apps.url });
  assert.ok(config);
  const ouvertes = ouvrirIdentites({ ...config, depot: DEPOT, maintenant: () => new Date(instant), avertir: options.avertir });
  t.after(() => ouvertes.fermer());
  return { apps, identites: ouvertes, avancer: (ms: number) => void (instant += ms) };
}

const echanges = (apps: FauxGitHubApps, role: Role) => apps.echanges().filter((echange) => echange.role === role);

test("sans répertoire d'Apps, il n'y a pas d'identités par rôle", () => {
  assert.equal(configIdentites({}), null);
  assert.equal(configIdentites({ BRIGADE_GITHUB_APPS_DIR: "" }), null);
});

test("un jeton est demandé au nom de l'App du rôle, pour ce dépôt seul et avec les droits du rôle", async (t) => {
  const { apps, identites: ouvertes } = await identites(t);

  for (const role of ROLES) {
    const jeton = await ouvertes.jeton(role).frais();
    assert.equal(jeton, apps.jetons(role).at(-1));
    const [echange] = echanges(apps, role);
    // Le faux GitHub a vérifié la signature : le JWT est celui de cette App.
    assert.deepEqual(echange?.corps, { repositories: ["brigade"], permissions: DROITS[role] });
  }
});

test("le cook ne peut ni toucher aux issues ni lire la CI ; le manager ne touche pas au code", () => {
  assert.deepEqual(DROITS.cook, { contents: "write", pull_requests: "write" });
  assert.deepEqual(DROITS.manager, { issues: "write" });
  assert.equal(DROITS.pass.contents, "write");
});

test("un jeton encore vivant n'est pas redemandé ; dix minutes avant sa fin, il l'est", async (t) => {
  const { apps, identites: ouvertes, avancer } = await identites(t);
  const jeton = ouvertes.jeton("pass");

  const premier = await jeton.frais();
  avancer(49 * MINUTE);
  assert.equal(await jeton.frais(), premier);
  assert.equal(echanges(apps, "pass").length, 1);

  avancer(2 * MINUTE);
  const second = await jeton.frais();
  assert.notEqual(second, premier);
  assert.equal(echanges(apps, "pass").length, 2);
});

test("deux demandes de front ne font qu'un échange", async (t) => {
  const { apps, identites: ouvertes } = await identites(t);
  const jeton = ouvertes.jeton("cook");

  const [un, deux] = await Promise.all([jeton.frais(), jeton.frais()]);

  assert.equal(un, deux);
  assert.equal(echanges(apps, "cook").length, 1);
});

test("le jeton courant se lit sans attendre, tant qu'il vit ; mort ou jamais demandé, il lève", async (t) => {
  const { identites: ouvertes, avancer } = await identites(t);
  const jeton = ouvertes.jeton("cook");

  assert.throws(() => jeton.courant(), /jeton de l'identité « cook » indisponible/);
  const frais = await jeton.frais();
  avancer(58 * MINUTE);
  assert.equal(jeton.courant(), frais);
  avancer(2 * MINUTE);
  assert.throws(() => jeton.courant(), /indisponible/);
});

test("l'entretien renouvelle avant l'échéance : après des heures de ticks, le jeton courant vit toujours", async (t) => {
  const { apps, identites: ouvertes, avancer } = await identites(t);

  await ouvertes.entretenir();
  const premier = ouvertes.jeton("cook").courant();
  for (let minute = 0; minute < 180; minute++) {
    avancer(MINUTE);
    await ouvertes.entretenir();
    ouvertes.jeton("cook").courant();
  }

  assert.notEqual(ouvertes.jeton("cook").courant(), premier);
  // Un échange par demi-heure et par rôle, pas un par tick.
  assert.ok(echanges(apps, "cook").length <= 7, `${echanges(apps, "cook").length} échanges`);
  for (const role of ROLES) assert.ok(echanges(apps, role).length >= 3);
});

test("un entretien qui échoue ne lève pas : il prévient une fois, et le jeton vivant reste", async (t) => {
  const dits: string[] = [];
  const { apps, identites: ouvertes, avancer } = await identites(t, { avertir: (message) => dits.push(message) });
  await ouvertes.entretenir();
  const vivant = ouvertes.jeton("pass").courant();

  apps.panne(503);
  avancer(40 * MINUTE);
  await ouvertes.entretenir();
  await ouvertes.entretenir();

  assert.equal(ouvertes.jeton("pass").courant(), vivant);
  assert.equal(dits.filter((dit) => dit.includes("« pass »")).length, 1);

  apps.panne(null);
  await ouvertes.entretenir();
  assert.notEqual(ouvertes.jeton("pass").courant(), vivant);
});

test("l'identité d'un rôle est celle que GitHub donne à son App", async (t) => {
  const { identites: ouvertes } = await identites(t);

  assert.equal(await ouvertes.login("pass"), "brigade-pass[bot]");
  assert.equal(await ouvertes.login("cook"), "brigade-cook[bot]");
});

test("une App qui n'est pas installée sur le dépôt se dit, rôle et dépôt nommés", async (t) => {
  const { apps, identites: ouvertes } = await identites(t);
  apps.desinstaller("manager");

  await assert.rejects(ouvertes.jeton("manager").frais(), /identité « manager ».*pas installée sur benomite\/brigade/);
});

test("un refus de GitHub se lit avec son motif, sans jamais porter de jeton ni de JWT", async (t) => {
  const { apps, identites: ouvertes, avancer } = await identites(t);
  await ouvertes.jeton("pass").frais();
  apps.refuser(422, "The permissions requested are not granted to this installation.");
  avancer(55 * MINUTE);

  const erreur = await ouvertes.jeton("pass").frais().then(
    () => null,
    (levee: Error) => levee,
  );

  assert.match(erreur?.message ?? "", /identité « pass ».*HTTP 422.*not granted/);
  for (const secret of [...apps.jetons("pass"), ...apps.jwts()]) assert.ok(!erreur?.message.includes(secret));
});

function repertoireDApps(t: TestContext, apps: FauxGitHubApps): string {
  const copie = join(repertoireTemporaire(t), "apps");
  mkdirSync(copie);
  for (const role of ROLES) {
    writeFileSync(join(copie, `${role}.id`), `${apps.id(role)}\n`);
    writeFileSync(join(copie, `${role}.pem`), apps.cle(role), { mode: 0o600 });
  }
  return copie;
}

test("un fichier manquant fait refuser le démarrage, et il est nommé", async (t) => {
  const repertoire = repertoireDApps(t, await fauxGitHubApps(t));
  rmSync(join(repertoire, "pass.pem"));

  assert.throws(
    () => configIdentites({ BRIGADE_GITHUB_APPS_DIR: repertoire }),
    (erreur: Error) => erreur instanceof ConfigInvalide && erreur.message.includes(join(repertoire, "pass.pem")),
  );
});

test("une clé lisible par d'autres que le compte du service fait refuser le démarrage", async (t) => {
  const repertoire = repertoireDApps(t, await fauxGitHubApps(t));
  chmodSync(join(repertoire, "cook.pem"), 0o644);

  assert.throws(() => configIdentites({ BRIGADE_GITHUB_APPS_DIR: repertoire }), /cook\.pem.*chmod 600/);
});

test("un fichier qui n'est pas une clé privée fait refuser le démarrage, sans en citer le contenu", async (t) => {
  const repertoire = repertoireDApps(t, await fauxGitHubApps(t));
  writeFileSync(join(repertoire, "manager.pem"), "pas-une-cle-mais-un-secret", { mode: 0o600 });

  assert.throws(
    () => configIdentites({ BRIGADE_GITHUB_APPS_DIR: repertoire }),
    (erreur: Error) => erreur instanceof ConfigInvalide && /manager\.pem/.test(erreur.message) && !erreur.message.includes("pas-une-cle"),
  );
});

test("deux rôles sous la même App ne sont pas deux identités : le démarrage est refusé", async (t) => {
  const apps = await fauxGitHubApps(t);
  const repertoire = repertoireDApps(t, apps);
  writeFileSync(join(repertoire, "manager.id"), `${apps.id("pass")}\n`);

  assert.throws(() => configIdentites({ BRIGADE_GITHUB_APPS_DIR: repertoire }), /« pass » et « manager ».*même App/);
});

test("un identifiant d'App mal écrit fait refuser le démarrage", async (t) => {
  const repertoire = repertoireDApps(t, await fauxGitHubApps(t));
  writeFileSync(join(repertoire, "cook.id"), "mon app\n");

  assert.throws(() => configIdentites({ BRIGADE_GITHUB_APPS_DIR: repertoire }), /cook\.id/);
});

test("l'environnement sans GitHub perd les jetons de gh et ne trouve plus la connexion du compte", () => {
  const env = environnementSansGitHub({ PATH: "/bin", GH_TOKEN: "a", GITHUB_TOKEN: "b", GH_ENTERPRISE_TOKEN: "c", GITHUB_ENTERPRISE_TOKEN: "d", HOME: "/home/brigade" }, "/etat/gh-vide");

  assert.deepEqual(env, { PATH: "/bin", HOME: "/home/brigade", GH_CONFIG_DIR: "/etat/gh-vide", GIT_TERMINAL_PROMPT: "0" });
});

// Sous quel rôle chaque appel du faux `gh` est parti, lu dans son jeton.
const roleDe = (jeton: string | null): string => /^ghs_([a-z]+)_/.exec(jeton ?? "")?.[1] ?? "machine";

test("chaque geste part sous l'identité de son rôle : le cook livre, la pass merge, le manager tient les issues", async (t) => {
  const { identites: ouvertes } = await identites(t);
  const gh = fauxGh(t);
  const githubs = ouvrirGitHubs({ depot: DEPOT, bin: gh.bin, identites: ouvertes });
  gh.issues([issueGitHub(14)]);
  gh.repondre(`repos/${DEPOT}/issues/14/comments`, { statut: 201, corps: {} });
  gh.repondre(`repos/${DEPOT}/pulls`, { statut: 201, corps: { html_url: "https://github.com/benomite/brigade/pull/40" } });
  gh.repondre(`repos/${DEPOT}/pulls/40/merge`, { corps: { merged: true } });
  const sous = async (geste: () => Promise<unknown>) => {
    await geste();
    return roleDe(gh.jetons().at(-1) ?? null);
  };
  const pr = { branche: "cook/14-a", base: "main", titre: "t", corps: "c" };

  // Le rail et le manager : les issues.
  assert.equal(await sous(() => githubs.rail.tickets()), "manager");
  assert.equal(await sous(() => githubs.manager.commenter(14, "qualifié")), "manager");
  // La station livre sous l'identité cook, mais parle sur l'issue — et lit le
  // ticket qu'elle remet au cook — sous celle du manager : l'identité cook n'a
  // aucun droit sur les issues.
  assert.equal(await sous(() => githubs.station.ouvrirPR(pr)), "cook");
  assert.equal(await sous(() => githubs.station.commenter(14, "le cook a fini")), "manager");
  assert.equal(await sous(() => githubs.station.issue(14)), "manager");
  assert.equal(await sous(() => githubs.station.commentaires(14)), "manager");
  // La pass merge et commente sous la sienne ; la PR qu'elle rouvre pour un
  // cook est encore celle d'un cook.
  assert.equal(await sous(() => githubs.pass.merger(40, "abc")), "pass");
  assert.equal(await sous(() => githubs.pass.commenter(14, "verte")), "pass");
  assert.equal(await sous(() => githubs.pass.ouvrirPR(pr)), "cook");

  assert.equal(await githubs.pass.identite(), "brigade-pass[bot]");
  assert.equal(await githubs.station.identite(), "brigade-cook[bot]");
});

test("sans identités, les quatre passent par le même gh, sous le compte de la machine", async (t) => {
  const gh = fauxGh(t);
  const githubs = ouvrirGitHubs({ depot: DEPOT, bin: gh.bin, identites: null });
  gh.issues([issueGitHub(14)]);

  await githubs.rail.tickets();
  await githubs.pass.issue(14);

  assert.equal(githubs.station, githubs.pass);
  assert.equal(githubs.manager, githubs.rail);
  assert.deepEqual(gh.jetons().map(roleDe), ["machine", "machine"]);
  assert.equal(await githubs.pass.identite(), null);
});
