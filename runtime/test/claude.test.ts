// L'adaptateur `claude` : ce qu'il passe au binaire, et ce qu'il lit de la fin
// d'un cook dans son flux brut. Les flux sont ceux de test/aides/flux.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { argumentsClaude, consigne, direRefus, environnementCook, lireFlux, sessionClaude, SOURCES_DE_REGLAGES, verdict } from "../src/claude.ts";
import { ENV_ENFANT, FAUX_CLAUDE, repertoireTemporaire } from "./outils.ts";

const flux = (nom: string) => readFileSync(join(import.meta.dirname, "aides/flux", `${nom}.jsonl`), "utf8");
const CALIBRAGE = { model: "sonnet", effort: "medium" };

test("le binaire est lancé en flux JSON, avec la consigne et le calibrage du ticket", () => {
  const args = argumentsClaude("la consigne", CALIBRAGE);

  assert.deepEqual(args.slice(0, 9), ["-p", "la consigne", "--output-format", "stream-json", "--verbose", "--model", "sonnet", "--effort", "medium"]);
});

test("un cook n'attend aucune permission, mais ni le merge ni le push ne lui sont ouverts", () => {
  const args = argumentsClaude("la consigne", CALIBRAGE);

  assert.equal(args[args.indexOf("--permission-mode") + 1], "bypassPermissions");
  const interdits = args.slice(args.indexOf("--disallowedTools") + 1);
  assert.deepEqual(interdits, ["Bash(gh pr merge:*)", "Bash(git push:*)", "Bash(git merge:*)"]);
});

test("un cook ne charge aucune source de réglages, aucune skill, aucun serveur MCP", () => {
  const args = argumentsClaude("la consigne", CALIBRAGE);

  assert.deepEqual(SOURCES_DE_REGLAGES, []);
  assert.equal(args[args.indexOf("--setting-sources") + 1], "");
  assert.ok(args.includes("--disable-slash-commands"));
  assert.ok(args.includes("--strict-mcp-config"));
  assert.ok(!args.includes("--mcp-config") && !args.includes("--plugin-dir") && !args.includes("--settings"));
  // Les interdits restent les derniers : `--disallowedTools` avale ce qui le suit.
  assert.deepEqual(args.slice(args.indexOf("--disallowedTools") + 1), ["Bash(gh pr merge:*)", "Bash(git push:*)", "Bash(git merge:*)"]);
});

test("le binaire reçoit ces arguments tels quels, la liste vide des sources comprise", (t) => {
  const temoin = join(repertoireTemporaire(t), "temoin.jsonl");
  const args = argumentsClaude("la consigne", CALIBRAGE);

  execFileSync(FAUX_CLAUDE, args, { env: { ...ENV_ENFANT, FAUX_CLAUDE: "fini", FAUX_CLAUDE_TEMOIN: temoin } });

  const recu = JSON.parse(readFileSync(temoin, "utf8")).args as string[];
  assert.deepEqual(recu, args);
  assert.deepEqual(recu.slice(recu.indexOf("--setting-sources"), recu.indexOf("--setting-sources") + 2), ["--setting-sources", ""]);
});

test("la consigne nomme le ticket, la branche de base, et ce que le cook ne fait pas", () => {
  const texte = consigne({ ticket: 15, titre: "Une station claude", depot: "benomite/brigade", base: "v2" });

  assert.match(texte, /ticket #15/);
  assert.match(texte, /Une station claude/);
  assert.match(texte, /gh issue view 15 --repo benomite\/brigade/);
  assert.match(texte, /`v2`/);
  assert.match(texte, /ne pousses? (rien|pas)/i);
  assert.match(texte, /ne merges? (rien|jamais|pas)/i);
  assert.match(texte, /compte-rendu/);
});

test("la consigne envoie le cook lire les conventions du dépôt, que rien ne lui charge", () => {
  const texte = consigne({ ticket: 15, titre: "Une station claude", depot: "benomite/brigade", base: "v2" });

  assert.match(texte, /lis (le|son) `CLAUDE\.md`/i);
});

test("la consigne dit au cook que la fiche du ticket porte sa zone, et qu'il ne la modifie pas", () => {
  const texte = consigne({ ticket: 15, titre: "Une station claude", depot: "benomite/brigade", base: "v2" });

  assert.match(texte, /`zone`.*possède/);
  assert.match(texte, /hors de la zone est signalé au chef/);
  assert.match(texte, /ne modifies pas la fiche/);
});

test("le cook ne reçoit ni l'état du runtime ni une clé d'API, et pas la mémoire du compte", () => {
  const env = environnementCook({
    PATH: "/usr/bin",
    HOME: "/home/brigade",
    BRIGADE_STATE_DIR: "/var/lib/brigade/x",
    BRIGADE_PROJECT: "x",
    ANTHROPIC_API_KEY: "sk-…",
    ANTHROPIC_AUTH_TOKEN: "t",
    CLAUDE_CODE_OAUTH_TOKEN: "t",
  });

  assert.deepEqual(env, { PATH: "/usr/bin", HOME: "/home/brigade", CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" });
});

test("un cook qui a fini : code 0, un résultat sans erreur, et son dernier message", () => {
  const lecture = lireFlux(flux("fini"));

  assert.equal(verdict(lecture, 0), "done");
  assert.equal(lecture.message, "ok");
  assert.equal(lecture.quota, null);
});

test("un flux sans résultat, ou un code de sortie non nul, est un échec", () => {
  const sansResultat = flux("fini").trimEnd().split("\n").slice(0, -1).join("\n");

  assert.equal(verdict(lireFlux(sansResultat), 0), "failed");
  assert.equal(verdict(lireFlux(flux("fini")), 1), "failed");
  assert.equal(verdict(lireFlux(""), 0), "failed");
  assert.equal(verdict(lireFlux("pas du JSON\n{}\n"), null), "failed");
});

test("une session non connectée n'est pas un échec du cook : c'est la connexion", () => {
  const lecture = lireFlux(flux("non-connecte"));

  assert.equal(verdict(lecture, 1), "disconnected");
  assert.equal(lecture.message, "Not logged in · Please run /login");
});

test("un quota épuisé est un 86, avec l'heure à laquelle il revient", () => {
  const lecture = lireFlux(flux("quota-epuise"));

  assert.equal(verdict(lecture, 1), "86");
  assert.deepEqual(lecture.quota, { retour: new Date("2026-10-08T15:30:00.000Z"), fenetre: "five_hour" });
});

test("un quota annoncé par le seul message d'erreur prend l'heure du dernier état de quota connu", () => {
  const lignes = flux("quota-epuise").replace('"status":"rejected"', '"status":"allowed_warning"');

  const lecture = lireFlux(lignes);

  assert.equal(verdict(lecture, 1), "86");
  assert.equal(lecture.quota?.retour?.toISOString(), "2026-10-08T15:30:00.000Z");
});

test("un quota épuisé sans aucune heure de retour reste un 86", () => {
  const sansEvenement = flux("quota-epuise").split("\n").filter((ligne) => !ligne.includes("rate_limit_event")).join("\n");

  const lecture = lireFlux(sansEvenement);

  assert.equal(verdict(lecture, 1), "86");
  assert.deepEqual(lecture.quota, { retour: null, fenetre: null });
});

test("un quota rejeté en cours de route n'efface pas un cook qui a fini quand même", () => {
  const [init, ...reste] = flux("fini").trimEnd().split("\n");
  const rejete = flux("quota-epuise").split("\n").find((ligne) => ligne.includes("rate_limit_event"));

  assert.equal(verdict(lireFlux([init, rejete, ...reste].join("\n")), 0), "done");
});

test("un lancement que le modèle refuse n'est ni fini ni échoué : c'est un refus, avec sa catégorie", () => {
  const lecture = lireFlux(flux("refuse"));

  assert.equal(verdict(lecture, 1), "refused");
  assert.deepEqual(lecture.refus, { categorie: "reasoning_extraction" });
  assert.match(lecture.message ?? "", /^API Error: Sonnet 5\.5's safeguards flagged this message/);
  assert.equal(direRefus(lecture), "refus du modèle (reasoning_extraction)");
});

test("un refus se lit au résultat, même si le flux n'en donne pas la catégorie", () => {
  const sansCategorie = flux("refuse").split("\n").filter((ligne) => !ligne.includes('"stop_details":{"type":"refusal"')).join("\n");

  const lecture = lireFlux(sansCategorie);

  assert.equal(verdict(lecture, 1), "refused");
  assert.equal(direRefus(lecture), "refus du modèle");
});

test("un refus reste un refus, même rendu sans erreur et avec un code de sortie nul", () => {
  const sansErreur = flux("refuse").replace('"is_error":true', '"is_error":false');

  assert.equal(lireFlux(sansErreur).resultat?.erreur, false);
  assert.equal(verdict(lireFlux(sansErreur), 0), "refused");
});

test("la catégorie du refus est celle du dernier message du fil principal, pas celle d'un sous-agent ni d'un refus dépassé", () => {
  const lignes = flux("refuse").trimEnd().split("\n");
  const refuse = lignes.findIndex((ligne) => ligne.includes('"stop_details":{"type":"refusal"'));
  const autre = (lignes[refuse] ?? "").replace('"category":"reasoning_extraction"', '"category":"autre"');
  const sousAgent = autre.replace('"parent_tool_use_id":null', '"parent_tool_use_id":"toolu_1"');
  const sans = lignes.filter((_, rang) => rang !== refuse);

  // Un sous-agent refusé après le fil principal : la catégorie ne bouge pas.
  assert.deepEqual(lireFlux([...lignes.slice(0, -1), sousAgent, lignes.at(-1)].join("\n")).refus, { categorie: "reasoning_extraction" });
  // Un refus dépassé, puis un dernier message qui n'en dit rien : aucune catégorie.
  assert.deepEqual(lireFlux([autre, ...sans].join("\n")).refus, { categorie: null });
});

test("un refus surmonté en cours de route n'est pas la fin du lancement : seul le résultat tranche", () => {
  const lignes = flux("refuse").trimEnd().split("\n");
  const [init, ...reste] = flux("fini").trimEnd().split("\n");

  // Tout le flux du refus sauf son résultat, puis une session qui finit.
  assert.equal(verdict(lireFlux([init, ...lignes.slice(1, -1), ...reste].join("\n")), 0), "done");
  // Mort avant de conclure : rien ne dit comment il aurait fini.
  assert.equal(verdict(lireFlux(lignes.slice(0, -1).join("\n")), 1), "failed");
});

test("la session de la machine se demande au binaire, sans lancer de cook", async () => {
  const env = ENV_ENFANT;

  assert.equal(await sessionClaude(FAUX_CLAUDE, env), "connectee");
  assert.equal(await sessionClaude(FAUX_CLAUDE, { ...env, FAUX_CLAUDE_SESSION: "absente" }), "absente");
});

test("un binaire introuvable se dit tel quel ; une réponse illisible ne tranche rien", async () => {
  const env = ENV_ENFANT;

  assert.equal(await sessionClaude(join(import.meta.dirname, "pas-de-claude"), env), "introuvable");
  assert.equal(await sessionClaude(process.execPath, { ...env, NODE_OPTIONS: "" }), "inconnue");
});
