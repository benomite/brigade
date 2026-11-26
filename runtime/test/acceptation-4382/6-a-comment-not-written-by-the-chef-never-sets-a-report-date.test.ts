// #4382 criterion 6: only messages written by the chef are read as a report.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ouvrirJournal } from "../../src/journal.ts";
import type { GitHubDuTour } from "../../src/brigade-github.ts";
import { lireLesFinsDesPannes, lirePostMortems } from "../../src/post-mortems/post-mortems.ts";
import type { Runtime } from "../../src/runtime.ts";
import { brancherSuperviseur } from "../../src/superviseur/brancher.ts";
import { suivreLeTour } from "../../src/superviseur/tour.ts";
import { repertoireTemporaire } from "../outils.ts";

// #4382 : la cuisine jouée avec le faux GitHub et le faux manager : le vrai suivi du tour, le vrai branchement du superviseur,
// le répertoire d'état qui reste d'un process à l'autre.
const A = (hhmm: string) => `2026-11-20T${hhmm}:00.000Z`;
const CHEF = "benoit";
type Commentaire = { body: string; author: string; association: string; createdAt: string; issue: number };
type Check = { name: string; outcome: "green" | "red"; startedAt?: string; url?: string };

function cuisine(t: TestContext, reprise?: string) {
  const repertoire = reprise ?? repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire);
  t.after(() => journal.fermer());
  let instant = A("10:00");
  let ecouter: (() => void) | null = null;
  const etat = { checks: [] as Check[], commentaires: [] as Commentaire[], merges: [] as number[], relances: [] as unknown[], manager: null as string | null };
  const ticket = { number: 4100, title: "main is red", labels: ["fire", "model:opus", "effort:medium"], state: "open" };
  const client = {
    fires: async () => [ticket],
    checksDeLaBase: async () => etat.checks,
    merger: async (numero: number) => (etat.merges.push(numero), { fait: true }),
    commenter: async () => {},
    commentaires: async (numero: number) => etat.commentaires.filter(({ issue }) => issue === numero),
    commentairesDepuis: async () => etat.commentaires,
    issuesDepuis: async () => [],
    proprietaire: async () => ({ login: CHEF, organisation: false }),
    teteDeLaBase: async () => "abc123",
    ci: async () => etat.checks.filter(({ outcome }) => outcome === "red"),
    relancerLesEchecs: async (run: unknown) => void etat.relances.push(run),
  };
  const tour = suivreLeTour(() => new Date(instant));
  const enveloppe = tour.envelopper(client as unknown as GitHubDuTour);
  const runtime = { projet: "shop", journal, repertoireEtat: repertoire, surReveil: (ecoute: () => void) => ((ecouter = ecoute), () => {}) } as unknown as Runtime;
  const dits: string[] = [];
  const consulter = () => (etat.manager === null ? null : async () => ({ message: etat.manager as string }));
  brancherSuperviseur(runtime, { tour, github: client as never, depot: "acme/shop", branche: "main", consulter, repertoireEtat: repertoire, maintenant: () => new Date(instant), dire: (ligne) => void dits.push(ligne) });
  // Un tour de la station à `hhmm` : il lit les tickets et les checks de la base, puis le runtime se réveille.
  const tic = async (hhmm: string) => {
    instant = A(hhmm);
    await enveloppe.fires();
    await enveloppe.checksDeLaBase();
    ecouter?.();
    await new Promise((fini) => setTimeout(fini, 20));
  };
  const rouge = (depuis = A("10:00")): Check[] => [{ name: "ci", outcome: "red", startedAt: depuis, url: "https://github.com/acme/shop/actions/runs/777/job/1" }];
  const verte: Check[] = [{ name: "ci", outcome: "green" }];
  const commentaire = (hhmm: string, auteur: string, corps: string, issue = 4100): Commentaire => ({ body: corps, author: auteur, association: auteur === CHEF ? "OWNER" : "MEMBER", createdAt: A(hhmm), issue });
  const fichier = join(repertoire, "post-mortems", "shop.json");
  return { repertoire, etat, tic, rouge, verte, commentaire, dits, enveloppe, fichier };
}
// Le post-mortem rangé tel que le fichier le porte, sans en supposer les champs.
const rangees = (fichier: string): unknown[] => JSON.parse(readFileSync(fichier, "utf8"));
const texte = (valeur: unknown) => JSON.stringify(valeur);

test("an agent's comment on the tracked issue never sets a report date", async (t) => {
  const c = cuisine(t);
  c.etat.checks = c.rouge(A("10:00"));
  c.etat.commentaires = [c.commentaire("10:10", "brigade-bot", "main is failing again, the supervisor is on it.")];
  await c.tic("10:15");
  await c.tic("10:25");
  await c.enveloppe.merger(4200, "deadbeef");
  c.etat.checks = c.verte;
  await c.tic("11:00");
  const lus = rangees(c.fichier);
  assert.equal(lus.length, 1);
  assert.equal(texte(lus[0]).includes(A("10:10")), false, "no report date is written");
  assert.equal(lirePostMortems(c.repertoire, "shop")[0]?.vuEnPremier, "system");
  assert.match(String(lirePostMortems(c.repertoire, "shop")[0]?.corrige), /#?4200/, "the outage is still recorded in full, with what fixed it");
});
