import assert from "node:assert/strict";
import { test } from "node:test";
import { corpsDePrise, lireTenant, PRIS, type CommentaireDePrise, type GitHubDeLaPrise } from "../../../src/github-etat/prise.ts";
import { BAIL_MS, PAR_PAGE, dansLOrdreDePrise, lireToutesLesPages, relacherLesPrisesSilencieuses } from "../../../src/github-seul/priorite-bail/priorite-bail.ts";

const MAINTENANT = Date.parse("2026-11-03T12:00:00Z");

// Un GitHub de 150 issues ouvertes, rendues par pages de 100.
const issues = Array.from({ length: 150 }, (_, i) => ({ number: i + 1, labels: i + 1 === 130 ? ["prio:0"] : ["prio:2"] }));
const pageDe = async (n: number) => issues.slice((n - 1) * PAR_PAGE, n * PAR_PAGE);

test("150 issues ouvertes : le seul prio:0, en seconde page, est pris en premier", async () => {
  const lues = await lireToutesLesPages(pageDe);
  assert.equal(lues.length, 150);
  assert.equal(dansLOrdreDePrise(lues)[0]?.number, 130);
});

test("une liste de 100 issues pile lit une page de plus, qui est vide", async () => {
  const demandees: number[] = [];
  const lues = await lireToutesLesPages(async (n) => (demandees.push(n), n === 1 ? issues.slice(0, 100) : []));
  assert.equal(lues.length, 100);
  assert.deepEqual(demandees, [1, 2]);
});

test("les prio: les plus bas d'abord, les plus anciens à égalité, sans prio: en dernier", () => {
  const rendu = dansLOrdreDePrise([
    { number: 1, labels: [] },
    { number: 2, labels: ["prio:3"] },
    { number: 5, labels: ["prio:1"] },
    { number: 3, labels: ["prio:1", "prio:2"] },
    { number: 4, labels: ["prio:0", "bug"] },
    { number: 6, labels: ["prio:10"] },
  ]);
  assert.deepEqual(rendu.map((t) => t.number), [4, 3, 5, 2, 6, 1]);
});

// Une issue prise par `mac` à l'instant donné.
function issuePrise(priseA: number) {
  const commentaires: CommentaireDePrise[] = [{ id: 1, body: corpsDePrise("mac"), association: "OWNER", createdAt: new Date(priseA).toISOString() }];
  const labels = new Set([PRIS]);
  let horloge = MAINTENANT;
  const github: GitHubDeLaPrise = {
    commentaires: async () => [...commentaires],
    retraitsDeLabels: async () => [],
    commenter: async (_n, corps) => void commentaires.push({ id: commentaires.length + 1, body: corps, association: "OWNER", createdAt: new Date((horloge += 1000)).toISOString() }),
    labelliser: async () => {},
    delabelliser: async (_n, label) => void labels.delete(label),
  };
  return { github, labels: () => [...labels] };
}

test("la prise d'une station silencieuse depuis plus que le bail est lâchée, et le ticket se reprend", async () => {
  const issue = issuePrise(MAINTENANT - BAIL_MS - 60_000);
  const relaches = await relacherLesPrisesSilencieuses([{ number: 7, labels: issue.labels() }], { github: issue.github, maintenant: MAINTENANT, signeDeVie: async () => null });
  assert.deepEqual(relaches, [7]);
  assert.equal(await lireTenant(7, issue.github), null);
  assert.deepEqual(issue.labels(), []);
});

test("la prise d'une station vivante est gardée", async () => {
  const issue = issuePrise(MAINTENANT - BAIL_MS - 60_000);
  const relaches = await relacherLesPrisesSilencieuses([{ number: 7, labels: issue.labels() }], { github: issue.github, maintenant: MAINTENANT, signeDeVie: async () => MAINTENANT - 60_000 });
  assert.deepEqual(relaches, []);
  assert.equal((await lireTenant(7, issue.github))?.station, "mac");
  assert.deepEqual(issue.labels(), [PRIS]);
});

test("une prise récente est gardée même sans signe de vie connu", async () => {
  const issue = issuePrise(MAINTENANT - 60_000);
  const relaches = await relacherLesPrisesSilencieuses([{ number: 7, labels: issue.labels() }], { github: issue.github, maintenant: MAINTENANT, signeDeVie: async () => null });
  assert.deepEqual(relaches, []);
});
