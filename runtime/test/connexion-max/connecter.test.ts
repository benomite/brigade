// L'étape de connexion Max de l'installation guidée, sur une installation de
// test : un faux `claude` dont `setup-token` imprime un jeton. L'étape le
// range — 600, avec la date de sa création à côté — sans jamais le montrer.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { userInfo } from "node:os";
import { delimiter, join } from "node:path";
import { test, type TestContext } from "node:test";
import { principal, type Machine } from "../../src/connexion-max/connecter-cli.ts";
import { connecterMax, ConnexionNonFaite, extraireLeJeton, MasqueDuJeton, type Lancement } from "../../src/connexion-max/connecter.ts";
import { configJeton } from "../../src/jeton-claude.ts";
import { appeler, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";
import { posixOnly } from "../support/plateforme.ts";

const rienNeReste = temporaireDuFichier();

// Assemblé à l'exécution : écrit en clair, il aurait la forme d'un jeton de Claude.
const JETON = ["sk-ant", "oat01", "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-secret"].join("-");

// Une machine d'essai : le compte qui porte la connexion — le nôtre —, son
// `claude` factice (`setup-token` imprime le jeton sur la sortie standard, et
// ses invites sur la sortie d'erreur), et l'emplacement du jeton.
function installation(t: TestContext, { setupEchoue = false, sansJeton = false, muet = false } = {}) {
  let montre = "";
  const racine = repertoireTemporaire(t);
  const [home, bin, etc] = ["home", "bin", "etc"].map((nom) => join(racine, nom)) as [string, string, string];
  for (const repertoire of [home, bin]) mkdirSync(repertoire, { recursive: true });
  const appels = join(racine, "appels");
  const environnements = join(racine, "environnements");
  writeFileSync(
    join(bin, "claude"),
    [
      "#!/bin/sh",
      `echo "$*" >> "${appels}"`,
      `env | cut -d= -f1 | sort | tr '\\n' ' ' >> "${environnements}"; echo >> "${environnements}"`,
      'case "$1" in',
      muet
        ? '  "setup-token") exec sleep 30 ;;'
        : setupEchoue
        ? '  "setup-token") echo "Open this link" >&2; exit 3 ;;'
        : sansJeton
          ? '  "setup-token") echo "Done." ;;'
          : `  "setup-token") echo "Open this link, paste the code" >&2; printf '\\033[32m✓ Long-lived token:\\033[0m\\n${JETON}\\n' ;;`,
      '  *) echo "commande inattendue : $*" >&2; exit 99 ;;',
      "esac",
      "",
    ].join("\n"),
  );
  chmodSync(join(bin, "claude"), 0o755);
  const compte = userInfo().username;
  let redemarrages = 0;
  const machine: Machine = {
    compte,
    jeton: join(etc, "claude-token"),
    creation: join(etc, "claude-token.cree"),
    environnement: join(etc, "jeton.env"),
    redemarrer: async () => ({ code: ++redemarrages && 0, sortie: "" }),
    path: [bin, "/usr/local/bin", "/usr/bin", "/bin"].join(delimiter),
    lien: join(racine, "lien-claude"),
    installeur: "exit 1",
    home: async () => home,
    root: () => false,
    utilisateur: () => compte,
    afficher: (texte) => void (montre += texte),
    delaiMuet: muet ? 300 : 60_000,
  };
  const lire = (fichier: string) => (existsSync(fichier) ? readFileSync(fichier, "utf8").trim().split("\n") : []);
  return { racine, etc, machine, montre: () => montre, appels: () => lire(appels), environnements: () => lire(environnements) };
}

test("l'installation fait la connexion Max par `claude setup-token`, une fois, et range le jeton en 600 avec sa date à côté", { skip: posixOnly("runs the Max-connection step against a fake `claude` whose setup-token prints a token, and expects one call and the token stored mode 600, accepted by the runtime; on Windows the step launches `claude` by its bare name, which Node's spawn looks up in the PATH only as .com or .exe, so the extensionless #!/bin/sh script the test puts there is not found and the step says `claude` cannot be launched") }, async (t) => {
  const { machine, appels } = installation(t);
  const etape = appeler((appel) => principal(appel, machine));
  assert.equal(await etape.fin, 0, etape.sortie());
  assert.match(etape.sortie(), /`claude setup-token` va te donner un lien/);
  assert.match(etape.sortie(), /connexion Max faite : le jeton est rangé/);
  // `claude` seul a parlé, et une seule fois : pas de login, pas de statut.
  assert.deepEqual(appels(), ["setup-token"]);

  assert.equal(readFileSync(machine.jeton, "utf8"), `${JETON}\n`);
  assert.equal(statSync(machine.jeton).mode & 0o777, 0o600);
  assert.equal(statSync(machine.jeton).uid, userInfo().uid);
  // Le runtime l'accepte tel quel : c'est son emplacement, avec ses droits.
  assert.equal(configJeton({ BRIGADE_CLAUDE_TOKEN_FILE: machine.jeton }, { repertoireEtat: join(machine.jeton, "../etat"), clone: join(machine.jeton, "../clone") }), machine.jeton);
  assert.equal(readFileSync(machine.environnement, "utf8"), `BRIGADE_CLAUDE_TOKEN_FILE=${machine.jeton}\n`);
});

test("la date de création est écrite à côté du jeton, sans le jeton", { skip: posixOnly("runs the Max-connection step against a fake `claude` and expects the token's creation date written in a file of its own, without the token; on Windows the step launches `claude` by its bare name, which Node's spawn looks up in the PATH only as .com or .exe, so the extensionless #!/bin/sh script the test puts there is not found and the step says `claude` cannot be launched") }, async (t) => {
  const { machine } = installation(t);
  const avant = Date.now();
  const etape = appeler((appel) => principal(appel, machine));
  assert.equal(await etape.fin, 0, etape.sortie());
  const date = readFileSync(machine.creation, "utf8").trim();
  assert.ok(Date.parse(date) >= avant - 1000 && Date.parse(date) <= Date.now() + 1000, date);
  assert.doesNotMatch(readFileSync(machine.creation, "utf8"), /sk-ant/);
  assert.notEqual(machine.creation, machine.jeton);
});

test("le jeton n'est affiché dans aucune sortie de l'étape, réussie ou non", { skip: posixOnly("runs the Max-connection step once successfully and once with the token's directory blocked by a file, and expects the token in neither output; on Windows the step launches `claude` by its bare name, which Node's spawn looks up in the PATH only as .com or .exe, so the extensionless #!/bin/sh script the test puts there is not found and the step says `claude` cannot be launched, so the successful run exits 1") }, async (t) => {
  const reussie = installation(t);
  const etape = appeler((appel) => principal(appel, reussie.machine));
  assert.equal(await etape.fin, 0);
  assert.doesNotMatch(etape.sortie(), /sk-ant|secret/);

  // Un jeton qui ne se range pas : l'erreur ne le cite pas non plus.
  const bloquee = installation(t);
  writeFileSync(bloquee.etc, "un fichier là où le répertoire devrait être");
  const echec = appeler((appel) => principal(appel, bloquee.machine));
  assert.equal(await echec.fin, 1);
  assert.match(echec.sortie(), /le jeton ne se range pas dans/);
  assert.doesNotMatch(echec.sortie(), /sk-ant|secret/);
});

test("le chef voit l'interface de `setup-token` — le lien —, jamais le jeton", { skip: posixOnly("runs the Max-connection step and expects the chef to see setup-token's link and prompt but never the token; on Windows the step launches `claude` by its bare name, which Node's spawn looks up in the PATH only as .com or .exe, so the extensionless #!/bin/sh script the test puts there is not found and the step says `claude` cannot be launched") }, async (t) => {
  const { machine, montre } = installation(t);
  const etape = appeler((appel) => principal(appel, machine));
  assert.equal(await etape.fin, 0, etape.sortie());
  assert.match(montre(), /Open this link, paste the code/);
  assert.match(montre(), /Long-lived token/);
  assert.doesNotMatch(montre(), /oat01|secret/);
  assert.doesNotMatch(etape.sortie(), /oat01|secret/);
});

test("un `setup-token` muet est arrêté, et l'étape le dit en une ligne avec le geste pour réessayer", { skip: posixOnly("runs the Max-connection step against a fake `claude` whose setup-token stays silent, and expects it stopped with a one-line message saying to retry; on Windows the step launches `claude` by its bare name, which Node's spawn looks up in the PATH only as .com or .exe, so the extensionless #!/bin/sh script the test puts there is not found and the step says `claude` cannot be launched instead of the silence") }, async (t) => {
  const { machine, etc } = installation(t, { muet: true });
  const etape = appeler((appel) => principal(appel, machine));
  assert.equal(await etape.fin, 1);
  assert.match(etape.sortie(), /connexion Max non faite — `claude setup-token` n'a rien affiché.*relance l'étape pour réessayer/);
  assert.equal(existsSync(etc), false);
});

test("le masque coupe le jeton même découpé en morceaux, et ne retient rien d'autre", () => {
  const entree = `lien https://x\nesc sk-ant-oat01-${"A".repeat(30)}\nfin`;
  for (let pas = 1; pas <= 12; pas++) {
    const masque = new MasqueDuJeton();
    let vu = "";
    for (let i = 0; i < entree.length; i += pas) vu += masque.passer(entree.slice(i, i + pas));
    vu += masque.fin();
    assert.equal(vu, "lien https://x\nesc sk-ant-…\nfin", `pas ${pas}`);
  }
  const fin = new MasqueDuJeton();
  assert.equal(fin.passer("sk"), "");
  assert.equal(fin.fin(), "sk");
});

test("un jeton déjà rangé ne se refait pas", async (t) => {
  const { machine, appels, etc } = installation(t);
  mkdirSync(etc, { recursive: true });
  writeFileSync(machine.jeton, "sk-ant-oat01-deja-la-et-bien-rangee\n", { mode: 0o600 });
  const etape = appeler((appel) => principal(appel, machine));
  assert.equal(await etape.fin, 0, etape.sortie());
  assert.match(etape.sortie(), /déjà faite/);
  assert.deepEqual(appels(), []);
  assert.equal(readFileSync(machine.jeton, "utf8"), "sk-ant-oat01-deja-la-et-bien-rangee\n");
});

test("un `setup-token` qui échoue est dit en une ligne, et rien n'est rangé", { skip: posixOnly("runs the Max-connection step against a fake `claude` whose setup-token exits 3, and expects a one-line failure and nothing stored; on Windows the step launches `claude` by its bare name, which Node's spawn looks up in the PATH only as .com or .exe, so the extensionless #!/bin/sh script the test puts there is not found and the step says `claude` cannot be launched") }, async (t) => {
  const { machine, etc } = installation(t, { setupEchoue: true });
  const etape = appeler((appel) => principal(appel, machine));
  assert.equal(await etape.fin, 1);
  assert.match(etape.sortie(), /connexion Max non faite — `claude setup-token` a rendu 3 : la connexion n'a pas abouti — relance l'étape pour réessayer/);
  assert.equal(existsSync(etc), false);
});

test("un `setup-token` sans jeton lisible : l'étape le dit, sans rien ranger", { skip: posixOnly("runs the Max-connection step against a fake `claude` whose setup-token prints no token, and expects the step to say so and store nothing; on Windows the step launches `claude` by its bare name, which Node's spawn looks up in the PATH only as .com or .exe, so the extensionless #!/bin/sh script the test puts there is not found and the step says `claude` cannot be launched") }, async (t) => {
  const { machine, etc } = installation(t, { sansJeton: true });
  const etape = appeler((appel) => principal(appel, machine));
  assert.equal(await etape.fin, 1);
  assert.match(etape.sortie(), /n'a donné aucun jeton que l'étape sache lire/);
  assert.equal(existsSync(etc), false);
});

test("ni root ni le compte de la station : l'étape refuse, sans rien lancer", async (t) => {
  const { machine, appels } = installation(t);
  const etape = appeler((appel) => principal(appel, { ...machine, compte: "brigade-qui-n-est-pas-moi" }));
  assert.equal(await etape.fin, 2);
  assert.match(etape.sortie(), /elle se fait en root \(sudo\), ou sous le compte brigade-qui-n-est-pas-moi/);
  assert.deepEqual(appels(), []);
});

test("l'étape ne passe à `claude` aucune variable de jeton ou de clé : le jeton naît de `setup-token`", { skip: posixOnly("sets ANTHROPIC_API_KEY and CLAUDE_CODE_OAUTH_TOKEN in the environment and expects the fake `claude` of the Max-connection step to receive neither; on Windows the step launches `claude` by its bare name, which Node's spawn looks up in the PATH only as .com or .exe, so the extensionless #!/bin/sh script the test puts there is not found and the step says `claude` cannot be launched, so the fake never records its environment") }, async (t) => {
  const essai = installation(t);
  const avant = { ...process.env };
  Object.assign(process.env, { ANTHROPIC_API_KEY: "sk-ant-api-test", CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat-test" });
  try {
    const etape = appeler((appel) => principal(appel, essai.machine));
    assert.equal(await etape.fin, 0, etape.sortie());
  } finally {
    for (const nom of ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"]) if (avant[nom] === undefined) delete process.env[nom];
  }
  assert.ok(essai.environnements().length > 0);
  for (const noms of essai.environnements()) assert.doesNotMatch(noms, /ANTHROPIC|CLAUDE_CODE_OAUTH_TOKEN/);
});

test("l'étape lance seulement `claude setup-token` et range ce qu'il a imprimé, daté à son lancement", async () => {
  const lances: string[] = [];
  const rangements: string[] = [];
  const lancerFaux = async (commande: string, args: string[]): Promise<Lancement> => {
    lances.push([commande, ...args].join(" "));
    return { code: 0, sortie: `${JETON}\n` };
  };
  await connecterMax({ lancer: lancerFaux, claude: "claude", jetonRange: () => false, ranger: async (jeton, creation) => void rangements.push(`${jeton === JETON} ${creation}`), dire: () => {}, maintenant: () => new Date("2026-10-16T10:00:00Z") });
  assert.deepEqual(lances, ["claude setup-token"]);
  assert.deepEqual(rangements, ["true 2026-10-16T10:00:00.000Z"]);
});

test("le jeton se lit dans la sortie de `setup-token`, codes d'écran compris", () => {
  assert.equal(extraireLeJeton(`\u001b[1mvoici\u001b[0m\n${JETON}\n`), JETON);
  assert.equal(extraireLeJeton("rien de lisible\n"), null);
});

test("une commande `claude` introuvable est dite comme telle", async () => {
  await assert.rejects(
    connecterMax({ lancer: async () => ({ code: 127, sortie: "" }), claude: "claude", jetonRange: () => false, ranger: async () => {}, dire: () => {} }),
    (erreur: unknown) => erreur instanceof ConnexionNonFaite && /ne se lance pas/.test(erreur.message),
  );
});

test("rien ne reste", () => rienNeReste());
