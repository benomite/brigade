// #4382 : la cuisine jouée avec le faux GitHub et le faux manager — le vrai suivi du tour, le vrai branchement du
// superviseur, le répertoire d'état qui reste d'un process à l'autre. Les tests du dossier la partagent.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TestContext } from "node:test";
import type { GitHubDuTour } from "../../src/brigade-github.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { lireLesFinsDesPannes, lirePostMortems } from "../../src/post-mortems/post-mortems.ts";
import type { Runtime } from "../../src/runtime.ts";
import { brancherSuperviseur } from "../../src/superviseur/brancher.ts";
import { suivreLeTour } from "../../src/superviseur/tour.ts";
import { repertoireTemporaire } from "../outils.ts";

export const A = (hhmm: string) => `2026-11-20T${hhmm}:00.000Z`;
export const CHEF = "benoit";
type Commentaire = { body: string; author: string; association: string; createdAt: string; issue: number };
type Check = { name: string; outcome: "green" | "red"; startedAt?: string; url?: string };

// `reprise` : le répertoire d'état d'une cuisine d'avant, pour jouer un redémarrage.
export function cuisine(t: TestContext, reprise?: string) {
  const repertoire = reprise ?? repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire);
  t.after(() => journal.fermer());
  let instant = A("10:00");
  let ecouter: (() => void) | null = null;
  const etat = { checks: [] as Check[], commentaires: [] as Commentaire[], relances: [] as number[], manager: null as string | null };
  const ticket = { number: 4100, title: "main is red", labels: ["fire", "model:opus", "effort:medium"], state: "open" };
  const client = {
    fires: async () => [ticket],
    checksDeLaBase: async () => etat.checks,
    merger: async () => ({ fait: true }),
    commenter: async () => {},
    commentaires: async (numero: number) => etat.commentaires.filter(({ issue }) => issue === numero),
    commentairesDepuis: async (depuis: string) => etat.commentaires.filter(({ createdAt }) => Date.parse(createdAt) >= Date.parse(depuis)),
    issuesDepuis: async () => [],
    proprietaire: async () => ({ login: CHEF, organisation: false }),
    teteDeLaBase: async () => "abc123",
    ci: async () => etat.checks.filter(({ outcome }) => outcome === "red"),
    relancerLesEchecs: async (run: number) => void etat.relances.push(run),
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
  const rouge = (depuis: string | null = A("10:00")): Check[] => [{ name: "ci", outcome: "red", ...(depuis === null ? {} : { startedAt: depuis }), url: "https://github.com/acme/shop/actions/runs/777/job/1" }];
  const verte: Check[] = [{ name: "ci", outcome: "green" }];
  const commenter = (hhmm: string, auteur: string, corps: string, issue = 4100) => void etat.commentaires.push({ body: corps, author: auteur, association: auteur === CHEF ? "OWNER" : "MEMBER", createdAt: A(hhmm), issue });
  const fichier = join(repertoire, "post-mortems", "shop.json");
  // Les post-mortems du projet, et la fin de chacun, comme `facts` les publie (faits.ts).
  const publies = () => {
    const fins = lireLesFinsDesPannes(repertoire, "shop");
    return lirePostMortems(repertoire, "shop").map((postMortem, rang) => ({ ...postMortem, fin: fins[rang] as string }));
  };
  return { repertoire, etat, tic, rouge, verte, commenter, dits, enveloppe, fichier, publies };
}

// Les rangées du fichier des post-mortems telles qu'il les porte.
export const rangees = (fichier: string): unknown[] => JSON.parse(readFileSync(fichier, "utf8"));
