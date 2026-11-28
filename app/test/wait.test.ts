// WAITING sur le rail (#591), devenu le parking (#4129) : deux colonnes, TODO — ce que le chef peut trancher maintenant —
// et WAITING — ce qui attend un tiers. Sur une carte de TODO, « waiting for… » ouvre un formulaire : ce qu'elle attend, de
// qui, la relance proposée à sept jours ; validé, il s'écrit sur l'issue, jamais par une commande de la box (#4262). Une
// carte de WAITING dit sans clic ce qu'elle attend, de qui, depuis quand, sa relance et ce qui se passera à l'arrivée, et
// porte « resume » et « it arrived, back to the kitchen ». Une carte revenue de WAITING le dit — pas pourquoi : le runtime
// ne le rend pas dans `faits`. La vue est jouée telle qu'elle est, devant un faux document (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { putAside } from "../src/awaiting.ts";
import { forTheBar } from "../src/bar.ts";
import { EXAMPLE } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { BANNER, understand, rail, holdFacts, type Drawable, type Facts } from "../src/facts.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import type { ClientOfThePriority } from "../src/priority.ts";
import type { Terminal } from "../src/terminals.ts";
import { park } from "../src/vue/wait/wait-github.ts";
import { dayOf, inputRead, relaunchProposed, type Input } from "../src/vue/wait/input.ts";
import { red } from "./helpers/red.ts";
import { type Fake, type Played, playTheVue, type Answers, repos } from "./helpers/false-vue.ts";

// Le jour du poste, fixé : la relance se borne d'après lui.
const TODAY = new Date(2026, 9, 15, 14, 30);
const refusal = (input: unknown) => {
  const readEntry = inputRead(input, TODAY);
  assert.ok("refus" in readEntry, `rien n'est refusé : ${JSON.stringify(readEntry)}`);
  return readEntry.refus;
};

describe("les gestes de WAITING et ce que « waiting for… » demande", () => {
  test("la relance proposée est dans sept jours, au calendrier du poste — fin de mois et d'année comprises", () => {
    assert.equal(relaunchProposed(TODAY), "2026-10-22");
    assert.equal(relaunchProposed(new Date(2026, 9, 28, 23, 59)), "2026-11-04");
    assert.equal(relaunchProposed(new Date(2026, 11, 30, 0, 1)), "2027-01-06");
  });

  test("rien n'est écrit sans ce que la commande demande : quoi, de qui, une relance à venir", () => {
    const full = { quoi: "sa réponse", qui: "le client", relance: "2026-10-22" };
    assert.deepEqual(inputRead({ ...full, quoi: "  sa validation écrite du devis  " }, TODAY), { ...full, quoi: "sa validation écrite du devis" });
    assert.match(refusal({ ...full, quoi: "   " }), /say what it waits for/);
    assert.match(refusal({ ...full, qui: "" }), /say whom it waits for/);
    assert.match(refusal({ quoi: "sa réponse" }), /say whom it waits for/);
    for (const relaunch of ["", "22/10/2026", "2026-02-30", "2026-10-22T09:00", "7j"]) assert.match(refusal({ ...full, relance: relaunch }), /is not a day of the calendar/, relaunch);
    for (const relaunch of ["2026-10-15", "2026-10-01"]) assert.match(refusal({ ...full, relance: relaunch }), /is not after today/, relaunch);
    assert.match(refusal({ ...full, quoi: "une ligne\npuis une autre" }), /control character/);
  });

  test("« waiting for… » parque le ticket : le commentaire de parking dit qui, pour quoi, jusqu'à quand, puis `parked` est posé", async () => {
    const readEntry = inputRead({ quoi: "sa validation écrite du devis", qui: "le client", relance: "2026-10-22" }, TODAY);
    const writtenOnes: [string, string, unknown][] = [];
    const client: ClientOfThePriority = {
      lire: () => assert.fail("rien ne se lit"),
      ecrire: (method, path, body) => (writtenOnes.push([method, path, body]), Promise.resolve(path.endsWith("/comments") ? { status: 201, data: { html_url: "https://github.com/o/r/issues/8#c1" } } : { status: 200, data: [] })),
    };
    const written = await park("o/r", 8, readEntry as Input, TODAY, client);
    assert.ok("fait" in written, JSON.stringify(written));
    const [[, path, workstation] = [], [, pathOfLabel, label] = []] = writtenOnes;
    assert.equal(path, "/repos/o/r/issues/8/comments");
    const body = (workstation as { body: string }).body;
    // La marque que la carte relit (vue/wait/wait-github.ts) : qui, quoi, jusqu'à quand.
    assert.match(body, /^<!-- brigade:parked \{"what":"sa validation écrite du devis","who":"le client","followUp":"2026-10-2[12]T\d\d:00:00\.000Z"\} -->\n\*\*PARKED: waits for le client\.\*\*/);
    assert.match(body, /- \*\*until\*\*: 2026-10-2[12] \d\d:00 UTC/);
    assert.deepEqual([pathOfLabel, label], ["/repos/o/r/issues/8/labels", { labels: ["parked"] }]);
  });
});

// Ce que la box rend : un ticket sur le rail de chaque sorte qui compte ici.
const ticket = (number: number, state: string, more: Partial<Facts["rail"][number]> = {}): Facts["rail"][number] => ({ ticket: number, etat: state, titre: `Ticket ${number}`, url: `https://github.com/benomite/brigade/issues/${number}`, activite: null, ...more });
const THIRD = { quoi: "sa validation écrite du devis", qui: "le client", depuis: "2026-10-12T10:04:20.000Z", relance: "2026-10-21T00:00:00.000Z", aLArrivee: "il repart en cuisine, sans repasser par TODO : il est remis sur le rail, et un cook le prend à son tour" };
const FACTS: Facts = {
  etat: "ouverte",
  lu: "2026-10-15T10:04:20.000Z",
  dernierTick: null,
  compteurs: { rail: 2, auTravail: 0, aLaPass: 1, attend: 2, livres24h: 0 },
  dernierEvenement: null,
  rail: [
    ticket(21, "en attente"),
    ticket(8, "WAITING", { attente: { raison: "attend : un tiers (WAITING)", colonne: "WAITING", retour: null }, tiers: THIRD }),
    ticket(12, "en pass"),
    ticket(30, "86", { attente: { raison: "attend : le chef — revenu de WAITING", colonne: "86", retour: null }, tiers: null }),
    ticket(31, "86", { attente: { raison: "attend : le chef — revenu de WAITING", colonne: "86", retour: null }, tiers: null }),
  ],
  attend: [
    { ticket: 30, titre: "Ticket 30", url: "https://github.com/benomite/brigade/issues/30" },
    { ticket: 31, titre: "Ticket 31", url: "https://github.com/benomite/brigade/issues/31" },
    { ticket: 12, titre: "Ticket 12", url: "https://github.com/benomite/brigade/issues/12" },
  ],
  livres: [],
};
const ranks = (facts: Facts) => rail(facts).colonnes.map(({ nom: name, compte: account, cartes: cards }) => [name, account, cards.map(({ ticket: number }) => number)]);

describe("le rail en TODO et WAITING", () => {
  test("TODO ne prend que ce que le chef peut trancher ; WAITING, ce qui attend un tiers — juste après, et nulle part ailleurs", () => {
    assert.deepEqual(ranks(FACTS), [
      ["On the rail", "1", [21]],
      ["Taken", "0", []],
      ["Pass", "0", []],
      ["Awaiting you", "3", [30, 31, 12]],
      ["Waiting", "1", [8]],
      ["Served", "0", []],
    ]);
    // Même nommé par la file, un ticket qui attend un tiers n'est pas dans TODO.
    const named = { ...FACTS, attend: [...(FACTS.attend ?? []), { ticket: 8, titre: "Ticket 8", url: null }] };
    assert.deepEqual(ranks(named)[3], ["Awaiting you", "3", [30, 31, 12]]);
    assert.deepEqual(ranks(named)[4], ["Waiting", "1", [8]]);
    // Aucun : la colonne le dit.
    assert.equal(rail({ ...FACTS, rail: [] }).colonnes[4]?.vide, "no ticket waits for a third party");
  });

  test("une carte de WAITING dit, sans clic, ce qu'elle attend dans les mots du chef, de qui, depuis quand, sa relance, et ce qui se passera à l'arrivée — puis ses deux gestes", () => {
    const card = rail(FACTS).colonnes[4]?.cartes[0];
    assert.deepEqual(card?.dit, [
      { libelle: "waiting for", valeur: "sa validation écrite du devis" },
      { libelle: "from", valeur: "le client" },
      { libelle: "since", valeur: "2026-10-12 10:04 UTC — 3 d before the reading" },
      { libelle: "follow-up", valeur: "2026-10-21 00:00 UTC — in 5 d from the reading" },
      { libelle: "on arrival", valeur: THIRD.aLArrivee },
    ]);
    assert.deepEqual([card?.etat, card?.ton, card?.titre, card?.ouvrable, card?.attendu, card?.sans], ["WAITING", "gris", "Ticket 8", true, false, undefined]);
    // Une relance passée le dit aussi.
    const past = rail({ ...FACTS, lu: "2026-10-23T00:00:00.000Z" }).colonnes[4]?.cartes[0]?.dit.find(({ libelle: wording }) => wording === "follow-up");
    assert.equal(past?.valeur, "2026-10-21 00:00 UTC — passed 2 d before the reading");
    // Sa relance passée, la carte revient au chef : la vue la pose en rouge dans WAITING (#3458). Avant, non.
    assert.equal(rail({ ...FACTS, lu: "2026-10-23T00:00:00.000Z" }).colonnes[4]?.cartes[0]?.relancePassee, true);
    assert.equal(card?.relancePassee, undefined);
    // Une box qui dit WAITING sans dire ce qu'il attend : la carte l'écrit, et garde ses gestes.
    const silentOne = rail({ ...FACTS, rail: [ticket(8, "WAITING")] }).colonnes[4]?.cartes[0];
    assert.deepEqual(silentOne?.dit, []);
    assert.match(silentOne?.sans ?? "", /^not given — this station's runtime does not give in `facts` what it waits for/);
  });

  // Un ticket mis de côté faute de station (1752) : le chef n'a posé aucune attente, le runtime la lit pour lui.
  test("une carte de WAITING sans relance — un ticket sans station — dit ce qu'elle attend, sans relance ni geste : elle repart seule", () => {
    const WITHOUT_STATION = { quoi: "a station that provides chrome-connecté — attach one to the project", qui: "a human, the chef", depuis: "2026-10-12T10:04:20.000Z", relance: null, aLArrivee: "the ticket goes back on the rail by itself once a station provides it" };
    const facts = { ...FACTS, rail: [ticket(22, "WAITING", { attente: { raison: "attend : un humain — aucune station ne fournit chrome-connecté", colonne: "WAITING", retour: null }, tiers: WITHOUT_STATION })], attend: [] };
    const [card] = rail(facts).colonnes[4]?.cartes ?? [];
    assert.deepEqual(card?.dit?.map(({ libelle: wording }) => wording), ["waiting for", "from", "since", "on arrival"]);
    assert.equal(card?.ligne, "waiting for a station that provides chrome-connecté — attach one to the project · from a human, the chef");
    assert.equal(card?.signal, undefined);
    // La forme lit une relance nulle, et refuse celle qui n'est ni nulle ni une heure.
    const readOne = understand(JSON.stringify({ ...facts, rail: [{ ...facts.rail[0] }] }));
    assert.ok(!("informe" in readOne) && readOne.rail[0]?.tiers?.relance === null);
    const badly = understand(JSON.stringify({ ...facts, rail: [{ ...facts.rail[0], tiers: { ...WITHOUT_STATION, relance: 3 } }] }));
    assert.ok(!("informe" in badly) && badly.rail[0]?.illisible === "“rail[0].tiers.relance” is not a time");
  });

  // Le motif du retour vient de `faits.rail[].revenu`, mot pour mot : l'app n'en déduit rien.
  test("une carte revenue de WAITING dit le motif que le runtime en donne — et rien de plus sans lui", () => {
    const REASON = "relance du 21/10 : pas de réponse";
    const withIt = { ...FACTS, rail: FACTS.rail.map((readOne) => (readOne.ticket === 30 ? { ...readOne, revenu: REASON } : readOne)) };
    const [relaunch] = rail(withIt).colonnes[3]?.cartes ?? [];
    assert.deepEqual(relaunch?.dit, [
      { libelle: "set aside", valeur: "attend : le chef — revenu de WAITING" },
      { libelle: "came back", valeur: REASON },
    ]);
    // Sans motif (repris par le chef, ou runtime d'avant) : la carte n'en dit pas plus.
    const [without] = rail(FACTS).colonnes[3]?.cartes ?? [];
    assert.deepEqual(without?.dit, [{ libelle: "set aside", valeur: "attend : le chef — revenu de WAITING" }]);
    assert.deepEqual(rail({ ...FACTS, rail: FACTS.rail.map((readOne) => (readOne.ticket === 30 ? { ...readOne, revenu: null } : readOne)) }).colonnes[3]?.cartes[0]?.dit, without?.dit);
    // Le champ se lit dans la forme ; mal formé, il la refuse.
    const readOne = understand(JSON.stringify({ ...FACTS, rail: [{ ...ticket(30, "86"), revenu: REASON }] }));
    assert.ok(!("informe" in readOne) && readOne.rail[0]?.revenu === REASON);
    const badly = understand(JSON.stringify({ ...FACTS, rail: [{ ...ticket(30, "86"), revenu: 3 }] }));
    assert.ok(!("informe" in badly) && badly.rail[0]?.illisible === "“rail[0].revenu” is not a string");
  });

  test("`tiers` se lit dans la forme : absent d'un runtime d'avant lui, nul pour un autre ticket — et une attente mal formée ne gâte que sa carte", () => {
    const output = (rail: unknown[]) => JSON.stringify({ ...FACTS, rail });
    const readOne = understand(output(FACTS.rail));
    assert.ok(!("informe" in readOne));
    assert.deepEqual(readOne.rail, FACTS.rail);
    const old = understand(output([{ ticket: 21, etat: "en attente", titre: "Ticket 21", url: "https://x/21" }]));
    assert.ok(!("informe" in old) && !("tiers" in (old.rail[0] ?? {})));
    const unreadable = (raw: unknown[]) => {
      const badly = understand(output(raw));
      return "informe" in badly ? badly.informe : badly.rail[0]?.illisible;
    };
    assert.equal(unreadable([{ ...ticket(8, "WAITING"), tiers: { ...THIRD, relance: "demain" } }]), "“rail[0].tiers.relance” is not a time");
    assert.equal(unreadable([{ ...ticket(8, "WAITING"), tiers: { ...THIRD, qui: 3 } }]), "“rail[0].tiers.qui” is not a string");
  });
});

const A = "2026-10-15T10:04:20.000Z";
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "session neuve", arrete: false };

async function open(answers: Answers = {}): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [SECOND], ...answers });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}
const STATUS = "projet     parade\n\nattend     2 décisions\n  #30  depuis 3 min  revenu de WAITING\n  #31  depuis 1 min  revenu de WAITING\nfin attend\n";
function drawable(facts: Facts = FACTS): Drawable {
  const heldOnes = holdFacts();
  heldOnes.recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
  return heldOnes.attendre(putAside({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "status", texte: STATUS }] })) ?? assert.fail("rien à redessiner");
}
const receive = (vue: Played, receivedOne: Drawable = drawable()) => vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
const column = (vue: Played, name: string): Fake => vue.element("rail").dessous("section").find((pose) => pose.children[0]?.children[0]?.textContent === name) ?? assert.fail(`pas de colonne ${name}`);
const slipOf = (vue: Played, number: number): Fake =>
  vue
    .element("rail")
    .dessous("li")
    .find((slip) => slip.className === "bon" && slip.children[0]?.children[0]?.textContent === `#${number}`) ?? assert.fail(`pas de bon #${number}`);

describe("sur l'écran, les cartes de WAITING et leurs gestes", () => {
  test("ni WAITING ni TODO n'ont de colonne (#3458, #4238) : la carte parked reste dans le backlog, et se lit sans clic", async () => {
    const vue = await open();
    receive(vue);
    const names = vue
      .element("rail")
      .dessous("section")
      .map((pose) => pose.children[0]?.children[0]?.textContent);
    // Le plan de la cuisine est entier sur Rail (#4238).
    assert.deepEqual(names, ["Backlog", "Manager", "Cooks", "Pass", "Served"]);
    const slip = slipOf(vue, 8);
    assert.ok(column(vue, "Backlog").contains(slip));
    // Elle attend un tiers, pas le chef : elle n'est pas rouge.
    assert.notEqual(slip.dataset.carte, "attente");
    // La carte dit l'essentiel en une ligne ; le détail est dans sa fiche.
    assert.equal(slip.dessous("p").find((pose) => pose.className === "ligne-carte")?.textContent, `waiting for sa validation écrite du devis · from le client · follow-up ${dayOf(new Date(THIRD.relance ?? ""))}`);
    assert.equal(slip.dessous("li").length, 0);
    slip.click();
    const readOne = card(vue).dessous("li").map((done) => done.children.map((pose) => pose.textContent));
    assert.deepEqual(readOne, [
      ["waiting for", "sa validation écrite du devis"],
      ["from", "le client"],
      ["since", "2026-10-12 10:04 UTC — 3 d before the reading"],
      ["follow-up", "2026-10-21 00:00 UTC — in 5 d from the reading"],
      ["on arrival", THIRD.aLArrivee],
    ]);
  });

  // Parked pour un tiers jusqu'à une date, une date passée ne la rend plus au chef (#4261, qui remplace #3458 et #4238 ici).
  test("sa relance passée, la carte n'attend pas le chef pour autant : ni rouge, ni comptée dans « TODO (N) » (#4261)", async () => {
    const vue = await open();
    const third9 = { ...THIRD, relance: "2026-10-30T00:00:00.000Z" };
    receive(vue, drawable({ ...FACTS, lu: "2026-10-23T00:00:00.000Z", rail: [...FACTS.rail, { ...ticket(9, "WAITING"), tiers: third9 }] }));
    const backlog = column(vue, "Backlog");
    const inOrder = backlog.dessous("li").filter(({ className, dataset }) => className === "bon" && ["8", "9"].includes(dataset.ticket ?? "")).map(({ dataset }) => [dataset.ticket, dataset.carte]);
    assert.deepEqual(inOrder, [["8", undefined], ["9", undefined]]);
    // Les trois cartes du chef, et elles seules.
    assert.equal(red(vue.element("rail")).length, 3);
  });
});

const card = (vue: Played) => vue.element("fiche");
