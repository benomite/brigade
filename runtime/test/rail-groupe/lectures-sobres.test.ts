// Les lectures que le rail ne paie plus (#3834), vues de chaque côté du choix :
// ce que le client du tour sert depuis l'instantané et quand il relit en REST,
// et les gestes qui ne lisent plus les retraits de labels d'un ticket tenu.
import assert from "node:assert/strict";
import { test } from "node:test";
import { brancheDuTicket, clientDuTour, stationGitHub, type GitHubDuTour } from "../../src/brigade-github.ts";
import { corpsDeVerdict } from "../../src/github-etat/fusion.ts";
import { corpsDePrise, purger } from "../../src/github-etat/prise.ts";
import { ouvrirGuerison } from "../../src/guerison/index.ts";
import type { GitHub } from "../../src/github.ts";
import { CALIBRE, FauxGitHub, fauxClient } from "../faux-github.ts";

const SHA = "a".repeat(40);
const VERTE = [{ name: "tests", outcome: "green" as const }];

const instantane = (pr: Record<string, unknown>[], tronquees = false) => ({
  repository: {
    issues: {
      pageInfo: { hasNextPage: false },
      nodes: [
        {
          number: 12,
          title: "Twelve",
          body: "Body of twelve",
          labels: { nodes: [{ name: "fire" }] },
          comments: { totalCount: 2, nodes: [{ body: "first", authorAssociation: "OWNER", createdAt: "2026-11-18T10:00:00Z", author: { login: "a" } }, { body: "second", authorAssociation: "OWNER", createdAt: "2026-11-18T11:00:00Z", author: { login: "a" } }] },
        },
      ],
    },
    pullRequests: { pageInfo: { hasNextPage: tronquees }, nodes: pr },
    ref: null,
  },
});

const leTour = (reponse: unknown) => {
  const rest = { commentaires: 0, issue: 0, prDeBranche: [] as string[], ecrits: [] as string[] };
  const github = {
    lireGraphql: async () => reponse,
    mettreAJour: async () => {},
    prsOuvertes: async () => [],
    retraitsDeLabels: async () => [],
    commentaires: async () => (rest.commentaires += 1, [{ body: "rest", association: "OWNER", createdAt: "2026-11-18T12:00:00Z" }]),
    issue: async () => (rest.issue += 1, { body: "Rest body" }),
    prDeBranche: async (branche: string) => (rest.prDeBranche.push(branche), null),
    commenter: async () => {
      rest.ecrits.push("commenter");
    },
    ecrireCorps: async () => {
      rest.ecrits.push("ecrireCorps");
    },
  } as unknown as GitHub;
  return { rest, tour: clientDuTour(github, "main", "acme/brigade") };
};

test("the comments and the body of a ticket come from the snapshot, ranked from 1, until the station writes to the ticket", async () => {
  const { rest, tour } = leTour(instantane([]));
  await tour.checksDeLaBase();
  const lus = await tour.commentaires(12);
  assert.deepEqual(lus.map(({ id, body }) => [id, body]), [[1, "first"], [2, "second"]]);
  assert.equal(await tour.corpsDuTicket(12), "Body of twelve");
  assert.deepEqual([rest.commentaires, rest.issue], [0, 0]);
  await tour.commenter(12, "hello");
  assert.deepEqual((await tour.commentaires(12)).map(({ body }) => body), ["rest"]);
  await tour.ecrireCorps?.(12, "new");
  assert.equal(await tour.corpsDuTicket(12), "Rest body");
  assert.deepEqual([rest.commentaires, rest.issue], [1, 1]);
});

test("the open PR of a ticket is read from the snapshot, is none when the snapshot is complete, and is read in REST when the snapshot cut the PRs short", async () => {
  const pr = { number: 90, headRefName: brancheDuTicket(12), headRefOid: SHA, mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", files: { nodes: [] }, commits: { nodes: [] } };
  const avec = leTour(instantane([pr]));
  await avec.tour.checksDeLaBase();
  const lue = await avec.tour.prOuverteDuTicket?.(12);
  assert.deepEqual([lue?.number, lue?.state, lue?.merged, lue?.sha], [90, "open", false, SHA]);
  assert.deepEqual(avec.rest.prDeBranche, []);

  const sans = leTour(instantane([]));
  await sans.tour.checksDeLaBase();
  assert.equal(await sans.tour.prOuverteDuTicket?.(12), null);
  assert.deepEqual(sans.rest.prDeBranche, []);

  const tronquee = leTour(instantane([], true));
  await tronquee.tour.checksDeLaBase();
  assert.equal(await tronquee.tour.prOuverteDuTicket?.(12), null);
  assert.deepEqual(tronquee.rest.prDeBranche, [brancheDuTicket(12)]);
});

const commentaire = (body: string) => ({ body, association: "OWNER", author: "benomite", createdAt: "2026-11-18T10:00:00Z", id: 1 });

test("purger leaves a ticket that carries fire and taken under a claim, without reading its label removals, and still frees a taken nobody holds", async () => {
  let retraits = 0;
  const delabellises: string[] = [];
  const github = (commentaires: ReturnType<typeof commentaire>[]) =>
    ({
      commentaires: async () => commentaires,
      retraitsDeLabels: async () => (retraits += 1, []),
      delabelliser: async (_numero: number, label: string) => void delabellises.push(label),
    }) as unknown as Parameters<typeof purger>[1]["github"];
  assert.equal(await purger({ number: 1, labels: ["fire", "taken"] }, { github: github([commentaire(corpsDePrise("mac"))]) }), false);
  assert.deepEqual([retraits, delabellises], [0, []]);
  assert.equal(await purger({ number: 1, labels: ["fire", "taken"] }, { github: github([]) }), true);
  assert.deepEqual(delabellises, ["taken"]);
});

test("the healing puts in-pass on a ready PR it reads by the open PR of its ticket, and never reads the PR of a branch in REST", async () => {
  const faux = new FauxGitHub();
  faux.feu(12);
  const sha = faux.sha();
  faux.prs.push({ number: 112, issue: 12, branche: brancheDuTicket(12), sha, state: "open", merged: false, enRetard: false, mergeePar: null, fichiers: [] });
  faux.poster(112, "A", corpsDeVerdict("A", sha, { verdict: "approve", motif: "" }));
  const bas = faux.pour("A");
  const poses: number[] = [];
  const lues: number[] = [];
  const github = {
    ...bas,
    prDuTicket: async () => {
      throw new Error("the PR of a ticket is not read for the open one");
    },
    prOuverteDuTicket: async (numero: number) => (lues.push(numero), bas.prDuTicket(numero)),
    labelliser: async (numero: number, labels: string[]) => {
      poses.push(numero);
      await bas.labelliser(numero, labels);
    },
  };
  const { guerir } = ouvrirGuerison({ github, station: "A", base: "main", avertir: () => {} });
  const bilan = await guerir([{ number: 12, title: "t", labels: ["fire"], state: "open" as const }], new Set());
  assert.deepEqual(bilan.enPass, [12]);
  assert.deepEqual([poses, lues], [[12], [12]]);
});

test("a cook that stops without delivering on a ticket with no earlier failure does not make the station read the label removals of that ticket", async () => {
  const faux = new FauxGitHub();
  faux.feu(7, CALIBRE);
  let retraits = 0;
  const bas = faux.pour("A");
  const github: GitHubDuTour = { ...bas, issue: fauxClient(faux, "A").issue, retraitsDeLabels: async (numero) => (retraits += 1, bas.retraitsDeLabels(numero)) };
  const tour = stationGitHub({
    nom: "A",
    places: 1,
    base: "main",
    github,
    prise: faux.prise(github, "A"),
    cuisiner: async () => ({ echec: "the cook stopped without delivering" }),
    juger: async () => ({ verdict: "approve", motif: "" }),
    jugerEnSecond: async () => ({ verdict: "approve", motif: "" }),
    avertir: () => {},
  });
  await tour.tour();
  await tour.calme();
  assert.ok((await bas.commentaires(7)).some((c) => c.body.startsWith("<!-- brigade:echec")), "the failure is written on the ticket");
  assert.equal(retraits, 0);
});
