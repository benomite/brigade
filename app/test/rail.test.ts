// Le rail est la vue principale de l'espace : au centre de l'écran, en six colonnes, posé quel
// que soit l'onglet affiché dessous. Chaque carte y montre ce que la file dit du ticket, écrit
// ce qu'elle n'en dit pas, et relaie mot pour mot ce que la box a écrit. Le clic d'une carte, quelle
// que soit sa colonne, ouvre sa fiche par-dessus le rail (#635) ; celle d'un ticket de T'attend écrit
// sa demande dans le second en un clic (#452), sans quitter le rail des yeux.
// La vue est jouée telle qu'elle est, devant un faux document (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../src/allumage.ts";
import { mettreAPart } from "../src/attend.ts";
import { pourLaBarre } from "../src/barre.ts";
import { BOUTONS } from "../src/boutons.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Dessinable, type Faits } from "../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { gestesDeCarte, PRIX } from "../src/gestes-fiche.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { heureHM } from "../src/format.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { GESTES_DU_MANAGER } from "../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import type { Lue } from "../src/question.ts";
import type { Repondue } from "../src/repondues.ts";
import type { Terminal } from "../src/terminaux.ts";
import { type Faux, type Jouee, jouerLaVue, type Reponses, ouvrirLecture, repos } from "./aides/fausse-vue.ts";

const VUE = join(import.meta.dirname, "../src/vue");
const A = "2026-10-13T10:04:12.000Z";
const PARADE = "parade";
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const SHELL: Terminal = { id: 2, projet: PARADE, genre: "shell", titre: "shell 1", note: "", arrete: false };
const demarrage = (projets: Parameters<typeof pourLaBarre>[0]["projets"] = [{ nom: PARADE, dossier: "/tmp/parade", box: { hote: "box" } }]) => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets, hotes: ["box"] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS, rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

async function ouvrir(reponses: Reponses = {}): Promise<Jouee> {
  // Les gestes de la fiche sont ceux que le process principal propose : le module tel qu'il est.
  const vue = await jouerLaVue({ demarrage: () => demarrage(), espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this Mac" }], shell: () => SHELL, gestesDeFiche: (carte) => gestesDeCarte(carte), ...reponses });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}

// Ce que la box rend, par ses deux lectures — passé par le process principal tel qu'il est
// (faits.ts) : la vue reçoit ce qu'il range, pas une carte écrite à la main.
const FAITS: Faits = {
  etat: "ouverte",
  lu: "2026-10-13T10:04:11.000Z",
  dernierTick: "2026-10-13T10:04:02.000Z",
  compteurs: { rail: 2, auTravail: 1, aLaPass: 1, attend: 1, livres24h: 1 },
  dernierEvenement: null,
  rail: [
    { ticket: 14, etat: "pris", titre: "Le journal en ajout seul", url: "https://github.com/benomite/brigade/issues/14", activite: { fait: "écrit", cible: "app/src/bon.ts", depuis: "2026-10-13T10:02:11.000Z" } },
    { ticket: 21, etat: "en attente", titre: "L'export du journal", url: "https://github.com/benomite/brigade/issues/21", activite: null },
    { ticket: 22, etat: "en attente", titre: "Un ticket libre", url: "https://github.com/benomite/brigade/issues/22", activite: null },
    { ticket: 30, etat: "en pass", titre: "La pass verte", url: "https://github.com/benomite/brigade/issues/30", activite: { fait: "gates en cours", cible: null, depuis: "2026-10-13T10:03:41.000Z" } },
    { ticket: 31, etat: "servi", titre: "Servi hier", url: "https://github.com/benomite/brigade/issues/31", activite: null },
    { ticket: 12, etat: "en pass", titre: "Validation SIRET", url: "https://github.com/benomite/brigade/issues/12", activite: null },
  ],
  cooks: [{ ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" }],
  attend: [{ ticket: 12, titre: "Validation SIRET", url: "https://github.com/benomite/brigade/issues/12" }],
};
// Ce que le bloc dit de #12 : une entrée longue, puis ce qui la précise sur plusieurs lignes —
// des blancs en tête, en fin et au milieu, une tabulation, ce qui ressemble à du HTML.
const LONGUE = `depuis 2 j  ${"livraison verte, non mergée faute de grant `merge` — à merger à la main :   gh pr merge 31 ; ".repeat(30)}fin de l'entrée  `;
const SUITE = ["      │ une ligne de suite,   avec ses blancs  ", "      │ \tune tabulation, puis <b>pas du HTML</b> &amp; « des accents » → ✓", `      │ ${"x".repeat(900)}`, "      │ la dernière"];
const STATUS = [
  "projet     parade",
  "cuisine    ouverte",
  "",
  "attend     1 décision attend le chef depuis 2 j",
  `  #12  ${LONGUE}`,
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
const PAS_LU = null;
// `repondues` : les questions répondues que le process principal tient (repondues.ts).
function dessinable(faits: Faits = FAITS, status: string | typeof PAS_LU = STATUS, repondues: ReadonlyMap<number, Repondue> = new Map()): Dessinable {
  const tenus = tenirFaits(() => repondues);
  const recue = tenus.recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
  if (status === PAS_LU) return recue;
  return tenus.attendre(mettreAPart({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "status", texte: status }] })) ?? assert.fail("rien à redessiner");
}
const recevoir = (vue: Jouee, recue: Dessinable = dessinable()) => vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });

const colonnes = (vue: Jouee) => vue.element("rail").dessous("section");
const bons = (ou: Faux) => ou.dessous("li").filter((li) => li.className === "bon");
const bonDe = (vue: Jouee, numero: number): Faux => bons(vue.element("rail")).find((bon) => bon.children[0]?.children[0]?.textContent === `#${numero}`) ?? assert.fail(`pas de bon #${numero}`);
// Ce qu'un bon dit de la file : chaque fait, son libellé puis sa valeur.
const portes = (bon: Faux) => bon.dessous("ul").flatMap((liste) => liste.children.map((fait) => fait.children.map((pose) => pose.textContent)));
// Ce que la file ne dit pas — pas ce qu'une carte de Livré dit de sa relecture, qui a ses classes.
const sans = (bon: Faux) => bon.dessous("small").filter((pose) => pose.className === "").map((pose) => pose.textContent);
// Les deux lignes d'une carte (#622) : ce qui se passe, puis ce qui demande l'attention.
const ligneDe = (bon: Faux) => bon.dessous("p").find((p) => p.className === "ligne-carte")?.textContent;
const signalDe = (bon: Faux) => bon.dessous("p").find((p) => p.className === "signal")?.textContent;
// Le détail que la carte ne porte plus, sur la fiche qu'un clic ouvre.
const detailsDe = (vue: Jouee, numero: number): Faux | undefined => {
  bonDe(vue, numero).click();
  return fiche(vue).dessous("section").find((pose) => pose.className === "details");
};
const relayes = (bon: Faux) => bon.dessous("p").filter((p) => p.className === "").map((p) => p.textContent);
// La fiche ouverte par-dessus le rail : ses lignes, libellé puis valeur ; ses gestes.
const fiche = (vue: Jouee) => vue.element("fiche");
const lignesDeFiche = (vue: Jouee) => fiche(vue).dessous("dl")[0]?.children.map((rang) => rang.children.map((pose) => pose.textContent)) ?? [];
const valeurDeFiche = (vue: Jouee, libelle: string): Faux => fiche(vue).dessous("div").find((rang) => rang.children[0]?.textContent === libelle)?.children[1] ?? assert.fail(`pas de ligne « ${libelle} » sur la fiche`);
const demandes = (vue: Jouee) => fiche(vue).dessous("button").filter((pose) => pose.className === "demander");
// Les gestes de la fiche ouverte (#639) : chacun, son nom, ce que son bouton dit, puis son prix —
// celui de son survol (briques.js), qui n'est écrit nulle part ailleurs : absent, il ne coûte rien.
const aides = (ou: Faux) => ou.dessous("button").filter((pose) => pose.className === "aide");
const gestesDeLaFicheOuverte = (vue: Jouee) =>
  (fiche(vue).dessous("section").find((pose) => pose.className === "gestes-fiche")?.dessous("li") ?? []).map((ligne) => [
    ligne.dataset.geste,
    ligne.dessous("button")[0]?.textContent,
    (aides(ligne)[0] as { ariaLabel?: string } | undefined)?.ariaLabel,
  ]);
// Le bouton d'un geste — pas l'icône de son survol.
const gesteDeLaFiche = (vue: Jouee, id: string): Faux =>
  fiche(vue).dessous("li").find((ligne) => ligne.dataset.geste === id)?.dessous("button").filter((pose) => pose.className !== "aide").at(-1) ?? assert.fail(`pas de geste « ${id} » sur la fiche`);
// Les boutons de la fiche, moins les icônes de survol.
const boutonsDeLaFiche = (vue: Jouee) => fiche(vue).dessous("button").filter((pose) => pose.className !== "aide");
const fermer = (vue: Jouee) => (fiche(vue).dessous("button").find((pose) => pose.className === "fermer") ?? assert.fail("pas de bouton pour fermer la fiche")).click();
const onglet = (vue: Jouee, titre: string): Faux => vue.element("onglets").children.find((pose) => pose.textContent === titre) ?? assert.fail(`pas d'onglet ${titre}`);

describe("le rail occupe le centre de l'écran principal", () => {
  test("dans la page, il est posé dans la zone centrale, sous le nom du projet et les onglets, en haut — plus dans un onglet", () => {
    const html = readFileSync(join(VUE, "index.html"), "utf8");
    const centre = html.slice(html.indexOf("<main>"), html.indexOf("</main>"));
    const rangs = ["<header>", 'id="onglets"', "</header>", 'id="centre"', 'id="rail"', 'id="contenu"'].map((repere) => centre.indexOf(repere));

    assert.ok(rangs.every((rang) => rang !== -1), "la zone centrale ne porte plus le rail, les onglets ou ce qu'ils montrent");
    assert.deepEqual(rangs, rangs.toSorted((a, b) => a - b));
    // Il n'est pas dans le contenu d'un onglet, ni dans la colonne de droite ; et rien des terminaux n'est au centre.
    const contenu = centre.slice(centre.indexOf('id="contenu"'), centre.indexOf("</section>\n      </div>"));
    assert.ok(!contenu.includes('id="rail"'));
    assert.ok(!html.slice(html.indexOf('<aside id="second"')).includes('id="rail"'));
    assert.ok(!centre.includes('id="terminaux"') && !centre.includes('id="fil"'));
  });

  test("il a toute la hauteur du centre, qui défile : une page ouverte se pose par-dessus, sans la lui prendre", () => {
    const css = readFileSync(join(VUE, "vue.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const regle = (selecteur: string) => new Map((new RegExp(`(?:^|})\\s*${selecteur.replace(/[#.]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? assert.fail(`pas de règle ${selecteur}`)).split(";").map((d) => d.trim()).filter(Boolean).map((d): [string, string] => [d.slice(0, d.indexOf(":")).trim(), d.slice(d.indexOf(":") + 1).trim()]));

    assert.equal(regle("main").get("flex-direction"), "column");
    assert.deepEqual([regle("#centre").get("flex"), regle("#centre").get("min-height"), regle("#centre").get("position")], ["1 1 0", "0", "relative"]);
    assert.deepEqual([regle("#rail").get("flex"), regle("#rail").get("min-height"), regle("#rail").get("overflow-y")], ["1 1 0", "0", "auto"]);
    // La page couvre le centre entier, posée sur lui, et défile dans sa hauteur ; elle a un fond : le rail ne se lit pas au travers.
    assert.deepEqual([regle("#contenu").get("position"), regle("#contenu").get("inset"), regle("#contenu").get("overflow-y"), regle("#contenu").get("background")], ["absolute", "0", "auto", "var(--fond)"]);
  });

  test("il est posé dès que l'espace s'ouvre, et le reste quel que soit ce qui est affiché : aucune page, une page par-dessus, un shell à droite", async () => {
    const vue = await ouvrir();
    recevoir(vue);
    const cinq = () => colonnes(vue).map((colonne) => colonne.children[0]?.children.map((pose) => pose.textContent));
    const ATTENDU = [["On the rail", "2"], ["Taken", "1"], ["Pass", "1"], ["TODO", "1"], ["WAITING", "0"], ["Served", "1"]];

    // L'espace s'ouvre sans page : le rail est seul au centre, le second à droite.
    assert.equal(vue.element("contenu").hidden, true);
    assert.equal(vue.element("second").hidden, false);
    assert.equal(vue.element("rail").hidden, false);
    assert.deepEqual(cinq(), ATTENDU);

    for (const { titre } of ONGLETS) {
      await ouvrirLecture(vue, titre);
      assert.equal(vue.element("contenu").hidden, false, titre);
      assert.equal(vue.element("rail").hidden, false, titre);
      assert.deepEqual(cinq(), ATTENDU, titre);
    }
    // La dernière page refermée, un shell s'ouvre à droite : le centre n'en sait rien.
    await ouvrirLecture(vue, "Log");
    (vue.element("terminaux").children.find((pose) => pose.textContent === "+ shell") ?? assert.fail("pas de « + shell »")).click();
    await repos();
    assert.equal(vue.element("contenu").hidden, true);
    assert.equal(vue.element("rail").hidden, false);
    assert.equal(vue.element("rail").inert, false);
    assert.deepEqual(cinq(), ATTENDU);
    // Aucun onglet ne lui est plus nécessaire : une lecture de `faits` le redessine où que l'on soit.
    recevoir(vue, dessinable({ ...FAITS, rail: [], attend: [], cooks: [] }, PAS_LU));
    assert.deepEqual(cinq(), [["On the rail", "0"], ["Taken", "0"], ["Pass", "0"], ["TODO", "0"], ["WAITING", "0"], ["Served", "0"]]);
  });

  test("avant la première lecture il le dit ; un projet sans box n'en a pas — rien n'est lu de lui", async () => {
    const vue = await ouvrir();
    assert.equal(vue.element("rail").hidden, false);
    assert.match(vue.element("rail").textContent, /^the rail: first read of `ssh box brigade parade facts` in progress…$/);
    assert.deepEqual(colonnes(vue), []);

    const sansBox = await jouerLaVue({ demarrage: () => demarrage([{ nom: PARADE, dossier: "/tmp/parade" }]), espace: () => [SECOND] });
    (sansBox.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
    await repos();
    assert.equal(sansBox.element("rail").hidden, true);
  });

  test("une box qui ne rend pas ses faits : le rail dit qu'il n'est pas dessiné, et ne montre aucune colonne vide à la place", async () => {
    const vue = await ouvrir();
    recevoir(vue, { projet: PARADE, demande: 0, a: A, titre: "FACTS NOT READ", erreur: "npm error Missing script: facts", atteinte: true, cas: null });

    assert.equal(vue.element("rail").hidden, false);
    assert.match(vue.element("rail").textContent, /^the rail is not drawn: FACTS NOT READ — tried at /);
    assert.deepEqual(colonnes(vue), []);
  });

  test("une box pas jointe (#728) : sans lecture antérieure, le rail dit depuis quand elle ne répond pas, sans colonne vide", async () => {
    const vue = await ouvrir();
    recevoir(vue, { projet: PARADE, demande: 0, a: A, titre: "PAS JOINT", erreur: "ssh: connect to host box port 22: Connection refused", atteinte: false, cas: null });

    assert.equal(vue.element("rail").hidden, false);
    assert.match(vue.element("rail").textContent, /^no reading of the rail — box unreachable since /);
    assert.match(vue.element("rail").textContent, /the rail is not drawn: PAS JOINT — tried at /);
    assert.deepEqual(colonnes(vue), []);
  });
});

describe("une carte porte ce que la file dit", () => {
  test("ce que la cuisine en fait en ce moment, qui tient le ticket, depuis quand, son bail, et en clair ce qui le bloque — quand la file les donne", async () => {
    const vue = await ouvrir();
    recevoir(vue);

    // Sur la carte : une ligne, rien de ce qui ne change pas ce que le chef fait.
    assert.equal(ligneDe(bonDe(vue, 14)), "écrit app/src/bon.ts · 2 min");
    assert.equal(ligneDe(bonDe(vue, 30)), "gates en cours · 30 s");
    assert.ok((ligneDe(bonDe(vue, 12)) ?? "") !== "");
    for (const bon of bons(vue.element("rail"))) {
      assert.deepEqual(portes(bon), [], bon.textContent);
      assert.doesNotMatch(bon.textContent, /lease|bail|\b86\b|not given|taken by/);
    }
    // Le détail est dans la fiche.
    assert.deepEqual(portes(detailsDe(vue, 14) ?? assert.fail("pas de détail")), [
      ["right now", "écrit app/src/bon.ts, for 2 min"],
      ["taken by", "box/claude"],
      ["since", "12 min"],
      ["lease", "sans progrès depuis 3 min, bail encore 27 min"],
    ]);
    assert.deepEqual(portes(detailsDe(vue, 21) ?? assert.fail("pas de détail")), [["since", "2 h 05"], ["blocked by", "zone tenue par #14 (app/src)"]]);
    assert.deepEqual(portes(detailsDe(vue, 30) ?? assert.fail("pas de détail"))[0], ["right now", "gates en cours, for 30 s"]);
    assert.deepEqual(portes(detailsDe(vue, 12) ?? assert.fail("pas de détail"))[0], ["right now", "activity not given"]);
    // Ce qui se recopie — une station — est en monospace ; une durée se lit.
    bonDe(vue, 14).click();
    const [, tient, depuis] = (detailsDe(vue, 14) ?? assert.fail("pas de détail")).dessous("ul")[0]?.children ?? [];
    assert.deepEqual([tient?.children[1]?.className, depuis?.children[1]?.className], ["mono", ""]);
  });

  test("ce que la file ne donne pas n'est pas affiché : aucun texte de remplissage sur aucune carte (#747)", async () => {
    const vue = await ouvrir();
    recevoir(vue);

    for (const bon of bons(vue.element("rail"))) {
      assert.deepEqual(sans(bon), [], bon.textContent);
      assert.doesNotMatch(bon.textContent, /not given by|not read by the app/);
    }
    // Aucune valeur n'est mise à la place de ce qui manque.
    for (const bon of bons(vue.element("rail"))) for (const [, valeur] of portes(bon)) assert.doesNotMatch(valeur ?? "", /^(|0|-|—|\?|aucun|personne|inconnu)$/i);
  });

  test("sans `status` lu, elle le dit : ce que `faits` donne seul est posé, le reste est écrit non communiqué — et Paramètres dit d'où vient ce qu'elle porte", async () => {
    const vue = await ouvrir();
    recevoir(vue, dessinable(FAITS, PAS_LU));

    assert.deepEqual(portes(detailsDe(vue, 14) ?? assert.fail("pas de détail")).map(([libelle]) => libelle), ["right now", "taken by"]);
    assert.deepEqual(sans(bonDe(vue, 14)), []);
    // Le haut du rail ne dit rien d'une lecture récente : la provenance est dans Paramètres.
    const provenance = () => vue.element("provenance-lignes").textContent;
    assert.match(provenance(), /^the columns, from `ssh box brigade parade facts` — read at .*, in service order`ssh box brigade parade status` was not read: each card carries only what `facts` says/);
    recevoir(vue);
    assert.match(provenance(), /`ssh box brigade parade status`, read at .*: its `attend` block says what awaits you, its `rail` line what each card carries besides/);
    // Un `status` sans le bord de son bloc, ou sans sa ligne `rail` : la provenance dit lequel manque.
    recevoir(vue, dessinable(FAITS, STATUS.replace("fin attend\n", "")));
    assert.match(provenance(), /: its `attend` block was not taken, its `rail` line what each card carries besides/);
    recevoir(vue, dessinable(FAITS, STATUS.replace("rail       ", "le rail    ")));
    assert.match(provenance(), /: its `attend` block says what awaits you, its `rail` line was not read — each card carries only what `facts` says/);
  });

  test("une ligne de `status` que l'app n'a pas su découper n'est ni sur la carte ni sur la fiche : elle se lit entière dans Paramètres", async () => {
    const vue = await ouvrir();
    recevoir(vue);
    const bon = bonDe(vue, 31);

    assert.deepEqual(portes(bon), []);
    assert.doesNotMatch(bon.textContent, /une phrase que l'app ne connaît pas/);
    bon.click();
    assert.doesNotMatch(fiche(vue).textContent, /une phrase que l'app ne connaît pas/);
    assert.ok(STATUS.includes("une phrase que l'app ne connaît pas,   avec ses blancs"));
  });
});

describe("le haut du rail est allégé (#623)", () => {
  test("pas de phrase technique en tête : le rail commence par ses colonnes, et « stop the kitchen » n'y est pas", async () => {
    const vue = await ouvrir();
    recevoir(vue);

    const rail = vue.element("rail");
    assert.equal(rail.dessous("h3").some((pose) => /read at|stop the kitchen/.test(pose.textContent)), false);
    assert.equal(rail.dessous("button").some((pose) => /stop the kitchen/.test(pose.textContent)), false);
    // La provenance et l'arrêt sont dans Paramètres.
    assert.equal(vue.element("provenance").hidden, false);
    assert.match(vue.element("provenance-lignes").textContent, /ssh box brigade parade facts/);
    const arret = vue.element("arreter-cuisine");
    assert.equal(arret.hidden, false);
    const bouton = arret.dessous("button").find((pose) => /stop the kitchen/.test(pose.textContent)) ?? assert.fail("pas de bouton d'arrêt");
    assert.equal(bouton.dataset.arret, "");
  });

  test("une lecture vieille se dit en tête, avec son âge ; une lecture neuve ne dit rien", async () => {
    const vue = await ouvrir();
    recevoir(vue);
    // Les faits des fixtures datent de 2026-10-13 : la lecture est vieille.
    assert.match(vue.element("rail").children[0]?.textContent ?? "", /^up to date \d+ min ago — /);
    assert.equal(vue.element("rail").children[0]?.className, "fraicheur");
  });
});

describe("T'attend est le seul endroit où un ticket attend une décision", () => {
  test("un ticket que la file dit attendre n'a qu'une carte, dans T'attend — avant même que `status` ait été lu", async () => {
    for (const status of [PAS_LU, STATUS]) {
      const vue = await ouvrir();
      recevoir(vue, dessinable(FAITS, status));
      const ou = colonnes(vue).filter((colonne) => bons(colonne).some((bon) => bon.children[0]?.children[0]?.textContent === "#12")).map((colonne) => colonne.children[0]?.children[0]?.textContent);

      assert.deepEqual(ou, ["TODO"]);
      assert.equal(bons(vue.element("rail")).filter((bon) => bon.children[0]?.children[0]?.textContent === "#12").length, 1);
      // Sa pilule le dit en mots ; aucune autre carte ne la porte.
      const attendus = bons(vue.element("rail")).filter((bon) => bon.dessous("span").some((pose) => pose.className.split(" ").includes("attendu")));
      assert.deepEqual(attendus.map((bon) => bon.children[0]?.children[0]?.textContent), ["#12"]);
    }
  });

  test("la carte de T'attend dit en une phrase ce qu'on attend de toi : l'entrée longue du bloc `attend` n'est pas sur la carte (#622), ni sur la fiche (#832)", async () => {
    const vue = await ouvrir();
    recevoir(vue);
    const bon = bonDe(vue, 12);

    assert.deepEqual(relayes(bon), []);
    assert.ok(ligneDe(bon) !== undefined && ligneDe(bon) !== "");
    assert.ok(bon.textContent.length < 400, bon.textContent);
    assert.doesNotMatch(bon.textContent, /fin de l'entrée|la dernière/);
    bon.click();
    assert.doesNotMatch(fiche(vue).textContent, /fin de l'entrée|la dernière/);
    // Le bloc reste lisible en entier dans Paramètres : `status`, mot pour mot.
    assert.ok(STATUS.includes("la dernière"));
  });
});

describe("le clic d'une carte de T'attend (#452)", () => {
  test("« demander au second », depuis sa fiche, nomme le projet et le ticket au process principal, et l'écrit dans le second, à droite — le rail et l'onglet ouvert dessous restent posés", async () => {
    const vue = await ouvrir({ demander: () => ({ ...SECOND, note: "demande écrite dans le second, sans Entrée" }) });
    recevoir(vue);
    // Aucune carte ne porte le geste : il est sur la fiche — celle de tout ticket (#639).
    assert.deepEqual(vue.element("rail").dessous("button").filter((pose) => pose.className === "demander"), []);
    for (const bon of bons(vue.element("rail"))) {
      bon.click();
      await repos();
      assert.equal(demandes(vue).length, 1, bon.textContent);
      fermer(vue);
    }
    bonDe(vue, 12).click();
    await repos();
    const [demander, ...autres] = demandes(vue);
    assert.deepEqual(autres, []);
    assert.equal(demander?.dataset.geste, "demande");
    fermer(vue);
    await ouvrirLecture(vue, "Cooks");
    // Un clic sur la carte, un clic sur le geste : la même demande qu'avant.
    bonDe(vue, 12).click();
    await repos();
    demandes(vue)[0]?.click();
    await repos();

    assert.deepEqual(vue.dernier("demander"), [PARADE, 12]);
    assert.equal(vue.element("note-second").textContent, "demande écrite dans le second, sans Entrée");
    assert.equal(vue.element("second").hidden, false);
    assert.equal(vue.element("rail").hidden, false);
    // Le centre n'a pas changé : l'onglet Cooks est toujours celui qui est ouvert.
    assert.equal(onglet(vue, "Cost").ariaSelected, "true");
    assert.equal(vue.element("contenu").hidden, false);
    assert.deepEqual(relayes(bonDe(vue, 12)), []);
  });

  test("sans ce que le bloc dit de lui — `status` pas encore lu —, la carte est dans T'attend, écrit ce qui manque, et n'offre pas un geste composé de mots qu'elle n'a pas", async () => {
    const vue = await ouvrir();
    recevoir(vue, dessinable(FAITS, PAS_LU));
    const bon = bonDe(vue, 12);

    assert.deepEqual(relayes(bon), []);
    bon.click();
    await repos();
    assert.equal(vue.element("fiche").hidden, false);
    // La demande au second, sur ce que le rail en donne ; aucun geste qu'une décision n'a pas nommé.
    assert.equal(demandes(vue).length, 1);
    assert.deepEqual(gestesDeLaFicheOuverte(vue).map(([id]) => id), ["issue", "second", "priorite"]);
    assert.deepEqual(sans(bon), []);
  });

  test("le numéro d'une carte ouvre son issue : la vue nomme le projet et le ticket, jamais une adresse", async () => {
    const vue = await ouvrir({ ouvrirIssue: () => true });
    recevoir(vue);
    bonDe(vue, 14).children[0]?.children[0]?.click();
    await repos();

    assert.deepEqual(vue.dernier("ouvrirIssue"), [PARADE, 14]);
  });
});

// La question qu'une carte de T'attend pose, telle que son issue l'écrit (#681) : sur sa fiche, lue
// à l'ouverture par le process principal (question.ts) ; un clic sur un choix, ou une phrase et son
// bouton, et la réponse part sur l'issue. La demande au second reste à côté.
describe("la question qui t'attend, posée telle quelle, sans LLM (#681)", () => {
  const ISSUE = "https://github.com/benomite/brigade/issues/12";
  const TEXTE = "**Manager — épique non découpée : une question.**\n\nLe popup remplace-t-il la fiche ?  (a) il la remplace, (b) il s'ouvre par-dessus\n\n_Lu par le manager._";
  const QUESTION: Lue = {
    a: "2026-10-15T10:00:00.000Z",
    question: {
      url: `${ISSUE}#issuecomment-2`,
      resume: "Le popup remplace-t-il la fiche ?  (a) il la remplace, (b) il s'ouvre par-dessus",
      auteur: "benomite",
      a: "2026-10-15T08:00:00Z",
      texte: TEXTE,
      choix: [
        { lettre: "a", texte: "il la remplace" },
        { lettre: "b", texte: "il s'ouvre par-dessus" },
      ],
      depuis: [],
    },
  };
  const section = (vue: Jouee) => fiche(vue).dessous("section").find((pose) => pose.className === "question");
  const choix = (vue: Jouee) => section(vue)?.dessous("button").filter((pose) => pose.className === "choix") ?? [];
  const poster = (vue: Jouee) => section(vue)?.dessous("button").find((pose) => pose.textContent === "post this answer") ?? assert.fail("pas de bouton pour poster la phrase");
  const saisie = (vue: Jouee) => section(vue)?.dessous("textarea")[0] ?? assert.fail("pas de champ pour une phrase");
  async function ouvrirLaFiche(reponses: Reponses): Promise<Jouee> {
    const vue = await ouvrir(reponses);
    recevoir(vue);
    bonDe(vue, 12).click();
    await repos();
    return vue;
  }

  test("le clic de la carte ouvre sa fiche, qui lit l'issue et pose la question mot pour mot, ses choix en boutons, un champ pour une phrase — et la demande au second, toujours là", async () => {
    const vue = await ouvrirLaFiche({ lireQuestion: () => QUESTION });

    assert.deepEqual(vue.dernier("lireQuestion"), [PARADE, 12]);
    assert.equal(section(vue)?.dessous("blockquote")[0]?.textContent, TEXTE);
    assert.deepEqual(choix(vue).map((pose) => pose.textContent), ["a) il la remplace", "b) il s'ouvre par-dessus"]);
    assert.equal(saisie(vue).value, "");
    // Rien n'est choisi d'avance, et une phrase vide ne part pas.
    assert.equal(poster(vue).disabled, true);
    assert.ok(!vue.appels.some(({ geste }) => geste === "repondreQuestion"));
    assert.equal(demandes(vue).length, 1);
  });

  test("une carte retenue par `blocked-on-human` porte son titre et la question, en deux lignes, avec qui l'a posée — et la fiche lève la retenue d'un clic (#747)", async () => {
    const retenue = "  #50  depuis 52 min  retenue, elle porte `blocked-on-human` — à lever : retirer le label, le manager la juge ; ou fermer l'issue";
    const faits = { ...FAITS, attend: [...(FAITS.attend ?? []), { ticket: 50, titre: "", url: "https://github.com/benomite/brigade/issues/50" }] };
    const vue = await ouvrir({
      lireTitre: () => ({ titre: "Choisir le moteur de rendu" }),
      lireQuestion: () => ({ ...QUESTION, question: { ...(QUESTION as { question: object }).question, auteur: "brigade-manager", resume: "Quel moteur de rendu garde-t-on ?" } }) as never,
      leverRetenue: () => ({ fait: true, dit: "`blocked-on-human` removed" }),
    });
    recevoir(vue, dessinable(faits, STATUS.replace("fin attend", `${retenue}\nfin attend`)));
    await repos();

    const bon = bonDe(vue, 50);
    assert.ok(bon.textContent.includes("Choisir le moteur de rendu"), bon.textContent);
    assert.ok(bon.textContent.includes("Quel moteur de rendu garde-t-on ?"), bon.textContent);
    assert.ok(bon.textContent.includes("asked by brigade-manager"), bon.textContent);
    assert.doesNotMatch(bon.textContent, /à lever|not given by/);
    bon.click();
    await repos();
    const retirer = fiche(vue).dessous("button").find((pose) => pose.textContent === "remove the label") ?? assert.fail("pas de bouton « remove the label »");
    retirer.click();
    await repos();
    assert.deepEqual(vue.dernier("leverRetenue"), [PARADE, 50, "label"]);
    assert.match(fiche(vue).textContent, /`blocked-on-human` removed/);
  });

  test("tant que l'issue n'est pas lue, la fiche le dit ; une carte qui ne t'attend pas ne lit rien", async () => {
    let lire: (lue: Lue) => void = () => {};
    const vue = await ouvrirLaFiche({ lireQuestion: () => new Promise<Lue>((resoudre) => (lire = resoudre)) as never });
    assert.match(section(vue)?.textContent ?? "", /^reading issue #12, for the question it asks…$/);
    lire(QUESTION);
    await repos();
    assert.equal(choix(vue).length, 2);

    fermer(vue);
    const lectures = vue.appels.filter(({ geste }) => geste === "lireQuestion").length;
    bonDe(vue, 14).click();
    await repos();
    assert.equal(vue.appels.filter(({ geste }) => geste === "lireQuestion").length, lectures);
    assert.equal(section(vue), undefined);
  });

  test("un clic sur un choix, et c'est répondu : la vue nomme la question et la lettre, jamais le texte — puis dit que c'est posté, sans plus rien offrir à poster", async () => {
    const vue = await ouvrirLaFiche({ lireQuestion: () => QUESTION, repondreQuestion: () => ({ poste: true, corps: "b) il s'ouvre par-dessus" }) });
    choix(vue)[1]?.click();
    await repos();

    assert.deepEqual(vue.dernier("repondreQuestion"), [PARADE, 12, { question: `${ISSUE}#issuecomment-2`, vu: "", choix: "b" }]);
    assert.match(section(vue)?.dessous("p").find((pose) => pose.className === "postee")?.textContent ?? "", /^answer posted on #12, in your name: “b\) il s'ouvre par-dessus” — the manager reads it at its next tick/);
    assert.deepEqual(choix(vue), []);
    assert.deepEqual(section(vue)?.dessous("textarea"), []);
    // La demande au second reste, pour qui veut une explication.
    assert.equal(demandes(vue).length, 1);
  });

  test("une phrase part par son bouton, telle qu'écrite ; Entrée ne l'envoie pas, et la fiche reposée garde ce qui est écrit", async () => {
    const vue = await ouvrirLaFiche({ lireQuestion: () => QUESTION, repondreQuestion: () => ({ poste: true, corps: "Par-dessus." }) });
    const champ = saisie(vue);
    champ.value = "Par-dessus.";
    champ.declencher("input");
    champ.declencher("keydown", { key: "Enter" });
    await repos();
    assert.ok(!vue.appels.some(({ geste }) => geste === "repondreQuestion"));
    assert.equal(poster(vue).disabled, false);

    // Une lecture qui change la fiche la repose : la phrase y est encore.
    recevoir(vue, dessinable({ ...FAITS, attend: [{ ...FAITS.attend![0]!, titre: "Validation SIRET, retitrée" }] }));
    await repos();
    assert.equal(saisie(vue).value, "Par-dessus.");

    poster(vue).click();
    await repos();
    assert.deepEqual(vue.dernier("repondreQuestion"), [PARADE, 12, { question: `${ISSUE}#issuecomment-2`, vu: "", texte: "Par-dessus." }]);
  });

  test("ce qui a été écrit sur l'issue depuis la question se lit sous elle", async () => {
    const vue = await ouvrirLaFiche({ lireQuestion: () => ({ ...QUESTION, question: { ...QUESTION.question, depuis: [{ auteur: "benomite", a: "2026-10-15T09:00:00Z", url: `${ISSUE}#issuecomment-3`, corps: "b, sans hésiter" }] } }) as Lue });
    const depuis = section(vue)?.dessous("ul").find((pose) => pose.className === "depuis");
    assert.equal(depuis?.children[0]?.dessous("p")[0]?.textContent, "b, sans hésiter");
  });

  test("refusée — la question a changé entre-temps —, rien n'est dit posté : le refus se lit, et la question nouvelle prend la place de l'ancienne", async () => {
    const NOUVELLE: Lue = { ...QUESTION, question: { ...QUESTION.question, url: `${ISSUE}#issuecomment-5`, texte: "Une autre question ? (a) oui (b) non", choix: [{ lettre: "a", texte: "oui" }, { lettre: "b", texte: "non" }] } };
    const vue = await ouvrirLaFiche({ lireQuestion: () => QUESTION, repondreQuestion: () => ({ poste: false, refus: "nothing was posted: the question on the issue is no longer the one you read", lue: NOUVELLE }) });
    choix(vue)[0]?.click();
    await repos();

    assert.equal(section(vue)?.dessous("blockquote")[0]?.textContent, "Une autre question ? (a) oui (b) non");
    assert.deepEqual(choix(vue).map((pose) => pose.textContent), ["a) oui", "b) non"]);
    assert.equal(section(vue)?.dessous("small").find((pose) => pose.className === "refus")?.textContent, "nothing was posted: the question on the issue is no longer the one you read");
  });

  test("une issue sans question n'ajoute rien à la fiche ; une issue pas lue le dit, et la demande au second reste", async () => {
    const aucune = await ouvrirLaFiche({ lireQuestion: () => ({ a: QUESTION.a, aucune: true }) });
    assert.equal(section(aucune), undefined);
    assert.equal(demandes(aucune).length, 1);

    // Pas lue : une ligne ; ce que `gh` a répondu n'est lisible qu'au survol.
    const pasLue = await ouvrirLaFiche({ lireQuestion: () => ({ a: QUESTION.a, sans: "$ gh issue view … → exit code 4" }) });
    const indisponible = section(pasLue)?.dessous("p").find((pose) => pose.className === "indisponible") ?? assert.fail("pas de ligne « indisponible »");
    assert.equal(indisponible.children[0]?.textContent, "question unavailable");
    assert.doesNotMatch(indisponible.textContent, /exit code/);
    aides(indisponible)[0]?.declencher("focus");
    assert.match(indisponible.textContent, /\$ gh issue view … → exit code 4/);
    assert.equal(demandes(pasLue).length, 1);
  });
});

// La question qui t'attend se lit sur sa carte, et la carte quitte TODO quand la réponse est partie
// (#503) : l'épique #60 attend une réponse à la question du manager avant d'être découpée.
describe("une question du manager se lit sur sa carte, et la carte quitte TODO dès qu'elle est répondue (#503)", () => {
  const ISSUE = "https://github.com/benomite/brigade/issues/60";
  const ENTREE = "  #60  depuis 2 h  question du manager avant de découper l'épique — à répondre : sur l'issue, il la relit et la découpe ; ou fermer l'issue";
  const FAITS_60: Faits = { ...FAITS, attend: [...(FAITS.attend ?? []), { ticket: 60, titre: "Le popup des questions", url: ISSUE, decision: { quoi: "question", motif: null, cause: null, pr: null } }] };
  const STATUS_60 = STATUS.replace("fin attend", `${ENTREE}\nfin attend`);
  const QUESTION: Lue = {
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
  const REPONSE = { auteur: "benomite", a: "2026-10-15T09:00:00Z", url: `${ISSUE}#issuecomment-3`, corps: "b" };
  const REPONDUE: Lue = { ...QUESTION, question: { ...QUESTION.question, depuis: [REPONSE], repondue: REPONSE } };
  const colonneDe = (vue: Jouee, numero: number) => colonnes(vue).find((colonne) => bons(colonne).some((bon) => bon.children[0]?.children[0]?.textContent === `#${numero}`))?.children[0]?.children[0]?.textContent;
  const section = (vue: Jouee) => fiche(vue).dessous("section").find((pose) => pose.className === "question");

  test("dans TODO, la carte de l'épique dit la question du manager en une ligne, et qui l'a posée — sans ouvrir sa fiche ni GitHub", async () => {
    const vue = await ouvrir({ lireQuestion: () => QUESTION });
    recevoir(vue, dessinable(FAITS_60, STATUS_60));
    await repos();

    assert.deepEqual(vue.dernier("lireQuestion"), [PARADE, 60]);
    assert.equal(colonneDe(vue, 60), "TODO");
    const bon = bonDe(vue, 60);
    assert.equal(bon.dessous("p").find((pose) => pose.className === "question-courte")?.textContent, "Le popup remplace-t-il la fiche ?");
    assert.ok(bon.textContent.includes("asked by brigade-manager"), bon.textContent);
    // Une livraison à merger ne porte pas de question : son issue n'est pas lue pour la carte.
    assert.ok(!vue.appels.some(({ geste, args }) => geste === "lireQuestion" && args[1] === 12));
  });

  test("la réponse partie, la carte passe dans WAITING au redessin que le process principal envoie — la fiche ouverte garde ce qui a été posté", async () => {
    const vue = await ouvrir({ lireQuestion: () => QUESTION, repondreQuestion: () => ({ poste: true, corps: "b) non" }) });
    recevoir(vue, dessinable(FAITS_60, STATUS_60));
    await repos();
    bonDe(vue, 60).click();
    await repos();
    (section(vue)?.dessous("button").find((pose) => pose.textContent === "b) non") ?? assert.fail("pas de choix b")).click();
    await repos();
    assert.deepEqual(vue.dernier("repondreQuestion"), [PARADE, 60, { question: `${ISSUE}#issuecomment-2`, vu: "", choix: "b" }]);

    recevoir(vue, dessinable(FAITS_60, STATUS_60, new Map([[60, { question: `${ISSUE}#issuecomment-2`, par: "you", a: "2026-10-15T10:05:00.000Z" }]])));
    await repos();
    assert.equal(colonneDe(vue, 60), "WAITING");
    assert.match(bonDe(vue, 60).textContent, /answered by you · the manager's turn/);
    assert.doesNotMatch(bonDe(vue, 60).textContent, /awaiting you/);
    assert.match(section(vue)?.dessous("p").find((pose) => pose.className === "postee")?.textContent ?? "", /^answer posted on #60, in your name: “b\) non” — the manager reads it at its next tick; until then the card waits for it in WAITING\.$/);
  });

  test("répondue ailleurs — sur GitHub, par le second —, la fiche le dit, et ce que le chef poste encore dit ce qu'il a vu dessous", async () => {
    const vue = await ouvrir({ lireQuestion: () => REPONDUE, repondreQuestion: () => ({ poste: true, corps: "et vite" }) });
    recevoir(vue, dessinable(FAITS_60, STATUS_60));
    await repos();
    bonDe(vue, 60).click();
    await repos();

    assert.match(section(vue)?.dessous("p").find((pose) => pose.className === "repondue")?.textContent ?? "", /^answered on the issue by benomite, .* — the manager reads it at its next tick/);
    const champ = section(vue)?.dessous("textarea")[0] ?? assert.fail("pas de champ");
    champ.value = "et vite";
    champ.declencher("input");
    (section(vue)?.dessous("button").find((pose) => pose.textContent === "post this answer") ?? assert.fail("pas de bouton")).click();
    await repos();
    assert.deepEqual(vue.dernier("repondreQuestion"), [PARADE, 60, { question: `${ISSUE}#issuecomment-2`, vu: `${ISSUE}#issuecomment-3`, texte: "et vite" }]);
  });
});

// Livré, d'une box qui donne `livres` : un ticket livré y reste 24 h après la fermeture de son
// issue, et sa PR mergée s'ouvre d'un clic.
describe("Livré garde ce que la cuisine a servi", () => {
  const LIVRES: NonNullable<Faits["livres"]> = [
    { ticket: 216, titre: "Le relevé des mesures", url: "https://github.com/benomite/brigade/issues/216", livre: "2026-10-13T10:03:58.000Z", station: "box/claude", pr: "https://github.com/benomite/brigade/pull/219" },
    { ticket: 188, titre: "Une fiche sans zone", url: "https://github.com/benomite/brigade/issues/188", livre: "2026-10-12T16:30:05.000Z", station: "box/claude", pr: null },
  ];
  const livre = (vue: Jouee) => colonnes(vue).at(-1) ?? assert.fail("pas de colonne");

  test("ses cartes sont celles des livrés, partis du rail ou non, le plus récent en haut : quand, par qui — et la PR mergée s'ouvre d'un clic, la vue ne nommant que le projet et le ticket", async () => {
    const vue = await ouvrir({ ouvrirPr: () => true });
    recevoir(vue, dessinable({ ...FAITS, compteurs: { ...FAITS.compteurs, livres24h: 2 }, livres: LIVRES }, PAS_LU));

    assert.deepEqual(livre(vue).children[0]?.children.map((pose) => pose.textContent), ["Served", "2"]);
    assert.deepEqual(bons(livre(vue)).map((bon) => bon.children[0]?.children[0]?.textContent), ["#216", "#188"]);
    assert.equal(ligneDe(bonDe(vue, 216)), `served at ${heureHM("2026-10-13T10:03:58.000Z")}`);
    assert.equal(ligneDe(bonDe(vue, 188)), `served at ${heureHM("2026-10-12T16:30:05.000Z")}`);
    assert.deepEqual(portes(bonDe(vue, 216)), []);
    assert.deepEqual(portes(detailsDe(vue, 216) ?? assert.fail("pas de détail")), [["served", "13 s before the reading"], ["cooked by", "box/claude"]]);
    assert.deepEqual(portes(detailsDe(vue, 188) ?? assert.fail("pas de détail")), [["served", "17 h 34 before the reading"], ["cooked by", "box/claude"], ["PR", "none — served without a merge"]]);
    fermer(vue);
    // #31, servi encore sur le rail mais pas dans les livrés : il n'est pas dans Livré.
    assert.ok(!bons(livre(vue)).some((bon) => bon.children[0]?.children[0]?.textContent === "#31"));

    assert.deepEqual(bonDe(vue, 188).dessous("button").filter((pose) => pose.className === "pr"), []);
    const pr = bonDe(vue, 216).dessous("button").find((pose) => pose.className === "pr") ?? assert.fail("pas de bouton de PR");
    pr.click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirPr"), [PARADE, 216]);
  });

  test("sous son titre, une carte de Livré dit ce qui a été livré — le résumé de la relecture, entier et mot pour mot — et le nombre de ses remarques, qu'un clic déplie et que la lecture suivante ne replie pas", async () => {
    const RESUME = "Les cinq réglages du closer (calibrage, cooks, tokens, retraits) entrent dans les décisions du chef. Ils s'affichent par `station`, non réglé, aucune passe n'écrit.";
    const constats = [
      { gravite: "remarque", fichier: "runtime/src/etat.ts", constat: "Un commentaire répète le code." },
      { gravite: "bloquant", fichier: null, constat: "La forme change sans que la doc suive." },
    ];
    const relus: NonNullable<Faits["livres"]> = [
      { ...LIVRES[0]!, relecture: { resume: RESUME, constats } },
      { ...LIVRES[1]!, relecture: null },
      { ticket: 201, titre: "Les grants sous plafond", url: null, livre: "2026-10-13T09:00:00.000Z", station: null, pr: null, relecture: { resume: "Seul.", constats: [] } },
    ];
    const vue = await ouvrir();
    recevoir(vue, dessinable({ ...FAITS, compteurs: { ...FAITS.compteurs, livres24h: 3 }, livres: relus }, PAS_LU));

    // La carte dit l'heure et le résumé en une phrase ; le résumé entier, mot pour mot, est dans la fiche.
    const bon = bonDe(vue, 216);
    assert.deepEqual(bon.children.slice(1, 3).map((pose) => [pose.balise, pose.textContent]), [["strong", "Le relevé des mesures"], ["p", `served at ${heureHM("2026-10-13T10:03:58.000Z")} · Les cinq réglages du closer (calibrage, cooks, tokens, retraits) entrent dans les décisions du chef.`]]);
    assert.deepEqual(bon.dessous("details"), []);
    const details = detailsDe(vue, 216) ?? assert.fail("pas de détail");
    assert.deepEqual(details.dessous("p").filter((pose) => pose.className === "livraison").map((pose) => pose.textContent), [RESUME]);
    const [remarques] = details.dessous("details");
    assert.equal(remarques?.dessous("summary")[0]?.textContent, "2 remarks, 1 blocking");
    assert.deepEqual(
      remarques?.dessous("li").map((constat) => constat.children.map((pose) => pose.textContent)),
      [["runtime/src/etat.ts", "Un commentaire répète le code."], ["bloquant", "La forme change sans que la doc suive."]],
    );
    // Sans relecture, la carte n'écrit aucun texte de remplissage ; sans remarque, elle le dit, sans rien à déplier.
    // Seul un repère discret dit que la relecture manque : la fiche détaille.
    assert.deepEqual(bonDe(vue, 188).dessous("small").map((pose) => [pose.className, pose.textContent]), [["repere", "…"]]);
    assert.doesNotMatch(bonDe(vue, 188).textContent, /not given/);
    assert.deepEqual(bonDe(vue, 188).dessous("details"), []);
    assert.deepEqual(bonDe(vue, 201).dessous("details"), []);
    assert.deepEqual(detailsDe(vue, 201)?.dessous("small").filter((pose) => pose.className === "remarques").map((pose) => pose.textContent), ["no remarks"]);
    fermer(vue);

    // Dépliées par le chef sur la fiche, elles le restent quand le rail se redessine à la lecture suivante.
    const ouvertes = detailsDe(vue, 216)?.dessous("details")[0] ?? assert.fail("pas de remarques");
    Object.assign(ouvertes, { open: true }).declencher("toggle");
    recevoir(vue, dessinable({ ...FAITS, compteurs: { ...FAITS.compteurs, livres24h: 3 }, livres: relus }, PAS_LU));
    assert.equal((fiche(vue).dessous("details")[0] as unknown as { open: boolean }).open, true);
  });

  test("le résumé n'est ni coupé ni caché par la feuille de style : aucune ligne bornée, aucun point de suspension", () => {
    const css = readFileSync(join(VUE, "vue.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const corps = /(?:^|})\s*#rail \.bon p\.livraison\s*\{([^}]*)\}/.exec(css)?.[1] ?? assert.fail("pas de règle pour le résumé");
    assert.doesNotMatch(corps, /overflow:\s*hidden|text-overflow|line-clamp|max-height|white-space:\s*nowrap/);
    assert.doesNotMatch(css, /text-overflow|line-clamp/);
  });

  test("rien de servi en 24 h : la colonne le dit", async () => {
    const vue = await ouvrir();
    recevoir(vue, dessinable({ ...FAITS, compteurs: { ...FAITS.compteurs, livres24h: 0 }, livres: [] }, PAS_LU));

    assert.equal(livre(vue).children[1]?.textContent, "nothing served in the last 24 h");
  });

  test("longue, elle défile dans sa hauteur : elle ne pousse rien sous la grille, et les autres colonnes restent en vue", async () => {
    const vue = await ouvrir();
    recevoir(vue, dessinable({ ...FAITS, livres: LIVRES }, PAS_LU));
    assert.deepEqual(colonnes(vue).map((colonne) => "defile" in colonne.dataset), [false, false, false, false, false, true]);

    const css = readFileSync(join(VUE, "vue.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const corps = /(?:^|})\s*#rail \.colonne\[data-defile\] > ol\s*\{([^}]*)\}/.exec(css)?.[1] ?? assert.fail("pas de règle pour la colonne qui défile");
    assert.match(corps, /max-height:\s*\d+vh/);
    assert.match(corps, /overflow-y:\s*auto/);
  });
});

// La fiche d'un ticket (#635) : un clic sur sa carte, quelle que soit sa colonne, l'ouvre par-dessus le
// rail. Elle porte pour l'instant son en-tête — titre entier, numéro, priorité, issue, PR —, et écrit ce
// que la box ne donne pas. La fermer rend le rail tel qu'il était : ni redessiné, ni défilé ailleurs.
describe("un clic sur une carte ouvre sa fiche par-dessus le rail (#635)", () => {
  const LIVRES: NonNullable<Faits["livres"]> = [
    { ticket: 216, titre: "Le relevé des mesures", url: "https://github.com/benomite/brigade/issues/216", livre: "2026-10-13T10:03:58.000Z", station: "box/claude", pr: "https://github.com/benomite/brigade/pull/219" },
    { ticket: 188, titre: "Une fiche sans zone", url: "https://github.com/benomite/brigade/issues/188", livre: "2026-10-12T16:30:05.000Z", station: "box/claude", pr: null },
  ];
  // Et un ticket qui attend un tiers : chaque colonne a sa carte, WAITING comprise.
  const EN_WAITING = { ticket: 50, etat: "WAITING", titre: "Le devis du client", url: "https://github.com/benomite/brigade/issues/50", activite: null, tiers: { quoi: "sa validation écrite", qui: "le client", depuis: "2026-10-12T09:00:00.000Z", relance: "2026-10-19T00:00:00.000Z", aLArrivee: "il repart en cuisine" } };
  const AVEC_LIVRES = { ...FAITS, rail: [...FAITS.rail, EN_WAITING], compteurs: { ...FAITS.compteurs, livres24h: 2 }, livres: LIVRES };

  test("une carte de chaque colonne l'ouvre, et la fermer — son bouton ou Échap — rend le rail tel qu'il était, sans le redessiner", async () => {
    const vue = await ouvrir();
    recevoir(vue, dessinable(AVEC_LIVRES));
    const rail = vue.element("rail");
    const poses = rail.dessous("li");
    assert.equal(fiche(vue).hidden, true);

    for (const colonne of colonnes(vue)) {
      const [bon] = bons(colonne);
      const numero = bon?.children[0]?.children[0]?.textContent ?? assert.fail(`pas de carte dans ${colonne.textContent}`);
      for (const ferme of ["bouton", "Échap"]) {
        bon?.click();
        await repos();
        // Elle est posée par-dessus : le rail reste là, dessous, et ne se clique pas au travers.
        assert.equal(fiche(vue).hidden, false, numero);
        assert.equal(fiche(vue).dessous("header")[0]?.children[0]?.textContent, numero);
        assert.deepEqual([rail.hidden, rail.inert], [false, true]);
        if (ferme === "bouton") fermer(vue);
        else fiche(vue).declencher("keydown", { key: "Escape" });
        await repos();
        assert.equal(fiche(vue).hidden, true, `${numero}, fermée par ${ferme}`);
        assert.deepEqual([rail.hidden, rail.inert], [false, false]);
      }
    }
    // Un clic à côté du popup, sur le voile, la ferme ; un clic dans le panneau, non.
    const [premiere] = colonnes(vue).flatMap(bons);
    premiere?.click();
    await repos();
    fiche(vue).declencher("click", { target: fiche(vue).dessous("header")[0] });
    assert.equal(fiche(vue).hidden, false);
    fiche(vue).declencher("click", { target: fiche(vue) });
    await repos();
    assert.equal(fiche(vue).hidden, true);
    // Ni rechargé ni redessiné : ce sont les mêmes cartes, et la fiche n'a rien demandé à la box.
    assert.deepEqual(rail.dessous("li"), poses);
    assert.ok(poses.every((pose) => rail.contains(pose)));
    assert.equal(vue.appels.filter(({ geste }) => geste === "faits").length, 1);
    // Une autre touche ne la ferme pas.
    bonDe(vue, 14).click();
    fiche(vue).declencher("keydown", { key: "Enter" });
    assert.equal(fiche(vue).hidden, false);
  });

  test("au clavier, Entrée sur une carte l'ouvre aussi ; et ce qui se clique déjà sur la carte garde son geste — le numéro ouvre l'issue, pas la fiche", async () => {
    const vue = await ouvrir({ ouvrirIssue: () => true, ouvrirPr: () => true });
    recevoir(vue, dessinable(AVEC_LIVRES));

    bonDe(vue, 21).declencher("keydown", { key: "Enter", target: bonDe(vue, 21) });
    assert.equal(fiche(vue).dessous("header")[0]?.children[0]?.textContent, "#21");
    fermer(vue);

    const numero = bonDe(vue, 14).children[0]?.children[0] ?? assert.fail("pas de numéro");
    // Le navigateur fait remonter le clic du numéro jusqu'à sa carte : elle le voit, et ne s'ouvre pas.
    numero.click();
    bonDe(vue, 14).declencher("click", { target: numero });
    await repos();
    assert.deepEqual(vue.dernier("ouvrirIssue"), [PARADE, 14]);
    assert.equal(fiche(vue).hidden, true);
    const pr = bonDe(vue, 216).dessous("button").find((pose) => pose.className === "pr") ?? assert.fail("pas de bouton de PR");
    bonDe(vue, 216).declencher("click", { target: pr });
    assert.equal(fiche(vue).hidden, true);
    // Un clic sur le texte de la carte, lui, l'ouvre.
    bonDe(vue, 14).declencher("click", { target: bonDe(vue, 14).children[1] });
    assert.equal(fiche(vue).hidden, false);
  });

  test("l'en-tête : le titre entier, le numéro, la priorité que `status` écrit, un lien vers l'issue — et vers la PR quand il y en a une, sans quoi aucun lien n'est posé", async () => {
    const TITRE = `${"Un titre que la carte ne coupe pas, et que la fiche donne entier — ".repeat(12)}jusqu'au dernier mot`;
    const vue = await ouvrir({ ouvrirIssue: () => true, ouvrirPr: () => true });
    recevoir(vue, dessinable({ ...AVEC_LIVRES, rail: FAITS.rail.map((ticket) => (ticket.ticket === 14 ? { ...ticket, titre: TITRE } : ticket)) }, STATUS.replace("Le journal en ajout seul", TITRE)));

    bonDe(vue, 14).click();
    await repos();
    assert.equal(fiche(vue).dessous("h3")[0]?.textContent, TITRE);
    // L'issue qui s'ouvre est un geste de la fiche, avec son prix (#639) : l'en-tête n'a plus de ligne pour elle.
    assert.deepEqual(lignesDeFiche(vue), [["priority", "prio:1"]], "pas de PR donnée : pas de ligne PR");
    // La priorité se recopie : en monospace ; le numéro aussi.
    assert.equal(valeurDeFiche(vue, "priority").className, "mono");
    assert.equal(fiche(vue).dessous("header")[0]?.children[0]?.className, "mono");
    // Le lien de l'issue nomme le projet et le ticket : l'adresse reste au process principal.
    gesteDeLaFiche(vue, "issue").click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirIssue"), [PARADE, 14]);
    assert.deepEqual(gestesDeLaFicheOuverte(vue).map(([id]) => id), ["issue", "second", "priorite"], "pas de PR donnée : pas de geste PR");
    fermer(vue);

    // Une issue sans `prio:` : `status` écrit `-`, la fiche le dit.
    bonDe(vue, 21).click();
    assert.equal(valeurDeFiche(vue, "priority").textContent, "none — its issue carries no `prio:` label");
    fermer(vue);

    // Livré : la PR mergée s'ouvre d'un clic depuis la fiche ; servi sans merge, la fiche le dit, sans lien.
    bonDe(vue, 216).click();
    await repos();
    const pr = gesteDeLaFiche(vue, "pr");
    assert.equal(pr.textContent, "open the merged PR");
    pr.click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirPr"), [PARADE, 216]);
    fermer(vue);
    bonDe(vue, 188).click();
    await repos();
    assert.equal(valeurDeFiche(vue, "PR").textContent, "none — served without a merge");
    assert.deepEqual(boutonsDeLaFiche(vue).map((pose) => pose.textContent), ["close", "open the issue", "ask the second", "change the priority"]);

    // Et la peau ne coupe pas le titre : aucune ligne bornée, aucun point de suspension.
    const css = readFileSync(join(VUE, "vue.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const corps = /(?:^|})\s*#fiche h3\s*\{([^}]*)\}/.exec(css)?.[1] ?? assert.fail("pas de règle pour le titre de la fiche");
    assert.doesNotMatch(corps, /overflow:\s*hidden|text-overflow|line-clamp|max-height|white-space:\s*nowrap/);
    // Un popup : un voile sur le centre, le rail visible dessous, et un panneau de lecture, borné, qui défile.
    const voile = /(?:^|})\s*#fiche\s*\{([^}]*)\}/.exec(css)?.[1] ?? assert.fail("pas de règle pour la fiche");
    for (const declaration of [/position:\s*absolute/, /inset:\s*0/, /background:\s*var\(--ombre\)/]) assert.match(voile, declaration);
    const panneau = /(?:^|})\s*#fiche \.panneau\s*\{([^}]*)\}/.exec(css)?.[1] ?? assert.fail("pas de règle pour le panneau de la fiche");
    for (const declaration of [/width:\s*min\(/, /max-height:\s*100%/, /overflow-y:\s*auto/, /background:\s*var\(--fond\)/]) assert.match(panneau, declaration);
  });

  test("ce que la box ne donne pas est écrit « non communiqué », avec sa raison — jamais une valeur devinée, jamais une ligne vide", async () => {
    // Un ticket que `faits` dit attendre sans être sur le rail, ni titre ni adresse ; et `status` pas encore lu.
    const vue = await ouvrir();
    recevoir(vue, dessinable({ ...FAITS, attend: [...(FAITS.attend ?? []), { ticket: 40, titre: "", url: null }] }, PAS_LU));

    bonDe(vue, 40).click();
    // Pas de titre donné : aucune ligne à sa place.
    assert.deepEqual(fiche(vue).dessous("p").filter((pose) => pose.className === "sans"), []);
    assert.deepEqual(fiche(vue).dessous("h3"), []);
    assert.deepEqual(lignesDeFiche(vue), [
      ["priority", "not given — `facts` does not give it, and the `rail` line of `status` was not read"],
      ["issue", "not given — the box returns no address for this issue"],
    ]);
    // Chaque ligne non communiquée se lit comme telle : ce sont les mots de l'app.
    for (const libelle of ["priority", "issue"]) assert.equal(valeurDeFiche(vue, libelle).className, "sans", libelle);
    for (const [, valeur] of lignesDeFiche(vue)) assert.doesNotMatch(valeur ?? "", /^(|0|-|—|\?|aucun|none|inconnu)$/i);
    fermer(vue);

    // Sur le rail, mais `status` pas lu : le titre est là, la priorité ne l'est pas — elle n'est pas devinée.
    bonDe(vue, 14).click();
    assert.equal(fiche(vue).dessous("h3")[0]?.textContent, "Le journal en ajout seul");
    assert.equal(valeurDeFiche(vue, "priority").textContent, "not given — `facts` does not give it, and the `rail` line of `status` was not read");
  });

  test("ouverte, elle suit la lecture suivante sans se fermer ; elle se ferme quand le chef change de projet", async () => {
    const vue = await ouvrir();
    recevoir(vue, dessinable(FAITS, PAS_LU));
    bonDe(vue, 14).click();
    assert.equal(valeurDeFiche(vue, "priority").className, "sans");

    // `status` arrive : le rail se redessine, la fiche reste ouverte et dit ce qu'il donne.
    recevoir(vue);
    assert.equal(fiche(vue).hidden, false);
    assert.equal(valeurDeFiche(vue, "priority").textContent, "prio:1");
    assert.equal(vue.element("rail").inert, true);
    fermer(vue);
    assert.equal(vue.element("rail").inert, false);

    bonDe(vue, 14).click();
    (vue.element("projets").children.at(0) ?? assert.fail("pas de « T »")).click();
    await repos();
    assert.equal(fiche(vue).hidden, true);
  });
});

// Les gestes de la fiche (#639) : ceux qu'il est possible de faire sur ce ticket à cet instant, et
// seulement ceux-là — un bouton chacun, son prix au survol s'il en a un. La vue pose ce que le process
// principal propose (gestes-fiche.ts) ; ce qui part, elle le nomme — un geste, un ticket, une valeur —,
// jamais une commande.
describe("la fiche propose les gestes possibles à cet instant, et seulement ceux-là (#639)", () => {
  const avecLeRuntime: Reponses = { gesteDeFiche: () => ({ ...SECOND, note: "commande envoyée dans le second" }) };

  const ouvrirFiche = async (vue: Jouee, numero: number) => {
    bonDe(vue, numero).click();
    await repos();
  };

  test("chaque état a ses gestes, un bouton chacun : aucun prix n'est écrit, et un geste qui ne coûte rien n'a pas de survol", async () => {
    const vue = await ouvrir();
    recevoir(vue);
    for (const numero of [14, 30, 12]) {
      await ouvrirFiche(vue, numero);
      assert.deepEqual(gestesDeLaFicheOuverte(vue), [
        ["issue", "open the issue", undefined],
        ["second", "ask the second", undefined],
        ["priorite", "change the priority", undefined],
      ], `#${numero}`);
      assert.doesNotMatch(fiche(vue).textContent, /cost:/, `#${numero}`);
      fermer(vue);
    }
    // La demande au second, toujours en un clic.
    await ouvrirFiche(vue, 12);
    demandes(vue)[0]?.click();
    await repos();
    assert.deepEqual(vue.dernier("demander"), [PARADE, 12]);
  });

  test("en attente : changer la priorité et retirer du rail — au travail et en pass, la priorité seule ; le prix du retrait n'est qu'au survol", async () => {
    const vue = await ouvrir(avecLeRuntime);
    recevoir(vue);
    await ouvrirFiche(vue, 21);
    assert.deepEqual(gestesDeLaFicheOuverte(vue).map(([id, , prix]) => [id, prix]), [
      ["issue", undefined],
      ["second", undefined],
      ["priorite", undefined],
      ["retirer", PRIX.retirer],
    ]);
    const retirer = fiche(vue).dessous("li").find((ligne) => ligne.dataset.geste === "retirer") ?? assert.fail("pas de geste « retirer »");
    assert.doesNotMatch(retirer.textContent, /leaves the rail/);
    aides(retirer)[0]?.declencher("mouseenter");
    assert.match(retirer.textContent, /leaves the rail/);
    fermer(vue);
    for (const numero of [14, 30]) {
      await ouvrirFiche(vue, numero);
      assert.deepEqual(gestesDeLaFicheOuverte(vue).map(([id]) => id), ["issue", "second", "priorite"], `#${numero}`);
      fermer(vue);
    }
  });

  test("la priorité se choisit, puis part, sans confirmation — elle ne coûte rien ; retirer du rail se confirme, prix dit en une ligne, puis part — et la fiche et le rail suivent la lecture suivante", async () => {
    const vue = await ouvrir(avecLeRuntime);
    recevoir(vue);
    await ouvrirFiche(vue, 21);
    const choix = fiche(vue).dessous("select")[0] ?? assert.fail("pas de choix de priorité");
    const changer = gesteDeLaFiche(vue, "priorite");
    // Rien n'est choisi d'avance, et rien ne part sans un choix.
    assert.equal(choix.value, "");
    assert.equal(changer.disabled, true);
    choix.value = "2";
    choix.declencher("change");
    assert.equal(changer.disabled, false);
    changer.click();
    await repos();
    assert.deepEqual(vue.dernier("gesteDeFiche"), [PARADE, "priorite", 21, "2"]);
    assert.equal(vue.element("note-second").textContent, "commande envoyée dans le second");

    const parties = vue.appels.filter(({ geste }) => geste === "gesteDeFiche").length;
    gesteDeLaFiche(vue, "retirer").click();
    await repos();
    // Rien n'est parti : la confirmation dit le prix, en une ligne.
    assert.equal(vue.appels.filter(({ geste }) => geste === "gesteDeFiche").length, parties);
    const confirmation = () => fiche(vue).dessous("section").find((pose) => pose.className === "confirmation");
    const prix = confirmation()?.dessous("p").filter((pose) => pose.className === "prix") ?? assert.fail("pas de confirmation");
    assert.deepEqual(prix.map((ligne) => ligne.textContent), [PRIX.retirer]);
    // « cancel » : rien ne part, la confirmation s'en va.
    (confirmation()?.dessous("button").find((pose) => pose.textContent === "cancel") ?? assert.fail("pas de « cancel »")).click();
    assert.equal(confirmation(), undefined);
    assert.equal(vue.appels.filter(({ geste }) => geste === "gesteDeFiche").length, parties);
    gesteDeLaFiche(vue, "retirer").click();
    (confirmation()?.dessous("button").find((pose) => pose.className === "recommande") ?? assert.fail("pas de « oui »")).click();
    await repos();
    assert.deepEqual(vue.dernier("gesteDeFiche"), [PARADE, "retirer", 21, undefined]);
    assert.equal(confirmation(), undefined);

    // La lecture suivante : #21 a été pris entre-temps. La fiche relit ses gestes : il n'y a plus de retrait.
    const lectures = vue.appels.filter(({ geste }) => geste === "gestesDeFiche").length;
    const pris = FAITS.rail.map((ticket) => (ticket.ticket === 21 ? { ...ticket, etat: "pris" } : ticket));
    recevoir(vue, dessinable({ ...FAITS, rail: pris }, STATUS.replace("#21  en attente  -  zone tenue par #14 (app/src) — depuis 2 h 05", "#21  pris  prio:2  par box/claude depuis 1 min")));
    await repos();
    assert.equal(fiche(vue).hidden, false);
    assert.equal(vue.appels.filter(({ geste }) => geste === "gestesDeFiche").length, lectures + 1);
    assert.deepEqual(gestesDeLaFicheOuverte(vue).map(([id]) => id), ["issue", "second", "priorite"]);
    assert.equal(valeurDeFiche(vue, "priority").textContent, "prio:2");
    assert.ok(colonnes(vue).find((colonne) => colonne.textContent.startsWith("Taken"))?.textContent.includes("#21"));
  });

  test("un geste qui ne part pas le dit sur la fiche, sous ses gestes", async () => {
    const vue = await ouvrir({ ...avecLeRuntime, gesteDeFiche: () => ({ refus: "nothing is sent: “parade” does not open — illisible" }) });
    recevoir(vue);
    await ouvrirFiche(vue, 21);
    choisir(vue, "2");
    gesteDeLaFiche(vue, "priorite").click();
    await repos();
    assert.equal(fiche(vue).dessous("p").find((pose) => pose.className === "refus")?.textContent, "nothing is sent: “parade” does not open — illisible");
  });

  test("tant que les gestes ne sont pas lus, la fiche le dit — elle n'en promet aucun", async () => {
    let rendre: (proposes: ReturnType<typeof gestesDeCarte>) => void = () => {};
    const vue = await ouvrir({ gestesDeFiche: () => new Promise((resoudre) => (rendre = resoudre)) as never });
    recevoir(vue);
    await ouvrirFiche(vue, 21);
    const section = () => fiche(vue).dessous("section").find((pose) => pose.className === "gestes-fiche");
    assert.equal(section()?.dessous("p")[0]?.textContent, "reading what can be done…");
    assert.deepEqual(gestesDeLaFicheOuverte(vue), []);
    rendre(gestesDeCarte({ ticket: 21, etat: "en attente", ouvrable: true, attendu: false, attend: [] }));
    await repos();
    assert.deepEqual(gestesDeLaFicheOuverte(vue).map(([id]) => id), ["issue", "second", "priorite", "retirer"]);
  });
});

const choisir = (vue: Jouee, valeur: string) => {
  const choix = fiche(vue).dessous("select")[0] ?? assert.fail("pas de choix de priorité");
  choix.value = valeur;
  choix.declencher("change");
};

// La fiche d'une carte qui t'attend (#832), sur le cas de #824 : le manager a renoncé après des
// rouges, la livraison a sa PR. En tête, ce qu'on attend de toi, en une phrase — pas la ligne de la
// file ; ses gestes sont des boutons, le recommandé distingué ; aucune commande à recopier ni à
// envoyer ; et une lecture qui échoue tient en une ligne, son détail au survol.
describe("la fiche d'une carte qui t'attend : l'attendu en tête, ses gestes en boutons, rien de brut (#832)", () => {
  const PR = "https://github.com/benomite/brigade/pull/840";
  const RENONCE = `  #12  depuis 40 min  remontée par le manager, rouge — à trancher : merger ${PR} à la main, ou retirer \`fire\` — \`brigade parade pass 12\``;
  const AVEC_RENONCE = STATUS.replace(/attend {5}1 décision[^]*?fin attend/, `attend     1 décision attend le chef depuis 40 min\n${RENONCE}\nfin attend`);
  const DECIDE: Faits = { ...FAITS, rail: FAITS.rail.map((ticket) => (ticket.ticket === 12 ? { ...ticket, etat: "86" } : ticket)), attend: [{ ticket: 12, titre: "Validation SIRET", url: "https://github.com/benomite/brigade/issues/12", decision: { quoi: "remontee", motif: "still-red", cause: "manager-escalated", pr: PR } }] };
  // Ce que la box rend quand elle ne sait pas lire : `ssh`, son usage, son code de sortie.
  const PANNE = "not read: $ ssh -o BatchMode=yes box brigade parade pass 12 --json\nusage : BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run pass -- [<ticket> [--json]]\n→ exit code 2";
  const ouvrirLaCarte = async (reponses: Reponses = {}) => {
    const vue = await ouvrir({ gesteDeFiche: () => ({ ...SECOND, note: "commande envoyée dans le second" }), ...reponses });
    recevoir(vue, dessinable(DECIDE, AVEC_RENONCE.replace("#12  en pass  -  depuis 2 j, cuisiné par mac/claude", "#12  86  -  depuis 40 min (pass:returns-exhausted), sans heure de retour")));
    bonDe(vue, 12).click();
    await repos();
    return vue;
  };
  const visible = (vue: Jouee) => fiche(vue).textContent;
  const ouvrirFiche = async (vue: Jouee, numero: number) => {
    bonDe(vue, numero).click();
    await repos();
  };

  test("en tête, une phrase dit ce qu'on attend de toi ; la ligne brute de la file n'est nulle part sur la fiche", async () => {
    const vue = await ouvrirLaCarte();
    const panneau = fiche(vue).children[0] ?? assert.fail("pas de panneau");
    assert.equal(panneau.children[1]?.className, "attendu", "la phrase vient juste sous le numéro, avant tout le reste");
    assert.equal(panneau.children[1]?.textContent, "The manager gave up after repeated reds: merge it anyway, or take it off the rail.");
    assert.doesNotMatch(visible(vue), /remontée|à trancher|depuis 40 min/);
  });

  test("chaque geste attendu est un bouton — merger, retirer du rail —, le recommandé distingué ; aucune commande `ssh` ni `brigade` n'est à recopier ni à envoyer", async () => {
    const vue = await ouvrirLaCarte();
    assert.deepEqual(gestesDeLaFicheOuverte(vue).map(([id, libelle]) => [id, libelle]), [
      ["merger", "merge the PR"],
      ["retirer", "remove from the rail"],
      ["issue", "open the issue"],
      ["second", "ask the second"],
      ["priorite", "change the priority"],
    ]);
    assert.equal(gesteDeLaFiche(vue, "merger").className, "recommande");
    assert.deepEqual(boutonsDeLaFiche(vue).filter((pose) => pose.className.split(" ").includes("recommande")).map((pose) => pose.textContent), ["merge the PR"]);
    assert.doesNotMatch(visible(vue), /ssh |brigade parade/);
    assert.equal(fiche(vue).dessous("button").filter((pose) => pose.className === "mono").length, 0);
  });

  test("merger coûte : son prix est au survol, et le clic le confirme d'abord, prix en une ligne — le « oui » le fait partir, nommé par le geste et le ticket", async () => {
    const vue = await ouvrirLaCarte();
    assert.deepEqual(gestesDeLaFicheOuverte(vue).find(([id]) => id === "merger"), ["merger", "merge the PR", PRIX.merger]);
    assert.doesNotMatch(visible(vue), /cost:|is merged into/);
    gesteDeLaFiche(vue, "merger").click();
    await repos();
    assert.ok(!vue.appels.some(({ geste }) => geste === "gesteDeFiche"), "rien ne part avant le « oui »");
    const confirmation = fiche(vue).dessous("section").find((pose) => pose.className === "confirmation") ?? assert.fail("pas de confirmation");
    assert.deepEqual(confirmation.dessous("p").filter((pose) => pose.className === "prix").map((ligne) => ligne.textContent), [PRIX.merger]);
    (confirmation.dessous("button").find((pose) => pose.textContent === "yes, merge the PR") ?? assert.fail("pas de « oui »")).click();
    await repos();
    assert.deepEqual(vue.dernier("gesteDeFiche"), [PARADE, "merger", 12, undefined]);
  });

  test("l'historique et la discussion qui ne se lisent pas tiennent chacun en une ligne : `ssh`, son usage et son code de sortie ne se lisent qu'au survol", async () => {
    const vue = await ouvrirLaCarte({ lireHistoire: () => ({ sans: PANNE }), lireDiscussion: () => ({ sans: PANNE.replace("--json", "issue") }) });
    const indisponibles = fiche(vue).dessous("p").filter((pose) => pose.className === "indisponible");
    assert.deepEqual(indisponibles.map((ligne) => ligne.children[0]?.textContent), ["history unavailable", "discussion unavailable"]);
    assert.doesNotMatch(visible(vue), /ssh|usage|exit code/);
    aides(indisponibles[0] ?? assert.fail("pas d'historique"))[0]?.declencher("mouseenter");
    assert.ok(visible(vue).includes(PANNE), "le détail, au survol");
  });

  test("une box d'avant la décision dans `faits` : une phrase qui ne devine rien, et pas d'autre geste que ceux de tous", async () => {
    const vue = await ouvrir();
    recevoir(vue, dessinable(FAITS, AVEC_RENONCE));
    await ouvrirFiche(vue, 12);
    const panneau = fiche(vue).children[0] ?? assert.fail("pas de panneau");
    assert.equal(panneau.children[1]?.textContent, "This ticket waits for your decision — its issue says which.");
    assert.deepEqual(gestesDeLaFicheOuverte(vue).map(([id]) => id), ["issue", "second", "priorite"]);
    assert.doesNotMatch(visible(vue), /ssh |brigade parade|remontée/);
  });
});
