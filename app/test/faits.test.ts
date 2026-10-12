// Ce que l'app dessine : les faits que la box rend dans la forme de
// docs/runtime.md, « Les faits, pour un programme ». L'exemple de la doc est
// lu ici tel qu'il y est écrit ; une sortie qui n'est pas cette forme n'est
// jamais dessinée — ni tableau vide, ni zéros. Une couleur ne se pose que sur
// un mot des listes fermées. Le rail se range en cinq colonnes, la cinquième
// d'après le bloc `attend` de `status`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { BOUTONS, ecritPar } from "../src/boutons.ts";
import type { Lecture } from "../src/box.ts";
import { mettreAPart } from "../src/attend.ts";
import { BANNIERE, COMMANDE, comprendre, dessiner, duree, evenement, rail, tableau, tenirFaits, tick, titreDEchec, type Faits } from "../src/faits.ts";

const RACINE = join(import.meta.dirname, "../..");
const doc = readFileSync(join(RACINE, "docs/runtime.md"), "utf8");
const SECTION = doc.slice(doc.indexOf("### Les faits, pour un programme"));
// L'exemple de la doc : la seule ligne de son bloc `json`.
const EXEMPLE = SECTION.slice(SECTION.indexOf("```json\n") + 8, SECTION.indexOf("\n```", SECTION.indexOf("```json\n")));

const FAITS: Faits = {
  etat: "ouverte",
  lu: "2026-10-12T10:04:11.000Z",
  dernierTick: "2026-10-12T10:04:02.000Z",
  compteurs: { rail: 2, auTravail: 1, aLaPass: 1, attend: 1, livres24h: 3 },
  dernierEvenement: { seq: 812, at: "2026-10-12T10:03:58.000Z", type: "merge.done", ticket: 216 },
  rail: [
    { ticket: 14, etat: "pris", titre: "Le journal en ajout seul", url: "https://github.com/benomite/brigade/issues/14" },
    { ticket: 21, etat: "BLOQUÉ", titre: "L'export du journal", url: "https://github.com/benomite/brigade/issues/21" },
  ],
  cooks: [{ ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" }],
};
// Ce que rend un runtime d'avant les cooks : la même forme, sans le champ.
const { cooks: _cooks, ...SANS_COOKS } = FAITS;
const rendus = (faits: object) => `${JSON.stringify(faits)}\n`;

const lue = (texte: string): Lecture => ({ projet: "brigade", demande: 4, a: "2026-10-12T10:04:12.000Z", sorties: [{ commande: "faits", texte }] });

// Le refus, ou l'échec du test si la sortie a été prise pour la forme.
function informe(texte: string): string {
  const compris = comprendre(texte);
  assert.ok("informe" in compris, `pris pour la forme : ${texte}`);
  return compris.informe;
}

describe("les faits que l'app dessine", () => {
  test("la commande lue est un script du runtime, tel qu'il existe", () => {
    const { scripts } = JSON.parse(readFileSync(join(RACINE, "runtime/package.json"), "utf8")) as { scripts: Record<string, string> };

    assert.equal(COMMANDE, "faits");
    assert.ok(COMMANDE in scripts);
  });

  test("l'exemple de docs/runtime.md est compris tel qu'il est écrit — champ pour champ", () => {
    assert.deepEqual(comprendre(`${EXEMPLE}\n`), FAITS);
  });

  test("un journal vide, un runtime sans tick, un événement hors ticket, un rail vide : ce sont des faits, pas une forme manquée", () => {
    const calme = { ...FAITS, dernierTick: null, dernierEvenement: null, rail: [], compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 } };
    const horsTicket = { ...FAITS, dernierEvenement: { seq: 3, at: "2026-10-12T10:03:58.000Z", type: "kitchen.stopped", ticket: null } };

    assert.deepEqual(comprendre(rendus(calme)), calme);
    assert.deepEqual(comprendre(rendus(horsTicket)), horsTicket);
  });

  test("aucun cook en cours, ou un cook dont le ticket a quitté le rail — son titre est vide : ce sont des faits", () => {
    const calme = { ...FAITS, cooks: [] };
    const parti = { ...FAITS, cooks: [{ ticket: 30, titre: "", station: "box/claude" }] };

    assert.deepEqual(comprendre(rendus(calme)), calme);
    assert.deepEqual(comprendre(rendus(parti)), parti);
  });

  test("un runtime qui ne donne pas encore les cooks rend toujours la forme : le champ manque, il n'est pas mis à vide", () => {
    const compris = comprendre(rendus(SANS_COOKS));

    assert.deepEqual(compris, SANS_COOKS);
    assert.ok(!("cooks" in compris));
  });

  test("un mot d'état que l'app ne connaît pas est gardé tel quel — du projet comme d'un ticket", () => {
    const neuf = { ...FAITS, etat: "muette", rail: [{ ...FAITS.rail[0], etat: "au four" }] };

    assert.deepEqual(comprendre(rendus(neuf)), neuf);
  });

  test("un champ que l'app ne connaît pas ne casse rien, et n'est pas gardé", () => {
    assert.deepEqual(comprendre(rendus({ ...FAITS, quota: 62, rail: FAITS.rail.map((ticket) => ({ ...ticket, tenuPar: "cook-1" })), cooks: FAITS.cooks?.map((cook) => ({ ...cook, tours: 12 })) })), FAITS);
  });

  test("ce qui n'est pas la forme est refusé, en disant quoi : jamais des zéros à la place", () => {
    assert.match(informe("projet     brigade\nruntime    en marche depuis 3 h 12\n"), /pas du JSON/);
    assert.match(informe(""), /rien rendu/);
    assert.match(informe("null\n"), /pas un objet/);
    assert.match(informe("[]\n"), /pas un objet/);
    assert.match(informe(rendus({ ...FAITS, etat: 3 })), /« etat »/);
    assert.match(informe(rendus({ ...FAITS, lu: "tout à l'heure" })), /« lu »/);
    assert.match(informe(rendus({ ...FAITS, dernierTick: undefined })), /« dernierTick »/);
    assert.match(informe(rendus({ ...FAITS, compteurs: undefined })), /« compteurs »/);
    assert.match(informe(rendus({ ...FAITS, rail: undefined })), /« rail »/);
    assert.match(informe(rendus({ ...FAITS, dernierEvenement: { seq: 1, at: "2026-10-12T10:03:58.000Z", type: "merge.done" } })), /« dernierEvenement\.ticket »/);
    assert.match(informe(rendus({ ...FAITS, rail: [{ ticket: "14", etat: "pris", titre: "", url: "" }] })), /« rail\[0\]\.ticket »/);
    // Des cooks donnés, mais pas dans la forme : ce n'est pas un runtime d'avant ce champ.
    assert.match(informe(rendus({ ...FAITS, cooks: null })), /« cooks »/);
    assert.match(informe(rendus({ ...FAITS, cooks: 2 })), /« cooks »/);
    assert.match(informe(rendus({ ...FAITS, cooks: [{ ticket: null, titre: "", station: "box/claude" }] })), /« cooks\[0\]\.ticket »/);
    assert.match(informe(rendus({ ...FAITS, cooks: [{ ticket: 14, station: "box/claude" }] })), /« cooks\[0\]\.titre »/);
    assert.match(informe(rendus({ ...FAITS, cooks: [FAITS.cooks?.[0], { ticket: 21, titre: "L'export du journal" }] })), /« cooks\[1\]\.station »/);
  });

  test("un compteur qui manque, ou qui n'est pas un nombre entier positif, refuse la forme entière : aucun n'est mis à zéro", () => {
    for (const nom of ["rail", "auTravail", "aLaPass", "attend", "livres24h"] as const) {
      for (const valeur of [undefined, null, "2", -1, 1.5, Number.NaN]) {
        assert.match(informe(rendus({ ...FAITS, compteurs: { ...FAITS.compteurs, [nom]: valeur } })), new RegExp(`« compteurs\\.${nom} »`), `${nom} = ${String(valeur)}`);
      }
    }
  });

  test("une lecture devient ce que la vue pose, sans rien y calculer : la pastille, cinq nombres, les cooks en cours, le dernier événement, le rail", () => {
    assert.deepEqual(dessiner(lue(rendus(FAITS))), {
      projet: "brigade",
      demande: 4,
      a: "2026-10-12T10:04:12.000Z",
      tableau: {
        etat: "ouverte",
        ton: "vert",
        arretee: false,
        tick: "dernier tick 9 s avant la lecture",
        compteurs: [
          { libelle: "rail", nombre: 2 },
          { libelle: "au travail", nombre: 1 },
          { libelle: "à la pass", nombre: 1 },
          { libelle: "t'attend", nombre: 1 },
          { libelle: "livrés 24 h", nombre: 3 },
        ],
        cooks: { enCours: [{ ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" }], vide: "aucun cook en cours" },
        evenement: "merge.done · #216 · 13 s avant la lecture",
        rail: {
          colonnes: [
            { nom: "Sur le rail", ton: "gris", compte: "1", cartes: [{ ticket: 21, etat: "BLOQUÉ", ton: "rouge", titre: "L'export du journal", ouvrable: true, attend: [] }], vide: "aucun ticket" },
            { nom: "Au travail", ton: "bleu", compte: "1", cartes: [{ ticket: 14, etat: "pris", ton: "bleu", titre: "Le journal en ajout seul", ouvrable: true, attend: [] }], vide: "aucun ticket" },
            { nom: "Pass", ton: "jaune", compte: "0", cartes: [], vide: "aucun ticket" },
            { nom: "T'attend", ton: "rouge", compte: "?", cartes: [], vide: "pas lue : le bloc `attend` de `run status` n'a pas été pris pour ce projet. Ce n'est pas « rien ne t'attend » — les tickets restent dans leurs colonnes" },
            { nom: "Livré", ton: "vert", compte: "0", cartes: [], vide: "aucun ticket" },
          ],
          hors: [],
        },
      },
    });
  });

  test("une box qui rend autre chose que la forme : ce qu'elle a rendu est gardé mot pour mot, avec la raison", () => {
    const ancien = "projet     brigade\ncuisine    ouverte\n";

    assert.deepEqual(dessiner(lue(ancien)), { projet: "brigade", demande: 4, a: "2026-10-12T10:04:12.000Z", titre: "LA BOX N'A PAS RENDU LA FORME DE `faits`", informe: "ce n'est pas du JSON", rendu: ancien });
  });

  test("une commande en échec — un runtime d'avant `faits` — reste l'échec que la veille a rendu, sous un titre qui dit que la box a été jointe", () => {
    const echec: Lecture = { projet: "brigade", demande: 4, a: "2026-10-12T10:04:12.000Z", erreur: '$ ssh … brigade brigade faits\nnpm error Missing script: "faits"\n→ code de sortie 1', atteinte: true, cas: null };

    assert.deepEqual(dessiner(echec), { ...echec, titre: "JOINT, MAIS `faits` N'A PAS RÉPONDU" });
  });

  test("un refus du geste se dit comme sous `status` — le même cas, les mêmes mots : pas un runtime à mettre à jour", () => {
    const vue = readFileSync(join(RACINE, "app/src/vue/vue.js"), "utf8");
    const TITRES = {
      "projet-inconnu": "JOINT, MAIS INCONNU DE LA BOX",
      "sans-droit": "JOINT, MAIS SANS LE DROIT DU GESTE",
      "commande-manque": "JOINT, MAIS UNE COMMANDE MANQUE SUR LA BOX",
      "node-inapte": "JOINT, MAIS LE NODE DE LA BOX NE CONVIENT PAS AU RUNTIME",
    } as const;

    for (const [cas, titre] of Object.entries(TITRES) as [keyof typeof TITRES, string][]) {
      const echec: Lecture = { projet: "brigade", demande: 4, a: "2026-10-12T10:04:12.000Z", erreur: "…", atteinte: true, cas };
      assert.deepEqual(dessiner(echec), { ...echec, titre });
      // Les mots de l'en-tête que `rendre` pose sous `status`.
      assert.ok(vue.includes(`\`${titre} — essai de `), `« ${titre} » n'est plus l'en-tête de la vue`);
    }
    assert.equal(titreDEchec({ erreur: "…", atteinte: false, cas: "ssh-en-echec" }), "PAS JOINT");
    assert.equal(titreDEchec({ erreur: "…", atteinte: false, cas: null }), "PAS JOINT");
    assert.ok(vue.includes("`PAS JOINT — essai de "));
  });

  test("une box pas jointe est dite pas jointe, avec ce que `ssh` a rendu", () => {
    const echec: Lecture = { projet: "brigade", demande: 4, a: "2026-10-12T10:04:12.000Z", erreur: "ssh: connect to host box port 22: Operation timed out\n→ code de sortie 255", atteinte: false, cas: "ssh-en-echec" };

    assert.deepEqual(dessiner(echec), { ...echec, titre: "PAS JOINT" });
  });
});

// La couleur que la vue reçoit pour un mot d'état — du projet, ou de son premier ticket.
const tonDeProjet = (etat: string) => tableau({ ...FAITS, etat }).ton;
const cartes = (dessine: ReturnType<typeof rail>) => [...dessine.colonnes.flatMap((colonne) => colonne.cartes), ...dessine.hors];
const tonDeTicket = (etat: string) => cartes(rail({ ...FAITS, rail: [{ ticket: 1, etat, titre: "", url: "" }] }))[0]?.ton;

describe("une couleur sur un mot de la liste fermée", () => {
  test("les quatre états d'un projet ont la leur — ceux de docs/runtime.md, pas un de plus", () => {
    assert.deepEqual(["ouverte", "retenue", "arrêtée", "éteinte"].map(tonDeProjet), ["vert", "jaune", "rouge", "rouge"]);
    const table = SECTION.slice(SECTION.indexOf("| Mot | Quand |"), SECTION.indexOf("**L'état d'un ticket**"));
    assert.deepEqual([...table.matchAll(/^\| `([^`]+)` \|/gm)].map(([, mot]) => mot).sort(), ["arrêtée", "ouverte", "retenue", "éteinte"].sort());
  });

  test("les six états d'un ticket ont la leur — ceux que la doc énumère", () => {
    const MOTS = ["en attente", "BLOQUÉ", "pris", "en pass", "servi", "86"];

    assert.deepEqual(MOTS.map(tonDeTicket), ["gris", "rouge", "bleu", "jaune", "vert", "rouge"]);
    assert.ok(SECTION.includes(`${MOTS.slice(0, 3).map((mot) => `\`${mot}\``).join(", ")},\n${MOTS.slice(3).map((mot) => `\`${mot}\``).join(", ")}.`), "la liste des états d'un ticket a changé dans docs/runtime.md");
  });

  test("un mot inconnu s'affiche tel quel, sans couleur, et ne se range dans aucune — ni par sa casse, ni par un nom d'objet", () => {
    for (const mot of ["muette", "Ouverte", "OUVERTE", "ouverte ", "", "constructor", "toString", "__proto__"]) {
      assert.equal(tableau({ ...FAITS, etat: mot }).etat, mot);
      assert.ok(!("ton" in tableau({ ...FAITS, etat: mot })), mot);
    }
    for (const mot of ["au four", "bloqué", "Pris", "ouverte", "constructor", "__proto__"]) assert.equal(tonDeTicket(mot), undefined, mot);
  });
});

describe("la carte de projet", () => {
  test("cinq compteurs, dans l'ordre de la carte, chacun le nombre que la box a donné", () => {
    const comptes = tableau({ ...FAITS, compteurs: { rail: 5, auTravail: 4, aLaPass: 3, attend: 2, livres24h: 1 } }).compteurs;

    assert.deepEqual(comptes.map(({ libelle, nombre }) => [libelle, nombre]), [
      ["rail", 5],
      ["au travail", 4],
      ["à la pass", 3],
      ["t'attend", 2],
      ["livrés 24 h", 1],
    ]);
  });

  test("ses cooks en cours : le ticket, le titre, la station de chacun, dans l'ordre que la box a donné — rien d'autre", () => {
    const cooks = [
      { ticket: 21, titre: "L'export du journal", station: "box/claude" },
      { ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" },
      { ticket: 30, titre: "", station: "une/station-inconnue" },
    ];

    assert.deepEqual(tableau({ ...FAITS, cooks }).cooks.enCours, cooks);
  });

  test("aucun cook : la carte le dit", () => {
    assert.deepEqual(tableau({ ...FAITS, cooks: [] }).cooks, { enCours: [], vide: "aucun cook en cours" });
  });

  test("une box qui ne donne pas encore les cooks : la carte se dessine sans eux et le dit — ni une erreur, ni « aucun cook »", () => {
    const recue = dessiner(lue(rendus(SANS_COOKS)));

    assert.ok("tableau" in recue);
    assert.deepEqual(recue.tableau, { ...tableau(FAITS), cooks: { enCours: [], vide: "cooks en cours : pas lus — le runtime de cette box ne les donne pas encore dans `faits`. Ce n'est pas « aucun cook » : `run station` les montre" } });
  });

  test("le dernier événement : son type tel quel, son ticket, et son âge à la lecture — sur l'horloge de la box, pas celle du poste", () => {
    assert.equal(evenement(FAITS), "merge.done · #216 · 13 s avant la lecture");
    assert.equal(evenement({ ...FAITS, dernierEvenement: { seq: 3, at: "2026-10-12T08:01:11.000Z", type: "kitchen.stopped", ticket: null } }), "kitchen.stopped · 2 h 03 avant la lecture");
    assert.equal(evenement({ ...FAITS, dernierEvenement: { seq: 3, at: "2026-10-12T10:03:58.000Z", type: "un.type.inconnu", ticket: 7 } }), "un.type.inconnu · #7 · 13 s avant la lecture");
    assert.equal(evenement({ ...FAITS, dernierEvenement: null }), "aucun : le journal est vide");
  });

  test("l'écart entre le dernier tick et la lecture est affiché, et rien n'en est conclu", () => {
    assert.equal(tick(FAITS), "dernier tick 9 s avant la lecture");
    assert.equal(tick({ ...FAITS, dernierTick: "2026-10-10T10:04:11.000Z" }), "dernier tick 2 j avant la lecture");
    assert.equal(tick({ ...FAITS, dernierTick: null }), "aucun tick : runtime arrêté, ou pas encore de tick depuis son démarrage");
  });

  test("une durée se dit comme `status` la dit", () => {
    assert.deepEqual([0, 999, 59_000, 60_000, 12 * 60_000, 3_599_000, 3_600_000, (3 * 60 + 2) * 60_000, 24 * 3_600_000 - 1, 2 * 24 * 3_600_000].map(duree), ["0 s", "0 s", "59 s", "1 min", "12 min", "59 min", "1 h 00", "3 h 02", "23 h 59", "2 j"]);
    // Deux horloges ne se croisent pas ici — mais une forme écrite à la main ne doit pas rendre un âge négatif.
    assert.equal(duree(-5_000), "0 s");
  });
});

describe("un ticket s'ouvre sur son issue", () => {
  test("l'adresse est celle que la box a donnée pour ce ticket de ce projet — la vue ne nomme qu'un projet et un numéro", () => {
    const tenus = tenirFaits();
    tenus.recevoir(lue(rendus(FAITS)));
    tenus.recevoir({ ...lue(rendus({ ...FAITS, rail: [{ ticket: 14, etat: "pris", titre: "Autre", url: "https://github.com/benomite/parade/issues/14" }] })), projet: "parade" });

    assert.equal(tenus.adresse("brigade", 14), "https://github.com/benomite/brigade/issues/14");
    assert.equal(tenus.adresse("brigade", 21), "https://github.com/benomite/brigade/issues/21");
    assert.equal(tenus.adresse("parade", 14), "https://github.com/benomite/parade/issues/14");
    for (const [projet, ticket] of [["brigade", 15], ["parade", 21], ["absent", 14], ["brigade", "14"], [undefined, undefined], ["brigade", "https://exemple.fr"]]) assert.equal(tenus.adresse(projet, ticket), undefined);
  });

  test("seule une adresse https s'ouvre : ce que la box rend n'est pas lancé comme un fichier ou un programme", () => {
    const tenus = tenirFaits();
    const urls = ["file:///etc/passwd", "javascript:alert(1)", "http://github.com/benomite/brigade/issues/3", "ssh://box", "", "pas une adresse", "/Applications/Calculator.app"];
    tenus.recevoir(lue(rendus({ ...FAITS, rail: urls.map((url, rang) => ({ ticket: rang, etat: "pris", titre: "", url })) })));

    for (const rang of urls.keys()) assert.equal(tenus.adresse("brigade", rang), undefined, String(urls[rang]));
    assert.deepEqual(cartes(rail({ ...FAITS, rail: urls.map((url, rang) => ({ ticket: rang, etat: "pris", titre: "", url })) })).map((ticket) => ticket.ouvrable), urls.map(() => false));
  });

  test("une lecture ratée retire les adresses de la lecture d'avant, et `oublier` les retire toutes", () => {
    const tenus = tenirFaits();
    tenus.recevoir(lue(rendus(FAITS)));
    tenus.recevoir({ ...lue(rendus(FAITS)), projet: "parade" });

    assert.deepEqual(tenus.recevoir(lue("cuisine    ouverte\n")), dessiner(lue("cuisine    ouverte\n")));
    assert.equal(tenus.adresse("brigade", 14), undefined);
    assert.equal(tenus.adresse("parade", 14), "https://github.com/benomite/brigade/issues/14");

    tenus.oublier();
    assert.equal(tenus.adresse("parade", 14), undefined);
  });
});

// Un rail de chaque état, dans l'ordre de service, et le bloc `attend` que
// `status` écrit à côté : #12 et #21 y sont, #30 n'est pas sur le rail.
const ticket = (numero: number, etat: string) => ({ ticket: numero, etat, titre: `Ticket ${numero}`, url: `https://github.com/benomite/brigade/issues/${numero}` });
const RAIL = [ticket(9, "servi"), ticket(12, "en pass"), ticket(14, "pris"), ticket(15, "en pass"), ticket(16, "en attente"), ticket(21, "BLOQUÉ"), ticket(22, "en attente"), ticket(40, "86"), ticket(41, "au four")];
const BLOC = {
  bloc:
    "attend     4 décisions attendent le chef — la plus ancienne depuis 2 j\n" +
    "  claude  depuis 2 j  connexion Max absente — à rétablir : `claude /login` sous le compte du service, puis `run garde-fous -- reprendre`\n" +
    "  #21  depuis 3 h 02  BLOQUÉ : #17 abandonné (label `fire` retiré) — à débloquer : remettre #17 sur le rail, ou le retirer de la ligne `attend` de la fiche  Ticket 21\n" +
    "  #30  depuis 2 h  question du manager avant de découper l'épique — à répondre : sur l'issue, il la relit et la découpe ; ou fermer l'issue\n" +
    "  #12  depuis 4 min  livraison verte, non mergée faute de grant `merge` — à merger à la main : https://github.com/benomite/brigade/pull/31  Ticket 12\n" +
    "  sans grant, 1 livraison verte arrêtée : 0 mergée à la main, 0 fermée sans merge — aucun désaccord —, 1 encore ouverte\n" +
    "fin attend\n",
  a: "2026-10-12T10:04:20.000Z",
};
const rangs = (dessine: ReturnType<typeof rail>) => dessine.colonnes.map(({ nom, compte, cartes }) => [nom, compte, cartes.map(({ ticket }) => ticket)]);

describe("le rail en cinq colonnes", () => {
  test("quatre colonnes viennent du mot d'état de `faits`, dans l'ordre de service — et T'attend n'est pas lue tant que le bloc n'a pas été pris", () => {
    const dessine = rail({ ...FAITS, rail: RAIL });

    assert.deepEqual(rangs(dessine), [
      ["Sur le rail", "3", [16, 21, 22]],
      ["Au travail", "1", [14]],
      ["Pass", "2", [12, 15]],
      ["T'attend", "?", []],
      ["Livré", "1", [9]],
    ]);
    assert.match(dessine.colonnes[3]?.vide ?? "", /^pas lue : .* Ce n'est pas « rien ne t'attend »/);
    assert.ok(!("attendLu" in dessine));
  });

  test("la cinquième vient du bloc `attend` : un ticket qu'il nomme est dans T'attend et nulle part ailleurs, dans l'ordre du bloc, avec ce que sa ligne dit", () => {
    const dessine = rail({ ...FAITS, rail: RAIL }, BLOC);

    assert.deepEqual(rangs(dessine), [
      ["Sur le rail", "2", [16, 22]],
      ["Au travail", "1", [14]],
      ["Pass", "1", [15]],
      ["T'attend", "3", [21, 30, 12]],
      ["Livré", "1", [9]],
    ]);
    assert.equal(dessine.attendLu, BLOC.a);
    assert.deepEqual(dessine.colonnes[3]?.cartes[2], {
      ticket: 12,
      etat: "en pass",
      ton: "jaune",
      titre: "Ticket 12",
      ouvrable: true,
      attend: ["depuis 4 min  livraison verte, non mergée faute de grant `merge` — à merger à la main : https://github.com/benomite/brigade/pull/31  Ticket 12"],
    });
  });

  test("un ticket que le bloc nomme sans qu'il soit sur le rail a sa carte : son numéro et sa ligne — ni titre, ni état, ni adresse, que `faits` ne donne pas", () => {
    assert.deepEqual(rail({ ...FAITS, rail: RAIL }, BLOC).colonnes[3]?.cartes[1], {
      ticket: 30,
      ouvrable: false,
      attend: ["depuis 2 h  question du manager avant de découper l'épique — à répondre : sur l'issue, il la relit et la découpe ; ou fermer l'issue"],
    });
  });

  test("une ligne sans numéro — la station, le bilan faute de grant — n'est dans aucune colonne", () => {
    const sansTicket = { ...BLOC, bloc: BLOC.bloc.split("\n").filter((ligne) => !ligne.startsWith("  #")).join("\n") };
    const dessine = rail({ ...FAITS, rail: RAIL }, sansTicket);

    assert.deepEqual(dessine.colonnes[3], { nom: "T'attend", ton: "rouge", compte: "0", cartes: [], vide: "aucun ticket en tête d'une ligne du bloc `attend`" });
    assert.deepEqual(rangs(dessine), rangs(rail({ ...FAITS, rail: RAIL })).map((colonne) => (colonne[0] === "T'attend" ? ["T'attend", "0", []] : colonne)));
  });

  test("un ticket `86` ou d'un mot inconnu n'est d'aucune colonne : il est rendu à part, avec son mot — et dans T'attend si le bloc le nomme", () => {
    assert.deepEqual(rail({ ...FAITS, rail: RAIL }, BLOC).hors, [
      { ticket: 40, etat: "86", ton: "rouge", titre: "Ticket 40", ouvrable: true, attend: [] },
      { ticket: 41, etat: "au four", titre: "Ticket 41", ouvrable: true, attend: [] },
    ]);
    const remonte = rail({ ...FAITS, rail: RAIL }, { ...BLOC, bloc: "attend     1 décision attend le chef depuis 2 j\n  #40  depuis 2 j  remontée par la pass, rouge\nfin attend\n" });

    assert.deepEqual(remonte.colonnes[3]?.cartes.map(({ ticket, etat }) => [ticket, etat]), [[40, "86"]]);
    assert.deepEqual(remonte.hors.map(({ ticket }) => ticket), [41]);
  });

  test("un ticket nommé deux fois par le bloc n'a qu'une carte, qui porte ses deux lignes", () => {
    const double = rail({ ...FAITS, rail: RAIL }, { ...BLOC, bloc: "attend\n  #14  une ligne\n  #14  une autre\nfin attend\n" });

    assert.deepEqual(double.colonnes[3]?.cartes, [{ ticket: 14, etat: "pris", ton: "bleu", titre: "Ticket 14", ouvrable: true, attend: ["une ligne", "une autre"] }]);
    assert.equal(double.colonnes[3]?.compte, "1");
  });

  test("chaque ticket que `faits` rend est dessiné une fois, quel que soit le bloc", () => {
    for (const bloc of [undefined, BLOC, { ...BLOC, bloc: "attend     rien n'attend le chef\nfin attend\n" }]) assert.deepEqual(cartes(rail({ ...FAITS, rail: RAIL }, bloc)).map(({ ticket }) => ticket).filter((numero) => numero !== 30).sort((a, b) => a - b), RAIL.map(({ ticket }) => ticket).sort((a, b) => a - b));
  });
});

describe("le bloc `attend` tenu à côté des faits", () => {
  const status = (texte: string, a = BLOC.a): Lecture => ({ projet: "brigade", demande: 9, a, sorties: [{ commande: "status", texte }] });
  const colonne = (recue: ReturnType<ReturnType<typeof tenirFaits>["attendre"]>) => (recue !== undefined && "tableau" in recue ? recue.tableau.rail.colonnes[3] : undefined);

  test("un `status` lu après les faits les fait redessiner : T'attend se remplit, sous la demande et l'heure de la lecture de `faits`", () => {
    const tenus = tenirFaits();
    tenus.recevoir(lue(rendus({ ...FAITS, rail: RAIL })));
    const recue = tenus.attendre(mettreAPart(status(`cuisine    ouverte\n${BLOC.bloc}`)));

    assert.deepEqual(recue, { projet: "brigade", demande: 4, a: "2026-10-12T10:04:12.000Z", tableau: tableau({ ...FAITS, rail: RAIL }, BLOC) });
    assert.deepEqual(colonne(recue)?.cartes.map(({ ticket }) => ticket), [21, 30, 12]);
  });

  test("des faits lus après un `status` sont dessinés avec son bloc — celui de leur projet, pas d'un autre", () => {
    const tenus = tenirFaits();
    assert.equal(tenus.attendre(mettreAPart(status(BLOC.bloc))), undefined);

    assert.deepEqual(tenus.recevoir(lue(rendus({ ...FAITS, rail: RAIL }))), { ...dessiner(lue(rendus({ ...FAITS, rail: RAIL }))), tableau: tableau({ ...FAITS, rail: RAIL }, BLOC) });
    assert.deepEqual(tenus.recevoir({ ...lue(rendus({ ...FAITS, rail: RAIL })), projet: "parade" }), { ...dessiner(lue(rendus({ ...FAITS, rail: RAIL }))), projet: "parade" });
  });

  test("un `status` raté, ou sans bord, retire le bloc d'avant : T'attend n'est plus lue, et les tickets retournent dans leurs colonnes", () => {
    for (const sans of [status("cuisine    ouverte\n"), { projet: "brigade", demande: 9, a: BLOC.a, erreur: "ssh: connect to host box port 22: Connection refused", atteinte: false, cas: null }] satisfies Lecture[]) {
      const tenus = tenirFaits();
      tenus.recevoir(lue(rendus({ ...FAITS, rail: RAIL })));
      tenus.attendre(mettreAPart(status(BLOC.bloc)));

      assert.equal(colonne(tenus.attendre(mettreAPart(sans)))?.compte, "?");
      assert.deepEqual(tenus.recevoir(lue(rendus({ ...FAITS, rail: RAIL }))), dessiner(lue(rendus({ ...FAITS, rail: RAIL }))));
      // Rien n'a changé : rien n'est redessiné.
      assert.equal(tenus.attendre(mettreAPart(sans)), undefined);
    }
  });

  test("un projet dont `status` n'est plus lu perd son bloc : ses faits, relus plus tard, ne sont pas rangés d'après un bloc que plus rien ne rafraîchit", () => {
    const tenus = tenirFaits();
    const parade = { ...lue(rendus({ ...FAITS, rail: RAIL })), projet: "parade" };
    tenus.recevoir(lue(rendus({ ...FAITS, rail: RAIL })));
    tenus.recevoir(parade);
    tenus.attendre(mettreAPart(status(BLOC.bloc)));
    tenus.attendre(mettreAPart({ ...status(BLOC.bloc), projet: "parade" }));

    // La veille de `status` passe à parade seul : brigade est redessiné sans son bloc, parade garde le sien.
    assert.deepEqual(tenus.veiller(["parade"]), [dessiner(lue(rendus({ ...FAITS, rail: RAIL })))]);
    // Une heure après, #12 a été servi : il est dans Livré, pas dans T'attend d'après le bloc d'avant.
    const servi = tenus.recevoir(lue(rendus({ ...FAITS, rail: RAIL.map((connu) => (connu.ticket === 12 ? { ...connu, etat: "servi" } : connu)) })));
    assert.ok("tableau" in servi);
    assert.deepEqual(rangs(servi.tableau.rail).slice(3), [["T'attend", "?", []], ["Livré", "2", [9, 12]]]);
    assert.deepEqual(tenus.recevoir(parade), { ...dessiner(parade), tableau: tableau({ ...FAITS, rail: RAIL }, BLOC) });

    // Rien à lâcher : rien n'est redessiné. Et plus aucun projet lu lâche le dernier.
    assert.deepEqual(tenus.veiller(["parade", "brigade"]), []);
    assert.deepEqual(tenus.veiller([]).map(({ projet }) => projet), ["parade"]);
  });

  test("sans faits pour ce projet, rien n'est redessiné ; et `oublier` retire les blocs avec les faits", () => {
    const tenus = tenirFaits();
    tenus.recevoir(lue("cuisine    ouverte\n"));
    assert.equal(tenus.attendre(mettreAPart(status(BLOC.bloc))), undefined);

    tenus.oublier();
    assert.deepEqual(tenus.recevoir(lue(rendus({ ...FAITS, rail: RAIL }))), dessiner(lue(rendus({ ...FAITS, rail: RAIL }))));
  });
});

describe("la bannière d'arrêt", () => {
  test("elle se pose sur le « stop » du chef, un mot de la liste fermée — pas sur un runtime éteint, ni sur un mot inconnu", () => {
    assert.deepEqual(["arrêtée", "éteinte", "retenue", "ouverte", "ARRÊTÉE", "muette"].map((etat) => tableau({ ...FAITS, etat }).arretee), [true, false, false, false, false, false]);
  });

  test("son bouton est celui qui écrit la relance — la commande de « Piloter », écrite et pas envoyée", () => {
    const ecrit = ecritPar(BANNIERE.bouton, { nom: "parade", dossier: "/projets/parade", box: { hote: "box" } });

    assert.ok(BOUTONS.some(({ id }) => id === BANNIERE.bouton));
    assert.deepEqual(ecrit, { commande: "!ssh box brigade parade garde-fous reprendre" });
  });

  test("ce qu'elle dit de l'arrêt est ce que docs/runtime.md en dit", () => {
    assert.ok(doc.includes("| « stop » | Tous les cooks en cours sont arrêtés dans la seconde, et plus aucun n'est lancé |"));
    assert.ok(doc.includes("**Le\ndisjoncteur ouvert et le « stop » tiennent**, redémarrage compris, jusqu'à « reprendre »."));
    assert.deepEqual(BANNIERE.texte, [
      "CUISINE À L'ARRÊT — ton « stop » tient",
      "Tous les cooks en cours ont été arrêtés, et plus aucun n'est lancé — redémarrage du runtime compris, jusqu'à « reprendre ».",
    ]);
  });
});
