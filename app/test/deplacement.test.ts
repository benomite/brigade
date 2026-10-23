// Ranger une carte de « On the rail » (ticket 1347) : le process principal joue `rail move <ticket> --before|--after
// <voisin>` là où la cuisine du projet tourne, pour deux tickets en attente sur le rail que les derniers `facts` donnent,
// et rend ce que le runtime en dit — placé, ou pourquoi rien n'a bougé, en une phrase.
// Et ce que `facts` en donne à la colonne : l'ordre du runtime, la priorité de chaque carte, la raison de la tête.
import assert from "node:assert/strict";
import type { ExecFileException } from "node:child_process";
import { describe, test } from "node:test";
import type { Lu, Rendu } from "../src/box.ts";
import { mettreAPart } from "../src/attend.ts";
import { deplacerLaCarte, PAS_LU, raisonDuRefus, SANS_GESTE } from "../src/deplacement.ts";
import { SANS_PRIO, tenirFaits, type Faits } from "../src/faits.ts";

const BOX: Lu = { nom: "parade", cuisine: { hote: "box" } };
const ICI: Lu = { nom: "parade", cuisine: { locale: { node: "/usr/bin/node", runtime: "/Applications/brigade/runtime", racine: "/Users/chef/.brigade", env: {} } } };
const EN_FILE: ReadonlySet<number> = new Set([21, 22, 23]);
// Ce que la station rend d'un refus de `rail move` (runtime/src/montrer-rail.ts), mot pour mot.
const REFUS = "brigade : #22 is not touched: #22 awaits #21, so it cannot be placed before it — cost: none: only the order of service changes; no cook is launched, nothing is spent\n";

const lances: { lu: Lu; commande: string }[] = [];
const rendant =
  (rendu: Omit<Rendu, "lance">) =>
  async (lu: Lu, commande: string): Promise<Rendu> => {
    lances.push({ lu, commande });
    return { lance: `$ ssh -o BatchMode=yes -- box brigade parade ${commande}`, ...rendu };
  };
const sortiEn = (code: number) => Object.assign(new Error(`exit ${code}`), { code }) as ExecFileException;

describe("le process principal joue `rail move`", () => {
  test("placée avant : la commande part là où la cuisine tourne, et le runtime dit ce qu'il a fait", async () => {
    lances.length = 0;
    const rendu = await deplacerLaCarte(BOX, EN_FILE, 23, 21, "before", rendant({ erreur: null, sortie: "#23: placed before #21, prio:1 — cost: none\n", erreurs: "" }), 30_000);
    assert.deepEqual(lances, [{ lu: BOX, commande: "rail move 23 --before 21" }]);
    assert.deepEqual(rendu, { place: true, dit: "#23: placed before #21, prio:1 — cost: none" });
  });

  test("placée après, sur une cuisine de cet ordinateur : la même commande, sans ssh", async () => {
    lances.length = 0;
    const rendu = await deplacerLaCarte(ICI, EN_FILE, 21, 23, "after", rendant({ erreur: null, sortie: "#21: placed after #23, prio:2 — cost: none\n", erreurs: "" }), 30_000);
    assert.deepEqual(lances, [{ lu: ICI, commande: "rail move 21 --after 23" }]);
    assert.ok("place" in rendu);
  });

  test("refusée — elle passerait devant ce qu'elle attend : la phrase du runtime, qui nomme le ticket attendu, sans son prix ; ce que la station a rendu au survol", async () => {
    const rendu = await deplacerLaCarte(BOX, EN_FILE, 22, 21, "before", rendant({ erreur: sortiEn(1), sortie: "", erreurs: REFUS }), 30_000);
    assert.ok("refus" in rendu);
    assert.equal(rendu.refus, "#22 awaits #21, so it cannot be placed before it.");
    assert.match(rendu.detail, /rail move 22 --before 21/);
    assert.match(rendu.detail, /exit code 1/);
  });

  test("une station dont le runtime ne connaît pas `rail move` : un constat, sans usage ni code à l'écran", async () => {
    for (const code of [2, 66]) {
      const rendu = await deplacerLaCarte(BOX, EN_FILE, 22, 21, "before", rendant({ erreur: sortiEn(code), sortie: "", erreurs: "brigade : unknown gesture: “move”\nusage: …\n" }), 30_000);
      assert.ok("refus" in rendu);
      assert.equal(rendu.refus, SANS_GESTE);
    }
  });

  test("rien ne part pour un ticket qui n'est plus en attente, un côté inconnu, une carte à côté d'elle-même, un rail pas lu", async () => {
    lances.length = 0;
    const jamais = rendant({ erreur: null, sortie: "", erreurs: "" });
    assert.match((await deplacerLaCarte(BOX, EN_FILE, 22, 14, "before", jamais, 30_000) as { refus: string }).refus, /#14 is no longer on the rail/);
    assert.match((await deplacerLaCarte(BOX, EN_FILE, 22, 21, "under", jamais, 30_000) as { refus: string }).refus, /neither before nor after/);
    assert.match((await deplacerLaCarte(BOX, EN_FILE, 22, 22, "before", jamais, 30_000) as { refus: string }).refus, /no other ticket/);
    assert.match((await deplacerLaCarte(BOX, EN_FILE, "22; rm -rf /", 21, "before", jamais, 30_000) as { refus: string }).refus, /no other ticket/);
    assert.equal((await deplacerLaCarte(BOX, undefined, 22, 21, "before", jamais, 30_000) as { refus: string }).refus, PAS_LU);
    assert.match((await deplacerLaCarte(undefined, EN_FILE, 22, 21, "before", jamais, 30_000) as { refus: string }).refus, /no station/);
    assert.deepEqual(lances, []);
  });

  test("la phrase d'un refus d'une autre forme est dite telle quelle, en une phrase", () => {
    assert.equal(raisonDuRefus("brigade : #22 is not touched: #21 left the rail or changed priority meanwhile: place #22 again — cost: none"), "#21 left the rail or changed priority meanwhile: place #22 again.");
    assert.equal(raisonDuRefus("brigade : this log does not have the rail state yet: restart the runtime, which recomputes it"), "This log does not have the rail state yet: restart the runtime, which recomputes it.");
  });
});

describe("ce que `facts` donne à la colonne « On the rail »", () => {
  const issue = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
  const enFile = (ticket: number, raison: string | null = null) => ({ ticket, etat: "en attente", titre: `Ticket ${ticket}`, url: issue(ticket), activite: null, raison });
  const FAITS: Faits = {
    etat: "ouverte",
    lu: "2026-10-20T10:04:11.000Z",
    dernierTick: null,
    compteurs: { rail: 3, auTravail: 1, aLaPass: 0, attend: 0, livres24h: 0 },
    dernierEvenement: null,
    rail: [{ ticket: 14, etat: "pris", titre: "Ticket 14", url: issue(14), activite: null }, enFile(23, "zone held by #14 (app/src)"), enFile(21), enFile(22)],
  };
  const STATUS = [
    "rail       1 taken · 3 queued",
    "  #14  taken  prio:1  by box/claude since 12 min, lease 27 min left  Ticket 14",
    "  #23  queued  prio:1  zone held by #14 (app/src) — since 2 h 05  Ticket 23",
    "  #21  queued  prio:2  since 40 min  Ticket 21",
    "  #22  queued  -  since 3 min  Ticket 22",
    "",
  ].join("\n");
  const lire = (faits: Faits = FAITS) => {
    const tenus = tenirFaits();
    tenus.recevoir({ projet: "parade", demande: 0, a: faits.lu, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
    const lu = tenus.attendre(mettreAPart({ projet: "parade", demande: 0, a: faits.lu, sorties: [{ commande: "status", texte: STATUS }] }));
    assert.ok(lu !== undefined && "tableau" in lu);
    return { tenus, colonne: lu.tableau.rail.colonnes.find(({ nom }) => nom === "On the rail") ?? assert.fail("pas de colonne On the rail") };
  };

  test("ses cartes dans l'ordre où le runtime les sert — celui que `status` imprime —, chacune rangeable, avec sa priorité", () => {
    const { colonne } = lire();
    assert.deepEqual(colonne.cartes.map(({ ticket }) => ticket), [23, 21, 22]);
    assert.deepEqual(colonne.cartes.map(({ ticket }) => ticket), [...STATUS.matchAll(/^ {2}#(\d+) {2}queued/gm)].map(([, numero]) => Number(numero)));
    assert.deepEqual(colonne.cartes.map(({ rangeable }) => rangeable), [true, true, true]);
    assert.deepEqual(colonne.cartes.map(({ prio }) => prio), ["prio:1", "prio:2", SANS_PRIO]);
  });

  test("la carte en tête qui ne part pas dit pourquoi — la zone tenue, la machine saturée ; les autres n'en disent rien", () => {
    assert.deepEqual(lire().colonne.cartes.map(({ ligne }) => ligne), ["does not leave: zone held by #14 (app/src)", "ready, waits for a place in the kitchen", "ready, waits for a place in the kitchen"]);
    const sature = { ...FAITS, rail: FAITS.rail.map((ticket) => (ticket.ticket === 23 ? { ...ticket, raison: "machine saturated" } : ticket)) };
    assert.equal(lire(sature).colonne.cartes[0]?.ligne, "does not leave: machine saturated");
  });

  test("les tickets que le process principal laisse ranger : ceux en attente sur le rail lu, rien d'un projet pas lu", () => {
    const { tenus } = lire();
    assert.deepEqual([...(tenus.enFile("parade") ?? [])], [23, 21, 22]);
    assert.equal(tenus.enFile("cantine"), undefined);
  });
});
