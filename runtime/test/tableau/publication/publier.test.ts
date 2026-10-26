// Le tableau de la cuisine publié dans le dépôt du projet : l'issue « Kitchen
// board » se crée une fois et s'épingle, son corps ne se réécrit que si ce
// qu'il dit a changé — dans la minute, au tick du runtime —, elle se rouvre ou
// se recrée en le disant d'une ligne, et rien de ce qu'elle reçoit ne notifie
// personne. GitHub est ici un faux client, qui note chaque appel.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { lireEtat } from "../../../src/etat.ts";
import { ouvrirJournal } from "../../../src/journal.ts";
import { annoncerEnService } from "../../../src/mise-a-jour/en-service.ts";
import { demarrer } from "../../../src/runtime.ts";
import { lireLeTableau, type Tableau } from "../../../src/tableau/rendu/bloc.ts";
import { tableauDeLaCuisine, type FaitsDuTableau } from "../../../src/tableau/rendu/donnees.ts";
import { rendreLeTableau, TITRE_DU_TABLEAU } from "../../../src/tableau/rendu/rendre.ts";
import type { ClientDuTableau, IssueDuTableau } from "../../../src/tableau/publication/client.ts";
import { brancherLeTableau, contenuDuCorps, LABEL_DU_TABLEAU, publierLeTableau, VERIFIER_L_EPINGLE_MS } from "../../../src/tableau/publication/publier.ts";
import { LU_LE } from "../../aides/haut-de-status.ts";
import { copieDeLExempleDuBas } from "../../aides/opt-A-etat.ts";
import { aArreter, jusqua, repertoireTemporaire } from "../../outils.ts";

const DEPOT = "acme/brigade";
const MINUTE = 60_000;

// Un GitHub de test : les issues du dépôt, chaque lecture et chaque écriture
// dans l'ordre. `pannes` : ce qu'il refuse.
function fauxClient() {
  const issues = new Map<number, IssueDuTableau & { epinglee: boolean }>();
  let suivant = 1;
  const ecritures: Array<{ geste: "creer" | "ecrire" | "rouvrir" | "epingler"; numero: number }> = [];
  const lectures: string[] = [];
  const pannes = { epingler: false, lecture: false };
  const copie = (issue: IssueDuTableau): IssueDuTableau => ({ numero: issue.numero, ouverte: issue.ouverte, titre: issue.titre, corps: issue.corps, labels: [...issue.labels] });
  const tenue = (numero: number) => {
    const issue = issues.get(numero);
    assert.ok(issue !== undefined, `#${numero} existe`);
    return issue;
  };
  const client: ClientDuTableau = {
    async auLabel(label) {
      lectures.push(`label ${label}`);
      if (pannes.lecture) throw new Error("gh api : connexion impossible");
      return [...issues.values()].filter((issue) => issue.labels.includes(label)).map(copie);
    },
    async issue(numero) {
      lectures.push(`issue ${numero}`);
      if (pannes.lecture) throw new Error("gh api : connexion impossible");
      const issue = issues.get(numero);
      return issue === undefined ? null : copie(issue);
    },
    async creer({ titre, corps, labels }) {
      const numero = suivant++;
      issues.set(numero, { numero, ouverte: true, titre, corps, labels: [...labels], epinglee: false });
      ecritures.push({ geste: "creer", numero });
      return numero;
    },
    async ecrireCorps(numero, corps) {
      tenue(numero).corps = corps;
      ecritures.push({ geste: "ecrire", numero });
    },
    async rouvrir(numero) {
      tenue(numero).ouverte = true;
      ecritures.push({ geste: "rouvrir", numero });
    },
    async epingler(numero) {
      lectures.push(`epingle ${numero}`);
      if (pannes.epingler) throw new Error("gh api graphql : Resource not accessible by integration");
      const issue = tenue(numero);
      if (issue.epinglee) return false;
      issue.epinglee = true;
      ecritures.push({ geste: "epingler", numero });
      return true;
    },
  };
  return { client, issues, ecritures, lectures, pannes };
}

// Le tableau de l'état d'exemple de `status` (test/aides/bas-de-status.ts), lu
// à l'instant qu'on lui donne : ses durées avancent avec l'horloge, son état non.
function exemple(t: TestContext): (maintenant: Date) => Tableau {
  const journal = ouvrirJournal(copieDeLExempleDuBas(t), { lectureSeule: true });
  aArreter(t, () => journal.fermer());
  const etat = lireEtat(journal, LU_LE);
  return (maintenant) => tableauDeLaCuisine(etat, maintenant);
}

const apres = (minutes: number) => new Date(LU_LE.getTime() + minutes * MINUTE);

function publication(t: TestContext, lire = exemple(t)) {
  const github = fauxClient();
  const dites: string[] = [];
  const avertis: string[] = [];
  const publier = () => publierLeTableau({ client: github.client, depot: DEPOT, lire, dire: (ligne) => dites.push(ligne), avertir: (ligne) => avertis.push(ligne) });
  return { ...github, dites, avertis, publier };
}

test("sans tableau, le rafraîchissement crée l'issue « Kitchen board » et l'épingle ; le suivant n'en crée pas de seconde, ni un autre process après lui", async (t) => {
  const { publier, issues, ecritures, dites } = publication(t);
  const tableau = publier();
  assert.deepEqual(await tableau.rafraichir(LU_LE), { numero: 1, gestes: ["cree", "epingle"] });
  const cree = issues.get(1);
  assert.equal(cree?.titre, TITRE_DU_TABLEAU);
  assert.equal(cree?.titre, "Kitchen board");
  assert.deepEqual(cree?.labels, [LABEL_DU_TABLEAU, "hors-cuisine"]);
  assert.equal(cree?.epinglee, true);
  assert.ok(lireLeTableau(cree?.corps ?? "").lu, "le corps est le tableau rendu, avec son bloc");
  assert.deepEqual(dites, [`brigade : Kitchen board créé dans ${DEPOT} — #1`]);

  assert.deepEqual(await tableau.rafraichir(apres(1)), { numero: 1, gestes: [] });
  // Un runtime redémarré ne connaît plus le numéro : il le retrouve par le label et le bloc.
  assert.deepEqual(await publier().rafraichir(apres(2)), { numero: 1, gestes: [] });
  assert.equal(issues.size, 1);
  assert.deepEqual(ecritures.map(({ geste }) => geste), ["creer", "epingler"]);
  assert.equal(dites.length, 1);
});

test("un corps inchangé ne fait aucun appel d'écriture — même quand l'heure avance et que ses durées changent", async (t) => {
  const { publier, issues, ecritures, lectures } = publication(t);
  const tableau = publier();
  await tableau.rafraichir(LU_LE);
  const publie = issues.get(1)?.corps;
  const avant = ecritures.length;
  // Jusqu'à 5 minutes : rien ne bouge dans l'exemple, que ses durées (« for 2 h 04 », « 4 min ago »).
  for (const minutes of [0, 1, 2, 5]) await tableau.rafraichir(apres(minutes));
  assert.equal(ecritures.length, avant, "aucune écriture");
  assert.equal(issues.get(1)?.corps, publie);
  // Des lectures, une par rafraîchissement — l'épinglage ne se revérifie qu'à son intervalle.
  assert.deepEqual(lectures.slice(-4), ["issue 1", "issue 1", "issue 1", "issue 1"]);
  // Ce que le tableau dirait a bien changé, mais par ses durées seules.
  const lire = exemple(t);
  const corps = (minutes: number) => rendreLeTableau(lire(apres(minutes)), apres(minutes));
  assert.notEqual(corps(5).replace(/"genereLe":"[^"]*"/, ""), corps(0).replace(/"genereLe":"[^"]*"/, ""));
  assert.equal(contenuDuCorps(corps(5)), contenuDuCorps(corps(0)));
  // À 6 minutes, le bail de #23 échoit : sa ligne du rail le dit (« lease expired »), c'est un changement.
  assert.ok(lire(apres(6)).lignesDuRail?.find(({ ticket }) => ticket === 23)?.ligne.includes("lease expired since"));
  assert.notEqual(contenuDuCorps(corps(6)), contenuDuCorps(corps(0)));
  // Un événement du journal qui ne change rien d'autre n'est pas un changement : seuls les faits le nomment.
  const autreEvenement = { ...lire(apres(0)) };
  autreEvenement.faits = { ...autreEvenement.faits, dernierEvenement: { seq: 999, at: apres(0).toISOString(), type: "guard.configured", ticket: null } };
  assert.notEqual(rendreLeTableau(autreEvenement, apres(0)), corps(0));
  assert.equal(contenuDuCorps(rendreLeTableau(autreEvenement, apres(0))), contenuDuCorps(corps(0)));
  // Plus tard, un cook passe la moitié de son bail sans progrès : coincé, c'est un changement.
  assert.notEqual(contenuDuCorps(corps(45)), contenuDuCorps(corps(0)));
  await tableau.rafraichir(apres(45));
  assert.deepEqual(ecritures.slice(avant), [{ geste: "ecrire", numero: 1 }]);
});

test("ce qui change dans la cuisine réécrit le corps, et lui seul : ni titre, ni labels, ni commentaire", async (t) => {
  const base = exemple(t);
  let bilans: string[] = [];
  const { publier, issues, ecritures } = publication(t, (maintenant) => {
    const tableau = base(maintenant);
    return { ...tableau, bilans: [...tableau.bilans, ...bilans] };
  });
  const tableau = publier();
  await tableau.rafraichir(LU_LE);
  bilans = ["the merge grant was spent"];
  assert.deepEqual(await tableau.rafraichir(apres(1)), { numero: 1, gestes: ["ecrit"] });
  const lu = lireLeTableau(issues.get(1)?.corps ?? "");
  assert.ok(lu.lu);
  assert.ok(lu.tableau.bilans.includes("the merge grant was spent"));
  assert.equal(lu.genereLe, apres(1).toISOString());
  assert.deepEqual(issues.get(1)?.labels, [LABEL_DU_TABLEAU, "hors-cuisine"]);
  assert.deepEqual(ecritures.map(({ geste }) => geste), ["creer", "epingler", "ecrire"]);
  // Retouché à la main sur GitHub, le corps se réécrit au rafraîchissement suivant.
  const issue = issues.get(1);
  assert.ok(issue !== undefined);
  issue.corps = issue.corps.replace("## Kitchen", "## Kitchen (edited by hand)");
  assert.deepEqual(await tableau.rafraichir(apres(2)), { numero: 1, gestes: ["ecrit"] });
  assert.ok(!issues.get(1)?.corps.includes("edited by hand"));
});

test("le corps publié ne mentionne personne : aucun `@` collé à un nom, d'où que vienne le texte", async (t) => {
  const base = exemple(t);
  const { publier, issues } = publication(t, (maintenant) => {
    const tableau = base(maintenant);
    const [premiere] = tableau.file;
    assert.ok(premiere !== undefined);
    return { ...tableau, projet: "@octo", file: [{ ...premiere, titre: "Ask @octocat about it", ligne: "ping @acme" }], bilans: ["seen by @someone"] };
  });
  await publier().rafraichir(LU_LE);
  const corps = issues.get(1)?.corps ?? "";
  assert.ok(corps.includes("octocat"));
  assert.doesNotMatch(corps, /@[A-Za-z0-9]/);
});

test("le tableau fermé se rouvre, supprimé il se recrée : chaque fois une ligne, et l'issue est réépinglée", async (t) => {
  const { publier, issues, ecritures, dites } = publication(t);
  const tableau = publier();
  await tableau.rafraichir(LU_LE);
  const premier = issues.get(1);
  assert.ok(premier !== undefined);

  // Fermé, et désépinglé avec : il se rouvre, sans réécrire un corps qui n'a pas changé.
  premier.ouverte = false;
  premier.epinglee = false;
  assert.deepEqual(await tableau.rafraichir(apres(1)), { numero: 1, gestes: ["rouvert", "epingle"] });
  assert.equal(issues.get(1)?.ouverte, true);
  assert.deepEqual(dites.slice(1), [`brigade : Kitchen board #1 de ${DEPOT} fermé — rouvert`]);

  // Supprimé (ou transféré ailleurs : le client ne le trouve plus ici) : il se recrée.
  issues.delete(1);
  assert.deepEqual(await tableau.rafraichir(apres(2)), { numero: 2, gestes: ["recree", "epingle"] });
  assert.deepEqual(dites.slice(2), [`brigade : Kitchen board #1 disparu de ${DEPOT} — recréé en #2`]);
  assert.deepEqual(await tableau.rafraichir(apres(3)), { numero: 2, gestes: [] });
  assert.equal(dites.length, 3);
  assert.deepEqual(ecritures.map(({ geste, numero }) => `${geste} #${numero}`), ["creer #1", "epingler #1", "rouvrir #1", "epingler #1", "creer #2", "epingler #2"]);
});

test("fermé quand le runtime redémarre, le tableau se retrouve par son label et se rouvre — un fermé ne passe pas devant un ouvert", async (t) => {
  const { publier, issues, ecritures } = publication(t);
  await publier().rafraichir(LU_LE);
  const premier = issues.get(1);
  assert.ok(premier !== undefined);
  premier.ouverte = false;
  assert.deepEqual(await publier().rafraichir(apres(1)), { numero: 1, gestes: ["rouvert"] });
  // Une issue au label, sans le bloc ni le titre du tableau, n'en est pas un.
  issues.set(9, { numero: 9, ouverte: true, titre: "About the label", corps: "nothing", labels: [LABEL_DU_TABLEAU], epinglee: false });
  assert.deepEqual(await publier().rafraichir(apres(2)), { numero: 1, gestes: [] });
  assert.deepEqual(ecritures.map(({ geste }) => geste), ["creer", "epingler", "rouvrir"]);
});

test("l'épinglage refusé n'empêche pas le corps de s'écrire : il se dit une fois, et se retente une heure après", async (t) => {
  // Une cuisine figée à l'heure de l'exemple : en une heure, rien d'autre que l'épinglage n'a à s'écrire.
  const fige = exemple(t);
  const { publier, issues, pannes, avertis, lectures } = publication(t, () => fige(LU_LE));
  pannes.epingler = true;
  const tableau = publier();
  assert.deepEqual(await tableau.rafraichir(LU_LE), { numero: 1, gestes: ["cree"] });
  assert.equal(issues.get(1)?.epinglee, false);
  assert.equal(avertis.length, 1);
  assert.match(avertis[0] ?? "", /Kitchen board #1 de acme\/brigade non épinglé, réessayé dans une heure — .*Resource not accessible/);
  await tableau.rafraichir(apres(1));
  assert.equal(avertis.length, 1);
  assert.equal(lectures.filter((lecture) => lecture.startsWith("epingle")).length, 1);
  pannes.epingler = false;
  assert.deepEqual(await tableau.rafraichir(new Date(LU_LE.getTime() + VERIFIER_L_EPINGLE_MS)), { numero: 1, gestes: ["epingle"] });
  assert.equal(issues.get(1)?.epinglee, true);
});

// Le runtime lui-même, sous une horloge de test : ses minuteries sont celles
// de `mock.timers`, et c'est son tick, à la minute, qui rafraîchit le tableau.
test("branché au runtime : le tableau naît au démarrage, un tick sans changement n'écrit rien, un changement est publié au tick suivant — dans la minute", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let instant = Date.parse("2026-10-08T10:00:00.000Z");
  const maintenant = () => new Date(instant);
  const runtime = demarrer({ repertoireEtat: repertoireTemporaire(t), projet: "brigade", maintenant });
  aArreter(t, () => runtime.arreter("SIGTERM"));
  const { client, issues, ecritures, lectures } = fauxClient();
  const avertis: string[] = [];
  brancherLeTableau(runtime, { client, depot: DEPOT, maintenant, dire: () => {}, avertir: (ligne) => avertis.push(ligne) });
  await jusqua(() => ecritures.length === 2);
  assert.deepEqual(ecritures.map(({ geste }) => geste), ["creer", "epingler"]);

  // Une minute sans rien de neuf : le tick relit le tableau, et n'écrit rien.
  const lu = lectures.length;
  instant += MINUTE;
  t.mock.timers.tick(MINUTE);
  await jusqua(() => lectures.length > lu);
  await new Promise((resoudre) => setImmediate(resoudre));
  assert.equal(ecritures.length, 2);

  // Une station s'annonce : au tick qui suit — une minute au plus —, le corps la porte.
  runtime.journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "station.announced", payload: { station: "box/claude", engine: "claude", provides: ["opus"], maxCooks: 2 } });
  instant += MINUTE;
  t.mock.timers.tick(MINUTE);
  await jusqua(() => ecritures.length === 3);
  assert.deepEqual(ecritures[2], { geste: "ecrire", numero: 1 });
  const publie = lireLeTableau(issues.get(1)?.corps ?? "");
  assert.ok(publie.lu);
  assert.deepEqual(publie.tableau.cuisine.stations.map(({ station }) => station), ["box/claude"]);
  assert.equal(publie.genereLe, new Date(instant).toISOString());
  assert.deepEqual(avertis, []);
});

// Ce que la box publie d'elle-même, sans lecture donnée : les faits du rail comme `facts` les rend
// pour le dépôt du tableau — l'adresse des issues, la correction proposée que le journal porte, et
// le refus que la station de la machine dit du projet, sur ses stations d'ici.
test("branché au runtime : le tableau publié porte les faits du rail, les cartes proposées du journal et le refus de la station de la machine", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const instant = Date.parse("2026-10-08T10:00:00.000Z");
  const maintenant = () => new Date(instant);
  const runtime = demarrer({ repertoireEtat: repertoireTemporaire(t), projet: "brigade", maintenant });
  aArreter(t, () => runtime.arreter("SIGTERM"));
  const noter = (fait: object, ticket: number | null = null) => runtime.journal.ajouter({ project: "brigade", ticket, author: "runtime", ...fait } as never);
  noter({ type: "ticket.arrived", payload: { title: "Rail view", priority: 2, createdAt: "2026-10-01T00:00:00Z", url: "https://github.com/acme/brigade/issues/7" } }, 7);
  noter({ type: "station.announced", payload: { station: "box/claude", engine: "claude", provides: ["opus"], maxCooks: 2 } });
  const diff = ["--- a/CLAUDE.md", "+++ b/CLAUDE.md", "@@ -1,1 +1,2 @@", " # Projet", "+- une consigne de plus", ""].join("\n");
  noter({ type: "correction.proposed", payload: { candidate: 3, cause: "criteres", title: "contradictory criteria", tickets: [9], run: "correctif-3-0000", tokens: 12, reason: "Les cooks devinaient.", diff, files: ["CLAUDE.md"], base: "abc1234" } });
  const station = repertoireTemporaire(t);
  annoncerEnService(station, () => ({ servis: [], refuses: { brigade: "sa porte n'est pas ouverte" }, causes: { brigade: "door-not-open" } }), { version: "1.2.0", pid: 4242 })();
  const { client, issues, ecritures } = fauxClient();
  brancherLeTableau(runtime, { client, depot: DEPOT, maintenant, station, dire: () => {}, avertir: () => {} });
  await jusqua(() => ecritures.length === 2);
  const publie = lireLeTableau(issues.get(1)?.corps ?? "");
  assert.ok(publie.lu);
  const faits = publie.tableau.faits as FaitsDuTableau;
  assert.deepEqual(faits.rail.map(({ ticket, etat, titre, url }) => ({ ticket, etat, titre, url })), [{ ticket: 7, etat: "en attente", titre: "Rail view", url: "https://github.com/acme/brigade/issues/7" }]);
  assert.deepEqual(publie.tableau.lignesDuRail?.map(({ ticket, priorite }) => ({ ticket, priorite })), [{ ticket: 7, priorite: 2 }]);
  assert.deepEqual(faits.corrections?.map(({ tickets }) => tickets), [[{ ticket: 9, url: `https://github.com/${DEPOT}/issues/9` }]]);
  assert.deepEqual(faits.stations.map(({ station: nom, cuisson, refus }) => [nom, cuisson, refus?.code]), [["box/claude", "refused", "door-not-open"]]);
});

test("branché au runtime : GitHub injoignable se dit une fois, pas à chaque tick, et le tableau se publie quand il revient", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let instant = Date.parse("2026-10-08T10:00:00.000Z");
  const maintenant = () => new Date(instant);
  const runtime = demarrer({ repertoireEtat: repertoireTemporaire(t), projet: "brigade", maintenant });
  aArreter(t, () => runtime.arreter("SIGTERM"));
  const { client, ecritures, lectures, pannes } = fauxClient();
  pannes.lecture = true;
  const avertis: string[] = [];
  brancherLeTableau(runtime, { client, depot: DEPOT, maintenant, dire: () => {}, avertir: (ligne) => avertis.push(ligne) });
  await jusqua(() => avertis.length === 1);
  assert.equal(avertis[0], `brigade : Kitchen board de ${DEPOT} non rafraîchi — gh api : connexion impossible`);
  for (let tick = 1; tick <= 3; tick++) {
    const lu = lectures.length;
    instant += MINUTE;
    t.mock.timers.tick(MINUTE);
    await jusqua(() => lectures.length > lu);
    // La lecture est partie, l'échec ne s'est pas encore dit : le faux client
    // n'attend rien, son refus est réglé quand les micro-tâches sont vidées.
    await new Promise((resoudre) => setImmediate(resoudre));
  }
  assert.equal(avertis.length, 1);
  pannes.lecture = false;
  instant += MINUTE;
  t.mock.timers.tick(MINUTE);
  await jusqua(() => ecritures.length === 2);
  assert.equal(avertis.length, 1);
});
