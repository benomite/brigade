// Le second de chaque projet, par le guichet de la station (#1413) : le
// téléphone appairé lit sa conversation et lui écrit, et c'est la conversation
// du second du desktop — ce que le téléphone y écrit, le desktop le lit à la
// même source, et ce que le desktop y a écrit, le téléphone le lit. Un second
// qui échoue ou qu'on ne joint pas le dit en une phrase ; sans jeton valable,
// rien ne se lit et rien ne part.
//
// `claude` est une doublure qui joue un tour comme `claude -p` : elle range le
// message du chef, puis sa réponse, dans le transcript de la session du
// dossier, là où Claude Code les range.
//
// Ce que le test ouvre — guichet, base des téléphones — se ferme par
// `aArreter`, avant que ses répertoires disparaissent.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { lireLaConversation } from "../../src/second/conversation.ts";
import { CONFIGURATION } from "../../src/station/configuration.ts";
import { ouvrirTelephones } from "../../src/telephone/appairage.ts";
import { ouvrirGuichet } from "../../src/telephone/guichet.ts";
import { secondsDeLaStation } from "../../src/telephone/second.ts";
import { aArreter, DEPOT, ENV_ENFANT, repertoireTemporaire } from "../outils.ts";

const SESSION = "0b6c1c2e-4f5a-4b7c-9d8e-1f2a3b4c5d6e";

// La doublure de `claude -p` : son lancement noté, le message lu sur son
// entrée, puis rangé avec la réponse dans la session du dossier — la dernière
// avec `--continue`, une neuve sans. `FAUX_SECOND_FEU` : elle ne répond que
// quand ce fichier existe — et avec `FAUX_SECOND_MEURT`, elle échoue alors, le
// message rangé. `FAUX_SECOND_ECHEC` : elle échoue d'emblée, comme `claude`
// sans quota, sans rien ranger.
const FAUX_CLAUDE = String.raw`
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAUX_SECOND_TEMOIN, JSON.stringify({ args, cwd: process.cwd() }) + "\n");
if (process.env.FAUX_SECOND_ECHEC) {
  process.stderr.write("Error: " + process.env.FAUX_SECOND_ECHEC + "\n");
  process.exit(1);
}
let texte = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (morceau) => (texte += morceau));
process.stdin.on("end", () => {
  const dossier = path.join(process.env.CLAUDE_CONFIG_DIR, "projects", process.cwd().replace(/[^a-zA-Z0-9]/g, "-"));
  fs.mkdirSync(dossier, { recursive: true });
  const sessions = fs.readdirSync(dossier).filter((nom) => nom.endsWith(".jsonl")).sort((a, b) => fs.statSync(path.join(dossier, b)).mtimeMs - fs.statSync(path.join(dossier, a)).mtimeMs);
  const session = args.includes("--continue") ? sessions[0]?.slice(0, -6) : "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
  if (session === undefined) {
    process.stderr.write("No conversation found to continue\n");
    process.exit(1);
  }
  const fichier = path.join(dossier, session + ".jsonl");
  const ranger = (entree) => fs.appendFileSync(fichier, JSON.stringify({ sessionId: session, isSidechain: false, timestamp: new Date().toISOString(), ...entree }) + "\n");
  ranger({ type: "user", message: { role: "user", content: texte } });
  const repondre = () => {
    ranger({ type: "assistant", message: { id: "msg_1", role: "assistant", content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "npm run rail" } }] } });
    ranger({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "#14 TODO" }] } });
    ranger({ type: "assistant", message: { id: "msg_2", role: "assistant", content: [{ type: "text", text: "Heard: " + texte }] } });
    process.stdout.write("Heard: " + texte + "\n");
  };
  const feu = process.env.FAUX_SECOND_FEU;
  if (!feu) return repondre();
  const attente = setInterval(() => {
    if (!fs.existsSync(feu)) return;
    clearInterval(attente);
    if (!process.env.FAUX_SECOND_MEURT) return repondre();
    process.stderr.write("Error: " + process.env.FAUX_SECOND_MEURT + "\n");
    process.exit(1);
  }, 5);
});
`;

// Ce que le second du desktop a déjà écrit dans cette session, comme Claude
// Code l'écrit : le rôle invoqué, sa réponse, une question du chef tapée dans
// le terminal, et la réponse.
const DU_DESKTOP = [
  { type: "user", timestamp: "2026-10-23T08:00:00.000Z", message: { role: "user", content: "<command-message>brigade:po</command-message>\n<command-name>/brigade:po</command-name>" } },
  { type: "user", timestamp: "2026-10-23T08:00:00.001Z", isMeta: true, message: { role: "user", content: [{ type: "text", text: "# The PO role" }] } },
  { type: "assistant", timestamp: "2026-10-23T08:00:05.000Z", message: { id: "msg_a", role: "assistant", content: [{ type: "text", text: "**#14** waits for your merge." }] } },
  { type: "user", timestamp: "2026-10-23T08:01:00.000Z", message: { role: "user", content: "What blocks #15?" } },
  { type: "assistant", timestamp: "2026-10-23T08:01:10.000Z", message: { id: "msg_b", role: "assistant", content: [{ type: "text", text: "Nothing: it waits for a cook." }] } },
];

type Reponse = { statut: number; entetes: Headers; corps: Record<string, unknown> };
type Options = { dossier?: "declare" | "absent" | "aucun"; desktop?: boolean; claude?: boolean; env?: Record<string, string> };

// Une station qui sert `brigade`, dont la ligne nomme le dossier où tourne son
// second — et où le second du desktop a déjà une session, sauf `desktop: false`.
async function station(t: TestContext, options: Options = {}) {
  const racine = repertoireTemporaire(t);
  const outils = join(racine, "outils");
  const projet = join(racine, "brigade");
  const claude = join(racine, "claude");
  mkdirSync(outils);
  mkdirSync(projet);
  const temoin = join(racine, "lancements.jsonl");
  writeFileSync(temoin, "");
  const script = join(racine, "faux-claude.cjs");
  writeFileSync(script, FAUX_CLAUDE);
  // Le PATH de la station ne porte que ses doublures : `claude`, et ce que le
  // second du desktop demande aussi — sous Windows, son lanceur `.cmd` et le Git
  // Bash que Claude Code exige.
  const env: Record<string, string> = { ...ENV_ENFANT, PATH: outils, HOME: racine, CLAUDE_CONFIG_DIR: claude, FAUX_SECOND_TEMOIN: temoin, ...options.env };
  if (process.platform === "win32") {
    if (options.claude !== false) writeFileSync(join(outils, "claude.cmd"), `@"${process.execPath}" "${script}" %*\r\n`);
    for (const outil of ["gh", "git", "ssh"]) writeFileSync(join(outils, `${outil}.cmd`), "@echo off\r\n");
    env.CLAUDE_CODE_GIT_BASH_PATH = join(outils, "bash.exe");
    writeFileSync(env.CLAUDE_CODE_GIT_BASH_PATH, "");
  } else {
    const doublures = options.claude === false ? ["gh", "git", "ssh"] : ["claude", "gh", "git", "ssh"];
    if (options.claude !== false) writeFileSync(join(outils, "claude"), `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`);
    for (const outil of ["gh", "git", "ssh"]) writeFileSync(join(outils, outil), "#!/bin/sh\n");
    for (const outil of doublures) chmodSync(join(outils, outil), 0o755);
  }
  const dossier = options.dossier === "absent" ? join(racine, "ailleurs") : projet;
  writeFileSync(join(racine, CONFIGURATION), `brigade   ${DEPOT}   v2${options.dossier === "aucun" ? "" : ` BRIGADE_SECOND_DIR=${dossier}`}\n`);
  const transcripts = join(claude, "projects", realpathSync(projet).replace(/[^a-zA-Z0-9]/g, "-"));
  if (options.desktop !== false) {
    mkdirSync(transcripts, { recursive: true });
    writeFileSync(join(transcripts, `${SESSION}.jsonl`), DU_DESKTOP.map((entree) => `${JSON.stringify({ sessionId: SESSION, isSidechain: false, ...entree })}\n`).join(""));
  }

  const telephones = ouvrirTelephones(repertoireTemporaire(t));
  const seconds = secondsDeLaStation({ racine, env, pasMs: 10 });
  const guichet = await ouvrirGuichet({ telephones, seconds, hote: "127.0.0.1", port: 0 });
  aArreter(t, async () => {
    seconds.arreter();
    await guichet.fermer();
    telephones.fermer();
  });
  const { jeton } = telephones.appairer(telephones.emettre().code, { nom: "pixel-8", machine: "Android 16" });
  const demander = async (methode: string, chemin: string, corps?: unknown, entetes: Record<string, string> = { authorization: `Bearer ${jeton}` }): Promise<Reponse> => {
    const reponse = await fetch(`http://127.0.0.1:${guichet.port}${chemin}`, { method: methode, headers: { "content-type": "application/json", ...entetes }, ...(corps === undefined ? {} : { body: typeof corps === "string" ? corps : JSON.stringify(corps) }) });
    return { statut: reponse.status, entetes: reponse.headers, corps: (await reponse.json()) as Record<string, unknown> };
  };
  return {
    racine,
    lire: (entetes?: Record<string, string>) => demander("GET", "/projects/brigade/second", undefined, entetes),
    envoyer: (text: unknown, entetes?: Record<string, string>) => demander("POST", "/projects/brigade/second", { text }, entetes),
    demander,
    // La conversation que le second du desktop lit, à sa source.
    duDesktop: () => lireLaConversation({ claude, dossier: projet }),
    // La conversation, relue jusqu'à ce que le second ne réponde plus.
    async repondue(): Promise<Reponse> {
      for (;;) {
        const lue = await demander("GET", "/projects/brigade/second");
        if (lue.corps.answering === undefined) return lue;
        await new Promise((suite) => setTimeout(suite, 20));
      }
    },
    lancements: () =>
      readFileSync(temoin, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((ligne) => JSON.parse(ligne) as { args: string[]; cwd: string }),
    projet,
  };
}

const textes = (corps: Record<string, unknown>) => (corps.messages as Array<{ from: string; text: string }>).map(({ from, text }) => `${from}: ${text}`);
const unePhrase = (said: unknown) => {
  assert.equal(typeof said, "string");
  assert.doesNotMatch(String(said), /\n/);
  assert.notEqual(String(said).trim(), "");
};

test("le téléphone écrit au second d'un projet et lit sa réponse : elle s'ajoute à la conversation du desktop, que le desktop lit à sa source", async (t) => {
  const cuisine = await station(t);

  // Ce que le desktop a écrit se lit du téléphone.
  const avant = await cuisine.lire();
  assert.equal(avant.statut, 200, JSON.stringify(avant.corps));
  assert.equal(avant.corps.project, "brigade");
  assert.equal(avant.corps.session, SESSION);
  assert.deepEqual(textes(avant.corps), ["chef: /brigade:po", "second: **#14** waits for your merge.", "chef: What blocks #15?", "second: Nothing: it waits for a cook."]);

  const envoi = await cuisine.envoyer("Merge #14 please");
  assert.equal(envoi.statut, 202, JSON.stringify(envoi.corps));
  assert.equal(envoi.corps.sent, true);
  assert.equal(envoi.corps.session, SESSION);
  assert.deepEqual(textes(envoi.corps).slice(0, 5), [...textes(avant.corps), "chef: Merge #14 please"]);
  // Le message est parti dans la session du desktop, par `claude --continue -p`, dans le dossier du second.
  assert.deepEqual(cuisine.lancements(), [{ args: ["--continue", "-p"], cwd: realpathSync(cuisine.projet) }]);

  const apres = await cuisine.repondue();
  assert.equal(apres.statut, 200);
  assert.equal(apres.corps.session, SESSION);
  assert.deepEqual(textes(apres.corps).slice(-2), ["chef: Merge #14 please", "second: Heard: Merge #14 please"]);
  assert.deepEqual(textes(apres.corps).slice(0, 4), textes(avant.corps));
  // Le même échange, à la source que lit le second du desktop.
  const { session, messages } = cuisine.duDesktop();
  assert.deepEqual({ project: "brigade", session, messages }, apres.corps);
});

test("tant que le second répond, l'envoi a rendu la main, la lecture le dit, et un second message ne part pas", async (t) => {
  const feu = join(repertoireTemporaire(t), "feu");
  const cuisine = await station(t, { env: { FAUX_SECOND_FEU: feu } });
  const envoi = await cuisine.envoyer("Merge #14 please");
  assert.equal(envoi.statut, 202, JSON.stringify(envoi.corps));
  assert.equal(envoi.corps.sent, true);
  assert.equal(envoi.corps.answering, true);
  assert.deepEqual(textes(envoi.corps).at(-1), "chef: Merge #14 please");

  assert.equal((await cuisine.lire()).corps.answering, true);
  const encore = await cuisine.envoyer("And #15?");
  assert.equal(encore.statut, 409, JSON.stringify(encore.corps));
  assert.equal(encore.corps.sent, false);
  unePhrase(encore.corps.said);
  assert.match(String(encore.corps.said), /^the second of brigade is still answering your previous message/);
  assert.equal(cuisine.lancements().length, 1, "le second message n'a rien lancé");

  writeFileSync(feu, "");
  const lue = await cuisine.repondue();
  assert.deepEqual(textes(lue.corps).slice(-2), ["chef: Merge #14 please", "second: Heard: Merge #14 please"]);
  assert.equal(lue.corps.failed, undefined);
});

test("un dossier où le second n'a pas encore de session : le message en ouvre une, celle que le desktop reprendra", async (t) => {
  const cuisine = await station(t, { desktop: false });
  const avant = await cuisine.lire();
  assert.deepEqual(avant.corps, { project: "brigade", session: null, messages: [] });
  const envoi = await cuisine.envoyer("Hello");
  assert.equal(envoi.statut, 202, JSON.stringify(envoi.corps));
  assert.deepEqual(cuisine.lancements().map(({ args }) => args), [["-p"]]);
  const lue = await cuisine.repondue();
  assert.deepEqual(textes(lue.corps), ["chef: Hello", "second: Heard: Hello"]);
  assert.notEqual(lue.corps.session, null);
  assert.equal(cuisine.duDesktop().session, lue.corps.session);
});

test("un second qui échoue d'emblée le dit en une phrase à l'envoi, et rien n'est rangé", async (t) => {
  const cuisine = await station(t, { env: { FAUX_SECOND_ECHEC: "Credit balance is too low" } });
  const envoi = await cuisine.envoyer("Merge #14 please");
  assert.equal(envoi.statut, 502, JSON.stringify(envoi.corps));
  assert.equal(envoi.corps.sent, false);
  unePhrase(envoi.corps.said);
  assert.equal(envoi.corps.said, "the second of brigade failed — Credit balance is too low");
  assert.match(String(envoi.corps.detail), /^\$ claude --continue -p {3}\(in .*\)\nError: Credit balance is too low\n→ exit code 1$/);
  assert.equal(textes((await cuisine.lire()).corps).length, 4, "la conversation n'a pas bougé");
  // Le message suivant repart.
  assert.equal((await cuisine.envoyer("again")).statut, 502);
  assert.equal(cuisine.lancements().length, 2);
});

test("un second qui échoue après avoir pris le message le dit à la lecture, en une phrase", async (t) => {
  const feu = join(repertoireTemporaire(t), "feu");
  const cuisine = await station(t, { env: { FAUX_SECOND_FEU: feu, FAUX_SECOND_MEURT: "API Error: 529 overloaded" } });
  const envoi = await cuisine.envoyer("Merge #14 please");
  assert.equal(envoi.statut, 202, JSON.stringify(envoi.corps));
  assert.equal(envoi.corps.failed, undefined);

  writeFileSync(feu, "");
  const lue = await cuisine.repondue();
  const failed = lue.corps.failed as { said: string; detail: string };
  unePhrase(failed.said);
  assert.equal(failed.said, "the second of brigade failed — API Error: 529 overloaded");
  assert.match(failed.detail, /\n→ exit code 1$/);
  assert.deepEqual(textes(lue.corps).at(-1), "chef: Merge #14 please");
});

test("un second qu'on ne joint pas le dit en une phrase : `claude` absent, dossier absent, dossier que la ligne ne nomme pas", async (t) => {
  const sansClaude = await station(t, { claude: false });
  const envoi = await sansClaude.envoyer("Hello");
  assert.equal(envoi.statut, 502, JSON.stringify(envoi.corps));
  unePhrase(envoi.corps.said);
  assert.match(String(envoi.corps.said), /^The second cannot start: `claude` is missing on /);
  assert.equal((await sansClaude.lire()).statut, 200, "la conversation se lit sans `claude`");

  const absent = await station(t, { dossier: "absent" });
  for (const reponse of [await absent.lire(), await absent.envoyer("Hello")]) {
    assert.equal(reponse.statut, 503, JSON.stringify(reponse.corps));
    unePhrase(reponse.corps.said);
    assert.match(String(reponse.corps.said), /^the conversation with the second of brigade cannot be read: the project's folder .*ailleurs does not exist on this machine$/);
  }

  const aucun = await station(t, { dossier: "aucun" });
  for (const reponse of [await aucun.lire(), await aucun.envoyer("Hello")]) {
    assert.equal(reponse.statut, 503, JSON.stringify(reponse.corps));
    assert.equal(reponse.corps.said, "this station does not hold the second of brigade: its line names no folder where the second runs (BRIGADE_SECOND_DIR)");
  }
  assert.deepEqual([...absent.lancements(), ...aucun.lancements()], []);
});

test("sans jeton valable, rien ne se lit et rien ne part : 401 avant tout le reste", async (t) => {
  const cuisine = await station(t);
  for (const entetes of [{}, { authorization: "Bearer faux" }] as Record<string, string>[]) {
    for (const reponse of [await cuisine.lire(entetes), await cuisine.envoyer("Hello", entetes), await cuisine.demander("GET", "/projects/inconnu/second", undefined, entetes)]) {
      assert.equal(reponse.statut, 401, JSON.stringify(reponse.corps));
      assert.equal(reponse.entetes.get("www-authenticate"), 'Bearer realm="brigade"');
      assert.equal(reponse.corps.messages, undefined);
    }
  }
  assert.deepEqual(cuisine.lancements(), []);
});

test("une demande mal formée ou vers un projet inconnu est refusée en une phrase, sans rien lancer", async (t) => {
  const cuisine = await station(t);
  const refus = [
    { reponse: await cuisine.demander("POST", "/projects/brigade/second", "pas du json"), statut: 400 },
    { reponse: await cuisine.envoyer(42), statut: 400 },
    { reponse: await cuisine.envoyer("   "), statut: 400 },
    { reponse: await cuisine.demander("POST", "/projects/inconnu/second", { text: "Hello" }), statut: 404 },
    { reponse: await cuisine.demander("GET", "/projects/inconnu/second"), statut: 404 },
    { reponse: await cuisine.demander("PUT", "/projects/brigade/second", { text: "Hello" }), statut: 405 },
  ];
  for (const { reponse, statut } of refus) {
    assert.equal(reponse.statut, statut, JSON.stringify(reponse.corps));
    unePhrase(reponse.corps.said);
  }
  assert.equal(refus[5]?.reponse.entetes.get("allow"), "GET, POST");
  assert.deepEqual(cuisine.lancements(), []);
});
