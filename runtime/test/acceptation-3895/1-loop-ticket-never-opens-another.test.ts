// #3895, critère 1 : un ticket de boucle ne rouvre jamais de ticket de boucle ; le chef lit une ligne qui dit pourquoi, avec la ligne du journal de l'étape en échec.
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

test("a ticket opened for a loop that loops in turn opens no loop ticket, and the chef sees one line with the failing step's log line", async () => {
  const d = depot();
  const TITRE = "#40 loops: set aside again after 2 relaunches for the same reason (red-check)";
  d.rouge(41, 410, "sha41");
  d.poster(41, "<!-- brigade:relance cause=red-check n=1 -->\nrelaunch 1");
  d.poster(41, "<!-- brigade:relance cause=red-check n=2 -->\nrelaunch 2");
  await d.relancer(41, TITRE);
  assert.equal(d.creees.length, 0, "no second loop ticket");
  assert.ok(d.labels.get(41)?.has(HORS_CUISINE), "the loop ticket is not relaunched");
  const dites = (d.commentaires.get(41) ?? []).map((c) => c.body).slice(2).filter((b) => b.includes(LIGNE) && b.includes(ETAPE));
  assert.equal(dites.length, 1, "one comment tells the chef why, with the step and its log line");
  assert.equal(dites[0]?.trim().split("\n").filter((l) => !l.startsWith("<!--") && l.trim() !== "").length, 1, "one line");
});
