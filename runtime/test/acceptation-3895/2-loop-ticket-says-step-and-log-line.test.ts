// #3895, critère 2 : le ticket de boucle ouvert pour un check rouge dit l'étape en échec et sa ligne de journal, pas seulement « red-check ».
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

test("a loop ticket opened for a red check names the failing step and its log line", async () => {
  const d = depot();
  d.rouge(40, 41, "sha40");
  d.poster(40, "<!-- brigade:relance cause=red-check n=1 -->\nrelaunch 1");
  d.poster(40, "<!-- brigade:relance cause=red-check n=2 -->\nrelaunch 2");
  await d.relancer(40, "Heal the rail");
  assert.equal(d.creees.length, 1);
  const [bug] = d.creees;
  const texte = `${bug?.titre}\n${bug?.corps}`;
  assert.ok(texte.includes(ETAPE), "the step is named");
  assert.ok(texte.includes(LIGNE), "its log line is quoted");
});
