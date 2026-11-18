// Lire le rail d'un projet en peu de requêtes (#3834) : vingt tickets `fire`,
// leurs labels et leurs derniers commentaires, un tour, une poignée de
// requêtes — pas une ou plus par ticket. Le vrai chemin GitHub seul
// (`brigade-github.ts`) sur le vrai client (`github.ts`), cache vide ; seul le
// transport est faux, et c'est lui qui compte chaque requête, REST ou GraphQL.
// Il répond à la lecture groupée sous toutes ses formes : les issues avec leurs
// labels et leurs commentaires en GraphQL, ou les commentaires du dépôt en REST.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { corpsDePrise } from "../../src/github-etat/prise.ts";
import { ouvrirLimitesDuCompte } from "../../src/github-limite.ts";
import { ouvrirGitHub, type Transport } from "../../src/github.ts";
import { ouvrirLimite } from "../../src/limite-github.ts";
import { depotQuiLivre } from "../appels-github/aides.ts";
import { FauxGitHub } from "../cout-par-ticket/faux-github.ts";
import { STATION_DU_DEPOT } from "../faux-github.ts";

const DEPOT = "faux/rail-groupe";
const CALIBRE = ["fire", "model:sonnet", "effort:medium"];
const TICKETS = 20;
// Une poignée : le dépôt, ses issues, leurs commentaires, la base… jamais un par ticket.
const POIGNEE = 6;

test("the rail of a project with 20 fire tickets, their labels and their latest comments is read in a handful of requests per turn", async (t) => {
  const faux = new FauxGitHub(DEPOT);
  for (let numero = 1; numero <= TICKETS; numero += 1) {
    // Des tickets que la cuisine ne prend pas : ils attendent, l'un est tenu par une autre station.
    faux.feu(numero, numero % 2 === 0 ? [...CALIBRE, "waiting"] : [...CALIBRE, "taken"]);
    faux.commenterCommeLeDepot(numero, numero % 2 === 0 ? `latest comment on ${numero}` : corpsDePrise("mac/claude"));
  }
  const requetes: string[] = [];
  // Ce que le dépôt porte, tel que GraphQL le rendrait : tout ce qu'un client groupé peut y demander.
  const issues = () => {
    const lues = [];
    for (let numero = 1; numero <= TICKETS; numero += 1) {
      const issue = faux.issue(numero);
      const commentaires = ((faux as unknown as { commentaires: Map<number, Array<{ id: number; body: string; created_at: string; author_association: string; user: { login: string } }>> }).commentaires.get(numero) ?? []).map((c) => ({ id: String(c.id), databaseId: c.id, body: c.body, createdAt: c.created_at, authorAssociation: c.author_association, author: { login: c.user.login } }));
      lues.push({ number: issue.number, title: issue.title, body: issue.body, state: "OPEN", createdAt: issue.created_at, updatedAt: issue.updated_at, labels: { nodes: issue.labels.map((name) => ({ name })) }, comments: { pageInfo: { hasNextPage: false }, nodes: commentaires, totalCount: commentaires.length } });
    }
    return lues;
  };
  const transport: Transport = async (args) => {
    const graphql = args[0] === "graphql";
    const chemin = args.at(-1) ?? "";
    if (graphql) {
      requetes.push("graphql");
      const corps = { data: { repository: { issues: { pageInfo: { hasNextPage: false }, nodes: issues() }, pullRequests: { pageInfo: { hasNextPage: false }, nodes: [] }, ref: null } } };
      return { erreur: null, stdout: `HTTP/2.0 200 OK\r\n\r\n${JSON.stringify(corps)}`, stderr: "" };
    }
    // Les commentaires de tout le dépôt, en une liste (#3030).
    if (/^repos\/[^/]+\/[^/]+\/issues\/comments(\?|$)/.test(chemin)) {
      requetes.push("GET issues/comments");
      const tous = issues().flatMap((issue) =>
        issue.comments.nodes.map((c) => ({ id: c.databaseId, body: c.body, created_at: c.createdAt, updated_at: c.createdAt, author_association: c.authorAssociation, user: { login: c.author.login }, issue_url: `https://api.github.com/repos/${DEPOT}/issues/${issue.number}` })),
      );
      return { erreur: null, stdout: `HTTP/2.0 200 OK\r\n\r\n${JSON.stringify(tous)}`, stderr: "" };
    }
    const avant = faux.appels.length;
    const reponse = await faux.transport(args);
    // Un 304 n'est pas compté par GitHub.
    if (faux.appels.slice(avant).every((appel) => appel.statut !== 304)) requetes.push(chemin);
    return reponse;
  };
  const repertoire = mkdtempSync(join(tmpdir(), "rail-groupe-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const lancer: Lancer = () => ({ fin: new Promise<never>(() => {}) });
  const github = ouvrirGitHub({ depot: DEPOT, bin: `faux-gh-${repertoire}`, transport, limite: ouvrirLimite(), limitesDuCompte: ouvrirLimitesDuCompte() });
  const ouverte = stationDuDepot({
    ...STATION_DU_DEPOT,
    places: 2,
    depotGitHub: DEPOT,
    github,
    depot: depotQuiLivre(repertoire),
    flux: repertoire,
    lancer,
    avertir: () => {},
  });
  if ("refus" in ouverte) throw new Error(ouverte.refus);

  await ouverte.tour();
  assert.ok(requetes.length <= POIGNEE, `${requetes.length} requests for the rail of ${TICKETS} tickets in one turn, over a handful of ${POIGNEE}:\n${requetes.join("\n")}`);
});
