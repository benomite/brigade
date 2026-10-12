// Ce que l'app dessine : les faits que la box rend dans la forme de
// docs/runtime.md, « Les faits, pour un programme ». L'exemple de la doc est
// lu ici tel qu'il y est écrit ; une sortie qui n'est pas cette forme n'est
// jamais dessinée — ni tableau vide, ni zéros. Une couleur ne se pose que sur
// un mot des listes fermées.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { BOUTONS, ecritPar } from "../src/boutons.ts";
import type { Lecture } from "../src/box.ts";
import { BANNIERE, COMMANDE, comprendre, dessiner, duree, evenement, tableau, tenirFaits, tick, type Faits } from "../src/faits.ts";

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
};
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

  test("un mot d'état que l'app ne connaît pas est gardé tel quel — du projet comme d'un ticket", () => {
    const neuf = { ...FAITS, etat: "muette", rail: [{ ...FAITS.rail[0], etat: "au four" }] };

    assert.deepEqual(comprendre(rendus(neuf)), neuf);
  });

  test("un champ que l'app ne connaît pas ne casse rien, et n'est pas gardé", () => {
    assert.deepEqual(comprendre(rendus({ ...FAITS, quota: 62, rail: FAITS.rail.map((ticket) => ({ ...ticket, tenuPar: "cook-1" })) })), FAITS);
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
  });

  test("un compteur qui manque, ou qui n'est pas un nombre entier positif, refuse la forme entière : aucun n'est mis à zéro", () => {
    for (const nom of ["rail", "auTravail", "aLaPass", "attend", "livres24h"] as const) {
      for (const valeur of [undefined, null, "2", -1, 1.5, Number.NaN]) {
        assert.match(informe(rendus({ ...FAITS, compteurs: { ...FAITS.compteurs, [nom]: valeur } })), new RegExp(`« compteurs\\.${nom} »`), `${nom} = ${String(valeur)}`);
      }
    }
  });

  test("une lecture devient ce que la vue pose, sans rien y calculer : la pastille, cinq nombres, le dernier événement, le rail", () => {
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
        evenement: "merge.done · #216 · 13 s avant la lecture",
        rail: [
          { ticket: 14, etat: "pris", ton: "bleu", titre: "Le journal en ajout seul", ouvrable: true },
          { ticket: 21, etat: "BLOQUÉ", ton: "rouge", titre: "L'export du journal", ouvrable: true },
        ],
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
    assert.deepEqual(dessiner({ ...echec, cas: "sans-droit" }), { ...echec, cas: "sans-droit", titre: "JOINT, MAIS `faits` N'A PAS RÉPONDU" });
  });

  test("une box pas jointe est dite pas jointe, avec ce que `ssh` a rendu", () => {
    const echec: Lecture = { projet: "brigade", demande: 4, a: "2026-10-12T10:04:12.000Z", erreur: "ssh: connect to host box port 22: Operation timed out\n→ code de sortie 255", atteinte: false, cas: "ssh-en-echec" };

    assert.deepEqual(dessiner(echec), { ...echec, titre: "PAS JOINT" });
  });
});

// La couleur que la vue reçoit pour un mot d'état — du projet, ou de son premier ticket.
const tonDeProjet = (etat: string) => tableau({ ...FAITS, etat }).ton;
const tonDeTicket = (etat: string) => tableau({ ...FAITS, rail: [{ ticket: 1, etat, titre: "", url: "" }] }).rail[0]?.ton;

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
    assert.deepEqual(tableau({ ...FAITS, rail: urls.map((url, rang) => ({ ticket: rang, etat: "pris", titre: "", url })) }).rail.map((ticket) => ticket.ouvrable), urls.map(() => false));
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
