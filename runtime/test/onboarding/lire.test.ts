// L'onboarding lu d'un vrai répertoire d'état : le ticket de préparation que
// la station a noté, et le journal du projet tel que sa cuisine l'écrit.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Fait } from "../../src/evenements.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { lireFaitsDuProjet, lireOnboarding } from "../../src/onboarding/lire.ts";
import { FICHIER } from "../../src/preparation-depot/ouvrir.ts";
import { repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

const PROJET = "mirrorlab";
const DEPOT = "BOBL-tech/mirrorlab";
const URL = (ticket: number) => `https://github.com/${DEPOT}/issues/${ticket}`;

// Un répertoire d'état où la station a noté le ticket #433, et le journal de sa cuisine.
function unProjet(t: TestContext, { note = true } = {}) {
  const repertoireEtat = repertoireTemporaire(t);
  if (note) writeFileSync(join(repertoireEtat, FICHIER), `${JSON.stringify({ ticket: 433, ouvertLe: "2026-10-20T10:30:00.000Z" })}\n`);
  const noter = (fait: Fait, ticket: number | null = 433) => {
    const journal = ouvrirJournal(repertoireEtat);
    try {
      journal.ajouter({ project: PROJET, ticket, author: "runtime", ...fait });
    } finally {
      journal.fermer();
    }
  };
  const arriver = (ticket = 433) =>
    noter({ type: "ticket.arrived", payload: { title: `Ticket ${ticket}`, priority: null, createdAt: "2026-10-20T10:30:00Z", url: URL(ticket), card: null } }, ticket);
  const onboarding = () => lireOnboarding({ repertoireEtat, projet: PROJET, depot: DEPOT, station: "macbook", suivi: { etat: "servi", dit: "served by macbook", autoriser: [] }, clone: true });
  return { repertoireEtat, noter, arriver, onboarding };
}

test("sans journal — la cuisine ne s'est pas encore ouverte : le ticket noté est en cours, le bac à sable inconnu", (t) => {
  const projet = unProjet(t);
  assert.deepEqual(lireFaitsDuProjet(projet.repertoireEtat), {
    preparation: { ticket: 433, rail: null, sort: null, pass: null },
    premierTicket: null,
    dejaServi: false,
    sansBacASable: null,
    decision: null,
  });
  const onboarding = projet.onboarding();
  assert.equal(onboarding.courante, "preparation");
  assert.deepEqual(onboarding.preparation, { ticket: 433, url: URL(433), etat: "en-cours", raison: null, prochainEssai: null, pr: null });
  assert.equal(onboarding.sansBacASable, null);
});

test("rien de noté, aucun journal : la préparation est à ouvrir", (t) => {
  const onboarding = unProjet(t, { note: false }).onboarding();
  assert.equal(onboarding.preparation, null);
  assert.equal(onboarding.courante, "preparation");
});

test("préparation en cours, puis en échec faute de worktree : la raison et l'heure du prochain essai viennent du journal", (t) => {
  const projet = unProjet(t);
  projet.arriver();
  projet.noter({ type: "ticket.taken", payload: { station: "macbook", leaseUntil: "2026-10-20T11:30:00.000Z" } });
  assert.equal(projet.onboarding().preparation?.etat, "en-cours");

  projet.noter({ type: "ticket.86", payload: { reason: "worktree-failed", until: "2026-10-20T10:59:00.000Z" } });
  const onboarding = projet.onboarding();
  assert.deepEqual(onboarding.preparation, {
    ticket: 433,
    url: URL(433),
    etat: "en-echec",
    raison: "The worktree cannot be prepared.",
    prochainEssai: "2026-10-20T10:59:00.000Z",
    pr: null,
  });
  assert.equal(onboarding.etapes.find(({ etape }) => etape === "preparation")?.geste?.ou, "On macbook.");
});

test("préparation à relire : livrée à la pass, sa PR est lue du journal ; la pass arrêtée faute de grant, le geste est de la merger", (t) => {
  const projet = unProjet(t);
  const pr = `https://github.com/${DEPOT}/pull/434`;
  projet.arriver();
  projet.noter({ type: "ticket.taken", payload: { station: "macbook", leaseUntil: "2026-10-20T11:30:00.000Z" } });
  projet.noter({
    type: "cook.launched",
    payload: { run: "run-1", limits: { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 }, stream: "runs/run-1.jsonl", station: "macbook", model: "opus", effort: "high", branch: "cook/433", worktree: "worktrees/433" },
  });
  projet.noter({ type: "ticket.passing", payload: { station: "macbook" } });
  projet.noter({ type: "pass.started", payload: { run: "run-1", pr, number: 434, sha: "abc" } });
  assert.equal(projet.onboarding().preparation?.etat, "a-relire");
  assert.equal(projet.onboarding().preparation?.pr, pr);

  projet.noter({ type: "pass.held", payload: { reason: "no-grant" } });
  const onboarding = projet.onboarding();
  assert.deepEqual(onboarding.etapes.find(({ etape }) => etape === "preparation")?.geste, { quoi: "Review and merge the preparation PR.", ou: "On GitHub.", liens: [pr] });
});

test("une cuisine sans bac à sable (`isolation.configured`, sandbox nul) : l'onboarding l'expose — avec un bac à sable, non", (t) => {
  const projet = unProjet(t);
  projet.noter({ type: "isolation.configured", payload: { sandbox: null, proxy: null } }, null);
  assert.equal(projet.onboarding().sansBacASable, true);
  projet.noter({ type: "isolation.configured", payload: { sandbox: { bin: "bwrap", hidden: [], credentials: "/x" }, proxy: null } }, null);
  assert.equal(projet.onboarding().sansBacASable, false);
});

test("prêt : la préparation servie, l'onboarding est fini — puis le premier ticket du chef entre sur le rail", (t) => {
  const projet = unProjet(t);
  projet.arriver();
  projet.noter({ type: "ticket.served", payload: {} });
  const pret = projet.onboarding();
  assert.equal(pret.etat, "pret");
  assert.equal(pret.termine, true);
  assert.equal(pret.courante, "premier-ticket");
  assert.equal(pret.preparation?.etat, "faite");

  projet.arriver(440);
  assert.deepEqual(lireFaitsDuProjet(projet.repertoireEtat).premierTicket, { ticket: 440, url: URL(440) });
  assert.equal(projet.onboarding().courante, null);
});

test("lire.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
