// Le désaccord d'un cook renvoyé (#2592) : sa réponse sur la PR fait de son
// arrêt sans livraison un désaccord, que la pass juge, et non un échec. Les
// commentaires de la PR sont écrits à la main : aucune station ne tourne ici.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { stationDuDepot, type Lancer } from "../src/brigade-github.ts";
import { LABEL_IN_PASS } from "../src/github-etat/etats.ts";
import { FauxGitHub, STATION_DU_DEPOT, depotRepris, fauxClient } from "./faux-github.ts";
import { avecLeDesaccord, classerArret, consigneDuDesaccord, corpsDeLaReponse, renvoisDeLaTete, reponseDuCook, reponseDuMessage } from "../src/desaccord-cook.ts";
import { corpsDeVerdict, relire, type CommentaireDeVerdict, type PRAFusionner } from "../src/github-etat/fusion.ts";
import { consigneDeRelecture } from "../src/reviewer.ts";

const SHA = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
const REPONSE = "Remark 1 is already addressed: `runtime/src/x.ts` checks the empty case on line 12.";
const MOTIF = "the cook added nothing since its last delivery (30 turns)";

let id = 0;
const commentaire = (body: string, minute: number): CommentaireDeVerdict => ({ id: id++, body, association: "OWNER", createdAt: `2026-11-06T10:${String(minute).padStart(2, "0")}:00Z` });
const renvoi = (minute: number) => commentaire(corpsDeVerdict("st-1", SHA, { verdict: "request-changes", motif: "- **Blocking**: the empty case is not handled." }), minute);
const reponse = (minute: number, texte = REPONSE) => commentaire(corpsDeLaReponse(SHA, texte), minute);

// Ce que les tests comptent comme échecs : ce que `cuire` compte, un arrêt qui finit sur `echec`.
const echecs = (arrets: ({ desaccord: string } | { echec: string })[]) => arrets.filter((arret) => "echec" in arret).length;

test("a cook that stops without a delivery but replied on the PR after the send-back is a disagreement, not a failure", () => {
  const arret = classerArret([renvoi(0), reponse(5)], SHA, MOTIF);
  assert.deepEqual(arret, { desaccord: REPONSE });
  assert.equal(echecs([arret]), 0);
});

test("the same stop without any reply is a failure, and it counts", () => {
  const arret = classerArret([renvoi(0)], SHA, MOTIF);
  assert.deepEqual(arret, { echec: MOTIF });
  assert.equal(echecs([arret]), 1);
});

test("a reply posted before the send-back, or on another head, or by an outsider, does not make a disagreement", () => {
  assert.ok("echec" in classerArret([reponse(0), renvoi(5)], SHA, MOTIF));
  assert.ok("echec" in classerArret([renvoi(0), commentaire(corpsDeLaReponse("ffffffffffffffffffffffffffffffffffffffff", REPONSE), 5)], SHA, MOTIF));
  assert.ok("echec" in classerArret([renvoi(0), { ...reponse(5), association: "NONE" }], SHA, MOTIF));
});

test("the pass re-judges a refused head once the cook has replied, and is given the reply's text", async () => {
  const commentaires = [renvoi(0), reponse(5)];
  const pr: PRAFusionner = { number: 7, sha: SHA, state: "open", merged: false, enRetard: false } as PRAFusionner;
  let jugee = 0;
  await relire(pr, {
    station: "st-1",
    github: { commentaires: async () => commentaires, commenter: async () => {} } as never,
    juger: async () => {
      jugee += 1;
      return { verdict: "approve", motif: "" };
    },
  });
  assert.equal(jugee, 1, "the head refused before the reply is judged again");
  const consigne = avecLeDesaccord(consigneDeRelecture({ depot: "o/r", base: "main", ticket: { number: 3, title: "t", body: "b" }, commentaires: [], compteRendu: null, diff: { fichiers: ["x.ts"], texte: "+x" } }), reponseDuCook(commentaires, SHA));
  assert.ok(consigne.includes(REPONSE), "the reply's text is in what the pass is given");
  // Sans réponse, la tête refusée ne se rejuge pas.
  jugee = 0;
  await relire(pr, { station: "st-1", github: { commentaires: async () => [renvoi(0)], commenter: async () => {} } as never, juger: async () => ((jugee += 1), { verdict: "approve", motif: "" }) });
  assert.equal(jugee, 0);
});

test("once the pass has judged the reply, it is no longer pending, and refusing it allows one more send-back of the same head", () => {
  const juge = [renvoi(0), reponse(5), renvoi(10)];
  assert.equal(reponseDuCook(juge, SHA), null);
  assert.equal(renvoisDeLaTete([renvoi(0)], SHA), 1);
  assert.equal(renvoisDeLaTete(juge, SHA), 2);
});

test("the cook's send-back guidance tells it to reply on the PR when it judges remarks addressed or wrong, and its reply is read from its last message", () => {
  const consigne = consigneDuDesaccord(42);
  assert.match(consigne, /already addressed by your delivery, or wrong/);
  assert.match(consigne, /reply on the PR/);
  assert.match(consigne, /PR #42/);
  assert.match(consigne, /<reponse-pr> and <\/reponse-pr>/);
  assert.equal(reponseDuMessage(`Done.\n<reponse-pr>\n${REPONSE}\n</reponse-pr>\n<livrable>x</livrable>`), REPONSE);
  assert.equal(reponseDuMessage("<reponse-pr>  </reponse-pr>"), null);
  assert.equal(reponseDuMessage(null), null);
});

// Une station dont le cook reprend la branche de la PR #99, renvoyée par la
// relecture, et s'arrête sans rien y ajouter, sur le dernier message `message`.
async function renvoyeQuiSArrete(t: TestContext, message: string) {
  const repertoire = mkdtempSync(join(tmpdir(), "desaccord-cook-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(14);
  const tete = "a".repeat(40);
  faux.prs.push({ number: 99, issue: 14, branche: "cook/14-github", sha: tete, state: "open", merged: false, enRetard: false, mergeePar: null, fichiers: [] });
  faux.poster(99, "box", corpsDeVerdict("box", tete, { verdict: "request-changes", motif: "- **Blocking**: the empty case is not handled." }));
  const consignes: string[] = [];
  const lancer: Lancer = ({ flux, args }) => {
    consignes.push(args.join("\n"));
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 30, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({
    ...STATION_DU_DEPOT,
    github: fauxClient(faux),
    depot: depotRepris(repertoire, tete),
    flux: repertoire,
    lancer,
    avertir: () => {},
  });
  if ("refus" in station) throw new Error(station.refus);
  await station.tour();
  await station.calme();
  return { faux, consignes, corps: (numero: number) => (faux.commentaires.get(numero) ?? []).map((c) => c.body).join("\n") };
}

test("through the station: the resumed cook is told to reply, its reply is posted on the PR, and the delivery goes back to the pass with no failure counted", async (t) => {
  const { faux, consignes, corps } = await renvoyeQuiSArrete(t, `Nothing to change.\n<reponse-pr>${REPONSE}</reponse-pr>`);
  assert.match(consignes[0] ?? "", /reply on the PR/);
  assert.match(corps(99), new RegExp(`brigade:reponse-cook sha=a{40}[\\s\\S]*${REPONSE.slice(0, 20)}`));
  assert.equal(faux.ticket(14).labels.has(LABEL_IN_PASS), true);
  assert.doesNotMatch(corps(14), /brigade:echec/);
});

test("through the station: the same stop with no reply counts as a failed cook", async (t) => {
  const { faux, corps } = await renvoyeQuiSArrete(t, "Nothing to change.");
  assert.doesNotMatch(corps(99), /brigade:reponse-cook/);
  assert.equal(faux.ticket(14).labels.has(LABEL_IN_PASS), false);
  assert.match(corps(14), /brigade:echec n=1[\s\S]*the cook added nothing since its last delivery/);
});
