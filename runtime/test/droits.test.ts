// Un fichier de secrets n'est lu qu'au seul compte du service : sous macOS et
// Linux par ses bits de mode, sous Windows par son ACL — et le runtime écrit
// les siens ainsi.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { configIdentites, ROLES } from "../src/identites.ts";
import { configJeton } from "../src/jeton-claude.ts";
import { ConfigInvalide } from "../src/runtime.ts";
import { configSecrets, lireSecrets } from "../src/secrets.ts";
import { defautDeLAcl, ecrireSecret, lireAcl, ouvertADAutres, ouvertsParLAcl, remedeWindows, type Acl, type Regle } from "../src/droits.ts";
import { EVERYONE, exposer, icacls, REMEDE, USERS } from "./aides/droits.ts";
import { repertoireTemporaire } from "./outils.ts";
import { posixOnly, windowsOnly } from "./support/plateforme.ts";

const MOI = "S-1-5-21-1004336348-1177238915-682003330-1001";
const AUTRE = "S-1-5-21-1004336348-1177238915-682003330-1002";
const SYSTEM = "S-1-5-18";
const ADMINISTRATORS = "S-1-5-32-544";
const TOUT = 0x1f01ff;
const LECTURE = 0x120089;

const regle = (sid: string, droits = TOUT, plus: Partial<Regle> = {}): Regle => ({ sid, autorise: true, droits, heritageSeul: false, ...plus });
const acl = (regles: Regle[], plus: Partial<Acl> = {}): Acl => ({ compte: MOI, proprietaire: MOI, daclNulle: false, regles, ...plus });

test("an ACL that grants only the service account and SYSTEM keeps the file closed — denials and inherit-only entries change nothing", () => {
  assert.deepEqual(ouvertsParLAcl(acl([regle(MOI)])), []);
  assert.deepEqual(
    ouvertsParLAcl(
      acl([
        regle(MOI),
        regle(SYSTEM),
        regle(EVERYONE, TOUT, { autorise: false }),
        // Creator Owner, pour ce qu'un dossier crée : rien sur le fichier lui-même.
        regle("S-1-3-0", TOUT, { heritageSeul: true }),
        regle(USERS, 0),
      ]),
    ),
    [],
  );
  // Owner Rights vaut pour le propriétaire : le compte du service, ici.
  assert.deepEqual(ouvertsParLAcl(acl([regle(MOI), regle("S-1-3-4", LECTURE)])), []);
  // SYSTEM et Administrators peuvent tout prendre, comme root : leur propriété n'ouvre rien de plus.
  assert.deepEqual(ouvertsParLAcl(acl([regle(MOI)], { proprietaire: SYSTEM })), []);
  assert.deepEqual(ouvertsParLAcl(acl([regle(MOI)], { proprietaire: ADMINISTRATORS })), []);
});

test("any grant to another account or group opens the file — Everyone, Users, Authenticated Users, Administrators, another user — each named", () => {
  for (const [sid, nom] of [
    [EVERYONE, "Everyone (S-1-1-0)"],
    [USERS, "Users (S-1-5-32-545)"],
    ["S-1-5-11", "Authenticated Users (S-1-5-11)"],
    [ADMINISTRATORS, "Administrators (S-1-5-32-544)"],
    [AUTRE, AUTRE],
  ] as const) {
    assert.deepEqual(ouvertsParLAcl(acl([regle(MOI), regle(sid, LECTURE)])), [nom], sid);
    // Comme `chmod 600` refuse aussi l'écriture et l'exécution des autres : n'importe quel droit ouvre.
    assert.deepEqual(ouvertsParLAcl(acl([regle(MOI), regle(sid, 0x2)])), [nom], sid);
  }
  assert.deepEqual(ouvertsParLAcl(acl([regle(MOI), regle(USERS, LECTURE), regle(EVERYONE, LECTURE)])), ["Users (S-1-5-32-545)", "Everyone (S-1-1-0)"]);
});

test("a file with no ACL at all is open to everyone; a foreign owner opens it too, since it can grant itself read", () => {
  assert.deepEqual(ouvertsParLAcl(acl([], { daclNulle: true })), ["Everyone (S-1-1-0), le fichier n'ayant aucune ACL"]);
  assert.deepEqual(ouvertsParLAcl(acl([regle(MOI)], { proprietaire: AUTRE })), [`${AUTRE}, son propriétaire`]);
  // Owner Rights, quand le propriétaire est un autre : c'est lui qu'elle ouvre.
  assert.deepEqual(ouvertsParLAcl(acl([regle(MOI), regle("S-1-3-4", LECTURE)], { proprietaire: AUTRE })), ["Owner Rights (S-1-3-4)", `${AUTRE}, son propriétaire`]);
});

test("on Windows, the refusal names the file, who can read it, and the icacls commands that close it", () => {
  const fichier = "C:\\Users\\brigade\\secrets.env";
  const dit = defautDeLAcl(fichier, acl([regle(MOI), regle(EVERYONE, LECTURE)]), "ce sont les secrets du projet");
  assert.equal(
    dit,
    `est lisible par d'autres que le compte du service (Everyone (S-1-1-0)) — ce sont les secrets du projet : \`icacls "${fichier}" /reset\`, puis \`icacls "${fichier}" /inheritance:r /grant:r *${MOI}:F\``,
  );
  assert.equal(defautDeLAcl(fichier, acl([regle(MOI)]), "ce sont les secrets du projet"), null);
  // Un propriétaire étranger se reprend d'abord.
  assert.deepEqual(remedeWindows(fichier, acl([regle(MOI)], { proprietaire: AUTRE }))[0], [fichier, "/setowner", `*${MOI}`]);
});

test("on macOS and Linux, the mode bits decide, as before: 600 is closed, any bit for group or others opens", { skip: posixOnly("writes a secret at 600, then chmods it to each group and other bit in turn and expects each refused with `chmod 600`; on Windows chmod only toggles read-only, and the check reads the file's ACL instead of mode bits") }, (t) => {
  const fichier = join(repertoireTemporaire(t), "secrets.env");
  ecrireSecret(fichier, "CLE_API=une-valeur-de-dev\n");
  assert.equal(statSync(fichier).mode & 0o777, 0o600);
  assert.equal(ouvertADAutres(fichier, "ce sont les secrets du projet"), null);
  for (const mode of [0o640, 0o604, 0o620, 0o602, 0o610, 0o601]) {
    chmodSync(fichier, mode);
    assert.equal(ouvertADAutres(fichier, "ce sont les secrets du projet"), "est lisible par d'autres que le compte du service — ce sont les secrets du projet : chmod 600", mode.toString(8));
  }
});

// Le SID du compte qui joue le test, selon Windows lui-même.
function monSid(): string {
  const fait = spawnSync("whoami", ["/user", "/fo", "csv", "/nh"], { encoding: "utf8", windowsHide: true });
  const sid = /"(S-1-[\d-]+)"/.exec(fait.stdout ?? "")?.[1];
  assert.ok(sid, `whoami /user : ${fait.stdout}${fait.stderr}`);
  return sid;
}

// L'ACL du fichier telle qu'`icacls /save` l'écrit : son SDDL, sans passer par le runtime.
function sddl(fichier: string, dossier: string): { protegee: boolean; entrees: Array<{ type: string; sid: string }> } {
  const sauve = join(dossier, "acl.txt");
  icacls(fichier, "/save", sauve);
  const texte = readFileSync(sauve, "utf16le").replace(/^\uFEFF/, "");
  const ligne = texte.split(/\r?\n/).find((l) => l.includes("D:")) ?? "";
  const [, drapeaux = "", entrees = ""] = /D:([A-Z]*)((?:\([^)]*\))*)/.exec(ligne) ?? [];
  assert.ok(ligne !== "", `icacls /save : ${texte}`);
  return {
    protegee: drapeaux.includes("P"),
    entrees: [...entrees.matchAll(/\(([^;]*);[^;]*;[^;]*;[^;]*;[^;]*;([^)]*)\)/g)].map(([, type = "", sid = ""]) => ({ type, sid })),
  };
}

test("on Windows, a secrets file the runtime writes is readable by the current account alone, and stays so when rewritten", { skip: windowsOnly("reads Windows ACLs") }, (t) => {
  const dossier = repertoireTemporaire(t);
  const fichier = join(dossier, "appairage.json");
  const moi = monSid();
  // Le compte Administrator intégré s'écrit `LA` dans un SDDL.
  const estMoi = (sid: string) => sid === moi || (sid === "LA" && moi.endsWith("-500"));

  ecrireSecret(fichier, "un code d'appairage\n");
  ecrireSecret(fichier, "un code d'appairage renouvelé\n");
  writeFileSync(fichier, "réécrit sans précaution\n");

  const lue = sddl(fichier, dossier);
  assert.equal(lue.protegee, true, "l'ACL n'hérite plus de son dossier");
  assert.ok(lue.entrees.length > 0);
  for (const entree of lue.entrees) assert.ok(entree.type === "A" && estMoi(entree.sid), `${entree.type};${entree.sid} — attendu le seul compte ${moi}`);
  assert.equal(readFileSync(fichier, "utf8"), "réécrit sans précaution\n");
  // Et le runtime lit ce qu'icacls a lu.
  assert.equal(lireAcl(fichier).compte, moi);
  assert.equal(ouvertADAutres(fichier, "c'est l'état de la station"), null);
});

test("on Windows, a file opened to Everyone or Users, or inheriting Users from its folder, is refused, named — and the given commands close it", { skip: windowsOnly("reads Windows ACLs") }, (t) => {
  const racine = repertoireTemporaire(t);
  const quoi = "ce sont les secrets du projet";

  const ouvertATous = join(racine, "tous.env");
  ecrireSecret(ouvertATous, "CLE_API=une-valeur-de-dev\n");
  exposer(ouvertATous, EVERYONE);
  assert.match(ouvertADAutres(ouvertATous, quoi) ?? "", /^est lisible par d'autres que le compte du service \(Everyone \(S-1-1-0\)\) — ce sont les secrets du projet : /);

  const ouvertAuxUtilisateurs = join(racine, "utilisateurs.env");
  ecrireSecret(ouvertAuxUtilisateurs, "CLE_API=une-valeur-de-dev\n");
  exposer(ouvertAuxUtilisateurs, USERS);
  assert.match(ouvertADAutres(ouvertAuxUtilisateurs, quoi) ?? "", /\(Users \(S-1-5-32-545\)\)/);

  // Un dossier qui donne la lecture à Users pour tout ce qui s'y crée.
  const partage = join(racine, "partage");
  mkdirSync(partage);
  icacls(partage, "/grant", `*${USERS}:(OI)(CI)(R)`);
  const herite = join(partage, "secrets.env");
  writeFileSync(herite, "CLE_API=une-valeur-de-dev\n");
  assert.match(ouvertADAutres(herite, quoi) ?? "", /Users \(S-1-5-32-545\)/);

  for (const fichier of [ouvertATous, ouvertAuxUtilisateurs, herite]) {
    const dit = ouvertADAutres(fichier, quoi) ?? "";
    assert.ok(dit.includes(`icacls "${fichier}" /reset`), dit);
    assert.match(dit, REMEDE);
    // Les commandes dites, jouées telles quelles, ferment le fichier.
    for (const etape of remedeWindows(fichier, lireAcl(fichier))) icacls(...etape);
    assert.equal(ouvertADAutres(fichier, quoi), null, fichier);
    assert.equal(readFileSync(fichier, "utf8"), "CLE_API=une-valeur-de-dev\n");
  }
});

test("starting with a secrets file, a Max token or an App key that another account can read is refused, the file named with its fix — and no cook gets the secrets", (t) => {
  const racine = repertoireTemporaire(t);
  const lieux = { repertoireEtat: join(racine, "etat"), clone: join(racine, "clone") };
  const refuse = (lire: () => unknown, variable: string, fichier: string) =>
    assert.throws(lire, (erreur: unknown) => {
      assert.ok(erreur instanceof ConfigInvalide, String(erreur));
      assert.ok(erreur.message.startsWith(`${variable} invalide : « ${fichier} » est lisible par d'autres que le compte du service`), erreur.message);
      assert.match(erreur.message, REMEDE);
      return true;
    });

  const secrets = join(racine, "secrets.env");
  ecrireSecret(secrets, "CLE_API=une-valeur-de-dev\n");
  const jeton = join(racine, "jeton-claude");
  ecrireSecret(jeton, "sk-ant-oat01-un-jeton-fabrique-pour-le-test\n");
  const apps = join(racine, "apps");
  mkdirSync(apps);
  ROLES.forEach((role, rang) => {
    writeFileSync(join(apps, `${role}.id`), `${1001 + rang}\n`);
    ecrireSecret(join(apps, `${role}.pem`), "pas une clé, mais au seul compte\n");
  });

  // Fermés, ils passent : la clé n'est refusée que d'être mal écrite.
  assert.equal(configSecrets({ BRIGADE_SECRETS_FILE: secrets }, lieux), secrets);
  assert.equal(configJeton({ BRIGADE_CLAUDE_TOKEN_FILE: jeton }, lieux), jeton);
  assert.throws(() => configIdentites({ BRIGADE_GITHUB_APPS_DIR: apps }), /cook\.pem » n'est pas une clé privée/);

  exposer(secrets);
  exposer(jeton);
  exposer(join(apps, "cook.pem"));
  refuse(() => configSecrets({ BRIGADE_SECRETS_FILE: secrets }, lieux), "BRIGADE_SECRETS_FILE", secrets);
  refuse(() => configJeton({ BRIGADE_CLAUDE_TOKEN_FILE: jeton }, lieux), "BRIGADE_CLAUDE_TOKEN_FILE", jeton);
  refuse(() => configIdentites({ BRIGADE_GITHUB_APPS_DIR: apps }), "BRIGADE_GITHUB_APPS_DIR", join(apps, "cook.pem"));

  // Ouvert après le démarrage, le fichier n'est plus lu : aucun lancement ne part avec ses valeurs.
  const worktree = join(racine, "worktree");
  mkdirSync(join(worktree, ".claude/brigade"), { recursive: true });
  writeFileSync(join(worktree, ".claude/brigade/secrets"), "CLE_API\n");
  const lus = lireSecrets(worktree, secrets);
  assert.equal(lus.pret, false);
  assert.match(lus.pret ? "" : lus.problemes.join("\n"), REMEDE);
});
