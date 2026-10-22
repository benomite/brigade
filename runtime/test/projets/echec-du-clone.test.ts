// Un clone en échec, dit au chef : la cause en une phrase, le compte GitHub de
// la station, et le geste — jamais la sortie de git ni le message du runtime
// comme raison. Les sorties d'erreur sont celles de gh et de git, telles
// qu'elles arrivent.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ENQUETE_MUETTE, lireLEchecDuClone, PAGE_DES_JETONS_FINS, typeDeJeton, type Enquete } from "../../src/projets/echec-du-clone.ts";

const DEPOT = "BOBL-tech/mirrorscreen";
const lire = (erreurs: string, enquete: Partial<Enquete> = {}) => lireLEchecDuClone({ station: "parade-box", depot: DEPOT, erreurs, enquete: { ...ENQUETE_MUETTE, ...enquete }, reessaieToutesLes: 30 });

const INTROUVABLE = "remote: Repository not found.\nfatal: repository 'https://github.com/BOBL-tech/mirrorscreen.git/' not found\nfailed to run git: exit status 128";

// Rien de brut dans ce que la page montre en premier.
const BRUT = /exit status|fatal:|clone de|en échec|remote:/;

test("le jeton fine-grained de la station n'inclut pas le dépôt : la cause, le compte, et la page des jetons où l'ajouter", () => {
  const echec = lire(INTROUVABLE, { compte: "parade-box", jeton: "fine-grained", proprietaire: true });
  assert.equal(echec.cause, "token-excludes-repository");
  assert.equal(echec.raison, "The token used by parade-box does not include BOBL-tech/mirrorscreen, so GitHub answers that it does not exist and parade-box cannot clone it.");
  assert.equal(echec.geste, "Add BOBL-tech/mirrorscreen to the repositories of the token used by parade-box (its resource owner must be BOBL-tech): edit the token, and select BOBL-tech/mirrorscreen under “Repository access”.");
  assert.deepEqual(echec.liens, [PAGE_DES_JETONS_FINS]);
  assert.equal(echec.compte, "parade-box");
  assert.equal(echec.detail, INTROUVABLE);
  assert.equal(echec.reessaieToutesLes, 30);
  assert.doesNotMatch(`${echec.raison} ${echec.geste}`, BRUT);
});

test("introuvable, sous un jeton qui voit tout ce que voit le compte : le compte ne le voit pas — la page des accès du dépôt", () => {
  const echec = lire(INTROUVABLE, { compte: "parade-box", jeton: "oauth", proprietaire: true });
  assert.equal(echec.cause, "account-cannot-see");
  assert.match(echec.raison, /^parade-box cannot see BOBL-tech\/mirrorscreen: /);
  assert.deepEqual(echec.liens, ["https://github.com/BOBL-tech/mirrorscreen/settings/access"]);
  assert.match(echec.geste, /^Invite parade-box as a collaborator of BOBL-tech\/mirrorscreen/);
});

test("le propriétaire n'existe pas : le dépôt n'existe pas, le geste est dans l'app", () => {
  const echec = lire(INTROUVABLE, { compte: "parade-box", jeton: "fine-grained", proprietaire: false });
  assert.equal(echec.cause, "repository-missing");
  assert.equal(echec.raison, "BOBL-tech/mirrorscreen does not exist: GitHub has no account or organization named BOBL-tech.");
  assert.deepEqual(echec.liens, []);
});

test("le réseau ou GitHub injoignable, gh pas connecté, un 403, l'authentification unique, ssh : chaque cause sa phrase et son geste", () => {
  const reseau = lire("fatal: unable to access 'https://github.com/BOBL-tech/mirrorscreen.git/': Could not resolve host: github.com\nfailed to run git: exit status 128");
  assert.equal(reseau.cause, "unreachable");
  assert.equal(reseau.raison, "parade-box cannot reach GitHub to clone BOBL-tech/mirrorscreen: the network or GitHub is down.");
  assert.deepEqual(reseau.liens, []);

  const connexion = lire("fatal: could not read Username for 'https://github.com': terminal prompts disabled\nfailed to run git: exit status 128");
  assert.equal(connexion.cause, "not-logged-in");
  assert.match(connexion.geste, /`gh auth login` on parade-box/);

  const interdit = lire("remote: Permission to BOBL-tech/mirrorscreen.git denied to parade-box.\nfatal: unable to access 'https://github.com/BOBL-tech/mirrorscreen.git/': The requested URL returned error: 403", { compte: "parade-box" });
  assert.equal(interdit.cause, "no-read-access");
  assert.equal(interdit.raison, "parade-box may not read BOBL-tech/mirrorscreen, so parade-box cannot clone it.");

  const sso = lire("remote: The 'BOBL-tech' organization has enabled or enforced SAML SSO.\nfatal: unable to access 'https://github.com/BOBL-tech/mirrorscreen.git/': The requested URL returned error: 403", { compte: "parade-box", jeton: "fine-grained" });
  assert.equal(sso.cause, "sso-required");
  assert.deepEqual(sso.liens, [PAGE_DES_JETONS_FINS]);

  // Le 22 oct. : le clone partait sur ssh. En HTTPS il n'y part plus, sauf si git y renvoie GitHub lui-même.
  const ssh = lire("Host key verification failed.\nfatal: Could not read from remote repository.\n\nPlease make sure you have the correct access rights\nand the repository exists.\nfailed to run git: exit status 128");
  assert.equal(ssh.cause, "ssh-rewrite");
  assert.match(ssh.geste, /insteadOf/);

  const inconnu = lire("failed to run git: exit status 128");
  assert.equal(inconnu.cause, "unknown");
  for (const echec of [reseau, connexion, interdit, sso, ssh, inconnu]) assert.doesNotMatch(`${echec.raison} ${echec.geste}`, BRUT, echec.cause);
});

test("sans compte lu, la page dit « le compte GitHub de la station » ; le type d'un jeton se lit sur son préfixe", () => {
  const echec = lire(INTROUVABLE);
  assert.equal(echec.compte, null);
  assert.match(echec.raison, /^The station's GitHub account cannot see BOBL-tech\/mirrorscreen/);
  assert.equal(typeDeJeton("github_pat_11ABC"), "fine-grained");
  assert.equal(typeDeJeton("ghp_abc\n"), "classic");
  assert.equal(typeDeJeton("gho_abc"), "oauth");
  assert.equal(typeDeJeton("ghs_abc"), "app");
  assert.equal(typeDeJeton("autre"), null);
});
