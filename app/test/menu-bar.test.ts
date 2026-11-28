// L'état de la cuisine dans la barre des menus du Mac et la zone de notification de Windows (#3269) : la ligne d'un coup
// d'œil — « 3 cooking · 1 for you » —, le menu des questions qui attendent, l'icône posée ou retirée selon le réglage, et
// la pastille peinte sous Windows. Les faits sont ceux que la veille de l'app tient (facts.ts, `tenirFaits`), reçus d'une
// lecture de `facts` comme le process principal les reçoit : aucun Electron n'est lancé, l'icône est une doublure.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { withPill, queued, kitchenState, lineOf, menuOf, holdMenuBar, type Entry, type Icon, type ProjectRead } from "../src/menu-bar.ts";
import type { Reading } from "../src/box.ts";
import { holdFacts, type Facts } from "../src/facts.ts";

const A = "2026-11-11T10:00:00.000Z";
const someFacts = (fields: Partial<Facts> = {}, counters: Partial<Facts["compteurs"]> = {}): Facts => ({
  etat: "ouverte",
  lu: A,
  compteurs: { rail: 4, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0, ...counters },
  attend: [],
  
 
  ...fields,
});
const cook = (ticket: number) => ({ ticket, titre: `ticket ${ticket}`, station: "box/claude" });
const QUESTION = { sorte: "product-question", texte: "Open the beta to everyone?\n\n- [resume] Yes\n- [drop] No" };
// Une lecture de `facts`, telle que la veille la donne au process principal.
const reading = (project: string, facts: Facts): Reading => ({ projet: project, demande: 1, a: A, sorties: [{ commande: "facts", texte: `${JSON.stringify(facts)}\n` }] });

describe("la ligne d'un coup d'œil", () => {
  test("combien de cooks cuisent et combien de questions attendent le chef, sur tous les projets lus", () => {
    const heldOnes = holdFacts();
    heldOnes.recevoir(reading("brigade", someFacts({  attend: [{ ticket: 7, titre: "Open the beta", url: null, chef: QUESTION }] }, { attend: 1, auTravail: 2 })));
    heldOnes.recevoir(reading("parade", someFacts({  }, { auTravail: 1 })));
    const readOnes: ProjectRead[] = ["brigade", "parade"].map((name) => ({ nom: name, faits: heldOnes.dernier(name)?.faits }));

    const state = kitchenState(readOnes);
    assert.equal(lineOf(state), "3 cooking · 1 for you");
    assert.deepEqual(state.questions, [{ projet: "brigade", ticket: 7, question: "Open the beta to everyone?" }]);
  });

  test("rien ne cuit, rien n'attend : la ligne le dit en chiffres", () => {
    assert.equal(lineOf(kitchenState([{ nom: "brigade", faits: someFacts() }])), "0 cooking · 0 for you");
  });

  test("un projet pas encore lu n'est compté pour rien, et la ligne dit combien ne le sont pas ; rien de lu, jamais « 0 »", () => {
    assert.equal(lineOf(kitchenState([{ nom: "brigade", faits: someFacts({  }) }, { nom: "parade", faits: undefined }])), "1 cooking · 0 for you · 1 not read");
    assert.equal(lineOf(kitchenState([{ nom: "brigade", faits: undefined }])), "not read yet");
  });

  test("un runtime d'avant la liste des cooks : ses cooks au travail sont comptés", () => {
    const { cooks: _cooks, ...withoutCooks } = someFacts({}, { auTravail: 2 });
    assert.equal(lineOf(kitchenState([{ nom: "brigade", faits: withoutCooks }])), "2 cooking · 0 for you");
  });

  test("un runtime d'avant `attend` : ses décisions sont comptées, et son menu ouvre le projet", () => {
    const { attend: _awaiting, ...withoutAwaiting } = someFacts({}, { attend: 2 });
    const state = kitchenState([{ nom: "brigade", faits: withoutAwaiting }]);
    assert.equal(lineOf(state), "0 cooking · 2 for you");
    assert.deepEqual(menuOf(state)[2], { genre: "projet", libelle: "brigade — 2 awaiting you", projet: "brigade" });
  });
});

describe("le menu du clic", () => {
  test("chaque question qui attend — son projet, son ticket, sa question — ouvre sa carte ; la ligne en tête, la fenêtre au pied", () => {
    const state = kitchenState([
      { nom: "brigade", faits: someFacts({ attend: [{ ticket: 7, titre: "Open the beta", url: null, chef: QUESTION }, { ticket: 8, titre: "Merge the export", url: null }, { ticket: 9, titre: " ", url: null }] }, { attend: 3 }) },
    ]);
    assert.deepEqual(menuOf(state), [
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
    const menu = menuOf(kitchenState([{ nom: "brigade", faits: someFacts() }]));
    assert.deepEqual(menu[2], { genre: "texte", libelle: "nothing waits for you" });
  });

  test("une longue question est coupée, son projet et son numéro jamais", () => {
    const long = "Should the kitchen stop taking new tickets while the base is red, or keep cooking those that do not touch it at all?";
    const [, , entry] = menuOf(kitchenState([{ nom: "brigade", faits: someFacts({ attend: [{ ticket: 3, titre: long, url: null }] }, { attend: 1 }) }]));
    assert.ok(entry?.genre === "carte");
    assert.ok(entry.libelle.startsWith("brigade #3 — Should the kitchen"));
    assert.ok(entry.libelle.endsWith("…"));
    assert.ok(entry.libelle.length <= "brigade #3 — ".length + 80);
  });
});

describe("l'icône tenue", () => {
  type Log = { poses: [string, number][]; menus: Entry[][]; retirees: number; creees: number };
  const standIn = (log: Log, refusal?: string) => (): Icon => {
    if (refusal !== undefined) throw new Error(refusal);
    log.creees++;
    return { poser: (line, questions) => void log.poses.push([line, questions]), menu: (entries) => void log.menus.push(entries), retirer: () => void log.retirees++ };
  };
  const fresh = (): Log => ({ poses: [], menus: [], retirees: 0, creees: 0 });
  const ONE: ProjectRead[] = [{ nom: "brigade", faits: someFacts({  attend: [{ ticket: 7, titre: "Open the beta", url: null }] }, { attend: 1 }) }];

  test("allumée, elle se pose avec sa ligne et son menu, et ne se redit que lorsque ce qu'elle dit change", () => {
    const log = fresh();
    const bar = holdMenuBar({ creer: standIn(log) });
    bar.poser(true, ONE);
    bar.poser(true, ONE);
    assert.equal(log.creees, 1);
    assert.deepEqual(log.poses, [["1 cooking · 1 for you", 1]]);
    assert.equal(log.menus.length, 1);

    bar.poser(true, [{ nom: "brigade", faits: someFacts() }]);
    assert.deepEqual(log.poses.at(-1), ["0 cooking · 0 for you", 0]);
  });

  test("éteinte dans Settings, elle est retirée ; rallumée, elle revient avec ce qui est lu", () => {
    const log = fresh();
    const bar = holdMenuBar({ creer: standIn(log) });
    bar.poser(false, ONE);
    assert.equal(log.creees, 0, "éteinte, aucune icône n'est posée");
    bar.poser(true, ONE);
    bar.poser(false, ONE);
    assert.equal(log.retirees, 1);
    bar.poser(true, ONE);
    assert.equal(log.creees, 2);
    assert.deepEqual(log.poses.at(-1), ["1 cooking · 1 for you", 1]);
    bar.fermer();
    assert.equal(log.retirees, 2);
  });

  test("une icône que le système refuse : la raison est dite une fois, l'app continue, et la suivante est retentée", () => {
    const saidEntries: string[] = [];
    const log = fresh();
    let refusal: string | undefined = "its icon could not be read: /nulle/part.png";
    const bar = holdMenuBar({ creer: () => standIn(log, refusal)(), dire: (line) => void saidEntries.push(line) });
    bar.poser(true, ONE);
    bar.poser(true, ONE);
    assert.deepEqual(saidEntries, ["brigade: the kitchen's state could not be shown in the menu bar — its icon could not be read: /nulle/part.png"]);
    refusal = undefined;
    bar.poser(true, ONE);
    assert.equal(log.creees, 1);
    assert.deepEqual(log.poses, [["1 cooking · 1 for you", 1]]);
  });
});

describe("la pastille de l'icône sous Windows", () => {
  const SIDE = 16;
  const empty = () => Buffer.alloc(SIDE * SIDE * 4);
  const a = (bitmap: Buffer, x: number, y: number) => [...bitmap.subarray((y * SIDE + x) * 4, (y * SIDE + x) * 4 + 4)];

  test("sans question, l'icône telle quelle", () => {
    assert.deepEqual(withPill(empty(), SIDE, 0), empty());
  });

  test("avec des questions, un disque en bas à droite, le chiffre au milieu ; l'icône reçue n'est pas touchée", () => {
    const receivedOne = empty();
    const painted = withPill(receivedOne, SIDE, 3);
    assert.deepEqual(receivedOne, empty());
    assert.deepEqual(a(painted, 0, 0), [0, 0, 0, 0], "le haut à gauche reste l'icône");
    assert.deepEqual(a(painted, SIDE - 2, SIDE - 5), [0x3d, 0xa3, 0xe8, 0xff], "le disque");
    // Le 3 : la ligne du haut de sa grille, pleine.
    const y = Math.round(SIDE - 4.5 - 2.5);
    const x = Math.round(SIDE - 4.5 - 1.5);
    assert.deepEqual([0, 1, 2].map((i) => a(painted, x + i, y)), [[0xff, 0xff, 0xff, 0xff], [0xff, 0xff, 0xff, 0xff], [0xff, 0xff, 0xff, 0xff]]);
  });

  test("au-delà de 9, « + » ; et à 32 px, le dessin est à l'échelle", () => {
    assert.notDeepEqual(withPill(empty(), SIDE, 12), withPill(empty(), SIDE, 9));
    const grand = withPill(Buffer.alloc(32 * 32 * 4), 32, 1);
    assert.equal(grand.length, 32 * 32 * 4);
    // Le bas du disque, sous le chiffre.
    assert.deepEqual([...grand.subarray((31 * 32 + 23) * 4, (31 * 32 + 23) * 4 + 4)], [0x3d, 0xa3, 0xe8, 0xff]);
  });

  test("le compte peint est celui des questions qui attendent, nommées ou non", () => {
    const { attend: _awaiting, ...withoutAwaiting } = someFacts({}, { attend: 2 });
    assert.equal(queued(kitchenState([{ nom: "a", faits: withoutAwaiting }, { nom: "b", faits: someFacts({ attend: [{ ticket: 1, titre: "x", url: null }] }, { attend: 1 }) }])), 3);
  });
});

describe("l'icône livrée", () => {
  // Dans `src/`, que les paquets du Mac et de Windows livrent tous deux (packaging/construire.ts, packaging/windows.ts).
  const ICONS = join(import.meta.dirname, "../src/icons");
  const size = (file: string) => {
    const png = readFileSync(join(ICONS, file));
    assert.equal(png.subarray(1, 4).toString("ascii"), "PNG", file);
    return [png.readUInt32BE(16), png.readUInt32BE(20)];
  };

  test("16 px, et sa version @2x de 32 px qu'Electron prend sur un écran Retina", () => {
    assert.deepEqual(size("menu-bar.png"), [16, 16]);
    assert.deepEqual(size("menu-bar@2x.png"), [32, 32]);
  });

  test("le process principal la pose depuis ce dossier, et la redit à chaque lecture de `facts`", () => {
    const principal = readFileSync(join(import.meta.dirname, "../src/main.ts"), "utf8");
    // Le chemin de l'icône est partagé avec l'icône de la station de fond (tray/icon.ts, #3631).
    const icon = readFileSync(join(import.meta.dirname, "../src/tray/icon.ts"), "utf8");
    assert.ok(icon.includes('join(import.meta.dirname, "..", "icons", "menu-bar.png")'));
    assert.ok(principal.includes('import { createTheIcon, ICON_OF_THE_BAR } from ' + '"./tray/icon.ts";'));
    assert.ok(principal.includes("nativeImage.createFromPath(ICON_OF_THE_BAR)"));
    const standby = /const factsWatch = openStandbyOfBoard\(\{[\s\S]*?\n\}\);/.exec(principal)?.[0] ?? assert.fail("pas de veille des faits");
    assert.ok(standby.includes("setTheMenuBar();"), "une lecture de `facts` ne redit pas l'icône");
  });
});
