// L'adaptateur `claude` : ce qu'il passe au binaire, et ce qu'il lit de la fin
// d'un cook dans son flux brut. Les flux sont ceux de test/aides/flux.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { argumentsClaude, consigne, environnementCook, lireFlux, sessionClaude, verdict } from "../src/claude.ts";
import { FAUX_CLAUDE } from "./outils.ts";

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

test("le cook ne reçoit ni l'état du runtime ni une clé d'API", () => {
  const env = environnementCook({
    PATH: "/usr/bin",
    HOME: "/home/brigade",
    BRIGADE_STATE_DIR: "/var/lib/brigade/x",
    BRIGADE_PROJECT: "x",
    ANTHROPIC_API_KEY: "sk-…",
    ANTHROPIC_AUTH_TOKEN: "t",
    CLAUDE_CODE_OAUTH_TOKEN: "t",
  });

  assert.deepEqual(env, { PATH: "/usr/bin", HOME: "/home/brigade" });
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

test("la session de la machine se demande au binaire, sans lancer de cook", async () => {
  const env = { PATH: process.env.PATH ?? "" };

  assert.equal(await sessionClaude(FAUX_CLAUDE, env), "connectee");
  assert.equal(await sessionClaude(FAUX_CLAUDE, { ...env, FAUX_CLAUDE_SESSION: "absente" }), "absente");
});

test("un binaire introuvable se dit tel quel ; une réponse illisible ne tranche rien", async () => {
  const env = { PATH: process.env.PATH ?? "" };

  assert.equal(await sessionClaude(join(import.meta.dirname, "pas-de-claude"), env), "introuvable");
  assert.equal(await sessionClaude(process.execPath, { ...env, NODE_OPTIONS: "" }), "inconnue");
});
