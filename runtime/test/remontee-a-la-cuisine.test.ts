// Ce qui peut encore poser une carte devant le chef, et ce qui n'y va plus
// (#1826) : la file du chef ne tient qu'un choix de produit ou un geste que lui
// seul peut faire ; une cause technique va à la cuisine.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { QUI_ATTEND } from "../src/attend.ts";
import { DU_MANAGER, ENCORE_ROUGE, HORS_RAIL, NON_JUGEE } from "../src/events/pass.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { RENOMMAGE_ABANDONNE } from "../src/pause/pause.ts";
import { INTRANSPOSABLE } from "../src/pause/reprise.ts";
import { aLaCuisine, CAUSES_DE_LA_CUISINE, CAUSES_DU_CHEF, prochainCoup, REMONTEES_SANS_ENTREE, SANS_RENVOI } from "../src/remontee-a-la-cuisine.ts";
import { repertoireTemporaire } from "./outils.ts";

const SRC = join(import.meta.dirname, "..", "src");

test("chaque sorte d'entrée dans la file du chef est un choix de produit ou un geste que lui seul peut faire, et dit pourquoi", () => {
  // La liste entière : une sorte ajoutée doit être lue ici, et classée.
  assert.deepEqual(
    Object.fromEntries(Object.entries(QUI_ATTEND).map(([quoi, { sorte }]) => [quoi, sorte])),
    {
      merge: "chef-gesture",
      remontee: "chef-gesture",
      fermee: "chef-gesture",
      "86": "chef-gesture",
      capacite: "chef-gesture",
      absente: "chef-gesture",
      bloque: "product",
      ecartee: "chef-gesture",
      illisible: "chef-gesture",
      question: "product",
      repris: "chef-gesture",
      carte: "product",
      connexion: "chef-gesture",
      session: "chef-gesture",
      jeton: "chef-gesture",
      fermeture: "chef-gesture",
      base: "chef-gesture",
      setup: "chef-gesture",
      aside: "chef-gesture",
      disjoncteur: "chef-gesture",
      pause: "chef-gesture",
      renommage: "chef-gesture",
    },
  );
  for (const [quoi, { pourquoi }] of Object.entries(QUI_ATTEND)) assert.ok(pourquoi.length > 20, `${quoi} : dire pourquoi c'est au chef`);
  // Une remontée n'y entre que pour ces causes-là.
  assert.deepEqual(Object.keys(CAUSES_DU_CHEF), ["secrets-unavailable", `${DU_MANAGER} + card`]);
  for (const pourquoi of Object.values(CAUSES_DU_CHEF)) assert.match(pourquoi, /^(chef-only gesture|product choice): /);
});

// Les causes de remontée que le runtime écrit, relues dans son code : un appel
// à `remonter`, ou un `pass.escalated` qui porte sa cause.
function causesEcrites(): string[] {
  const constantes: Record<string, string> = { INTRANSPOSABLE, DU_MANAGER, HORS_RAIL, RENOMMAGE_ABANDONNE };
  const causes = new Set<string>();
  const lire = (brut: string, fichier: string) => {
    if (brut.startsWith('"')) return brut.slice(1, -1);
    const valeur = constantes[brut];
    assert.ok(valeur !== undefined, `${fichier} : une cause de remontée écrite par une constante que ce test ne connaît pas (${brut})`);
    return valeur;
  };
  const fichiers = readdirSync(SRC, { recursive: true, encoding: "utf8" }).filter((chemin) => chemin.endsWith(".ts"));
  for (const fichier of fichiers) {
    const code = readFileSync(join(SRC, fichier), "utf8");
    for (const [, brut] of code.matchAll(/\bremonter\(\s*[^,()]+(?:\([^)]*\))?,\s*("[^"]+"|[A-Z_]+)/g)) causes.add(lire(String(brut), fichier));
    for (const ligne of code.split("\n").filter((l) => l.includes('"pass.escalated"'))) {
      for (const [, brut] of ligne.matchAll(/\bcause: ("[^"]+"|[A-Z_]+)/g)) causes.add(lire(String(brut), fichier));
    }
  }
  return [...causes].sort();
}

test("chaque cause de remontée que le runtime écrit va à la cuisine, ou est nommée avec ce qui la garde hors de TODO ou la rend au chef", (t) => {
  const causes = causesEcrites();
  // De quoi voir que la lecture du code trouve encore ce qu'elle cherche.
  for (const connue of ["ci-silent", "review-unreadable", "worktree-lost", "returns-exhausted", DU_MANAGER, "secrets-unavailable", HORS_RAIL]) assert.ok(causes.includes(connue), connue);
  const nommees = new Set([...Object.keys(CAUSES_DE_LA_CUISINE), ...Object.keys(CAUSES_DU_CHEF), ...Object.keys(REMONTEES_SANS_ENTREE)]);
  assert.deepEqual(
    causes.filter((cause) => !nommees.has(cause)),
    [],
    "une cause nouvelle : dire si la cuisine la reprend (CAUSES_DE_LA_CUISINE) ou pourquoi elle est au chef (CAUSES_DU_CHEF)",
  );

  const { base } = ouvrirJournal(repertoireTemporaire(t));
  const motif = (cause: string) => (["returns-exhausted", DU_MANAGER].includes(cause) ? ENCORE_ROUGE : NON_JUGEE);
  for (const cause of Object.keys(CAUSES_DE_LA_CUISINE)) assert.equal(aLaCuisine(base, 17, motif(cause), cause), true, cause);
  assert.equal(aLaCuisine(base, 17, NON_JUGEE, "secrets-unavailable"), false);
  assert.equal(aLaCuisine(base, 17, ENCORE_ROUGE, HORS_RAIL), false);
  assert.equal(aLaCuisine(base, 17, NON_JUGEE, RENOMMAGE_ABANDONNE), false);
  // Une cause que personne n'a encore nommée va à la cuisine, pas au chef.
  assert.equal(aLaCuisine(base, 17, NON_JUGEE, "cause-neuve"), true);
});

test("la cuisine renvoie une fois ce qui n'a pas été jugé, ouvre un ticket `fix` sur ce qui reste rouge ou revient, puis n'essaie plus rien", () => {
  const rien = { renvoye: false, fixe: false };
  assert.equal(prochainCoup({ reason: NON_JUGEE, cause: "ci-silent" }, rien, true), "return");
  assert.equal(prochainCoup({ reason: NON_JUGEE, cause: "ci-silent" }, { renvoye: true, fixe: false }, true), "fix");
  assert.equal(prochainCoup({ reason: ENCORE_ROUGE, cause: "returns-exhausted" }, rien, true), "fix");
  // Ce que le cook ne lève pas va droit au `fix`.
  for (const cause of Object.keys(SANS_RENVOI)) assert.equal(prochainCoup({ reason: NON_JUGEE, cause }, rien, true), "fix", cause);
  assert.equal(prochainCoup({ reason: NON_JUGEE, cause: "ci-silent" }, { renvoye: true, fixe: true }, true), "none");
  // Un ticket qui est lui-même une correction de la cuisine n'en ouvre pas une de plus.
  assert.equal(prochainCoup({ reason: ENCORE_ROUGE, cause: "returns-exhausted" }, rien, false), "none");
});
