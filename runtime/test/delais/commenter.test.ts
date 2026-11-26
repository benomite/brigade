// Le commentaire des tickets lents (#4299) : une fois par ticket mergé plus de 10 minutes après sa prise, avec son temps partagé.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { brancherLesDelais, commenterLesLents } from "../../src/delais/commenter.ts";
import type { Evenement } from "../../src/delais/mesure.ts";
import { repertoireTemporaire } from "../outils.ts";
import { ENREGISTREMENTS, EVENEMENTS, MAINTENANT, t } from "./jeu.ts";

// La marque que le commentaire porte, et par laquelle le job le reconnaît.
const MARQUE = "<!-- brigade:delai-de-prise -->";

function unGitHub(lus: Record<number, string[]> = {}) {
  const postes: { issue: number; corps: string }[] = [];
  const lectures: number[] = [];
  return {
    postes,
    lectures,
    github: {
      commentaires: async (issue: number) => {
        lectures.push(issue);
        return [...(lus[issue] ?? []), ...postes.filter((p) => p.issue === issue).map((p) => p.corps)];
      },
      commenter: async (issue: number, corps: string) => void postes.push({ issue, corps }),
    },
  };
}

test("the comment of the 25 minute ticket: its time, then cook, gates, review, send-backs and waits, which add up to it", async (ctx) => {
  const { github, postes } = unGitHub();
  await commenterLesLents({ evenements: EVENEMENTS, maintenant: MAINTENANT, github });
  assert.deepEqual(postes.map(({ issue }) => issue), [2]);
  const corps = postes[0]?.corps ?? "";
  ctx.diagnostic(corps.replaceAll("\n", " ⏎ "));
  assert.equal(corps, [MARQUE, "**Taken to merged: 25 min**, over the 10 min target. Where the time went:", "", "- cook: 10 min", "- gates: 5 min", "- review: 4 min", "- send-backs: 3 min", "- waits: 3 min"].join("\n"));
});

test("a ticket whose issue already has the comment, a ticket merged over 24 h ago, and one with no known phase get none", async () => {
  const vieux: Evenement = { ...EVENEMENTS[1], ticket: 3, pris: "2026-11-23T10:00:00.000Z", fusionne: "2026-11-23T10:30:00.000Z" };
  const sansPhase: Evenement = { ...EVENEMENTS[1], ticket: 4, phases: [] };
  const { github, postes } = unGitHub({ 2: [`${MARQUE}\nposted by an earlier station`] });
  await commenterLesLents({ evenements: [...EVENEMENTS, vieux, sansPhase], maintenant: MAINTENANT, github });
  assert.deepEqual(postes, []);
});

test("an unreadable issue is said and gets no comment; a refused comment is said and tried again on the next run", async () => {
  const dites: string[] = [];
  const postes: number[] = [];
  let refuse = true;
  const github = {
    commentaires: async (issue: number) => {
      if (issue === 5) throw new Error("HTTP 502");
      return [];
    },
    commenter: async (issue: number) => {
      if (refuse) throw new Error("HTTP 403");
      postes.push(issue);
    },
  };
  const evenements = [{ ...EVENEMENTS[1], ticket: 5 }, EVENEMENTS[1]];
  const dejaCommentes = new Set<number>();
  await commenterLesLents({ evenements, maintenant: MAINTENANT, github, avertir: (texte) => void dites.push(texte), dejaCommentes });
  assert.deepEqual(postes, []);
  assert.match(dites[0] ?? "", /#5 — its comments are unreadable.*HTTP 502/);
  assert.match(dites[1] ?? "", /#2 — its taken-to-merged breakdown could not be posted: HTTP 403/);
  refuse = false;
  await commenterLesLents({ evenements, maintenant: MAINTENANT, github, avertir: (texte) => void dites.push(texte), dejaCommentes });
  assert.deepEqual(postes, [2]);
});

function clone(ctx: TestContext, contenu: string): string {
  const depot = repertoireTemporaire(ctx);
  mkdirSync(join(depot, ".claude", "brigade"), { recursive: true });
  writeFileSync(join(depot, ".claude", "brigade", "temps-tickets.json"), contenu);
  return depot;
}

test("as the station plugs it after each merge: it reads the clone, posts once, and does not read the issue again", async (ctx) => {
  const lectures: number[] = [];
  const postes: { issue: number; corps: string }[] = [];
  const github = {
    commentaires: async (issue: number) => {
      lectures.push(issue);
      return postes.filter((p) => p.issue === issue).map((p) => ({ body: p.corps }));
    },
    commenter: async (issue: number, corps: string) => void postes.push({ issue, corps }),
  };
  const dites: string[] = [];
  const commenter = brancherLesDelais({ github, avertir: (texte) => void dites.push(texte), maintenant: () => new Date(t(40)) });
  const depot = clone(ctx, JSON.stringify({ tickets: ENREGISTREMENTS }));
  await commenter(depot);
  await commenter(depot);
  assert.deepEqual(postes.map(({ issue }) => issue), [2]);
  assert.match(postes[0]?.corps ?? "", /- send-backs: 3 min/);
  assert.deepEqual(lectures, [2]);
  assert.deepEqual(dites, []);
});

test("as the station plugs it: an issue already commented by an earlier run is read once and left as is", async (ctx) => {
  const { github, postes, lectures } = unGitHub({ 2: [`${MARQUE}\nthe breakdown`] });
  const commenter = brancherLesDelais({ github: { commentaires: async (n) => (await github.commentaires(n)).map((body) => ({ body })), commenter: github.commenter }, avertir: () => {}, maintenant: () => new Date(t(40)) });
  const depot = clone(ctx, JSON.stringify({ tickets: ENREGISTREMENTS }));
  await commenter(depot);
  await commenter(depot);
  assert.deepEqual(postes, []);
  assert.deepEqual(lectures, [2]);
});

test("as the station plugs it: an unreadable file of times posts nothing, and the station says so", async (ctx) => {
  const { github, postes } = unGitHub();
  const dites: string[] = [];
  await brancherLesDelais({ github: { commentaires: async () => [], commenter: github.commenter }, avertir: (texte) => void dites.push(texte), maintenant: () => new Date(t(40)) })(clone(ctx, "{ broken"));
  assert.deepEqual(postes, []);
  assert.deepEqual(dites, ["brigade : the ticket times of the clone are unreadable, no taken-to-merged breakdown is posted"]);
});
