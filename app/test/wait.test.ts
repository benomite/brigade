// WAITING sur le rail (#591), devenu le parking (#4129) : deux colonnes, TODO — ce que le chef peut trancher maintenant —
// et WAITING — ce qui attend un tiers. Sur une carte de TODO, « waiting for… » ouvre un formulaire : ce qu'elle attend, de
// qui, la relance proposée à sept jours ; validé, il s'écrit sur l'issue, jamais par une commande de la box (#4262). Une
// carte de WAITING dit sans clic ce qu'elle attend, de qui, depuis quand, sa relance et ce qui se passera à l'arrivée, et
// porte « resume » et « it arrived, back to the kitchen ». Une carte revenue de WAITING le dit — pas pourquoi : le runtime
// ne le rend pas dans `faits`. La vue est jouée telle qu'elle est, devant un faux document (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../src/allumage.ts";
import { ACTIONS_D_WAIT, dayDe, relanceProposee } from "../src/wait.ts";
import { mettreAPart } from "../src/awaiting.ts";
import { pourLaBar } from "../src/bar.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../src/kitchen.ts";
import { BANNIERE, comprendre, rail, holdFacts, type Dessinable, type Facts } from "../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../src/actions.ts";
import { EFFORTS, MODELES } from "../src/projects/projects.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import type { ClientDeLaPriority } from "../src/priority.ts";
import type { Terminal } from "../src/terminaux.ts";
import { waitSurGithub, parquer } from "../src/vue/wait/wait-github.ts";
import { saisieLue, type Saisie } from "../src/vue/wait/saisie.ts";
import { rouges } from "./aides/rouges.ts";
import { type Faux, type Jouee, jouerLaVue, type Answers, repos } from "./aides/fausse-vue.ts";

// Le jour du poste, fixé : la relance se borne d'après lui.
const AUJOURDHUI = new Date(2026, 9, 15, 14, 30);
const refusal = (saisie: unknown) => {
  const lue = saisieLue(saisie, AUJOURDHUI);
  assert.ok("refus" in lue, `rien n'est refusé : ${JSON.stringify(lue)}`);
  return lue.refus;
};

describe("les gestes de WAITING et ce que « waiting for… » demande", () => {
  test("la relance proposée est dans sept jours, au calendrier du poste — fin de mois et d'année comprises", () => {
    assert.equal(relanceProposee(AUJOURDHUI), "2026-10-22");
    assert.equal(relanceProposee(new Date(2026, 9, 28, 23, 59)), "2026-11-04");
    assert.equal(relanceProposee(new Date(2026, 11, 30, 0, 1)), "2027-01-06");
  });

  test("ce sont les trois gestes de WAITING, et aucun n'est une commande de la box (#4262)", () => {
    assert.deepEqual(ACTIONS_D_WAIT, [
      { id: "attente-poser", libelle: "waiting for…" },
      { id: "attente-reprendre", libelle: "resume" },
      { id: "attente-arrivee", libelle: "it arrived, back to the kitchen" },
    ]);
  });

  test("rien n'est écrit sans ce que la commande demande : quoi, de qui, une relance à venir, un ticket", async () => {
    const plein = { quoi: "sa réponse", qui: "le client", relance: "2026-10-22" };
    assert.deepEqual(saisieLue({ ...plein, quoi: "  sa validation écrite du devis  " }, AUJOURDHUI), { ...plein, quoi: "sa validation écrite du devis" });
    assert.match(refusal({ ...plein, quoi: "   " }), /say what it waits for/);
    assert.match(refusal({ ...plein, qui: "" }), /say whom it waits for/);
    assert.match(refusal({ quoi: "sa réponse" }), /say whom it waits for/);
    for (const relance of ["", "22/10/2026", "2026-02-30", "2026-10-22T09:00", "7j"]) assert.match(refusal({ ...plein, relance }), /is not a day of the calendar/, relance);
    for (const relance of ["2026-10-15", "2026-10-01"]) assert.match(refusal({ ...plein, relance }), /is not after today/, relance);
    assert.match(refusal({ ...plein, quoi: "une ligne\npuis une autre" }), /control character/);
    for (const ticket of [0, -3, 1.5, "8", null, undefined]) {
      const dit = await waitSurGithub({ id: "attente-reprendre", ticket, saisie: undefined, aujourdhui: AUJOURDHUI, lu: undefined, client: {} as ClientDeLaPriority });
      assert.match("refus" in dit ? dit.refus : "", /names no ticket/, String(ticket));
    }
  });

  test("« waiting for… » parque le ticket : le commentaire de parking dit qui, pour quoi, jusqu'à quand, puis `parked` est posé", async () => {
    const lue = saisieLue({ quoi: "sa validation écrite du devis", qui: "le client", relance: "2026-10-22" }, AUJOURDHUI);
    const ecrits: [string, string, unknown][] = [];
    const client: ClientDeLaPriority = {
      lire: () => assert.fail("rien ne se lit"),
      ecrire: (methode, chemin, corps) => (ecrits.push([methode, chemin, corps]), Promise.resolve(chemin.endsWith("/comments") ? { status: 201, data: { html_url: "https://github.com/o/r/issues/8#c1" } } : { status: 200, data: [] })),
    };
    const ecrit = await parquer("o/r", 8, lue as Saisie, AUJOURDHUI, client);
    assert.ok("fait" in ecrit, JSON.stringify(ecrit));
    const [[, chemin, workstation] = [], [, cheminDuLabel, label] = []] = ecrits;
    assert.equal(chemin, "/repos/o/r/issues/8/comments");
    const corps = (workstation as { body: string }).body;
    // La marque que la cuisine relit (runtime/src/attente-github/marque.ts) : rien ne prend un ticket parqué avant sa date.
    assert.match(corps, /^<!-- brigade:parked \{"what":"sa validation écrite du devis","who":"le client","followUp":"2026-10-2[12]T\d\d:00:00\.000Z"\} -->\n\*\*PARKED: waits for le client\.\*\*/);
    assert.match(corps, /- \*\*until\*\*: 2026-10-2[12] \d\d:00 UTC/);
    assert.deepEqual([cheminDuLabel, label], ["/repos/o/r/issues/8/labels", { labels: ["parked"] }]);
  });
});

// Ce que la box rend : un ticket sur le rail de chaque sorte qui compte ici.
const ticket = (numero: number, state: string, plus: Partial<Facts["rail"][number]> = {}): Facts["rail"][number] => ({ ticket: numero, etat: state, titre: `Ticket ${numero}`, url: `https://github.com/benomite/brigade/issues/${numero}`, activite: null, ...plus });
const TIERS = { quoi: "sa validation écrite du devis", qui: "le client", depuis: "2026-10-12T10:04:20.000Z", relance: "2026-10-21T00:00:00.000Z", aLArrivee: "il repart en cuisine, sans repasser par TODO : il est remis sur le rail, et un cook le prend à son tour" };
const FACTS: Facts = {
  etat: "ouverte",
  lu: "2026-10-15T10:04:20.000Z",
  dernierTick: null,
  compteurs: { rail: 2, auTravail: 0, aLaPass: 1, attend: 2, livres24h: 0 },
  dernierEvenement: null,
  rail: [
    ticket(21, "en attente"),
    ticket(8, "WAITING", { attente: { raison: "attend : un tiers (WAITING)", colonne: "WAITING", retour: null }, tiers: TIERS }),
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
const rangs = (facts: Facts) => rail(facts).colonnes.map(({ nom: name, compte: account, cartes: cards }) => [name, account, cards.map(({ ticket: numero }) => numero)]);

describe("le rail en TODO et WAITING", () => {
  test("TODO ne prend que ce que le chef peut trancher ; WAITING, ce qui attend un tiers — juste après, et nulle part ailleurs", () => {
    assert.deepEqual(rangs(FACTS), [
      ["On the rail", "1", [21]],
      ["Taken", "0", []],
      ["Pass", "0", []],
      ["Awaiting you", "3", [30, 31, 12]],
      ["Waiting", "1", [8]],
      ["Served", "0", []],
    ]);
    // Même nommé par la file, un ticket qui attend un tiers n'est pas dans TODO.
    const nomme = { ...FACTS, attend: [...(FACTS.attend ?? []), { ticket: 8, titre: "Ticket 8", url: null }] };
    assert.deepEqual(rangs(nomme)[3], ["Awaiting you", "3", [30, 31, 12]]);
    assert.deepEqual(rangs(nomme)[4], ["Waiting", "1", [8]]);
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
      { libelle: "on arrival", valeur: TIERS.aLArrivee },
    ]);
    assert.deepEqual([card?.etat, card?.ton, card?.titre, card?.ouvrable, card?.attendu, card?.sans], ["WAITING", "gris", "Ticket 8", true, false, undefined]);
    assert.deepEqual(card?.gestes, ["attente-reprendre", "attente-arrivee"]);
    // Une relance passée le dit aussi.
    const passee = rail({ ...FACTS, lu: "2026-10-23T00:00:00.000Z" }).colonnes[4]?.cartes[0]?.dit.find(({ libelle }) => libelle === "follow-up");
    assert.equal(passee?.valeur, "2026-10-21 00:00 UTC — passed 2 d before the reading");
    // Sa relance passée, la carte revient au chef : la vue la pose en rouge dans WAITING (#3458). Avant, non.
    assert.equal(rail({ ...FACTS, lu: "2026-10-23T00:00:00.000Z" }).colonnes[4]?.cartes[0]?.relancePassee, true);
    assert.equal(card?.relancePassee, undefined);
    // Une box qui dit WAITING sans dire ce qu'il attend : la carte l'écrit, et garde ses gestes.
    const muette = rail({ ...FACTS, rail: [ticket(8, "WAITING")] }).colonnes[4]?.cartes[0];
    assert.deepEqual([muette?.dit, muette?.gestes], [[], ["attente-reprendre", "attente-arrivee"]]);
    assert.match(muette?.sans ?? "", /^not given — this station's runtime does not give in `facts` what it waits for/);
  });

  // Un ticket mis de côté faute de station (1752) : le chef n'a posé aucune attente, le runtime la lit pour lui.
  test("une carte de WAITING sans relance — un ticket sans station — dit ce qu'elle attend, sans relance ni geste : elle repart seule", () => {
    const SANS_STATION = { quoi: "a station that provides chrome-connecté — attach one to the project", qui: "a human, the chef", depuis: "2026-10-12T10:04:20.000Z", relance: null, aLArrivee: "the ticket goes back on the rail by itself once a station provides it" };
    const facts = { ...FACTS, rail: [ticket(22, "WAITING", { attente: { raison: "attend : un humain — aucune station ne fournit chrome-connecté", colonne: "WAITING", retour: null }, tiers: SANS_STATION })], attend: [] };
    const [card] = rail(facts).colonnes[4]?.cartes ?? [];
    assert.deepEqual(card?.dit?.map(({ libelle }) => libelle), ["waiting for", "from", "since", "on arrival"]);
    assert.equal(card?.ligne, "waiting for a station that provides chrome-connecté — attach one to the project · from a human, the chef");
    assert.equal(card?.gestes, undefined);
    assert.equal(card?.signal, undefined);
    // La forme lit une relance nulle, et refuse celle qui n'est ni nulle ni une heure.
    const lu = comprendre(JSON.stringify({ ...facts, rail: [{ ...facts.rail[0] }] }));
    assert.ok(!("informe" in lu) && lu.rail[0]?.tiers?.relance === null);
    const mal = comprendre(JSON.stringify({ ...facts, rail: [{ ...facts.rail[0], tiers: { ...SANS_STATION, relance: 3 } }] }));
    assert.ok(!("informe" in mal) && mal.rail[0]?.illisible === "“rail[0].tiers.relance” is not a time");
  });

  test("« waiting for… » est sur une carte de TODO que le runtime laisse attendre — pas sur un ticket en pass, ni hors du rail, ni hors de TODO", () => {
    const todo = rail({ ...FACTS, attend: [...(FACTS.attend ?? []), { ticket: 99, titre: "", url: null }] }).colonnes[3]?.cartes ?? [];
    assert.deepEqual(
      todo.map(({ ticket: numero, gestes: actions }) => [numero, actions]),
      [
        [30, ["attente-poser"]],
        [31, ["attente-poser"]],
        [12, undefined],
        [99, undefined],
      ],
    );
    assert.equal(rail(FACTS).colonnes[0]?.cartes[0]?.gestes, undefined);
  });

  // Le motif du retour vient de `faits.rail[].revenu`, mot pour mot : l'app n'en déduit rien.
  test("une carte revenue de WAITING dit le motif que le runtime en donne — et rien de plus sans lui", () => {
    const MOTIF = "relance du 21/10 : pas de réponse";
    const avec = { ...FACTS, rail: FACTS.rail.map((lu) => (lu.ticket === 30 ? { ...lu, revenu: MOTIF } : lu)) };
    const [relance] = rail(avec).colonnes[3]?.cartes ?? [];
    assert.deepEqual(relance?.dit, [
      { libelle: "set aside", valeur: "attend : le chef — revenu de WAITING" },
      { libelle: "came back", valeur: MOTIF },
    ]);
    // Sans motif (repris par le chef, ou runtime d'avant) : la carte n'en dit pas plus.
    const [sans] = rail(FACTS).colonnes[3]?.cartes ?? [];
    assert.deepEqual(sans?.dit, [{ libelle: "set aside", valeur: "attend : le chef — revenu de WAITING" }]);
    assert.deepEqual(rail({ ...FACTS, rail: FACTS.rail.map((lu) => (lu.ticket === 30 ? { ...lu, revenu: null } : lu)) }).colonnes[3]?.cartes[0]?.dit, sans?.dit);
    // Le champ se lit dans la forme ; mal formé, il la refuse.
    const lu = comprendre(JSON.stringify({ ...FACTS, rail: [{ ...ticket(30, "86"), revenu: MOTIF }] }));
    assert.ok(!("informe" in lu) && lu.rail[0]?.revenu === MOTIF);
    const mal = comprendre(JSON.stringify({ ...FACTS, rail: [{ ...ticket(30, "86"), revenu: 3 }] }));
    assert.ok(!("informe" in mal) && mal.rail[0]?.illisible === "“rail[0].revenu” is not a string");
  });

  test("`tiers` se lit dans la forme : absent d'un runtime d'avant lui, nul pour un autre ticket — et une attente mal formée ne gâte que sa carte", () => {
    const sortie = (rail: unknown[]) => JSON.stringify({ ...FACTS, rail });
    const lu = comprendre(sortie(FACTS.rail));
    assert.ok(!("informe" in lu));
    assert.deepEqual(lu.rail, FACTS.rail);
    const ancien = comprendre(sortie([{ ticket: 21, etat: "en attente", titre: "Ticket 21", url: "https://x/21" }]));
    assert.ok(!("informe" in ancien) && !("tiers" in (ancien.rail[0] ?? {})));
    const illisible = (brut: unknown[]) => {
      const mal = comprendre(sortie(brut));
      return "informe" in mal ? mal.informe : mal.rail[0]?.illisible;
    };
    assert.equal(illisible([{ ...ticket(8, "WAITING"), tiers: { ...TIERS, relance: "demain" } }]), "“rail[0].tiers.relance” is not a time");
    assert.equal(illisible([{ ...ticket(8, "WAITING"), tiers: { ...TIERS, qui: 3 } }]), "“rail[0].tiers.qui” is not a string");
  });
});

const A = "2026-10-15T10:04:20.000Z";
const demarrage = () => ({
  configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES, attente: ACTIONS_D_WAIT },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "session neuve", arrete: false };

async function ouvrir(answers: Answers = {}): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], ...answers });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}
const STATUS = "projet     parade\n\nattend     2 décisions\n  #30  depuis 3 min  revenu de WAITING\n  #31  depuis 1 min  revenu de WAITING\nfin attend\n";
function dessinable(facts: Facts = FACTS): Dessinable {
  const tenus = holdFacts();
  tenus.recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
  return tenus.attendre(mettreAPart({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "status", texte: STATUS }] })) ?? assert.fail("rien à redessiner");
}
const recevoir = (vue: Jouee, recue: Dessinable = dessinable()) => vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
const colonne = (vue: Jouee, name: string): Faux => vue.element("rail").dessous("section").find((pose) => pose.children[0]?.children[0]?.textContent === name) ?? assert.fail(`pas de colonne ${name}`);
const slipOf = (vue: Jouee, numero: number): Faux =>
  vue
    .element("rail")
    .dessous("li")
    .find((slip) => slip.className === "bon" && slip.children[0]?.children[0]?.textContent === `#${numero}`) ?? assert.fail(`pas de bon #${numero}`);
const buttonDe = (ou: Faux, texte: string): Faux => ou.dessous("button").find((pose) => pose.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} »`);
const champ = (ou: Faux, name: string): Faux => ou.dessous("input").find((pose) => pose.dataset.champ === name) ?? assert.fail(`pas de champ ${name}`);
const taper = (entree: Faux, texte: string) => {
  entree.value = texte;
  entree.declencher("input");
};

describe("sur l'écran, les cartes de WAITING et leurs gestes", () => {
  test("ni WAITING ni TODO n'ont de colonne (#3458, #4238) : la carte parked reste dans le backlog, et se lit sans clic", async () => {
    const vue = await ouvrir();
    recevoir(vue);
    const noms = vue
      .element("rail")
      .dessous("section")
      .map((pose) => pose.children[0]?.children[0]?.textContent);
    // Le plan de la cuisine est entier sur Rail (#4238).
    assert.deepEqual(noms, ["Backlog", "Manager", "Cooks", "Pass", "Served"]);
    const slip = slipOf(vue, 8);
    assert.ok(colonne(vue, "Backlog").contains(slip));
    // Elle attend un tiers, pas le chef : elle n'est pas rouge.
    assert.notEqual(slip.dataset.carte, "attente");
    // La carte dit l'essentiel en une ligne ; le détail est dans sa fiche.
    assert.equal(slip.dessous("p").find((pose) => pose.className === "ligne-carte")?.textContent, `waiting for sa validation écrite du devis · from le client · follow-up ${dayDe(new Date(TIERS.relance ?? ""))}`);
    assert.equal(slip.dessous("li").length, 0);
    slip.click();
    const lu = card(vue).dessous("li").map((fait) => fait.children.map((pose) => pose.textContent));
    assert.deepEqual(lu, [
      ["waiting for", "sa validation écrite du devis"],
      ["from", "le client"],
      ["since", "2026-10-12 10:04 UTC — 3 d before the reading"],
      ["follow-up", "2026-10-21 00:00 UTC — in 5 d from the reading"],
      ["on arrival", TIERS.aLArrivee],
    ]);
  });

  // Parked pour un tiers jusqu'à une date, une date passée ne la rend plus au chef (#4261, qui remplace #3458 et #4238 ici).
  test("sa relance passée, la carte n'attend pas le chef pour autant : ni rouge, ni comptée dans « TODO (N) » (#4261)", async () => {
    const vue = await ouvrir();
    const tiers9 = { ...TIERS, relance: "2026-10-30T00:00:00.000Z" };
    recevoir(vue, dessinable({ ...FACTS, lu: "2026-10-23T00:00:00.000Z", rail: [...FACTS.rail, { ...ticket(9, "WAITING"), tiers: tiers9 }] }));
    const backlog = colonne(vue, "Backlog");
    const enOrdre = backlog.dessous("li").filter(({ className, dataset }) => className === "bon" && ["8", "9"].includes(dataset.ticket ?? "")).map(({ dataset }) => [dataset.ticket, dataset.carte]);
    assert.deepEqual(enOrdre, [["8", undefined], ["9", undefined]]);
    // Ses deux gestes restent sur sa carte.
    buttonDe(slipOf(vue, 8), "resume");
    buttonDe(slipOf(vue, 8), "it arrived, back to the kitchen");
    // Les trois cartes du chef, et elles seules.
    assert.equal(rouges(vue.element("rail")).length, 3);
  });

  test("« resume » et « it arrived, back to the kitchen » partent au clic, pour ce ticket", async () => {
    const vue = await ouvrir({ attente: () => SECOND });
    recevoir(vue);
    buttonDe(slipOf(vue, 8), "resume").click();
    await repos();
    assert.deepEqual(vue.dernier("attente"), ["parade", "attente-reprendre", 8, undefined]);
    buttonDe(slipOf(vue, 8), "it arrived, back to the kitchen").click();
    await repos();
    assert.deepEqual(vue.dernier("attente"), ["parade", "attente-arrivee", 8]);
    // Le clic d'un geste n'ouvre pas la fiche par-dessus le rail.
    assert.equal(card(vue).hidden, true);
    // Une carte de TODO n'a pas ces deux-là ; une carte de WAITING n'a pas « waiting for… ».
    assert.ok(!slipOf(vue, 30).dessous("button").some(({ textContent }) => textContent === "resume"));
    assert.ok(!slipOf(vue, 8).dessous("button").some(({ textContent }) => textContent === "waiting for…"));
  });

  test("« waiting for… » ouvre sur la carte un formulaire — quoi, de qui, la relance proposée à sept jours —, qui survit à une lecture ; validé, la commande part, et il se referme", async () => {
    const vue = await ouvrir({ attente: () => SECOND });
    recevoir(vue);
    assert.equal(slipOf(vue, 12).dessous("button").filter(({ dataset }) => "attente" in dataset).length, 0, "un ticket en pass ne se met pas en attente");
    buttonDe(slipOf(vue, 30), "waiting for…").click();
    await repos();

    const formulaire = () => slipOf(vue, 30).dessous("form")[0] ?? assert.fail("pas de formulaire");
    const avant = relanceProposee(new Date());
    assert.deepEqual(
      formulaire()
        .dessous("label")
        .map((etiquette) => etiquette.children[0]?.textContent),
      ["what it waits for, in your words", "from whom", "follow-up on"],
    );
    assert.deepEqual([champ(formulaire(), "quoi").value, champ(formulaire(), "qui").value], ["", ""]);
    assert.equal(champ(formulaire(), "relance").type, "date");
    assert.ok([avant, relanceProposee(new Date())].includes(champ(formulaire(), "relance").value), champ(formulaire(), "relance").value);
    assert.equal(card(vue).hidden, true);

    taper(champ(formulaire(), "quoi"), "sa réponse écrite");
    taper(champ(formulaire(), "qui"), "le client");
    taper(champ(formulaire(), "relance"), "2026-11-02");
    // Une lecture redessine le rail : le formulaire revient tel que le chef l'a laissé.
    recevoir(vue);
    assert.deepEqual(
      ["quoi", "qui", "relance"].map((name) => champ(formulaire(), name).value),
      ["sa réponse écrite", "le client", "2026-11-02"],
    );

    formulaire().declencher("submit");
    await repos();
    assert.deepEqual(vue.dernier("attente"), ["parade", "attente-poser", 30, { quoi: "sa réponse écrite", qui: "le client", relance: "2026-11-02" }]);
    assert.equal(slipOf(vue, 30).dessous("form").length, 0);
    assert.ok(slipOf(vue, 30).dessous("button").some(({ textContent }) => textContent === "waiting for…"));
  });

  test("refusé, le formulaire reste, et dit pourquoi ; « cancel » le referme sans rien envoyer ; et le ticket parked le referme", async () => {
    let answer: Terminal | { refus: string } = { refus: "nothing is written: say whom it waits for — the client, a team, a person" };
    const vue = await ouvrir({ attente: () => answer });
    recevoir(vue);
    buttonDe(slipOf(vue, 31), "waiting for…").click();
    await repos();
    const formulaire = () => slipOf(vue, 31).dessous("form")[0] ?? assert.fail("pas de formulaire");
    taper(champ(formulaire(), "quoi"), "sa réponse");
    formulaire().declencher("submit");
    await repos();
    assert.equal(formulaire().dessous("p").find((pose) => pose.className === "refus")?.textContent, "nothing is written: say whom it waits for — the client, a team, a person");
    assert.equal(champ(formulaire(), "quoi").value, "sa réponse");

    const calls = vue.appels.filter(({ geste: action }) => action === "attente").length;
    buttonDe(formulaire(), "Cancel").click();
    await repos();
    assert.equal(slipOf(vue, 31).dessous("form").length, 0);
    assert.equal(vue.appels.filter(({ geste: action }) => action === "attente").length, calls);

    // Rouvert, puis le ticket passe dans WAITING à la lecture suivante : le formulaire n'a plus de carte, il se referme.
    answer = SECOND;
    buttonDe(slipOf(vue, 31), "waiting for…").click();
    await repos();
    recevoir(vue, dessinable({ ...FACTS, rail: FACTS.rail.map((pose) => (pose.ticket === 31 ? { ...pose, etat: "WAITING", tiers: TIERS } : pose)) }));
    assert.ok(colonne(vue, "Backlog").contains(slipOf(vue, 31)));
    assert.equal(slipOf(vue, 31).dessous("form").length, 0);
    recevoir(vue);
    assert.equal(slipOf(vue, 31).dessous("form").length, 0, "le formulaire refermé ne revient pas");
  });

});

const card = (vue: Jouee) => vue.element("fiche");
