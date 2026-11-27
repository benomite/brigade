// L'étape « protection » de l'installation : le chef — ou l'app, pour lui —
// protège la branche d'intégration sur GitHub sans rien recopier. Ce qui manque
// au compte pour le faire est dit avant toute tentative ; rejouer ne réécrit
// rien ; une protection posée autrement n'est jamais écrasée. GitHub y est
// simulé : il garde ce qu'on lui pose, et le rend à la lecture suivante.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ETAPES, installationDe, noterEtape } from "../src/etapes.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { commande, constater, lire, PROTECTION, type ClientGitHub, type RequeteGitHub } from "../src/proteger-branche.ts";
import { appeler, BASE, DEPOT, fauxGh, lancer, repertoireTemporaire } from "./outils.ts";

const INSTALLATION = join(import.meta.dirname, "../src/installation-cli.ts");
const PROJET = "espace";
const CHEMIN_PROTECTION = `repos/${DEPOT}/branches/${BASE}/protection`;

type ProtectionSimulee = { required_pull_request_reviews: { required_approving_review_count: number } | null; enforce_admins: { enabled: boolean } };

// Un GitHub simulé, qui garde l'état du dépôt : ce qu'un PUT y pose, un GET le
// rend ensuite. `refus` : ce qu'il répond à une écriture qu'il refuse.
function github(depart: { admin?: boolean; scopes?: string[] | null; prive?: boolean; protection?: ProtectionSimulee | null; pushProtection?: string; refusPut?: { statut: number; message: string }; refusPatch?: { statut: number; message: string } } = {}) {
  const etat = {
    admin: depart.admin ?? true,
    protection: depart.protection ?? null,
    pushProtection: depart.pushProtection ?? "enabled",
  };
  const requetes: RequeteGitHub[] = [];
  const depot = () => ({ full_name: DEPOT, private: depart.prive ?? true, permissions: { admin: etat.admin, push: true, pull: true }, security_and_analysis: { secret_scanning_push_protection: { status: etat.pushProtection } } });
  const client: ClientGitHub = async (requete) => {
    requetes.push(requete);
    const { methode, chemin } = requete;
    const scopes = depart.scopes === undefined ? ["repo", "read:org"] : depart.scopes;
    const rendre = (statut: number, corps: unknown) => ({ statut, corps, scopes });
    if (methode === "GET" && chemin === `repos/${DEPOT}`) return rendre(200, depot());
    if (methode === "GET" && chemin === "user") return rendre(200, { login: "machine-de-la-box" });
    if (methode === "GET" && chemin === `repos/${DEPOT}/branches/${BASE}`) return rendre(200, { name: BASE, protected: etat.protection !== null });
    if (methode === "GET" && chemin === CHEMIN_PROTECTION) {
      if (!etat.admin) return rendre(404, { message: "Not Found" });
      return etat.protection === null ? rendre(404, { message: "Branch not protected" }) : rendre(200, etat.protection);
    }
    if (methode === "PUT" && chemin === CHEMIN_PROTECTION) {
      if (!etat.admin) return rendre(404, { message: "Not Found" });
      if (depart.refusPut) return rendre(depart.refusPut.statut, { message: depart.refusPut.message });
      const corps = requete.corps as typeof PROTECTION;
      etat.protection = { required_pull_request_reviews: corps.required_pull_request_reviews, enforce_admins: { enabled: corps.enforce_admins } };
      return rendre(200, etat.protection);
    }
    if (methode === "PATCH" && chemin === `repos/${DEPOT}`) {
      if (depart.refusPatch) return rendre(depart.refusPatch.statut, { message: depart.refusPatch.message });
      etat.pushProtection = "enabled";
      return rendre(200, depot());
    }
    return rendre(404, { message: "Not Found" });
  };
  return { client, requetes, etat, ecritures: () => requetes.filter((requete) => requete.methode !== "GET") };
}

const env = (etat: string, autres: Record<string, string> = {}) => ({ BRIGADE_STATE_DIR: etat, BRIGADE_PROJECT: PROJET, BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_BASE_BRANCH: BASE, ...autres });

async function jouer(etat: string, gh: ReturnType<typeof github>, args: string[] = ["poser"]) {
  const appel = appeler((a) => commande(a, gh.client), args, env(etat));
  return { code: await appel.fin, sortie: appel.sortie() };
}

const etatDeLEtape = (etat: string) => installationDe(etat).etapes.find((etape) => etape.id === "protection")?.etat;

function evenements(etat: string) {
  const journal = ouvrirJournal(etat, { lectureSeule: true });
  try {
    return journal.tout();
  } finally {
    journal.fermer();
  }
}

test("l'action pose la protection que le runtime suppose, note l'étape faite, et la vérification la reconnaît ensuite comme posée", async (t) => {
  const etat = repertoireTemporaire(t);
  const gh = github();
  assert.equal(constater(await lire(gh.client, DEPOT, BASE), DEPOT, BASE, env(etat)).etat, "manque");

  const { code, sortie } = await jouer(etat, gh);

  assert.equal(code, 0, sortie);
  assert.match(sortie, new RegExp(`^brigade : \`${BASE}\` protégée sur ${DEPOT} — PR obligatoire, zéro approbation requise, administrateurs inclus`, "m"));
  assert.match(sortie, /« Protéger la branche d'intégration » notée faite/);
  assert.deepEqual(gh.ecritures(), [{ methode: "PUT", chemin: CHEMIN_PROTECTION, corps: PROTECTION }]);
  assert.equal(etatDeLEtape(etat), "done");
  assert.deepEqual(evenements(etat).map((e) => [e.type, e.author, e.project, e.payload]), [["installation.step", "chef", PROJET, { step: "protection", state: "done", previous: "todo" }]]);
  const constat = constater(await lire(gh.client, DEPOT, BASE), DEPOT, BASE, env(etat));
  assert.deepEqual(constat, { etat: "ok", texte: `branche d'intégration \`${BASE}\` protégée : PR obligatoire, administrateurs inclus` });
});

test("rejouer l'action sur une branche déjà protégée ne change rien, et l'étape reste faite", async (t) => {
  const etat = repertoireTemporaire(t);
  const gh = github();
  assert.equal((await jouer(etat, gh)).code, 0);
  const avant = evenements(etat).length;

  const { code, sortie } = await jouer(etat, gh);

  assert.equal(code, 0, sortie);
  assert.match(sortie, new RegExp(`\`${BASE}\` est déjà protégée sur ${DEPOT} — rien n'est réécrit`));
  assert.equal(gh.ecritures().length, 1, "une seconde écriture est partie sur GitHub");
  assert.equal(evenements(etat).length, avant);
  assert.equal(etatDeLEtape(etat), "done");
});

test("une branche protégée à la main, comme le runtime le suppose, fait l'étape sans rien écrire sur GitHub", async (t) => {
  const etat = repertoireTemporaire(t);
  const gh = github({ protection: { required_pull_request_reviews: { required_approving_review_count: 0 }, enforce_admins: { enabled: true } } });

  const { code, sortie } = await jouer(etat, gh);

  assert.equal(code, 0, sortie);
  assert.deepEqual(gh.ecritures(), []);
  assert.equal(etatDeLEtape(etat), "done");
});

test("sans le rôle d'administrateur, l'étape est bloquée avant toute tentative, avec le droit manquant et l'unique action qui le donne", async (t) => {
  const etat = repertoireTemporaire(t);
  const gh = github({ admin: false });

  const { code, sortie } = await jouer(etat, gh);

  assert.equal(code, 1, sortie);
  assert.deepEqual(gh.ecritures(), [], "une écriture a été tentée");
  assert.equal(etatDeLEtape(etat), "waiting");
  assert.match(sortie, /« Protéger la branche d'intégration » bloquée — il manque au compte de `gh` de quoi protéger une branche — rien n'est essayé/);
  assert.match(sortie, new RegExp(`il manque : administrateur de ${DEPOT}`));
  assert.match(sortie, new RegExp(`→ donner le rôle Admin sur ${DEPOT} à \`machine-de-la-box\`, le compte sous lequel \`gh\` tourne sur la box — sur GitHub, Settings → Collaborators and teams`));
  assert.match(sortie, /pourquoi : protéger une branche est un geste d'administrateur/);
  assert.match(sortie, /puis rejouer `brigade espace installation protection poser`/);
  // Une seule action par droit qui manque.
  assert.equal(sortie.match(/^ {2}→ /gm)?.length, 1);

  // Le droit donné, la même action pose la protection.
  gh.etat.admin = true;
  assert.equal((await jouer(etat, gh)).code, 0);
  assert.equal(etatDeLEtape(etat), "done");
});

test("un jeton sans le scope `repo` est dit avant toute tentative, avec la commande qui le lui donne", async (t) => {
  const etat = repertoireTemporaire(t);
  const gh = github({ scopes: ["read:org", "gist"] });

  const { code, sortie } = await jouer(etat, gh);

  assert.equal(code, 1, sortie);
  assert.deepEqual(gh.ecritures(), []);
  assert.equal(etatDeLEtape(etat), "waiting");
  assert.match(sortie, /il manque : le scope `repo` du jeton de `gh` \(il porte : `read:org`, `gist`\)/);
  assert.match(sortie, /→ `gh auth refresh -h github\.com -s repo`, sous le compte du service/);
});

test("un jeton dont GitHub ne dit pas les scopes n'est pas tenu pour sans droits", async (t) => {
  const etat = repertoireTemporaire(t);
  const gh = github({ scopes: null });

  assert.equal((await jouer(etat, gh)).code, 0);
  assert.equal(gh.ecritures().filter((requete) => requete.methode === "PUT").length, 1);
});

test("une protection posée autrement n'est jamais écrasée : ce qui lui manque est dit, avec où le régler", async (t) => {
  const etat = repertoireTemporaire(t);
  const gh = github({ protection: { required_pull_request_reviews: { required_approving_review_count: 1 }, enforce_admins: { enabled: false } } });

  const { code, sortie } = await jouer(etat, gh);

  assert.equal(code, 1, sortie);
  assert.deepEqual(gh.ecritures(), []);
  assert.equal(etatDeLEtape(etat), "waiting");
  assert.match(sortie, /déjà protégée, sans zéro approbation requise \(elle en exige 1 : la pass merge sans approbation.*\), ni administrateurs inclus/);
  assert.match(sortie, /Settings → Branches, la règle de `v2`.*l'action n'écrase pas une protection que tu as posée/);
  const constat = constater(await lire(gh.client, DEPOT, BASE), DEPOT, BASE, env(etat));
  assert.equal(constat.etat, "manque");
});

test("GitHub qui refuse la protection d'un dépôt privé sur un plan gratuit : l'étape est bloquée, avec le plan qu'il faut", async (t) => {
  const etat = repertoireTemporaire(t);
  const gh = github({ refusPut: { statut: 403, message: "Upgrade to GitHub Pro or make this repository public to enable this feature." } });

  const { code, sortie } = await jouer(etat, gh);

  assert.equal(code, 1, sortie);
  assert.equal(etatDeLEtape(etat), "waiting");
  assert.match(sortie, /il manque : la protection de branche sur un dépôt privé/);
  assert.match(sortie, /→ passer le propriétaire de .* à GitHub Pro \(ou Team, pour une organisation\), ou rendre le dépôt public/);
});

test("un jeton à grain fin que GitHub refuse malgré le rôle : la permission qui lui manque est dite", async (t) => {
  const etat = repertoireTemporaire(t);
  const gh = github({ scopes: null, refusPut: { statut: 403, message: "Resource not accessible by personal access token" } });

  const { code, sortie } = await jouer(etat, gh);

  assert.equal(code, 1, sortie);
  assert.equal(etatDeLEtape(etat), "waiting");
  assert.match(sortie, /il manque : la permission « Administration » en écriture du jeton de `gh`/);
  assert.match(sortie, /Resource not accessible by personal access token/);
});

test("la push protection est activée au passage ; refusée, elle est dite sans retenir l'étape", async (t) => {
  const active = repertoireTemporaire(t);
  const gh = github({ pushProtection: "disabled" });
  const posee = await jouer(active, gh);
  assert.equal(posee.code, 0, posee.sortie);
  assert.match(posee.sortie, /push protection de GitHub activée/);
  assert.deepEqual(gh.ecritures().map((requete) => requete.methode), ["PUT", "PATCH"]);

  const refusee = repertoireTemporaire(t);
  const sans = github({ pushProtection: "disabled", refusPatch: { statut: 422, message: "Secret scanning is not available for this repository" } });
  const { code, sortie } = await jouer(refusee, sans);
  assert.equal(code, 0, sortie);
  assert.match(sortie, /la push protection de GitHub n'est pas activée \(HTTP 422 : Secret scanning is not available for this repository\).*la station reste la seule barrière/);
  assert.equal(etatDeLEtape(refusee), "done");
});

test("les étapes qui précèdent faites, l'étape courante passe de la protection à la suivante", async (t) => {
  const etat = repertoireTemporaire(t);
  const journal = ouvrirJournal(etat);
  for (const etape of ["ajout", "init", "verification", "stations"]) noterEtape(journal, { projet: PROJET, etape, etat: "done", auteur: "chef" });
  journal.fermer();
  assert.equal(installationDe(etat).courante, "protection");

  assert.equal((await jouer(etat, github())).code, 0);

  assert.equal(installationDe(etat).courante, "decisions");
});

test("l'étape figure dans la liste, avec à quoi elle sert et ce qui arrive si on la saute", () => {
  const etape = ETAPES.find((connue) => connue.id === "protection");
  assert.ok(etape);
  assert.match(etape.sert, /PR/);
  assert.match(etape.sauter, /push direct/);
});

test("la lecture, en JSON pour l'app : l'étape, la branche, son état sur GitHub et les droits qui manquent — sans rien écrire", async (t) => {
  const etat = repertoireTemporaire(t);
  const gh = github({ admin: false });

  const { code, sortie } = await jouer(etat, gh, ["--json"]);

  assert.equal(code, 0, sortie);
  const lue = JSON.parse(sortie) as Record<string, unknown>;
  assert.deepEqual(Object.keys(lue), ["etape", "depot", "branche", "protection", "manque", "droits", "raison"]);
  assert.deepEqual(lue.etape, { id: "protection", etat: "à faire" });
  assert.equal(lue.protection, "absente");
  assert.deepEqual((lue.droits as Array<{ droit: string }>).map((droit) => droit.droit), [`administrateur de ${DEPOT}`]);
  assert.deepEqual(gh.ecritures(), []);
  assert.equal(existsSync(join(etat, "log.db")), false);
});

test("sans journal ni projet nommé, rien n'est essayé sur GitHub", async (t) => {
  const etat = repertoireTemporaire(t);
  const gh = github();

  const appel = appeler((a) => commande(a, gh.client), ["poser"], { BRIGADE_STATE_DIR: etat, BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_BASE_BRANCH: BASE });

  assert.equal(await appel.fin, 1);
  assert.match(appel.sortie(), /BRIGADE_PROJECT n'est pas défini/);
  assert.deepEqual(gh.requetes, []);
});

// La commande du chef, dans son propre process, par `gh` : le chemin réel.
test("la commande du chef, par `gh` : une branche déjà protégée, l'étape faite, aucune écriture", async (t) => {
  const etat = repertoireTemporaire(t);
  const gh = fauxGh(t);
  gh.repondre(`repos/${DEPOT}`, { corps: { full_name: DEPOT, permissions: { admin: true, push: true }, security_and_analysis: { secret_scanning_push_protection: { status: "enabled" } } } });
  gh.repondre(CHEMIN_PROTECTION, { corps: { required_pull_request_reviews: { required_approving_review_count: 0 }, enforce_admins: { enabled: true } } });

  const posee = lancer(t, INSTALLATION, ["protection", "poser"], env(etat, { BRIGADE_GH_BIN: gh.bin }));
  assert.equal(await posee.fin, 0, posee.sortie());
  assert.match(posee.sortie(), /est déjà protégée sur .* — rien n'est réécrit/);
  assert.deepEqual(gh.appels().filter((appel) => appel.includes("PUT") || appel.includes("PATCH")), []);
  assert.equal(etatDeLEtape(etat), "done");

  const lue = lancer(t, INSTALLATION, ["protection"], env(etat, { BRIGADE_GH_BIN: gh.bin }));
  assert.equal(await lue.fin, 0, lue.sortie());
  assert.match(lue.sortie(), /^brigade : « Protéger la branche d'intégration » — faite$/m);
  assert.match(lue.sortie(), /à quoi elle sert : .+/);
  assert.match(lue.sortie(), /si tu la sautes  : .+/);
  assert.match(lue.sortie(), new RegExp(`\`${BASE}\` est protégée sur ${DEPOT}`));
});

test("la commande du chef, par `gh`, sans le rôle d'administrateur : bloquée, et aucune écriture ne part", async (t) => {
  const etat = repertoireTemporaire(t);
  const gh = fauxGh(t);
  gh.repondre(`repos/${DEPOT}`, { corps: { full_name: DEPOT, permissions: { admin: false, push: true } } });
  gh.repondre(`repos/${DEPOT}/branches/${BASE}`, { corps: { name: BASE, protected: false } });

  const commandee = lancer(t, INSTALLATION, ["protection", "poser"], env(etat, { BRIGADE_GH_BIN: gh.bin }));

  assert.equal(await commandee.fin, 1, commandee.sortie());
  assert.match(commandee.sortie(), /bloquée — .*rien n'est essayé/);
  assert.match(commandee.sortie(), /le rôle Admin sur/);
  assert.deepEqual(gh.appels().filter((appel) => appel.includes("PUT")), []);
  assert.equal(etatDeLEtape(etat), "waiting");
});
