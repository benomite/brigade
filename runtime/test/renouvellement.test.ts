// Le renouvellement de la session Max : `brigade-renouvellement` lance `claude`
// hors cloison pour qu'il rafraîchisse son jeton, constate par `stat` seulement
// que le fichier d'identifiants a été réécrit, et consigne ce qu'il a vu dans
// un fichier d'état que le runtime pourra lire. Ni systemd ni vraie connexion
// ici : un `claude` factice, écrit par chaque test, joue ce qu'il a à jouer.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { posixOnly } from "./support/plateforme.ts";
import { repertoireTemporaire } from "./outils.ts";

const RENOUVELLEMENT = join(import.meta.dirname, "../deploy/brigade-renouvellement");
const REUSSI = 0;
const ECHEC = 1;
const REFUS = 2;
// Ce que porte le fichier d'identifiants : rien de ce qui se lit ne doit le citer.
const SECRET = "jeton-qui-ne-doit-jamais-sortir";

// Ce que `claude mcp list` fait aux identifiants, et ce que `claude auth status` dit.
type Rafraichir = "rien" | "renouvelle" | "vide" | { echoue: string };
type Statut = "ouverte" | "fermee" | "illisible";

type Box = {
  identifiants: string;
  etat: string;
  // Lance `brigade-renouvellement` ; `env` s'ajoute à l'environnement du compte.
  passer: (args?: string[], env?: Record<string, string>) => { code: number | null; sortie: string; erreur: string };
  // Ce que le fichier d'état porte, clé par clé.
  consigne: () => Record<string, string>;
  // Les appels reçus par `claude`, et l'environnement de chacun : ses noms.
  appels: () => string[];
  environnements: () => string[][];
};

// Le compte du service : sa connexion Max (un fichier qu'aucun test ne laisse
// lire), son `claude` factice, le répertoire du fichier d'état.
function box(t: TestContext, { rafraichir = "rien", statut = "ouverte", connecte = true }: { rafraichir?: Rafraichir; statut?: Statut; connecte?: boolean } = {}): Box {
  const racine = repertoireTemporaire(t);
  const [home, bin, session, temoins] = ["home", "bin", "session", "temoins"].map((nom) => join(racine, nom)) as [string, string, string, string];
  for (const repertoire of [join(home, ".claude"), bin, session, temoins]) mkdirSync(repertoire, { recursive: true });
  const identifiants = join(home, ".claude/.credentials.json");
  const etat = join(session, "renouvellement");
  if (connecte) poserIdentifiants(identifiants);

  // Les identifiants que `claude` réécrit : un fichier neuf, toujours illisible.
  const reecrire = (contenu: string) => `rm -f "$C"; printf '%s' '${contenu}' > "$C"; chmod 000 "$C"`;
  const mcp =
    rafraichir === "rien" ? "echo 'No MCP servers configured.'"
    : rafraichir === "renouvelle" ? reecrire(SECRET + "-neuf")
    : rafraichir === "vide" ? reecrire("{}")
    : `echo "${rafraichir.echoue}" >&2; exit 1`;
  const auth =
    statut === "ouverte" ? `echo '{ "loggedIn": true, "authMethod": "claude.ai" }'`
    : statut === "fermee" ? `echo '{ "loggedIn": false, "authMethod": "none" }'; exit 1`
    : "echo 'pas du json'";
  writeFileSync(
    join(bin, "claude"),
    [
      "#!/bin/sh",
      `C="\${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.credentials.json"`,
      // Le `wc` de BSD aligne son compte à droite : l'arithmétique le rend nu.
      `n=$(($(ls "${temoins}" | wc -l)))`,
      `echo "$*" > "${temoins}/$n.args"`,
      `env | cut -d= -f1 | sort > "${temoins}/$n.env"`,
      `case "$1 $2" in`,
      `  "mcp list") ${mcp} ;;`,
      `  "auth status") ${auth} ;;`,
      `  *) echo "commande inattendue : $*" >&2; exit 99 ;;`,
      "esac",
      "",
    ].join("\n"),
  );
  chmodSync(join(bin, "claude"), 0o755);

  const passer: Box["passer"] = (args = [], env = {}) => {
    const fin = spawnSync(RENOUVELLEMENT, args, {
      encoding: "utf8",
      env: { HOME: home, PATH: `${bin}:/usr/local/bin:/usr/bin:/bin`, BRIGADE_SESSION_STATE: etat, ...env },
    });
    return { code: fin.status, sortie: fin.stdout, erreur: fin.stderr };
  };
  const consigne = () =>
    Object.fromEntries(
      readFileSync(etat, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((ligne) => [ligne.slice(0, ligne.indexOf("=")), ligne.slice(ligne.indexOf("=") + 1)]),
    );
  const numeros = () =>
    readdirSync(temoins)
      .filter((nom) => nom.endsWith(".args"))
      .map((nom) => Number(nom.slice(0, -".args".length)))
      .sort((a, b) => a - b);
  const appels = () => numeros().map((n) => readFileSync(join(temoins, `${n}.args`), "utf8").trim());
  const environnements = () => numeros().map((n) => readFileSync(join(temoins, `${n}.env`), "utf8").split("\n").filter(Boolean));
  return { identifiants, etat, passer, consigne, appels, environnements };
}

// Une connexion Max posée il y a une heure, que personne ne peut lire.
function poserIdentifiants(fichier: string, ilYA = 3600): void {
  rmSync(fichier, { force: true });
  writeFileSync(fichier, SECRET);
  chmodSync(fichier, 0o000);
  const date = new Date(Date.now() - ilYA * 1000);
  utimesSync(fichier, date, date);
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const isoDe = (fichier: string) => new Date(Math.floor(statSync(fichier).mtimeMs / 1000) * 1000).toISOString().replace(".000Z", "Z");

describe("le renouvellement de la session Max", { skip: posixOnly("runs a fake claude, gh or gates written as a POSIX shell script"), concurrency: 8 }, () => {
  test("claude renouvelle : le passage consigne la date où il a réécrit ses identifiants, et la dit", (t) => {
    const b = box(t, { rafraichir: "renouvelle", statut: "ouverte" });
    const fin = b.passer();
    assert.equal(fin.code, REUSSI, fin.erreur);
    assert.deepEqual(b.appels(), ["mcp list", "auth status"]);
    const consigne = b.consigne();
    assert.equal(consigne.renouvele, isoDe(b.identifiants));
    assert.equal(consigne.ecrits, consigne.renouvele);
    assert.match(consigne.verifie ?? "", ISO);
    assert.equal(consigne.echec, undefined);
    assert.match(fin.sortie, /session renouvelée : identifiants réécrits le /);
  });

  test("rien à renouveler : le passage le consigne sans bruit, et ne demande rien de plus à claude", (t) => {
    const b = box(t, { rafraichir: "rien" });
    const ecrits = isoDe(b.identifiants);
    const fin = b.passer();
    assert.equal(fin.code, REUSSI, fin.erreur);
    // `auth status`, près de l'échéance, lancerait un rafraîchissement sans l'attendre.
    assert.deepEqual(b.appels(), ["mcp list"]);
    assert.deepEqual(Object.keys(b.consigne()).sort(), ["ecrits", "verifie"]);
    assert.equal(b.consigne().ecrits, ecrits);
    assert.equal(fin.sortie, "");
  });

  test("claude échoue : la date et la nature de l'échec sont consignées, et le passage sort en code non nul", (t) => {
    const b = box(t, { rafraichir: { echoue: "connexion refusée par api.anthropic.com" } });
    const fin = b.passer();
    assert.equal(fin.code, ECHEC);
    const consigne = b.consigne();
    assert.match(consigne.echec ?? "", ISO);
    assert.equal(consigne.echec_nature, "claude-en-echec");
    assert.match(consigne.echec_detail ?? "", /a rendu 1 : connexion refusée par api\.anthropic\.com$/);
    assert.equal(consigne.verifie, undefined);
    assert.match(fin.erreur, /échec \(claude-en-echec\)/);
  });

  test("Anthropic refuse le renouvellement : claude vide ses identifiants, le passage dit qu'il faut /login", (t) => {
    const b = box(t, { rafraichir: "vide", statut: "fermee" });
    const fin = b.passer();
    assert.equal(fin.code, ECHEC);
    assert.deepEqual(b.appels(), ["mcp list", "auth status"]);
    assert.equal(b.consigne().echec_nature, "session-refusee");
    assert.match(b.consigne().echec_detail ?? "", /`claude \/login` sous le compte du service/);
    assert.equal(b.consigne().renouvele, undefined);
  });

  test("identifiants réécrits mais statut illisible : c'est un échec, pas un renouvellement", (t) => {
    const b = box(t, { rafraichir: "renouvelle", statut: "illisible" });
    assert.equal(b.passer().code, ECHEC);
    assert.equal(b.consigne().echec_nature, "statut-illisible");
    assert.equal(b.consigne().renouvele, undefined);
  });

  test("aucune connexion Max sous le compte : l'échec est consigné sans lancer claude", (t) => {
    const b = box(t, { connecte: false });
    assert.equal(b.passer().code, ECHEC);
    assert.deepEqual(b.appels(), []);
    assert.equal(b.consigne().echec_nature, "identifiants-absents");
  });

  test("des identifiants plus vieux qu'un jeton ne vit, jamais réécrits : le renouvellement n'a pas eu lieu", (t) => {
    const b = box(t, { rafraichir: "rien" });
    poserIdentifiants(b.identifiants, 9 * 3600);
    assert.equal(b.passer().code, ECHEC);
    assert.equal(b.consigne().echec_nature, "non-renouvele");
    // La durée de vie se règle : sous elle, rien à redire.
    assert.equal(b.passer([], { BRIGADE_SESSION_LIFETIME: String(10 * 3600) }).code, REUSSI);
  });

  test("un claude introuvable est un échec nommé", (t) => {
    const b = box(t);
    assert.equal(b.passer([], { BRIGADE_CLAUDE_BIN: "claude-qui-n-existe-pas" }).code, ECHEC);
    assert.equal(b.consigne().echec_nature, "claude-introuvable");
  });

  test("un échec garde le dernier renouvellement, et un passage réussi garde le dernier échec", (t) => {
    const b = box(t, { rafraichir: "renouvelle" });
    assert.equal(b.passer().code, REUSSI);
    const renouvele = b.consigne().renouvele;
    assert.equal(b.passer([], { BRIGADE_CLAUDE_BIN: "claude-qui-n-existe-pas" }).code, ECHEC);
    assert.equal(b.consigne().renouvele, renouvele);
    const echec = b.consigne().echec;
    assert.match(echec ?? "", ISO);
    assert.equal(b.passer().code, REUSSI);
    assert.equal(b.consigne().echec, echec);
    assert.equal(b.consigne().echec_nature, "claude-introuvable");
  });

  test("le fichier d'identifiants n'est jamais lu : illisible, il ne change rien, et rien de ce qu'il porte ne sort", (t) => {
    for (const rafraichir of ["renouvelle", "rien", "vide"] as const) {
      const b = box(t, { rafraichir, statut: rafraichir === "vide" ? "fermee" : "ouverte" });
      const fin = b.passer();
      assert.notEqual(fin.code, REFUS, fin.erreur);
      assert.ok(![fin.sortie, fin.erreur, readFileSync(b.etat, "utf8")].some((texte) => texte.includes(SECRET)));
    }
  });

  test("claude part dans un environnement vidé : aucune clé ni aucun jeton du compte ne lui passe", (t) => {
    const b = box(t, { rafraichir: "renouvelle" });
    const fin = b.passer([], { ANTHROPIC_API_KEY: "cle", ANTHROPIC_AUTH_TOKEN: "jeton", CLAUDE_CODE_OAUTH_TOKEN: "jeton", AUTRE: "x" });
    assert.equal(fin.code, REUSSI, fin.erreur);
    for (const noms of b.environnements()) {
      // Ce que `sh` pose de lui-même mis à part, il n'a que HOME et PATH.
      assert.deepEqual(noms.filter((nom) => !["PWD", "SHLVL", "_", "OLDPWD"].includes(nom)), ["HOME", "PATH"]);
    }
  });

  test("le passage n'écrit que le fichier d'état", (t) => {
    const b = box(t, { rafraichir: "renouvelle" });
    b.passer();
    assert.deepEqual(readdirSync(join(b.etat, "..")), ["renouvellement"]);
  });

  test("l'essai dit ce qu'un passage ferait, sans identifiants réels, sans rien lancer ni écrire", (t) => {
    for (const connecte of [true, false]) {
      const b = box(t, { connecte });
      const fin = b.passer(["--essai"]);
      assert.equal(fin.code, REUSSI, fin.erreur);
      assert.deepEqual(b.appels(), []);
      assert.equal(existsSync(b.etat), false);
      assert.match(fin.sortie, /rien n'est lancé, rien n'est écrit/);
      assert.match(fin.sortie, /lancerait, depuis .*\/claude mcp list — environnement vidé : HOME PATH/);
      assert.match(fin.sortie, connecte ? /jamais ouverts/ : /identifiants-absents/);
      assert.ok(!fin.sortie.includes(SECRET));
    }
  });

  test("sans fichier d'état désigné, ou avec un argument inconnu, il refuse et ne lance rien", (t) => {
    const b = box(t);
    for (const [args, env] of [
      [[], { BRIGADE_SESSION_STATE: "" }],
      [[], { BRIGADE_SESSION_STATE: "relatif/renouvellement" }],
      [[], { BRIGADE_SESSION_LIFETIME: "huit heures" }],
      [["--forcer"], {}],
    ] as const) {
      const fin = b.passer([...args], env);
      assert.equal(fin.code, REFUS, `${args} ${JSON.stringify(env)}`);
    }
    assert.deepEqual(b.appels(), []);
    assert.equal(existsSync(b.etat), false);
  });
});
