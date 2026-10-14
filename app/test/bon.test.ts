// Ce qu'un bon du rail porte : ce que la file dit déjà du ticket — who holds it, since when,
// its lease, what it burns, what blocks it — et, chose par chose, ce qu'elle n'en dit pas.
// La ligne lue est celle que le runtime écrit sous `rail`, dans `status` : elle est tenue ici
// contre le runtime lui-même, qui écrit `status` et `faits` du même état. Une ligne qui n'a
// pas la forme attendue n'est jamais devinée : elle est relayée telle quelle.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { decrireEtat, faits as faitsDuRuntime, lireEtat, type EtatCuisine } from "../../runtime/src/etat.ts";
import { ouvrirJournal } from "../../runtime/src/journal.ts";
import type { TicketRail } from "../../runtime/src/projections/rail.ts";
import { mettreAPart } from "../src/attend.ts";
import { lignesDuRail, porter } from "../src/bon.ts";
import { comprendre, rail, type Carte, type Faits } from "../src/faits.ts";

const MAINTENANT = new Date("2026-10-13T10:00:00.000Z");
const ilYA = (minutes: number) => new Date(MAINTENANT.getTime() - minutes * 60_000).toISOString();
const dans = (minutes: number) => ilYA(-minutes);
const tokens = (combien: number) => `${combien.toLocaleString("en-US")} tokens at the last reading`;

// L'état d'une cuisine vide, lu comme le runtime le lit — puis un rail posé dessus.
function etatVide(): EtatCuisine {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-app-bon-"));
  const journal = ouvrirJournal(repertoire);
  try {
    return lireEtat(journal, MAINTENANT);
  } finally {
    journal.fermer();
    rmSync(repertoire, { recursive: true, force: true });
  }
}
const ticket = (numero: number, state: TicketRail["state"], reste: Partial<TicketRail> = {}): TicketRail => ({
  ticket: numero,
  title: `Ticket ${numero}`,
  priority: null,
  createdAt: ilYA(600),
  url: `https://github.com/benomite/brigade/issues/${numero}`,
  state,
  since: ilYA(12),
  station: null,
  leaseUntil: null,
  progressedAt: null,
  model: null,
  effort: null,
  card: null,
  awaits: [],
  held: [],
  frozenBy: [],
  reason: null,
  until: null,
  waitingFor: null,
  ...reste,
});

// Un rail de chaque sorte, tel que le runtime le tient.
const RAIL: TicketRail[] = [
  // Pris, et il avance : sa station, la prise, le bail.
  ticket(14, "taken", { priority: 1, station: "box/claude", since: ilYA(12), progressedAt: ilYA(3), leaseUntil: dans(27) }),
  // Pris, et il coince : la moitié du bail est passée sans progrès.
  ticket(15, "taken", { station: "mac/claude", since: ilYA(40), progressedAt: ilYA(20), leaseUntil: dans(10) }),
  // Pris, bail échu.
  ticket(16, "taken", { station: "box/claude", since: ilYA(90), progressedAt: ilYA(35), leaseUntil: ilYA(5) }),
  // En attente : rien ne le retient.
  ticket(20, "waiting", { since: ilYA(3) }),
  // En attente : sa zone est tenue.
  ticket(21, "waiting", { priority: 2, since: ilYA(125), held: [{ ticket: 14, path: "app/src" }] }),
  // En attente : il en attend d'autres, et sa zone est tenue.
  ticket(22, "waiting", { since: ilYA(60 * 50), awaits: [{ ticket: 14, left: null }, { ticket: 15, left: null }], held: [{ ticket: 16, path: "runtime/src — vue" }] }),
  // BLOQUÉ : ce qu'il attendait a été abandonné.
  ticket(23, "waiting", { since: ilYA(182), awaits: [{ ticket: 17, left: { reason: "unfired", seq: 4 } }] }),
  ticket(30, "pass", { since: ilYA(4), station: "box/claude" }),
  ticket(31, "served", { since: ilYA(60), station: "mac/claude" }),
  ticket(40, "86", { since: ilYA(5), reason: "setup-failed", until: dans(5) }),
];

// Ce que la box rend de cet état, par ses deux lectures : `status`, du texte, et `faits`, la forme.
function lectures(etat: EtatCuisine): { status: string; faits: Faits } {
  const status = `${decrireEtat(etat, MAINTENANT).join("\n")}\n`;
  const compris = comprendre(JSON.stringify(faitsDuRuntime(etat, MAINTENANT, "benomite/brigade")));
  assert.ok(!("informe" in compris), "le runtime ne rend plus la forme que l'app comprend");
  return { status, faits: compris };
}
const ETAT: EtatCuisine = {
  ...etatVide(),
  rail: RAIL,
  // Ce que la cuisine fait de chacun, tel que le runtime le lit au journal : #16 n'en dit rien.
  activites: new Map([
    [14, { fait: "lit", cible: "runtime/src/etat.ts", depuis: ilYA(2) }],
    [15, { fait: "lance les tests", cible: null, depuis: ilYA(20) }],
    [16, null],
    [30, { fait: "relecture en cours", cible: null, depuis: ilYA(1) }],
  ]),
  auxFourneaux: [
    { station: "box/claude", ticket: 14 },
    { station: "mac/claude", ticket: 15 },
    { station: "box/claude", ticket: 16 },
    { station: "box/claude", ticket: null },
  ],
  miseEnService: {
    demande: null,
    enVol: [
      { run: "16-aaaa0000", ticket: 16, station: "box/claude", launchedAt: ilYA(90), tokens: 1_204_500, measuredAt: ilYA(1) },
      { run: "15-bbbb1111", ticket: 15, station: "mac/claude", launchedAt: ilYA(40), tokens: null, measuredAt: null },
      { run: "14-3f9a01bc", ticket: 14, station: "box/claude", launchedAt: ilYA(12), tokens: 230_000, measuredAt: ilYA(1) },
      { run: "manager-cccc", ticket: null, station: null, launchedAt: ilYA(1), tokens: 9_000, measuredAt: ilYA(1) },
    ],
  },
};

// Le rail que l'app en dessine, de bout en bout : la sortie de `status`, son bloc mis à part, et `faits`.
function dessine(etat: EtatCuisine = ETAT) {
  const { status, faits } = lectures(etat);
  const montree = mettreAPart({ projet: "brigade", demande: 1, a: MAINTENANT.toISOString(), sorties: [{ commande: "status", texte: status }] });
  assert.ok("sorties" in montree && montree.attend !== undefined, "`status` n'a plus le bord que l'app sait prendre");
  const texte = montree.sorties[0]?.texte ?? "";
  return { status, texte, rail: rail(faits, { bloc: montree.attend, a: MAINTENANT.toISOString() }, { texte, a: MAINTENANT.toISOString() }) };
}
const toutes = (dessine: ReturnType<typeof rail>): Carte[] => [...dessine.colonnes.flatMap(({ cartes }) => cartes), ...dessine.hors];
const carteDe = (dessine: ReturnType<typeof rail>, numero: number): Carte => toutes(dessine).find((carte) => carte.ticket === numero) ?? assert.fail(`pas de carte #${numero}`);
const dits = (carte: Carte) => Object.fromEntries(carte.dit.map(({ libelle, valeur }) => [libelle, valeur]));
const NON_COMMUNIQUE = "not given by the queue";

describe("ce qu'un bon porte, tenu contre ce que le runtime écrit", () => {
  const { status, rail: lu } = dessine();

  test("la ligne de chaque ticket est prise sous la ligne `rail` de `status`, et là seulement", () => {
    const lignes = lignesDuRail(status) ?? assert.fail("pas de ligne `rail` dans `status`");

    assert.deepEqual([...lignes.keys()], RAIL.map(({ ticket }) => ticket));
    for (const [numero, [ligne, ...autres]] of lignes) {
      assert.deepEqual(autres, [], `#${numero} a plusieurs lignes`);
      assert.ok(status.split("\n").includes(`  #${numero}  ${ligne}`), `#${numero}`);
    }
    assert.equal(lu.railLu, MAINTENANT.toISOString());
  });

  test("un ticket pris : who holds it, since when, its lease, what it burns — chaque valeur est un morceau de ce que la box a écrit", () => {
    const carte = carteDe(lu, 14);

    assert.deepEqual(carte.dit, [
      { libelle: "right now", valeur: "lit runtime/src/etat.ts, for 2 min" },
      { libelle: "taken by", valeur: "box/claude", exact: true },
      { libelle: "since", valeur: "12 min" },
      { libelle: "lease", valeur: "sans progrès depuis 3 min, bail encore 27 min" },
      { libelle: "burns", valeur: tokens(230_000) },
    ]);
    // Rien ne le bloque d'après la file : c'est écrit, pas mis à « rien ».
    assert.equal(carte.sans, `${NON_COMMUNIQUE} : what blocks it`);
    assert.ok(!("relais" in carte));
    for (const { valeur } of carte.dit.slice(3, 4)) assert.ok(status.includes(valeur), valeur);
  });

  test("un ticket qui coince, un bail échu : le bail le dit avec les mots du runtime", () => {
    assert.deepEqual(dits(carteDe(lu, 15)), { "right now": "lance les tests, for 20 min", "taken by": "mac/claude", since: "40 min", lease: "COINCE : sans progrès depuis 20 min, bail encore 10 min", burns: "no reading yet" });
    assert.deepEqual(dits(carteDe(lu, 16)), { "right now": "activity not given", "taken by": "box/claude", since: "1 h 30", lease: "COINCE : sans progrès depuis 35 min, bail échu depuis 5 min", burns: tokens(1_204_500) });
  });

  test("un ticket en attente : since when, et en clair ce qui le retient — une zone tenue, d'autres tickets, un abandon", () => {
    assert.deepEqual(dits(carteDe(lu, 21)), { since: "2 h 05", "blocked by": "zone tenue par #14 (app/src)" });
    assert.equal(carteDe(lu, 21).sans, `${NON_COMMUNIQUE} : who holds it · its lease · what it burns`);
    // Un chemin qui porte lui-même un tiret long : tout ce que la ligne dit avant « depuis » est gardé.
    assert.deepEqual(dits(carteDe(lu, 22)), { since: "2 j", "blocked by": "attend #14, #15 · zone tenue par #16 (runtime/src — vue)" });
    assert.deepEqual([carteDe(lu, 23).etat, dits(carteDe(lu, 23))], ["BLOQUÉ", { since: "3 h 02", "blocked by": "#17 abandonné (label `fire` retiré)" }]);
    // Rien ne le retient : la file ne dit pas what blocks it, et la carte l'écrit.
    assert.deepEqual(dits(carteDe(lu, 20)), { since: "3 min" });
    assert.equal(carteDe(lu, 20).sans, `${NON_COMMUNIQUE} : who holds it · its lease · what it burns · what blocks it`);
  });

  test("en pass, servi : since when, et qui l'a cuisiné — dit sous son nom, pas comme celui who holds it", () => {
    assert.deepEqual(carteDe(lu, 30).dit, [{ libelle: "right now", valeur: "relecture en cours, for 1 min" }, { libelle: "since", valeur: "4 min" }, { libelle: "cooked by", valeur: "box/claude", exact: true }]);
    assert.deepEqual(dits(carteDe(lu, 31)), { since: "1 h 00", "cooked by": "mac/claude" });
    for (const numero of [30, 31]) assert.equal(carteDe(lu, numero).sans, `${NON_COMMUNIQUE} : who holds it · its lease · what it burns · what blocks it`);
  });

  test("un état que l'app ne sait pas découper — `86` — est relayé tel quel : sa ligne entière, et rien n'en est tiré", () => {
    const carte = carteDe(lu, 40);

    assert.deepEqual(carte.dit, []);
    assert.equal(carte.relais, "86  -  depuis 5 min (setup-failed), retour dans 5 min  Ticket 40");
    assert.ok(status.split("\n").includes(`  #40  ${carte.relais}`));
    assert.equal(carte.sans, "not given by `faits`, and not read by the app in what `status` writes about this ticket, relayed below as is : who holds it · since when · its lease · what it burns · what blocks it");
  });

  test("une carte porte les cinq choses, ou écrit celles qui manquent : aucune n'est omise, sur aucun ticket", () => {
    const CINQ = [["taken by", "who holds it"], ["since", "since when"], ["lease", "its lease"], ["burns", "what it burns"], ["blocked by", "what blocks it"]] as const;
    for (const carte of toutes(lu)) {
      for (const [libelle, tu] of CINQ) {
        const dite = carte.dit.some((fait) => fait.libelle === libelle);
        const tue = (carte.sans ?? "").split(" : ").at(-1)?.split(" · ").includes(tu) === true;
        assert.equal(dite !== tue, true, `#${carte.ticket} : « ${libelle} » ${dite ? "dite et écrite manquante" : "ni dite ni écrite manquante"}`);
      }
    }
  });

  test("la retenue d'une station, dite par `status` quand rien d'autre ne retient le ticket, est what blocks it", () => {
    const sansStation = dessine({ ...ETAT, sansStation: ilYA(30) });

    assert.deepEqual(dits(carteDe(sansStation.rail, 20)), { since: "3 min", "blocked by": "aucune station déclarée" });
  });
});

describe("un ticket qui t'attend", () => {
  test("ce que le bloc `attend` dit de lui est what blocks it : la carte le porte à part, et n'écrit pas qu'il manque", () => {
    const { rail: lu } = dessine({ ...ETAT, attend: [{ ticket: 23, title: "Ticket 23", since: ilYA(182), quoi: "bloque", abandonnes: [{ ticket: 17, reason: "unfired" }] }] });
    const carte = carteDe(lu, 23);

    assert.deepEqual(lu.colonnes[3]?.cartes.map(({ ticket }) => ticket), [23]);
    assert.equal(carte.attendu, true);
    assert.match(carte.attend[0] ?? "", /^depuis 3 h 02 {2}BLOQUÉ : #17 abandonné \(label `fire` retiré\) — à débloquer : /);
    assert.deepEqual(dits(carte), { since: "3 h 02", "blocked by": "#17 abandonné (label `fire` retiré)" });
    assert.equal(carte.sans, `${NON_COMMUNIQUE} : who holds it · its lease · what it burns`);
    // Et il n'est dans aucune autre colonne.
    assert.deepEqual(lu.colonnes.filter(({ cartes }) => cartes.some(({ ticket }) => ticket === 23)).map(({ nom }) => nom), ["Awaiting you"]);
  });
});

describe("rien n'est deviné", () => {
  const SOURCES = { stations: [], vols: [], bloque: false };

  test("une ligne reformulée — un mot de plus, une durée écrite autrement, un état ou un titre qui n'est pas celui de `faits` — n'est pas découpée : elle est relayée entière", () => {
    const AUTRES = [
      "pris  -  tenu par box/claude depuis 12 min, bail encore 27 min  Titre",
      "pris  -  par box/claude depuis douze minutes, bail encore 27 min  Titre",
      "pris  -  par box/claude depuis 12 min  Titre",
      "pris  -  par box/claude depuis 12 min, bail encore 27 min, et autre chose  Titre",
      "pris  prio:haute et plus  par box/claude depuis 12 min, bail encore 27 min  Titre",
      "pris  par box/claude depuis 12 min, bail encore 27 min  Titre",
      "en attente  -  depuis 12 min  Titre",
      "pris  -  par box/claude depuis 12 min, bail encore 27 min  Un autre titre",
      "pris  -  depuis 12 min, cuisiné par box/claude  Titre",
      "",
    ];
    for (const ligne of AUTRES) {
      const porte = porter({ etat: "pris", titre: "Titre" }, { ...SOURCES, lignes: [ligne] });

      assert.deepEqual(porte.dit, [], ligne);
      assert.equal(porte.relais, ligne, ligne);
      assert.match(porte.sans ?? "", /not read by the app .* relayed below as is : who holds it · since when · its lease · what it burns · what blocks it$/, ligne);
    }
    // La même, telle que le runtime l'écrit, se découpe.
    assert.deepEqual(porter({ etat: "pris", titre: "Titre" }, { ...SOURCES, lignes: ["pris  prio:2  par box/claude depuis 12 min, bail encore 27 min  Titre"] }).dit.map(({ valeur }) => valeur), ["box/claude", "12 min", "bail encore 27 min"]);
  });

  test("un titre qui ressemble à un détail ne trompe pas la lecture : c'est le titre de `faits` qui borne la ligne", () => {
    const titre = "par mac/claude depuis 3 j, bail encore 1 min";
    const porte = porter({ etat: "pris", titre }, { ...SOURCES, lignes: [`pris  -  par box/claude depuis 12 min, bail encore 27 min  ${titre}`] });

    assert.deepEqual(porte.dit.map(({ valeur }) => valeur), ["box/claude", "12 min", "bail encore 27 min"]);
  });

  test("deux lignes pour un même ticket ne disent pas laquelle croire : les deux sont relayées, et rien n'en est tiré", () => {
    const lignes = ["pris  -  par box/claude depuis 12 min, bail encore 27 min  Titre", "pris  -  par mac/claude depuis 2 min, bail encore 28 min  Titre"];
    const porte = porter({ etat: "pris", titre: "Titre" }, { ...SOURCES, lignes });

    assert.deepEqual(porte.dit, []);
    assert.equal(porte.relais, lignes.join("\n"));
  });

  test("ce que la ligne relayée porte reste mot pour mot — longue, avec ses blancs, une tabulation, ce qui ressemble à du HTML", () => {
    const ligne = `au four  -  \tdepuis   2 h — <b>${"x".repeat(900)}</b>  et des blancs en fin   `;

    assert.equal(porter({ etat: "au four", titre: "Titre" }, { ...SOURCES, lignes: [ligne] }).relais, ligne);
    assert.deepEqual(lignesDuRail(`rail       1 au four\n  #7  ${ligne}\n\ncooks\n`)?.get(7), [ligne]);
  });

  test("sans `status` lu, la carte dit ce que `faits` donne seul, et pourquoi le reste manque — jamais « personne », jamais « 0 »", () => {
    const vol = { ticket: 14, run: "14-3f9a01bc", station: "box/claude", tokens: 230_000 };

    assert.deepEqual(porter({ etat: "pris", titre: "Titre" }, { stations: ["box/claude"], vols: [vol], bloque: false }), {
      dit: [{ libelle: "taken by", valeur: "box/claude", exact: true }, { libelle: "burns", valeur: tokens(230_000) }],
      sans: "not given by `faits`, and the `rail` line of `status` was not read : since when · its lease · what blocks it",
    });
    // Un runtime d'avant les cooks et les cooks en vol dans `faits` : rien n'est dit, tout est écrit manquant.
    assert.deepEqual(porter({ etat: "pris", titre: "Titre" }, { bloque: false }), { dit: [], sans: "not given by `faits`, and the `rail` line of `status` was not read : who holds it · since when · its lease · what it burns · what blocks it" });
    // `status` lu, mais il ne dit rien de ce ticket : la file ne le communique pas.
    assert.deepEqual(porter({ etat: "pris", titre: "Titre" }, { ...SOURCES, lignes: [] }), { dit: [], sans: `${NON_COMMUNIQUE} : who holds it · since when · its lease · what it burns · what blocks it` });
  });

  test("plusieurs cooks en vol sur un même ticket : chacun sous son run, rien n'est additionné", () => {
    const vols = [
      { ticket: 14, run: "14-3f9a01bc", station: "box/claude", tokens: 230_000 },
      { ticket: 14, run: "relecture-14", station: null, tokens: null },
    ];

    assert.deepEqual(porter({ etat: "pris", titre: "Titre" }, { ...SOURCES, vols }).dit, [{ libelle: "burns", valeur: `14-3f9a01bc: ${tokens(230_000)} · relecture-14: no reading yet` }]);
  });

  test("une sortie de `status` sans ligne `rail`, ou qui en a deux, ne donne aucune ligne : rien n'est pris ailleurs", () => {
    assert.equal(lignesDuRail("cuisine    ouverte\n  #14  pris  -  par box/claude depuis 12 min, bail encore 27 min  Titre\n"), undefined);
    assert.equal(lignesDuRail("rail       1 pris\n  #14  x\n\nrail       1 pris\n  #14  y\n"), undefined);
    assert.equal(lignesDuRail(""), undefined);
    // Sous `cooks`, sous `serveurs` : un numéro en tête n'est pas une ligne du rail.
    assert.deepEqual([...(lignesDuRail("rail       vide\n\ncooks      1 en cours\n  #14  14-3f9a01bc  12 min sur 2 h\nserveurs   1\n  #15  w  port 3000\n") ?? [])], []);
  });
});
