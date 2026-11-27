// Ce qui attend le chef, mis à part : le bloc de `status` pris par son bord — sa
// ligne `attend`, sa ligne `fin attend` — sur des sorties recopiées du runtime.
// Rien de ce que le bloc dit n'est lu pour le mettre à part : les tests le
// prouvent en y mettant n'importe quoi. Le rail, lui, y lit le numéro en tête
// d'une ligne — et cette forme est tenue contre le bloc que le runtime écrit.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { decrireAttentes, type Attente } from "../../runtime/src/attend.ts";
import { saysOf, putAPart, ticketsOf } from "../src/awaiting.ts";
import type { Reading } from "../src/box.ts";

const BEFORE = "projet     brigade\nruntime    en marche depuis 3 h 12 (pid 4211) — dernier tick il y a 4 s\ncuisine    ouverte\nsauvegarde il y a 2 h 10 — brigade-2026-10-12.db\n";
const AFTER = "\nrail       2 tickets : 1 en cuisine, 1 en attente\n  #14  en cuisine  depuis 12 min  Le journal en ajout seul\n\nderniers événements\n  09:12:04  ticket.taken  #14\n";
const FULL =
  "attend     2 décisions attendent le chef — la plus ancienne depuis 2 j\n" +
  "  #12  depuis 2 j  livraison verte, non mergée — à merger à la main : https://github.com/benomite/brigade/pull/31  Le journal en ajout seul\n" +
  "  #21  depuis 3 h 02  BLOQUÉ : #17 abandonné (label `fire` retiré) — à débloquer : remettre #17 sur le rail, ou le retirer de la ligne `attend` de la fiche  L'export du journal\n" +
  "fin attend\n";
const EMPTY = "attend     rien n'attend le chef\nfin attend\n";

const readEntry = (status: string, other = { commande: "station", texte: "station    claude\n" }): Reading => ({ projet: "brigade", demande: 7, a: "2026-10-12T09:14:00.000Z", sorties: [{ commande: "status", texte: status }, other] });

describe("ce qui attend le chef, mis à part", () => {
  test("le bloc sort de `status` par son bord, bornes comprises — et le reste de la sortie reste tel quel, à sa place", () => {
    assert.deepEqual(putAPart(readEntry(BEFORE + FULL + AFTER)), {
      projet: "brigade",
      demande: 7,
      a: "2026-10-12T09:14:00.000Z",
      attend: FULL,
      sorties: [
        { commande: "status", texte: BEFORE + AFTER },
        { commande: "station", texte: "station    claude\n" },
      ],
    });
  });

  test("rien n'attend : c'est le bloc du runtime qui le dit, avec ses mots — l'app n'en écrit aucun", () => {
    const shownOne = putAPart(readEntry(BEFORE + EMPTY + AFTER));

    assert.equal("attend" in shownOne && shownOne.attend, EMPTY);
  });

  test("ce que le bloc dit n'est pas lu : n'importe quoi entre les deux bornes est rendu mot pour mot", () => {
    const block = "attend\n\n  rail  ce n'est pas le rail\n  fin attend, en retrait : pas une borne\n\tattend encore\nfin attend\n";
    const shownOne = putAPart(readEntry(BEFORE + block + AFTER));

    assert.equal("attend" in shownOne && shownOne.attend, block);
    assert.equal("sorties" in shownOne && shownOne.sorties[0]?.texte, BEFORE + AFTER);
  });

  test("le bloc en tête ou en fin de sortie, et une sortie sans saut de ligne final", () => {
    assert.deepEqual(putAPart(readEntry(EMPTY + "rail       vide")), { ...readEntry("rail       vide"), attend: EMPTY });
    assert.deepEqual(putAPart(readEntry("rail       vide\nattend     rien n'attend le chef\nfin attend")), { ...readEntry("rail       vide\n"), attend: "attend     rien n'attend le chef\nfin attend" });
  });

  test("une sortie sans bord (runtime d'avant #311) reste entière, et rien n'est mis à part — ce n'est pas « rien n'attend »", () => {
    const old = `${BEFORE}attend     1 décision attend le chef depuis 2 j\n  #12  depuis 2 j  livraison verte\n${AFTER}`;
    const calm = BEFORE + AFTER;

    assert.deepEqual(putAPart(readEntry(old)), { ...readEntry(old), attend: undefined });
    assert.deepEqual(putAPart(readEntry(calm)), { ...readEntry(calm), attend: undefined });
  });

  test("un bord qui n'est pas celui que le runtime décrit n'en est pas un : deux lignes `attend`, deux `fin attend`, la fin avant le début, une fin seule", () => {
    for (const status of [`${EMPTY}attendu ailleurs\n`, `${EMPTY}fin attend\n`, "fin attend\nattend     rien n'attend le chef\n", `${BEFORE}fin attend\n`, "fin attend \nattend\n"]) {
      assert.deepEqual(putAPart(readEntry(status)), { ...readEntry(status), attend: undefined }, status);
    }
  });

  test("le bord `awaiting` … `end awaiting` est lu comme `attend` … `fin attend`, bornes comprises", () => {
    const block = "awaiting     rien n'attend le chef\nend awaiting\n";
    assert.deepEqual(putAPart(readEntry(`rail       vide\n${block}station    ok\n`)), { ...readEntry("rail       vide\nstation    ok\n"), attend: block });
  });

  test("un début d'un bord et la fin de l'autre ne font pas un bloc", () => {
    for (const status of ["attend     rien\nend awaiting\n", "awaiting     rien\nfin attend\n", "rail  vide\nawaiting\nfin attend\nstation  ok\n"]) {
      assert.deepEqual(putAPart(readEntry(status)), { ...readEntry(status), attend: undefined }, status);
    }
  });

  test("seul `status` porte le bloc : la sortie d'une autre commande n'est pas découpée, même si elle lui ressemble", () => {
    const station = { commande: "station", texte: EMPTY };

    assert.deepEqual(putAPart(readEntry(BEFORE + EMPTY, station)), { ...readEntry(BEFORE, station), attend: EMPTY });
    assert.deepEqual(putAPart({ projet: "brigade", demande: 7, a: "2026-10-12T09:14:00.000Z", sorties: [station] }), { projet: "brigade", demande: 7, a: "2026-10-12T09:14:00.000Z", attend: undefined, sorties: [station] });
  });

  test("une lecture ratée n'a rien à mettre à part : elle passe telle quelle", () => {
    const missed: Reading = { projet: "brigade", demande: 7, a: "2026-10-12T09:14:00.000Z", erreur: "$ …\n→ code de sortie 255", atteinte: false, cas: null };

    assert.equal(putAPart(missed), missed);
  });
});

// Une attente de chaque sorte, telle que le runtime les tient : chacune passe par
// `decrireAttentes`, qui écrit le bloc de `status`.
const SINCE = "2026-10-12T08:00:00.000Z";
const PR = "https://github.com/benomite/brigade/pull/31";
const delivery = { since: SINCE, cause: null, pr: PR };
const OF_TICKET: Attente[] = [
  { ticket: 12, title: "Le journal en ajout seul", ...delivery, quoi: "merge", reason: "review-required" },
  { ticket: 13, title: "Un motif que personne ne connaît", ...delivery, quoi: "merge", reason: "motif-neuf" },
  { ticket: 14, title: "La pass rouge", ...delivery, quoi: "remontee", reason: "still-red" },
  { ticket: 15, title: "La PR fermée", ...delivery, quoi: "fermee", reason: "merge-refused" },
  // Un ticket mis de côté par la cuisine, ou qui en attend un autre, n'attend jamais le chef (#1834) : aucune entrée.
  { ticket: 30, title: null, since: SINCE, quoi: "ecartee", reason: "question" },
  { ticket: 31, title: null, since: SINCE, quoi: "illisible", epique: true },
  { ticket: 32, title: null, since: SINCE, quoi: "question" },
];
const OF_STATION: Attente = { ticket: null, title: null, since: SINCE, quoi: "connexion", station: "claude", reason: null };
const written = (waits: Attente[]) => decrireAttentes(waits, () => "2 j").join("\n");

describe("les tickets que le bloc nomme, pour le rail", () => {
  test("chaque ligne qu'écrit `status` pour un ticket donne son numéro, quelle que soit l'attente — et le reste de la ligne, mot pour mot", () => {
    const block = written([OF_STATION, ...OF_TICKET]);
    const readOnes = ticketsOf(block);

    assert.deepEqual(readOnes.map(({ ticket }) => ticket), OF_TICKET.map(({ ticket }) => ticket));
    for (const { ticket, ligne: line } of readOnes) assert.ok(block.split("\n").includes(`  #${ticket}  ${line}`), `#${ticket}`);
    assert.match(readOnes[0]?.ligne ?? "", /^for 2 j  .*Le journal en ajout seul$/);
  });

  test("une ligne sans numéro en tête n'est à aucun ticket : la station sans connexion Max, la tête du bloc", () => {
    const block = written([OF_STATION]);

    assert.match(block, /^ {2}claude {2}for 2 j {2}Max connection /m);
    assert.deepEqual(ticketsOf(block), []);
    assert.deepEqual(ticketsOf(written([])), []);
    assert.deepEqual(ticketsOf(EMPTY), []);
  });

  test("un numéro ailleurs qu'en tête n'est pas lu : celui qu'un ticket BLOQUÉ attend, celui d'une PR, celui d'un titre", () => {
    assert.deepEqual(ticketsOf(FULL), [
      { ticket: 12, ligne: "depuis 2 j  livraison verte, non mergée — à merger à la main : https://github.com/benomite/brigade/pull/31  Le journal en ajout seul", suite: [] },
      { ticket: 21, ligne: "depuis 3 h 02  BLOQUÉ : #17 abandonné (label `fire` retiré) — à débloquer : remettre #17 sur le rail, ou le retirer de la ligne `attend` de la fiche  L'export du journal", suite: [] },
    ]);
  });

  test("seule la tête écrite par `status` compte : deux espaces, `#`, des chiffres, deux espaces ou la fin de la ligne", () => {
    const others = ["#12  sans retrait", " #12  un seul espace", "    #12  quatre espaces", "\t#12  une tabulation", "  #12 un seul espace après", "  #  sans chiffre", "  #12b  pas un nombre", "  # 12  un espace dedans", "  12  sans dièse", `  #${"9".repeat(30)}  pas un numéro de ticket`];

    assert.deepEqual(ticketsOf(`attend     n'importe quoi\n${others.join("\n")}\nfin attend\n`), []);
    assert.deepEqual(ticketsOf("attend\n  #7\n  #8  \n  #7  deux fois\nfin attend"), [{ ticket: 7, ligne: "", suite: [] }, { ticket: 8, ligne: "", suite: [] }, { ticket: 7, ligne: "deux fois", suite: [] }]);
  });

  test("ce qui précise une entrée, plus en retrait sous elle, lui reste attaché mot pour mot — et n'est jamais donné au ticket d'avant", () => {
    const block = [
      "attend     3 décisions attendent le chef — la plus ancienne depuis 2 j",
      "  #12  depuis 2 j  proposition de fermeture",
      "      │ une ligne de suite,   avec ses blancs  ",
      "",
      "        et une autre, plus en retrait encore",
      "  version  depuis 2 j  une version attend",
      "      │ ce qui précise la version n'est à aucun ticket",
      "  #21  depuis 3 h 02  BLOQUÉ",
      "fin attend",
      "      hors du bloc",
    ].join("\n");
    const readOnes = ticketsOf(block);

    assert.deepEqual(readOnes, [
      // La ligne vide ferme l'entrée : ce qui la suit, même en retrait, n'est plus à #12.
      { ticket: 12, ligne: "depuis 2 j  proposition de fermeture", suite: ["      │ une ligne de suite,   avec ses blancs  "] },
      { ticket: 21, ligne: "depuis 3 h 02  BLOQUÉ", suite: [] },
    ]);
    assert.equal(saysOf(readOnes[0] ?? assert.fail("pas d'entrée")), "depuis 2 j  proposition de fermeture\n      │ une ligne de suite,   avec ses blancs  ");
    assert.equal(saysOf(readOnes[1] ?? assert.fail("pas d'entrée")), "depuis 3 h 02  BLOQUÉ");
  });
});
