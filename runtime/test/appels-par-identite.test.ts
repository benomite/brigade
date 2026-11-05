// Les appels GitHub comptés par identité, et ce que `status` en dit (#2316) :
// le mode qu'a annoncé la cuisine — une identité par rôle, ou l'identité
// unique —, puis le compte du cook, de la pass, du manager et du chef.
// Les appels partent par le vrai client (`github.ts`), sous un faux transport :
// c'est le compte qu'il porte qui fait l'identité, rien d'autre.
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test, type TestContext } from "node:test";
import { IDENTITES, ROLES_DES_APPS, fermerLeCompteurDuProcess, identiteDuCompte, lireAppelsParIdentite, noterLeModeDesIdentites, type AppelsParIdentite } from "../src/appels-par-identite.ts";
import { ouvrirGitHub, type Transport } from "../src/github.ts";
import { ouvrirLimitesDuCompte } from "../src/github-limite.ts";
import { ROLES } from "../src/identites.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { ouvrirLimite } from "../src/limite-github.ts";
import { fermerLesMesuresDuProcess } from "../src/mesures-github.ts";
import { photoDuProjet } from "../src/status.ts";

// Le compteur du process se pose sur l'environnement à son premier appel : la
// station de ce fichier est la sienne, posée avant tout appel. Le compteur et
// les mesures du process y gardent leur base ouverte : fermées d'abord, sans quoi
// Windows refuse d'effacer la station (EPERM, #2419).
const STATION = mkdtempSync(join(tmpdir(), "brigade-test-station-"));
process.env.BRIGADE_STATION_DIR = STATION;
after(() => {
  fermerLeCompteurDuProcess();
  fermerLesMesuresDuProcess();
  rmSync(STATION, { recursive: true, force: true });
});

const MAINTENANT = new Date("2026-11-04T12:00:00.000Z");
const DEPOT = "acme/parade";
const JETON = "ghs_pass_jeton_du_role_0123456789";
const CLE = "-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----";

// Répond à tout, comme `gh api -i` : un 201, sans corps qui compte.
const transport: Transport = async () => ({ erreur: null, stdout: 'HTTP/2.0 201 Created\r\nContent-Type: application/json\r\n\r\n{"id":1}', stderr: "" });

let rang = 0;
// Un client sous le compte `compte` — un rôle et son jeton, ou, sans rien, le `gh` de la machine.
const client = (compte?: string) =>
  ouvrirGitHub({
    depot: DEPOT,
    // Propre à chaque client : les lectures gardées ne se partagent pas.
    bin: `faux-gh-identite-${rang++}`,
    transport,
    limite: ouvrirLimite(),
    limitesDuCompte: ouvrirLimitesDuCompte(),
    ...(compte === undefined ? {} : { compte, jeton: async () => JETON, identite: async () => `brigade-${compte}[bot]` }),
  });

function projet(t: TestContext) {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-test-projet-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const journal = ouvrirJournal(repertoire, { maintenant: () => MAINTENANT });
  journal.ajouter({ project: "parade", ticket: null, author: "runtime", type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
  journal.fermer();
  return { BRIGADE_STATE_DIR: repertoire, BRIGADE_STATION_DIR: STATION };
}

const photo = (env: Record<string, string>) => photoDuProjet(env, { maintenant: MAINTENANT });
// Les deux lignes de `status` : le mode, et les appels de chaque identité.
const lignesDIdentite = (lignes: string[]) => {
  const rang = lignes.findIndex((ligne) => ligne.startsWith("identity   "));
  return lignes.slice(rang, rang + 2);
};
const ecart = (avant: AppelsParIdentite, apres: AppelsParIdentite) => Object.fromEntries(IDENTITES.map((identite) => [identite, apres[identite] - avant[identite]]));

test("les rôles comptés ici sont ceux qui ont leur App, et tout autre compte est celui du chef", () => {
  assert.deepEqual([...ROLES_DES_APPS], [...ROLES]);
  assert.deepEqual(IDENTITES, ["cook", "pass", "manager", "chef"]);
  assert.deepEqual(["cook", "pass", "manager", "gh", undefined].map(identiteDuCompte), ["cook", "pass", "manager", "chef", "chef"]);
});

test("sans Apps, status dit l'identité unique, et chaque appel se compte au compte du chef", async (t) => {
  const env = projet(t);
  noterLeModeDesIdentites(env, "parade", false);
  const github = client();
  await github.commenter(1, "un");
  await github.commenter(1, "deux");

  assert.deepEqual(lignesDIdentite(photo(env)), [
    "identity   GitHub — single identity, the machine's `gh`: the chef's account is the kitchen's, nothing reserves the merge for the pass",
    "           calls by identity: cook 0, pass 0, manager 0, chef's account 2",
  ]);
});

test("sans rien de noté — ni mode, ni compteur —, status dit l'identité unique et zéro appel", (t) => {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-test-projet-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const journal = ouvrirJournal(repertoire, { maintenant: () => MAINTENANT });
  journal.ajouter({ project: "parade", ticket: null, author: "runtime", type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
  journal.fermer();

  assert.deepEqual(lignesDIdentite(photo({ BRIGADE_STATE_DIR: repertoire })), [
    "identity   GitHub — single identity, the machine's `gh`: the chef's account is the kitchen's, nothing reserves the merge for the pass",
    "           calls by identity: cook 0, pass 0, manager 0, chef's account 0",
  ]);
});

test("avec les trois Apps, status dit une identité par rôle, et un appel sous une App n'augmente que le compte de cette App", async (t) => {
  const env = projet(t);
  noterLeModeDesIdentites(env, "parade", true);
  assert.equal(lignesDIdentite(photo(env))[0], "identity   GitHub — one identity per role");

  for (const role of ROLES) {
    const avant = lireAppelsParIdentite(env, "parade").appels;
    await client(role).commenter(1, `sous ${role}`);
    const apres = lireAppelsParIdentite(env, "parade").appels;
    assert.deepEqual(ecart(avant, apres), { cook: 0, pass: 0, manager: 0, chef: 0, [role]: 1 }, role);
  }
  // Un autre projet de la station, sans Apps, garde son mode.
  assert.equal(lireAppelsParIdentite(env, "autre").roles, false);
});

test("lire status ne remet aucun compte à zéro, et ni clé ni jeton n'y paraît", async (t) => {
  const env = projet(t);
  noterLeModeDesIdentites(env, "parade", true);
  await client("pass").commenter(1, CLE);
  await client().commenter(1, "du chef");

  const premiere = photo(env);
  const seconde = photo(env);
  assert.deepEqual(lignesDIdentite(seconde), lignesDIdentite(premiere));
  const avant = lireAppelsParIdentite(env, "parade").appels;
  assert.ok(avant.pass >= 1 && avant.chef >= 1);
  await client("pass").commenter(1, "encore");
  assert.deepEqual(ecart(avant, lireAppelsParIdentite(env, "parade").appels), { cook: 0, pass: 1, manager: 0, chef: 0 });

  const sortie = [...premiere, ...photo(env)].join("\n");
  assert.ok(!sortie.includes(JETON) && !sortie.includes("ghs_"), "un jeton paraît dans status");
  assert.ok(!sortie.includes("PRIVATE KEY") && !sortie.includes("MIIEow"), "une clé paraît dans status");
  assert.ok(!sortie.includes("[bot]"), "un login paraît dans status");
  // Le compteur lui-même n'en garde rien, ni dans sa base ni dans son journal (WAL).
  const repertoire = join(STATION, "appels-github");
  const fichiers = readdirSync(repertoire).filter((nom) => nom.startsWith("identites.db"));
  assert.ok(fichiers.length >= 1);
  for (const nom of fichiers) {
    const compteur = readFileSync(join(repertoire, nom)).toString("latin1");
    assert.ok(!compteur.includes(JETON) && !compteur.includes("PRIVATE KEY") && !compteur.includes("[bot]"), nom);
  }
});
