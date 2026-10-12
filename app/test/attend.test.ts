// Ce qui attend le chef, mis à part : le bloc de `status` pris par son bord — sa
// ligne `attend`, sa ligne `fin attend` — sur des sorties recopiées du runtime.
// Rien de ce que le bloc dit n'est lu : les tests le prouvent en y mettant
// n'importe quoi.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mettreAPart } from "../src/attend.ts";
import type { Lecture } from "../src/box.ts";

const AVANT = "projet     brigade\nruntime    en marche depuis 3 h 12 (pid 4211) — dernier tick il y a 4 s\ncuisine    ouverte\nsauvegarde il y a 2 h 10 — brigade-2026-10-12.db\n";
const APRES = "\nrail       2 tickets : 1 en cuisine, 1 en attente\n  #14  en cuisine  depuis 12 min  Le journal en ajout seul\n\nderniers événements\n  09:12:04  ticket.taken  #14\n";
const PLEIN =
  "attend     2 décisions attendent le chef — la plus ancienne depuis 2 j\n" +
  "  #12  depuis 2 j  livraison verte, non mergée faute de grant `merge` — à merger à la main : https://github.com/benomite/brigade/pull/31  Le journal en ajout seul\n" +
  "  #21  depuis 3 h 02  BLOQUÉ : #17 abandonné (label `fire` retiré) — à débloquer : remettre #17 sur le rail, ou le retirer de la ligne `attend` de la fiche  L'export du journal\n" +
  "fin attend\n";
const VIDE = "attend     rien n'attend le chef\nfin attend\n";
const GRANT = "grant merge           ABSENT — jamais donné\n";

const lue = (status: string, autre = { commande: "grant", texte: GRANT }): Lecture => ({ projet: "brigade", demande: 7, a: "2026-10-12T09:14:00.000Z", sorties: [{ commande: "status", texte: status }, autre] });

describe("ce qui attend le chef, mis à part", () => {
  test("le bloc sort de `status` par son bord, bornes comprises — et le reste de la sortie reste tel quel, à sa place", () => {
    assert.deepEqual(mettreAPart(lue(AVANT + PLEIN + APRES)), {
      projet: "brigade",
      demande: 7,
      a: "2026-10-12T09:14:00.000Z",
      attend: PLEIN,
      sorties: [
        { commande: "status", texte: AVANT + APRES },
        { commande: "grant", texte: GRANT },
      ],
    });
  });

  test("rien n'attend : c'est le bloc du runtime qui le dit, avec ses mots — l'app n'en écrit aucun", () => {
    const montree = mettreAPart(lue(AVANT + VIDE + APRES));

    assert.equal("attend" in montree && montree.attend, VIDE);
  });

  test("ce que le bloc dit n'est pas lu : n'importe quoi entre les deux bornes est rendu mot pour mot", () => {
    const bloc = "attend\n\n  rail  ce n'est pas le rail\n  fin attend, en retrait : pas une borne\n\tattend encore\nfin attend\n";
    const montree = mettreAPart(lue(AVANT + bloc + APRES));

    assert.equal("attend" in montree && montree.attend, bloc);
    assert.equal("sorties" in montree && montree.sorties[0]?.texte, AVANT + APRES);
  });

  test("le bloc en tête ou en fin de sortie, et une sortie sans saut de ligne final", () => {
    assert.deepEqual(mettreAPart(lue(VIDE + "rail       vide")), { ...lue("rail       vide"), attend: VIDE });
    assert.deepEqual(mettreAPart(lue("rail       vide\nattend     rien n'attend le chef\nfin attend")), { ...lue("rail       vide\n"), attend: "attend     rien n'attend le chef\nfin attend" });
  });

  test("une sortie sans bord (runtime d'avant #311) reste entière, et rien n'est mis à part — ce n'est pas « rien n'attend »", () => {
    const ancien = `${AVANT}attend     1 décision attend le chef depuis 2 j\n  #12  depuis 2 j  livraison verte\n${APRES}`;
    const calme = AVANT + APRES;

    assert.deepEqual(mettreAPart(lue(ancien)), { ...lue(ancien), attend: undefined });
    assert.deepEqual(mettreAPart(lue(calme)), { ...lue(calme), attend: undefined });
  });

  test("un bord qui n'est pas celui que le runtime décrit n'en est pas un : deux lignes `attend`, deux `fin attend`, la fin avant le début, une fin seule", () => {
    for (const status of [`${VIDE}attendu ailleurs\n`, `${VIDE}fin attend\n`, "fin attend\nattend     rien n'attend le chef\n", `${AVANT}fin attend\n`, "fin attend \nattend\n"]) {
      assert.deepEqual(mettreAPart(lue(status)), { ...lue(status), attend: undefined }, status);
    }
  });

  test("seul `status` porte le bloc : la sortie d'une autre commande n'est pas découpée, même si elle lui ressemble", () => {
    const station = { commande: "station", texte: VIDE };

    assert.deepEqual(mettreAPart(lue(AVANT + VIDE, station)), { ...lue(AVANT, station), attend: VIDE });
    assert.deepEqual(mettreAPart({ projet: "brigade", demande: 7, a: "2026-10-12T09:14:00.000Z", sorties: [station] }), { projet: "brigade", demande: 7, a: "2026-10-12T09:14:00.000Z", attend: undefined, sorties: [station] });
  });

  test("une lecture ratée n'a rien à mettre à part : elle passe telle quelle", () => {
    const ratee: Lecture = { projet: "brigade", demande: 7, a: "2026-10-12T09:14:00.000Z", erreur: "$ ssh …\n→ code de sortie 255", atteinte: false };

    assert.equal(mettreAPart(ratee), ratee);
  });
});
