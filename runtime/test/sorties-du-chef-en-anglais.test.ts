// Les sorties des commandes de réglage et de décision du chef sont en anglais (#932) : `manager` (`on`, `off`,
// `return`, `backlog`, `upstream`), `grant` (`enable`, `extend`, `revoke`), `station` (`cooks`, une décision, `remove`,
// `help`), `guardrails` (`stop`, `resume`) et `base` (`replay`) ; `arbiter` a ses tests dans `arbitre-cli.test.ts`. Un état
// d'exemple qui porte un manager, des grants, une base rouge et une station passe dans le test de glossaire : aucune
// ligne, refus compris, ne garde un mot de la colonne « français » du glossaire. Et ce que le chef avait posé avant ce
// ticket, en français ou non, se montre et s'applique tel quel.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { principal as base } from "../src/base-cli.ts";
import type { Fait } from "../src/evenements.ts";
import { principal as garde } from "../src/garde-fous-cli.ts";
import { principal as grant } from "../src/grant-cli.ts";
import { principal as manager } from "../src/manager-cli.ts";
import { principal as station } from "../src/montrer-station.ts";
import { exempleDuBas } from "./aides/bas-de-status.ts";
import { sansMotFrancais } from "./aides/glossaire.ts";
import { appeler, DEPOT, fauxGh, issueGitHub, repertoireTemporaire } from "./outils.ts";

type Commande = Parameters<typeof appeler>[0];

// L'état d'exemple du bas de `status`, avec ce que le chef lit dans ces commandes : un manager qui a jugé, découpé,
// écarté et réagi ; un grant qui a servi ; une base rouge dont le rejeu est demandé ; des décisions du chef.
function etat(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const journal = exempleDuBas(t, repertoire);
  const noter = (fait: Fait, ticket: number | null = null, author = "manager") => journal.ajouter({ project: "brigade", ticket, author, ...fait });
  noter({ type: "manager.enabled", payload: {} }, null, "chef");
  noter({ type: "manager.judged", payload: { run: "juge-60-a", fingerprint: "e1", verdict: "fire", kind: "ticket", reason: "One deliverable, one test.", missing: null, model: "haiku", effort: "low", calibration: "Mechanical." } }, 60);
  noter({ type: "manager.labeled", payload: { labels: ["fire", "effort:low"] } }, 60);
  noter({ type: "manager.judged", payload: { run: "juge-61-a", fingerprint: "e2", verdict: "refused", kind: "epic", reason: "Three deliverables.", missing: "Split it.", model: null, effort: null, calibration: null } }, 61);
  noter({ type: "manager.judged", payload: { run: "juge-62-a", fingerprint: "e3", verdict: "refused", kind: "incomplete", reason: "No criterion.", missing: null, model: null, effort: null, calibration: null } }, 62);
  noter({ type: "manager.failed", payload: { run: "juge-63-a", fingerprint: "e4", reason: "no JSON object in the answer" } }, 63);
  for (const [ticket, motif] of [[1, "roadmap"], [64, "chef-changed"], [65, "blocked-on-human"], [66, "hors-cuisine"], [67, "already-split"], [68, "untrusted-author"], [69, "question"], [70, "mystery"]] as const) {
    noter({ type: "manager.set-aside", payload: { reason: motif as never, fired: false } }, ticket);
  }
  const prevu = (title: string) => ({ title, context: "", criteria: ["One criterion."], waitsFor: [], zone: ["docs/"], model: "haiku", effort: "low", calibration: "Docs." });
  noter({ type: "manager.split", payload: { run: "decoupe-61-a", fingerprint: "e5", reason: "Two deliverables.", order: "The base first.", tickets: [prevu("The base"), prevu("The rest")] } }, 71);
  noter({ type: "manager.split-created", payload: { epic: 71, index: 1, reconciled: false } }, 501);
  noter({ type: "manager.split-fired", payload: { epic: 71, index: 1 } }, 501);
  noter({ type: "manager.split-asked", payload: { run: "decoupe-72-a", fingerprint: "e6", question: "Which screen?" } }, 72);
  const reaction = { verdict: 9, returns: 2, proposal: null, run: "reagit-60-a", from: { model: "haiku", effort: "low" } };
  noter({ type: "manager.reacted", payload: { ...reaction, choice: "raise", reason: "The cook stalls.", to: { model: "haiku", effort: "medium" } } }, 60);
  noter({ type: "manager.reacted", payload: { ...reaction, choice: "escalate", reason: "Criterion 2 contradicts itself.", proposal: "Settle it.", to: null } }, 62);
  noter({ type: "manager.reacted", payload: { ...reaction, returns: 1, run: null, choice: "retry", reason: "no cap", to: null } }, 63);
  noter({ type: "manager.handed-back", payload: {} }, 73);

  noter({ type: "grant.refused", payload: { action: "identifiants-max", line: "lire les identifiants du compte Max" } }, null, "chef");
  noter({ type: "grant.extended", payload: { action: "merge", until: "2026-10-12T12:00:00.000Z", uses: 3 } }, null, "chef");
  noter({ type: "grant.used", payload: { action: "merge", pr: "https://github.com/o/r/pull/40", number: 40, sha: "abcdef0a", base: "v2", verdict: 1 } }, 40, "pass");
  noter({ type: "merge.done", payload: { pr: "https://github.com/o/r/pull/40", sha: "abcdef0a", by: "pass", reconciled: false } }, 40, "pass");
  noter({ type: "pass.started", payload: { run: "p-1", pr: "https://github.com/o/r/pull/402", number: 402, sha: "abcdef0b" } }, 12, "pass");
  noter({ type: "pass.held", payload: { reason: "no-grant" } }, 12, "pass");

  noter({ type: "decision.set", payload: { name: "BRIGADE_MANAGER_MODEL", value: "haiku", previous: null } }, null, "chef");
  noter({ type: "decision.set", payload: { name: "BRIGADE_DRIFT_TICKET_TOKENS", value: "900000", previous: null } }, null, "chef");
  noter({ type: "station.capped", payload: { station: "box/claude", maxCooks: 2 } }, null, "chef");
  noter({ type: "kitchen.stopped", payload: {} }, null, "chef");
  noter({ type: "base.recheck-requested", payload: {} }, null, "chef");
  return { repertoire, env: { BRIGADE_STATE_DIR: repertoire } as Record<string, string>, journal };
}

async function sortie(commande: Commande, args: string[], env: Record<string, string>) {
  const enfant = appeler(commande, args, env);
  const code = await enfant.fin;
  return { code, lignes: enfant.sortie().trimEnd().split("\n") };
}

// Joue des commandes, accomplies ou refusées : aucune ligne ne garde un mot français.
async function jouer(commande: Commande, env: Record<string, string>, ...essais: string[][]) {
  const rendus = [];
  for (const args of essais) {
    const rendu = await sortie(commande, args, env);
    sansMotFrancais(rendu.lignes);
    rendus.push({ args, ...rendu });
  }
  return rendus;
}

test("`manager` : l'état d'exemple, les commandes et leurs refus ne portent aucun mot français du glossaire", async (t) => {
  const { env } = etat(t);
  const [montre] = await jouer(manager, env, []);
  assert.equal(montre?.code, 0);
  assert.ok((montre?.lignes.length ?? 0) > 15);
  // Rendre, rallumer et éteindre : chaque issue se rend ou se refuse en anglais.
  await jouer(manager, env, ["return", "64"], ["return", "64"], ["return", "65"], ["return", "66"], ["return", "67"], ["return", "68"], ["return", "70"], ["return", "60"], ["return", "61"], ["return", "404"]);
  await jouer(manager, env, ["on"], ["on"], ["off"], ["off"]);
  await jouer(manager, env, [], ["bouger"], ["return"], ["return", "x"], ["on", "off"]);
  // Sans état, sans journal : les refus.
  await jouer(manager, {}, []);
  await jouer(manager, { BRIGADE_STATE_DIR: repertoireTemporaire(t) }, [], ["on"]);
  await jouer(manager, {}, ["backlog"]);
  // Le backlog et l'amont lisent GitHub : un gh absent refuse en anglais.
  await jouer(manager, { ...env, BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: "/inexistant" }, ["backlog"], ["upstream"]);
});

test("`manager upstream` dit en anglais ce qui arrive à chaque issue qui n'est pas sur le rail", async (t) => {
  const { env } = etat(t);
  const gh = fauxGh(t);
  const issues = [60, 61, 62, 63, 64, 66, 70, 71, 72, 73, 75].map((numero) => issueGitHub(numero, { title: `Issue ${numero}`, labels: numero === 66 ? ["hors-cuisine"] : numero === 75 ? ["fire"] : [] }));
  gh.repondre(`repos/${DEPOT}/issues?state=open&per_page=100`, { corps: issues });
  const lu = await sortie(manager, ["upstream"], { ...env, BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin });
  assert.equal(lu.code, 0, lu.lignes.join("\n"));
  const { issues: dites } = JSON.parse(lu.lignes.join("\n")) as { issues: Array<{ ticket: number; dit: string }> };
  assert.ok(dites.length > 5);
  sansMotFrancais(dites.map(({ ticket, dit }) => `#${ticket} ${dit}`));
});

test("`grant` : l'état d'exemple, chaque commande et chaque refus ne portent aucun mot français du glossaire", async (t) => {
  const { env } = etat(t);
  const [montre] = await jouer(grant, env, []);
  assert.equal(montre?.code, 0);
  assert.ok((montre?.lignes.length ?? 0) > 8);
  const essais = [
    ["revoke", "merge"], ["revoke", "merge"], ["enable", "merge", "--for", "4h"], ["enable", "merge"], ["extend", "merge", "--for", "2h"], ["extend", "merge", "--uses", "3"],
    ["extend", "merge", "--no-expiry"], ["extend", "merge", "--no-expiry"], ["extend", "merge"], ["revoke", "merge"], ["extend", "merge", "--for", "2h"], ["enable", "merge", "--until", "2999-01-01T18:00", "--uses", "10"],
    ["extend", "merge", "--until", "2020-01-01"], ["extend", "merge", "--uses", "2"], ["extend", "merge", "--for", "1min"],
    // Les refus de l'échéance, de la forme, de ce qu'aucun grant n'autorise.
    ["enable", "merge", "--for", "hier"], ["enable", "merge", "--until", "demain"], ["enable", "merge", "--until", "2020-01-01"], ["enable", "merge", "--until", "1h"], ["enable", "merge", "--uses", "0"],
    ["enable", "merge", "--for", "2h", "--for", "3h"], ["enable", "merge", "--for"], ["enable", "merge", "--bouger", "1"], ["enable", "merge", "--for", "1h", "--until", "2999-01-01"], ["enable", "merge", "--no-expiry"], ["revoke", "merge", "--for", "1h"],
    ["enable", "merge", "--for", "999999999999999j"], ["bouger", "merge"], ["enable", "autre"], ["enable"], ["enable", "identifiants-max"], ["enable", "accès-prod"], ["enable", "acces-prod"],
  ];
  await jouer(grant, env, ...essais);
  await jouer(grant, env, []);
  await jouer(grant, {}, [], ["enable", "merge"], ["enable", "identifiants-max"]);
  await jouer(grant, { BRIGADE_STATE_DIR: repertoireTemporaire(t) }, [], ["enable", "merge"], ["enable", "identifiants-max"]);
});

test("`guardrails` : l'état d'exemple, stop, resume et leurs refus ne portent aucun mot français du glossaire", async (t) => {
  const { env, journal } = etat(t);
  const noter = (fait: Fait, ticket: number | null = null) => journal.ajouter({ project: "brigade", ticket, author: "runtime", ...fait });
  const plafonds = { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
  // Un arrêt par chaque garde-fou, pour que `guardrails` les dise tous.
  for (const [ticket, reason, observed, limit] of [[80, "turns", 130, 100], [81, "tokens", 2_400_000, 2_000_000], [82, "duration", 4_000_000, 3_600_000], [83, "idle", 700_000, 600_000], [84, "lease", 900_000, 600_000], [85, "removals", 400, 300], [86, "stop", null, null], [87, "idle", null, null]] as const) {
    const run = `${ticket}-g`;
    noter({ type: "cook.launched", payload: { run, limits: plafonds, stream: `runs/${run}.jsonl` } }, ticket);
    noter({ type: "guard.tripped", payload: { run, reason, limit, observed } }, ticket);
  }
  const [montre] = await jouer(garde, env, []);
  assert.equal(montre?.code, 0);
  assert.ok((montre?.lignes.length ?? 0) > 4);
  await jouer(garde, env, ["resume"], ["resume"], ["stop"], ["stop"], ["resume"], [], ["bouger"], ["stop", "resume"]);
  await jouer(garde, {}, [], ["stop"]);
  await jouer(garde, { BRIGADE_STATE_DIR: repertoireTemporaire(t) }, [], ["stop"]);
});

test("`base` : la base rouge de l'état d'exemple, replay et leurs refus ne portent aucun mot français du glossaire", async (t) => {
  const { env, journal } = etat(t);
  const [rouge] = await jouer(base, env, []);
  assert.equal(rouge?.code, 0);
  assert.match(rouge?.lignes[0] ?? "", /^BASE RED since /);
  await jouer(base, env, ["replay"], ["replay"], ["bouger"], ["replay", "x"]);
  // Verte, jamais contrôlée, non contrôlée : chaque état de la base se lit en anglais.
  const noter = (fait: Fait) => journal.ajouter({ project: "brigade", ticket: null, author: "pass", ...fait });
  noter({ type: "base.checked", payload: { sha: "abc1234def", outcome: "skipped", gates: { outcome: "skipped", code: null, failures: [], tail: "" }, tickets: [], reason: "git fetch failed" } });
  await jouer(base, env, [], ["replay"]);
  noter({ type: "base.checked", payload: { sha: "abc1234def", outcome: "green", gates: { outcome: "green", code: 0, failures: [], tail: "" }, tickets: [] } });
  await jouer(base, env, [], ["replay"]);
  await jouer(base, {}, [], ["replay"]);
  await jouer(base, { BRIGADE_STATE_DIR: repertoireTemporaire(t) }, [], ["replay"]);
});

test("`station` : l'état d'exemple, cooks, chaque décision, remove, help et leurs refus ne portent aucun mot français du glossaire", async (t) => {
  const { env } = etat(t);
  const [montre, aide] = await jouer(station, env, [], ["help"]);
  assert.equal(montre?.code, 0);
  assert.ok((montre?.lignes.length ?? 0) > 20);
  assert.equal(aide?.code, 0);
  const decisions = [
    ["stations", "box/claude:claude:opus:2"], ["seuil-ticket", "900000"], ["seuil-perdus", "1000"], ["manager-modele", "haiku"], ["manager-effort", "low"], ["reviewer-modele", "sonnet"], ["reviewer-effort", "high"],
    ["closer-modele", "sonnet"], ["closer-effort", "low"], ["closer-cooks", "2"], ["closer-tokens", "100000"], ["closer-retraits", "300"],
  ];
  await jouer(station, env, ...decisions, ...decisions, ["cooks", "3"], ["cooks", "3"], ["cooks", "0"], [], ...decisions.map(([nom = ""]) => ["remove", nom]), ...decisions.map(([nom = ""]) => ["remove", nom]));
  // Les refus : une valeur que le runtime ne lirait pas, un geste inconnu, un argument de trop.
  await jouer(
    station,
    env,
    ["seuil-ticket", "zéro"], ["seuil-ticket", "0"], ["seuil-ticket"], ["manager-modele", "gpt"], ["manager-effort", "extrême"], ["closer-modele", "  "], ["stations", "n'importe quoi"], ["closer-cooks", "-1"], ["bouger", "1"],
    ["cooks"], ["cooks", "x"], ["cooks", "1000000"], ["remove"], ["remove", "bouger"], ["seuil-ticket", "1", "2"], ["help", "x"],
  );
  await jouer(station, {}, [], ["help"], ["cooks", "2"]);
  await jouer(station, { BRIGADE_STATE_DIR: repertoireTemporaire(t) }, [], ["cooks", "2"]);
});

test("ce que le chef avait posé avant #932 se montre et s'applique tel quel : l'état de #931 et d'avant se lit sans édition", async (t) => {
  const { env } = etat(t);
  // Le grant refusé du journal garde sa ligne française, et `grant` la lit sans la montrer ; les décisions posées
  // gardent leur valeur ; le manager garde ses jugements.
  const grants = await sortie(grant, [], env);
  assert.equal(grants.code, 0);
  assert.ok(grants.lignes.some((ligne) => /refused/.test(ligne)), grants.lignes.join("\n"));
  const stations = await sortie(station, [], env);
  assert.ok(stations.lignes.some((ligne) => /manager-modele\s+haiku/.test(ligne)), stations.lignes.join("\n"));
  assert.ok(stations.lignes.some((ligne) => /seuil-ticket\s+900000/.test(ligne)), stations.lignes.join("\n"));
  const managers = await sortie(manager, [], env);
  assert.ok(managers.lignes.some((ligne) => /#60\s+on the rail, haiku \/ low \(set: fire, effort:low\)/.test(ligne)), managers.lignes.join("\n"));
  // Les anciens mots de chaque commande répondent encore, en disant le nouveau.
  const ancien = await sortie(manager, ["allumer"], env);
  assert.equal(ancien.code, 0);
  assert.ok(ancien.lignes.some((ligne) => /manager on/.test(ligne) || /already on/.test(ligne)), ancien.lignes.join("\n"));
  const ancienGrant = await sortie(grant, ["revoquer", "merge"], env);
  assert.equal(ancienGrant.code, 0);
  const ancienneDuree = await sortie(grant, ["activer", "merge", "--pour", "2j"], env);
  assert.equal(ancienneDuree.code, 0, ancienneDuree.lignes.join("\n"));
  sansMotFrancais(ancienneDuree.lignes.filter((ligne) => !/Use `|use `|renamed|now called|is now|ancien/i.test(ligne)));
});
