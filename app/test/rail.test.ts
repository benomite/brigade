// Le rail est la vue principale de l'espace : au centre de l'écran, en cinq colonnes, posé quel
// que soit l'onglet affiché dessous. Chaque carte y montre ce que la file dit du ticket, écrit
// ce qu'elle n'en dit pas, et relaie mot pour mot ce que la box a écrit. Le clic d'une carte de
// T'attend écrit sa demande dans le second (#452), sans quitter le rail des yeux.
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
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { EFFORTS, MODELES } from "../src/installation.ts";
import { GESTES_DU_MANAGER } from "../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
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
  const vue = await jouerLaVue({ demarrage: () => demarrage(), espace: () => [SECOND], shell: () => SHELL, ...reponses });
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
  version: null,
  miseEnService: { etat: "aucune", depuis: null, coupe: false, enVol: [{ ticket: 14, run: "14-3f9a01bc", station: "box/claude", tokens: 230000 }], tokens: 230000 },
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
function dessinable(faits: Faits = FAITS, status: string | typeof PAS_LU = STATUS): Dessinable {
  const tenus = tenirFaits();
  const recue = tenus.recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "faits", texte: JSON.stringify(faits) }] });
  if (status === PAS_LU) return recue;
  return tenus.attendre(mettreAPart({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "status", texte: status }] })) ?? assert.fail("rien à redessiner");
}
const recevoir = (vue: Jouee, recue: Dessinable = dessinable()) => vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });

const colonnes = (vue: Jouee) => vue.element("rail").dessous("section");
const bons = (ou: Faux) => ou.dessous("li").filter((li) => li.className === "bon");
const bonDe = (vue: Jouee, numero: number): Faux => bons(vue.element("rail")).find((bon) => bon.children[0]?.children[0]?.textContent === `#${numero}`) ?? assert.fail(`pas de bon #${numero}`);
// Ce qu'un bon dit de la file : chaque fait, son libellé puis sa valeur.
const portes = (bon: Faux) => bon.dessous("ul").flatMap((liste) => liste.children.map((fait) => fait.children.map((pose) => pose.textContent)));
const sans = (bon: Faux) => bon.dessous("small").map((pose) => pose.textContent);
const relayes = (bon: Faux) => bon.dessous("p").filter((p) => p.className === "").map((p) => p.textContent);
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
    const ATTENDU = [["Sur le rail", "2"], ["Au travail", "1"], ["Pass", "1"], ["T'attend", "1"], ["Livré", "1"]];

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
    assert.deepEqual(cinq(), [["Sur le rail", "0"], ["Au travail", "0"], ["Pass", "0"], ["T'attend", "0"], ["Livré", "0"]]);
  });

  test("avant la première lecture il le dit ; un projet sans box n'en a pas — rien n'est lu de lui", async () => {
    const vue = await ouvrir();
    assert.equal(vue.element("rail").hidden, false);
    assert.match(vue.element("rail").textContent, /^le rail : première lecture de `ssh box brigade parade faits` en cours…$/);
    assert.deepEqual(colonnes(vue), []);

    const sansBox = await jouerLaVue({ demarrage: () => demarrage([{ nom: PARADE, dossier: "/tmp/parade" }]), espace: () => [SECOND] });
    (sansBox.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
    await repos();
    assert.equal(sansBox.element("rail").hidden, true);
  });

  test("une box qui ne rend pas ses faits : le rail dit qu'il n'est pas dessiné, et ne montre aucune colonne vide à la place", async () => {
    const vue = await ouvrir();
    recevoir(vue, { projet: PARADE, demande: 0, a: A, titre: "PAS JOINT", erreur: "ssh: connect to host box port 22: Connection refused", atteinte: false, cas: null });

    assert.equal(vue.element("rail").hidden, false);
    assert.match(vue.element("rail").textContent, /^le rail n'est pas dessiné : PAS JOINT — essai de /);
    assert.deepEqual(colonnes(vue), []);
  });
});

describe("une carte porte ce que la file dit", () => {
  test("ce que la cuisine en fait en ce moment, qui tient le ticket, depuis quand, son bail, ce qu'il brûle, et en clair ce qui le bloque — quand la file les donne", async () => {
    const vue = await ouvrir();
    recevoir(vue);

    assert.deepEqual(portes(bonDe(vue, 14)), [
      ["en ce moment", "écrit app/src/bon.ts, depuis 2 min"],
      ["tient", "box/claude"],
      ["depuis", "12 min"],
      ["bail", "sans progrès depuis 3 min, bail encore 27 min"],
      ["brûle", `${(230000).toLocaleString("fr-FR")} tokens au dernier relevé`],
    ]);
    assert.deepEqual(portes(bonDe(vue, 21)), [["depuis", "2 h 05"], ["bloque", "zone tenue par #14 (app/src)"]]);
    // En pass, ce que la pass en fait ; la box qui ne le sait pas, la carte l'écrit.
    assert.deepEqual(portes(bonDe(vue, 30))[0], ["en ce moment", "gates en cours, depuis 30 s"]);
    assert.deepEqual(portes(bonDe(vue, 12))[0], ["en ce moment", "activité non communiquée"]);
    // Ce qui se recopie — une station — est en monospace ; une durée se lit.
    const [, tient, depuis] = bonDe(vue, 14).dessous("ul")[0]?.children ?? [];
    assert.deepEqual([tient?.children[1]?.className, depuis?.children[1]?.className], ["mono", ""]);
  });

  test("ce que la file ne donne pas est écrit sur la carte, chose par chose : ni omis, ni remplacé par une valeur", async () => {
    const vue = await ouvrir();
    recevoir(vue);

    assert.deepEqual(sans(bonDe(vue, 14)), ["non communiqué par la file : ce qui le bloque"]);
    assert.deepEqual(sans(bonDe(vue, 21)), ["non communiqué par la file : qui le tient · son bail · ce qu'il brûle"]);
    assert.deepEqual(sans(bonDe(vue, 22)), ["non communiqué par la file : qui le tient · son bail · ce qu'il brûle · ce qui le bloque"]);
    assert.deepEqual(sans(bonDe(vue, 30)), ["non communiqué par la file : qui le tient · son bail · ce qu'il brûle · ce qui le bloque"]);
    // Chaque bon, sans exception, dit les cinq choses ou écrit celles qui manquent.
    for (const bon of bons(vue.element("rail"))) {
      const dites = portes(bon).map(([libelle]) => libelle).filter((libelle) => libelle !== "cuisiné par" && libelle !== "en ce moment").length;
      const tues = (sans(bon)[0] ?? "").split(" : ").at(-1)?.split(" · ").filter(Boolean).length ?? 0;
      const bloqueAPart = relayes(bon).length > 0 && !portes(bon).some(([libelle]) => libelle === "bloque") ? 1 : 0;
      assert.equal(dites + tues + bloqueAPart, 5, bon.textContent);
    }
    // Aucune valeur n'est mise à la place de ce qui manque.
    for (const bon of bons(vue.element("rail"))) for (const [, valeur] of portes(bon)) assert.doesNotMatch(valeur ?? "", /^(|0|-|—|\?|aucun|personne|inconnu)$/i);
  });

  test("sans `status` lu, elle le dit : ce que `faits` donne seul est posé, le reste est écrit non communiqué — et le titre du rail dit d'où vient ce qu'elle porte", async () => {
    const vue = await ouvrir();
    recevoir(vue, dessinable(FAITS, PAS_LU));

    assert.deepEqual(portes(bonDe(vue, 14)).map(([libelle]) => libelle), ["en ce moment", "tient", "brûle"]);
    assert.deepEqual(sans(bonDe(vue, 14)), ["non communiqué par `faits`, et la ligne `rail` de `status` n'a pas été lue : depuis quand · son bail · ce qui le bloque"]);
    assert.match(vue.element("rail").children[0]?.textContent ?? "", /^le rail, d'après `ssh box brigade parade faits` — lu à .*, dans l'ordre de service ; `ssh box brigade parade status` n'a pas été lu : chaque carte porte ce que `faits` dit seul ; un numéro ouvre l'issue$/);
    recevoir(vue);
    assert.match(vue.element("rail").children[0]?.textContent ?? "", / — et `ssh box brigade parade status`, lu à .* : son bloc `attend` dit ce qui t'attend, sa ligne `rail` ce que chaque carte porte de plus ; un numéro ouvre l'issue$/);
    // Un `status` sans le bord de son bloc, ou sans sa ligne `rail` : le titre dit lequel manque.
    recevoir(vue, dessinable(FAITS, STATUS.replace("fin attend\n", "")));
    assert.match(vue.element("rail").children[0]?.textContent ?? "", / : son bloc `attend` n'a pas été pris, sa ligne `rail` ce que chaque carte porte de plus ; /);
    recevoir(vue, dessinable(FAITS, STATUS.replace("rail       ", "le rail    ")));
    assert.match(vue.element("rail").children[0]?.textContent ?? "", / : son bloc `attend` dit ce qui t'attend, sa ligne `rail` n'a pas été lue — chaque carte porte ce que `faits` dit seul ; /);
  });

  test("une ligne de `status` que l'app n'a pas su découper est relayée sur la carte, entière et mot pour mot — et la carte le dit", async () => {
    const vue = await ouvrir();
    recevoir(vue);
    const bon = bonDe(vue, 31);

    assert.deepEqual(portes(bon), []);
    assert.deepEqual(bon.dessous("p").filter((p) => p.className === "ligne").map((p) => p.textContent), ["servi  -  une phrase que l'app ne connaît pas,   avec ses blancs  Servi hier"]);
    assert.match(sans(bon)[0] ?? "", /^non communiqué par `faits`, et pas lu par l'app dans ce que `status` écrit de ce ticket, relayé dessous tel quel : /);
  });
});

describe("T'attend est le seul endroit où un ticket attend une décision", () => {
  test("un ticket que la file dit attendre n'a qu'une carte, dans T'attend — avant même que `status` ait été lu", async () => {
    for (const status of [PAS_LU, STATUS]) {
      const vue = await ouvrir();
      recevoir(vue, dessinable(FAITS, status));
      const ou = colonnes(vue).filter((colonne) => bons(colonne).some((bon) => bon.children[0]?.children[0]?.textContent === "#12")).map((colonne) => colonne.children[0]?.children[0]?.textContent);

      assert.deepEqual(ou, ["T'attend"]);
      assert.equal(bons(vue.element("rail")).filter((bon) => bon.children[0]?.children[0]?.textContent === "#12").length, 1);
      // Sa pilule le dit en mots ; aucune autre carte ne la porte.
      const attendus = bons(vue.element("rail")).filter((bon) => bon.dessous("span").some((pose) => pose.className.split(" ").includes("attendu")));
      assert.deepEqual(attendus.map((bon) => bon.children[0]?.children[0]?.textContent), ["#12"]);
    }
  });

  test("ce que le bloc `attend` dit de lui est restitué mot pour mot sur sa carte : une entrée longue et les lignes qui la précisent, ni tronquées ni remises en forme", async () => {
    const vue = await ouvrir();
    recevoir(vue);
    const [relaye, ...autres] = relayes(bonDe(vue, 12));

    assert.deepEqual(autres, []);
    assert.equal(relaye, [LONGUE, ...SUITE].join("\n"));
    assert.ok((relaye ?? "").length > 3000 && (relaye ?? "").split("\n").length === 5);
    // Chaque ligne de l'entrée, telle que `status` l'a écrite, est sur la carte.
    for (const ligne of [`  #12  ${LONGUE}`, ...SUITE]) assert.ok(`  #12  ${relaye}`.split("\n").includes(ligne) && STATUS.split("\n").includes(ligne));
    // Et la peau ne la coupe pas : ses blancs et ses lignes sont gardés, une ligne trop longue passe à la suivante.
    const css = readFileSync(join(VUE, "vue.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const duBon = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, tete = ""]) => tete.split(",").some((selecteur) => /#rail( \.bon)?( p)?$/.test(selecteur.trim()) || selecteur.trim() === "#rail .bon p"));
    const declare = (propriete: string) => duBon.flatMap(([, , corps = ""]) => corps.split(";").map((d) => d.trim()).filter((d) => d.startsWith(`${propriete}:`)).map((d) => d.slice(d.indexOf(":") + 1).trim()));
    assert.deepEqual(declare("white-space"), ["pre-wrap"]);
    assert.deepEqual(declare("overflow-wrap"), ["anywhere"]);
    for (const interdite of ["text-overflow", "-webkit-line-clamp", "max-height", "height", "text-transform"]) assert.deepEqual(declare(interdite), [], interdite);
  });
});

describe("le clic d'une carte de T'attend (#452)", () => {
  test("« demander au second » nomme le projet et le ticket au process principal, et l'écrit dans le second, à droite — le rail et l'onglet ouvert dessous restent posés", async () => {
    const vue = await ouvrir({ demander: () => ({ ...SECOND, note: "demande écrite dans le second, sans Entrée" }) });
    recevoir(vue);
    await ouvrirLecture(vue, "Cooks");
    const [demander, ...autres] = bons(vue.element("rail")).flatMap((bon) => bon.dessous("button").filter((pose) => pose.className === "demander"));

    // Seule la carte de T'attend porte le geste.
    assert.deepEqual(autres, []);
    assert.equal(demander?.parentElement, bonDe(vue, 12));
    demander?.click();
    await repos();

    assert.deepEqual(vue.dernier("demander"), [PARADE, 12]);
    assert.equal(vue.element("note-second").textContent, "demande écrite dans le second, sans Entrée");
    assert.equal(vue.element("second").hidden, false);
    assert.equal(vue.element("rail").hidden, false);
    // Le centre n'a pas changé : l'onglet Cooks est toujours celui qui est ouvert.
    assert.equal(onglet(vue, "Coût").ariaSelected, "true");
    assert.equal(vue.element("contenu").hidden, false);
    assert.equal(relayes(bonDe(vue, 12))[0], [LONGUE, ...SUITE].join("\n"));
  });

  test("sans ce que le bloc dit de lui — `status` pas encore lu —, la carte est dans T'attend, écrit ce qui manque, et n'offre pas un geste composé de mots qu'elle n'a pas", async () => {
    const vue = await ouvrir();
    recevoir(vue, dessinable(FAITS, PAS_LU));
    const bon = bonDe(vue, 12);

    assert.deepEqual(relayes(bon), []);
    assert.deepEqual(bon.dessous("button").filter((pose) => pose.className === "demander"), []);
    assert.match(sans(bon)[0] ?? "", / : qui le tient · depuis quand · son bail · ce qu'il brûle · ce qui le bloque$/);
  });

  test("le numéro d'une carte ouvre son issue : la vue nomme le projet et le ticket, jamais une adresse", async () => {
    const vue = await ouvrir({ ouvrirIssue: () => true });
    recevoir(vue);
    bonDe(vue, 14).children[0]?.children[0]?.click();
    await repos();

    assert.deepEqual(vue.dernier("ouvrirIssue"), [PARADE, 14]);
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

    assert.deepEqual(livre(vue).children[0]?.children.map((pose) => pose.textContent), ["Livré", "2"]);
    assert.deepEqual(bons(livre(vue)).map((bon) => bon.children[0]?.children[0]?.textContent), ["#216", "#188"]);
    assert.deepEqual(portes(bonDe(vue, 216)), [["livré", "13 s avant la lecture"], ["cuisiné par", "box/claude"]]);
    assert.deepEqual(portes(bonDe(vue, 188)), [["livré", "17 h 34 avant la lecture"], ["cuisiné par", "box/claude"], ["PR", "aucune — servi sans merge"]]);
    // #31, servi encore sur le rail mais pas dans les livrés : il n'est pas dans Livré.
    assert.ok(!bons(livre(vue)).some((bon) => bon.children[0]?.children[0]?.textContent === "#31"));

    assert.deepEqual(bonDe(vue, 188).dessous("button").filter((pose) => pose.className === "pr"), []);
    const pr = bonDe(vue, 216).dessous("button").find((pose) => pose.className === "pr") ?? assert.fail("pas de bouton de PR");
    pr.click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirPr"), [PARADE, 216]);
  });

  test("rien de servi en 24 h : la colonne le dit", async () => {
    const vue = await ouvrir();
    recevoir(vue, dessinable({ ...FAITS, compteurs: { ...FAITS.compteurs, livres24h: 0 }, livres: [] }, PAS_LU));

    assert.equal(livre(vue).children[1]?.textContent, "rien livré depuis 24 h");
  });

  test("longue, elle défile dans sa hauteur : elle ne pousse rien sous la grille, et les autres colonnes restent en vue", async () => {
    const vue = await ouvrir();
    recevoir(vue, dessinable({ ...FAITS, livres: LIVRES }, PAS_LU));
    assert.deepEqual(colonnes(vue).map((colonne) => "defile" in colonne.dataset), [false, false, false, false, true]);

    const css = readFileSync(join(VUE, "vue.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const corps = /(?:^|})\s*#rail \.colonne\[data-defile\] > ol\s*\{([^}]*)\}/.exec(css)?.[1] ?? assert.fail("pas de règle pour la colonne qui défile");
    assert.match(corps, /max-height:\s*\d+vh/);
    assert.match(corps, /overflow-y:\s*auto/);
  });
});
