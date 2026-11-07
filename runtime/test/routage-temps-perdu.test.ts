// Le ticket « Tickets lose too much time » d'un projet servi se dépose sur la
// brigade (#2783), jamais sur le projet ; sur la brigade elle-même, rien ne change.
import assert from "node:assert/strict";
import { test } from "node:test";
import { correctionDuTemps, type GitHubDeLaCorrection } from "../src/temps-max/correction.ts";
import { DEPOT_BRIGADE, marqueDuProjet, routerLeTempsPerdu } from "../src/routage-temps-perdu.ts";
import type { TempsTicket } from "../src/temps-ticket/ligne-status.ts";

type Issue = { number: number; titre: string; corps: string; state: "open" | "closed" };
const fauxDepot = () => {
  const issues: Issue[] = [];
  const github: GitHubDeLaCorrection = {
    issuesDepuis: async () => issues.map(({ number, corps, state }) => ({ number, body: corps, association: "OWNER", state })),
    creerIssue: async ({ titre, corps }) => {
      issues.push({ number: 100 + issues.length, titre, corps, state: "open" });
      return 99 + issues.length;
    },
    fermerIssue: async (numero) => {
      const issue = issues.find((i) => i.number === numero);
      if (issue) issue.state = "closed";
    },
  };
  return { issues, github };
};
// Des tickets qui n'ont perdu que l'attente d'une prise : 5 min chacun.
const temps = (): TempsTicket[] => [1, 2, 3].map((ticket) => ({ ticket, attentePrise: 300, cuisson: 300, cuissonTests: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0 }));
const ouvrir = (servi: string, projet: ReturnType<typeof fauxDepot>, brigade: ReturnType<typeof fauxDepot>) =>
  correctionDuTemps({ github: routerLeTempsPerdu({ github: projet.github, servi, brigade: brigade.github }), lire: () => ({ enregistrements: temps(), lostTimeMaxMin: 2 }) })();

test("a loss measured on a served project is filed on benomite/brigade, naming the project and the loss", async () => {
  const projet = fauxDepot();
  const brigade = fauxDepot();
  const decision = await ouvrir("BOBL-tech/espace", projet, brigade);
  assert.equal(decision.issue, "ouverte");
  assert.equal(projet.issues.length, 0);
  assert.equal(brigade.issues.length, 1);
  const [ticket] = brigade.issues;
  assert.ok(ticket?.titre.startsWith("Tickets lose too much time"));
  assert.ok(ticket?.titre.includes("BOBL-tech/espace"));
  assert.ok(ticket?.corps.includes(marqueDuProjet("BOBL-tech/espace")));
  assert.ok(ticket?.corps.includes("waiting for a claim"));
  assert.match(ticket?.corps ?? "", /median 5 min/);
  // Un second tour ne rouvre rien pour ce projet, mais un autre projet a son ticket.
  assert.equal((await ouvrir("BOBL-tech/espace", projet, brigade)).issue, "deja-ouverte");
  assert.equal((await ouvrir("BOBL-tech/mirrorscreen", projet, brigade)).issue, "ouverte");
  assert.equal(brigade.issues.length, 2);
  assert.equal(projet.issues.length, 0);
});

test("a loss measured on benomite/brigade itself is still filed there, as before", async () => {
  const projet = fauxDepot();
  const brigade = fauxDepot();
  const decision = await ouvrir(DEPOT_BRIGADE, projet, brigade);
  assert.equal(decision.issue, "ouverte");
  assert.equal(projet.issues.length, 1);
  assert.equal(brigade.issues.length, 0);
  assert.ok(!projet.issues[0]?.corps.includes("brigade:projet="));
});
