// Ce que la cuisine montre du rail ne change pas quand il se lit en peu de
// requêtes (#3834) : sur vingt tickets `fire` — prenables, en attente, tenus par
// une autre station, retenus par un commentaire du chef —, un tour prend les
// mêmes tickets, pose les mêmes labels et les mêmes commentaires, et laisse les
// autres tels qu'ils étaient, comme avec une lecture par ticket. La lecture, elle,
// tient en une poignée de requêtes. Le vrai chemin GitHub seul sur le vrai
// client ; seul le transport est faux, et il répond à la lecture groupée sous
// toutes ses formes (GraphQL, ou les commentaires du dépôt en REST).
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

const DEPOT = "faux/rail-inchange";
const CALIBRE = ["fire", "model:sonnet", "effort:medium"];
const TICKETS = 20;
const POIGNEE = 6;

type CommentaireFaux = { id: number; body: string; created_at: string; author_association: string; user: { login: string } };

test("a turn over 20 fire tickets takes, labels and comments exactly what it did with one read per ticket, and reads the rail in a handful of requests", async (t) => {
  const faux = new FauxGitHub(DEPOT);
  for (let numero = 1; numero <= TICKETS; numero += 1) {
    // 1-2 : prenables ; 3-8 : en attente ; 9-14 : tenus par une autre station ; 15-20 : non calibrés.
    if (numero <= 2) faux.feu(numero, CALIBRE);
    else if (numero <= 8) faux.feu(numero, [...CALIBRE, "waiting"]);
    else if (numero <= 14) {
      faux.feu(numero, [...CALIBRE, "taken"]);
      faux.commenterCommeLeDepot(numero, corpsDePrise("mac/claude"));
    } else {
      faux.feu(numero, ["fire"]);
      faux.commenterCommeLeDepot(numero, `a question from the chef on ${numero}`);
    }
  }
  const avant = new Map(Array.from({ length: TICKETS }, (_, i) => [i + 1, [...faux.issue(i + 1).labels]]));
  const commentairesDe = (numero: number): CommentaireFaux[] => (faux as unknown as { commentaires: Map<number, CommentaireFaux[]> }).commentaires.get(numero) ?? [];

  const requetes: string[] = [];
  const issues = () =>
    Array.from({ length: TICKETS }, (_, i) => {
      const issue = faux.issue(i + 1);
      const lus = commentairesDe(i + 1).map((c) => ({ id: String(c.id), databaseId: c.id, body: c.body, createdAt: c.created_at, authorAssociation: c.author_association, author: { login: c.user.login } }));
      return { number: issue.number, title: issue.title, body: issue.body, state: "OPEN", createdAt: issue.created_at, updatedAt: issue.updated_at, labels: { nodes: issue.labels.map((name) => ({ name })) }, comments: { pageInfo: { hasNextPage: false }, nodes: lus, totalCount: lus.length } };
    });
  const transport: Transport = async (args) => {
    const chemin = args.at(-1) ?? "";
    if (args[0] === "graphql") {
      requetes.push("graphql");
      const corps = { data: { repository: { issues: { pageInfo: { hasNextPage: false }, nodes: issues() }, pullRequests: { pageInfo: { hasNextPage: false }, nodes: [] }, ref: null } } };
      return { erreur: null, stdout: `HTTP/2.0 200 OK\r\n\r\n${JSON.stringify(corps)}`, stderr: "" };
    }
    if (/^repos\/[^/]+\/[^/]+\/issues\/comments(\?|$)/.test(chemin)) {
      requetes.push("GET issues/comments");
      const tous = issues().flatMap((issue) => issue.comments.nodes.map((c) => ({ id: c.databaseId, body: c.body, created_at: c.createdAt, updated_at: c.createdAt, author_association: c.authorAssociation, user: { login: c.author.login }, issue_url: `https://api.github.com/repos/${DEPOT}/issues/${issue.number}` })));
      return { erreur: null, stdout: `HTTP/2.0 200 OK\r\n\r\n${JSON.stringify(tous)}`, stderr: "" };
    }
    const depart = faux.appels.length;
    const reponse = await faux.transport(args);
    if (faux.appels.slice(depart).every((appel) => appel.statut !== 304)) requetes.push(`${args.includes("-X") ? args[args.indexOf("-X") + 1] : "GET"} ${chemin}`);
    return reponse;
  };
  const repertoire = mkdtempSync(join(tmpdir(), "rail-inchange-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const lancer: Lancer = () => ({ fin: new Promise<never>(() => {}) });
  const github = ouvrirGitHub({ depot: DEPOT, bin: `faux-gh-${repertoire}`, transport, limite: ouvrirLimite(), limitesDuCompte: ouvrirLimitesDuCompte() });
  const ouverte = stationDuDepot({ ...STATION_DU_DEPOT, places: 2, depotGitHub: DEPOT, github, depot: depotQuiLivre(repertoire), flux: repertoire, lancer, avertir: () => {} });
  if ("refus" in ouverte) throw new Error(ouverte.refus);

  await ouverte.tour();

  // Ce que la cuisine fait du rail : les deux tickets prenables sont pris et cuisinés, dans l'ordre.
  assert.deepEqual(ouverte.enCuisine(), [1, 2]);
  for (const numero of [1, 2]) {
    assert.ok(faux.issue(numero).labels.includes("taken"), `#${numero} is labelled taken`);
    assert.equal(commentairesDe(numero).filter((c) => c.body.startsWith("<!-- brigade:prise")).length, 1, `#${numero} bears one take`);
  }
  // Les autres sont tels qu'ils étaient : mêmes labels, aucun commentaire de plus.
  for (let numero = 3; numero <= TICKETS; numero += 1) assert.deepEqual(faux.issue(numero).labels, avant.get(numero), `#${numero} keeps its labels`);
  for (let numero = 3; numero <= TICKETS; numero += 1) assert.equal(commentairesDe(numero).length, numero >= 9 ? 1 : 0, `#${numero} bears no new comment`);

  const lectures = requetes.filter((requete) => !/^(POST|PUT|PATCH|DELETE) /.test(requete));
  assert.ok(lectures.length <= POIGNEE, `${lectures.length} read requests for the rail of ${TICKETS} tickets, over a handful of ${POIGNEE}:\n${lectures.join("\n")}`);
});
