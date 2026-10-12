// Ce qui attend le chef, mis à part : le bloc de `status` pris par son bord — sa
// ligne `attend`, sa ligne `fin attend` — sur des sorties recopiées du runtime.
// Rien de ce que le bloc dit n'est lu pour le mettre à part : les tests le
// prouvent en y mettant n'importe quoi. Le rail, lui, y lit le numéro en tête
// d'une ligne — et cette forme est tenue contre le bloc que le runtime écrit.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { decrireAttentes, type Attente } from "../../runtime/src/attend.ts";
import { mettreAPart, ticketsDe } from "../src/attend.ts";
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
    const ratee: Lecture = { projet: "brigade", demande: 7, a: "2026-10-12T09:14:00.000Z", erreur: "$ ssh …\n→ code de sortie 255", atteinte: false, cas: "ssh-en-echec" };

    assert.equal(mettreAPart(ratee), ratee);
  });
});

// Une attente de chaque sorte, telle que le runtime les tient : chacune passe par
// `decrireAttentes`, qui écrit le bloc de `status`.
const DEPUIS = "2026-10-12T08:00:00.000Z";
const PR = "https://github.com/benomite/brigade/pull/31";
const livraison = { since: DEPUIS, cause: null, pr: PR };
const DE_TICKET: Attente[] = [
  { ticket: 12, title: "Le journal en ajout seul", ...livraison, quoi: "merge", reason: "no-grant", expired: null },
  { ticket: 13, title: "Un motif que personne ne connaît", ...livraison, quoi: "merge", reason: "motif-neuf", expired: null },
  { ticket: 14, title: "La pass rouge", ...livraison, quoi: "remontee", reason: "still-red" },
  { ticket: 15, title: "La PR fermée", ...livraison, quoi: "fermee", reason: "no-grant" },
  { ticket: 16, title: "Sans calibrage", since: DEPUIS, quoi: "86", reason: "no-calibration" },
  { ticket: 21, title: "L'export du journal", since: DEPUIS, quoi: "bloque", abandonnes: [{ ticket: 17, reason: "label" }, { ticket: 18, reason: "closed" }] },
  { ticket: 30, title: null, since: DEPUIS, quoi: "ecartee", reason: "question" },
  { ticket: 31, title: null, since: DEPUIS, quoi: "illisible", epique: true },
  { ticket: 32, title: null, since: DEPUIS, quoi: "question" },
];
const DE_STATION: Attente = { ticket: null, title: null, since: DEPUIS, quoi: "connexion", station: "claude", reason: null };
const SANS_GRANT = { arretees: 3, mergees: 1, parLaPass: 0, refusees: 1, ouvertes: 1 };
const ecrit = (attentes: Attente[], sansGrant: Parameters<typeof decrireAttentes>[2] = null) => decrireAttentes(attentes, () => "2 j", sansGrant).join("\n");

describe("les tickets que le bloc nomme, pour le rail", () => {
  test("chaque ligne qu'écrit `status` pour un ticket donne son numéro, quelle que soit l'attente — et le reste de la ligne, mot pour mot", () => {
    const bloc = ecrit([DE_STATION, ...DE_TICKET], SANS_GRANT);
    const lus = ticketsDe(bloc);

    assert.deepEqual(lus.map(({ ticket }) => ticket), DE_TICKET.map(({ ticket }) => ticket));
    for (const { ticket, ligne } of lus) assert.ok(bloc.split("\n").includes(`  #${ticket}  ${ligne}`), `#${ticket}`);
    assert.equal(lus[0]?.ligne, `depuis 2 j  livraison verte, non mergée faute de grant \`merge\` — à merger à la main : ${PR} — ou accorder le grant, pour les suivantes : \`npm --prefix runtime run grant -- activer merge\`  Le journal en ajout seul`);
  });

  test("une ligne sans numéro en tête n'est à aucun ticket : la station sans connexion Max, le bilan faute de grant, la tête du bloc", () => {
    const bloc = ecrit([DE_STATION], SANS_GRANT);

    assert.match(bloc, /^ {2}claude {2}depuis 2 j {2}connexion Max /m);
    assert.match(bloc, /^ {2}sans grant, 3 livraisons vertes arrêtées/m);
    assert.deepEqual(ticketsDe(bloc), []);
    assert.deepEqual(ticketsDe(ecrit([])), []);
    assert.deepEqual(ticketsDe(VIDE), []);
  });

  test("un numéro ailleurs qu'en tête n'est pas lu : celui qu'un ticket BLOQUÉ attend, celui d'une PR, celui d'un titre", () => {
    assert.deepEqual(ticketsDe(PLEIN), [
      { ticket: 12, ligne: "depuis 2 j  livraison verte, non mergée faute de grant `merge` — à merger à la main : https://github.com/benomite/brigade/pull/31  Le journal en ajout seul" },
      { ticket: 21, ligne: "depuis 3 h 02  BLOQUÉ : #17 abandonné (label `fire` retiré) — à débloquer : remettre #17 sur le rail, ou le retirer de la ligne `attend` de la fiche  L'export du journal" },
    ]);
  });

  test("seule la tête écrite par `status` compte : deux espaces, `#`, des chiffres, deux espaces ou la fin de la ligne", () => {
    const autres = ["#12  sans retrait", " #12  un seul espace", "    #12  quatre espaces", "\t#12  une tabulation", "  #12 un seul espace après", "  #  sans chiffre", "  #12b  pas un nombre", "  # 12  un espace dedans", "  12  sans dièse", `  #${"9".repeat(30)}  pas un numéro de ticket`];

    assert.deepEqual(ticketsDe(`attend     n'importe quoi\n${autres.join("\n")}\nfin attend\n`), []);
    assert.deepEqual(ticketsDe("attend\n  #7\n  #8  \n  #7  deux fois\nfin attend"), [{ ticket: 7, ligne: "" }, { ticket: 8, ligne: "" }, { ticket: 7, ligne: "deux fois" }]);
  });
});
