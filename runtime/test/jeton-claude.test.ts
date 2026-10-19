// Le jeton longue durée de la connexion Max : où le runtime le lit, et à qui
// il le remet.
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { format } from "node:util";
import { JETON_MASQUE, masquerIdentifiants } from "../src/identifiants.ts";
import { configJeton, direJeton, environnementClaude, FICHIER_DU_JETON, masquerLaConsole, VARIABLE_DU_JETON } from "../src/jeton-claude.ts";
import { ConfigInvalide } from "../src/runtime.ts";
import { repertoireTemporaire } from "./outils.ts";

const JETON = "sk-ant-oat01-un-jeton-fabrique-pour-le-test";

// Une machine : l'état et le clone du projet, et le fichier du jeton à côté.
function machine(t: TestContext, contenu: string | null = `${JETON}\n`, mode = 0o600) {
  const racine = repertoireTemporaire(t);
  const lieux = { repertoireEtat: join(racine, "etat"), clone: join(racine, "depot") };
  mkdirSync(lieux.repertoireEtat);
  mkdirSync(lieux.clone);
  const fichier = join(racine, "jeton-claude");
  if (contenu !== null) writeFileSync(fichier, contenu, { mode });
  return { racine, lieux, fichier };
}

test("sans BRIGADE_CLAUDE_TOKEN_FILE, il n'y a pas de jeton : rien n'est refusé", () => {
  const lieux = { repertoireEtat: "/etat", clone: "/clone" };
  assert.equal(configJeton({}, lieux), null);
  assert.equal(configJeton({ [FICHIER_DU_JETON]: "" }, lieux), null);
  // Le jeton posé dans l'environnement n'est pas l'emplacement, et ne fait rien refuser.
  assert.equal(configJeton({ [VARIABLE_DU_JETON]: JETON }, lieux), null);
});

test("le fichier du jeton, lisible du seul compte et hors de l'état et du clone, est retenu par son chemin", (t) => {
  const { lieux, fichier } = machine(t);
  assert.equal(configJeton({ [FICHIER_DU_JETON]: fichier }, lieux), fichier);
});

test("un fichier de jeton qu'on ne pourrait pas lire, ou que d'autres liraient, fait refuser de démarrer", (t) => {
  const { lieux, fichier, racine } = machine(t);
  const dansLEtat = join(lieux.repertoireEtat, "jeton");
  writeFileSync(dansLEtat, JETON, { mode: 0o600 });
  const dansLeClone = join(lieux.clone, "jeton");
  writeFileSync(dansLeClone, JETON, { mode: 0o600 });
  const ouvert = join(racine, "ouvert");
  writeFileSync(ouvert, JETON, { mode: 0o644 });
  const vide = join(racine, "vide");
  writeFileSync(vide, "\n", { mode: 0o600 });

  for (const [valeur, motif] of [
    ["jeton-claude", /n'est pas un chemin absolu/],
    [join(racine, "absent"), /est illisible ou absent/],
    [ouvert, /lisible par d'autres que le compte du service.*chmod 600/],
    [dansLEtat, /hors de BRIGADE_STATE_DIR et de BRIGADE_REPO_DIR/],
    [dansLeClone, /hors de BRIGADE_STATE_DIR et de BRIGADE_REPO_DIR/],
    [vide, /ne porte aucun jeton.*claude setup-token/],
  ] as const) {
    assert.throws(
      () => configJeton({ [FICHIER_DU_JETON]: valeur }, lieux),
      (erreur: unknown) => erreur instanceof ConfigInvalide && /^BRIGADE_CLAUDE_TOKEN_FILE invalide/.test(erreur.message) && motif.test(erreur.message),
      valeur,
    );
  }
  // Le refus nomme le fichier, jamais son contenu.
  assert.throws(() => configJeton({ [FICHIER_DU_JETON]: ouvert }, lieux), (erreur: Error) => !erreur.message.includes(JETON));
  assert.equal(configJeton({ [FICHIER_DU_JETON]: fichier }, lieux), fichier);
});

test("un `claude` lancé reçoit le jeton du fichier dans CLAUDE_CODE_OAUTH_TOKEN, relu à chaque lancement", (t) => {
  const { fichier } = machine(t);
  const env = { [FICHIER_DU_JETON]: fichier };
  const base = { PATH: "/usr/bin", HOME: "/home/brigade" };

  assert.deepEqual(environnementClaude(base, env), { ...base, CLAUDE_CODE_OAUTH_TOKEN: JETON });
  // `base` n'est pas touché : ce que la station garde du setup ne le porte pas.
  assert.deepEqual(base, { PATH: "/usr/bin", HOME: "/home/brigade" });

  writeFileSync(fichier, "sk-ant-oat01-le-jeton-suivant\n", { mode: 0o600 });
  assert.equal(environnementClaude(base, env).CLAUDE_CODE_OAUTH_TOKEN, "sk-ant-oat01-le-jeton-suivant");
});

test("seul l'emplacement fournit le jeton : un CLAUDE_CODE_OAUTH_TOKEN venu d'ailleurs est remplacé, ou retiré", (t) => {
  const { fichier } = machine(t);
  const base = { PATH: "/usr/bin", CLAUDE_CODE_OAUTH_TOKEN: "exporte-par-un-setup" };

  assert.equal(environnementClaude(base, { [FICHIER_DU_JETON]: fichier }).CLAUDE_CODE_OAUTH_TOKEN, JETON);
  assert.deepEqual(environnementClaude(base, {}), { PATH: "/usr/bin" });
  assert.deepEqual(environnementClaude(base, { CLAUDE_CODE_OAUTH_TOKEN: "pose-dans-le-runtime" }), { PATH: "/usr/bin" });
});

test("sans jeton lisible au moment du lancement, `claude` part sur la connexion du compte, sans rien qui plante", (t) => {
  const { fichier } = machine(t);
  const base = { PATH: "/usr/bin" };
  rmSync(fichier);
  assert.deepEqual(environnementClaude(base, { [FICHIER_DU_JETON]: fichier }), base);
  writeFileSync(fichier, "", { mode: 0o600 });
  assert.deepEqual(environnementClaude(base, { [FICHIER_DU_JETON]: fichier }), base);
});

test("le démarrage dit d'où vient la connexion de `claude`, sans jamais citer le jeton", (t) => {
  const { fichier } = machine(t);
  assert.match(direJeton(null, {}), /the account's own \(BRIGADE_CLAUDE_TOKEN_FILE is not set\)$/);
  assert.match(direJeton(fichier, {}), new RegExp(`long-lived token read from ${fichier}, read again at each launch`));
  const ignore = direJeton(null, { CLAUDE_CODE_OAUTH_TOKEN: JETON });
  assert.match(ignore, /CLAUDE_CODE_OAUTH_TOKEN is in the runtime's environment: it is passed to no `claude`/);
  assert.equal(ignore.includes(JETON), false);
});

// Une valeur que rien ne reconnaît à sa forme : seul ce que le runtime a lu la masque.
const SANS_FORME = "jeton-de-la-machine-sans-la-forme-connue";

test("le jeton lu dans le fichier est masqué par sa valeur, même sans la forme `sk-ant-…` — et celui qui le remplace aussi", (t) => {
  const { lieux, fichier } = machine(t, `${SANS_FORME}-1\n`);
  const dit = (n: number) => `le cook a lu ${SANS_FORME}-${n} dans son environnement`;
  assert.equal(masquerIdentifiants(dit(1)).masques, 0);

  configJeton({ [FICHIER_DU_JETON]: fichier }, lieux);
  assert.deepEqual(masquerIdentifiants(dit(1)), { texte: `le cook a lu ${JETON_MASQUE} dans son environnement`, masques: 1 });

  writeFileSync(fichier, `${SANS_FORME}-2\n`, { mode: 0o600 });
  environnementClaude({}, { [FICHIER_DU_JETON]: fichier });
  assert.equal(masquerIdentifiants(dit(2)).texte, `le cook a lu ${JETON_MASQUE} dans son environnement`);
  // L'ancien reste masqué : un jeton remplacé n'est pas pour autant public.
  assert.equal(masquerIdentifiants(dit(1)).texte.includes(SANS_FORME), false);
});

test("un CLAUDE_CODE_OAUTH_TOKEN transmis à personne est masqué quand même : celui du runtime, celui qu'un setup exporte", () => {
  const duRuntime = `${SANS_FORME}-du-runtime`;
  const duSetup = `${SANS_FORME}-d-un-setup`;
  configJeton({ [VARIABLE_DU_JETON]: duRuntime }, { repertoireEtat: "/etat", clone: "/clone" });
  environnementClaude({ [VARIABLE_DU_JETON]: duSetup }, {});
  assert.deepEqual(masquerIdentifiants(`${duRuntime} / ${duSetup}`), { texte: `${JETON_MASQUE} / ${JETON_MASQUE}`, masques: 2 });
});

test("ce que le runtime écrit sur sa sortie — journald — passe par le masque, erreurs comprises", (t) => {
  const { lieux, fichier } = machine(t, `${SANS_FORME}-console\n`);
  configJeton({ [FICHIER_DU_JETON]: fichier }, lieux);
  const ecrit: string[] = [];
  // Une console qui met en forme comme la vraie.
  const brut = (...valeurs: unknown[]) => void ecrit.push(format(...valeurs));
  const sortie = { log: brut, info: brut, warn: brut, error: brut };
  masquerLaConsole(sortie);

  sortie.log(`brigade : jeton ${SANS_FORME}-console`);
  sortie.error("brigade : %s, 100 %%", `${SANS_FORME}-console`);
  sortie.warn(Object.assign(new Error(`gh a dit ${SANS_FORME}-console`), { stderr: `${SANS_FORME}-console` }));
  sortie.info({ env: { CLAUDE_CODE_OAUTH_TOKEN: `${SANS_FORME}-console` } });

  assert.equal(ecrit.length, 4);
  assert.equal(ecrit.some((ligne) => ligne.includes(SANS_FORME)), false);
  assert.equal(ecrit[0], `brigade : jeton ${JETON_MASQUE}`);
  assert.equal(ecrit[1], `brigade : ${JETON_MASQUE}, 100 %`);
  assert.match(ecrit[2] ?? "", new RegExp(`gh a dit \\[jeton Claude masqué\\][\\s\\S]*stderr`));
});
