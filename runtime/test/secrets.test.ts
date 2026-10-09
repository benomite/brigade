// Les secrets d'un projet : ce que son dépôt déclare, ce que la machine
// détient, ce qui en parvient à un cook — et ce qui s'en cache.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ConfigInvalide } from "../src/runtime.ts";
import { configSecrets, DECLARATION, lireSecrets, type Secrets } from "../src/secrets.ts";
import { repertoireTemporaire } from "./outils.ts";

// Un worktree qui déclare, et un fichier de valeurs sur la machine.
function projet(t: TestContext, declaration: string | null, valeurs: string | null) {
  const racine = repertoireTemporaire(t);
  const worktree = join(racine, "worktree");
  mkdirSync(join(worktree, ".claude/brigade"), { recursive: true });
  if (declaration !== null) writeFileSync(join(worktree, DECLARATION), declaration);
  const fichier = join(racine, "secrets.env");
  if (valeurs !== null) writeFileSync(fichier, valeurs, { mode: 0o600 });
  return { worktree, fichier, racine };
}

function prets(lus: ReturnType<typeof lireSecrets>): Secrets {
  if (!lus.pret) assert.fail(`secrets refusés : ${lus.problemes.join(" ; ")}`);
  return lus;
}

const problemes = (lus: ReturnType<typeof lireSecrets>): string[] => (lus.pret ? [] : lus.problemes);

test("un projet qui ne déclare rien n'a pas de secret, et le fichier de la machine n'est pas lu", (t) => {
  const { worktree, racine } = projet(t, null, null);
  for (const fichier of [null, join(racine, "absent.env")]) {
    const secrets = prets(lireSecrets(worktree, fichier));
    assert.deepEqual(secrets.env, {});
    assert.equal(secrets.masquer("rien à cacher"), "rien à cacher");
    assert.deepEqual(secrets.fuites("rien à cacher"), []);
  }
});

test("un cook reçoit ce que son dépôt déclare, et rien d'autre de ce que la machine détient", (t) => {
  const { worktree, fichier } = projet(
    t,
    "# la base de test\nDATABASE_URL\n\n  STRIPE_KEY  \n",
    ["# valeurs de dev", "DATABASE_URL=postgres://dev:motdepasse@localhost/test", "export STRIPE_KEY='sk_test_4eC39HqLyjWDarjtT1'", 'AUTRE_PROJET="une-valeur-non-declaree"', ""].join("\n"),
  );
  assert.deepEqual(prets(lireSecrets(worktree, fichier)).env, {
    DATABASE_URL: "postgres://dev:motdepasse@localhost/test",
    STRIPE_KEY: "sk_test_4eC39HqLyjWDarjtT1",
  });
});

test("une valeur se remplace sans rien redémarrer : elle est relue à chaque lecture", (t) => {
  const { worktree, fichier } = projet(t, "CLE_API\n", "CLE_API=premiere-valeur\n");
  assert.equal(prets(lireSecrets(worktree, fichier)).env.CLE_API, "premiere-valeur");
  writeFileSync(fichier, "CLE_API=seconde-valeur\n");
  assert.equal(prets(lireSecrets(worktree, fichier)).env.CLE_API, "seconde-valeur");
});

test("un secret déclaré sans valeur est un problème qui nomme la variable et le fichier", (t) => {
  const { worktree, fichier } = projet(t, "DATABASE_URL\nCLE_API\n", "CLE_API=une-valeur-de-dev\n");
  assert.deepEqual(problemes(lireSecrets(worktree, fichier)), [`\`DATABASE_URL\` : aucune valeur dans ${fichier}`]);
});

test("un dépôt qui déclare sur une machine sans fichier de secrets : le problème dit quelle variable poser", (t) => {
  const { worktree } = projet(t, "DATABASE_URL\n", null);
  assert.match(problemes(lireSecrets(worktree, null)).join("\n"), /BRIGADE_SECRETS_FILE n'est pas défini.*DATABASE_URL/s);
});

test("un fichier de valeurs absent, lisible par d'autres, ou mal écrit ne donne rien — et ne cite jamais une valeur", (t) => {
  const absent = projet(t, "CLE_API\n", null);
  assert.match(problemes(lireSecrets(absent.worktree, absent.fichier)).join("\n"), /illisible ou absent/);

  const ouvert = projet(t, "CLE_API\n", "CLE_API=une-valeur-de-dev\n");
  chmodSync(ouvert.fichier, 0o644);
  assert.match(problemes(lireSecrets(ouvert.worktree, ouvert.fichier)).join("\n"), /lisible par d'autres.*chmod 600/);

  const malEcrit = projet(t, "CLE_API\n", "CLE_API=une-valeur-de-dev\nune-ligne-sans-egal-tres-secrete\n");
  const dits = problemes(lireSecrets(malEcrit.worktree, malEcrit.fichier)).join("\n");
  assert.match(dits, /ligne 2.*NOM=valeur/);
  assert.equal(dits.includes("tres-secrete"), false);
});

test("un nom mal écrit, ou que le runtime se réserve, ne se déclare pas", (t) => {
  const reserves = ["BRIGADE_STATE_DIR", "ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "GH_TOKEN", "GITHUB_TOKEN", "GIT_CONFIG_COUNT", "PATH", "HOME"];
  const { worktree, fichier } = projet(t, ["pas un nom", ...reserves].join("\n"), reserves.map((nom) => `${nom}=une-valeur-longue`).join("\n"));
  const dits = problemes(lireSecrets(worktree, fichier));
  assert.match(dits[0] ?? "", /ligne 1.*n'est pas un nom de variable/);
  for (const nom of reserves) assert.ok(dits.some((dit) => dit.includes(`\`${nom}\``) && dit.includes("réservé au runtime")), nom);
  assert.equal(dits.length, reserves.length + 1);
});

test("moins de huit caractères, ce n'est pas un secret : la valeur est refusée plutôt que masquée à moitié", (t) => {
  const { worktree, fichier } = projet(t, "MOT_DE_PASSE\nVIDE\n", "MOT_DE_PASSE=test\nVIDE=\n");
  const dits = problemes(lireSecrets(worktree, fichier));
  assert.equal(dits.length, 2);
  for (const dit of dits) assert.match(dit, /moins de 8 caractères.*worktree-setup\.sh/);
});

test("ce qui se reconnaît comme de la production est refusé : un nom qui la dit, une marque de clé live", (t) => {
  const { worktree, fichier } = projet(
    t,
    "DATABASE_URL_PROD\nPRODUCTION_KEY\nSTRIPE_LIVE_KEY\nSTRIPE_KEY\nPRODUCT_ID\nDELIVERY_TOKEN\n",
    ["DATABASE_URL_PROD=postgres://prod", "PRODUCTION_KEY=une-valeur-longue", "STRIPE_LIVE_KEY=une-valeur-longue", "STRIPE_KEY=sk_live_4eC39HqLyjWDarjtT1", "PRODUCT_ID=identifiant-de-produit", "DELIVERY_TOKEN=jeton-de-livraison"].join("\n"),
  );
  const dits = problemes(lireSecrets(worktree, fichier));
  assert.deepEqual(
    dits.map((dit) => /`(\w+)`/.exec(dit)?.[1]),
    ["DATABASE_URL_PROD", "PRODUCTION_KEY", "STRIPE_LIVE_KEY", "STRIPE_KEY"],
  );
  assert.match(dits.join("\n"), /production/);
  assert.equal(dits.join("\n").includes("sk_live_4eC39"), false);
});

test("le masque remplace chaque valeur par le nom de sa variable, la plus longue d'abord", (t) => {
  const { worktree, fichier } = projet(t, "JETON\nJETON_LONG\n", "JETON=abcdefgh\nJETON_LONG=abcdefgh-et-la-suite\n");
  const { masquer, fuites } = prets(lireSecrets(worktree, fichier));
  assert.equal(masquer("env: JETON=abcdefgh JETON_LONG=abcdefgh-et-la-suite fin"), "env: JETON=[secret:JETON] JETON_LONG=[secret:JETON_LONG] fin");
  assert.deepEqual(fuites("+TOKEN = 'abcdefgh-et-la-suite'"), ["JETON", "JETON_LONG"]);
  assert.deepEqual(fuites("+rien"), []);
});

test("le masque atteint aussi la valeur telle qu'un flux JSON l'écrit", (t) => {
  const valeur = 'mot"de\\passe-de-dev';
  const { worktree, fichier } = projet(t, "MOT_DE_PASSE\n", `MOT_DE_PASSE=${valeur}\n`);
  const { masquer } = prets(lireSecrets(worktree, fichier));
  const ligne = JSON.stringify({ type: "result", result: `le mot de passe est ${valeur}.` });
  const masquee = masquer(ligne);
  assert.equal(JSON.parse(masquee).result, "le mot de passe est [secret:MOT_DE_PASSE].");
});

test("sans BRIGADE_SECRETS_FILE, le projet n'a pas de fichier de secrets", () => {
  assert.equal(configSecrets({}, { repertoireEtat: "/etat", clone: "/clone" }), null);
  assert.equal(configSecrets({ BRIGADE_SECRETS_FILE: "" }, { repertoireEtat: "/etat", clone: "/clone" }), null);
});

test("le fichier de secrets est refusé au démarrage s'il est relatif, absent, ouvert, ou rangé dans l'état ou le clone", (t) => {
  const { fichier, racine } = projet(t, null, "CLE_API=une-valeur-de-dev\n");
  const lieux = { repertoireEtat: join(racine, "etat"), clone: join(racine, "clone") };
  assert.equal(configSecrets({ BRIGADE_SECRETS_FILE: fichier }, lieux), fichier);

  const refuse = (valeur: string, motif: RegExp) =>
    assert.throws(
      () => configSecrets({ BRIGADE_SECRETS_FILE: valeur }, lieux),
      (erreur) => erreur instanceof ConfigInvalide && motif.test(erreur.message),
    );
  refuse("secrets.env", /chemin absolu/);
  refuse(join(racine, "absent.env"), /illisible ou absent/);
  for (const dedans of [lieux.repertoireEtat, lieux.clone]) {
    mkdirSync(dedans, { recursive: true });
    writeFileSync(join(dedans, "secrets.env"), "CLE_API=une-valeur-de-dev\n", { mode: 0o600 });
    refuse(join(dedans, "secrets.env"), /hors de BRIGADE_STATE_DIR et de BRIGADE_REPO_DIR/);
  }
  chmodSync(fichier, 0o640);
  refuse(fichier, /chmod 600/);
});
