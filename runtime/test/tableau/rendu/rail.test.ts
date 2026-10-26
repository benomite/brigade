// Ce que le tableau de la cuisine porte pour la vue du rail d'un projet (#1693) :
// bâti d'un projet d'exemple — l'état d'exemple de `status`, une carte de TODO et
// une correction proposée par-dessus —, son bloc machine dit, pour chaque ticket,
// son état et ce que sa carte dessine, les cooks en cours, et ce qui attend le
// chef. Trop long pour GitHub, il retire du bloc le moins utile d'abord, et le dit.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { entrerDansTodo } from "../../../src/carte-todo.ts";
import { cartesDeCorrection } from "../../../src/correctif/cartes.ts";
import { decrireEtat, faits, lireEtat } from "../../../src/etat.ts";
import { ouvrirJournal } from "../../../src/journal.ts";
import { contenuDuCorps } from "../../../src/tableau/publication/publier.ts";
import { lireLeTableau, type LigneDuRail, type Tableau } from "../../../src/tableau/rendu/bloc.ts";
import { tableauDeLaCuisine, type FaitsDuTableau } from "../../../src/tableau/rendu/donnees.ts";
import { LONGUEUR_MAX_DU_CORPS, rendreLeTableau } from "../../../src/tableau/rendu/rendre.ts";
import { LU_LE } from "../../aides/haut-de-status.ts";
import { copieDeLExempleDuBas } from "../../aides/opt-A-etat.ts";
import { aArreter } from "../../outils.ts";

const DEPOT = "acme/brigade";
const GENERE_LE = new Date("2026-10-12T10:04:30.000Z");
const DIFF = ["--- a/CLAUDE.md", "+++ b/CLAUDE.md", "@@ -1,1 +1,2 @@", " # Projet", "+- **Critères** : un ticket incomplet se dit dans le compte-rendu.", ""].join("\n");

// Le projet d'exemple : l'état du bas de `status`, une question de produit posée
// sur #24, et une correction des consignes proposée — écrites à 10:03, avant la
// lecture. Le tableau en est bâti comme la box le bâtit, et relu de son corps.
function projet(t: TestContext) {
  const journal = ouvrirJournal(copieDeLExempleDuBas(t), { maintenant: () => new Date("2026-10-12T10:03:00.000Z") });
  aArreter(t, () => journal.fermer());
  entrerDansTodo(journal, "brigade", 24, { type: "product", enonce: "One list per project, or one for all?", choix: [{ texte: "One per project." }, { texte: "One for all.", suite: "resume" }] }, "manager");
  journal.ajouter({
    project: "brigade",
    ticket: null,
    author: "runtime",
    type: "correction.proposed",
    payload: { candidate: 7, cause: "criteres", title: "contradictory criteria", tickets: [32, 33], run: "correctif-7-0000", tokens: 4321, reason: "Les cooks devinaient.", diff: DIFF, files: ["CLAUDE.md"], base: "abc1234" },
  });
  const etat = lireEtat(journal, LU_LE);
  const tableau = tableauDeLaCuisine(etat, LU_LE, { depot: DEPOT, corrections: cartesDeCorrection(journal, DEPOT) });
  const lu = lireLeTableau(rendreLeTableau(tableau, GENERE_LE));
  assert.ok(lu.lu, lu.lu ? "" : lu.raison);
  return { etat, status: decrireEtat(etat, LU_LE), tableau, publie: lu.tableau, faits: lu.tableau.faits as FaitsDuTableau };
}

test("pour chaque ticket du rail, le tableau publié porte son état et ce que sa carte dessine : les faits de `facts`, sa priorité et sa ligne de `status`", (t) => {
  const { etat, status, publie, faits: publies } = projet(t);
  // Les faits sont ceux que `facts` rend, champ pour champ, pour le même dépôt.
  assert.deepEqual(publies.rail, faits(etat, LU_LE, DEPOT).rail);
  assert.deepEqual(publies.rail.map(({ ticket }) => ticket), etat.rail.map(({ ticket }) => ticket));
  assert.deepEqual(publie.lignesDuRail?.map(({ ticket }) => ticket), etat.rail.map(({ ticket }) => ticket));
  for (const ticket of etat.rail) {
    const fait = publies.rail.find((sien) => sien.ticket === ticket.ticket);
    const ligne: LigneDuRail | undefined = publie.lignesDuRail?.find((sienne) => sienne.ticket === ticket.ticket);
    assert.deepEqual([fait?.titre, fait?.url], [ticket.title, ticket.url], `#${ticket.ticket} : titre et adresse`);
    assert.equal(typeof fait?.etat, "string", `#${ticket.ticket} : son état`);
    assert.equal(ligne?.priorite, ticket.priority, `#${ticket.ticket} : sa priorité`);
    // Sa ligne, mot pour mot comme `status` l'écrit sous la ligne `rail`.
    assert.ok(ligne !== undefined && status.includes(ligne.ligne), `#${ticket.ticket} : ${ligne?.ligne}`);
  }
  const de = (numero: number) => publies.rail.find(({ ticket }) => ticket === numero);
  const ligneDe = (numero: number) => publie.lignesDuRail?.find(({ ticket }) => ticket === numero);
  // Les colonnes : en attente, pris, en pass, mis de côté, en attente d'un tiers, servi — et ce que chaque carte en dit.
  assert.deepEqual([de(30)?.etat, de(30)?.raison, ligneDe(30)?.priorite], ["en attente", "machine saturated", 0]);
  assert.match(ligneDe(30)?.ligne ?? "", /^ {2}#30 {2}queued {2}prio:0 {2}machine saturated/);
  assert.deepEqual([de(31)?.etat, de(31)?.activite?.fait, de(31)?.activite?.cible], ["pris", "lit", "runtime/src/etat.ts"]);
  assert.match(ligneDe(23)?.ligne ?? "", /by box\/claude since 5 min, STUCK: no progress since 5 min, lease 5 min left/);
  assert.equal(de(17)?.etat, "en pass");
  assert.equal(de(19)?.etat, "BLOQUÉ");
  assert.deepEqual(de(25)?.attente, { raison: "attend : quota du compte épuisé", colonne: "86", retour: "2026-10-12T15:00:00.000Z" });
  assert.deepEqual([de(35)?.tiers?.quoi, de(35)?.tiers?.qui], ["the customer's answer", "the customer"]);
  assert.equal(de(41)?.etat, "servi");
  assert.equal(ligneDe(18)?.priorite, null);
  assert.match(ligneDe(18)?.ligne ?? "", /^ {2}#18 {2}86 {2}- {2}since 2 h 04 \(pass:returns-exhausted\)/);
  // L'état du projet et ses compteurs, comme `facts` les donne.
  assert.equal(publies.etat, "retenue");
  assert.deepEqual(publies.compteurs, faits(etat, LU_LE, DEPOT).compteurs);
  assert.deepEqual(publies.livres.map(({ ticket }) => ticket), [40, 41]);
});

test("le tableau publié porte les cooks en cours — quel ticket, quel cook, sur quelle station — et ce qui attend le chef, cartes comprises", (t) => {
  const { etat, publie, faits: publies } = projet(t);
  // Les cooks : le ticket et la station dans les faits, le cook (son run) dans l'état de la cuisine.
  assert.deepEqual(publies.cooks, [
    { ticket: 31, titre: "Holds the zone", station: "box/claude" },
    { ticket: 23, titre: "Ticket 23", station: "box/claude" },
  ]);
  assert.deepEqual(
    publie.cuisine.cooks.map(({ ticket, run, station }) => ({ ticket, run, station })),
    [
      { ticket: 31, run: "31-aa", station: "box/claude" },
      { ticket: 23, run: "23-bb", station: "box/claude" },
      { ticket: null, run: "juge-9-cc", station: null },
    ],
  );
  assert.deepEqual(publies.stations.map(({ station, cuisson, cooks }) => ({ station, cuisson, cooks: cooks.map(({ ticket }) => ticket) })), [{ station: "box/claude", cuisson: "saturated", cooks: [31, 23] }]);

  // Ce qui attend le chef : chaque ticket nommé, avec sa décision — la carte de #24 avec sa question et ses choix.
  assert.deepEqual(
    publies.attend.map(({ ticket, decision }) => [ticket, decision.quoi]),
    [
      [18, "remontee"],
      [19, "bloque"],
      [24, "carte"],
    ],
  );
  const carte = publies.attend.find(({ ticket }) => ticket === 24)?.carte;
  assert.deepEqual(carte, {
    type: "product",
    question: "One list per project, or one for all?",
    choix: [
      { texte: "One per project.", suite: "resume" },
      { texte: "One for all.", suite: "resume" },
    ],
    captures: null,
  });
  assert.equal(publies.attend.find(({ ticket }) => ticket === 24)?.url, "https://exemple.test/24");
  // La file, avec ce qui n'est à aucun ticket : le disjoncteur, le setup, la connexion Max.
  assert.deepEqual(
    publie.file.map(({ nom, quoi }) => [nom, quoi]),
    [
      ["#18", "remontee"],
      ["#19", "bloque"],
      ["breaker", "disjoncteur"],
      ["setup", "setup"],
      ["box/claude", "connexion"],
      ["#24", "carte"],
    ],
  );
  // La correction proposée, carte de TODO qui n'est à aucun ticket.
  assert.deepEqual(
    publies.corrections?.map(({ cause, tickets, diff }) => ({ cause, tickets, diff })),
    [{ cause: "criteres", tickets: [{ ticket: 32, url: `https://github.com/${DEPOT}/issues/32` }, { ticket: 33, url: `https://github.com/${DEPOT}/issues/33` }], diff: DIFF }],
  );
  assert.equal(publies.profils, undefined);
  // L'urgence et les décisions qui retiennent des tickets, comme `facts` les dit.
  const deFacts = faits(etat, LU_LE, DEPOT);
  assert.deepEqual([publies.urgence, publies.retenues], [deFacts.urgence, deFacts.retenues]);
  assert.ok(publies.retenues.length > 0);
});

test("les champs publiés avant la vue du rail sont toujours là, inchangés : la vue du rail s'y ajoute sans changer la version", (t) => {
  const { etat, tableau, publie } = projet(t);
  assert.deepEqual(Object.keys(publie), ["projet", "lu", "file", "bilans", "cuisine", "faits", "lignesDuRail"]);
  const { faits: _faits, lignesDuRail: _lignes, ...avant } = tableau;
  const sansCartes = tableauDeLaCuisine(etat, LU_LE);
  assert.deepEqual(avant, { projet: sansCartes.projet, lu: sansCartes.lu, file: sansCartes.file, bilans: sansCartes.bilans, cuisine: sansCartes.cuisine });
  assert.ok(rendreLeTableau(tableau, GENERE_LE).includes('{"version":1,'));
});

// Un tableau dont les faits ne tiennent pas dans une issue : une livraison servie
// dont la relecture est longue, une décision dont la livraison l'est aussi.
function trop(tableau: Tableau, relecture: number, livraison: number): Tableau {
  const lesFaits = tableau.faits as FaitsDuTableau;
  const [livre] = lesFaits.livres;
  const [attente] = lesFaits.attend;
  assert.ok(livre !== undefined && attente !== undefined);
  return {
    ...tableau,
    faits: {
      ...lesFaits,
      livres: [{ ...livre, relecture: { resume: "r".repeat(relecture), constats: [] } }, ...lesFaits.livres.slice(1)],
      attend: [{ ...attente, livraison: { resume: "l".repeat(livraison), constat: null, fichiersDeJuges: [] } as never }, ...lesFaits.attend.slice(1)],
    },
  };
}

test("trop long pour GitHub, le corps retire du bloc les relectures des livrés d'abord, puis les livraisons qui attendent, et le dit dans `resserre`", (t) => {
  const { tableau } = projet(t);
  // Les relectures seules le font déborder : elles partent, la livraison qui attend reste.
  const corps = rendreLeTableau(trop(tableau, LONGUEUR_MAX_DU_CORPS, 10), GENERE_LE);
  assert.ok(corps.length <= LONGUEUR_MAX_DU_CORPS, `${corps.length}`);
  const lu = lireLeTableau(corps);
  assert.ok(lu.lu);
  assert.deepEqual(lu.tableau.resserre, ["faits.livres.relecture"]);
  const faitsLus = lu.tableau.faits as FaitsDuTableau;
  assert.ok(faitsLus.livres.every((livre) => !("relecture" in livre)));
  assert.equal(faitsLus.attend[0]?.livraison?.resume, "l".repeat(10));
  assert.ok(corps.includes("Shortened to fit in an issue"));
  // Relu et rendu, le corps resserré redonne le même : il ne se réécrit pas à chaque tick.
  assert.equal(rendreLeTableau(lu.tableau, GENERE_LE), corps);
  assert.notEqual(contenuDuCorps(corps), null);

  // Les deux à la fois : les deux partent, dans cet ordre ; le reste des faits demeure.
  const lesDeux = lireLeTableau(rendreLeTableau(trop(tableau, LONGUEUR_MAX_DU_CORPS, LONGUEUR_MAX_DU_CORPS), GENERE_LE));
  assert.ok(lesDeux.lu);
  assert.deepEqual(lesDeux.tableau.resserre, ["faits.livres.relecture", "faits.attend.livraison"]);
  assert.deepEqual((lesDeux.tableau.faits as FaitsDuTableau).rail, (tableau.faits as FaitsDuTableau).rail);
  assert.deepEqual(lesDeux.tableau.lignesDuRail, tableau.lignesDuRail);

  // Un tableau qui tient n'a rien de resserré.
  const entier = lireLeTableau(rendreLeTableau(tableau, GENERE_LE));
  assert.ok(entier.lu);
  assert.equal(entier.tableau.resserre, undefined);
});

test("en dernier recours, le corps retire les faits et les lignes du rail entiers : la file et l'état de la cuisine, eux, restent", (t) => {
  const { tableau } = projet(t);
  // Un rail que rien d'autre que lui ne fait déborder : ses titres, dans les faits comme dans les lignes.
  const lesFaits = tableau.faits as FaitsDuTableau;
  const long = "t".repeat(4_000);
  const gros: Tableau = { ...tableau, faits: { ...lesFaits, rail: lesFaits.rail.map((ticket) => ({ ...ticket, titre: long })) }, lignesDuRail: tableau.lignesDuRail?.map((ligne) => ({ ...ligne, ligne: `${ligne.ligne}${long}` })) };
  const corps = rendreLeTableau(gros, GENERE_LE);
  assert.ok(corps.length <= LONGUEUR_MAX_DU_CORPS, `${corps.length}`);
  const lu = lireLeTableau(corps);
  assert.ok(lu.lu);
  // Chaque étape qui a eu quelque chose à retirer, dans l'ordre : aucune décision de l'exemple n'a de livraison.
  assert.deepEqual(lu.tableau.resserre, ["faits.livres.relecture", "faits.corrections.diff", "faits", "lignesDuRail"]);
  assert.equal(lu.tableau.faits, undefined);
  assert.equal(lu.tableau.lignesDuRail, undefined);
  assert.deepEqual(lu.tableau.file, tableau.file);
  assert.deepEqual(lu.tableau.cuisine, tableau.cuisine);
  assert.equal(rendreLeTableau(lu.tableau, GENERE_LE), corps);
});
