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
import { holdFacts, type Drawable } from "../src/facts.ts";
import type { Terminal } from "../src/terminals.ts";
import { cardOfTicket, type Fake, type Played, repos } from "./helpers/false-vue.ts";

const VUE = join(import.meta.dirname, "../src/vue");
const A = "2026-10-13T10:04:12.000Z";
const PARADE = "parade";
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const SHELL: Terminal = { id: 2, projet: PARADE, genre: "shell", titre: "shell 1", note: "", arrete: false };


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





});

const accounts = (vue: Played) => columns(vue).map((column) => column.children[0]?.children[1]?.textContent);

describe("une box pas jointe, après une lecture (#1078)", () => {
});

// Ce que le process principal envoie à la vue d'une lecture du tableau qui n'a pas joint GitHub (board/read.ts, #1818).
const OUTSIDE_LINE = "2026-10-13T13:35:36.000Z";
const outsideLine = (a = OUTSIDE_LINE): Drawable => holdFacts().recevoir({ projet: PARADE, demande: 0, a, erreur: "GitHub could not be reached to read the Kitchen board of benomite/parade: fetch failed.", atteinte: true, cas: null, duTableau: true, horsLigne: true });
const signs = (vue: Played) => vue.element("rail").dessous("p").filter(({ className }) => className === "hors-ligne");
// L'espace du projet : sa bande, et son rail.
const SPACE = ["alertes", "rail"];
const ALARMS = /not verified|not drawn|not read|open Settings|could not be reached|NOT READ|tried at/;

describe("hors ligne (#1818)", () => {



});

describe("une carte porte ce que la file dit", () => {



});

describe("le haut du rail est allégé (#623)", () => {


});

describe("une carte rouge, dans la colonne de son étape, est le seul endroit où un ticket attend une décision (#3458)", () => {

});

describe("le clic d'une carte de T'attend (#452)", () => {



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


});

