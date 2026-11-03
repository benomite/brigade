// Un seul écrivain par tableau (épique #2108) : le Kitchen board d'un projet
// n'est écrit que par la cuisine de la station qui le sert. Un second runtime
// qui tente de le réécrire est refusé, le tableau reste tel quel, et le refus
// nomme la station qui sert le projet — dans l'erreur rendue comme au journal
// du service. GitHub est ici un faux client, partagé par les deux cuisines ;
// les stations du compte, une liste donnée.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { StationAppairee, StationsDuChef } from "../src/appairage/stations-du-chef.ts";
import { lireLaSignature, signer, TableauDUneAutreStation, unSeulEcrivain, type Signature } from "../src/board-single-writer.ts";
import { lireEtat } from "../src/etat.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { demarrer } from "../src/runtime.ts";
import type { ClientDuTableau, IssueDuTableau } from "../src/tableau/publication/client.ts";
import { brancherLeTableau, publierLeTableau } from "../src/tableau/publication/publier.ts";
import { lireLeTableau, type LigneDeLaFile, type Tableau } from "../src/tableau/rendu/bloc.ts";
import { tableauDeLaCuisine } from "../src/tableau/rendu/donnees.ts";
import { aArreter, jusqua, repertoireTemporaire } from "./outils.ts";

const DEPOT = "acme/brigade";
const MINUTE = 60_000;
const DEBUT = Date.parse("2026-11-03T09:30:00.000Z");
const BOX: Signature = { station: "box", hote: "box.example" };
const MAC: Signature = { station: "macbook-air", hote: "macbook-air.home" };

// Le GitHub du dépôt, que les deux cuisines lisent et écrivent : ses issues, et chaque écriture dans l'ordre.
function fauxGitHub() {
  const issues = new Map<number, IssueDuTableau>();
  let suivant = 1683;
  const ecritures: string[] = [];
  const lectures = { fois: 0 };
  const copie = (issue: IssueDuTableau): IssueDuTableau => ({ ...issue, labels: [...issue.labels] });
  const client: ClientDuTableau = {
    auLabel: async (label) => (lectures.fois++, [...issues.values()]).filter((issue) => issue.labels.includes(label)).map(copie),
    issue: async (numero) => {
      lectures.fois++;
      const issue = issues.get(numero);
      return issue === undefined ? null : copie(issue);
    },
    async creer({ titre, corps, labels }) {
      const numero = suivant++;
      issues.set(numero, { numero, ouverte: true, titre, corps, labels: [...labels] });
      ecritures.push(`creer #${numero}`);
      return numero;
    },
    async ecrireCorps(numero, corps) {
      issues.get(numero)!.corps = corps;
      ecritures.push(`ecrire #${numero}`);
    },
    async rouvrir(numero) {
      issues.get(numero)!.ouverte = true;
      ecritures.push(`rouvrir #${numero}`);
    },
    epingler: async () => false,
  };
  return { client, issues, ecritures, lectures };
}

// Une station du compte, telle que sa présence la publie.
function station(nom: string, depots: string[], enLigne = true): StationAppairee {
  return { id: `gist-${nom}`, name: nom, machine: "Linux 6.1.0", kind: "ordinateur", cooks: true, version: "1.0.78", online: enLigne, lastSeen: new Date(DEBUT).toISOString(), stoppedAt: null, projects: depots.map((depot) => ({ name: "brigade", repository: depot })) };
}

// Les stations du compte, et combien de fois on les a lues.
function compte(etat: StationsDuChef) {
  const lu = { fois: 0, etat };
  return { lu, lire: async () => (lu.fois++, lu.etat) };
}

// Le tableau d'une cuisine à l'état vide, lu à l'instant donné ; `decisions` : la file qu'on lui pose.
function cuisine(t: TestContext, decisions: LigneDeLaFile[] = []): (maintenant: Date) => Tableau {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  aArreter(t, () => journal.fermer());
  return (maintenant) => ({ ...tableauDeLaCuisine(lireEtat(journal, maintenant), maintenant), file: decisions });
}

const decision = (ticket: number, titre: string, quoi: string, ligne: string): LigneDeLaFile => ({ nom: `#${ticket}`, ticket, titre, quoi, depuis: "2026-11-03T08:00:00.000Z", ligne, decision: null, carte: null });

// Les 4 décisions que la box publiait le matin de l'incident.
const QUATRE = [
  decision(2060, "Runtime suite on Windows", "merge", "green, PR #2070 — merge by hand"),
  decision(2086, "Gates CPU budget", "merge", "green, PR #2089 — merge by hand"),
  decision(2085, "Test-suite target", "question", "a product question on the test-suite target"),
  decision(2093, "Rail columns", "send-back", "the reviewer asks for the screens before and after"),
];

const a = (minutes: number) => new Date(DEBUT + minutes * MINUTE);

test("l'incident : la box publie 4 décisions, puis un second runtime à l'état vide tente de publier — il est refusé, et le tableau garde les 4 décisions", async (t) => {
  const github = fauxGitHub();
  const sesStations = compte({ state: "listed", stations: [station("box", [DEPOT]), station("macbook-air", [DEPOT])], unreadable: [] });
  const box = publierLeTableau({ client: unSeulEcrivain(github.client, { depot: DEPOT, soi: BOX, lireLesStations: sesStations.lire }), depot: DEPOT, lire: cuisine(t, QUATRE), dire: () => {} });
  const { numero } = await box.rafraichir(a(0));
  const publie = github.issues.get(numero)!.corps;
  assert.match(publie, /## Awaiting the chef — 4 decisions/);

  const mac = publierLeTableau({ client: unSeulEcrivain(github.client, { depot: DEPOT, soi: MAC, lireLesStations: sesStations.lire }), depot: DEPOT, lire: cuisine(t), dire: () => {} });
  await assert.rejects(mac.rafraichir(a(1)), (erreur) => {
    assert.ok(erreur instanceof TableauDUneAutreStation);
    assert.equal(erreur.station, "box");
    assert.equal(erreur.message, `board write refused: ${DEPOT} is served by station box (host box.example), which writes its Kitchen board #${numero} — this station macbook-air (host macbook-air.home) is not the project's serving kitchen and leaves the board as it is`);
    return true;
  });

  // Le tableau est celui que la box a écrit, octet pour octet : ses 4 décisions, et sa signature.
  assert.equal(github.issues.get(numero)!.corps, publie);
  const lu = lireLeTableau(publie);
  assert.ok(lu.lu);
  assert.deepEqual(lu.tableau.file.map(({ ticket }) => ticket), [2060, 2086, 2085, 2093]);
  assert.doesNotMatch(publie, /Awaiting the chef — nothing/);
  assert.deepEqual(github.ecritures, [`creer #${numero}`]);

  // La box, elle, publie toujours : un changement de sa file s'écrit, sans rien lire du compte.
  const lectures = sesStations.lu.fois;
  const suite = publierLeTableau({ client: unSeulEcrivain(github.client, { depot: DEPOT, soi: BOX, lireLesStations: sesStations.lire }), depot: DEPOT, lire: cuisine(t, QUATRE.slice(1)), dire: () => {} });
  assert.deepEqual(await suite.rafraichir(a(2)), { numero, gestes: ["ecrit"] });
  assert.match(github.issues.get(numero)!.corps, /## Awaiting the chef — 3 decisions/);
  assert.equal(sesStations.lu.fois, lectures);
});

test("branché au runtime, le refus se dit au journal du service en nommant la station qui sert le projet, une fois, et le tableau ne bouge pas", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const github = fauxGitHub();
  const sesStations = compte({ state: "listed", stations: [station("box", [DEPOT])], unreadable: [] });
  const { numero } = await publierLeTableau({ client: unSeulEcrivain(github.client, { depot: DEPOT, soi: BOX, lireLesStations: sesStations.lire }), depot: DEPOT, lire: cuisine(t, QUATRE), dire: () => {} }).rafraichir(a(0));
  const publie = github.issues.get(numero)!.corps;

  // Le runtime du Mac, à l'état vide, sous une horloge de test : c'est son tick qui rafraîchit le tableau.
  let instant = a(1).getTime();
  const maintenant = () => new Date(instant);
  const runtime = demarrer({ repertoireEtat: repertoireTemporaire(t), projet: "brigade", maintenant });
  aArreter(t, () => runtime.arreter("SIGTERM"));
  const avertis: string[] = [];
  brancherLeTableau(runtime, { client: unSeulEcrivain(github.client, { depot: DEPOT, soi: MAC, lireLesStations: sesStations.lire, maintenant: () => instant }), depot: DEPOT, maintenant, dire: () => {}, avertir: (ligne) => avertis.push(ligne) });
  await jusqua(() => avertis.length === 1);
  assert.equal(avertis[0], `brigade : Kitchen board de ${DEPOT} non rafraîchi — board write refused: ${DEPOT} is served by station box (host box.example), which writes its Kitchen board #${numero} — this station macbook-air (host macbook-air.home) is not the project's serving kitchen and leaves the board as it is`);

  // Les ticks suivants sont refusés de même, sans le redire ni relire le compte avant sa fraîcheur.
  for (let tick = 1; tick <= 3; tick++) {
    const lu = github.lectures.fois;
    instant += MINUTE;
    t.mock.timers.tick(MINUTE);
    await jusqua(() => github.lectures.fois > lu);
    // La lecture est partie, le refus ne s'est pas encore dit : il l'est quand les micro-tâches sont vidées.
    await new Promise((resoudre) => setImmediate(resoudre));
  }
  assert.equal(avertis.length, 1);
  assert.equal(sesStations.lu.fois, 1);
  assert.equal(github.issues.get(numero)!.corps, publie);
  assert.deepEqual(github.ecritures, [`creer #${numero}`]);
});

test("un tableau fermé par le chef ne se rouvre pas non plus sous un runtime qui ne sert pas le projet", async (t) => {
  const github = fauxGitHub();
  const sesStations = compte({ state: "listed", stations: [station("box", [DEPOT])], unreadable: [] });
  const { numero } = await publierLeTableau({ client: unSeulEcrivain(github.client, { depot: DEPOT, soi: BOX, lireLesStations: sesStations.lire }), depot: DEPOT, lire: cuisine(t, QUATRE), dire: () => {} }).rafraichir(a(0));
  github.issues.get(numero)!.ouverte = false;
  const mac = publierLeTableau({ client: unSeulEcrivain(github.client, { depot: DEPOT, soi: MAC, lireLesStations: sesStations.lire }), depot: DEPOT, lire: cuisine(t), dire: () => {} });
  await assert.rejects(mac.rafraichir(a(1)), { name: "TableauDUneAutreStation", message: /^board reopening refused: acme\/brigade is served by station box \(host box\.example\)/ });
  assert.equal(github.issues.get(numero)!.ouverte, false);
});

test("une station seule : ses publications s'écrivent comme avant, signées, sans lire le compte — et un tableau inchangé ne s'écrit pas", async (t) => {
  const github = fauxGitHub();
  const sesStations = compte({ state: "unavailable", cause: "network", reason: "GitHub cannot be reached" });
  let decisions = QUATRE;
  const lire = cuisine(t, []);
  const box = publierLeTableau({ client: unSeulEcrivain(github.client, { depot: DEPOT, soi: BOX, lireLesStations: sesStations.lire }), depot: DEPOT, lire: (maintenant) => ({ ...lire(maintenant), file: decisions }), dire: () => {} });
  const { numero } = await box.rafraichir(a(0));
  assert.deepEqual(await box.rafraichir(a(1)), { numero, gestes: [] });
  decisions = QUATRE.slice(0, 2);
  assert.deepEqual(await box.rafraichir(a(2)), { numero, gestes: ["ecrit"] });
  // Un runtime de la même station, redémarré, la reconnaît à sa signature.
  decisions = [];
  const redemarre = publierLeTableau({ client: unSeulEcrivain(github.client, { depot: DEPOT, soi: { station: "box", hote: "autre-hote" }, lireLesStations: sesStations.lire }), depot: DEPOT, lire: (maintenant) => ({ ...lire(maintenant), file: decisions }), dire: () => {} });
  assert.deepEqual(await redemarre.rafraichir(a(3)), { numero, gestes: ["ecrit"] });
  assert.equal(sesStations.lu.fois, 0);
  assert.deepEqual(github.ecritures, [`creer #${numero}`, `ecrire #${numero}`, `ecrire #${numero}`]);
  const corps = github.issues.get(numero)!.corps;
  assert.deepEqual(lireLaSignature(corps).signature, { station: "box", hote: "autre-hote" });
  assert.ok(lireLeTableau(corps).lu, "la signature, après le bloc, ne gêne pas sa lecture");
});

test("un tableau sans signature — écrit avant le garde — s'écrit sans rien lire du compte, et prend la signature de qui l'écrit", async (t) => {
  const github = fauxGitHub();
  const sesStations = compte({ state: "listed", stations: [station("box", [DEPOT])], unreadable: [] });
  const ancien = publierLeTableau({ client: github.client, depot: DEPOT, lire: cuisine(t, QUATRE), dire: () => {} });
  const { numero } = await ancien.rafraichir(a(0));
  const mac = publierLeTableau({ client: unSeulEcrivain(github.client, { depot: DEPOT, soi: MAC, lireLesStations: sesStations.lire }), depot: DEPOT, lire: cuisine(t), dire: () => {} });
  assert.deepEqual(await mac.rafraichir(a(1)), { numero, gestes: ["ecrit"] });
  assert.equal(sesStations.lu.fois, 0);
  assert.equal(lireLaSignature(github.issues.get(numero)!.corps).signature?.station, "macbook-air");
});

test("la station qui a signé le tableau ne le sert plus — arrêtée, partie du dépôt, ou plus au compte : la cuisine qui le sert le reprend", async (t) => {
  for (const stations of [[station("box", [DEPOT], false)], [station("box", ["acme/autre"])], [station("cuisine", [DEPOT])]]) {
    const github = fauxGitHub();
    const sesStations = compte({ state: "listed", stations: [...stations, station("macbook-air", [DEPOT])], unreadable: [] });
    const { numero } = await publierLeTableau({ client: unSeulEcrivain(github.client, { depot: DEPOT, soi: BOX, lireLesStations: sesStations.lire }), depot: DEPOT, lire: cuisine(t, QUATRE), dire: () => {} }).rafraichir(a(0));
    const mac = publierLeTableau({ client: unSeulEcrivain(github.client, { depot: DEPOT, soi: MAC, lireLesStations: sesStations.lire }), depot: DEPOT, lire: cuisine(t), dire: () => {} });
    assert.deepEqual(await mac.rafraichir(a(1)), { numero, gestes: ["ecrit"] }, JSON.stringify(stations));
    assert.equal(lireLaSignature(github.issues.get(numero)!.corps).signature?.station, "macbook-air");
  }
});

test("sans la liste des stations du compte, rien ne dit que la signataire ne sert plus le projet : l'écriture est refusée, en le disant", async (t) => {
  const github = fauxGitHub();
  const sesStations = compte({ state: "listed", stations: [station("box", [DEPOT])], unreadable: [] });
  const { numero } = await publierLeTableau({ client: unSeulEcrivain(github.client, { depot: DEPOT, soi: BOX, lireLesStations: sesStations.lire }), depot: DEPOT, lire: cuisine(t, QUATRE), dire: () => {} }).rafraichir(a(0));
  const publie = github.issues.get(numero)!.corps;
  const enPanne = async (): Promise<StationsDuChef> => {
    throw new Error("gh api /gists : connexion impossible.");
  };
  const mac = publierLeTableau({ client: unSeulEcrivain(github.client, { depot: DEPOT, soi: MAC, lireLesStations: enPanne }), depot: DEPOT, lire: cuisine(t), dire: () => {} });
  await assert.rejects(mac.rafraichir(a(1)), { message: `board write refused: the Kitchen board #${numero} of ${DEPOT} was written by station box (host box.example), and GitHub could not tell whether it still serves the project (gh api /gists : connexion impossible), so this station macbook-air (host macbook-air.home) leaves the board as it is and asks again later` });
  assert.equal(github.issues.get(numero)!.corps, publie);
});

test("la signature est un commentaire après le bloc : relue, elle se retire sans rien changer d'autre, et rien de ce qu'elle porte ne ferme le commentaire", () => {
  const corps = "# Kitchen board\n\n<!-- brigade:kitchen-board\n{}\n-->";
  const signe = signer(corps, { station: "box", hote: "a-->b@c" });
  assert.equal(signe.split("-->").length, 3, "un seul `-->` de plus : la fin de la signature");
  assert.deepEqual(lireLaSignature(signe), { corps, signature: { station: "box", hote: "a-->b@c" } });
  assert.deepEqual(lireLaSignature(corps), { corps, signature: null });
});
