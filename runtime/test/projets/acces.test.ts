// L'accès d'une station au dépôt d'un projet, vérifié sur le remote de son
// clone avant de le servir : un vrai git, contre une origine nue sur le disque
// (qui laisse tout faire) et un dépôt sur 127.0.0.1 qui refuse tout
// (`../aides/depot-qui-refuse.ts`). Aucun réseau.
import assert from "node:assert/strict";
import { test, type TestContext } from "../support/posix.ts";
import { lireLeRefus, verifierAcces, type Acces } from "../../src/projets/acces.ts";
import { depotQuiRefuse } from "../aides/depot-qui-refuse.ts";
import { BASE, depotGit, ENV_GIT, git, portsFermesALInstant, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

// Le git d'une station : sans configuration globale — donc sans credential
// helper —, et qui ne vérifie pas le certificat fait pour le test.
const envDe = (t: TestContext, plus: Record<string, string> = {}) => ({ ...ENV_GIT, HOME: repertoireTemporaire(t), GIT_SSL_NO_VERIFY: "1", ...plus });

function verifier(t: TestContext, clone: string, plus: Record<string, string> = {}): Promise<Acces> {
  return verifierAcces({ station: "box", depot: "benomite/parade", base: BASE, clone, env: envDe(t, plus) });
}

test("une origine qui laisse récupérer et pousser : l'accès est libre", async (t) => {
  const { clone } = depotGit(t);
  assert.deepEqual(await verifier(t, clone), { etat: "libre" });
});

test("un dépôt en https, sans credential helper : la récupération est refusée vite, et le geste est `gh auth setup-git`", async (t) => {
  const distant = await depotQuiRefuse(t, { statut: 401, tls: true });
  const { clone } = depotGit(t);
  git(clone, "remote", "set-url", "origin", distant.url);
  const debut = Date.now();
  const acces = await verifier(t, clone);
  assert.ok(Date.now() - debut < 30_000, "un accès refusé échoue en secondes, sans attendre une réponse");
  assert.equal(acces.etat, "bloque");
  if (acces.etat !== "bloque") return;
  assert.equal(acces.bloque, "fetch");
  assert.match(acces.raison, /^box cannot fetch from benomite\/parade: git has no credentials for https:\/\/127\.0\.0\.1:\d+ and no credential helper to ask for them \(git: could not read Username for 'https:\/\/127\.0\.0\.1:\d+': terminal prompts disabled\)\.$/);
  assert.match(acces.geste, /`gh auth setup-git`/);
  assert.ok(distant.requetes.length > 0, "git a bien joint le dépôt");
});

test("un credential helper qui ne donne rien : le geste est de reconnecter gh, puis de le prêter à git", async (t) => {
  const distant = await depotQuiRefuse(t, { statut: 401, tls: true });
  const { clone } = depotGit(t);
  git(clone, "remote", "set-url", "origin", distant.url);
  const acces = await verifier(t, clone, { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "credential.helper", GIT_CONFIG_VALUE_0: "!true" });
  assert.equal(acces.etat, "bloque");
  if (acces.etat !== "bloque") return;
  assert.match(acces.raison, /git's credential helper gives no valid credentials/);
  assert.match(acces.geste, /`gh auth login`.*`gh auth setup-git`/);
});

test("un dépôt qui refuse la lecture au compte de la station : bloqué en récupération, avec la page où lui donner le droit", async (t) => {
  const distant = await depotQuiRefuse(t, { statut: 403 });
  const { clone } = depotGit(t);
  git(clone, "remote", "set-url", "origin", distant.url);
  const acces = await verifier(t, clone);
  assert.equal(acces.etat, "bloque");
  if (acces.etat !== "bloque") return;
  assert.equal(acces.bloque, "fetch");
  assert.match(acces.raison, /^box cannot fetch from benomite\/parade: its GitHub account has no read access to it \(git: .*403\)\.$/);
  assert.match(acces.geste, /read access to benomite\/parade.*https:\/\/github\.com\/benomite\/parade\/settings\/access/);
});

test("un dépôt qui laisse récupérer mais refuse de pousser : bloqué en écriture, avec une raison propre au push", async (t) => {
  const distant = await depotQuiRefuse(t, { statut: 403 });
  const { clone } = depotGit(t);
  git(clone, "remote", "set-url", "--push", "origin", distant.url);
  const acces = await verifier(t, clone);
  assert.equal(acces.etat, "bloque");
  if (acces.etat !== "bloque") return;
  assert.equal(acces.bloque, "push");
  assert.match(acces.raison, /^box can fetch from benomite\/parade but cannot push to it: its GitHub account has no write access to it \(git: .*403\)\.$/);
  assert.match(acces.geste, /write access to benomite\/parade/);
  // Le push est à blanc : il s'est authentifié, rien n'a été envoyé.
  assert.ok(distant.requetes.every((requete) => requete.startsWith("GET ") && requete.includes("service=git-receive-pack")), distant.requetes.join("\n"));
});

test("un dépôt qui n'existe pas : bloqué en récupération, le geste dit comment voir ce que voit le compte", async (t) => {
  const { clone } = depotGit(t);
  git(clone, "remote", "set-url", "origin", `${repertoireTemporaire(t)}/absent.git`);
  const acces = await verifier(t, clone);
  assert.equal(acces.etat, "bloque");
  if (acces.etat !== "bloque") return;
  assert.equal(acces.bloque, "fetch");
  assert.match(acces.raison, /does not exist, or that its account may not see it/);
  assert.match(acces.geste, /`gh repo view benomite\/parade`/);
});

test("un dépôt injoignable n'est pas un refus : la station réessaie, sans geste à faire", async (t) => {
  const [port] = await portsFermesALInstant(1);
  const { clone } = depotGit(t);
  git(clone, "remote", "set-url", "origin", `http://127.0.0.1:${port}/benomite/parade.git`);
  const acces = await verifier(t, clone);
  assert.equal(acces.etat, "injoignable");
  if (acces.etat !== "injoignable") return;
  assert.match(acces.dit, /git did not reach http:\/\/127\.0\.0\.1:\d+/);
});

test("par ssh : une clé refusée, ou un hôte inconnu, ont chacun leur geste", () => {
  const refus = (erreurs: string) => lireLeRefus({ operation: "fetch", station: "box", depot: "benomite/parade", clone: "/clones/parade", url: "git@github.com:benomite/parade.git", erreurs, helper: false });
  const cle = refus("git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.");
  assert.match(cle?.raison ?? "", /git@github\.com refuses the ssh key of the station/);
  assert.match(cle?.geste ?? "", /`gh ssh-key add <key>\.pub`/);
  const hote = refus("Host key verification failed.\nfatal: Could not read from remote repository.");
  assert.match(hote?.geste ?? "", /`ssh -T git@github\.com`/);
  // Le réseau tombé n'est pas un refus.
  assert.equal(refus("ssh: Could not resolve hostname github.com: Temporary failure in name resolution\nfatal: Could not read from remote repository."), null);
  // Un échec inconnu dit sa ligne de git, et comment la revoir.
  const inconnu = refus("fatal: protocol error: bad line length 1234");
  assert.match(inconnu?.raison ?? "", /\(git: protocol error: bad line length 1234\)\.$/);
  assert.match(inconnu?.geste ?? "", /`git -C \/clones\/parade ls-remote origin`/);
});

test("acces.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
