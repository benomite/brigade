// L'état de la cuisine dans la barre des menus du Mac et la zone de notification de Windows (#3269) : la ligne d'un coup
// d'œil — « 3 cooking · 1 for you » —, le menu des questions qui attendent, l'icône posée ou retirée selon le réglage, et
// la pastille peinte sous Windows. Les faits sont ceux que la veille de l'app tient (facts.ts, `tenirFaits`), reçus d'une
// lecture de `facts` comme le process principal les reçoit : aucun Electron n'est lancé, l'icône est une doublure.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { withPill } from "../src/menu-bar.ts";
import type { Reading } from "../src/box.ts";
import { type Facts } from "../src/facts.ts";

const A = "2026-11-11T10:00:00.000Z";
const cook = (ticket: number) => ({ ticket, titre: `ticket ${ticket}`, station: "box/claude" });
const QUESTION = { sorte: "product-question", texte: "Open the beta to everyone?\n\n- [resume] Yes\n- [drop] No" };
// Une lecture de `facts`, telle que la veille la donne au process principal.
const reading = (project: string, facts: Facts): Reading => ({ projet: project, demande: 1, a: A, sorties: [{ commande: "facts", texte: `${JSON.stringify(facts)}\n` }] });

describe("la ligne d'un coup d'œil", () => {




});

describe("le menu du clic", () => {


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
