// Le rejeu de #2557, le 2026-11-06 : renvoyé après une relecture, le cook tourne
// 6 tours et s'arrête sans livrer. Le commentaire du ticket porte son dernier
// message, ses tours et son code de sortie ; avec une réponse sur la PR, l'arrêt
// est un désaccord et le ticket reste en cuisine ; sans, le même motif trois
// fois de suite le sort de la cuisine. Horloge fixée, aucune station réelle.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { priseDeLaStation, stationDuDepot, type Lancer } from "../src/brigade-github.ts";
import { corpsDeVerdict } from "../src/github-etat/fusion.ts";
import { FauxGitHub, fauxClient } from "./faux-github.ts";

const MAINTENANT = new Date("2026-11-06T14:00:00Z");
const TICKET = 2557;
const PR = 2570;
const TOURS = 6;
const DERNIER_MESSAGE = "All the review's remarks are already addressed by my delivery.";
const REPONSE = "Remark 1 is already addressed: the empty case is handled on line 12.";

// Une station dont le cook reprend la branche de la PR renvoyée par la relecture,
// tourne `TOURS` tours et s'arrête sans rien y ajouter, sur le dernier message `message`.
async function cuisinerLe6Novembre(t: TestContext, message: string, passages: number) {
  const repertoire = mkdtempSync(join(tmpdir(), "replay-2557-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(TICKET);
  const tete = "b".repeat(40);
  faux.prs.push({ number: PR, issue: TICKET, branche: `cook/${TICKET}-github`, sha: tete, state: "open", merged: false, enRetard: false, mergeePar: null, fichiers: [] });
  faux.poster(PR, "box", corpsDeVerdict("box", tete, { verdict: "request-changes", motif: "- **Blocking**: the empty case is not handled." }));
  const lancer: Lancer = ({ flux }) => {
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: TOURS, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({
    nom: "box",
    places: 1,
    base: "main",
    depotGitHub: "faux/depot",
    github: fauxClient(faux),
    depot: { connait: () => true, preparer: async () => assert.fail("the branch is resumed"), reprendre: async (run) => join(repertoire, run), retirer: () => {}, ranger: async () => null, pousser: () => {}, commits: () => 1, changes: () => [], diff: () => "", tete: () => tete },
    prise: priseDeLaStation,
    claude: "claude",
    env: {},
    cloison: null,
    plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
    graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" },
    flux: repertoire,
    lancer,
    maintenant: () => MAINTENANT,
    avertir: () => {},
  });
  if ("refus" in station) throw new Error(station.refus);
  for (let i = 0; i < passages; i += 1) {
    await station.tour();
    await station.calme();
  }
  const corps = (numero: number) => (faux.commentaires.get(numero) ?? []).map((c) => c.body);
  return { faux, corps };
}

test("#2557 on 2026-11-06: sent back, the cook stops after 6 turns having replied on the PR — the comment carries its last message, 6 turns and the exit code, and the ticket stays in the kitchen", async (t) => {
  const { faux, corps } = await cuisinerLe6Novembre(t, `${DERNIER_MESSAGE}\n<reponse-pr>${REPONSE}</reponse-pr>`, 1);
  assert.ok(corps(PR).some((c) => c.includes("brigade:reponse-cook") && c.includes(REPONSE)), "the reply is posted on the PR");
  assert.equal(faux.ticket(TICKET).labels.has("hors-cuisine"), false);
  // Le code livré ne poste aucun commentaire d'arrêt sur le ticket quand le cook a répondu sur la PR : le désaccord repart en pass.
  assert.equal(corps(TICKET).filter((c) => c.startsWith("<!-- brigade:echec")).length, 0);
});

test("#2557 on 2026-11-06: the same stop without a reply on the PR is a failure whose comment carries the last message, 6 turns and the exit code", async (t) => {
  const { faux, corps } = await cuisinerLe6Novembre(t, DERNIER_MESSAGE, 1);
  const echec = corps(TICKET).find((c) => c.startsWith("<!-- brigade:echec"));
  assert.ok(echec, "a failure comment is posted on the ticket");
  assert.ok(echec.includes(DERNIER_MESSAGE));
  assert.match(echec, /6 turns/);
  assert.match(echec, /exit code 0/);
  assert.equal(faux.ticket(TICKET).labels.has("hors-cuisine"), false, "one failure does not take the ticket off the kitchen");
});

test("#2557 on 2026-11-06: the same stop without a reply, with the same reason twice in a row, ends in hors-cuisine", async (t) => {
  const { faux, corps } = await cuisinerLe6Novembre(t, DERNIER_MESSAGE, 8);
  const echecs = corps(TICKET).filter((c) => c.startsWith("<!-- brigade:echec"));
  assert.equal(echecs.length, 2);
  for (const echec of echecs) assert.ok(echec.includes(DERNIER_MESSAGE) && /6 turns/.test(echec));
  assert.match(echecs[1] ?? "", /Taken off the kitchen/);
  assert.ok(faux.ticket(TICKET).labels.has("hors-cuisine"));
});
