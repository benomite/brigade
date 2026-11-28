// Le rail est la vue principale de l'espace : au centre de l'écran, en six colonnes, posé quel
// que soit l'onglet affiché dessous. Chaque carte y montre ce que la file dit du ticket, écrit
// ce qu'elle n'en dit pas, et relaie mot pour mot ce que la box a écrit. Le clic d'une carte, quelle
// que soit sa colonne, ouvre sa fiche par-dessus le rail (#635) ; celle d'un ticket de T'attend écrit
// sa demande dans le second en un clic (#452), sans quitter le rail des yeux.
// La vue est jouée telle qu'elle est, devant un faux document (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { putAside } from "../src/awaiting.ts";
import { forTheBar } from "../src/bar.ts";
import { EXAMPLE } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { BANNER, holdFacts, type Drawable, type Facts } from "../src/facts.ts";
import { actionsOfCard } from "../src/card-actions.ts";
import { hourHM } from "../src/format.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import type { Read } from "../src/question.ts";
import type { Answered } from "../src/answered.ts";
import type { Terminal } from "../src/terminals.ts";
import { red } from "./helpers/red.ts";
import { cardOfTicket, type Fake, type Played, playTheVue, type Answers, openRead, repos } from "./helpers/false-vue.ts";

const VUE = join(import.meta.dirname, "../src/vue");
const A = "2026-10-13T10:04:12.000Z";
const PARADE = "parade";
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const SHELL: Terminal = { id: 2, projet: PARADE, genre: "shell", titre: "shell 1", note: "", arrete: false };
const startup = (projects: Parameters<typeof forTheBar>[0]["projets"] = [{ nom: PARADE, dossier: "/tmp/parade" }], here?: (name: string) => boolean, served: (project: unknown) => boolean = () => true) => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: projects }, served, here),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS, rubriques: HEADINGS,
  gestes: {},
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});

async function open(answers: Answers = {}): Promise<Played> {
  // Les gestes de la fiche sont ceux que le process principal propose : le module tel qu'il est.
  const vue = await playTheVue({ demarrage: () => startup(), espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }], shell: () => SHELL, gestesDeFiche: (card) => actionsOfCard(card), ...answers });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}

// Ce que la box rend, par ses deux lectures — passé par le process principal tel qu'il est
// (facts.ts) : la vue reçoit ce qu'il range, pas une carte écrite à la main.
const FACTS: Facts = {
  etat: "ouverte",
  lu: "2026-10-13T10:04:11.000Z",
  dernierTick: "2026-10-13T10:04:02.000Z",
  compteurs: { rail: 2, auTravail: 1, aLaPass: 1, attend: 1, livres24h: 1 },
  dernierEvenement: null,
  rail: [
    { ticket: 14, etat: "pris", titre: "Le journal en ajout seul", url: "https://github.com/benomite/brigade/issues/14", activite: { fait: "écrit", faitEn: "writing", cible: "app/src/bon.ts", depuis: "2026-10-13T10:02:11.000Z" } },
    { ticket: 21, etat: "en attente", titre: "L'export du journal", url: "https://github.com/benomite/brigade/issues/21", activite: null },
    { ticket: 22, etat: "en attente", titre: "Un ticket libre", url: "https://github.com/benomite/brigade/issues/22", activite: null },
    { ticket: 30, etat: "en pass", titre: "La pass verte", url: "https://github.com/benomite/brigade/issues/30", activite: { fait: "gates en cours", faitEn: "running the gates", cible: null, depuis: "2026-10-13T10:03:41.000Z" } },
    { ticket: 31, etat: "servi", titre: "Servi hier", url: "https://github.com/benomite/brigade/issues/31", activite: null },
    { ticket: 12, etat: "en pass", titre: "Validation SIRET", url: "https://github.com/benomite/brigade/issues/12", activite: null },
  ],
  cooks: [{ ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" }],
  attend: [{ ticket: 12, titre: "Validation SIRET", url: "https://github.com/benomite/brigade/issues/12" }],
};
// Ce que le bloc dit de #12 : une entrée longue, puis ce qui la précise sur plusieurs lignes —
// des blancs en tête, en fin et au milieu, une tabulation, ce qui ressemble à du HTML.
const LONG = `depuis 2 j  ${"livraison verte, non mergée — à merger à la main :   gh pr merge 31 ; ".repeat(30)}fin de l'entrée  `;
const SUITE = ["      │ une ligne de suite,   avec ses blancs  ", "      │ \tune tabulation, puis <b>pas du HTML</b> &amp; « des accents » → ✓", `      │ ${"x".repeat(900)}`, "      │ la dernière"];
const STATUS = [
  "projet     parade",
  "cuisine    ouverte",
  "",
  "attend     1 décision attend le chef depuis 2 j",
  `  #12  ${LONG}`,
  ...SUITE,
  "fin attend",
  "",
  "rail       2 en attente · 1 pris · 2 en pass · 1 servi",
  "  #14  pris  prio:1  par box/claude depuis 12 min, sans progrès depuis 3 min, bail encore 27 min  Le journal en ajout seul",
  "  #21  en attente  -  zone tenue par #14 (app/src) — depuis 2 h 05  L'export du journal",
  "  #22  en attente  -  depuis 3 min  Un ticket libre",
  "  #30  en pass  -  depuis 4 min, cuisiné par box/claude  La pass verte",
  "  #31  servi  -  une phrase que l'app ne connaît pas,   avec ses blancs  Servi hier",
  "  #12  en pass  -  depuis 2 j, cuisiné par mac/claude  Validation SIRET",
  "",
  "cooks      1 en cours",
  "",
].join("\n");

// Ce que le process principal envoie à la vue pour ce projet : `faits` reçus, puis `status` —
// ou `faits` seuls, tant que `status` n'a pas été lu.
const NOT_READ = null;
// `repondues` : les questions répondues que le process principal tient (answered.ts).
function drawable(facts: Facts = FACTS, status: string | typeof NOT_READ = STATUS, answeredEntries: ReadonlyMap<number, Answered> = new Map()): Drawable {
  const heldOnes = holdFacts(() => answeredEntries);
  const receivedOne = heldOnes.recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
  if (status === NOT_READ) return receivedOne;
  return heldOnes.attendre(putAside({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "status", texte: status }] })) ?? assert.fail("rien à redessiner");
}
const receive = (vue: Played, receivedOne: Drawable = drawable()) => vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });

const columns = (vue: Played) => vue.element("rail").dessous("section");
const slips = (or: Fake) => or.dessous("li").filter((li) => li.className === "bon");
// Les onglets du projet (#1184, #2921) : Rail porte toutes les colonnes ; Stations, la liste de ses stations.
const showTab = (vue: Played, title: "Rail" | "Stations") => {
  (vue.element("onglets-du-projet").children.find((pose) => pose.textContent === title) ?? assert.fail(`pas d'onglet ${title}`)).click();
};
const slipOf = (vue: Played, number: number): Fake => cardOfTicket(vue, number) ?? assert.fail(`pas de bon #${number}`);
// Ce qu'un bon dit de la file : chaque fait, son libellé puis sa valeur.
const doors = (slip: Fake) => slip.dessous("ul").flatMap((list) => list.children.map((done) => done.children.map((pose) => pose.textContent)));
// Ce que la file ne dit pas — pas ce qu'une carte de Livré dit de sa relecture, qui a ses classes.
const without = (slip: Fake) => slip.dessous("small").filter((pose) => pose.className === "").map((pose) => pose.textContent);
// Les deux lignes d'une carte (#622) : ce qui se passe, puis ce qui demande l'attention.
const lineOf = (slip: Fake) => slip.dessous("p").find((p) => p.className === "ligne-carte")?.textContent;
const signalOf = (slip: Fake) => slip.dessous("p").find((p) => p.className === "signal")?.textContent;
// Le détail que la carte ne porte plus, sur la fiche qu'un clic ouvre.
const detailsOf = (vue: Played, number: number): Fake | undefined => {
  slipOf(vue, number).click();
  return card(vue).dessous("section").find((pose) => pose.className === "details");
};
const relayed = (slip: Fake) => slip.dessous("p").filter((p) => p.className === "").map((p) => p.textContent);
// La fiche ouverte par-dessus le rail : ses lignes, libellé puis valeur ; ses gestes.
const card = (vue: Played) => vue.element("fiche");
const cardLines = (vue: Played) => card(vue).dessous("dl")[0]?.children.map((rank) => rank.children.map((pose) => pose.textContent)) ?? [];
const cardValue = (vue: Played, wording: string): Fake => card(vue).dessous("div").find((rank) => rank.children[0]?.textContent === wording)?.children[1] ?? assert.fail(`pas de ligne « ${wording} » sur la fiche`);
const requests = (vue: Played) => card(vue).dessous("button").filter((pose) => pose.className === "demander");
// Les gestes de la fiche ouverte (#639) : chacun, son nom, ce que son bouton dit, puis son prix —
// celui de son survol (bricks.js), qui n'est écrit nulle part ailleurs : absent, il ne coûte rien.
const helpers = (or: Fake) => or.dessous("button").filter((pose) => pose.className === "aide");
const openCardActions = (vue: Played) =>
  (card(vue).dessous("section").find((pose) => pose.className === "gestes-fiche")?.dessous("li") ?? []).map((line) => [
    line.dataset.geste,
    line.dessous("button")[0]?.textContent,
    (helpers(line)[0] as { ariaLabel?: string } | undefined)?.ariaLabel,
  ]);
// Le bouton d'un geste — pas l'icône de son survol.
const cardAction = (vue: Played, id: string): Fake =>
  card(vue).dessous("li").find((line) => line.dataset.geste === id)?.dessous("button").filter((pose) => pose.className !== "aide").at(-1) ?? assert.fail(`pas de geste « ${id} » sur la fiche`);
// Les boutons de la fiche, moins les icônes de survol.
const cardButtons = (vue: Played) => card(vue).dessous("button").filter((pose) => pose.className !== "aide");
const close = (vue: Played) => (card(vue).dessous("button").find((pose) => pose.className === "fermer") ?? assert.fail("pas de bouton pour fermer la fiche")).click();
const tab = (vue: Played, title: string): Fake => vue.element("onglets-du-projet").children.find((pose) => pose.textContent === title) ?? assert.fail(`pas d'onglet ${title}`);

describe("le rail occupe le centre de l'écran principal", () => {
  test("dans la page, il est posé dans la zone centrale, sous le nom du projet et les onglets, en haut — plus dans un onglet", () => {
    const html = readFileSync(join(VUE, "index.html"), "utf8");
    const center = html.slice(html.indexOf("<main>"), html.indexOf("</main>"));
    const ranks = ["<header>", 'id="onglets-du-projet"', "</header>", 'id="centre"', 'id="rail"', 'id="contenu"'].map((marker) => center.indexOf(marker));

    assert.ok(ranks.every((rank) => rank !== -1), "la zone centrale ne porte plus le rail, les onglets ou ce qu'ils montrent");
    assert.deepEqual(ranks, ranks.toSorted((a, b) => a - b));
    // Il n'est pas dans le contenu d'un onglet, ni dans la colonne de droite ; et rien des terminaux n'est au centre.
    const content = center.slice(center.indexOf('id="contenu"'), center.indexOf("</section>\n      </div>"));
    assert.ok(!content.includes('id="rail"'));
    assert.ok(!html.slice(html.indexOf('<aside id="second"')).includes('id="rail"'));
    assert.ok(!center.includes('id="terminaux"') && !center.includes('id="fil"'));
  });

  test("il a toute la hauteur du centre, qui défile : une page ouverte se pose par-dessus, sans la lui prendre", () => {
    const css = readFileSync(join(VUE, "vue.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = (selector: string) => new Map((new RegExp(`(?:^|})\\s*${selector.replace(/[#.]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? assert.fail(`pas de règle ${selector}`)).split(";").map((d) => d.trim()).filter(Boolean).map((d): [string, string] => [d.slice(0, d.indexOf(":")).trim(), d.slice(d.indexOf(":") + 1).trim()]));

    assert.equal(rule("main").get("flex-direction"), "column");
    assert.deepEqual([rule("#centre").get("flex"), rule("#centre").get("min-height"), rule("#centre").get("position")], ["1 1 0", "0", "relative"]);
    assert.deepEqual([rule("#rail").get("flex"), rule("#rail").get("min-height"), rule("#rail").get("overflow-y")], ["1 1 0", "0", "auto"]);
    // La page couvre le centre entier, posée sur lui, et défile dans sa hauteur ; elle a un fond : le rail ne se lit pas au travers.
    assert.deepEqual([rule("#contenu").get("position"), rule("#contenu").get("inset"), rule("#contenu").get("overflow-y"), rule("#contenu").get("background")], ["absolute", "0", "auto", "var(--fond)"]);
  });

  test("il est posé dès que l'espace s'ouvre, et le reste quel que soit ce qui est affiché : aucune page, un shell à droite", async () => {
    const vue = await open();
    receive(vue);
    const five = () => columns(vue).map((column) => column.children[0]?.children.map((pose) => pose.textContent));
    // Sur l'onglet Rail, où l'espace s'ouvre : le plan de la cuisine entier (#4238). TODO n'est pas une colonne (#3458) :
    // #12, qui attend le chef, est dans Pass, son étape.
    const EXPECTED = [["Backlog", "2"], ["Manager", "0"], ["Cooks", "1"], ["Pass", "2"], ["Served", "1"]];
    const entry = () => `TODO (${red(vue.element("rail")).length})`;

    // L'espace s'ouvre sans page : le rail est seul au centre, le second à droite.
    assert.equal(vue.element("contenu").hidden, true);
    assert.equal(vue.element("second").hidden, false);
    assert.equal(vue.element("rail").hidden, false);
    assert.deepEqual(five(), EXPECTED);
    assert.equal(entry(), "TODO (1)");

    // Un shell s'ouvre à droite : le centre n'en sait rien.
    (vue.element("terminaux").children.find((pose) => pose.textContent === "+ shell") ?? assert.fail("pas de « + shell »")).click();
    await repos();
    assert.equal(vue.element("rail").hidden, false);
    assert.equal(vue.element("rail").inert, false);
    assert.deepEqual(five(), EXPECTED);
    // Aucun onglet ne lui est plus nécessaire : une lecture de `faits` le redessine où que l'on soit.
    receive(vue, drawable({ ...FACTS, rail: [], attend: [], cooks: [] }, NOT_READ));
    assert.deepEqual(five(), [["Backlog", "0"], ["Manager", "0"], ["Cooks", "0"], ["Pass", "0"], ["Served", "0"]]);
    assert.equal(entry(), "TODO (0)");
  });

  test("avant la première lecture il le dit ; un projet qu'aucune station ne sert n'en a pas — rien n'est lu de lui", async () => {
    const vue = await open();
    assert.equal(vue.element("rail").hidden, false);
    assert.match(vue.element("rail").textContent, /^the rail: first read of the station's “facts” step in progress…$/);
    assert.deepEqual(columns(vue), []);

    const withoutStation = await playTheVue({ demarrage: () => startup([{ nom: PARADE, dossier: "/tmp/parade" }], undefined, () => false), espace: () => [SECOND] });
    (withoutStation.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
    await repos();
    // Rien n'est lu, mais la page ne reste pas vide : elle dit pourquoi (ticket 1405).
    assert.equal(withoutStation.element("rail").hidden, false);
    assert.match(withoutStation.element("rail").textContent, /^the rail is not read: no station is known to serve this project yet/);
    assert.deepEqual(columns(withoutStation), []);
  });

  test("un projet qui cuit sur cet ordinateur (#1122) a son rail, lu ici, comme une box", async () => {
    const here = await playTheVue({ demarrage: () => startup([{ nom: PARADE, dossier: "/tmp/parade" }], (name) => name === PARADE), espace: () => [SECOND] });
    (here.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
    await repos();
    assert.equal(here.element("rail").hidden, false);
    // La lecture est celle du geste de sa station, ici : aucune commande n'est dite.
    assert.match(here.element("rail").textContent, /^the rail: first read of the station's “facts” step in progress…$/);
    receive(here);
    assert.deepEqual(
      columns(here).map((column) => column.children[0]?.children[0]?.textContent),
      ["Backlog", "Manager", "Cooks", "Pass", "Served"],
    );
  });

  test("une box qui ne rend pas ses faits : le rail dit qu'il n'est pas dessiné, et ne montre aucune colonne vide à la place", async () => {
    const vue = await open();
    receive(vue, { projet: PARADE, demande: 0, a: A, titre: "FACTS NOT READ", erreur: "npm error Missing script: facts", atteinte: true, cas: null });

    assert.equal(vue.element("rail").hidden, false);
    assert.match(vue.element("rail").textContent, /^the rail is not drawn: FACTS NOT READ — tried at /);
    assert.deepEqual(columns(vue), []);
  });

  test("une box pas jointe (#728) : sans lecture antérieure, le rail ne montre que les tickets lus sur GitHub, sans colonne vide", async () => {
    const vue = await open();
    receive(vue, { projet: PARADE, demande: 0, a: A, titre: "PAS JOINT", erreur: "the station did not answer", atteinte: false, cas: null });

    assert.equal(vue.element("rail").hidden, false);
    assert.match(vue.element("rail").textContent, /^the tickets in the kitchen according to GitHub/);
    assert.match(vue.element("rail").textContent, /the rail is not drawn: PAS JOINT — tried at /);
    assert.deepEqual(columns(vue), []);
  });
});

const accounts = (vue: Played) => columns(vue).map((column) => column.children[0]?.children[1]?.textContent);

describe("une box pas jointe, après une lecture (#1078)", () => {
  test("les colonnes disent qu'elles ne sont pas connues, au lieu de « 0 » ; la liste de GitHub est repliée ; la box revenue, tout redevient normal", async () => {
    const vue = await open();
    receive(vue);
    receive(vue, { projet: PARADE, demande: 0, a: A, titre: "PAS JOINT", erreur: "the station did not answer", atteinte: false, cas: null });

    const rail = vue.element("rail");
    assert.deepEqual(accounts(vue), ["?", "?", "?", "?", "?"]);
    // Ce qui attend le chef n'est pas connu non plus : aucune carte n'est posée, et aucun « 0 » ne rassure — les colonnes disent « ? ».
    assert.deepEqual(red(rail), []);
    assert.match(rail.textContent, /not known while the station is unreachable/);
    assert.doesNotMatch(rail.textContent, /upcoming|unreachable since|kitchen state unknown/);
    assert.equal(rail.dessous("details").length, 1);

    receive(vue);
    assert.doesNotMatch(vue.element("rail").textContent, /not known while the station is unreachable/);
    assert.notDeepEqual(accounts(vue), ["?", "?", "?", "?", "?"]);
  });
});

// Ce que le process principal envoie à la vue d'une lecture du tableau qui n'a pas joint GitHub (board/read.ts, #1818).
const OUTSIDE_LINE = "2026-10-13T13:35:36.000Z";
const outsideLine = (a = OUTSIDE_LINE): Drawable => holdFacts().recevoir({ projet: PARADE, demande: 0, a, erreur: "GitHub could not be reached to read the Kitchen board of benomite/parade: fetch failed.", atteinte: true, cas: null, duTableau: true, horsLigne: true });
const signs = (vue: Played) => vue.element("rail").dessous("p").filter(({ className }) => className === "hors-ligne");
// L'espace du projet : sa bande, et son rail.
const SPACE = ["alertes", "rail"];
const ALARMS = /not verified|not drawn|not read|open Settings|could not be reached|NOT READ|tried at/;

describe("hors ligne (#1818)", () => {
  test("le rail garde sa dernière lecture, atténué, sous un seul signe daté — ni erreur, ni « not verified » ; le réseau revenu, il se relit et le signe part", async () => {
    const vue = await open();
    receive(vue);
    const readOnes = accounts(vue);
    receive(vue, outsideLine());
    receive(vue, outsideLine("2026-10-13T13:36:06.000Z"));

    const rail = vue.element("rail");
    assert.deepEqual(accounts(vue), readOnes);
    assert.equal(slipOf(vue, 14).hidden, false);
    assert.equal(rail.dataset.horsLigne, "");
    // Un seul signe, daté de la première lecture ratée de la série.
    assert.deepEqual(
      signs(vue).map(({ textContent }) => textContent),
      [`offline since ${new Date(OUTSIDE_LINE).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`],
    );
    for (const id of SPACE) assert.doesNotMatch(vue.element(id).textContent, ALARMS, id);
    // Un détour par Stations, et le retour sur Rail : toujours un seul signe.
    showTab(vue, "Stations");
    await repos();
    showTab(vue, "Rail");
    await repos();
    assert.equal(signs(vue).length, 1);
    assert.doesNotMatch(vue.element("rail").textContent, /not verified|not drawn|NOT READ|tried at/);

    receive(vue);
    assert.deepEqual(signs(vue), []);
    assert.equal(rail.dataset.horsLigne, undefined);
    assert.deepEqual(accounts(vue), readOnes);
  });

  test("hors ligne dès l'ouverture : le signe seul, ni rail vide, ni « first read », ni erreur", async () => {
    const vue = await open();
    receive(vue, outsideLine());
    assert.deepEqual(columns(vue), []);
    assert.equal(signs(vue).length, 1);
    assert.match(vue.element("rail").textContent, /^offline since /);
    for (const id of SPACE) assert.doesNotMatch(vue.element(id).textContent, /first read|not verified|not drawn|tried at|NOT READ/, id);
    showTab(vue, "Stations");
    await repos();
    showTab(vue, "Rail");
    await repos();
    assert.equal(signs(vue).length, 1);
    assert.doesNotMatch(vue.element("rail").textContent, /facts: first read|not verified|not drawn|NOT READ|tried at/);
  });

  test("une lecture en cours fait battre le haut du rail, sans phrase ; la réponse l'éteint ; hors ligne, rien ne bat sans lecture en cours", async () => {
    const vue = await open();
    const rail = vue.element("rail");
    // La première lecture est partie avec la barre.
    assert.equal(rail.dataset.lecture, "");
    receive(vue, outsideLine());
    assert.equal(rail.dataset.lecture, undefined);
    assert.equal(signs(vue).length, 1);
    // « try again » relit la box : le haut du rail bat jusqu'à la réponse.
    const trial = { sujet: "injoignable", verifie: true, ton: "rouge", dit: "station unreachable since 13:35", geste: "try again", bouton: "try again", appel: { relire: true }, prix: "none" } as const;
    vue.dire("surAlertes", { projet: PARADE, alertes: [trial], signal: { etat: "injoignable", dit: trial.dit } });
    await repos();
    const button = vue.element("alertes").dessous("button").find(({ textContent }) => textContent === "try again") ?? assert.fail("pas de « try again »");
    button.click();
    await repos();
    assert.ok(vue.appels.some(({ geste: action }) => action === "relireBox"));
    assert.equal(rail.dataset.lecture, "");
    assert.doesNotMatch(rail.textContent, /reading|in progress/);
    receive(vue);
    assert.equal(rail.dataset.lecture, undefined);
  });

  test("une vraie panne, en ligne, se dit comme avant", async () => {
    const vue = await open();
    receive(vue, { projet: PARADE, demande: 0, a: A, titre: "NOT READ FROM GITHUB", erreur: "The Kitchen board of benomite/parade (issue 7) cannot be read: no machine block.", atteinte: true, cas: null, duTableau: true });
    assert.match(vue.element("rail").textContent, /^the rail is not drawn: NOT READ FROM GITHUB — tried at /);
    assert.doesNotMatch(vue.element("rail").textContent, /panel|on the right/);
    assert.deepEqual(signs(vue), []);
  });
});

describe("une carte porte ce que la file dit", () => {
  test("ce que la cuisine en fait en ce moment, qui tient le ticket, depuis quand, son bail, et en clair ce qui le bloque — quand la file les donne", async () => {
    const vue = await open();
    receive(vue);

    // Sur la carte : une ligne, rien de ce qui ne change pas ce que le chef fait.
    assert.equal(lineOf(slipOf(vue, 14)), "writing app/src/bon.ts · 2 min ago");
    assert.equal(lineOf(slipOf(vue, 30)), "running the gates · 30 s ago");
    assert.ok((lineOf(slipOf(vue, 12)) ?? "") !== "");
    // Aucune carte ne dit le français du geste — « thinking · N s ago » est, depuis #3923, ce que dit un cook qui réfléchit.
    for (const slip of slips(vue.element("rail"))) assert.doesNotMatch(lineOf(slip) ?? "", /réfléchit/);
    for (const slip of slips(vue.element("rail"))) {
      assert.deepEqual(doors(slip), [], slip.textContent);
      assert.doesNotMatch(slip.textContent, /lease|bail|\b86\b|not given|taken by/);
    }
    // Le détail est dans la fiche.
    assert.deepEqual(doors(detailsOf(vue, 14) ?? assert.fail("pas de détail")), [
      ["taken by", "box/claude"],
      ["since", "12 min"],
      ["lease", "sans progrès depuis 3 min, bail encore 27 min"],
    ]);
    assert.deepEqual(doors(detailsOf(vue, 21) ?? assert.fail("pas de détail")), [["since", "2 h 05"], ["blocked by", "zone tenue par #14 (app/src)"]]);
    assert.deepEqual(doors(detailsOf(vue, 30) ?? assert.fail("pas de détail"))[0], ["since", "4 min"]);
    // « right now » est dans sa section : la liste ne le redit pas.
    assert.deepEqual((detailsOf(vue, 12) === undefined ? [] : doors(detailsOf(vue, 12) ?? assert.fail("pas de détail"))).filter(([wording]) => wording === "right now"), []);
    // Ce qui se recopie — une station — est en monospace ; une durée se lit.
    slipOf(vue, 14).click();
    const [holds, since] = (detailsOf(vue, 14) ?? assert.fail("pas de détail")).dessous("ul")[0]?.children ?? [];
    assert.deepEqual([holds?.children[1]?.className, since?.children[1]?.className], ["mono", ""]);
  });

  test("ce que la file ne donne pas n'est pas affiché : aucun texte de remplissage sur aucune carte (#747)", async () => {
    const vue = await open();
    receive(vue);

    for (const slip of slips(vue.element("rail"))) {
      assert.deepEqual(without(slip), [], slip.textContent);
      assert.doesNotMatch(slip.textContent, /not given by|not read by the app/);
    }
    // Aucune valeur n'est mise à la place de ce qui manque.
    for (const slip of slips(vue.element("rail"))) for (const [, value] of doors(slip)) assert.doesNotMatch(value ?? "", /^(|0|-|—|\?|aucun|personne|inconnu)$/i);
  });

  test("sans `status` lu, elle le dit : ce que `faits` donne seul est posé, le reste est écrit non communiqué", async () => {
    const vue = await open();
    receive(vue, drawable(FACTS, NOT_READ));

    assert.deepEqual(doors(detailsOf(vue, 14) ?? assert.fail("pas de détail")).map(([wording]) => wording), ["taken by"]);
    assert.deepEqual(without(slipOf(vue, 14)), []);
  });

  test("une ligne de `status` que l'app n'a pas su découper n'est ni sur la carte ni sur la fiche", async () => {
    const vue = await open();
    receive(vue);
    const slip = slipOf(vue, 31);

    assert.deepEqual(doors(slip), []);
    assert.doesNotMatch(slip.textContent, /une phrase que l'app ne connaît pas/);
    slip.click();
    assert.doesNotMatch(card(vue).textContent, /une phrase que l'app ne connaît pas/);
    assert.ok(STATUS.includes("une phrase que l'app ne connaît pas,   avec ses blancs"));
  });
});

describe("le haut du rail est allégé (#623)", () => {
  test("pas de phrase technique en tête : le rail commence par ses colonnes, et « stop the kitchen » n'y est pas", async () => {
    const vue = await open();
    receive(vue);

    const rail = vue.element("rail");
    assert.equal(rail.dessous("h3").some((pose) => /read at|stop the kitchen/.test(pose.textContent)), false);
    assert.equal(rail.dessous("button").some((pose) => /stop the kitchen/.test(pose.textContent)), false);
    // L'app n'arrête ni ne reprend la cuisine (#4681) : ni ligne « Kitchen » dans Settings, ni bouton d'arrêt.
    assert.throws(() => vue.element("arreter-cuisine"), /aucun élément/);
  });

  test("une lecture vieille se dit en tête, avec son âge ; une lecture neuve ne dit rien", async () => {
    const vue = await open();
    receive(vue);
    // Les faits des fixtures datent de 2026-10-13 : la lecture est vieille.
    // Sous la bande du haut (#4238), avec son geste : relire.
    const line = vue.element("rail").children[1];
    assert.equal(line?.className, "relisible");
    assert.match(line?.children[0]?.textContent ?? "", /^up to date \d+ min ago — /);
    assert.equal(line?.children[0]?.className, "fraicheur");
    assert.equal(line?.dessous("button").map(({ textContent }) => textContent).join(), "read again");
  });

  test("l'âge du rail se dit toujours, d'après l'heure où la box a lu l'état — pas celle de la lecture de l'app (#2054)", async () => {
    const vue = await open();
    const receivedOne = drawable();
    receive(vue, { ...receivedOne, a: "2026-11-02T08:25:00.000Z", publieLe: "2026-11-02T07:35:00.000Z" });
    // Plus une ligne de plus (#3523) : l'âge est au survol de la ligne d'état, du bandeau Backlog ou, sans eux, des colonnes.
    const columns = vue.element("rail").dessous("div").find(({ className }) => className === "colonnes");
    assert.match(columns?.title ?? "", /^rail as GitHub said it 50 min ago, at /);
    // Une lecture qui ne vient pas du tableau ne porte pas d'âge : rien n'est inventé.
    receive(vue, receivedOne);
    assert.doesNotMatch(vue.element("rail").dessous("div").find(({ className }) => className === "colonnes")?.title ?? "", /rail as GitHub said it/);
  });
});

describe("une carte rouge, dans la colonne de son étape, est le seul endroit où un ticket attend une décision (#3458)", () => {
  test("un ticket que la file dit attendre n'a qu'une carte, rouge et en tête de la colonne de son étape — avant même que `status` ait été lu", async () => {
    for (const status of [NOT_READ, STATUS]) {
      const vue = await open();
      receive(vue, drawable(FACTS, status));
      const or = columns(vue).filter((column) => slips(column).some((slip) => slip.children[0]?.children[0]?.textContent === "#12")).map((column) => column.children[0]?.children[0]?.textContent);

      assert.deepEqual(or, ["Pass"]);
      // En tête de sa colonne, avant #30 qui n'attend personne.
      const pass = columns(vue).find((column) => column.dataset.colonne === "Pass") ?? assert.fail("pas de Pass");
      assert.deepEqual(slips(pass).map((slip) => [slip.children[0]?.children[0]?.textContent, slip.dataset.carte]), [["#12", "attente"], ["#30", undefined]]);
      assert.equal(slips(vue.element("rail")).filter((slip) => slip.children[0]?.children[0]?.textContent === "#12").length, 1);
      // Sa pilule le dit en mots ; aucune autre carte ne la porte.
      const expected = slips(vue.element("rail")).filter((slip) => slip.dessous("span").some((pose) => pose.dataset.pastille === "awaiting"));
      assert.deepEqual(expected.map((slip) => slip.children[0]?.children[0]?.textContent), ["#12"]);
    }
  });

  test("la carte de T'attend dit en une phrase ce qu'on attend de toi : l'entrée longue du bloc `attend` n'est pas sur la carte (#622), ni sur la fiche (#832)", async () => {
    const vue = await open();
    receive(vue);
    const slip = slipOf(vue, 12);

    assert.deepEqual(relayed(slip), []);
    assert.ok(lineOf(slip) !== undefined && lineOf(slip) !== "");
    assert.ok(slip.textContent.length < 400, slip.textContent);
    assert.doesNotMatch(slip.textContent, /fin de l'entrée|la dernière/);
    slip.click();
    assert.doesNotMatch(card(vue).textContent, /fin de l'entrée|la dernière/);
    // Le bloc reste lisible en entier dans Paramètres : `status`, mot pour mot.
    assert.ok(STATUS.includes("la dernière"));
  });
});

describe("le clic d'une carte de T'attend (#452)", () => {
  test("« demander au second », depuis sa fiche, nomme le projet et le ticket au process principal, et l'écrit dans le second, à droite — le rail et l'onglet ouvert dessous restent posés", async () => {
    const vue = await open({ demander: () => ({ ...SECOND, note: "demande écrite dans le second, sans Entrée" }) });
    receive(vue);
    // Le geste est sur la fiche — celle de tout ticket (#639) — et sur la carte qui t'attend (#3363), pas sur les autres.
    const withTheAction = slips(vue.element("rail")).filter((slip) => slip.dessous("button").some((pose) => pose.className === "demander"));
    assert.deepEqual(withTheAction.map((slip) => slip === slipOf(vue, 12)), [true]);
    for (const slip of slips(vue.element("rail"))) {
      slip.click();
      await repos();
      assert.equal(requests(vue).length, 1, slip.textContent);
      close(vue);
    }
    slipOf(vue, 12).click();
    await repos();
    const [ask, ...others] = requests(vue);
    assert.deepEqual(others, []);
    assert.equal(ask?.dataset.geste, "demande");
    close(vue);
    await openRead(vue, "Settings");
    // Un clic sur la carte, un clic sur le geste : la même demande qu'avant.
    slipOf(vue, 12).click();
    await repos();
    requests(vue)[0]?.click();
    await repos();

    assert.deepEqual(vue.dernier("demander"), [PARADE, 12]);
    assert.equal(vue.element("note-second").textContent, "demande écrite dans le second, sans Entrée");
    assert.equal(vue.element("second").hidden, false);
    assert.equal(vue.element("rail").hidden, false);
    // Le centre n'a pas changé : la page Settings est toujours celle qui est ouverte.
    assert.equal(tab(vue, "Settings").ariaSelected, "true");
    assert.equal(vue.element("contenu").hidden, false);
    assert.deepEqual(relayed(slipOf(vue, 12)), []);
  });

  test("sans ce que le bloc dit de lui — `status` pas encore lu —, la carte est dans T'attend, écrit ce qui manque, et n'offre pas un geste composé de mots qu'elle n'a pas", async () => {
    const vue = await open();
    receive(vue, drawable(FACTS, NOT_READ));
    const slip = slipOf(vue, 12);

    assert.deepEqual(relayed(slip), []);
    slip.click();
    await repos();
    assert.equal(vue.element("fiche").hidden, false);
    // La demande au second, sur ce que le rail en donne ; aucun geste qu'une décision n'a pas nommé.
    assert.equal(requests(vue).length, 1);
    assert.deepEqual(openCardActions(vue).map(([id]) => id), ["issue", "second"]);
    assert.deepEqual(without(slip), []);
  });

  test("le numéro d'une carte ouvre son issue : la vue nomme le projet et le ticket, jamais une adresse", async () => {
    const vue = await open({ ouvrirIssue: () => true });
    receive(vue);
    slipOf(vue, 14).children[0]?.children[0]?.click();
    await repos();

    assert.deepEqual(vue.dernier("ouvrirIssue"), [PARADE, 14]);
  });

  test("un ticket mis de côté (#2075) : rouge sur le rail, sa ligne dit pourquoi, et le `#N` qu'elle nomme ouvre son issue d'un clic", async () => {
    const vue = await open({ ouvrirIssue: () => true });
    const reason = "changes what judges it: merge PR #2326 by hand";
    const setAside: Facts = {
      ...FACTS,
      rail: [...FACTS.rail, { ticket: 40, etat: "86", titre: "Un ticket retenu", url: "https://github.com/benomite/parade/issues/40", activite: null }],
      attend: [...(FACTS.attend ?? []), { ticket: 40, titre: "Un ticket retenu", url: "https://github.com/benomite/parade/issues/40", miseDeCote: { label: "blocked-on-human", raison: reason, liens: [{ numero: 2326, url: "https://github.com/benomite/parade/issues/2326" }] } }],
    };
    receive(vue, drawable(setAside, NOT_READ));
    // Mis de côté sans colonne dite par le runtime : il est dans le backlog, rouge (#3458, #4238).
    const onTheRail = columns(vue).find((column) => column.children[0]?.children[0]?.textContent === "Backlog") ?? assert.fail("pas de colonne Backlog");
    const slip = slips(onTheRail).find((pose) => pose.children[0]?.children[0]?.textContent === "#40") ?? assert.fail("#40 n'est pas sur le rail");
    assert.equal(slip.dataset.carte, "attente");
    assert.equal(lineOf(slip), reason);
    const link = slip.dessous("button").find((pose) => pose.className === "lien-de-ligne mono") ?? assert.fail("pas de lien sur la ligne");
    assert.equal(link.textContent, "#2326");
    link.click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirIssue"), [PARADE, 2326]);
    assert.equal(vue.element("fiche").hidden, true);
  });
});

// La question qu'une carte de T'attend pose, telle que son issue l'écrit (#681) : sur sa fiche, lue
// à l'ouverture par le process principal (question.ts) ; un clic sur un choix, ou une phrase et son
// bouton, et la réponse part sur l'issue. La demande au second reste à côté.
describe("la question qui t'attend, posée telle quelle, sans LLM (#681)", () => {
  const ISSUE = "https://github.com/benomite/brigade/issues/12";
  const TEXT = "**Manager — épique non découpée : une question.**\n\nLe popup remplace-t-il la fiche ?  (a) il la remplace, (b) il s'ouvre par-dessus\n\n_Lu par le manager._";
  const QUESTION: Read = {
    a: "2026-10-15T10:00:00.000Z",
    question: {
      url: `${ISSUE}#issuecomment-2`,
      resume: "Le popup remplace-t-il la fiche ?  (a) il la remplace, (b) il s'ouvre par-dessus",
      auteur: "benomite",
      a: "2026-10-15T08:00:00Z",
      texte: TEXT,
      choix: [
        { lettre: "a", texte: "il la remplace" },
        { lettre: "b", texte: "il s'ouvre par-dessus" },
      ],
      depuis: [],
    },
  };
  const section = (vue: Played) => card(vue).dessous("section").find((pose) => pose.className === "question");
  const choice = (vue: Played) => section(vue)?.dessous("button").filter((pose) => pose.className === "choix") ?? [];
  const post = (vue: Played) => section(vue)?.dessous("button").find((pose) => pose.textContent === "post this answer") ?? assert.fail("pas de bouton pour poster la phrase");
  const input = (vue: Played) => section(vue)?.dessous("textarea")[0] ?? assert.fail("pas de champ pour une phrase");
  async function openTheCard(answers: Answers): Promise<Played> {
    const vue = await open(answers);
    receive(vue);
    slipOf(vue, 12).click();
    await repos();
    return vue;
  }

  test("le clic de la carte ouvre sa fiche, qui lit l'issue et pose la question mot pour mot, ses choix en boutons, un champ pour une phrase — et la demande au second, toujours là", async () => {
    const vue = await openTheCard({ lireQuestion: () => QUESTION });

    assert.deepEqual(vue.dernier("lireQuestion"), [PARADE, 12]);
    assert.equal(section(vue)?.dessous("blockquote")[0]?.textContent, TEXT);
    assert.deepEqual(choice(vue).map((pose) => pose.textContent), ["a) il la remplace", "b) il s'ouvre par-dessus"]);
    assert.equal(input(vue).value, "");
    // Rien n'est choisi d'avance, et une phrase vide ne part pas.
    assert.equal(post(vue).disabled, true);
    assert.ok(!vue.appels.some(({ geste: action }) => action === "repondreQuestion"));
    assert.equal(requests(vue).length, 1);
  });

  test("tant que l'issue n'est pas lue, la fiche le dit ; une carte qui ne t'attend pas ne lit rien", async () => {
    let read: (readEntry: Read) => void = () => {};
    const vue = await openTheCard({ lireQuestion: () => new Promise<Read>((resolve) => (read = resolve)) as never });
    assert.match(section(vue)?.textContent ?? "", /^Reading issue #12, for the question it asks…$/);
    read(QUESTION);
    await repos();
    assert.equal(choice(vue).length, 2);

    close(vue);
    const readings = vue.appels.filter(({ geste: action }) => action === "lireQuestion").length;
    slipOf(vue, 14).click();
    await repos();
    assert.equal(vue.appels.filter(({ geste: action }) => action === "lireQuestion").length, readings);
    assert.equal(section(vue), undefined);
  });

  test("un clic sur un choix, et c'est répondu : la vue nomme la question et la lettre, jamais le texte — puis dit que c'est posté, sans plus rien offrir à poster", async () => {
    const vue = await openTheCard({ lireQuestion: () => QUESTION, repondreQuestion: () => ({ poste: true, corps: "b) il s'ouvre par-dessus" }) });
    choice(vue)[1]?.click();
    await repos();

    assert.deepEqual(vue.dernier("repondreQuestion"), [PARADE, 12, { question: `${ISSUE}#issuecomment-2`, vu: "", choix: "b" }]);
    assert.match(section(vue)?.dessous("p").find((pose) => pose.className === "postee")?.textContent ?? "", /^answer posted on #12, in your name: “b\) il s'ouvre par-dessus” — the manager reads it at its next tick/);
    assert.deepEqual(choice(vue), []);
    assert.deepEqual(section(vue)?.dessous("textarea"), []);
    // La demande au second reste, pour qui veut une explication.
    assert.equal(requests(vue).length, 1);
  });

  test("une phrase part par son bouton, telle qu'écrite ; Entrée ne l'envoie pas, et la fiche reposée garde ce qui est écrit", async () => {
    const vue = await openTheCard({ lireQuestion: () => QUESTION, repondreQuestion: () => ({ poste: true, corps: "Par-dessus." }) });
    const field = input(vue);
    field.value = "Par-dessus.";
    field.declencher("input");
    field.declencher("keydown", { key: "Enter" });
    await repos();
    assert.ok(!vue.appels.some(({ geste: action }) => action === "repondreQuestion"));
    assert.equal(post(vue).disabled, false);

    // Une lecture qui change la fiche la repose : la phrase y est encore.
    receive(vue, drawable({ ...FACTS, attend: [{ ...FACTS.attend![0]!, titre: "Validation SIRET, retitrée" }] }));
    await repos();
    assert.equal(input(vue).value, "Par-dessus.");

    post(vue).click();
    await repos();
    assert.deepEqual(vue.dernier("repondreQuestion"), [PARADE, 12, { question: `${ISSUE}#issuecomment-2`, vu: "", texte: "Par-dessus." }]);
  });

  test("ce qui a été écrit sur l'issue depuis la question se lit sous elle", async () => {
    const vue = await openTheCard({ lireQuestion: () => ({ ...QUESTION, question: { ...QUESTION.question, depuis: [{ auteur: "benomite", a: "2026-10-15T09:00:00Z", url: `${ISSUE}#issuecomment-3`, corps: "b, sans hésiter" }] } }) as Read });
    const since = section(vue)?.dessous("ul").find((pose) => pose.className === "depuis");
    assert.equal(since?.children[0]?.dessous("p")[0]?.textContent, "b, sans hésiter");
  });

  test("refusée — la question a changé entre-temps —, rien n'est dit posté : le refus se lit, et la question nouvelle prend la place de l'ancienne", async () => {
    const NEW: Read = { ...QUESTION, question: { ...QUESTION.question, url: `${ISSUE}#issuecomment-5`, texte: "Une autre question ? (a) oui (b) non", choix: [{ lettre: "a", texte: "oui" }, { lettre: "b", texte: "non" }] } };
    const vue = await openTheCard({ lireQuestion: () => QUESTION, repondreQuestion: () => ({ poste: false, refus: "nothing was posted: the question on the issue is no longer the one you read", lue: NEW }) });
    choice(vue)[0]?.click();
    await repos();

    assert.equal(section(vue)?.dessous("blockquote")[0]?.textContent, "Une autre question ? (a) oui (b) non");
    assert.deepEqual(choice(vue).map((pose) => pose.textContent), ["a) oui", "b) non"]);
    assert.equal(section(vue)?.dessous("p").find((pose) => pose.className === "refus")?.textContent, "nothing was posted: the question on the issue is no longer the one you read");
  });

  test("une issue sans question n'ajoute rien à la fiche ; une issue pas lue le dit, et la demande au second reste", async () => {
    const no = await openTheCard({ lireQuestion: () => ({ a: QUESTION.a, aucune: true }) });
    assert.equal(section(no), undefined);
    assert.equal(requests(no).length, 1);

    // Pas lue : une ligne ; ce que `gh` a répondu n'est lisible qu'au survol.
    const notRead = await openTheCard({ lireQuestion: () => ({ a: QUESTION.a, sans: "$ gh issue view … → exit code 4" }) });
    const unavailable = section(notRead)?.dessous("p").find((pose) => pose.className === "indisponible") ?? assert.fail("pas de ligne « indisponible »");
    assert.equal(unavailable.children[0]?.textContent, "Question not reached.");
    assert.doesNotMatch(unavailable.textContent, /exit code/);
    helpers(unavailable)[0]?.declencher("focus");
    assert.match(unavailable.textContent, /\$ gh issue view … → exit code 4/);
    assert.equal(requests(notRead).length, 1);
  });
});

// La question qui t'attend se lit sur sa carte, et la carte quitte TODO quand la réponse est partie
// (#503) : l'épique #60 attend une réponse à la question du manager avant d'être découpée.
describe("une question du manager se lit sur sa carte, et la carte quitte TODO dès qu'elle est répondue (#503)", () => {
  const ISSUE = "https://github.com/benomite/brigade/issues/60";
  const ENTRY = "  #60  depuis 2 h  question du manager avant de découper l'épique — à répondre : sur l'issue, il la relit et la découpe ; ou fermer l'issue";
  const FACTS_60: Facts = { ...FACTS, attend: [...(FACTS.attend ?? []), { ticket: 60, titre: "Le popup des questions", url: ISSUE }] };
  const STATUS_60 = STATUS.replace("fin attend", `${ENTRY}\nfin attend`);
  const QUESTION: Read = {
    a: "2026-10-15T10:00:00.000Z",
    question: {
      url: `${ISSUE}#issuecomment-2`,
      resume: "Le popup remplace-t-il la fiche ?",
      auteur: "brigade-manager",
      a: "2026-10-15T08:00:00Z",
      texte: "Le popup remplace-t-il la fiche ? (a) oui (b) non",
      choix: [
        { lettre: "a", texte: "oui" },
        { lettre: "b", texte: "non" },
      ],
      depuis: [],
    },
  };
  const ANSWER = { auteur: "benomite", a: "2026-10-15T09:00:00Z", url: `${ISSUE}#issuecomment-3`, corps: "b" };
  const ANSWERED: Read = { ...QUESTION, question: { ...QUESTION.question, depuis: [ANSWER], repondue: ANSWER } };
  const columnOf = (vue: Played, number: number) => columns(vue).find((column) => slips(column).some((slip) => slip.children[0]?.children[0]?.textContent === `#${number}`))?.children[0]?.children[0]?.textContent;
  const section = (vue: Played) => card(vue).dessous("section").find((pose) => pose.className === "question");

  test("rouge sur le rail, la carte de l'épique dit la question du manager en une ligne, et qui l'a posée — sans ouvrir sa fiche ni GitHub", async () => {
    const vue = await open({ lireQuestion: () => QUESTION });
    receive(vue, drawable(FACTS_60, STATUS_60));
    await repos();

    assert.deepEqual(vue.dernier("lireQuestion"), [PARADE, 60]);
    // L'épique n'est pas sur le rail que `faits` rend : la question du manager, sa carte rouge est dans Manager (#3458, #4238).
    assert.equal(columnOf(vue, 60), "Manager");
    assert.equal(slipOf(vue, 60).dataset.carte, "attente");
    const slip = slipOf(vue, 60);
    assert.equal(slip.dessous("p").find((pose) => pose.className === "question-courte")?.textContent, "Le popup remplace-t-il la fiche ?");
    assert.ok(slip.textContent.includes("asked by brigade-manager"), slip.textContent);
    // Une livraison à merger ne porte pas de question : son issue n'est pas lue pour la carte.
    assert.ok(!vue.appels.some(({ geste: action, args }) => action === "lireQuestion" && args[1] === 12));
  });

  test("la réponse partie, la carte passe dans WAITING au redessin que le process principal envoie — la fiche ouverte garde ce qui a été posté", async () => {
    const vue = await open({ lireQuestion: () => QUESTION, repondreQuestion: () => ({ poste: true, corps: "b) non" }) });
    receive(vue, drawable(FACTS_60, STATUS_60));
    await repos();
    slipOf(vue, 60).click();
    await repos();
    (section(vue)?.dessous("button").find((pose) => pose.textContent === "b) non") ?? assert.fail("pas de choix b")).click();
    await repos();
    assert.deepEqual(vue.dernier("repondreQuestion"), [PARADE, 60, { question: `${ISSUE}#issuecomment-2`, vu: "", choix: "b" }]);

    receive(vue, drawable(FACTS_60, STATUS_60, new Map([[60, { question: `${ISSUE}#issuecomment-2`, par: "you", a: "2026-10-15T10:05:00.000Z" }]])));
    await repos();
    // Répondue, elle attend que le manager lise la réponse : dans Manager (#4238).
    assert.equal(columnOf(vue, 60), "Manager");
    assert.match(slipOf(vue, 60).textContent, /answered by you · the manager's turn/);
    assert.doesNotMatch(slipOf(vue, 60).textContent, /awaiting you/);
    assert.match(section(vue)?.dessous("p").find((pose) => pose.className === "postee")?.textContent ?? "", /^answer posted on #60, in your name: “b\) non” — the manager reads it at its next tick; until then the card waits for it in the Manager column\.$/);
  });

  test("répondue ailleurs — sur GitHub, par le second —, la fiche le dit, et ce que le chef poste encore dit ce qu'il a vu dessous", async () => {
    const vue = await open({ lireQuestion: () => ANSWERED, repondreQuestion: () => ({ poste: true, corps: "et vite" }) });
    receive(vue, drawable(FACTS_60, STATUS_60));
    await repos();
    slipOf(vue, 60).click();
    await repos();

    assert.match(section(vue)?.dessous("p").find((pose) => pose.className === "repondue")?.textContent ?? "", /^answered on the issue by benomite, .* — the manager reads it at its next tick/);
    const field = section(vue)?.dessous("textarea")[0] ?? assert.fail("pas de champ");
    field.value = "et vite";
    field.declencher("input");
    (section(vue)?.dessous("button").find((pose) => pose.textContent === "post this answer") ?? assert.fail("pas de bouton")).click();
    await repos();
    assert.deepEqual(vue.dernier("repondreQuestion"), [PARADE, 60, { question: `${ISSUE}#issuecomment-2`, vu: `${ISSUE}#issuecomment-3`, texte: "et vite" }]);
  });
});

// Livré, d'une box qui donne `livres` : un ticket livré y reste 24 h après la fermeture de son
// issue, et sa PR mergée s'ouvre d'un clic.
describe("Livré garde ce que la cuisine a servi", () => {
  const DELIVERED: NonNullable<Facts["livres"]> = [
    { ticket: 216, titre: "Le relevé des mesures", url: "https://github.com/benomite/brigade/issues/216", livre: "2026-10-13T10:03:58.000Z", station: "box/claude", pr: "https://github.com/benomite/brigade/pull/219" },
    { ticket: 188, titre: "Une fiche sans zone", url: "https://github.com/benomite/brigade/issues/188", livre: "2026-10-12T16:30:05.000Z", station: "box/claude", pr: null },
  ];
  const delivers = (vue: Played) => columns(vue).at(-1) ?? assert.fail("pas de colonne");

  test("ses cartes sont celles des livrés, partis du rail ou non, le plus récent en haut : quand, par qui — et la PR mergée s'ouvre d'un clic, la vue ne nommant que le projet et le ticket", async () => {
    const vue = await open({ ouvrirPr: () => true });
    receive(vue, drawable({ ...FACTS, compteurs: { ...FACTS.compteurs, livres24h: 2 }, livres: DELIVERED }, NOT_READ));

    assert.deepEqual(delivers(vue).children[0]?.children.map((pose) => pose.textContent), ["Served", "2"]);
    assert.deepEqual(slips(delivers(vue)).map((slip) => slip.children[0]?.children[0]?.textContent), ["#216", "#188"]);
    assert.equal(lineOf(slipOf(vue, 216)), `served at ${hourHM("2026-10-13T10:03:58.000Z")}`);
    assert.equal(lineOf(slipOf(vue, 188)), `served at ${hourHM("2026-10-12T16:30:05.000Z")}`);
    assert.deepEqual(doors(slipOf(vue, 216)), []);
    assert.deepEqual(doors(detailsOf(vue, 216) ?? assert.fail("pas de détail")), [["merged", "13 s ago"], ["cooked by", "box/claude"]]);
    assert.deepEqual(doors(detailsOf(vue, 188) ?? assert.fail("pas de détail")), [["served", "17 h 34 before the reading"], ["cooked by", "box/claude"], ["PR", "none — served without a merge"]]);
    close(vue);
    // #31, servi encore sur le rail mais pas dans les livrés : il n'est pas dans Livré.
    assert.ok(!slips(delivers(vue)).some((slip) => slip.children[0]?.children[0]?.textContent === "#31"));

    assert.deepEqual(slipOf(vue, 188).dessous("button").filter((pose) => pose.className === "pr"), []);
    const pr = slipOf(vue, 216).dessous("button").find((pose) => pose.className === "pr") ?? assert.fail("pas de bouton de PR");
    pr.click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirPr"), [PARADE, 216]);
  });

  test("rien de servi en 24 h : la colonne le dit", async () => {
    const vue = await open();
    receive(vue, drawable({ ...FACTS, compteurs: { ...FACTS.compteurs, livres24h: 0 }, livres: [] }, NOT_READ));

    assert.equal(delivers(vue).children[1]?.textContent, "nothing served in the last 24 h");
  });

  test("longue, elle défile dans sa hauteur : elle ne pousse rien sous la grille, et les autres colonnes restent en vue", async () => {
    const vue = await open();
    receive(vue, drawable({ ...FACTS, livres: DELIVERED }, NOT_READ));
    assert.deepEqual(columns(vue).map((column) => "defile" in column.dataset), [false, false, false, false, true]);

    const css = readFileSync(join(VUE, "vue.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const body = /(?:^|})\s*#rail \.colonne\[data-defile\] > ol\s*\{([^}]*)\}/.exec(css)?.[1] ?? assert.fail("pas de règle pour la colonne qui défile");
    assert.match(body, /max-height:\s*\d+vh/);
    assert.match(body, /overflow-y:\s*auto/);
  });
});

// La fiche d'un ticket (#635) : un clic sur sa carte, quelle que soit sa colonne, l'ouvre par-dessus le
// rail. Elle porte pour l'instant son en-tête — titre entier, numéro, priorité, issue, PR —, et écrit ce
// que la box ne donne pas. La fermer rend le rail tel qu'il était : ni redessiné, ni défilé ailleurs.
describe("un clic sur une carte ouvre sa fiche par-dessus le rail (#635)", () => {
  const DELIVERED: NonNullable<Facts["livres"]> = [
    { ticket: 216, titre: "Le relevé des mesures", url: "https://github.com/benomite/brigade/issues/216", livre: "2026-10-13T10:03:58.000Z", station: "box/claude", pr: "https://github.com/benomite/brigade/pull/219" },
    { ticket: 188, titre: "Une fiche sans zone", url: "https://github.com/benomite/brigade/issues/188", livre: "2026-10-12T16:30:05.000Z", station: "box/claude", pr: null },
  ];
  // Et un ticket qui attend un tiers : parked, il a sa carte dans le backlog (#4238).
  const IN_WAITING = { ticket: 50, etat: "WAITING", titre: "Le devis du client", url: "https://github.com/benomite/brigade/issues/50", activite: null, tiers: { quoi: "sa validation écrite", qui: "le client", depuis: "2026-10-12T09:00:00.000Z", relance: "2026-10-19T00:00:00.000Z", aLArrivee: "il repart en cuisine" } };
  const WITH_DELIVERED = { ...FACTS, rail: [...FACTS.rail, IN_WAITING], compteurs: { ...FACTS.compteurs, livres24h: 2 }, livres: DELIVERED };

  test("une carte de chaque colonne l'ouvre, et la fermer — son bouton ou Échap — rend le rail tel qu'il était, sans le redessiner", async () => {
    const vue = await open();
    receive(vue, drawable(WITH_DELIVERED));
    const rail = vue.element("rail");
    const poses = rail.dessous("li");
    assert.equal(card(vue).hidden, true);

    // Le manager ne tient aucun ticket de ce rail : chaque autre colonne a sa carte — #50, parked, dans le backlog (#4238).
    const filled = columns(vue).filter((column) => slips(column).length > 0);
    assert.deepEqual(filled.map((column) => column.children[0]?.children[0]?.textContent), ["Backlog", "Cooks", "Pass", "Served"]);
    for (const column of filled) {
      const [slip] = slips(column);
      const number = slip?.children[0]?.children[0]?.textContent ?? assert.fail(`pas de carte dans ${column.textContent}`);
      for (const closes of ["bouton", "Échap"]) {
        slip?.click();
        await repos();
        // Elle est posée par-dessus : le rail reste là, dessous, et ne se clique pas au travers.
        assert.equal(card(vue).hidden, false, number);
        assert.equal(card(vue).dessous("header")[0]?.children[0]?.textContent, number);
        assert.deepEqual([rail.hidden, rail.inert], [false, true]);
        if (closes === "bouton") close(vue);
        else card(vue).declencher("keydown", { key: "Escape" });
        await repos();
        assert.equal(card(vue).hidden, true, `${number}, fermée par ${closes}`);
        assert.deepEqual([rail.hidden, rail.inert], [false, false]);
      }
    }
    // Un clic à côté du popup, sur le voile, la ferme ; un clic dans le panneau, non.
    const [first] = columns(vue).flatMap(slips);
    first?.click();
    await repos();
    card(vue).declencher("click", { target: card(vue).dessous("header")[0] });
    assert.equal(card(vue).hidden, false);
    card(vue).declencher("click", { target: card(vue) });
    await repos();
    assert.equal(card(vue).hidden, true);
    // Ni rechargé ni redessiné : ce sont les mêmes cartes, et la fiche n'a rien demandé à la box.
    assert.deepEqual(rail.dessous("li"), poses);
    assert.ok(poses.every((pose) => rail.contains(pose)));
    assert.equal(vue.appels.filter(({ geste: action }) => action === "faits").length, 1);
    // Une autre touche ne la ferme pas.
    slipOf(vue, 14).click();
    card(vue).declencher("keydown", { key: "Enter" });
    assert.equal(card(vue).hidden, false);
  });

  test("au clavier, Entrée sur une carte l'ouvre aussi ; et ce qui se clique déjà sur la carte garde son geste — le numéro ouvre l'issue, pas la fiche", async () => {
    const vue = await open({ ouvrirIssue: () => true, ouvrirPr: () => true });
    receive(vue, drawable(WITH_DELIVERED));

    slipOf(vue, 21).declencher("keydown", { key: "Enter", target: slipOf(vue, 21) });
    assert.equal(card(vue).dessous("header")[0]?.children[0]?.textContent, "#21");
    close(vue);

    const number = slipOf(vue, 14).children[0]?.children[0] ?? assert.fail("pas de numéro");
    // Le navigateur fait remonter le clic du numéro jusqu'à sa carte : elle le voit, et ne s'ouvre pas.
    number.click();
    slipOf(vue, 14).declencher("click", { target: number });
    await repos();
    assert.deepEqual(vue.dernier("ouvrirIssue"), [PARADE, 14]);
    assert.equal(card(vue).hidden, true);
    const pr = slipOf(vue, 216).dessous("button").find((pose) => pose.className === "pr") ?? assert.fail("pas de bouton de PR");
    slipOf(vue, 216).declencher("click", { target: pr });
    assert.equal(card(vue).hidden, true);
    // Un clic sur le texte de la carte, lui, l'ouvre.
    slipOf(vue, 14).declencher("click", { target: slipOf(vue, 14).children[1] });
    assert.equal(card(vue).hidden, false);
  });

  test("l'en-tête : le titre entier, le numéro, un lien vers l'issue — et vers la PR quand il y en a une, sans quoi aucun lien n'est posé", async () => {
    const TITLE = `${"Un titre que la carte ne coupe pas, et que la fiche donne entier — ".repeat(12)}jusqu'au dernier mot`;
    const vue = await open({ ouvrirIssue: () => true, ouvrirPr: () => true });
    receive(vue, drawable({ ...WITH_DELIVERED, rail: FACTS.rail.map((ticket) => (ticket.ticket === 14 ? { ...ticket, titre: TITLE } : ticket)) }, STATUS.replace("Le journal en ajout seul", TITLE)));

    slipOf(vue, 14).click();
    await repos();
    assert.equal(card(vue).dessous("h3")[0]?.textContent, TITLE);
    // L'issue qui s'ouvre est un geste de la fiche, avec son prix (#639) : l'en-tête n'a plus de ligne pour elle.
    // Aucune ligne de priorité, ni de PR sans PR donnée.
    assert.deepEqual(cardLines(vue), [["priority", "prio:1"]], "pas de PR donnée : pas de ligne PR");
    // Le numéro se recopie : en monospace.
    assert.equal(card(vue).dessous("header")[0]?.children[0]?.className, "mono");
    // Le lien de l'issue nomme le projet et le ticket : l'adresse reste au process principal.
    cardAction(vue, "issue").click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirIssue"), [PARADE, 14]);
    assert.deepEqual(openCardActions(vue).map(([id]) => id), ["issue", "second"], "pas de PR donnée : pas de geste PR");
    close(vue);

    // Livré : la PR mergée s'ouvre d'un clic depuis la fiche ; servi sans merge, la fiche le dit, sans lien.
    slipOf(vue, 216).click();
    await repos();
    const pr = cardAction(vue, "pr");
    assert.equal(pr.textContent, "open the merged PR");
    pr.click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirPr"), [PARADE, 216]);
    close(vue);
    slipOf(vue, 188).click();
    await repos();
    assert.equal(cardValue(vue, "PR").textContent, "none — served without a merge");
    assert.deepEqual(cardButtons(vue).map((pose) => pose.textContent), ["close", "open the issue", "ask the second"]);

    // Et la peau ne coupe pas le titre : aucune ligne bornée, aucun point de suspension.
    const css = readFileSync(join(VUE, "vue.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const body = /(?:^|})\s*#fiche h3\s*\{([^}]*)\}/.exec(css)?.[1] ?? assert.fail("pas de règle pour le titre de la fiche");
    assert.doesNotMatch(body, /overflow:\s*hidden|text-overflow|line-clamp|max-height|white-space:\s*nowrap/);
    // Un popup : un voile sur le centre, le rail visible dessous, et un panneau de lecture, borné, qui défile.
    const veil = /(?:^|})\s*#fiche\s*\{([^}]*)\}/.exec(css)?.[1] ?? assert.fail("pas de règle pour la fiche");
    for (const declaration of [/position:\s*absolute/, /inset:\s*0/, /background:\s*var\(--ombre\)/]) assert.match(veil, declaration);
    const panel = /(?:^|})\s*#fiche \.panneau\s*\{([^}]*)\}/.exec(css)?.[1] ?? assert.fail("pas de règle pour le panneau de la fiche");
    for (const declaration of [/width:\s*min\(/, /max-height:\s*100%/, /overflow-y:\s*auto/, /background:\s*var\(--fond\)/]) assert.match(panel, declaration);
  });

  test("ce que la box ne donne pas est écrit « non communiqué », avec sa raison — jamais une valeur devinée, jamais une ligne vide", async () => {
    // Un ticket que `faits` dit attendre sans être sur le rail, ni titre ni adresse ; et `status` pas encore lu.
    const vue = await open();
    receive(vue, drawable({ ...FACTS, attend: [...(FACTS.attend ?? []), { ticket: 40, titre: "", url: null }] }, NOT_READ));

    slipOf(vue, 40).click();
    // Pas de titre donné : aucune ligne à sa place.
    assert.deepEqual(card(vue).dessous("p").filter((pose) => pose.className === "sans"), []);
    assert.deepEqual(card(vue).dessous("h3"), []);
    assert.deepEqual(cardLines(vue), [
      ["priority", "not given — `facts` does not give it, and the `rail` line of `status` was not read"],
      ["issue", "not given — the station returns no address for this issue"],
    ]);
    // Chaque ligne non communiquée se lit comme telle : ce sont les mots de l'app.
    for (const wording of ["priority", "issue"]) assert.equal(cardValue(vue, wording).className, "sans", wording);
    for (const [, value] of cardLines(vue)) assert.doesNotMatch(value ?? "", /^(|0|-|—|\?|aucun|none|inconnu)$/i);
    close(vue);

    // Sur le rail, mais `status` pas lu : le titre est là.
    slipOf(vue, 14).click();
    assert.equal(card(vue).dessous("h3")[0]?.textContent, "Le journal en ajout seul");
  });

  test("ouverte, elle suit la lecture suivante sans se fermer ; elle se ferme quand le chef change de projet", async () => {
    const vue = await open();
    receive(vue, drawable(FACTS, NOT_READ));
    slipOf(vue, 14).click();

    // `status` arrive : le rail se redessine, la fiche reste ouverte.
    receive(vue);
    assert.equal(card(vue).hidden, false);
    assert.equal(vue.element("rail").inert, true);
    close(vue);
    assert.equal(vue.element("rail").inert, false);

    slipOf(vue, 14).click();
    (vue.element("projets").children.at(0) ?? assert.fail("pas de « T »")).click();
    await repos();
    assert.equal(card(vue).hidden, true);
  });
});

// Les gestes de la fiche (#639) : ceux qu'il est possible de faire sur ce ticket à cet instant, et
// seulement ceux-là — un bouton chacun, son prix au survol s'il en a un. La vue pose ce que le process
// principal propose (card-actions.ts) ; ce qui part, elle le nomme — un geste, un ticket, une valeur —,
// jamais une commande.
describe("la fiche propose les gestes possibles à cet instant, et seulement ceux-là (#639)", () => {
  const openCard = async (vue: Played, number: number) => {
    slipOf(vue, number).click();
    await repos();
  };

  test("chaque état a ses gestes, un bouton chacun : aucun prix n'est écrit, et un geste qui ne coûte rien n'a pas de survol", async () => {
    const vue = await open();
    receive(vue);
    for (const number of [14, 30, 12]) {
      await openCard(vue, number);
      assert.deepEqual(openCardActions(vue), [
        ["issue", "open the issue", undefined],
        ["second", "ask the second", undefined],
      ], `#${number}`);
      assert.doesNotMatch(card(vue).textContent, /cost:/, `#${number}`);
      close(vue);
    }
    // La demande au second, toujours en un clic.
    await openCard(vue, 12);
    requests(vue)[0]?.click();
    await repos();
    assert.deepEqual(vue.dernier("demander"), [PARADE, 12]);
  });

  test("tant que les gestes ne sont pas lus, la fiche le dit — elle n'en promet aucun", async () => {
    let render: (proposes: ReturnType<typeof actionsOfCard>) => void = () => {};
    const vue = await open({ gestesDeFiche: () => new Promise((resolve) => (render = resolve)) as never });
    receive(vue);
    await openCard(vue, 21);
    const section = () => card(vue).dessous("section").find((pose) => pose.className === "gestes-fiche");
    assert.equal(section()?.dessous("p")[0]?.textContent, "Reading what can be done…");
    assert.deepEqual(openCardActions(vue), []);
    render(actionsOfCard({ ticket: 21, etat: "en attente", ouvrable: true, attendu: false, attend: [] }));
    await repos();
    assert.deepEqual(openCardActions(vue).map(([id]) => id), ["issue", "second"]);
  });
});

// La fiche d'une carte qui t'attend (#832), sur le cas de #824 : le manager a renoncé après des
// rouges, la livraison a sa PR. En tête, ce qu'on attend de toi, en une phrase — pas la ligne de la
// file, ni rien que l'app devinerait ; ses gestes sont des boutons ; aucune commande à recopier ni à
// envoyer ; et une lecture qui échoue tient en une ligne, son détail au survol.
describe("la fiche d'une carte qui t'attend : l'attendu en tête, ses gestes en boutons, rien de brut (#832)", () => {
  const PR = "https://github.com/benomite/brigade/pull/840";
  const GIVES_UP = `  #12  depuis 40 min  remontée par le manager, rouge — à trancher : merger ${PR} à la main, ou retirer \`fire\` — \`brigade parade pass 12\``;
  const WITH_GIVES_UP = STATUS.replace(/attend {5}1 décision[^]*?fin attend/, `attend     1 décision attend le chef depuis 40 min\n${GIVES_UP}\nfin attend`);
  const DECIDE: Facts = { ...FACTS, rail: FACTS.rail.map((ticket) => (ticket.ticket === 12 ? { ...ticket, etat: "86" } : ticket)), attend: [{ ticket: 12, titre: "Validation SIRET", url: "https://github.com/benomite/brigade/issues/12" }] };
  const openTheCard = async (answers: Answers = {}) => {
    const vue = await open(answers);
    receive(vue, drawable(DECIDE, WITH_GIVES_UP.replace("#12  en pass  -  depuis 2 j, cuisiné par mac/claude", "#12  86  -  depuis 40 min (pass:returns-exhausted), sans heure de retour")));
    slipOf(vue, 12).click();
    await repos();
    return vue;
  };
  const visible = (vue: Played) => card(vue).textContent;
  const openCard = async (vue: Played, number: number) => {
    slipOf(vue, number).click();
    await repos();
  };

  test("en tête, une phrase dit ce qu'on attend de toi ; la ligne brute de la file n'est nulle part sur la fiche", async () => {
    const vue = await openTheCard();
    const panel = card(vue).children[0] ?? assert.fail("pas de panneau");
    assert.equal(panel.children[1]?.className, "attendu", "la phrase vient juste sous le numéro, avant tout le reste");
    assert.equal(panel.children[1]?.textContent, "no question found on #12");
    assert.doesNotMatch(visible(vue), /remontée|à trancher|depuis 40 min/);
  });

  test("chaque geste est un bouton, ceux de tous et rien de plus ; merger se fait sur la PR, aucun bouton n'est proposé pour le faire ; aucune commande `brigade` n'est à recopier", async () => {
    const vue = await openTheCard();
    assert.deepEqual(openCardActions(vue).map(([id, wording]) => [id, wording]), [
      ["issue", "open the issue"],
      ["second", "ask the second"],
    ]);
    assert.ok(!cardButtons(vue).some((pose) => /merge/.test(pose.textContent)), "aucun bouton de merge n'est offert");
    assert.doesNotMatch(visible(vue), /brigade parade|geste\.ts/);
    assert.equal(card(vue).dessous("button").filter((pose) => pose.className === "mono").length, 0);
  });


});
