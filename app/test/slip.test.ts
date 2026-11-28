// Ce qu'un bon du rail porte : ce que la file dit déjà du ticket — who holds it, since when,
// its lease, what it burns, what blocks it — et, chose par chose, ce qu'elle n'en dit pas.
// La ligne lue est celle que le runtime écrit sous `rail`, dans `status` : elle est tenue ici
// contre le runtime lui-même, qui écrit `status` et `faits` du même état. Une ligne qui n'a
// pas la forme attendue n'est jamais devinée : elle est relayée telle quelle.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { putAside } from "../src/awaiting.ts";
import { linesOfRail, carry } from "../src/slip.ts";
import { understand, rail, type Card, type Facts } from "../src/facts.ts";

const NOW = new Date("2026-10-13T10:00:00.000Z");

// Ce que le runtime d'avant la #4775 rendait de ce rail, figé dans fixtures/old-runtime-slip.frozen (`status`, le texte, et
// `faits`, la forme, de l'ancien `decrireEtat` et `faits`, runtime/src/etat.ts, joués sur un rail de chaque sorte, à NOW) :
//   base : #14, #15, #16 pris (bail qui avance, qui coince, échu), #20 à #23 en attente, #30 en pass, #31 servi, #40 mis de côté ;
//   withoutStation : le même, sans station déclarée depuis 30 min ;
//   twoStations : le même, avec les stations box/claude (ici) et mac/claude (distante, le Mac du chef) ;
//   boxOnly : le même, avec box/claude seule ;
//   awaiting : le même, et la PR fermée de #23 qui attend le chef.
type Scenario = "base" | "withoutStation" | "twoStations" | "boxOnly" | "awaiting";
const RENDERED = JSON.parse(readFileSync(new URL("./fixtures/old-runtime-slip.frozen", import.meta.url), "utf8")) as Record<Scenario, { status: string; faits: unknown }>;
// Les tickets du rail de la fixture, dans l'ordre où la file les écrit.
const RAIL_TICKETS = [14, 15, 16, 20, 21, 22, 23, 30, 31, 40];

// Ce que la box rend de ce scénario, par ses deux lectures : `status`, du texte, et `faits`, la forme.
function readings(scenario: Scenario): { status: string; faits: Facts } {
  const { status, faits } = RENDERED[scenario];
  const understood = understand(JSON.stringify(faits));
  assert.ok(!("informe" in understood), "le runtime ne rend plus la forme que l'app comprend");
  return { status, faits: understood };
}

// Le rail que l'app en dessine, de bout en bout : la sortie de `status`, son bloc mis à part, et `faits`.
function draws(scenario: Scenario = "base") {
  const { status, faits: facts } = readings(scenario);
  const shownOne = putAside({ projet: "brigade", demande: 1, a: NOW.toISOString(), sorties: [{ commande: "status", texte: status }] });
  assert.ok("sorties" in shownOne && shownOne.attend !== undefined, "`status` n'a plus le bord que l'app sait prendre");
  const text = shownOne.sorties[0]?.texte ?? "";
  return { status, texte: text, rail: rail(facts, { bloc: shownOne.attend, a: NOW.toISOString() }, { texte: text, a: NOW.toISOString() }) };
}
const allEntries = (draws: ReturnType<typeof rail>): Card[] => [...draws.colonnes.flatMap(({ cartes: cards }) => cards), ...draws.hors];
const cardOf = (draws: ReturnType<typeof rail>, number: number): Card => allEntries(draws).find((card) => card.ticket === number) ?? assert.fail(`pas de carte #${number}`);
const saidOnes = (card: Card) => Object.fromEntries(card.dit.map(({ libelle: wording, valeur: value }) => [wording, value]));
const NOT_COMMUNICATED = "not given by the queue";

describe("ce qu'un bon porte, tenu contre ce que le runtime écrit", () => {
  const { status, rail: readOne } = draws();

  test("la ligne de chaque ticket est prise sous la ligne `rail` de `status`, et là seulement", () => {
    const lines = linesOfRail(status) ?? assert.fail("pas de ligne `rail` dans `status`");

    assert.deepEqual([...lines.keys()], RAIL_TICKETS);
    for (const [number, [line, ...others]] of lines) {
      assert.deepEqual(others, [], `#${number} a plusieurs lignes`);
      assert.ok(status.split("\n").includes(`  #${number}  ${line}`), `#${number}`);
    }
    assert.equal(readOne.railLu, NOW.toISOString());
  });

  test("un ticket pris : who holds it, since when, its lease — chaque valeur est un morceau de ce que la box a écrit", () => {
    const card = cardOf(readOne, 14);

    assert.deepEqual(card.dit, [
      { libelle: "right now", valeur: "reading runtime/src/etat.ts, for 2 min" },
      { libelle: "taken by", valeur: "box/claude", exact: true },
      { libelle: "since", valeur: "12 min" },
      { libelle: "lease", valeur: "no progress since 3 min, lease 27 min left" },
    ]);
    // Ce qu'il brûle, et rien ne le bloque d'après la file : c'est écrit, pas mis à « rien ».
    assert.equal(card.sans, `${NOT_COMMUNICATED} : what it burns · what blocks it`);
    assert.ok(!("relais" in card));
    for (const { valeur: value } of card.dit.slice(3, 4)) assert.ok(status.includes(value), value);
  });

  test("un ticket qui coince, un bail échu : le bail le dit avec les mots du runtime", () => {
    assert.deepEqual(saidOnes(cardOf(readOne, 15)), { "right now": "running the tests, for 20 min", "taken by": "mac/claude", since: "40 min", lease: "STUCK: no progress since 20 min, lease 10 min left" });
    assert.deepEqual(saidOnes(cardOf(readOne, 16)), { "right now": "activity not given", "taken by": "box/claude", since: "1 h 30", lease: "STUCK: no progress since 35 min, lease expired since 5 min" });
  });

  test("un ticket en attente : since when, et en clair ce qui le retient — une zone tenue, d'autres tickets, un ticket parti l'issue ouverte", () => {
    assert.deepEqual(saidOnes(cardOf(readOne, 21)), { since: "2 h 05", "blocked by": "zone held by #14 (app/src)" });
    assert.equal(cardOf(readOne, 21).sans, `${NOT_COMMUNICATED} : who holds it · its lease · what it burns`);
    // Un chemin qui porte lui-même un tiret long : tout ce que la ligne dit avant « since » est gardé.
    assert.deepEqual(saidOnes(cardOf(readOne, 22)), { since: "2 d", "blocked by": "awaiting #14, #15 · zone held by #16 (runtime/src — vue)" });
    assert.deepEqual([cardOf(readOne, 23).etat, saidOnes(cardOf(readOne, 23))], ["en attente", { since: "3 h 02", "blocked by": "awaiting #17 (off the rail, issue still open: label `fire` removed)" }]);
    // Rien ne le retient : la file ne dit pas what blocks it, et la carte l'écrit.
    assert.deepEqual(saidOnes(cardOf(readOne, 20)), { since: "3 min" });
    assert.equal(cardOf(readOne, 20).sans, `${NOT_COMMUNICATED} : who holds it · its lease · what it burns · what blocks it`);
  });

  test("en pass, servi : since when, et qui l'a cuisiné — dit sous son nom, pas comme celui who holds it", () => {
    assert.deepEqual(cardOf(readOne, 30).dit, [{ libelle: "right now", valeur: "review in progress, for 1 min" }, { libelle: "since", valeur: "4 min" }, { libelle: "cooked by", valeur: "box/claude", exact: true }]);
    assert.deepEqual(saidOnes(cardOf(readOne, 31)), { since: "1 h 00", "cooked by": "mac/claude" });
    for (const number of [30, 31]) assert.equal(cardOf(readOne, number).sans, `${NOT_COMMUNICATED} : who holds it · its lease · what it burns · what blocks it`);
  });

  test("un ticket mis de côté (86) porte la raison en clair que le runtime donne dans `faits`, en une ligne — sa ligne brute n'est plus relayée", () => {
    const card = cardOf(readOne, 40);

    assert.deepEqual(card.dit, [{ libelle: "set aside", valeur: "attend : setup du projet impossible" }]);
    assert.equal(card.relais, undefined);
    assert.ok(status.split("\n").includes("  #40  86  -  since 5 min (setup-failed), back in 5 min  Ticket 40"));
    assert.doesNotMatch(JSON.stringify(card), /setup-failed|back in/);
    assert.ok(readOne.colonnes.some(({ cartes: cards }) => cards.includes(card)), "rangée dans une colonne");
    assert.ok(!readOne.hors.some(({ ticket }) => ticket === 40));
  });

  test("une carte porte les cinq choses, ou écrit celles qui manquent : aucune n'est omise, sur aucun ticket", () => {
    const FIVE = [["taken by", "who holds it"], ["since", "since when"], ["lease", "its lease"], ["burns", "what it burns"], ["blocked by", "what blocks it"]] as const;
    for (const card of allEntries(readOne)) {
      for (const [wording, you] of FIVE) {
        const saidOne = card.dit.some((done) => done.libelle === wording);
        const kills = (card.sans ?? "").split(" : ").at(-1)?.split(" · ").includes(you) === true;
        assert.equal(saidOne !== kills, true, `#${card.ticket} : « ${wording} » ${saidOne ? "dite et écrite manquante" : "ni dite ni écrite manquante"}`);
      }
    }
  });

  test("la retenue d'une station, dite par `status` quand rien d'autre ne retient le ticket, est what blocks it", () => {
    const withoutStation = draws("withoutStation");

    assert.deepEqual(saidOnes(cardOf(withoutStation.rail, 20)), { since: "3 min", "blocked by": "no station declared" });
  });
});

describe("où cuit chaque ticket en cours : box ou Mac", () => {
  const { rail: readOne } = draws("twoStations");

  test("la carte d'un ticket pris dit « box » ou « Mac », sous la station qui le tient, d'après ce que `faits` dit de cette station", () => {
    assert.deepEqual(cardOf(readOne, 14).dit, [
      { libelle: "right now", valeur: "reading runtime/src/etat.ts, for 2 min" },
      { libelle: "taken by", valeur: "box/claude", exact: true },
      { libelle: "cooks on", valeur: "main station" },
      { libelle: "since", valeur: "12 min" },
      { libelle: "lease", valeur: "no progress since 3 min, lease 27 min left" },
    ]);
    assert.equal(saidOnes(cardOf(readOne, 15))["cooks on"], "Mac");
    assert.equal(saidOnes(cardOf(readOne, 16))["cooks on"], "main station");
  });

  test("seul un ticket en cours le dit : ni celui qui attend, ni celui en pass ou servi, ni celui mis de côté", () => {
    for (const number of [20, 21, 22, 23, 30, 31, 40]) assert.equal(saidOnes(cardOf(readOne, number))["cooks on"], undefined, `#${number}`);
  });

  test("une station que `faits` ne situe pas — un runtime d'avant ce champ, une station qu'il ne donne plus — ne fait rien dire : l'app ne devine pas", () => {
    // Un runtime d'avant `stations` : la forme sans ce champ.
    const { status, faits: facts } = readings("base");
    const withoutStations: Facts = { ...facts };
    delete withoutStations.stations;
    const old = rail(withoutStations, undefined, { texte: status, a: NOW.toISOString() });
    assert.equal(saidOnes(cardOf(old, 14))["cooks on"], undefined);
    assert.equal(saidOnes(cardOf(old, 14))["taken by"], "box/claude");
    // Le Mac n'est plus déclaré : son ticket ne se dit nulle part, celui de la box si.
    const { rail: withoutMac } = draws("boxOnly");
    assert.equal(saidOnes(cardOf(withoutMac, 15))["cooks on"], undefined);
    assert.equal(saidOnes(cardOf(withoutMac, 14))["cooks on"], "main station");
  });

  test("`comprendre` lit les stations que la box rend, et refuse une forme qui n'est pas la leur", () => {
    const { faits: facts } = readings("twoStations");
    assert.deepEqual(
      facts.stations?.map(({ station, distante: remote }) => [station, remote]),
      [
        ["box/claude", false],
        ["mac/claude", true],
      ],
    );
    const raw = JSON.parse(JSON.stringify(RENDERED.twoStations.faits));
    raw.stations[1].distante = "oui";
    assert.deepEqual(understand(JSON.stringify(raw)), { informe: "“stations[1].distante” is not true or false" });
  });
});

describe("un ticket qui t'attend", () => {
  test("ce que le bloc `attend` dit de lui est what blocks it : la carte le porte à part, et n'écrit pas qu'il manque", () => {
    // Un ticket qui en attend un autre n'attend jamais le chef (#1834) : c'est la PR fermée de #23 qui l'y met.
    const { rail: readOne } = draws("awaiting");
    const card = cardOf(readOne, 23);

    assert.deepEqual(readOne.colonnes[3]?.cartes.map(({ ticket }) => ticket), [23]);
    assert.equal(card.attendu, true);
    assert.match(card.attend[0] ?? "", /^for 3 h 02 {2}PR closed without merge: https:\/\/github\.com\/benomite\/brigade\/pull\/23 — to decide: /);
    assert.deepEqual(saidOnes(card), { since: "3 h 02", "blocked by": "awaiting #17 (off the rail, issue still open: label `fire` removed)" });
    assert.equal(card.sans, `${NOT_COMMUNICATED} : who holds it · its lease · what it burns`);
    // Et il n'est dans aucune autre colonne.
    assert.deepEqual(readOne.colonnes.filter(({ cartes: cards }) => cards.some(({ ticket }) => ticket === 23)).map(({ nom: name }) => name), ["Awaiting you"]);
  });
});

describe("rien n'est deviné", () => {
  const SOURCES = { stations: [], vols: [], bloque: false };

  test("une ligne reformulée — un mot de plus, une durée écrite autrement, un état ou un titre qui n'est pas celui de `faits` — n'est pas découpée : elle est relayée entière", () => {
    const OTHERS = [
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
    for (const line of OTHERS) {
      const carried = carry({ etat: "pris", titre: "Titre" }, { ...SOURCES, lignes: [line] });

      assert.deepEqual(carried.dit, [], line);
      assert.equal(carried.relais, line, line);
      assert.match(carried.sans ?? "", /not read by the app .* relayed below as is : who holds it · since when · its lease · what it burns · what blocks it$/, line);
    }
    // La même, telle que le runtime l'écrit, se découpe.
    assert.deepEqual(carry({ etat: "pris", titre: "Titre" }, { ...SOURCES, lignes: ["pris  prio:2  par box/claude depuis 12 min, bail encore 27 min  Titre"] }).dit.map(({ valeur: value }) => value), ["box/claude", "12 min", "bail encore 27 min"]);
  });

  test("un titre qui ressemble à un détail ne trompe pas la lecture : c'est le titre de `faits` qui borne la ligne", () => {
    const title = "par mac/claude depuis 3 j, bail encore 1 min";
    const carried = carry({ etat: "pris", titre: title }, { ...SOURCES, lignes: [`pris  -  par box/claude depuis 12 min, bail encore 27 min  ${title}`] });

    assert.deepEqual(carried.dit.map(({ valeur: value }) => value), ["box/claude", "12 min", "bail encore 27 min"]);
  });

  test("deux lignes pour un même ticket ne disent pas laquelle croire : les deux sont relayées, et rien n'en est tiré", () => {
    const lines = ["pris  -  par box/claude depuis 12 min, bail encore 27 min  Titre", "pris  -  par mac/claude depuis 2 min, bail encore 28 min  Titre"];
    const carried = carry({ etat: "pris", titre: "Titre" }, { ...SOURCES, lignes: lines });

    assert.deepEqual(carried.dit, []);
    assert.equal(carried.relais, lines.join("\n"));
  });

  test("ce que la ligne relayée porte reste mot pour mot — longue, avec ses blancs, une tabulation, ce qui ressemble à du HTML", () => {
    const line = `au four  -  \tdepuis   2 h — <b>${"x".repeat(900)}</b>  et des blancs en fin   `;

    assert.equal(carry({ etat: "au four", titre: "Titre" }, { ...SOURCES, lignes: [line] }).relais, line);
    assert.deepEqual(linesOfRail(`rail       1 au four\n  #7  ${line}\n\ncooks\n`)?.get(7), [line]);
  });

  test("sans `status` lu, la carte dit ce que `faits` donne seul, et pourquoi le reste manque — jamais « personne », jamais « 0 »", () => {
    assert.deepEqual(carry({ etat: "pris", titre: "Titre" }, { stations: ["box/claude"], bloque: false }), {
      dit: [{ libelle: "taken by", valeur: "box/claude", exact: true }],
      sans: "not given by `facts`, and the `rail` line of `status` was not read : since when · its lease · what it burns · what blocks it",
    });
    // Un runtime d'avant les cooks dans `faits` : rien n'est dit, tout est écrit manquant.
    assert.deepEqual(carry({ etat: "pris", titre: "Titre" }, { bloque: false }), { dit: [], sans: "not given by `facts`, and the `rail` line of `status` was not read : who holds it · since when · its lease · what it burns · what blocks it" });
    // `status` lu, mais il ne dit rien de ce ticket : la file ne le communique pas.
    assert.deepEqual(carry({ etat: "pris", titre: "Titre" }, { ...SOURCES, lignes: [] }), { dit: [], sans: `${NOT_COMMUNICATED} : who holds it · since when · its lease · what it burns · what blocks it` });
  });

  test("une sortie de `status` sans ligne `rail`, ou qui en a deux, ne donne aucune ligne : rien n'est pris ailleurs", () => {
    assert.equal(linesOfRail("cuisine    ouverte\n  #14  pris  -  par box/claude depuis 12 min, bail encore 27 min  Titre\n"), undefined);
    assert.equal(linesOfRail("rail       1 pris\n  #14  x\n\nrail       1 pris\n  #14  y\n"), undefined);
    assert.equal(linesOfRail(""), undefined);
    // Sous `cooks`, sous `serveurs` : un numéro en tête n'est pas une ligne du rail.
    assert.deepEqual([...(linesOfRail("rail       vide\n\ncooks      1 en cours\n  #14  14-3f9a01bc  12 min sur 2 h\nserveurs   1\n  #15  w  port 3000\n") ?? [])], []);
  });
});
