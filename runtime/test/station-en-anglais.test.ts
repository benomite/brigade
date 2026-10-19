// Les sorties de `station` sont en anglais (#953) : la vue (stations, cooks, consommé, décisions), `cooks <N>`,
// une décision, `remove` et `help`, avec leurs refus. Un état d'exemple passe dans le test de glossaire : aucune
// ligne, refus compris, ne garde un mot de la colonne « français » du glossaire. Les gestes gardent leur nom, et un état
// posé avant le ticket — décisions écrites, anciens mots `retirer` et `aide` — est montré et appliqué tel quel.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { decisionsPosees, environnementDecide } from "../src/decisions.ts";
import { openLog } from "../src/log.ts";
import { principal as montrerStation } from "../src/montrer-station.ts";
import { exempleDuBas } from "./aides/bas-de-status.ts";
import { sansMotFrancais } from "./aides/glossaire.ts";
import { STATION } from "./aides/haut-de-status.ts";
import { appeler, repertoireTemporaire } from "./outils.ts";

function etat(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  exempleDuBas(t, repertoire);
  return { repertoire, env: { BRIGADE_STATE_DIR: repertoire } as Record<string, string> };
}

async function sortie(args: string[], env: Record<string, string>) {
  const enfant = appeler(montrerStation, args, env);
  const code = await enfant.fin;
  return { code, lignes: enfant.sortie().trimEnd().split("\n") };
}

test("`station` : la vue de l'état d'exemple ne porte aucun mot français du glossaire", async (t) => {
  const { env } = etat(t);
  const vue = await sortie([], env);
  assert.equal(vue.code, 0);
  assert.ok(vue.lignes.length > 10);
  sansMotFrancais(vue.lignes);
});

test("`station` : `cooks`, chaque décision, `remove` et `help` n'écrivent aucun mot français du glossaire", async (t) => {
  const { env } = etat(t);
  const jouer = async (...args: string[]) => {
    const lu = await sortie(args, env);
    sansMotFrancais(lu.lignes);
    return lu;
  };
  assert.equal((await jouer("cooks", "3")).code, 0);
  assert.equal((await jouer("cooks", "3")).code, 0);
  assert.equal((await jouer("cooks", "0")).code, 0);
  for (const [geste, valeur] of [["stations", `${STATION}:2:code`], ["seuil-ticket", "300000"], ["seuil-perdus", "100000"], ["seuil-renvois", "40"], ["fenetre-renvois", "8"], ["manager-modele", "sonnet"], ["manager-effort", "medium"], ["reviewer-modele", "opus"], ["reviewer-effort", "high"], ["closer-modele", "sonnet"], ["closer-effort", "low"], ["closer-cooks", "2"], ["closer-tokens", "400000"], ["closer-retraits", "300"]] as const) {
    assert.equal((await jouer(geste, valeur)).code, 0, geste);
    assert.equal((await jouer(geste, valeur)).code, 0, geste);
  }
  // Ce qui a été posé se montre, sous le geste qui l'a posé.
  const vue = await jouer();
  assert.ok(vue.lignes.some((ligne) => /^  closer-effort\s+low$/.test(ligne)), vue.lignes.join("\n"));
  assert.ok(vue.lignes.some((ligne) => /^closer in force\s/.test(ligne)), vue.lignes.join("\n"));
  for (const geste of ["seuil-ticket", "stations", "manager-modele", "closer-retraits"]) assert.equal((await jouer("remove", geste)).code, 0, geste);
  assert.equal((await jouer("remove", "seuil-ticket")).code, 0);
  for (const aide of ["help", "--help"]) assert.equal((await jouer(aide)).code, 0);
});

test("`station` : chaque refus, y compris ceux de `decisions.ts` et de `stations-declarees.ts`, est en anglais", async (t) => {
  const { env } = etat(t);
  const refus: Array<[string[], Record<string, string>]> = [
    [["cooks"], env], [["cooks", "-1"], env], [["cooks", "beaucoup"], env], [["cooks", "3", "4"], env], [["bouger"], env], [["14"], env],
    [["stations", "box:2:code"], env], [["stations", "box/claude:0:code"], env], [["stations", "box/claude:2"], env], [["stations", "box/claude:2:code+code"], env],
    [["stations", "box/claude:2:code:opus"], env], [["stations", "box/claude:2:code:ordinaires"], env], [["stations", "box/claude:2:navigateur headless"], env],
    [["stations", ""], env], [["stations", " , "], env], [["stations"], env],
    [["seuil-ticket", "beaucoup"], env], [["seuil-ticket", "0"], env], [["seuil-perdus", "-1"], env], [["seuil-renvois", "x"], env], [["fenetre-renvois", "1.5"], env],
    [["manager-modele", "gpt"], env], [["manager-effort", "fort"], env], [["reviewer-modele", "Opus"], env], [["reviewer-effort", "maximum"], env],
    [["closer-modele", "gpt"], env], [["closer-effort", "fort"], env], [["closer-cooks", "0"], env], [["closer-tokens", "x"], env], [["closer-retraits", "-3"], env],
    [["manager-modele", "opus", "high"], env], [["remove"], env], [["remove", "plat-du-jour"], env],
    [[], {}], [[], { BRIGADE_STATE_DIR: repertoireTemporaire(t) }], [["seuil-ticket", "300000"], { BRIGADE_STATE_DIR: repertoireTemporaire(t) }],
  ];
  for (const [args, environnement] of refus) {
    const lu = await sortie(args, environnement);
    assert.notEqual(lu.code, 0, args.join(" "));
    sansMotFrancais(lu.lignes);
    // Un refus n'est pas seulement sans mot du glossaire : il ne garde aucune des phrases françaises d'avant.
    assert.doesNotMatch(lu.lignes.join("\n"), /n'est pas|invalide|attendu|refusé|rien n'est écrit|aucun|journal/, args.join(" "));
  }
  // Un plafond avant toute station : le refus dit le geste, en anglais.
  const vide = repertoireTemporaire(t);
  openLog(vide).fermer();
  const sansStation = await sortie(["cooks", "3"], { BRIGADE_STATE_DIR: vide });
  assert.notEqual(sansStation.code, 0);
  sansMotFrancais(sansStation.lignes);
});

test("`station` : un état posé avant le ticket — décisions écrites, anciens mots — est montré et appliqué sans édition manuelle", async (t) => {
  const repertoire = repertoireTemporaire(t);
  // Le journal d'un runtime d'avant : des décisions posées par le chef, la station annoncée.
  const log = openLog(repertoire);
  log.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
  log.ajouter({ project: "brigade", ticket: null, author: `station:${STATION}`, type: "station.announced", payload: { station: STATION, engine: "claude", provides: ["code"], maxCooks: 1 } });
  log.ajouter({ project: "brigade", ticket: null, author: "chef", type: "decision.set", payload: { name: "BRIGADE_DRIFT_TICKET_TOKENS", value: "800000", previous: null } });
  log.ajouter({ project: "brigade", ticket: null, author: "chef", type: "decision.set", payload: { name: "BRIGADE_REVIEWER_MODEL", value: "opus", previous: null } });
  log.fermer();
  const env = { BRIGADE_STATE_DIR: repertoire };

  // Montrées : la valeur posée avant, sous le geste qui garde son nom.
  const vue = await sortie([], env);
  assert.equal(vue.code, 0);
  sansMotFrancais(vue.lignes);
  assert.ok(vue.lignes.some((ligne) => /^  seuil-ticket\s+800000$/.test(ligne)), vue.lignes.join("\n"));
  assert.ok(vue.lignes.some((ligne) => /^  reviewer-modele\s+opus$/.test(ligne)), vue.lignes.join("\n"));

  // Appliquées : le runtime les lit telles quelles, et un nouveau réglage garde la valeur d'avant comme « was ».
  const lecture = openLog(repertoire, { lectureSeule: true });
  t.after(() => lecture.fermer());
  assert.deepEqual(decisionsPosees(lecture.base), { BRIGADE_DRIFT_TICKET_TOKENS: "800000", BRIGADE_REVIEWER_MODEL: "opus" });
  assert.equal(environnementDecide({}, decisionsPosees(lecture.base)).BRIGADE_REVIEWER_MODEL, "opus");
  const reglage = await sortie(["seuil-ticket", "900000"], env);
  assert.equal(reglage.code, 0);
  assert.match(reglage.lignes[0] ?? "", /^brigade : seuil-ticket: 900000 \(was: 800000\)/);

  // Les anciens mots répondent encore, en disant le nouveau, et l'effet est le même.
  const retrait = await sortie(["retirer", "reviewer-modele"], env);
  assert.equal(retrait.code, 0);
  assert.match(retrait.lignes.join("\n"), /“retirer” is now “remove”/);
  assert.match(retrait.lignes.join("\n"), /reviewer-modele: withdrawn \(was: opus\)/);
  assert.equal(decisionsPosees(lecture.base).BRIGADE_REVIEWER_MODEL, undefined);
  const aide = await sortie(["aide"], env);
  assert.equal(aide.code, 0);
  assert.match(aide.lignes.join("\n"), /“aide” is now “help”/);
  assert.match(aide.lignes.join("\n"), /^usage: /m);
});

test("`station` : les gestes gardent leurs noms", async (t) => {
  const { env } = etat(t);
  const aide = (await sortie(["help"], env)).lignes.join("\n");
  for (const geste of ["stations", "seuil-ticket", "seuil-perdus", "seuil-renvois", "fenetre-renvois", "manager-modele", "manager-effort", "reviewer-modele", "reviewer-effort", "closer-modele", "closer-effort", "closer-cooks", "closer-tokens", "closer-retraits", "cooks", "remove"]) {
    assert.match(aide, new RegExp(`^  ${geste} `, "m"), geste);
  }
});
