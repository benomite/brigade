// Les gestes de la file faits du téléphone appairé, par le guichet de sa
// station (#1412) : merger une livraison, retirer un ticket du rail, le
// renvoyer en cuisine. Chacun change la station comme le même geste de l'app
// de l'ordinateur — deux stations jumelles, l'une jouée du téléphone, l'autre
// comme l'ordinateur la joue, finissent dans le même état —, et l'ordinateur
// le lit à sa lecture suivante. Refusé, il le dit en une phrase et rien ne
// change ; sans jeton valable, rien ne part.
//
// Ce que le test ouvre — journal, guichet, base des téléphones — se ferme par
// `aArreter`, avant que ses répertoires disparaissent : sous Windows, un
// fichier ouvert ne se supprime pas.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { mettreEnAttente } from "../../src/attente.ts";
import type { Fait } from "../../src/evenements.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { ticketDuRail } from "../../src/projections/rail.ts";
import { CONFIGURATION, ETATS } from "../../src/station/configuration.ts";
import { ouvrirTelephones } from "../../src/telephone/appairage.ts";
import { gestesDeLaStation } from "../../src/telephone/gestes.ts";
import { ouvrirGuichet } from "../../src/telephone/guichet.ts";
import { projetsDeLaStation } from "../../src/telephone/projets.ts";
import { aArreter, DEPOT, ENV_ENFANT, fauxGh, horloge, repertoireTemporaire } from "../outils.ts";

const RUNTIME = join(import.meta.dirname, "..", "..");
const ISSUE = (numero: number) => `repos/${DEPOT}/issues/${numero}`;
const PULLS = `repos/${DEPOT}/pulls`;
const LIMITES = { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };

type Reponse = { statut: number; entetes: Headers; corps: Record<string, unknown> };

// Une station qui sert `brigade` (le dépôt de `DEPOT`), et dont le rail porte :
// #14, livré et tenu par la pass faute de grant — il attend que le chef le
// merge ; #15 en attente ; #16 en WAITING, qui attend un tiers.
// `ligne` : ce que la configuration dit de plus du projet.
async function station(t: TestContext, ligne = "") {
  const racine = repertoireTemporaire(t);
  const gh = fauxGh(t);
  // L'environnement de la station, que ses gestes reçoivent.
  const env = { ...ENV_ENFANT, HOME: repertoireTemporaire(t), BRIGADE_STATION_DIR: racine, BRIGADE_GH_BIN: gh.bin };
  writeFileSync(join(racine, CONFIGURATION), `brigade   ${DEPOT}   v2 ${ligne}\n`);
  const repertoireEtat = join(racine, ETATS, "brigade");
  mkdirSync(repertoireEtat, { recursive: true });
  const journal = ouvrirJournal(repertoireEtat, { maintenant: horloge() });
  aArreter(t, () => journal.fermer());
  const noter = (fait: Fait, ticket: number | null = null, author = "runtime") => journal.ajouter({ project: "brigade", ticket, author, ...fait });
  noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
  for (const ticket of [14, 15, 16]) {
    noter({ type: "ticket.arrived", payload: { title: `Ticket ${ticket}`, priority: null, createdAt: `2026-10-01T00:00:${ticket}Z`, url: `https://github.com/${DEPOT}/issues/${ticket}` } }, ticket, "github");
  }
  noter({ type: "ticket.taken", payload: { station: "box", leaseUntil: "2099-01-01T00:00:00Z" } }, 14);
  noter({ type: "cook.launched", payload: { run: "14-aa", limits: LIMITES, stream: "runs/14-aa.jsonl", branch: "cook/14-aa", worktree: "worktrees/14-aa" } }, 14);
  noter({ type: "cook.exited", payload: { run: "14-aa", outcome: "ok", code: 0, signal: null, turns: 3, tokens: 1000, durationMs: 1000 } }, 14);
  noter({ type: "ticket.passing", payload: { station: "box" } }, 14, "station:box");
  noter({ type: "pass.started", payload: { run: "14-aa", pr: `https://github.com/${DEPOT}/pull/114`, number: 114, sha: "sha-14" } }, 14, "pass");
  noter({ type: "pass.held", payload: { reason: "no-grant" } }, 14, "pass");
  mettreEnAttente(journal, "brigade", 16, { quoi: "the client's go-ahead", qui: "the client" }, new Date("2026-10-01T00:00:00Z"));
  const ecrits = () => journal.base.lire<Record<string, unknown>>("SELECT project, ticket, type, author, payload FROM events ORDER BY seq");
  const avant = ecrits().length;

  // Ce que GitHub répond : la PR de #14, ouverte, à la tête `sha-14`, et qui se merge ; le label `fire` de #15, qui se retire.
  const pr = { number: 114, html_url: `https://github.com/${DEPOT}/pull/114`, state: "open", merged: false, merged_at: null, mergeable_state: "clean", base: { ref: "v2" }, head: { sha: "sha-14" } };
  gh.repondre(`${PULLS}?head=acme:cook/14-aa&state=all&per_page=1`, { corps: [pr] });
  gh.repondre(`${PULLS}/114`, { corps: pr });
  gh.repondre(`${PULLS}/114/merge`, { corps: { merged: true } });
  gh.repondre(`${ISSUE(15)}/labels/fire`, { corps: [] });

  const telephones = ouvrirTelephones(repertoireTemporaire(t));
  const guichet = await ouvrirGuichet({
    telephones,
    projets: projetsDeLaStation({ racine, env, station: { projets: () => ["brigade"], refuses: () => ({}) } }),
    gestes: gestesDeLaStation({ racine, env }),
    hote: "127.0.0.1",
    port: 0,
  });
  aArreter(t, async () => {
    await guichet.fermer();
    telephones.fermer();
  });
  const { jeton } = telephones.appairer(telephones.emettre().code, { nom: "pixel-8", machine: "Android 16" });
  const demander = async (chemin: string, corps: unknown, entetes: Record<string, string> = { authorization: `Bearer ${jeton}` }, methode = "POST"): Promise<Reponse> => {
    const reponse = await fetch(`http://127.0.0.1:${guichet.port}${chemin}`, { method: methode, headers: { "content-type": "application/json", ...entetes }, ...(methode === "POST" ? { body: typeof corps === "string" ? corps : JSON.stringify(corps) } : {}) });
    return { statut: reponse.status, entetes: reponse.headers, corps: (await reponse.json()) as Record<string, unknown> };
  };
  // Le téléphone fait le geste sur un ticket de `brigade`.
  const geste = (gesture: unknown, ticket: unknown, entetes?: Record<string, string>) => demander("/projects/brigade/gestures", { gesture, ticket }, entetes);
  // Ce que l'app de l'ordinateur lance sur la station de cet ordinateur pour un projet — le
  // geste de la station, depuis le dossier du runtime, avec le répertoire de la station
  // (app/src/box.ts, `lancerIci`) ; sur une box, `brigade <projet> …` lance le même.
  const commeLOrdinateur = (...args: string[]) =>
    new Promise<{ code: number; sortie: string; erreurs: string }>((resoudre) => {
      execFile(process.execPath, [join("src", "station", "geste.ts"), "brigade", ...args], { cwd: RUNTIME, env }, (erreur, sortie, erreurs) =>
        resoudre({ code: erreur === null ? 0 : typeof erreur.code === "number" ? erreur.code : -1, sortie, erreurs }),
      );
    });
  return { journal, gh, jeton, demander, geste, commeLOrdinateur, ecrits: () => ecrits().slice(avant), revoquer: () => telephones.revoquer("pixel-8") };
}

// La file que l'ordinateur lit : `facts`, par le geste de la station.
async function railLu(cuisine: Awaited<ReturnType<typeof station>>) {
  const lue = await cuisine.commeLOrdinateur("facts");
  assert.equal(lue.code, 0, lue.erreurs);
  return (JSON.parse(lue.sortie) as { rail: Array<{ ticket: number; etat: string }> }).rail.map(({ ticket, etat }) => ({ ticket, etat }));
}

for (const { gesture, args, ticket, fait } of [
  { gesture: "remove", args: ["rail", "remove", "15"], ticket: 15, fait: /^#15 removed from the rail — cost: the ticket leaves the rail/ },
  { gesture: "back-to-kitchen", args: ["waiting", "arrived", "16"], ticket: 16, fait: /^#16: it arrived — it goes back to the kitchen$/ },
  { gesture: "merge", args: ["rail", "merge", "14"], ticket: 14, fait: /^#14: delivery merged — cost: https:\/\/github\.com\/acme\/brigade\/pull\/114 is merged into v2/ },
]) {
  test(`« ${gesture} » du téléphone change la station comme le même geste de l'ordinateur : même journal, mêmes appels à GitHub, même phrase`, async (t) => {
    const telephone = await station(t);
    const ordinateur = await station(t);

    const reponse = await telephone.geste(gesture, ticket);
    const lance = await ordinateur.commeLOrdinateur(...args);

    assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps));
    assert.equal(lance.code, 0, lance.erreurs);
    assert.equal(reponse.corps.done, true);
    assert.match(String(reponse.corps.said), fait);
    assert.equal(reponse.corps.said, lance.sortie.trim());
    assert.match(String(reponse.corps.detail), new RegExp(`^\\$ brigade brigade ${args.join(" ")}\\n`));
    assert.deepEqual(telephone.ecrits(), ordinateur.ecrits());
    assert.deepEqual(telephone.gh.appels(), ordinateur.gh.appels());
    // Le geste a bien changé quelque chose.
    assert.notDeepEqual([telephone.ecrits(), telephone.gh.appels()], [[], []]);
  });
}

test("après un geste du téléphone, la file que l'ordinateur lit a changé : #15 retiré n'est plus sur le rail, #16 revenu de WAITING repart en cuisine", async (t) => {
  const cuisine = await station(t);
  const avant = await railLu(cuisine);
  assert.deepEqual(avant.find(({ ticket }) => ticket === 15)?.etat, "en attente");
  assert.notEqual(ticketDuRail(cuisine.journal.base, 16)?.waitingFor ?? null, null);

  assert.equal((await cuisine.geste("remove", 15)).statut, 200);
  assert.equal((await cuisine.geste("back-to-kitchen", 16)).statut, 200);

  const apres = await railLu(cuisine);
  assert.equal(apres.find(({ ticket }) => ticket === 15), undefined);
  assert.equal(ticketDuRail(cuisine.journal.base, 16)?.waitingFor, null);
  assert.notDeepEqual(apres.find(({ ticket }) => ticket === 16), avant.find(({ ticket }) => ticket === 16));
  // Le merge de #14 a eu lieu sur GitHub, à la tête de sa PR : la pass le constate à son tour suivant, comme celui de l'ordinateur.
  assert.equal((await cuisine.geste("merge", 14)).statut, 200);
  assert.deepEqual(
    cuisine.gh.appels().filter((appel) => appel.includes("PUT")),
    [["api", "-i", "-X", "PUT", "-f", "sha=sha-14", "-f", "merge_method=merge", `${PULLS}/114/merge`]],
  );
});

test("un geste que la commande refuse rend 409 et sa phrase — celle que l'ordinateur lirait —, et rien ne change", async (t) => {
  const cuisine = await station(t);

  for (const [gesture, ticket, phrase] of [
    ["merge", 15, "#15 is not touched: #15 has no delivery waiting for you to merge it — cost: none: nothing was changed"],
    ["remove", 99, "#99 is not touched: #99 is not on the rail — cost: none: nothing was changed"],
    ["back-to-kitchen", 15, "ticket 15 is not waiting for a third party — it is queued"],
  ] as const) {
    const reponse = await cuisine.geste(gesture, ticket);
    assert.equal(reponse.statut, 409, `${gesture} ${ticket}`);
    assert.equal(reponse.corps.done, false);
    assert.equal(reponse.corps.said, phrase);
    assert.doesNotMatch(String(reponse.corps.said), /\n/);
    assert.match(String(reponse.corps.detail), /→ exit code 1$/);
  }
  assert.deepEqual(cuisine.ecrits(), []);
  assert.deepEqual(cuisine.gh.appels(), []);
});

test("un geste qui ne rend pas de verdict — sa commande sort sur un autre code — rend 502 et une phrase, sans rien changer", async (t) => {
  const cuisine = await station(t, "BRIGADE_LEASE_SECONDS=jamais");

  const reponse = await cuisine.geste("remove", 15);

  assert.equal(reponse.statut, 502, JSON.stringify(reponse.corps));
  assert.equal(reponse.corps.done, false);
  assert.match(String(reponse.corps.said), /^BRIGADE_LEASE_SECONDS invalid: “jamais”/);
  assert.doesNotMatch(String(reponse.corps.said), /\n/);
  assert.match(String(reponse.corps.detail), /→ exit code 2$/);
  assert.deepEqual(cuisine.ecrits(), []);
  assert.deepEqual(cuisine.gh.appels(), []);
});

test("une demande mal formée rend 400, un projet que la station n'a pas 404 — chacun en une phrase, et rien ne part", async (t) => {
  const cuisine = await station(t);

  for (const corps of ["pas du json", null, 7, { ticket: 15 }, { gesture: "close", ticket: 15 }, { gesture: "remove" }, { gesture: "remove", ticket: "15" }, { gesture: "remove", ticket: 0 }, { gesture: "remove", ticket: 1.5 }]) {
    const reponse = await cuisine.demander("/projects/brigade/gestures", corps);
    assert.equal(reponse.statut, 400, JSON.stringify(corps));
    assert.equal(reponse.corps.done, false);
    assert.match(String(reponse.corps.said), /is expected$/);
  }
  const inconnu = await cuisine.demander("/projects/inconnu/gestures", { gesture: "remove", ticket: 15 });
  assert.equal(inconnu.statut, 404);
  assert.equal(inconnu.corps.said, "this station has no project named “inconnu”");
  assert.deepEqual(cuisine.ecrits(), []);
  assert.deepEqual(cuisine.gh.appels(), []);
});

test("sans jeton valable — absent, faux, ou d'un téléphone révoqué —, aucun geste ne part, et un nom de projet ne se devine pas au code", async (t) => {
  const cuisine = await station(t);

  for (const entetes of [{}, { authorization: "Bearer brgt_faux" }, { authorization: cuisine.jeton }] as Array<Record<string, string>>) {
    for (const chemin of ["/projects/brigade/gestures", "/projects/inconnu/gestures"]) {
      const refus = await cuisine.demander(chemin, { gesture: "remove", ticket: 15 }, entetes);
      assert.equal(refus.statut, 401, `${chemin} ${JSON.stringify(entetes)}`);
      assert.equal(refus.entetes.get("www-authenticate"), 'Bearer realm="brigade"');
    }
  }
  cuisine.revoquer();
  assert.equal((await cuisine.geste("remove", 15)).statut, 401);

  assert.deepEqual(cuisine.ecrits(), []);
  assert.deepEqual(cuisine.gh.appels(), []);
});

test("un geste ne se fait qu'en POST", async (t) => {
  const cuisine = await station(t);

  const refus = await cuisine.demander("/projects/brigade/gestures", undefined, undefined, "GET");

  assert.equal(refus.statut, 405);
  assert.equal(refus.entetes.get("allow"), "POST");
  assert.deepEqual(cuisine.ecrits(), []);
});

test("un guichet ouvert sans les gestes de la station n'en fait aucun", async (t) => {
  const telephones = ouvrirTelephones(repertoireTemporaire(t));
  const guichet = await ouvrirGuichet({ telephones, hote: "127.0.0.1", port: 0 });
  aArreter(t, async () => {
    await guichet.fermer();
    telephones.fermer();
  });
  const { jeton } = telephones.appairer(telephones.emettre().code, { nom: "pixel-8", machine: "Android 16" });

  const reponse = await fetch(`http://127.0.0.1:${guichet.port}/projects/brigade/gestures`, { method: "POST", headers: { authorization: `Bearer ${jeton}` }, body: JSON.stringify({ gesture: "remove", ticket: 15 }) });

  assert.equal(reponse.status, 404);
  assert.deepEqual(await reponse.json(), { done: false, said: "this station has no project named “brigade”" });
});
