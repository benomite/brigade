// #4307 : un ticket créé depuis une réponse valide porte le label
// `attendu:<minutes>`.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { ouvrirDecoupage, type Atelier } from "../../src/decoupage.ts";
import { lireDecoupage } from "../../src/decouper.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { aArreter, repertoireTemporaire } from "../outils.ts";

const EPIQUE = { number: 30, title: "Epic", body: "corps", labels: ["epic", "prio:2"], association: "OWNER", state: "open" } as never;

const REPONSE = JSON.stringify({
  reponse: "tickets",
  motif: "m",
  ordre: "o",
  tickets: [{ titre: "Le rail compte", contexte: "c", criteres: ["a"], attend: [], zone: ["runtime/src/rail.ts"], modele: "sonnet", effort: "medium", temps_attendu: 7, calibrage: "Un module." }],
});

function atelier(t: TestContext, creations: { labels: string[] }[]) {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  aArreter(t, () => journal.fermer());
  const github = new Proxy(
    {
      creerIssue: async (issue: { labels: string[] }) => (creations.push(issue), 500 + creations.length),
      commentaires: async () => [],
      issue: async () => ({ state: "open", labels: [] }),
    } as Record<string, unknown>,
    { get: (cible, nom: string) => cible[nom] ?? (async () => []) },
  ) as unknown as Atelier["github"];
  const lu = lireDecoupage(REPONSE);
  assert.ok("valeur" in lu, `réponse valide : ${JSON.stringify(lu)}`);
  const a: Atelier = {
    journal,
    github,
    depotGitHub: "acme/brigade",
    fichiers: () => [],
    noter: (ticket, fait) => journal.ajouter({ project: "brigade", ticket, author: "runtime", ...fait }),
    demander: (async () => ({ run: "r", valeur: lu.valeur })) as Atelier["demander"],
    peutJuger: () => true,
    arrete: () => false,
    eteint: () => false,
    avertir: (message) => assert.fail(message),
    signature: () => "",
  };
  return ouvrirDecoupage(a);
}

test("le ticket né d'une réponse valide porte `attendu:<minutes>`, avec son calibrage et sa priorité", async (t) => {
  const creations: { labels: string[] }[] = [];
  await atelier(t, creations).traiter(EPIQUE, []);
  assert.equal(creations.length, 1);
  const labels = creations[0]?.labels ?? [];
  assert.ok(labels.includes("attendu:7"), `labels : ${labels.join(", ")}`);
  assert.ok(labels.includes("model:sonnet") && labels.includes("effort:medium") && labels.includes("prio:2"));
});
