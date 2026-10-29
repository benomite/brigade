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
import {
  aLaCuisine,
  calibrageAuDessus,
  CAUSES_DE_LA_CUISINE,
  CAUSES_DU_CHEF,
  dejaTente,
  derniereRemontee,
  direReprise,
  direRepriseEn,
  fixPermis,
  prochainCoup,
  raisonDAbandon,
  reessaiPermis,
  REMONTEES_SANS_ENTREE,
  repriseDeLaRemontee,
  repriseDuTicket,
  SANS_RENVOI,
} from "../src/remontee-a-la-cuisine.ts";
import { aArreter, repertoireTemporaire } from "./outils.ts";

const SRC = join(import.meta.dirname, "..", "src");

test("chaque sorte d'entrée dans la file du chef est un choix de produit ou un geste que lui seul peut faire, et dit pourquoi", () => {
  // La liste entière : une sorte ajoutée doit être lue ici, et classée. Un
  // ticket que la cuisine a mis de côté, ou qui en attend un autre, n'y a pas
  // de sorte : il attend sur le rail, pas le chef (#1834).
  assert.deepEqual(
    Object.fromEntries(Object.entries(QUI_ATTEND).map(([quoi, { sorte }]) => [quoi, sorte])),
    {
      merge: "chef-gesture",
      remontee: "chef-gesture",
      fermee: "chef-gesture",
      ecartee: "chef-gesture",
      illisible: "chef-gesture",
      question: "product",
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

  const journal = ouvrirJournal(repertoireTemporaire(t));
  // Fermé avant que son répertoire ne soit effacé : Windows refuse d'effacer une base ouverte.
  aArreter(t, () => journal.fermer());
  const { base } = journal;
  const motif = (cause: string) => (["returns-exhausted", DU_MANAGER].includes(cause) ? ENCORE_ROUGE : NON_JUGEE);
  for (const cause of Object.keys(CAUSES_DE_LA_CUISINE)) assert.equal(aLaCuisine(base, 17, motif(cause), cause), true, cause);
  assert.equal(aLaCuisine(base, 17, NON_JUGEE, "secrets-unavailable"), false);
  assert.equal(aLaCuisine(base, 17, ENCORE_ROUGE, HORS_RAIL), false);
  assert.equal(aLaCuisine(base, 17, NON_JUGEE, RENOMMAGE_ABANDONNE), false);
  // Une cause que personne n'a encore nommée va à la cuisine, pas au chef.
  assert.equal(aLaCuisine(base, 17, NON_JUGEE, "cause-neuve"), true);
});

test("la cuisine renvoie une fois ce qui n'a pas été jugé, ouvre un ticket `fix` sur ce qui reste rouge ou revient, puis monte le calibrage d'un cran — jamais « rien de plus »", () => {
  const rien = { renvoye: false, fixe: false };
  const tout = { renvoye: true, fixe: true };
  for (const peutMonter of [true, false]) {
    assert.equal(prochainCoup({ reason: NON_JUGEE, cause: "ci-silent" }, rien, true, peutMonter), "return");
    assert.equal(prochainCoup({ reason: NON_JUGEE, cause: "ci-silent" }, { renvoye: true, fixe: false }, true, peutMonter), "fix");
    assert.equal(prochainCoup({ reason: ENCORE_ROUGE, cause: "returns-exhausted" }, rien, true, peutMonter), "fix");
    // Ce que le cook ne lève pas va droit au `fix`.
    for (const cause of Object.keys(SANS_RENVOI)) assert.equal(prochainCoup({ reason: NON_JUGEE, cause }, rien, true, peutMonter), "fix", cause);
  }
  // Ses tentatives épuisées, un ticket sous le plafond repart un cran plus haut, il n'est pas mis de côté.
  assert.equal(prochainCoup({ reason: NON_JUGEE, cause: "ci-silent" }, tout, true, true), "raise");
  assert.equal(prochainCoup({ reason: ENCORE_ROUGE, cause: "returns-exhausted" }, { renvoye: false, fixe: true }, true, true), "raise");
  // Un ticket qui est lui-même une correction de la cuisine n'en ouvre pas une de plus : il monte.
  assert.equal(prochainCoup({ reason: ENCORE_ROUGE, cause: "returns-exhausted" }, rien, false, true), "raise");
  // Au plus haut calibrage permis, il est abandonné ; de même pour une cause qu'aucun cook ne lève.
  assert.equal(prochainCoup({ reason: NON_JUGEE, cause: "ci-silent" }, tout, true, false), "drop");
  assert.equal(prochainCoup({ reason: ENCORE_ROUGE, cause: "returns-exhausted" }, rien, false, false), "drop");
  for (const cause of Object.keys(SANS_RENVOI)) assert.equal(prochainCoup({ reason: NON_JUGEE, cause }, { renvoye: false, fixe: true }, true, true), "drop", cause);
});

test("la cuisine monte d'un cran — l'effort, puis le modèle —, dans la limite du plafond du projet, et ne pose jamais `xhigh` ni `max`", () => {
  const plafond = { model: "opus", effort: "high" };
  assert.deepEqual(calibrageAuDessus({ model: "sonnet", effort: "low" }, plafond), { model: "sonnet", effort: "medium" });
  assert.deepEqual(calibrageAuDessus({ model: "sonnet", effort: "high" }, plafond), { model: "opus", effort: "high" });
  assert.deepEqual(calibrageAuDessus({ model: "haiku", effort: "high" }, plafond), { model: "sonnet", effort: "high" });
  // Au plus haut calibrage permis : rien ne monte.
  assert.equal(calibrageAuDessus({ model: "opus", effort: "high" }, plafond), null);
  // Un plafond plus haut que `high` n'y change rien : la cuisine s'arrête à `high`.
  for (const effort of ["xhigh", "max"]) assert.equal(calibrageAuDessus({ model: "opus", effort: "high" }, { model: "opus", effort }), null, effort);
  assert.deepEqual(calibrageAuDessus({ model: "sonnet", effort: "medium" }, { model: "opus", effort: "max" }), { model: "sonnet", effort: "high" });
  // Un effort que le chef a posé au-dessus de `high` ne repart pas tel quel sous un modèle plus haut.
  assert.equal(calibrageAuDessus({ model: "sonnet", effort: "xhigh" }, { model: "opus", effort: "max" }), null);
  // Le plafond du projet est la limite : plus bas que le défaut, il arrête la montée plus tôt.
  assert.equal(calibrageAuDessus({ model: "sonnet", effort: "medium" }, { model: "sonnet", effort: "medium" }), null);
  // Ce qui ne monte plus a sa raison, que l'issue lira.
  assert.match(raisonDAbandon("ci-silent", { model: "opus", effort: "high" }, plafond), /^son calibrage \(`opus` \/ `high`\) est déjà au plus haut que la cuisine pose/);
  for (const cause of Object.keys(SANS_RENVOI)) assert.match(raisonDAbandon(cause, null, plafond), new RegExp(`^sa cause \\(\`${cause}\`\\) n'est pas au cook`), cause);
});

test("une remontée qu'un runtime d'avant #1861 a laissée « sans suite » (`none`) n'est plus finale : la cuisine la reprend", (t) => {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  aArreter(t, () => journal.fermer());
  const ajouter = (type: string, payload: Record<string, unknown>) => journal.ajouter({ project: "brigade", ticket: 17, author: "pass", type, payload } as unknown as Parameters<typeof journal.ajouter>[0]);
  ajouter("pass.escalated", { reason: ENCORE_ROUGE, cause: "returns-exhausted" });
  ajouter("pass.kitchen-took-over", { cause: "returns-exhausted", move: "fix", issue: 501 });
  ajouter("pass.kitchen-took-over", { cause: "returns-exhausted", move: "none" });
  const remontee = derniereRemontee(journal.base, 17);
  assert.ok(remontee !== null);
  // Le `none` n'est pas un pas : la remontée attend encore le sien, la montée ou l'abandon.
  assert.equal(repriseDeLaRemontee(journal.base, 17, remontee), null);
  const reprise = repriseDuTicket(journal.base, 17);
  assert.ok(reprise !== null);
  assert.equal(direRepriseEn(reprise), "the kitchen takes it up (returns-exhausted), not the chef");
  assert.equal(direReprise(reprise), "la cuisine le reprend (returns-exhausted), pas le chef");
  assert.equal(prochainCoup(remontee, dejaTente(journal.base, 17), fixPermis(journal.base, 17), true), "raise");
});

test("avant d'abandonner, la cuisine réessaie une fois un ticket depuis la base du moment, s'il y a eu au moins un merge sur la base depuis son dernier verdict rouge (#1902)", (t) => {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  aArreter(t, () => journal.fermer());
  const ajouter = (ticket: number, type: string, payload: Record<string, unknown>) =>
    journal.ajouter({ project: "brigade", ticket, author: "pass", type, payload } as unknown as Parameters<typeof journal.ajouter>[0]);
  const juger = (verdict: "green" | "red") => ajouter(17, "pass.judged", { run: "r", pr: null, number: null, sha: "s", verdict, findings: [] });
  const merger = (ticket: number) => ajouter(ticket, "merge.done", { pr: `https://github.com/o/d/pull/${ticket}`, sha: "m", by: "pass", reconciled: false });

  // Jamais jugé rouge : il n'y a pas de dernier rouge d'où compter.
  merger(30);
  assert.equal(reessaiPermis(journal.base, 17), null);
  // Un merge avant le dernier rouge ne compte pas : ce rouge l'a vu.
  juger("red");
  assert.equal(reessaiPermis(journal.base, 17), null);
  // Un verdict vert depuis ne déplace pas le dernier rouge.
  juger("green");
  merger(31);
  merger(32);
  assert.equal(reessaiPermis(journal.base, 17), 2);
  // Une fois, toutes remontées confondues : le réessai fait, il n'y en a plus.
  ajouter(17, "pass.escalated", { reason: ENCORE_ROUGE, cause: "returns-exhausted" });
  ajouter(17, "pass.kitchen-took-over", { cause: "returns-exhausted", move: "retry", merges: 2 });
  juger("red");
  merger(33);
  assert.equal(reessaiPermis(journal.base, 17), null);
  const reprise = repriseDuTicket(journal.base, 17);
  assert.equal(reprise?.reprise?.coup, "retry");
  assert.equal(reprise?.reprise?.merges, 2);
});

test("plus aucun code du runtime n'écrit qu'il n'y a « plus rien à essayer »", () => {
  const fichiers = readdirSync(SRC, { recursive: true, encoding: "utf8" }).filter((chemin) => chemin.endsWith(".ts"));
  const disent = fichiers.filter((fichier) => /nothing left to try|plus rien à essayer/i.test(readFileSync(join(SRC, fichier), "utf8")));
  assert.deepEqual(disent, []);
  // La cuisine n'écrit plus de `none` : chaque pas qu'elle note en est un autre.
  const notes = fichiers.flatMap((fichier) => [...readFileSync(join(SRC, fichier), "utf8").matchAll(/"pass\.kitchen-took-over", payload: \{[^}]*move: "([a-z]+)"/g)].map(([, coup]) => coup));
  assert.ok(notes.length > 0);
  assert.ok(!notes.includes("none"), notes.join(", "));
});
