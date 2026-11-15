// Le bandeau Backlog (#3460, vue/backlog-band/backlog-band.js), joué seul, avec le faux élément de l'app : l'ordre de ses
// étiquettes — ce qui attend le chef d'abord, puis la priorité —, ce que chacune dit, le `+N` qui ne coupe jamais une
// étiquette, le choix d'un besoin et sa fin, le nombre d'étiquettes rouges, le besoin tout servi gardé 24 h, à
// l'horloge donnée — et la liste dépliée du chef : Next, les idées en réserve, ce qui a été servi replié (#3589).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Vu } from "../../src/amont.ts";
import { grouper } from "../../src/amont.ts";
import type { Carte } from "../../src/faits.ts";
import { ajusterLeBandeau, besoinsDuBacklog, combienTiennent, marquerLeRail, poserBandeauBacklog, RETENUE_MS, rougesDuBacklog, titreCourt } from "../../src/vue/backlog-band/backlog-band.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
// Le bandeau, tel que le faux document le pose.
const poser = (...args: Parameters<typeof poserBandeauBacklog>) => poserBandeauBacklog(...args) as unknown as Faux | null;
const MAINTENANT = Date.parse("2026-11-13T12:00:00.000Z");
const URL = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;

type Donnee = Parameters<typeof grouper>[0][number];
const besoin = (ticket: number, etat: string, priorite: number | null, autres: Partial<Donnee> = {}): Donnee => ({ ticket, titre: `Besoin ${ticket}`, url: URL(ticket), priorite, etat, dit: `${etat} said`, ...autres });
const vu = (issues: Donnee[]): Vu => ({ projet: "parade", demande: 1, a: "x", vide: "", compte: issues.length, lu: "x", groupes: grouper(issues), survol: `${issues.length} issues before the rail` });
const carte = (ticket: number, autres: Partial<Carte> = {}): Carte => ({ ticket, ouvrable: true, attendu: false, attend: [], dit: [], fiche: { titre: { valeur: `#${ticket}` }, priorite: { valeur: "-" }, issue: true }, ...autres });
// Les colonnes du rail, telles que faits.ts les range : les cartes de chaque ticket dans la sienne.
const colonnes = (parColonne: Record<string, number[]>) => Object.entries(parColonne).map(([nom, tickets]) => ({ nom, cartes: tickets.map((ticket) => carte(ticket, nom === "Awaiting you" ? { attendu: true } : {})) }));

// Un backlog de référence : un besoin non lu sans priorité, une épique à découper prio:2, une découpée prio:1 en cours,
// une prête prio:3 — et deux qui attendent le chef (leurs cartes sont dans Awaiting you), prio:3 et sans priorité.
const BESOINS_DE_REFERENCE = [
  besoin(5, "non-lue", null),
  besoin(6, "epique", 2),
  besoin(7, "decoupee", 1, { tickets: [20, 21, 22, 23, 24], servis: [23, 24], contexte: "Why it matters." }),
  besoin(8, "prete", 3),
  besoin(9, "mise-de-cote", null, { titre: "Garder les tickets un an, ou les effacer au bout de six mois ?" }),
  besoin(10, "epique", 3),
];
const REFERENCE = vu(BESOINS_DE_REFERENCE);
const RAIL = colonnes({ "On the rail": [20], Taken: [21], Pass: [], "Awaiting you": [9, 10, 22], Waiting: [], Served: [] });

describe("les étiquettes, dans leur ordre", () => {
  test("ce qui attend le chef d'abord, en rouge ; puis par priorité, sans priorité en dernier", () => {
    const besoins = besoinsDuBacklog(REFERENCE, RAIL, MAINTENANT);
    assert.deepEqual(besoins.map(({ ticket, rouge }) => [ticket, rouge]), [
      [10, true],
      [9, true],
      [7, false],
      [6, false],
      [8, false],
      [5, false],
    ]);
    // La carte de TODO du besoin qui attend : celle de la colonne Awaiting you.
    assert.equal(besoins[0]?.carte?.ticket, 10);
    assert.equal(besoins.find(({ ticket }) => ticket === 7)?.carte, undefined);
  });

  test("chacune dit sa priorité, un titre court, puis son avancement servis/total, ou son état en mots simples", () => {
    const bandeau = poser(doc, { vu: REFERENCE, besoins: besoinsDuBacklog(REFERENCE, RAIL, MAINTENANT), selection: undefined, deplie: false, rouges: rougesDuBacklog(REFERENCE, RAIL, MAINTENANT) }, gestes()) ?? assert.fail("pas de bandeau");
    const tags = bandeau.dessous("button").filter(({ className }) => className === "backlog-tag");
    assert.deepEqual(
      tags.map((tag) => tag.children.map(({ textContent }) => textContent)),
      [
        ["prio:3", "Besoin 10", "awaits you"],
        ["no prio", "Garder les tickets…", "awaits you"],
        ["prio:1", "Besoin 7", "2/5"],
        ["prio:2", "Besoin 6", "to split"],
        ["prio:3", "Besoin 8", "ready"],
        ["no prio", "Besoin 5", "not read yet"],
      ],
    );
    assert.deepEqual(tags.map(({ dataset }) => "rouge" in dataset), [true, true, false, false, false, false]);
    // Le titre entier, au survol.
    assert.match(tags[1]?.title ?? "", /^#9 Garder les tickets un an, ou les effacer au bout de six mois \? — awaits you — /);
    // Le titre du bandeau : son nom, le nombre de besoins, et combien t'attendent ; les comptes de chaque état au survol.
    const titre = bandeau.dessous("button").find(({ className }) => className === "backlog-band-titre") ?? assert.fail("pas de titre");
    assert.equal(titre.textContent, "Backlog" + "6" + "2 await you");
    assert.match(titre.title, /^6 issues before the rail — unfold the whole backlog$/);
  });

  test("un titre court se coupe à un mot, jamais au milieu, et dit qu'il est coupé", () => {
    assert.equal(titreCourt("Le menu du soir"), "Le menu du soir");
    assert.equal(titreCourt("Les réservations de groupe en ligne"), "Les réservations de…");
    assert.equal(titreCourt("Uneréservationdegroupeenligne"), "Uneréservationdegrou…");
  });
});

describe("le nombre d'étiquettes rouges, que l'entrée TODO (N) compte (#3458)", () => {
  test("les besoins qui attendent le chef, et eux seuls", () => {
    assert.equal(rougesDuBacklog(REFERENCE, RAIL, MAINTENANT), 2);
    assert.equal(rougesDuBacklog(REFERENCE, colonnes({ "Awaiting you": [22] }), MAINTENANT), 0, "un ticket du découpage qui attend n'est pas un besoin rouge");
    assert.equal(rougesDuBacklog(undefined, RAIL, MAINTENANT), 0);
    assert.equal(rougesDuBacklog({ projet: "parade", demande: 1, a: "x", vide: "", sans: "not read" }, RAIL, MAINTENANT), 0);
  });
});

describe("le `+N` : la ligne ne coupe jamais une étiquette", () => {
  test("tout tient : toutes, sans `+N` ; sinon autant qu'il en tient avec le `+N` au bout", () => {
    assert.equal(combienTiennent([100, 100, 100], 316, 30, 8), 3);
    // 100 + 8 + 100 + 8 + 30 = 246 ≤ 300 ; une troisième ne tiendrait pas avec le `+N`.
    assert.equal(combienTiennent([100, 100, 100, 100], 300, 30, 8), 2);
    // Une étiquette plus large que la ligne : aucune, le `+N` seul.
    assert.equal(combienTiennent([400, 50], 300, 30, 8), 0);
    assert.equal(combienTiennent([], 300, 30, 8), 0);
  });

  test("posé dans une page : les étiquettes qui ne tiennent pas se cachent entières, le `+N` les compte ; sur un écran étroit, toutes restent", () => {
    const bandeau = poser(doc, { vu: REFERENCE, besoins: besoinsDuBacklog(REFERENCE, RAIL, MAINTENANT), selection: undefined, deplie: false, rouges: 0 }, gestes()) ?? assert.fail("pas de bandeau");
    const tags = bandeau.dessous("ol").find(({ className }) => className === "backlog-band-tags") ?? assert.fail("pas de ligne");
    // Une mise en page mesurée : la ligne fait 400, chaque étiquette 120, le `+N` 30, l'écart 8.
    const mesure = (pose: Faux, largeur: number) => void (pose.boite = { ...pose.boite, width: largeur });
    mesure(tags, 400);
    for (const pendu of tags.children.slice(0, -1)) mesure(pendu, 120);
    const plus = tags.children.at(-1) ?? assert.fail("pas de +N");
    mesure(plus, 30);
    const page = Object.assign(bandeau, { querySelector: (selecteur: string) => (selecteur === ".backlog-band-tags" ? tags : null) });
    Object.assign(plus, { firstElementChild: plus.children[0] });
    const ecart = globalThis.getComputedStyle;
    Object.assign(globalThis, { getComputedStyle: () => ({ columnGap: "8px" }) });
    try {
      ajusterLeBandeau(page, false);
      // 120 + 8 + 120 + 8 + 30 = 286 ≤ 400 ; une troisième : 414.
      assert.deepEqual(tags.children.map(({ hidden }) => hidden), [false, false, true, true, true, true, false]);
      assert.equal(plus.children[0]?.textContent, "+4");
      // L'écran étroit : la ligne défile, toutes y sont, pas de `+N`.
      ajusterLeBandeau(page, true);
      assert.deepEqual(tags.children.map(({ hidden }) => hidden), [false, false, false, false, false, false, true]);
      // Un rail pas encore affiché, sans largeur : rien n'est caché.
      mesure(tags, 0);
      ajusterLeBandeau(page, false);
      assert.deepEqual(tags.children.map(({ hidden }) => hidden), [false, false, false, false, false, false, true]);
    } finally {
      Object.assign(globalThis, { getComputedStyle: ecart });
    }
  });
});

describe("choisir un besoin, et finir ce choix", () => {
  test("un clic sur une étiquette la choisit ; le détail dit son contexte, ses tickets par étape, le lien de son issue", () => {
    const choisis: number[] = [];
    const ouvertes: number[] = [];
    const besoins = besoinsDuBacklog(REFERENCE, RAIL, MAINTENANT);
    const pose = (selection: number | undefined) => poser(doc, { vu: REFERENCE, besoins, selection, deplie: false, rouges: 0 }, gestes({ choisir: (t) => void choisis.push(t), ouvrirIssue: (t) => void ouvertes.push(t) })) ?? assert.fail("pas de bandeau");
    const tag = (bandeau: Faux, ticket: number) => bandeau.dessous("button").find(({ dataset }) => dataset.ticket === String(ticket) && "rouge" in dataset === [9, 10].includes(ticket)) ?? assert.fail(`pas d'étiquette #${ticket}`);

    const replie = pose(undefined);
    assert.equal("deplie" in replie.dataset, false);
    assert.equal(replie.dessous("section").filter(({ className }) => className === "backlog-band-detail").length, 0);
    tag(replie, 7).click();
    assert.deepEqual(choisis, [7]);

    const deplie = pose(7);
    assert.equal("deplie" in deplie.dataset, true);
    assert.equal(tag(deplie, 7).ariaPressed, "true");
    assert.equal(tag(deplie, 6).ariaPressed, "false");
    const detail = deplie.dessous("section").find(({ className }) => className === "backlog-band-detail") ?? assert.fail("pas de détail");
    assert.equal(detail.dessous("p").find(({ className }) => className === "backlog-band-contexte")?.textContent, "Why it matters.");
    // Ses cinq tickets par étape : #20 sur le rail, #21 pris, #22 qui t'attend, #23 et #24 servis.
    assert.deepEqual(
      detail.dessous("li").map((etape) => etape.textContent),
      ["on the rail1", "taken1", "pass0", "awaiting you1", "WAITING0", "served2"],
    );
    (detail.dessous("button").find(({ className }) => className === "backlog-band-issue") ?? assert.fail("pas de lien")).click();
    assert.deepEqual(ouvertes, [7]);
    // Un second clic sur la même, ou un clic sur une autre : la vue reçoit le ticket — c'est elle qui finit ou change le choix.
    tag(deplie, 7).click();
    tag(deplie, 6).click();
    assert.deepEqual(choisis, [7, 7, 6]);
  });

  test("le besoin qui attend le chef : son détail pose sa carte de TODO — la question et le bouton qui y répond", () => {
    const besoins = besoinsDuBacklog(REFERENCE, RAIL, MAINTENANT);
    const posees: Carte[] = [];
    const bandeau = poser(doc, { vu: REFERENCE, besoins, selection: 9, deplie: false, rouges: 0 }, gestes({ carteDuChef: (c) => {
      posees.push(c);
      const bon = new Faux("li");
      bon.textContent = "Keep them a year? [Yes] [No]";
      return bon;
    } })) ?? assert.fail("pas de bandeau");
    const detail = bandeau.dessous("section").find(({ className }) => className === "backlog-band-detail") ?? assert.fail("pas de détail");
    assert.equal("rouge" in detail.dataset, true);
    assert.deepEqual(posees.map(({ ticket }) => ticket), [9]);
    assert.match(detail.textContent, /Keep them a year\? \[Yes\] \[No\]$/);
    // Pas découpé : son état, en une ligne, à la place des étapes.
    assert.equal(detail.dessous("ul").length, 0);
  });

  test("dans le rail, les tickets du besoin choisi ressortent et les autres cartes s'effacent ; sans choix, toutes redeviennent ordinaires", () => {
    const besoins = besoinsDuBacklog(REFERENCE, RAIL, MAINTENANT);
    const grille = new Faux("div");
    const posees = [20, 21, 22, 30, 31].map((ticket) => [carte(ticket), new Faux("li")] as [Carte, Faux]);
    marquerLeRail(grille, posees, besoins.find(({ ticket }) => ticket === 7));
    assert.equal(grille.dataset.besoin, "7");
    assert.deepEqual(posees.map(([c, bon]) => [c.ticket, bon.dataset.besoin]), [[20, "sien"], [21, "sien"], [22, "sien"], [30, "autre"], [31, "autre"]]);
    // Un autre besoin choisi : les tickets du précédent redeviennent des autres.
    marquerLeRail(grille, posees, besoins.find(({ ticket }) => ticket === 6));
    assert.deepEqual(posees.map(([, bon]) => bon.dataset.besoin), ["autre", "autre", "autre", "autre", "autre"]);
    marquerLeRail(grille, posees, undefined);
    assert.equal(grille.dataset.besoin, undefined);
    assert.deepEqual(posees.map(([, bon]) => bon.dataset.besoin), [undefined, undefined, undefined, undefined, undefined]);
  });
});

describe("le titre déplie tout le backlog", () => {
  // Le backlog de référence, plus deux idées en réserve et quatre besoins tout servis, fermés à des heures différentes.
  const IDEES = vu([
    ...BESOINS_DE_REFERENCE,
    besoin(11, "non-lue", 1),
    besoin(30, "idee", null, { titre: "Un programme de fidélité", contexte: "Un client qui revient dix fois a son dessert offert." }),
    besoin(31, "idee", null, { titre: "La commande par QR code" }),
    besoin(40, "servie", 2, { tickets: [41], servis: [41], servieLe: "2026-11-13T08:00:00.000Z" }),
    besoin(42, "servie", null, { tickets: [43], servis: [43], servieLe: "2026-11-13T11:00:00.000Z" }),
    besoin(44, "servie", 1, { tickets: [45], servis: [45], servieLe: "2026-11-12T20:00:00.000Z" }),
    besoin(46, "servie", 3, { tickets: [47, 48], servis: [47, 48] }),
  ]);
  const deplie = (etat: Partial<Parameters<typeof poserBandeauBacklog>[1]> = {}, autres: Partial<Parameters<typeof poserBandeauBacklog>[2]> = {}) =>
    poser(doc, { vu: IDEES, besoins: besoinsDuBacklog(IDEES, RAIL, MAINTENANT), selection: undefined, deplie: true, rouges: 0, ...etat }, gestes(autres)) ?? assert.fail("pas de bandeau");
  const sections = (bandeau: Faux) => bandeau.dessous("section").filter(({ className }) => className === "backlog-band-section");
  const lignes = (pose: Faux | undefined) => (pose ?? assert.fail("pas de section")).dessous("li").filter(({ className }) => className.startsWith("backlog-band-ligne"));
  const textes = (ligne: Faux) => (ligne.dessous("button")[0] ?? assert.fail("pas de bouton")).children.map(({ textContent }) => textContent);

  test("deux sections, dans cet ordre : Next, puis Ideas in reserve ; ce qui a été servi en bas", () => {
    const titre = deplie().dessous("button").find(({ className }) => className === "backlog-band-titre") ?? assert.fail("pas de titre");
    assert.equal(titre.ariaExpanded, "true");
    assert.deepEqual(
      sections(deplie()).map((pose) => [pose.dataset.section, pose.dessous("h5")[0]?.children.slice(0, 2).map(({ textContent }) => textContent)]),
      [
        ["suite", ["Next", "5"]],
        ["idees", ["Ideas in reserve", "2"]],
        ["servis", ["Served", "4"]],
      ],
    );
  });

  test("Next : les besoins dans l'ordre où la cuisine les servira — prio:1, 2, 3, puis sans —, chacun son titre, sa priorité et, découpé, son avancement ; ni ce qui t'attend, ni les mots du manager", () => {
    const suite = lignes(sections(deplie())[0]);
    assert.deepEqual(suite.map(textes), [
      ["prio:1", "Besoin 7", "2/5 served"],
      ["prio:1", "Besoin 11"],
      ["prio:2", "Besoin 6"],
      ["prio:3", "Besoin 8"],
      ["no prio", "Besoin 5"],
    ]);
    // #9 et #10 t'attendent : ils sont dans TODO, pas ici.
    assert.equal(suite.some((ligne) => /Besoin (9|10)\b|Garder/.test(ligne.textContent)), false);
    const tout = deplie().dessous("div").find(({ className }) => className === "backlog-band-liste")?.textContent ?? "";
    assert.doesNotMatch(tout, /model:|effort:|fire|not read yet|calibrat|awaits you|said/);
  });

  test("un clic sur une ligne ouvre son issue ; une issue sans adresse ne s'ouvre pas", () => {
    const ouvertes: number[] = [];
    const choisis: number[] = [];
    const bandeau = deplie({}, { ouvrirIssue: (t) => void ouvertes.push(t), choisir: (t) => void choisis.push(t) });
    for (const pose of sections(bandeau)) lignes(pose)[0]?.dessous("button")[0]?.click();
    assert.deepEqual(ouvertes, [7, 30, 46]);
    assert.deepEqual(choisis, []);
    const sansAdresse = vu([besoin(5, "non-lue", null, { url: "file:///x" })]);
    const pose = poser(doc, { vu: sansAdresse, besoins: besoinsDuBacklog(sansAdresse, [], MAINTENANT), selection: undefined, deplie: true, rouges: 0 }, gestes()) ?? assert.fail("pas de bandeau");
    assert.equal(lignes(sections(pose)[0])[0]?.dessous("button")[0]?.disabled, true);
  });

  test("Ideas in reserve : chacune son titre et son résumé en une ligne, « Put on the rail » et « Drop » d'un geste", () => {
    const joues: [number, string][] = [];
    const reserve = lignes(sections(deplie({}, { idee: (t, id) => void joues.push([t, id]) }))[1]);
    assert.deepEqual(reserve.map(textes), [
      ["Un programme de fidélité", "Un client qui revient dix fois a son dessert offert."],
      ["La commande par QR code", ""],
    ]);
    const gestesDe = (ligne: Faux | undefined) => (ligne ?? assert.fail("pas de ligne")).dessous("button").filter(({ className }) => className === "backlog-band-idee-geste");
    assert.deepEqual(gestesDe(reserve[0]).map(({ textContent }) => textContent), ["Put on the rail", "Drop"]);
    gestesDe(reserve[0])[0]?.click();
    gestesDe(reserve[1])[1]?.click();
    assert.deepEqual(joues, [
      [30, "rail"],
      [31, "abandonner"],
    ]);
  });

  test("une idée dont le geste part : ses deux boutons attendent ; refusé, sa ligne dit pourquoi", () => {
    const idees = new Map([
      [30, { envoi: "rail" as const }],
      [31, { refus: "nothing was changed: GitHub did not close #31" }],
    ]);
    const reserve = lignes(sections(deplie({ idees }))[1]);
    const boutons = (reserve[0] ?? assert.fail("pas de ligne")).dessous("button").filter(({ className }) => className === "backlog-band-idee-geste");
    assert.deepEqual(boutons.map(({ textContent, disabled }) => [textContent, disabled]), [
      ["putting on the rail…", true],
      ["Drop", true],
    ]);
    assert.equal(reserve[1]?.dessous("p").find(({ className }) => className === "backlog-band-idee-refus")?.textContent, "nothing was changed: GitHub did not close #31");
  });

  test("Served : replié sur les trois plus récents — celui encore ouvert, puis par fermeture —, déplié d'un clic", () => {
    let bascules = 0;
    const replie = sections(deplie({}, { basculerServis: () => void bascules++ }))[2];
    assert.deepEqual(lignes(replie).map(textes), [
      ["prio:3", "Besoin 46", "2/2 served"],
      ["no prio", "Besoin 42", "1/1 served"],
      ["prio:2", "Besoin 40", "1/1 served"],
    ]);
    const bascule = replie?.dessous("button").find(({ className }) => className === "backlog-band-servis-bascule") ?? assert.fail("pas de bascule");
    assert.equal(bascule.textContent, "show all 4");
    assert.equal(bascule.ariaExpanded, "false");
    bascule.click();
    assert.equal(bascules, 1);
    const ouvert = sections(deplie({ servisDeplies: true }))[2];
    assert.deepEqual(lignes(ouvert).map((ligne) => textes(ligne)[1]), ["Besoin 46", "Besoin 42", "Besoin 40", "Besoin 44"]);
    assert.equal(ouvert?.dessous("button").find(({ className }) => className === "backlog-band-servis-bascule")?.ariaExpanded, "true");
  });

  test("rien de suivant ni d'idée : chaque section le dit ; rien de servi : pas de section Served", () => {
    const vide = vu([besoin(9, "mise-de-cote", null)]);
    const bandeau = poser(doc, { vu: vide, besoins: besoinsDuBacklog(vide, RAIL, MAINTENANT), selection: undefined, deplie: true, rouges: 1 }, gestes()) ?? assert.fail("pas de bandeau");
    assert.deepEqual(sections(bandeau).map((pose) => [pose.dataset.section, pose.dessous("p")[0]?.textContent]), [
      ["suite", "nothing next before the rail"],
      ["idees", "no idea in reserve"],
    ]);
  });

  test("le `+N` déplie la liste entière", () => {
    let bascules = 0;
    const bandeau = poser(doc, { vu: REFERENCE, besoins: besoinsDuBacklog(REFERENCE, RAIL, MAINTENANT), selection: undefined, deplie: false, rouges: 0 }, gestes({ basculer: () => void bascules++ })) ?? assert.fail("pas de bandeau");
    (bandeau.dessous("button").find(({ className }) => className === "backlog-band-plus") ?? assert.fail("pas de +N")).click();
    assert.equal(bascules, 1);
  });
});

describe("un besoin tout servi reste 24 h, marqué servi", () => {
  const FERME = "2026-11-12T12:00:00.000Z";
  const servi = vu([besoin(40, "servie", 2, { tickets: [41, 42], servis: [41, 42], servieLe: FERME }), besoin(5, "non-lue", null)]);
  const a = (heures: number, minutes = 0) => Date.parse(FERME) + heures * 3_600_000 + minutes * 60_000;

  test("encore là à 23 h 59, marqué servi ; parti à 24 h", () => {
    assert.equal(RETENUE_MS, 24 * 3_600_000);
    const encore = besoinsDuBacklog(servi, [], a(23, 59));
    assert.deepEqual(encore.map(({ ticket, servi: marque }) => [ticket, marque]), [[40, true], [5, false]]);
    const bandeau = poser(doc, { vu: servi, besoins: encore, selection: undefined, deplie: false, rouges: 0 }, gestes()) ?? assert.fail("pas de bandeau");
    const tag = bandeau.dessous("button").find(({ dataset }) => dataset.ticket === "40") ?? assert.fail("pas d'étiquette");
    assert.equal("servi" in tag.dataset, true);
    assert.equal(tag.children[2]?.textContent, "2/2 served");

    assert.deepEqual(besoinsDuBacklog(servi, [], a(24)).map(({ ticket }) => ticket), [5]);
    assert.deepEqual(besoinsDuBacklog(servi, [], a(30)).map(({ ticket }) => ticket), [5]);
  });

  test("tout servi mais pas encore fermé — sans heure de fermeture : il reste, marqué servi", () => {
    const ouvert = vu([besoin(40, "servie", 2, { tickets: [41], servis: [41] })]);
    assert.deepEqual(besoinsDuBacklog(ouvert, [], a(100)).map(({ ticket, servi: marque }) => [ticket, marque]), [[40, true]]);
  });
});

describe("ce que le bandeau dit quand rien n'est lu", () => {
  test("pas lu, ou une lecture fraîche qui ne le porte pas : pas de bandeau", () => {
    assert.equal(poser(doc, { vu: undefined, besoins: [], selection: undefined, deplie: false, rouges: 0 }, gestes()), null);
    assert.equal(poser(doc, { vu: { projet: "parade", demande: 1, a: "x", vide: "", nonPublie: true }, besoins: [], selection: undefined, deplie: false, rouges: 0 }, gestes()), null);
  });

  test("une lecture ratée : « not read » sur la ligne, sa raison au survol — aucun nombre", () => {
    const bandeau = poser(doc, { vu: { projet: "parade", demande: 1, a: "x", vide: "", sans: "what is before the rail was not read: HTTP 403. This is not “nothing before the rail”" }, besoins: [], selection: undefined, deplie: false, rouges: 0 }, gestes()) ?? assert.fail("pas de bandeau");
    assert.equal(bandeau.textContent, "Backlog" + "not read");
    assert.match(bandeau.dessous("span").find(({ className }) => className === "backlog-band-vide")?.title ?? "", /HTTP 403/);
  });

  test("rien avant le rail : il le dit, sans étiquette", () => {
    const rien = vu([]);
    const bandeau = poser(doc, { vu: rien, besoins: besoinsDuBacklog(rien, [], MAINTENANT), selection: undefined, deplie: false, rouges: 0 }, gestes()) ?? assert.fail("pas de bandeau");
    assert.equal(bandeau.textContent, "Backlog" + "0" + "nothing before the rail");
  });
});

function gestes(autres: Partial<Parameters<typeof poserBandeauBacklog>[2]> = {}): Parameters<typeof poserBandeauBacklog>[2] {
  return { choisir: () => {}, basculer: () => {}, ouvrirIssue: () => {}, carteDuChef: () => new Faux("li"), basculerServis: () => {}, idee: () => {}, ...autres };
}
