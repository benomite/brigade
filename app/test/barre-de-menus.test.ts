// L'état de la cuisine dans la barre des menus du Mac et la zone de notification de Windows (#3269) : la ligne d'un coup
// d'œil — « 3 cooking · 1 for you » —, le menu des questions qui attendent, l'icône posée ou retirée selon le réglage, et
// la pastille peinte sous Windows. Les faits sont ceux que la veille de l'app tient (faits.ts, `tenirFaits`), reçus d'une
// lecture de `facts` comme le process principal les reçoit : aucun Electron n'est lancé, l'icône est une doublure.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { avecPastille, enAttente, etatDeLaCuisine, ligneDe, menuDe, tenirBarreDeMenus, type Entree, type Icone, type ProjetLu } from "../src/barre-de-menus.ts";
import type { Lecture } from "../src/box.ts";
import { tenirFaits, type Faits } from "../src/faits.ts";

const A = "2026-11-11T10:00:00.000Z";
const desFaits = (champs: Partial<Faits> = {}, compteurs: Partial<Faits["compteurs"]> = {}): Faits => ({
  etat: "ouverte",
  lu: A,
  dernierTick: A,
  compteurs: { rail: 4, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0, ...compteurs },
  dernierEvenement: null,
  rail: [],
  cooks: [],
  attend: [],
  livres: [],
  urgence: null,
  ...champs,
});
const cook = (ticket: number) => ({ ticket, titre: `ticket ${ticket}`, station: "box/claude" });
const QUESTION = { sorte: "product-question", texte: "Open the beta to everyone?\n\n- [resume] Yes\n- [drop] No" };
// Une lecture de `facts`, telle que la veille la donne au process principal.
const lecture = (projet: string, faits: Faits): Lecture => ({ projet, demande: 1, a: A, sorties: [{ commande: "facts", texte: `${JSON.stringify(faits)}\n` }] });

describe("la ligne d'un coup d'œil", () => {
  test("combien de cooks cuisent et combien de questions attendent le chef, sur tous les projets lus", () => {
    const tenus = tenirFaits();
    tenus.recevoir(lecture("brigade", desFaits({ cooks: [cook(1), cook(2)], attend: [{ ticket: 7, titre: "Open the beta", url: null, chef: QUESTION }] }, { attend: 1, auTravail: 2 })));
    tenus.recevoir(lecture("parade", desFaits({ cooks: [cook(9)] }, { auTravail: 1 })));
    const lus: ProjetLu[] = ["brigade", "parade"].map((nom) => ({ nom, faits: tenus.dernier(nom)?.faits }));

    const etat = etatDeLaCuisine(lus);
    assert.equal(ligneDe(etat), "3 cooking · 1 for you");
    assert.deepEqual(etat.questions, [{ projet: "brigade", ticket: 7, question: "Open the beta to everyone?" }]);
  });

  test("rien ne cuit, rien n'attend : la ligne le dit en chiffres", () => {
    assert.equal(ligneDe(etatDeLaCuisine([{ nom: "brigade", faits: desFaits() }])), "0 cooking · 0 for you");
  });

  test("un projet pas encore lu n'est compté pour rien, et la ligne dit combien ne le sont pas ; rien de lu, jamais « 0 »", () => {
    assert.equal(ligneDe(etatDeLaCuisine([{ nom: "brigade", faits: desFaits({ cooks: [cook(1)] }) }, { nom: "parade", faits: undefined }])), "1 cooking · 0 for you · 1 not read");
    assert.equal(ligneDe(etatDeLaCuisine([{ nom: "brigade", faits: undefined }])), "not read yet");
  });

  test("un runtime d'avant la liste des cooks : ses cooks au travail sont comptés", () => {
    const { cooks: _cooks, ...sansCooks } = desFaits({}, { auTravail: 2 });
    assert.equal(ligneDe(etatDeLaCuisine([{ nom: "brigade", faits: sansCooks }])), "2 cooking · 0 for you");
  });

  test("un runtime d'avant `attend` : ses décisions sont comptées, et son menu ouvre le projet", () => {
    const { attend: _attend, ...sansAttend } = desFaits({}, { attend: 2 });
    const etat = etatDeLaCuisine([{ nom: "brigade", faits: sansAttend }]);
    assert.equal(ligneDe(etat), "0 cooking · 2 for you");
    assert.deepEqual(menuDe(etat)[2], { genre: "projet", libelle: "brigade — 2 awaiting you", projet: "brigade" });
  });
});

describe("le menu du clic", () => {
  test("chaque question qui attend — son projet, son ticket, sa question — ouvre sa carte ; la ligne en tête, la fenêtre au pied", () => {
    const etat = etatDeLaCuisine([
      { nom: "brigade", faits: desFaits({ attend: [{ ticket: 7, titre: "Open the beta", url: null, chef: QUESTION }, { ticket: 8, titre: "Merge the export", url: null }, { ticket: 9, titre: " ", url: null }] }, { attend: 3 }) },
    ]);
    assert.deepEqual(menuDe(etat), [
      { genre: "texte", libelle: "0 cooking · 3 for you" },
      { genre: "separateur" },
      { genre: "carte", libelle: "brigade #7 — Open the beta to everyone?", projet: "brigade", ticket: 7 },
      { genre: "carte", libelle: "brigade #8 — Merge the export", projet: "brigade", ticket: 8 },
      { genre: "carte", libelle: "brigade #9 — #9", projet: "brigade", ticket: 9 },
      { genre: "separateur" },
      { genre: "app", libelle: "Open brigade" },
    ]);
  });

  test("rien n'attend : le menu le dit, sans entrée à cliquer", () => {
    const menu = menuDe(etatDeLaCuisine([{ nom: "brigade", faits: desFaits() }]));
    assert.deepEqual(menu[2], { genre: "texte", libelle: "nothing waits for you" });
  });

  test("une longue question est coupée, son projet et son numéro jamais", () => {
    const longue = "Should the kitchen stop taking new tickets while the base is red, or keep cooking those that do not touch it at all?";
    const [, , entree] = menuDe(etatDeLaCuisine([{ nom: "brigade", faits: desFaits({ attend: [{ ticket: 3, titre: longue, url: null }] }, { attend: 1 }) }]));
    assert.ok(entree?.genre === "carte");
    assert.ok(entree.libelle.startsWith("brigade #3 — Should the kitchen"));
    assert.ok(entree.libelle.endsWith("…"));
    assert.ok(entree.libelle.length <= "brigade #3 — ".length + 80);
  });
});

describe("l'icône tenue", () => {
  type Journal = { poses: [string, number][]; menus: Entree[][]; retirees: number; creees: number };
  const doublure = (journal: Journal, refus?: string) => (): Icone => {
    if (refus !== undefined) throw new Error(refus);
    journal.creees++;
    return { poser: (ligne, questions) => void journal.poses.push([ligne, questions]), menu: (entrees) => void journal.menus.push(entrees), retirer: () => void journal.retirees++ };
  };
  const neuf = (): Journal => ({ poses: [], menus: [], retirees: 0, creees: 0 });
  const UN: ProjetLu[] = [{ nom: "brigade", faits: desFaits({ cooks: [cook(1)], attend: [{ ticket: 7, titre: "Open the beta", url: null }] }, { attend: 1 }) }];

  test("allumée, elle se pose avec sa ligne et son menu, et ne se redit que lorsque ce qu'elle dit change", () => {
    const journal = neuf();
    const barre = tenirBarreDeMenus({ creer: doublure(journal) });
    barre.poser(true, UN);
    barre.poser(true, UN);
    assert.equal(journal.creees, 1);
    assert.deepEqual(journal.poses, [["1 cooking · 1 for you", 1]]);
    assert.equal(journal.menus.length, 1);

    barre.poser(true, [{ nom: "brigade", faits: desFaits() }]);
    assert.deepEqual(journal.poses.at(-1), ["0 cooking · 0 for you", 0]);
  });

  test("éteinte dans Settings, elle est retirée ; rallumée, elle revient avec ce qui est lu", () => {
    const journal = neuf();
    const barre = tenirBarreDeMenus({ creer: doublure(journal) });
    barre.poser(false, UN);
    assert.equal(journal.creees, 0, "éteinte, aucune icône n'est posée");
    barre.poser(true, UN);
    barre.poser(false, UN);
    assert.equal(journal.retirees, 1);
    barre.poser(true, UN);
    assert.equal(journal.creees, 2);
    assert.deepEqual(journal.poses.at(-1), ["1 cooking · 1 for you", 1]);
    barre.fermer();
    assert.equal(journal.retirees, 2);
  });

  test("une icône que le système refuse : la raison est dite une fois, l'app continue, et la suivante est retentée", () => {
    const dites: string[] = [];
    const journal = neuf();
    let refus: string | undefined = "its icon could not be read: /nulle/part.png";
    const barre = tenirBarreDeMenus({ creer: () => doublure(journal, refus)(), dire: (ligne) => void dites.push(ligne) });
    barre.poser(true, UN);
    barre.poser(true, UN);
    assert.deepEqual(dites, ["brigade: the kitchen's state could not be shown in the menu bar — its icon could not be read: /nulle/part.png"]);
    refus = undefined;
    barre.poser(true, UN);
    assert.equal(journal.creees, 1);
    assert.deepEqual(journal.poses, [["1 cooking · 1 for you", 1]]);
  });
});

describe("la pastille de l'icône sous Windows", () => {
  const COTE = 16;
  const vide = () => Buffer.alloc(COTE * COTE * 4);
  const a = (bitmap: Buffer, x: number, y: number) => [...bitmap.subarray((y * COTE + x) * 4, (y * COTE + x) * 4 + 4)];

  test("sans question, l'icône telle quelle", () => {
    assert.deepEqual(avecPastille(vide(), COTE, 0), vide());
  });

  test("avec des questions, un disque en bas à droite, le chiffre au milieu ; l'icône reçue n'est pas touchée", () => {
    const recue = vide();
    const peinte = avecPastille(recue, COTE, 3);
    assert.deepEqual(recue, vide());
    assert.deepEqual(a(peinte, 0, 0), [0, 0, 0, 0], "le haut à gauche reste l'icône");
    assert.deepEqual(a(peinte, COTE - 2, COTE - 5), [0x3d, 0xa3, 0xe8, 0xff], "le disque");
    // Le 3 : la ligne du haut de sa grille, pleine.
    const y = Math.round(COTE - 4.5 - 2.5);
    const x = Math.round(COTE - 4.5 - 1.5);
    assert.deepEqual([0, 1, 2].map((i) => a(peinte, x + i, y)), [[0xff, 0xff, 0xff, 0xff], [0xff, 0xff, 0xff, 0xff], [0xff, 0xff, 0xff, 0xff]]);
  });

  test("au-delà de 9, « + » ; et à 32 px, le dessin est à l'échelle", () => {
    assert.notDeepEqual(avecPastille(vide(), COTE, 12), avecPastille(vide(), COTE, 9));
    const grand = avecPastille(Buffer.alloc(32 * 32 * 4), 32, 1);
    assert.equal(grand.length, 32 * 32 * 4);
    // Le bas du disque, sous le chiffre.
    assert.deepEqual([...grand.subarray((31 * 32 + 23) * 4, (31 * 32 + 23) * 4 + 4)], [0x3d, 0xa3, 0xe8, 0xff]);
  });

  test("le compte peint est celui des questions qui attendent, nommées ou non", () => {
    const { attend: _attend, ...sansAttend } = desFaits({}, { attend: 2 });
    assert.equal(enAttente(etatDeLaCuisine([{ nom: "a", faits: sansAttend }, { nom: "b", faits: desFaits({ attend: [{ ticket: 1, titre: "x", url: null }] }, { attend: 1 }) }])), 3);
  });
});

describe("l'icône livrée", () => {
  // Dans `src/`, que les paquets du Mac et de Windows livrent tous deux (packaging/construire.ts, packaging/windows.ts).
  const ICONES = join(import.meta.dirname, "../src/icones");
  const taille = (fichier: string) => {
    const png = readFileSync(join(ICONES, fichier));
    assert.equal(png.subarray(1, 4).toString("ascii"), "PNG", fichier);
    return [png.readUInt32BE(16), png.readUInt32BE(20)];
  };

  test("16 px, et sa version @2x de 32 px qu'Electron prend sur un écran Retina", () => {
    assert.deepEqual(taille("barre-de-menus.png"), [16, 16]);
    assert.deepEqual(taille("barre-de-menus@2x.png"), [32, 32]);
  });

  test("le process principal la pose depuis ce dossier, et la redit à chaque lecture de `facts`", () => {
    const principal = readFileSync(join(import.meta.dirname, "../src/main.ts"), "utf8");
    assert.ok(principal.includes('join(import.meta.dirname, "icones", "barre-de-menus.png")'));
    const veille = /const veilleDesFaits = ouvrirVeilleDuTableau\(\{[\s\S]*?\n\}\);/.exec(principal)?.[0] ?? assert.fail("pas de veille des faits");
    assert.ok(veille.includes("poserLaBarreDeMenus();"), "une lecture de `facts` ne redit pas l'icône");
  });
});
