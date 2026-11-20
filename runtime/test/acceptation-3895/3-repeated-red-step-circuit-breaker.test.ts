// #3895, critère 3 : la même étape rouge, de la même ligne, sur les PR de deux tickets d'un projet : plus aucune relance pour cette raison, une ligne au chef (étape, ligne, PR) ; elle repart quand l'étape redevient verte.
import assert from "node:assert/strict";
import { test } from "node:test";
import { HORS_CUISINE, LABEL } from "../../src/github.ts";
import type { CommentaireDeVerdict } from "../../src/github-etat/fusion.ts";
import { relancer, type ContexteDeLaGuerison } from "../../src/guerison/relance.ts";

const ETAPE = "Exiger le label ready";
const LIGNE = "label ready absent : ready";
type Pr = { number: number; sha: string; state: "open"; merged: false; enRetard: false };

// Un faux GitHub en mémoire, partagé par plusieurs tickets : commentaires, labels, PR, runs de CI (une étape rouge dit sa ligne de journal), issues créées.
function depot() {
  const commentaires = new Map<number, CommentaireDeVerdict[]>();
  const labels = new Map<number, Set<string>>();
  const prs = new Map<number, Pr>();
  const runs = new Map<string, { name: string; outcome: "red" | "green"; ligne?: string }[]>();
  const creees: { titre: string; corps: string; labels: string[] }[] = [];
  let id = 0;
  const poster = (n: number, body: string) => {
    const l = commentaires.get(n) ?? [];
    l.push({ id: ++id, body, association: "OWNER", createdAt: new Date(Date.parse("2026-11-19T20:00:00Z") + id * 1000).toISOString() });
    commentaires.set(n, l);
  };
  const contexte = (): ContexteDeLaGuerison => ({
    station: "box/claude",
    base: "main",
    github: {
      commentaires: async (n) => [...(commentaires.get(n) ?? [])],
      commenter: async (n, corps) => poster(n, corps),
      labelliser: async (n, ajout) => void ajout.forEach((x) => labels.get(n)?.add(x)),
      delabelliser: async (n, x) => void labels.get(n)?.delete(x),
      prDuTicket: async (n) => prs.get(n) ?? null,
      ci: (async (sha: string) => runs.get(sha) ?? []) as ContexteDeLaGuerison["github"]["ci"],
      creerIssue: async (i) => (creees.push(i), 900 + creees.length),
    },
  });
  const ticket = (number: number, title: string) => {
    if (!labels.has(number)) labels.set(number, new Set([LABEL, HORS_CUISINE]));
    return { number, title, labels: [...(labels.get(number) ?? [])] };
  };
  const rouge = (number: number, pr: number, sha: string, ligne = LIGNE) => {
    prs.set(number, { number: pr, sha, state: "open", merged: false, enRetard: false });
    runs.set(sha, [{ name: ETAPE, outcome: "red", ligne }]);
  };
  const tout = () => [...commentaires.values()].flat().map((c) => c.body).concat(creees.flatMap((c) => [c.titre, c.corps])).join("\n");
  return { commentaires, labels, runs, creees, poster, contexte, ticket, rouge, tout, relancer: (n: number, titre: string) => relancer(ticket(n, titre), contexte()) };
}

test("the same red step and log line on the PRs of two tickets stops every relaunch for it, tells the chef, and resumes once the step is green", async () => {
  const d = depot();
  d.rouge(50, 51, "sha50");
  d.rouge(40, 41, "sha40");
  d.rouge(60, 61, "sha60");
  assert.equal((await d.relancer(50, "First")).fait, "relance", "one PR alone is not a pattern");
  d.labels.get(50)?.add(HORS_CUISINE);
  const second = await d.relancer(40, "Second");
  assert.notEqual(second.fait, "relance", "the second ticket is not relaunched");
  assert.ok(d.labels.get(40)?.has(HORS_CUISINE));
  const dit = d.tout();
  for (const attendu of [ETAPE, LIGNE, "#41", "#51"]) assert.ok(dit.includes(attendu), `the chef line says ${attendu}`);
  assert.notEqual((await d.relancer(60, "Third")).fait, "relance", "no ticket of the project is relaunched for that reason");
  d.runs.set("sha60", [{ name: ETAPE, outcome: "green" }]);
  d.runs.set("sha40", [{ name: ETAPE, outcome: "green" }, { name: "types", outcome: "red" }]);
  d.runs.set("sha61", []);
  assert.equal((await d.relancer(40, "Second")).fait, "relance", "a green run of the step lifts the stop");
});
