// Le geste par lequel le chef pose ses décisions — stations, seuils de coût,
// calibrage du manager et du reviewer : `npm run station -- <geste> <valeur>`.
// Sans sudo, sans drop-in, sans éditeur : une ligne au journal, au nom du chef,
// que le runtime lit à sa lecture suivante.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { DECISIONS, decisionsPosees } from "../src/decisions.ts";
import { cheminJournal, ouvrirJournal } from "../src/journal.ts";
import { principal as montrerStation } from "../src/montrer-station.ts";
import { stationsAnnoncees } from "../src/projections/stations.ts";
import { cuisine, issue, STATION } from "./aides/cuisine.ts";
import { appeler, jusqua, lancer, repertoireTemporaire } from "./outils.ts";
import { posixOnly } from "./support/plateforme.ts";

const MONTRER = join(import.meta.dirname, "../src/montrer-station.ts");

// Chaque geste, la décision qu'il pose, et deux valeurs successives.
const GESTES = [
  ["stations", "BRIGADE_STATIONS", "box/claude:3:code", "box/claude:2:code,box/playwright:1:navigateur-headless"],
  ["seuil-ticket", "BRIGADE_DRIFT_TICKET_TOKENS", "500000", "300000"],
  ["seuil-perdus", "BRIGADE_DRIFT_LOST_TOKENS", "200000", "100000"],
  ["seuil-renvois", "BRIGADE_DRIFT_FIRST_TRY_PERCENT", "50", "40"],
  ["fenetre-renvois", "BRIGADE_DRIFT_FIRST_TRY_WINDOW", "10", "12"],
  ["budget-gates", "BRIGADE_GATES_BUDGET_SECONDS", "120", "90"],
  ["budget-gates-cpu", "BRIGADE_GATES_BUDGET_CPU_SECONDS", "500", "300.5"],
  ["budget-base", "BRIGADE_GATES_BASE_BUDGET_SECONDS", "900", "700"],
  ["budget-base-cpu", "BRIGADE_GATES_BASE_BUDGET_CPU_SECONDS", "3000", "2500.5"],
  ["manager-modele", "BRIGADE_MANAGER_MODEL", "sonnet", "opus"],
  ["manager-effort", "BRIGADE_MANAGER_EFFORT", "medium", "high"],
  ["reviewer-modele", "BRIGADE_REVIEWER_MODEL", "haiku", "sonnet"],
  ["reviewer-effort", "BRIGADE_REVIEWER_EFFORT", "medium", "low"],
  ["closer-modele", "BRIGADE_CLOSING_MODEL", "sonnet", "opus"],
  ["closer-effort", "BRIGADE_CLOSING_EFFORT", "medium", "high"],
  ["closer-cooks", "BRIGADE_CLOSING_COOKS", "2", "3"],
  ["closer-tokens", "BRIGADE_CLOSING_MAX_TOKENS", "400000", "300000"],
  ["closer-retraits", "BRIGADE_CLOSING_MAX_REMOVED_LINES", "300", "200"],
  ["ceiling-modele", "BRIGADE_CEILING_MODEL", "sonnet", "opus"],
  ["ceiling-effort", "BRIGADE_CEILING_EFFORT", "medium", "xhigh"],
] as const;
// Les décisions qui ont un défaut, et lui.
const DEFAUTS: Partial<Record<string, string>> = { BRIGADE_CEILING_MODEL: "opus", BRIGADE_CEILING_EFFORT: "high", BRIGADE_GATES_BUDGET_SECONDS: "100", BRIGADE_GATES_BUDGET_CPU_SECONDS: "400", BRIGADE_GATES_BASE_BUDGET_SECONDS: "400", BRIGADE_GATES_BASE_BUDGET_CPU_SECONDS: "1600" };

// Un journal où le runtime a déjà tourné : une station s'y est annoncée.
function journalDuProjet(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire);
  t.after(() => journal.fermer());
  journal.ajouter({ project: "brigade", ticket: null, author: `station:${STATION}`, type: "station.announced", payload: { station: STATION, engine: "claude", provides: ["code"], maxCooks: 1 } });
  const station = async (...args: string[]) => {
    const commande = appeler(montrerStation, args, { BRIGADE_STATE_DIR: repertoire });
    return { code: await commande.fin, sortie: commande.sortie() };
  };
  return { repertoire, journal, station };
}

describe("le chef pose ses décisions par la station", { concurrency: 8 }, () => {
  test("chaque décision a son geste : la station montre la valeur posée, et le journal porte, au nom du chef, la décision, l'ancienne et la nouvelle valeur", async (t) => {
    const { journal, station } = journalDuProjet(t);
    // La famille entière, et rien d'autre.
    assert.deepEqual(GESTES.map(([, decision]) => decision).sort(), [...DECISIONS].sort());

    const avant = (await station()).sortie;
    for (const [geste, decision] of GESTES) {
      const defaut = DEFAUTS[decision];
      assert.match(avant, new RegExp(defaut === undefined ? String.raw`^  ${geste} +not set — ${decision} is only read from the log$` : String.raw`^  ${geste} +not set — the default, ${defaut}$`, "m"));
    }

    for (const [geste, decision, premiere, seconde] of GESTES) {
      const pose = await station(geste, premiere);
      assert.equal(pose.code, 0, pose.sortie);
      assert.equal(
        pose.sortie,
        `brigade : ${geste}: ${premiere} (was: not set) — read by the runtime at its next read, without a restart; no running cook is stopped (no runtime is running: the decision will hold at its next start)\n`,
      );
      const reprise = await station(geste, seconde);
      assert.equal(reprise.code, 0, reprise.sortie);
      assert.match(reprise.sortie, new RegExp(String.raw`^brigade : ${geste}: ${seconde.replaceAll("+", "\\+")} \(was: ${premiere}\) — read by the runtime at its next read`));
    }

    // Une ligne par pose, au nom du chef : la décision, l'ancienne valeur, la nouvelle.
    assert.deepEqual(
      journal.tout().filter((e) => e.type === "decision.set").map((e) => [e.author, e.ticket, e.payload]),
      GESTES.flatMap(([, name, premiere, seconde]) => [
        ["chef", null, { name, value: premiere, previous: null }],
        ["chef", null, { name, value: seconde, previous: premiere }],
      ]),
    );
    const apres = (await station()).sortie;
    assert.match(apres, /^chef's decisions +`station -- <geste> <valeur>` to set one, `station -- help` for the settings$/m);
    for (const [geste, , , seconde] of GESTES) assert.match(apres, new RegExp(String.raw`^  ${geste} +${seconde.replaceAll("+", "\\+")}$`, "m"));
  });

  test("reposer la valeur déjà posée n'écrit rien ; une valeur entourée d'espaces est posée sans eux", async (t) => {
    const { journal, station } = journalDuProjet(t);
    await station("seuil-ticket", " 400000 ");
    const deja = await station("seuil-ticket", "400000");

    assert.equal(deja.code, 0);
    assert.equal(deja.sortie, "brigade : seuil-ticket: already set — 400000; nothing is written\n");
    assert.deepEqual(
      journal.tout().filter((e) => e.type === "decision.set").map((e) => e.payload),
      [{ name: "BRIGADE_DRIFT_TICKET_TOKENS", value: "400000", previous: null }],
    );
  });

  test("une valeur invalide est refusée avec ce qui était attendu : rien n'est écrit ni journalisé", async (t) => {
    const { journal, station } = journalDuProjet(t);
    const STATIONS_ATTENDUES = /usage: `station -- stations <declaration>` — `<machine>\/<engine>:<cooks cap>:<capability>\+<capability>\[:distante\[\+ordinaires\|\+ensemble\]\]`, separated by commas/;
    const SEUIL = /expected an integer greater than zero/;
    const MODELE = /expected opus, sonnet or haiku/;
    const EFFORT = /expected low, medium, high, xhigh or max/;
    const REFUS: Array<[string[], RegExp[]]> = [
      // Modèle inconnu.
      [["manager-modele", "gpt"], [/manager-modele refused, nothing is written — BRIGADE_MANAGER_MODEL invalid: “gpt”/, MODELE]],
      [["reviewer-modele", "Opus"], [/BRIGADE_REVIEWER_MODEL invalid: “Opus”/, MODELE]],
      // Effort hors de l'échelle.
      [["manager-effort", "fort"], [/BRIGADE_MANAGER_EFFORT invalid: “fort”/, EFFORT]],
      [["reviewer-effort", "maximum"], [/BRIGADE_REVIEWER_EFFORT invalid: “maximum”/, EFFORT]],
      // Seuil non numérique, négatif, nul.
      [["seuil-ticket", "beaucoup"], [/BRIGADE_DRIFT_TICKET_TOKENS invalid: “beaucoup”/, SEUIL]],
      [["seuil-perdus", "-1"], [/BRIGADE_DRIFT_LOST_TOKENS invalid: “-1”/, SEUIL]],
      [["seuil-perdus", "0"], [/BRIGADE_DRIFT_LOST_TOKENS invalid: “0”/, SEUIL]],
      [["seuil-ticket", "1.5"], [SEUIL]],
      // Liste de stations vide ou mal formée.
      [["stations", ""], [/stations refused, nothing is written — BRIGADE_STATIONS: an empty value is not a decision/, STATIONS_ATTENDUES]],
      [["stations", " , "], [/station no\. 1 \(“”\) — it is empty/, STATIONS_ATTENDUES]],
      [["stations", "box:2:code"], [/station no\. 1 \(“box:2:code”\) — name/, STATIONS_ATTENDUES]],
      [["stations", "box/claude:0:code"], [/cap/, STATIONS_ATTENDUES]],
      // Sans valeur, ou avec plusieurs.
      [["stations"], [/stations expects one value, and only one — `station -- stations <declaration>`: `<machine>/]],
      [["manager-modele", "opus", "high"], [/manager-modele expects one value, and only one — `station -- manager-modele <model>`: opus, sonnet or haiku/]],
      // Un geste qui n'existe pas.
      [["manager-temperature", "1"], [/^brigade : usage: /]],
    ];
    const ecrits = journal.tout();

    for (const [args, motifs] of REFUS) {
      const { code, sortie } = await station(...args);
      assert.equal(code, 2, `${args.join(" ")} : ${sortie}`);
      for (const motif of motifs) assert.match(sortie, motif, args.join(" "));
    }
    assert.deepEqual(journal.tout(), ecrits);
    assert.deepEqual(decisionsPosees(journal.base), {});
  });

  test("retirée, une décision n'est plus décidée, et aucune variable d'environnement n'y supplée : le journal le porte au nom du chef", async (t) => {
    const { journal, station } = journalDuProjet(t);
    await station("reviewer-modele", "opus");

    const retrait = await station("remove", "reviewer-modele");

    assert.equal(retrait.code, 0);
    assert.match(retrait.sortie, /^brigade : reviewer-modele: withdrawn \(was: opus\) — it is no longer decided: the runtime keeps to what it read.*BRIGADE_REVIEWER_MODEL is only read from the log/);
    const fait = journal.tout().at(-1);
    assert.deepEqual([fait?.type, fait?.author, fait?.payload], ["decision.withdrawn", "chef", { name: "BRIGADE_REVIEWER_MODEL", previous: "opus" }]);
    assert.match((await station()).sortie, /^  reviewer-modele +not set/m);
    // Rien à retirer : rien n'est écrit.
    const ecrits = journal.tout().length;
    assert.match((await station("remove", "reviewer-modele")).sortie, /reviewer-modele: not set, nothing is written/);
    assert.equal((await station("remove", "BRIGADE_REVIEWER_MODEL")).code, 2);
    assert.equal(journal.tout().length, ecrits);
  });

  test("l'aide montre chaque geste en une ligne, avec ce qu'il attend — ni sudo, ni drop-in, ni éditeur", async (t) => {
    const { station } = journalDuProjet(t);

    const { code, sortie } = await station("help");

    assert.equal(code, 0);
    for (const [geste, attendu] of [
      ["stations <declaration>", "the project's stations — `<machine>/<engine>:<cooks cap>:<capability>+<capability>[:distante[+ordinaires|+ensemble]]`, separated by commas"],
      ["seuil-ticket <tokens>", "drift cost threshold: tokens of the most expensive ticket — an integer greater than zero"],
      ["seuil-perdus <tokens>", "drift cost threshold: lost tokens, launches that delivered nothing — an integer greater than zero"],
      ["manager-modele <model>", "the model of the manager's judgments — opus, sonnet or haiku"],
      ["manager-effort <effort>", "the effort of the manager's judgments — low, medium, high, xhigh or max"],
      ["reviewer-modele <model>", "the model of the reviewer's reviews — opus, sonnet or haiku"],
      ["reviewer-effort <effort>", "the effort of the reviewer's reviews — low, medium, high, xhigh or max"],
      ["closer-modele <model>", "the model of the closing pass (with closer-effort: without both, no pass writes) — opus, sonnet or haiku"],
      ["closer-effort <effort>", "the effort of the closing pass — low, medium, high, xhigh or max"],
      ["closer-cooks <cooks>", "the pass starts when fewer cooks than this are in flight — an integer greater than zero"],
      ["closer-tokens <tokens>", "token cap of a closing pass — an integer greater than zero"],
      ["closer-retraits <lines>", "cap on the lines a closing pass may remove — an integer greater than zero"],
      ["ceiling-modele <model>", "calibration ceiling: the highest model the manager raises a red ticket to (opus if unset) — opus, sonnet or haiku"],
      ["ceiling-effort <effort>", "calibration ceiling: the highest effort the manager raises a red ticket to (high if unset) — low, medium, high, xhigh or max"],
    ] as const) {
      assert.ok(sortie.split("\n").some((ligne) => ligne.trim().startsWith(geste) && ligne.endsWith(attendu)), `${geste} : ${sortie}`);
    }
    assert.doesNotMatch(sortie, /sudo|drop-in|systemctl|edit/);
  });

  test("sans journal, le geste refuse et n'en crée pas", async (t) => {
    const repertoire = repertoireTemporaire(t);
    const commande = appeler(montrerStation, ["seuil-ticket", "300000"], { BRIGADE_STATE_DIR: repertoire });

    assert.equal(await commande.fin, 1);
    assert.match(commande.sortie(), /no log in/);
    assert.equal(existsSync(cheminJournal(repertoire)), false);
  });

  test("sans journal, une décision le crée au nom du projet que l'unité donne : le runtime d'un projet neuf n'a pas démarré, et ne démarre qu'avec elles", async (t) => {
    const repertoire = repertoireTemporaire(t);
    const commande = appeler(montrerStation, ["manager-modele", "sonnet"], { BRIGADE_STATE_DIR: repertoire, BRIGADE_PROJECT: "calculus" });

    assert.equal(await commande.fin, 0, commande.sortie());
    const journal = ouvrirJournal(repertoire, { lectureSeule: true });
    t.after(() => journal.fermer());
    assert.deepEqual(journal.tout().map((e) => [e.project, e.author, e.type]), [["calculus", "chef", "decision.set"]]);
    assert.deepEqual(decisionsPosees(journal.base), { BRIGADE_MANAGER_MODEL: "sonnet" });
    // Un retrait, lui, n'a rien à retirer d'un journal qui n'existe pas.
    const autre = repertoireTemporaire(t);
    const retrait = appeler(montrerStation, ["remove", "manager-modele"], { BRIGADE_STATE_DIR: autre, BRIGADE_PROJECT: "calculus" });
    assert.equal(await retrait.fin, 1);
    assert.equal(existsSync(cheminJournal(autre)), false);
  });

  test("en cuisine : poser chaque décision, depuis le process du chef, n'interrompt pas le cook en vol — il continue et livre, et le runtime n'a pas redémarré", { skip: posixOnly("runs a kitchen whose cook is the fake claude (a bash script) while the chef's process writes each decision: on the Windows job that process stopped on 'database is locked' (BEGIN IMMEDIATE)") }, async (t) => {
    const { repertoire, journal, types, etat, cooks, conclure } = cuisine(t, { decisions: true, scenario: "commite-puis-attend", issues: [issue(16)] });
    await jusqua(() => cooks().length === 1 && types(16).includes("cook.launched"));

    // Comme `npm run station` la lance : un autre process, une autre connexion au journal.
    // Sa station reste, à deux cooks au plus.
    const valeurs = { ...Object.fromEntries(GESTES.map(([geste, , , seconde]) => [geste, seconde])), stations: `${STATION}:2:code` };
    for (const [geste, valeur] of Object.entries(valeurs)) {
      const pose = lancer(t, MONTRER, [geste, valeur], { BRIGADE_STATE_DIR: repertoire });
      assert.equal(await pose.fin, 0, pose.sortie());
      assert.match(pose.sortie(), /no running cook is stopped\n$/);
    }
    // Le runtime l'a lue sans redémarrer : sa station s'annonce de nouveau, à deux cooks.
    const annonces = () => journal.tout().flatMap((e) => (e.type === "station.announced" ? [e.payload.maxCooks] : []));
    await jusqua(() => annonces().includes(2));
    assert.deepEqual(stationsAnnoncees(journal.base), [STATION]);

    const ARRETS = ["cook.exited", "cook.interrupted", "guard.tripped", "ticket.released"];
    assert.deepEqual(types(16).filter((type) => ARRETS.includes(type)), []);
    assert.equal(cooks().length, 1);
    assert.equal(etat(16), "taken");
    assert.deepEqual(journal.tout().filter((e) => e.type.startsWith("runtime.") && e.type !== "runtime.ticked").map((e) => e.type), ["runtime.started"]);

    // Il finit de lui-même, comme il aurait fini : sa livraison est reçue.
    conclure();
    await jusqua(() => etat(16) === "pass");
    assert.equal((journal.duTicket(16).find((e) => e.type === "cook.exited")?.payload as { outcome?: string } | undefined)?.outcome, "ok");
    assert.equal(cooks().length, 1);
  });
});
