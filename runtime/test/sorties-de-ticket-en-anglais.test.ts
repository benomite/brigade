// Les sorties des commandes qui parlent d'un ticket sont en anglais (#931) : `rail` (avec `remove`, `priority`, `merge`),
// `pass` (avec `issue`, `comment`, `ask`), `log` et `waiting` (`set`, `resume`, `arrived`). Un état d'exemple qui
// porte un rail, des livraisons en pass et des attentes passe dans le test de glossaire : aucune ligne, refus compris,
// ne garde un mot de la colonne « français » du glossaire. La sortie `--json` de `pass` garde ses clés.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { principal as attendre } from "../src/attente-cli.ts";
import { principal as montrerPass } from "../src/montrer-pass.ts";
import { principal as montrerRail } from "../src/montrer-rail.ts";
import { principal as relire } from "../src/relire.ts";
import { exempleDuBas } from "./aides/bas-de-status.ts";
import { sansMotFrancais } from "./aides/glossaire.ts";
import { appeler, DEPOT, repertoireTemporaire } from "./outils.ts";

type Commande = Parameters<typeof appeler>[0];

// L'état d'exemple du bas de `status`, et le répertoire où son journal vit.
function etat(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  exempleDuBas(t, repertoire);
  return { repertoire, env: { BRIGADE_STATE_DIR: repertoire } as Record<string, string> };
}

async function sortie(commande: Commande, args: string[], env: Record<string, string>) {
  const enfant = appeler(commande, args, env);
  const code = await enfant.fin;
  return { code, lignes: enfant.sortie().trimEnd().split("\n") };
}

test("`rail` : le rail de l'état d'exemple ne porte aucun mot français du glossaire, ni ses refus", async (t) => {
  const { env } = etat(t);
  const rail = await sortie(montrerRail, [], env);
  assert.equal(rail.code, 0);
  assert.ok(rail.lignes.length > 10);
  sansMotFrancais(rail.lignes);

  // Les refus : un geste inconnu, un ticket pris, un ticket absent, sans dépôt déclaré.
  for (const args of [["bouger", "1"], ["remove"], ["remove", "31"], ["merge", "404"], ["remove", "30"]]) {
    const refus = await sortie(montrerRail, args, { ...env, BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: "/inexistant" });
    assert.notEqual(refus.code, 0, args.join(" "));
    sansMotFrancais(refus.lignes);
  }
  const sansDepot = await sortie(montrerRail, ["remove", "30"], env);
  assert.equal(sansDepot.code, 2);
  sansMotFrancais(sansDepot.lignes);
  const sansEtat = await sortie(montrerRail, [], {});
  assert.equal(sansEtat.code, 2);
  sansMotFrancais(sansEtat.lignes);
  const sansJournal = await sortie(montrerRail, [], { BRIGADE_STATE_DIR: repertoireTemporaire(t) });
  assert.equal(sansJournal.code, 1);
  sansMotFrancais(sansJournal.lignes);
});

test("`log` : l'état d'exemple se lit sans mot français du glossaire, et ses refus aussi", async (t) => {
  const { env } = etat(t);
  for (const args of [[], ["--ticks"], ["30"], ["17", "--last", "3"], ["404"]]) {
    const lu = await sortie(relire, args, env);
    assert.equal(lu.code, 0, args.join(" "));
    // Les charges utiles du journal sont des données écrites telles quelles : seul ce que `log` dit lui-même est lu.
    sansMotFrancais(lu.lignes.filter((ligne) => !ligne.includes("{")));
  }
  for (const [args, environnement] of [[["x"], env], [[], {}], [[], { BRIGADE_STATE_DIR: repertoireTemporaire(t) }]] as const) {
    const refus = await sortie(relire, [...args], { ...environnement });
    assert.notEqual(refus.code, 0);
    sansMotFrancais(refus.lignes);
  }
});

test("`waiting` : lister, set, resume, arrived et leurs refus ne portent aucun mot français du glossaire", async (t) => {
  const { env } = etat(t);
  const jouer = (...args: string[]) => sortie((appel) => attendre(appel, () => new Date("2026-10-12T10:04:00.000Z")), args, env);

  const vide = await jouer();
  assert.equal(vide.code, 0);
  sansMotFrancais(vide.lignes);
  const pose = await jouer("set", "30", "--what", "the contract", "--from", "the lawyer", "--remind", "3j");
  assert.equal(pose.code, 0, pose.lignes.join("\n"));
  sansMotFrancais(pose.lignes);
  sansMotFrancais((await jouer()).lignes);
  for (const args of [["resume", "30"], ["resume", "30"], ["set", "31", "--what", "x", "--from", "y"], ["set", "404", "--what", "x", "--from", "y"], ["set", "30", "--what", "x", "--from", "y", "--remind", "hier"], ["set", "30", "--what", " ", "--from", "y"], ["bouger", "30"], ["set", "30"], ["resume"]]) {
    const lu = await jouer(...args);
    sansMotFrancais(lu.lignes);
  }
  const refus = await sortie(attendre, [], {});
  assert.equal(refus.code, 2);
  sansMotFrancais(refus.lignes);
});

test("`pass` : les livraisons de l'état d'exemple, chaque ticket et chaque refus ne portent aucun mot français du glossaire", async (t) => {
  const { env } = etat(t);
  const liste = await sortie(montrerPass, [], env);
  assert.equal(liste.code, 0);
  sansMotFrancais(liste.lignes);

  // Un ticket par la pass : ses lignes sont celles de `pass` ; la charge utile écrite par d'autres (constat du reviewer, des gates) est lue telle quelle.
  const ticket = await sortie(montrerPass, ["40"], env);
  assert.equal(ticket.code, 0);
  sansMotFrancais(ticket.lignes);
  sansMotFrancais((await sortie(montrerPass, ["404"], env)).lignes);

  // Les refus : un argument qui n'est pas un ticket, un geste mal formé, sans dépôt, sans état, sans journal.
  const avecDepot = { ...env, BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: "/inexistant" };
  for (const [args, environnement] of [
    [["tous"], env], [["40", "--json", "x"], env], [["40", "comment"], avecDepot], [["40", "issue", "x"], avecDepot], [["40", "bouger"], avecDepot], [["40", "issue"], env], [["40", "ask"], env],
    [["40", "issue"], avecDepot], [["40", "comment", "du contexte"], avecDepot], [[], {}], [[], { BRIGADE_STATE_DIR: repertoireTemporaire(t) }],
  ] as const) {
    const refus = await sortie(montrerPass, [...args], { ...environnement });
    assert.notEqual(refus.code, 0, args.join(" "));
    sansMotFrancais(refus.lignes);
  }
});

test("`pass --json` garde ses clés", async (t) => {
  const { env } = etat(t);
  const json = await sortie(montrerPass, ["40", "--json"], env);
  assert.equal(json.code, 0);
  const lu = JSON.parse(json.lignes.join("\n")) as Record<string, unknown>;
  assert.ok(Object.keys(lu).length > 0);
  const clefs = (valeur: unknown): string[] =>
    Array.isArray(valeur) ? valeur.flatMap(clefs) : valeur !== null && typeof valeur === "object" ? Object.entries(valeur).flatMap(([clef, sous]) => [clef, ...clefs(sous)]) : [];
  // Les clés sont celles de la projection, en anglais et en camelCase : aucune n'est traduite.
  for (const clef of clefs(lu)) assert.match(clef, /^[a-z][A-Za-z0-9]*$/, clef);
});
