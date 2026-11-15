// Le disjoncteur de la station qui sert le projet (#3658) : « the kitchen is
// resumed » ne se dit que de l'issue de cette station, quand son disjoncteur est
// fermé ; et la file du chef dit le disjoncteur ouvert de l'autre, depuis quand,
// au lieu d'une cause inconnue.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { corpsDeLIssue, disjoncteurDuJournal, LABEL_DU_DISJONCTEUR, marque, publieurDuDisjoncteur, publierLeDisjoncteur, type ClientDuDisjoncteur, type Disjoncteur } from "../../src/breaker-issue.ts";
import { decrireEtat, lireEtat } from "../../src/etat.ts";
import type { SuiviDuDisjoncteurServant } from "../../src/file-chef/cause-arret.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { brancherRetenue } from "../../src/retenue/brancher.ts";
import type { CauseReveil, Runtime } from "../../src/runtime.ts";
import { repertoireTemporaire } from "../outils.ts";

const PROJET = "brigade";
const BOX = "box/claude";
const MAC = "mac/claude";
const OUVERTURE = "2026-11-15T19:10:00.000Z";
const A = (hhmmss: string) => `2026-11-15T${hhmmss}.000Z`;

const OUVERT: Extract<Disjoncteur, { ouvert: true }> = { ouvert: true, depuis: OUVERTURE, ticket: 3644, code: 1, erreur: null, echecs: [], seuil: 3 };
const FERME: Disjoncteur = { ouvert: false, reprisLe: null };

// GitHub tel que le disjoncteur le voit : une issue ouverte par la box, et ce qu'on y écrit.
function githubAvecUneIssueDe(station: string | null) {
  const gestes: string[] = [];
  let ouverte = true;
  const corps = corpsDeLIssue(PROJET, OUVERT, station);
  const client: ClientDuDisjoncteur = {
    async ouvertesAuLabel(label) {
      return ouverte && label === LABEL_DU_DISJONCTEUR ? [{ numero: 3644, corps }] : [];
    },
    async assurerLabel() {},
    async creer() {
      gestes.push("creer");
      return 1;
    },
    async commenter(numero, texte) {
      gestes.push(`commenter #${numero}: ${texte}`);
    },
    async fermer(numero) {
      gestes.push(`fermer #${numero}`);
      ouverte = false;
    },
  };
  return { client, gestes, corps };
}

test("le disjoncteur d'ici est fermé, celui de la station qui sert le projet est ouvert : aucun commentaire « resumed », l'issue reste ouverte", async () => {
  const github = githubAvecUneIssueDe(BOX);
  assert.match(github.corps, new RegExp(`brigade:breaker-station name=${BOX}`));
  assert.ok(github.corps.includes(marque(PROJET)));

  const numero = await publierLeDisjoncteur(github.client, PROJET, FERME, { station: MAC });
  assert.equal(numero, null);
  assert.deepEqual(github.gestes, []);
});

test("le disjoncteur de la station qui sert le projet est fermé : le commentaire « resumed » est écrit, puis l'issue se ferme", async () => {
  const github = githubAvecUneIssueDe(BOX);
  assert.match(github.corps, /^<!-- brigade:breaker-station name=box\/claude -->$/m);
  await publierLeDisjoncteur(github.client, PROJET, { ouvert: false, reprisLe: A("20:21:00") }, { station: BOX });
  assert.equal(github.gestes.length, 2);
  assert.match(github.gestes[0] ?? "", /^commenter #3644: The `brigade` kitchen is resumed \(2026-11-15T20:21:00.000Z\): its breaker is closed/);
  assert.equal(github.gestes[1], "fermer #3644");

  // Une issue d'avant le repère de station est reprise par toute station, comme avant.
  const ancienne = githubAvecUneIssueDe(null);
  assert.doesNotMatch(ancienne.corps, /brigade:breaker-station/);
  await publierLeDisjoncteur(ancienne.client, PROJET, FERME, { station: MAC });
  assert.equal(ancienne.gestes.length, 2);
});

// Une cuisine dont le test tient l'horloge : un ticket qui attend depuis minuit, la retenue branchée.
function cuisine(t: TestContext, autre: SuiviDuDisjoncteurServant) {
  let instant = A("00:00:00");
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: () => new Date(instant) });
  t.after(() => journal.fermer());
  journal.ajouter({ project: PROJET, ticket: null, author: "runtime", type: "runtime.started", payload: { pid: 1, host: "mac", node: "26.0.0" } });
  journal.ajouter({
    project: PROJET,
    ticket: 12,
    author: "github",
    type: "ticket.arrived",
    payload: { title: "Ticket 12", priority: null, createdAt: "2026-11-01T00:00:12Z", url: "https://exemple.test/12", card: { waitsFor: [], zone: ["zone-12"], problems: [] } },
  });
  const ecouteurs: Array<(cause: CauseReveil) => void> = [];
  const runtime: Runtime = { projet: PROJET, journal, surReveil: (ecouter) => (ecouteurs.push(ecouter), () => {}), arreter: () => {} };
  brancherRetenue(runtime, { disjoncteurServant: autre, maintenant: () => new Date(instant), dire: () => {} });
  const passer = (hhmmss: string) => {
    instant = A(hhmmss);
    for (const ecouter of ecouteurs) ecouter("tick");
  };
  const file = () => decrireEtat(lireEtat(journal, new Date(instant)), new Date(instant)).filter((ligne) => /^ {2}kitchen {2}for /.test(ligne));
  return { journal, passer, file };
}

test("le disjoncteur de la station qui sert le projet est ouvert : la file du chef dit qu'il est ouvert et depuis quand, jamais « cause unknown »", async (t) => {
  const github = githubAvecUneIssueDe(BOX);
  const autre: SuiviDuDisjoncteurServant = { depuis: null };
  const c = cuisine(t, autre);
  // Le publieur d'ici, au disjoncteur fermé, lit l'issue de la box.
  assert.equal(disjoncteurDuJournal(c.journal.base).ouvert, false);
  const publieur = publieurDuDisjoncteur(c.journal.base, PROJET, { client: github.client, station: MAC, autre });
  await publieur.passer("tick");
  assert.equal(autre.depuis, OUVERTURE);

  c.passer("01:00:00");
  const [ligne, ...autres] = c.file();
  assert.equal(autres.length, 0);
  assert.match(ligne ?? "", new RegExp(`cause: the breaker is open since ${new Date(OUVERTURE).getHours().toString().padStart(2, "0")}:${new Date(OUVERTURE).getMinutes().toString().padStart(2, "0")}, no cook leaves`));
  assert.doesNotMatch(ligne ?? "", /cause unknown/);
  assert.deepEqual(github.gestes, []);
});

test("l'autre disjoncteur refermé : au tick suivant la file ne le dit plus", async (t) => {
  const github = githubAvecUneIssueDe(BOX);
  const autre: SuiviDuDisjoncteurServant = { depuis: null };
  const c = cuisine(t, autre);
  const publieur = publieurDuDisjoncteur(c.journal.base, PROJET, { client: github.client, station: MAC, autre });
  await publieur.passer("tick");
  assert.equal(autre.depuis, OUVERTURE);
  // La box reprend et ferme son issue.
  await github.client.fermer(3644);
  await publieur.passer("tick");
  assert.equal(autre.depuis, null);
  c.passer("01:00:00");
  assert.match(c.file()[0] ?? "", /cause unknown/);
});
