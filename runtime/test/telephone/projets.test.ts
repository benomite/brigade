// Les projets de la station et la file de chacun, servis au téléphone appairé
// par son guichet (#1411) : tous les projets de sa configuration, et pour
// chacun la file que l'app de l'ordinateur lit sur la station — `facts` et
// `status` —, lue au même instant sur le même état. Sans jeton valable, rien
// ne se lit.
//
// Ce que le test ouvre — journal, guichet, base des téléphones — se ferme par
// `aArreter`, avant que ses répertoires disparaissent : sous Windows, un
// fichier ouvert ne se supprime pas.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Fait } from "../../src/evenements.ts";
import { principal as facts } from "../../src/faits.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { ouvrirRail } from "../../src/rail.ts";
import { CONFIGURATION, environnementDeLaCommande, ETATS, lireFichierDeConfiguration } from "../../src/station/configuration.ts";
import { principal as status } from "../../src/status.ts";
import { ouvrirTelephones } from "../../src/telephone/appairage.ts";
import { ouvrirGuichet } from "../../src/telephone/guichet.ts";
import { projetsDeLaStation } from "../../src/telephone/projets.ts";
import { aArreter, appeler, horloge, JOUR_HORLOGE, repertoireTemporaire } from "../outils.ts";

const INSTANT = new Date(`${JOUR_HORLOGE}T10:05:00.000Z`);

// Une station qui sert `brigade`, n'a pas encore ouvert `parade`, et refuse
// `espace` ; seul `brigade` a un journal, avec des tickets sur son rail.
async function station(t: TestContext) {
  const racine = repertoireTemporaire(t);
  const env = { HOME: repertoireTemporaire(t), BRIGADE_STATION_DIR: racine };
  writeFileSync(
    join(racine, CONFIGURATION),
    ["# projet  dépôt  branche", "brigade   benomite/brigade   v2", "parade    benomite/parade", "espace    benomite/espace    main"].join("\n") + "\n",
  );
  const repertoireEtat = join(racine, ETATS, "brigade");
  mkdirSync(repertoireEtat, { recursive: true });
  const journal = ouvrirJournal(repertoireEtat, { maintenant: horloge() });
  aArreter(t, () => journal.fermer());
  const noter = (fait: Fait, ticket: number | null = null, author = "runtime") => journal.ajouter({ project: "brigade", ticket, author, ...fait });
  const arriver = (ticket: number, priority: number | null) =>
    noter({ type: "ticket.arrived", payload: { title: `Ticket ${ticket}`, priority, createdAt: `2026-10-01T00:00:${ticket}Z`, url: `https://github.com/benomite/brigade/issues/${ticket}` } }, ticket, "github");
  const rail = ouvrirRail(journal, { projet: "brigade", dureeBailMs: 600_000, maintenant: () => new Date(`${JOUR_HORLOGE}T10:00:30.000Z`) });
  noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
  for (const [ticket, priority] of [[14, 1], [15, 2], [16, null]] as const) arriver(ticket, priority);
  rail.prendre("box/claude-opus");

  const servis = { projets: () => ["brigade"], refuses: (): Record<string, string> => ({ espace: "its clone is missing" }) };
  const telephones = ouvrirTelephones(repertoireTemporaire(t));
  const guichet = await ouvrirGuichet({ telephones, projets: projetsDeLaStation({ racine, env, station: servis, maintenant: () => new Date() }), hote: "127.0.0.1", port: 0 });
  aArreter(t, async () => {
    await guichet.fermer();
    telephones.fermer();
  });
  const { jeton } = telephones.appairer(telephones.emettre().code, { nom: "pixel-8", machine: "Android 16" });
  const lire = async (chemin: string, entetes: Record<string, string> = { authorization: `Bearer ${jeton}` }, methode = "GET") => {
    const reponse = await fetch(`http://127.0.0.1:${guichet.port}${chemin}`, { method: methode, headers: entetes });
    return { statut: reponse.status, entetes: reponse.headers, corps: (await reponse.json()) as Record<string, unknown> };
  };
  // Ce que l'app de l'ordinateur lit du projet : `brigade <projet> facts` et
  // `status`, que le geste de la station joue dans l'environnement du projet.
  const commeLOrdinateur = async (nom: string) => {
    const projet = lireFichierDeConfiguration(join(racine, CONFIGURATION)).projets.find((candidat) => candidat.nom === nom);
    assert.ok(projet);
    const sien = Object.fromEntries(Object.entries(environnementDeLaCommande(racine, projet, env)).filter((entree): entree is [string, string] => entree[1] !== undefined));
    const faits = appeler(facts, [], sien);
    assert.equal(await faits.fin, 0, faits.sortie());
    const photo = appeler(status, [], sien);
    assert.equal(await photo.fin, 0, photo.sortie());
    return { facts: JSON.parse(faits.sortie()) as Record<string, unknown>, status: photo.sortie() };
  };
  return { telephones, jeton, lire, commeLOrdinateur, rail, revoquer: () => telephones.revoquer("pixel-8") };
}

test("un téléphone appairé lit tous les projets de la station, dans l'ordre de sa configuration — ceux qu'elle refuse compris, avec la raison", async (t) => {
  const { lire } = await station(t);

  const { statut, corps } = await lire("/projects");

  assert.equal(statut, 200);
  assert.deepEqual(corps.projects, [
    { name: "brigade", repository: "benomite/brigade", state: "served" },
    { name: "parade", repository: "benomite/parade", state: "opening" },
    { name: "espace", repository: "benomite/espace", state: "refused", reason: "its clone is missing" },
  ]);
});

test("la file d'un projet servie au téléphone est celle que l'app de l'ordinateur lit au même instant, sur le même état — avant et après que le rail bouge", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: INSTANT });
  const { lire, commeLOrdinateur, rail } = await station(t);

  const avant = await lire("/projects/brigade/queue");
  assert.equal(avant.statut, 200);
  const ordinateur = await commeLOrdinateur("brigade");
  assert.deepEqual(avant.corps, { project: "brigade", repository: "benomite/brigade", ...ordinateur });
  // La file n'est pas vide : la comparaison porte sur des tickets.
  const railAvant = (avant.corps.facts as { rail: Array<{ ticket: number; etat: string }> }).rail;
  assert.deepEqual(
    railAvant.map(({ ticket, etat }) => ({ ticket, etat })),
    [
      { ticket: 14, etat: "pris" },
      { ticket: 15, etat: "en attente" },
      { ticket: 16, etat: "en attente" },
    ],
  );
  assert.match(String(avant.corps.status), /#14/);

  // Le rail bouge : les deux lectures bougent ensemble.
  rail.prendre("box/claude-sonnet");
  t.mock.timers.setTime(INSTANT.getTime() + 60_000);
  const apres = await lire("/projects/brigade/queue");
  assert.equal(apres.statut, 200);
  assert.deepEqual(apres.corps, { project: "brigade", repository: "benomite/brigade", ...(await commeLOrdinateur("brigade")) });
  assert.notDeepEqual(apres.corps.facts, avant.corps.facts);
});

test("un projet que la station n'a pas : 404 ; un projet dont le journal ne se lit pas : 503, et ce que la commande en dirait", async (t) => {
  const { lire } = await station(t);

  const inconnu = await lire("/projects/inconnu/queue");
  assert.equal(inconnu.statut, 404);
  assert.match(String(inconnu.corps.said), /no project named “inconnu”/);

  const sansJournal = await lire("/projects/parade/queue");
  assert.equal(sansJournal.statut, 503);
  assert.match(String(sansJournal.corps.said), /cannot read the queue of parade right now — no log in /);
});

test("sans jeton valable — absent, faux, ou d'un téléphone révoqué —, ni la liste ni une file ne se lisent, et un nom de projet ne se devine pas au code", async (t) => {
  const { lire, jeton, revoquer } = await station(t);
  const chemins = ["/projects", "/projects/brigade/queue", "/projects/inconnu/queue"];

  for (const entetes of [{}, { authorization: "Bearer brgt_faux" }, { authorization: jeton }] as Array<Record<string, string>>) {
    for (const chemin of chemins) {
      const refus = await lire(chemin, entetes);
      assert.equal(refus.statut, 401, `${chemin} ${JSON.stringify(entetes)}`);
      assert.equal(refus.entetes.get("www-authenticate"), 'Bearer realm="brigade"');
      assert.equal(refus.corps.projects, undefined);
      assert.equal(refus.corps.facts, undefined);
    }
  }

  revoquer();
  for (const chemin of chemins) assert.equal((await lire(chemin)).statut, 401, chemin);
});

test("la liste et la file ne se lisent qu'en GET", async (t) => {
  const { lire } = await station(t);

  for (const chemin of ["/projects", "/projects/brigade/queue"]) {
    const refus = await lire(chemin, undefined, "POST");
    assert.equal(refus.statut, 405, chemin);
    assert.equal(refus.entetes.get("allow"), "GET");
  }
});

test("un guichet ouvert sans les projets de la station rend une liste vide, et aucune file", async (t) => {
  const telephones = ouvrirTelephones(repertoireTemporaire(t));
  const guichet = await ouvrirGuichet({ telephones, hote: "127.0.0.1", port: 0 });
  aArreter(t, async () => {
    await guichet.fermer();
    telephones.fermer();
  });
  const { jeton } = telephones.appairer(telephones.emettre().code, { nom: "pixel-8", machine: "Android 16" });
  const entetes = { authorization: `Bearer ${jeton}` };

  const liste = await fetch(`http://127.0.0.1:${guichet.port}/projects`, { headers: entetes });
  assert.equal(liste.status, 200);
  assert.deepEqual(await liste.json(), { projects: [] });
  const file = await fetch(`http://127.0.0.1:${guichet.port}/projects/brigade/queue`, { headers: entetes });
  assert.equal(file.status, 404);
  await file.body?.cancel();
});
