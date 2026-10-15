// L'étape de connexion Max de l'installation guidée, sur une installation de
// test : une vraie station (son process, sa veille), le vrai renouvellement
// du paquet, et un faux `claude` dont le login pose une connexion. L'étape la
// fait, puis attend que la station la reconnaisse.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { userInfo } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { principal, type Machine } from "../../src/connexion-max/connecter-cli.ts";
import { connecterMax, ConnexionNonFaite, type Lancement } from "../../src/connexion-max/connecter.ts";
import { lireConnexionExposee } from "../../src/connexion-max/veille.ts";
import { appeler, lancer, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

const STATION = join(import.meta.dirname, "../../src/station/main.ts");
const RENOUVELLEMENT = join(import.meta.dirname, "../../deploy/brigade-renouvellement");

// Une machine d'essai : le répertoire de la station, le compte qui porte la
// connexion — le nôtre —, et son `claude`, factice : `auth login` pose une
// connexion, `auth status` dit si elle est là, `mcp list` ne fait rien.
function installation(t: TestContext, { connecte = false, loginEchoue = false } = {}) {
  const racine = repertoireTemporaire(t);
  const [station, home, bin] = ["station", "home", "bin"].map((nom) => join(racine, nom)) as [string, string, string];
  for (const repertoire of [station, join(home, ".claude"), bin]) mkdirSync(repertoire, { recursive: true });
  const appels = join(racine, "appels");
  const environnements = join(racine, "environnements");
  writeFileSync(
    join(bin, "claude"),
    [
      "#!/bin/sh",
      'C="$HOME/.claude/.credentials.json"',
      `echo "$*" >> "${appels}"`,
      `env | cut -d= -f1 | sort | tr '\\n' ' ' >> "${environnements}"; echo >> "${environnements}"`,
      'case "$1 $2" in',
      `  "auth status") if [ -e "$C" ]; then echo '{ "loggedIn": true, "authMethod": "claude.ai" }'; else echo '{ "loggedIn": false }'; exit 1; fi ;;`,
      loginEchoue ? '  "auth login") exit 3 ;;' : `  "auth login") printf 'connexion' > "$C"; chmod 600 "$C" ;;`,
      "  \"mcp list\") echo 'No MCP servers configured.' ;;",
      '  *) echo "commande inattendue : $*" >&2; exit 99 ;;',
      "esac",
      "",
    ].join("\n"),
  );
  chmodSync(join(bin, "claude"), 0o755);
  if (connecte) writeFileSync(join(home, ".claude/.credentials.json"), "connexion");
  const compte = userInfo().username;
  const machine: Machine = {
    station,
    compte,
    renouvellement: RENOUVELLEMENT,
    path: `${bin}:/usr/local/bin:/usr/bin:/bin`,
    lien: join(racine, "lien-claude"),
    installeur: "exit 1",
    home: async () => home,
    root: () => false,
    utilisateur: () => compte,
  };
  const lire = (fichier: string) => (existsSync(fichier) ? readFileSync(fichier, "utf8").trim().split("\n") : []);
  return { station, home, machine, appels: () => lire(appels), environnements: () => lire(environnements) };
}

// La station de la machine d'essai, telle que son unité la lance.
async function demarrerStation(t: TestContext, station: string, home: string) {
  const enfant = lancer(t, STATION, [], { BRIGADE_STATION_DIR: station, HOME: home });
  await enfant.attendre("station démarrée");
  return enfant;
}

test("pendant l'installation, l'étape fait la connexion Max par `claude`, et la station la reconnaît comme valide", async (t) => {
  const { station, home, machine, appels } = installation(t);
  const servie = await demarrerStation(t, station, home);
  // Installée, la station attend un login : rien n'est encore connecté.
  assert.notEqual(lireConnexionExposee(join(station, "connexion-max.json"))?.etat, "connectee");

  const etape = appeler((appel) => principal(appel, machine));
  assert.equal(await etape.fin, 0, etape.sortie());
  assert.match(etape.sortie(), /`claude` va te donner un lien/);
  assert.match(etape.sortie(), /connexion Max ouverte/);
  assert.match(etape.sortie(), /la station la reconnaît : connexion Max valide/);
  assert.match(etape.sortie(), /la station la renouvelle seule ; si elle se perd, le seul geste est un login/);

  const exposee = lireConnexionExposee(join(station, "connexion-max.json"));
  assert.equal(exposee?.etat, "connectee");
  // Le journal de service de la station le dit aussi.
  await servie.attendre("connexion Max valide");
  // `claude` seul a parlé : le login, puis le renouvellement qui le consigne.
  assert.deepEqual(appels(), ["auth status", "auth login --claudeai", "auth status", "mcp list"]);
  assert.match(readFileSync(join(station, ".session/renouvellement"), "utf8"), /^verifie=/m);
});

test("une connexion déjà ouverte ne se refait pas : l'étape la fait seulement constater à la station", async (t) => {
  const { station, home, machine, appels } = installation(t, { connecte: true });
  await demarrerStation(t, station, home);
  const etape = appeler((appel) => principal(appel, machine));
  assert.equal(await etape.fin, 0, etape.sortie());
  assert.match(etape.sortie(), /déjà ouverte/);
  assert.equal(appels().includes("auth login --claudeai"), false);
  assert.equal(lireConnexionExposee(join(station, "connexion-max.json"))?.etat, "connectee");
});

test("un login qui échoue est dit en une ligne, et rien n'est consigné comme connecté", async (t) => {
  const { station, machine } = installation(t, { loginEchoue: true });
  const etape = appeler((appel) => principal(appel, machine));
  assert.equal(await etape.fin, 1);
  assert.match(etape.sortie(), /connexion Max non faite — `claude auth login` a rendu 3 : la connexion n'a pas abouti — relance l'étape pour réessayer/);
  assert.equal(existsSync(join(station, ".session/renouvellement")), false);
});

test("ni root ni le compte de la station : l'étape refuse, sans rien lancer", async (t) => {
  const { machine, appels } = installation(t);
  const etape = appeler((appel) => principal(appel, { ...machine, compte: "brigade-qui-n-est-pas-moi" }));
  assert.equal(await etape.fin, 2);
  assert.match(etape.sortie(), /elle se fait en root \(sudo\), ou sous le compte brigade-qui-n-est-pas-moi/);
  assert.deepEqual(appels(), []);
});

test("le quota Max ne passe que par `claude` : l'étape ne lance rien d'autre que lui et le renouvellement, sans aucune variable de jeton", async (t) => {
  const lances: string[] = [];
  const exposition = join(repertoireTemporaire(t), "connexion-max.json");
  let connecte = false;
  const lancerFaux = async (commande: string, args: string[]): Promise<Lancement> => {
    lances.push(commande);
    if (commande === "claude" && args[1] === "login") connecte = true;
    if (commande === "claude") return { code: 0, sortie: `{ "loggedIn": ${connecte} }` };
    // Le renouvellement est passé, et la station l'a vu.
    writeFileSync(exposition, JSON.stringify({ etat: "connectee", verifiee: new Date(Date.now() + 1000).toISOString() }));
    return { code: 0, sortie: "" };
  };
  await connecterMax({ lancer: lancerFaux, claude: "claude", renouvellement: "/usr/lib/brigade-station/renouvellement", exposition, dire: () => {} });
  assert.deepEqual(new Set(lances), new Set(["claude", "/usr/lib/brigade-station/renouvellement"]));

  // Et sur l'installation d'essai, `claude` n'a reçu aucune variable par
  // laquelle il parlerait à Anthropic autrement que par la connexion Max.
  const essai = installation(t);
  await demarrerStation(t, essai.station, essai.home);
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

test("la station qui ne reconnaît pas la connexion à temps : l'étape le dit, avec ce que la station expose", async (t) => {
  const exposition = join(repertoireTemporaire(t), "connexion-max.json");
  writeFileSync(exposition, JSON.stringify({ etat: "perdue", raison: "session-refusee", depuis: "2026-10-15T11:00:00.000Z" }));
  let instant = Date.parse("2026-10-15T12:00:00Z");
  const promesse = connecterMax({
    lancer: async (commande) => ({ code: 0, sortie: commande === "claude" ? '{ "loggedIn": true }' : "" }),
    claude: "claude",
    renouvellement: "renouvellement",
    exposition,
    dire: () => {},
    attenteMs: 10_000,
    maintenant: () => new Date(instant),
    dormir: async (ms) => void (instant += ms),
  });
  await assert.rejects(promesse, (erreur: unknown) => erreur instanceof ConnexionNonFaite && /ne l'a pas reconnue en 10 s — elle dit : connexion Max perdue/.test(erreur.message));
});

test("rien ne reste", () => rienNeReste());
