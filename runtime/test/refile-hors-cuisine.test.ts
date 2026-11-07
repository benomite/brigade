// Le ticket de temps perdu resté `hors-cuisine` (`refile-hors-cuisine.ts`,
// #2786), repris par le tour de la station sur un faux GitHub : commenté,
// fermé, redéposé une fois sur brigade avec un lien vers l'original.
import assert from "node:assert/strict";
import { test } from "node:test";
import { stationGitHub } from "../src/brigade-github.ts";
import { HORS_CUISINE } from "../src/github.ts";
import { DEPOT_DE_BRIGADE, MARQUE_DU_COMMENTAIRE, redeposerHorsCuisine, type GitHubDeBrigade } from "../src/refile-hors-cuisine.ts";
import { MARQUE_CORRECTION } from "../src/temps-max/correction.ts";
import { CALIBRE, FauxGitHub } from "./faux-github.ts";

const DEPOT = "BOBL-tech/espace";
const TITRE = "Tickets lose too much time: median 9 min lost over the threshold of 2 min — the wait before the claim weighs most";

// Le dépôt de brigade : les issues qu'on y a créées.
function fauxBrigade() {
  const issues: { number: number; titre: string; corps: string; labels: string[] }[] = [];
  const client: GitHubDeBrigade = {
    issuesDepuis: async () => issues.map((issue) => ({ number: issue.number, body: issue.corps, association: "OWNER" })),
    creerIssue: async ({ titre, corps, labels }) => {
      const number = 3000 + issues.length;
      issues.push({ number, titre, corps, labels });
      return number;
    },
  };
  return { issues, client };
}

// Une station sur le faux, que le redépôt branche à son tour.
function station(faux: FauxGitHub, brigade: GitHubDeBrigade, perteReelle = () => true) {
  const github = faux.pour("A");
  return stationGitHub({
    nom: "A",
    places: 1,
    base: "main",
    github,
    prise: faux.prise(github, "A"),
    cuisiner: async () => ({ echec: "not expected" }),
    juger: async () => ({ verdict: "approve", motif: "ok" }),
    avertir: () => {},
    redeposer: redeposerHorsCuisine({ depot: DEPOT, github, brigade: () => brigade, perteReelle }),
  });
}

function horsCuisine(faux: FauxGitHub, numero: number, titre: string, corps: string) {
  faux.feu(numero, [...CALIBRE, HORS_CUISINE], corps);
  faux.ticket(numero).title = titre;
}

test("a hors-cuisine lost-time ticket is explained, closed and re-filed once on brigade; another hors-cuisine ticket is left untouched", async () => {
  const faux = new FauxGitHub();
  const brigade = fauxBrigade();
  horsCuisine(faux, 824, TITRE, `${MARQUE_CORRECTION}\n\n## Context\n\nthe median lost time`);
  horsCuisine(faux, 825, "Fix the login page", "## Context\n\na product bug");
  const a = station(faux, brigade.client);

  await a.tour();
  await a.calme();

  assert.equal(faux.ticket(824).state, "closed");
  assert.equal(brigade.issues.length, 1);
  const [redepot] = brigade.issues;
  assert.match(redepot?.corps ?? "", new RegExp(`${DEPOT}#824`));
  assert.match(redepot?.corps ?? "", /https:\/\/github\.com\/BOBL-tech\/espace\/issues\/824/);
  // La marque de la correction ne suit pas : la correction du temps de brigade ne la prend pas pour la sienne.
  assert.ok(!(redepot?.corps ?? "").includes(MARQUE_CORRECTION));
  assert.match(redepot?.corps ?? "", /the median lost time/);
  const commentaires = (faux.commentaires.get(824) ?? []).filter((c) => c.body.includes(MARQUE_DU_COMMENTAIRE));
  assert.equal(commentaires.length, 1);
  assert.match(commentaires[0]?.body ?? "", /in the station/);
  assert.match(commentaires[0]?.body ?? "", new RegExp(`${DEPOT_DE_BRIGADE}#${redepot?.number}`));

  // L'autre ticket hors cuisine : ni commenté, ni fermé.
  assert.equal(faux.ticket(825).state, "open");
  assert.ok(faux.ticket(825).labels.has(HORS_CUISINE));
  assert.equal(faux.commentaires.get(825), undefined);
  assert.deepEqual(faux.cuissons, []);
});

test("handling the same ticket twice creates no second ticket on brigade", async () => {
  const faux = new FauxGitHub();
  const brigade = fauxBrigade();
  horsCuisine(faux, 1132, TITRE, `${MARQUE_CORRECTION}\n\nbody`);
  const github = faux.pour("A");
  const redeposer = redeposerHorsCuisine({ depot: "BOBL-tech/mirrorscreen", github, brigade: () => brigade.client });
  const lu = { number: 1132, title: TITRE, labels: [...faux.ticket(1132).labels] };

  assert.deepEqual(await redeposer([lu]), [{ ticket: 1132, issue: "redepose", redepot: 3000 }]);
  // La fermeture a raté, ou un autre tour le relit : rien ne double.
  faux.ticket(1132).state = "open";
  assert.deepEqual(await redeposer([lu]), [{ ticket: 1132, issue: "redepose", redepot: 3000 }]);
  assert.equal(brigade.issues.length, 1);
  assert.equal((faux.commentaires.get(1132) ?? []).length, 1);
  assert.equal(faux.ticket(1132).state, "closed");

  // Une seconde station, un autre tour : le ticket fermé n'est plus lu.
  await station(faux, brigade.client).tour();
  assert.equal(brigade.issues.length, 1);
});

test("a lost-time ticket whose loss is no longer real is closed with its reason, and nothing is re-filed", async () => {
  const faux = new FauxGitHub();
  const brigade = fauxBrigade();
  horsCuisine(faux, 824, TITRE, `${MARQUE_CORRECTION}\n\nbody`);
  await station(faux, brigade.client, () => false).tour();
  assert.equal(faux.ticket(824).state, "closed");
  assert.equal(brigade.issues.length, 0);
  assert.match(faux.commentaires.get(824)?.[0]?.body ?? "", /no longer over the threshold/);
});

test("on the brigade repository itself, nothing is re-filed nor closed", async () => {
  const faux = new FauxGitHub();
  const brigade = fauxBrigade();
  horsCuisine(faux, 9, TITRE, `${MARQUE_CORRECTION}\n\nbody`);
  const redeposer = redeposerHorsCuisine({ depot: DEPOT_DE_BRIGADE, github: faux.pour("A"), brigade: () => brigade.client });
  assert.deepEqual(await redeposer([{ number: 9, title: TITRE, labels: [...faux.ticket(9).labels] }]), []);
  assert.equal(faux.ticket(9).state, "open");
  assert.equal(brigade.issues.length, 0);
});
