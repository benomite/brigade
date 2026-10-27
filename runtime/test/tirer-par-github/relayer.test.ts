// Ce qu'une station secondaire pose dans son gist, et ce que la principale en
// relaie au journal du projet : chaque demande neuve une fois, seulement si un
// runtime tourne pour y répondre, et tant qu'elle est fraîche ; ni celle d'un
// autre projet, ni ce qui ne se lit pas. Puis ce que le tableau en publie.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Fichiers } from "../../src/appairage/canal.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { demandesDuGist, fichierDeLaDemande, FRAICHEUR_MS, poserLaDemande, type DemandePosee } from "../../src/tirer-par-github/demande.ts";
import { relayerLesDemandes } from "../../src/tirer-par-github/relayer.ts";
import { distantesDuTableau, GARDE_MS, reponseDuTableau } from "../../src/tirer-par-github/tableau.ts";
import { rendreLeTableau } from "../../src/tableau/rendu/rendre.ts";
import { tableauDeLaCuisine } from "../../src/tableau/rendu/donnees.ts";
import { lireEtat } from "../../src/etat.ts";
import { aArreter, repertoireTemporaire } from "../outils.ts";

const DEPOT = "acme/app";
const MAC = "mac/claude";
const INSTANT = Date.parse("2026-10-27T10:00:00Z");
const ID = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
const posee = (autres: Partial<DemandePosee> = {}): DemandePosee => ({ id: ID, depot: DEPOT, le: new Date(INSTANT).toISOString(), demande: { verb: "claim" }, ...autres });

// Un journal de projet, et un runtime qui tourne dessus — ou non.
function projet(t: TestContext, enCours = true) {
  const repertoire = repertoireTemporaire(t);
  let instant = INSTANT;
  const journal = ouvrirJournal(repertoire, { maintenant: () => new Date(instant) });
  aArreter(t, () => journal.fermer());
  if (enCours) journal.ajouter({ project: "app", ticket: null, author: "runtime", type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
  else journal.ajouter({ project: "app", ticket: null, author: `station:${MAC}`, type: "station.present", payload: { station: MAC } });
  const gists = new Map<string, Fichiers>([["gistmac", {}]]);
  const relayer = (maintenant = INSTANT) => relayerLesDemandes({ repertoireEtat: repertoire, depot: DEPOT, secondaires: [{ station: MAC, gist: "gistmac" }], lire: async (id) => gists.get(id) ?? null, maintenant: () => maintenant });
  const demandees = () => journal.tout().filter((e) => e.type === "remote.asked");
  return { repertoire, journal, gists, relayer, demandees, avancer: (ms: number) => void (instant += ms) };
}

test("une demande posée dans le gist est relayée au journal une fois, au nom de la station que le gist nomme, avec `via: github`", async (t) => {
  const { gists, relayer, demandees } = projet(t);
  Object.assign(gists.get("gistmac")!, poserLaDemande(posee({ demande: { verb: "claim", sandbox: { available: false, reason: "not macOS" } } })));
  assert.deepEqual((await relayer()).relayees, [{ station: MAC, id: ID, verb: "claim" }]);
  assert.deepEqual(
    demandees().map((e) => [e.author, e.payload]),
    [[`station:${MAC}`, { id: ID, station: MAC, via: "github", verb: "claim", sandbox: { available: false, reason: "not macOS" } }]],
  );
  // Relue sans changement : rien de plus au journal.
  assert.deepEqual((await relayer()).relayees, []);
  assert.equal(demandees().length, 1);
});

test("une demande que plus personne n'attend, celle d'un autre projet, ou qui ne se lit pas, n'est pas relayée", async (t) => {
  const { gists, relayer, demandees } = projet(t);
  const gist = gists.get("gistmac")!;
  Object.assign(gist, poserLaDemande(posee({ le: new Date(INSTANT - FRAICHEUR_MS - 1).toISOString() })));
  Object.assign(gist, poserLaDemande(posee({ id: "aaaaaaaa-0000", depot: "acme/autre" })));
  gist["brigade-pull.acme.app.renew.r1.json"] = "{ pas du json";
  gist["brigade-pull.acme.app.renew.r2.json"] = JSON.stringify({ brigade: "pull", format: 1, id: "bbbbbbbb-0000", depot: DEPOT, le: new Date(INSTANT).toISOString(), verb: "renew", run: "r2" });
  assert.deepEqual((await relayer()).relayees, []);
  assert.equal(demandees().length, 0);
});

test("sans runtime qui tourne pour le projet, rien n'est écrit : la demande reste dans le gist, relayée dès qu'il tourne", async (t) => {
  const { journal, gists, relayer, demandees } = projet(t, false);
  Object.assign(gists.get("gistmac")!, poserLaDemande(posee()));
  assert.deepEqual(await relayer(), { relayees: [], sansRuntime: true });
  assert.equal(demandees().length, 0);
  journal.ajouter({ project: "app", ticket: null, author: "runtime", type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
  assert.equal((await relayer()).relayees.length, 1);
});

test("chaque créneau a son fichier : la réclamation, et le renouvellement de chaque run — deux demandes ensemble n'écrivent jamais le même", () => {
  const reclamer = fichierDeLaDemande(DEPOT, { verb: "claim" });
  const renouveler = (run: string) => fichierDeLaDemande(DEPOT, { verb: "renew", run, proof: null, turns: 0, tokens: 0 });
  assert.equal(reclamer, "brigade-pull.acme.app.claim.json");
  assert.equal(fichierDeLaDemande(DEPOT, { verb: "announce" }), reclamer);
  assert.equal(new Set([reclamer, renouveler("17-a"), renouveler("18-b")]).size, 3);
  // Lues dans l'ordre où elles ont été posées.
  const gist = { ...poserLaDemande(posee({ id: "cccccccc-0002", le: "2026-10-27T10:00:02Z", demande: { verb: "renew", run: "17-a", proof: "e", turns: 1, tokens: 2 } })), ...poserLaDemande(posee({ id: "cccccccc-0001", le: "2026-10-27T10:00:01Z" })) };
  assert.deepEqual(demandesDuGist(gist, "ACME/App").map(({ id }) => id), ["cccccccc-0001", "cccccccc-0002"]);
  assert.throws(() => poserLaDemande(posee({ id: "court" })), /id/);
});

test("le tableau publie la dernière réponse de chaque créneau, tant qu'elle a moins de sa garde — la mission rendue telle que `pull` la rend", async (t) => {
  const { journal, gists, relayer, avancer } = projet(t);
  Object.assign(gists.get("gistmac")!, poserLaDemande(posee()));
  await relayer();
  const args = ["-p", "La consigne", "--model", "opus"];
  const mission = { ticket: 17, title: "T", run: "17-a", branch: "cook/17-a", base: "v2", repository: DEPOT, model: "opus", effort: "high", prompt: "La consigne", args, limits: { turns: 1, tokens: 1, durationMs: 1, idleMs: 1 }, leaseMs: 1, leaseUntil: "2026-10-27T10:30:00.000Z", resumes: null };
  journal.ajouter({ project: "app", ticket: 17, author: "runtime", type: "remote.answered", payload: { id: ID, station: MAC, ok: true, verb: "claim", mission, held: null } });
  const maintenant = new Date(INSTANT);
  const distantes = distantesDuTableau(journal.base, maintenant);
  assert.ok(distantes !== null);
  const publiee = distantes.reponses[0]?.reponse.mission as Record<string, unknown>;
  // La consigne n'y est qu'une fois.
  assert.deepEqual([publiee.args, publiee.suiteDesArgs], [undefined, ["--model", "opus"]]);
  const corps = rendreLeTableau({ ...tableauDeLaCuisine(lireEtat(journal, maintenant), maintenant), distantes }, maintenant);
  assert.deepEqual(reponseDuTableau(corps, MAC, ID), { ok: true, verb: "claim", mission, held: null });
  // Ni à une autre station, ni à une autre demande.
  assert.equal(reponseDuTableau(corps, "pc/claude", ID), null);
  assert.equal(reponseDuTableau(corps, MAC, "dddddddd-0000"), null);
  assert.deepEqual(reponseDuTableau("pas de bloc", MAC, ID), { illisible: "the board carries no machine block: it was not written by the box, or was edited by hand" });

  // Passé sa garde, elle quitte le tableau ; sans rien d'autre, le tableau n'a plus de `distantes`.
  avancer(GARDE_MS + 1);
  assert.equal(distantesDuTableau(journal.base, new Date(INSTANT + GARDE_MS + 1)), null);
});
