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

const MONTRER = join(import.meta.dirname, "../src/montrer-station.ts");

// Chaque geste, la décision qu'il pose, et deux valeurs successives.
const GESTES = [
  ["stations", "BRIGADE_STATIONS", "box/claude:3:code", "box/claude:2:code,box/playwright:1:navigateur-headless"],
  ["seuil-ticket", "BRIGADE_DRIFT_TICKET_TOKENS", "500000", "300000"],
  ["seuil-perdus", "BRIGADE_DRIFT_LOST_TOKENS", "200000", "100000"],
  ["manager-modele", "BRIGADE_MANAGER_MODEL", "sonnet", "opus"],
  ["manager-effort", "BRIGADE_MANAGER_EFFORT", "medium", "high"],
  ["reviewer-modele", "BRIGADE_REVIEWER_MODEL", "haiku", "sonnet"],
  ["reviewer-effort", "BRIGADE_REVIEWER_EFFORT", "medium", "low"],
  ["closer-modele", "BRIGADE_CLOSING_MODEL", "sonnet", "opus"],
  ["closer-effort", "BRIGADE_CLOSING_EFFORT", "medium", "high"],
  ["closer-cooks", "BRIGADE_CLOSING_COOKS", "2", "3"],
  ["closer-tokens", "BRIGADE_CLOSING_MAX_TOKENS", "400000", "300000"],
  ["closer-retraits", "BRIGADE_CLOSING_MAX_REMOVED_LINES", "300", "200"],
] as const;

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
      assert.match(avant, new RegExp(String.raw`^  ${geste} +non posée — ${decision} ne se lit que du journal$`, "m"));
    }

    for (const [geste, decision, premiere, seconde] of GESTES) {
      const pose = await station(geste, premiere);
      assert.equal(pose.code, 0, pose.sortie);
      assert.equal(
        pose.sortie,
        `brigade : ${geste} : ${premiere} (c'était : non posée) — lu par le runtime à sa lecture suivante, sans redémarrage ; aucun cook en cours n'est arrêté (aucun runtime ne tourne : la décision vaudra à son prochain démarrage)\n`,
      );
      const reprise = await station(geste, seconde);
      assert.equal(reprise.code, 0, reprise.sortie);
      assert.match(reprise.sortie, new RegExp(String.raw`^brigade : ${geste} : ${seconde.replaceAll("+", "\\+")} \(c'était : ${premiere}\) — lu par le runtime à sa lecture suivante`));
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
    assert.match(apres, /^décisions du chef +`station -- <geste> <valeur>` pour en poser une, `station -- aide` pour les gestes$/m);
    for (const [geste, , , seconde] of GESTES) assert.match(apres, new RegExp(String.raw`^  ${geste} +${seconde.replaceAll("+", "\\+")}$`, "m"));
  });

  test("reposer la valeur déjà posée n'écrit rien ; une valeur entourée d'espaces est posée sans eux", async (t) => {
    const { journal, station } = journalDuProjet(t);
    await station("seuil-ticket", " 400000 ");
    const deja = await station("seuil-ticket", "400000");

    assert.equal(deja.code, 0);
    assert.equal(deja.sortie, "brigade : seuil-ticket : déjà posée — 400000 ; rien n'est écrit\n");
    assert.deepEqual(
      journal.tout().filter((e) => e.type === "decision.set").map((e) => e.payload),
      [{ name: "BRIGADE_DRIFT_TICKET_TOKENS", value: "400000", previous: null }],
    );
  });

  test("une valeur invalide est refusée avec ce qui était attendu : rien n'est écrit ni journalisé", async (t) => {
    const { journal, station } = journalDuProjet(t);
    const STATIONS_ATTENDUES = /usage : `station -- stations <déclaration>` — `<machine>\/<moteur>:<plafond de cooks>:<capacité>\+<capacité>\[:distante\]`, séparées par des virgules/;
    const SEUIL = /attendu un entier supérieur à zéro/;
    const MODELE = /attendu opus, sonnet ou haiku/;
    const EFFORT = /attendu low, medium, high, xhigh ou max/;
    const REFUS: Array<[string[], RegExp[]]> = [
      // Modèle inconnu.
      [["manager-modele", "gpt"], [/manager-modele refusé, rien n'est écrit — BRIGADE_MANAGER_MODEL invalide : « gpt »/, MODELE]],
      [["reviewer-modele", "Opus"], [/BRIGADE_REVIEWER_MODEL invalide : « Opus »/, MODELE]],
      // Effort hors de l'échelle.
      [["manager-effort", "fort"], [/BRIGADE_MANAGER_EFFORT invalide : « fort »/, EFFORT]],
      [["reviewer-effort", "maximum"], [/BRIGADE_REVIEWER_EFFORT invalide : « maximum »/, EFFORT]],
      // Seuil non numérique, négatif, nul.
      [["seuil-ticket", "beaucoup"], [/BRIGADE_DRIFT_TICKET_TOKENS invalide : « beaucoup »/, SEUIL]],
      [["seuil-perdus", "-1"], [/BRIGADE_DRIFT_LOST_TOKENS invalide : « -1 »/, SEUIL]],
      [["seuil-perdus", "0"], [/BRIGADE_DRIFT_LOST_TOKENS invalide : « 0 »/, SEUIL]],
      [["seuil-ticket", "1.5"], [SEUIL]],
      // Liste de stations vide ou mal formée.
      [["stations", ""], [/stations refusé, rien n'est écrit — BRIGADE_STATIONS : une valeur vide n'est pas une décision/, STATIONS_ATTENDUES]],
      [["stations", " , "], [/station n° 1 \(«  »\) — elle est vide/, STATIONS_ATTENDUES]],
      [["stations", "box:2:code"], [/station n° 1 \(« box:2:code »\) — nom/, STATIONS_ATTENDUES]],
      [["stations", "box/claude:0:code"], [/plafond/, STATIONS_ATTENDUES]],
      // Sans valeur, ou avec plusieurs.
      [["stations"], [/stations attend une valeur, et une seule — `station -- stations <déclaration>` : `<machine>/]],
      [["manager-modele", "opus", "high"], [/manager-modele attend une valeur, et une seule — `station -- manager-modele <modèle>` : opus, sonnet ou haiku/]],
      // Un geste qui n'existe pas.
      [["manager-temperature", "1"], [/^brigade : usage : /]],
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

    const retrait = await station("retirer", "reviewer-modele");

    assert.equal(retrait.code, 0);
    assert.match(retrait.sortie, /^brigade : reviewer-modele : retirée \(c'était : opus\) — elle n'est plus décidée : le runtime s'en tient à ce qu'il lisait.*BRIGADE_REVIEWER_MODEL ne se lit que du journal/);
    const fait = journal.tout().at(-1);
    assert.deepEqual([fait?.type, fait?.author, fait?.payload], ["decision.withdrawn", "chef", { name: "BRIGADE_REVIEWER_MODEL", previous: "opus" }]);
    assert.match((await station()).sortie, /^  reviewer-modele +non posée/m);
    // Rien à retirer : rien n'est écrit.
    const ecrits = journal.tout().length;
    assert.match((await station("retirer", "reviewer-modele")).sortie, /reviewer-modele : non posée, rien n'est écrit/);
    assert.equal((await station("retirer", "BRIGADE_REVIEWER_MODEL")).code, 2);
    assert.equal(journal.tout().length, ecrits);
  });

  test("l'aide montre chaque geste en une ligne, avec ce qu'il attend — ni sudo, ni drop-in, ni éditeur", async (t) => {
    const { station } = journalDuProjet(t);

    const { code, sortie } = await station("aide");

    assert.equal(code, 0);
    for (const [geste, attendu] of [
      ["stations <déclaration>", "les stations du projet — `<machine>/<moteur>:<plafond de cooks>:<capacité>+<capacité>[:distante]`, séparées par des virgules"],
      ["seuil-ticket <tokens>", "seuil de coût de la dérive : tokens du ticket le plus cher — un entier supérieur à zéro"],
      ["seuil-perdus <tokens>", "seuil de coût de la dérive : tokens perdus, lancements qui n'ont rien livré — un entier supérieur à zéro"],
      ["manager-modele <modèle>", "le modèle des jugements du manager — opus, sonnet ou haiku"],
      ["manager-effort <effort>", "l'effort des jugements du manager — low, medium, high, xhigh ou max"],
      ["reviewer-modele <modèle>", "le modèle des relectures du reviewer — opus, sonnet ou haiku"],
      ["reviewer-effort <effort>", "l'effort des relectures du reviewer — low, medium, high, xhigh ou max"],
      ["closer-modele <modèle>", "le modèle de la passe de fermeture (avec closer-effort : sans eux, aucune passe n'écrit) — opus, sonnet ou haiku"],
      ["closer-effort <effort>", "l'effort de la passe de fermeture — low, medium, high, xhigh ou max"],
      ["closer-cooks <cooks>", "la passe part quand moins de cooks que cela sont en vol — un entier supérieur à zéro"],
      ["closer-tokens <tokens>", "plafond de tokens d'une passe de fermeture — un entier supérieur à zéro"],
      ["closer-retraits <lignes>", "plafond de lignes qu'une passe de fermeture peut retirer — un entier supérieur à zéro"],
    ] as const) {
      assert.ok(sortie.split("\n").some((ligne) => ligne.trim().startsWith(geste) && ligne.endsWith(attendu)), `${geste} : ${sortie}`);
    }
    assert.doesNotMatch(sortie, /sudo|drop-in|systemctl|éditer/);
  });

  test("sans journal, le geste refuse et n'en crée pas", async (t) => {
    const repertoire = repertoireTemporaire(t);
    const commande = appeler(montrerStation, ["seuil-ticket", "300000"], { BRIGADE_STATE_DIR: repertoire });

    assert.equal(await commande.fin, 1);
    assert.match(commande.sortie(), /aucun journal dans/);
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
    const retrait = appeler(montrerStation, ["retirer", "manager-modele"], { BRIGADE_STATE_DIR: autre, BRIGADE_PROJECT: "calculus" });
    assert.equal(await retrait.fin, 1);
    assert.equal(existsSync(cheminJournal(autre)), false);
  });

  test("en cuisine : poser chaque décision, depuis le process du chef, n'interrompt pas le cook en vol — il continue et livre, et le runtime n'a pas redémarré", async (t) => {
    const { repertoire, journal, types, etat, cooks, conclure } = cuisine(t, { decisions: true, scenario: "commite-puis-attend", issues: [issue(16)] });
    await jusqua(() => cooks().length === 1 && types(16).includes("cook.launched"));

    // Comme `npm run station` la lance : un autre process, une autre connexion au journal.
    // Sa station reste, à deux cooks au plus.
    const valeurs = { ...Object.fromEntries(GESTES.map(([geste, , , seconde]) => [geste, seconde])), stations: `${STATION}:2:code` };
    for (const [geste, valeur] of Object.entries(valeurs)) {
      const pose = lancer(t, MONTRER, [geste, valeur], { BRIGADE_STATE_DIR: repertoire });
      assert.equal(await pose.fin, 0, pose.sortie());
      assert.match(pose.sortie(), /aucun cook en cours n'est arrêté\n$/);
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
