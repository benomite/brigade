// Les choix du second, sous son terminal (#1520, épique #1518) : quand le second publie une liste de choix par son
// canal, l'onglet du second montre un bouton par choix, son libellé d'une ligne. Un clic envoie le choix au second
// comme s'il était tapé ; une réponse tapée dans le terminal fait partir les boutons aussi ; une proposition nouvelle
// remplace la précédente, et le second passé à autre chose, il ne reste rien. Sans proposition, le terminal est tel
// qu'avant. Le module est joué seul, puis la vue entière devant le faux pont (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBarre } from "../../../src/barre.ts";
import { BOUTONS } from "../../../src/boutons.ts";
import { EXEMPLE, type Projet } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../src/cuisine.ts";
import { BANNIERE } from "../../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../../src/projets/projets.ts";
import type { Proposition } from "../../../src/second/propositions.ts";
import type { Terminal } from "../../../src/terminaux.ts";
import { ATTENDU, poserChoixDuSecond, reponseTapee, tenirLesChoix } from "../../../src/vue/second/choix.js";
import { Faux, type Jouee, jouerLaVue, type Reponses, repos } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };

const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", box: { hote: "box" } };
const FANFARE: Projet = { nom: "fanfare", dossier: "/tmp/fanfare", box: { hote: "box" } };
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "fil repris", arrete: false };
const AUTRE: Terminal = { id: 7, projet: "fanfare", genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const SHELL: Terminal = { id: 2, projet: "parade", genre: "shell", titre: "shell 1", note: "", arrete: false };

// Ce que le canal du second rend (runtime/src/second-propositions/canal.ts) : des choix, chacun sa valeur et son libellé.
type Choix = Extract<Proposition, { kind: "choices" }>;
const choix = (id: string, choices: { value: string; label: string }[]): Choix => ({ kind: "choices", choices, id, at: "2026-10-23T10:00:00.000Z" });
const MERGER = choix("p-1", [
  { value: "A", label: "Merge it now" },
  { value: "B", label: "Wait for the review of #1482 first" },
  { value: "C", label: "Send it back to its cook" },
]);
const DECOUPER = choix("p-2", [
  { value: "1", label: "Split the ticket in two" },
  { value: "2", label: "Keep it whole" },
]);
const GESTE: Proposition = { kind: "gesture", command: "! gh pr merge 1480 --merge", id: "p-3", at: "2026-10-23T10:00:00.000Z" };

const libelles = (ou: Faux) => ou.dessous("button").filter((bouton) => bouton.className === "choix").map((bouton) => bouton.dessous("span").find((span) => span.className === "libelle")?.textContent);
const bouton = (ou: Faux, valeur: string) => ou.dessous("button").find((pose) => pose.className === "choix" && pose.dataset.valeur === valeur) ?? assert.fail(`pas de choix « ${valeur} »`);

describe("le module : un bouton par choix", () => {
  test("ce qu'on attend du chef en tête, puis un bouton par choix, dans l'ordre publié, avec sa valeur et son libellé entiers", () => {
    const choisis: string[] = [];
    const pose: Faux = poserChoixDuSecond(doc, choix("p-9", [...MERGER.choices, { value: "D", label: `A label that is long ${"and goes on ".repeat(12)}` }]), { choisir: (valeur) => choisis.push(valeur) });
    assert.equal(pose.className, "choix-du-second");
    assert.equal(pose.dataset.proposition, "p-9");
    assert.equal(pose.dessous("p")[0]?.textContent.startsWith(ATTENDU), true);
    // Comment répondre est au survol, pas écrit à plat.
    assert.equal(pose.dessous("button").filter((b) => b.className === "aide").length, 1);
    assert.deepEqual(libelles(pose), ["Merge it now", "Wait for the review of #1482 first", "Send it back to its cook", `A label that is long ${"and goes on ".repeat(12)}`]);
    assert.deepEqual(
      pose.dessous("button").filter((b) => b.className === "choix").map((b) => b.dessous("span")[0]?.textContent),
      ["A", "B", "C", "D"],
    );
    bouton(pose, "B").click();
    assert.deepEqual(choisis, ["B"]);
  });

  test("une réponse tapée porte une Entrée ; une frappe sans Entrée, un retour à la ligne de claude ou un collage n'en sont pas", () => {
    assert.equal(reponseTapee("\r"), true);
    assert.equal(reponseTapee("B\r"), true);
    assert.equal(reponseTapee("B"), false);
    assert.equal(reponseTapee("\x1b[A"), false);
    assert.equal(reponseTapee("\x1b[200~a pasted\rtext\x1b[201~"), false);
  });

  test("la vue tient la dernière proposition de chaque projet : remplacée, effacée, répondue", () => {
    const tenues = tenirLesChoix();
    assert.equal(tenues.aMontrer("parade"), undefined);
    tenues.recevoir("parade", MERGER);
    tenues.recevoir("fanfare", DECOUPER);
    assert.equal(tenues.aMontrer("parade"), MERGER);
    tenues.recevoir("parade", DECOUPER);
    assert.equal(tenues.aMontrer("parade"), DECOUPER);
    // Un geste n'est pas une liste de choix : rien sous le terminal pour lui ici.
    tenues.recevoir("parade", GESTE);
    assert.equal(tenues.aMontrer("parade"), undefined);
    tenues.recevoir("parade", MERGER);
    assert.equal(tenues.repondre("parade"), MERGER);
    assert.equal(tenues.aMontrer("parade"), undefined);
    assert.equal(tenues.repondre("parade"), undefined);
    // Le canal la redit avant de l'effacer : elle ne revient pas.
    tenues.recevoir("parade", MERGER);
    assert.equal(tenues.aMontrer("parade"), undefined);
    tenues.recevoir("fanfare", null);
    assert.equal(tenues.aMontrer("fanfare"), undefined);
  });
});

async function ouvrir(reponses: Reponses = {}): Promise<Jouee> {
  const vue = await jouerLaVue({
    demarrage: () => ({
      configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE, FANFARE], hotes: ["box"] }),
      palette: PALETTE,
      exemple: EXEMPLE,
      onglets: ONGLETS,
      rubriques: RUBRIQUES,
      boutons: BOUTONS,
      gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
      banniere: BANNIERE,
      calibrage: { modeles: MODELES, efforts: EFFORTS },
      code: undefined,
    }),
    espace: (projet) => (projet === "fanfare" ? [AUTRE] : [SECOND]),
    machines: () => [{ id: "poste", titre: "this Mac" }],
    shell: () => SHELL,
    ...reponses,
  });
  await entrer(vue, 1);
  return vue;
}
// La case de la barre : « T », puis les projets dans l'ordre du fichier.
const entrer = async (vue: Jouee, rang: number) => {
  (vue.element("projets").children.at(rang) ?? assert.fail(`pas d'entrée ${rang}`)).click();
  await repos();
};
const sous = (vue: Jouee) => vue.element("choix-du-second");
// Ce qui se voit sous le terminal : rien, ou les libellés des boutons.
const vu = (vue: Jouee) => (sous(vue).hidden ? [] : libelles(sous(vue)));
const ecrits = (vue: Jouee) => vue.appels.filter(({ geste }) => geste === "ecrire").map(({ args }) => args);
const reponses = (vue: Jouee) => vue.appels.filter(({ geste }) => geste === "repondreAuSecond").map(({ args }) => args);
const publier = async (vue: Jouee, projet: string, proposition: Proposition | null) => {
  vue.dire("surProposition", projet, proposition);
  await repos();
};
const terminal = (vue: Jouee) => vue.xterms[0] ?? assert.fail("pas de terminal");

describe("dans l'onglet du second", () => {
  test("sans proposition, rien sous le terminal, et le terminal se comporte comme avant", async () => {
    const vue = await ouvrir();
    assert.equal(sous(vue).hidden, true);
    assert.equal(sous(vue).children.length, 0);
    terminal(vue).taper("B");
    terminal(vue).taper("\r");
    assert.deepEqual(ecrits(vue), [[1, "B"], [1, "\r"]]);
    assert.deepEqual(reponses(vue), []);
  });

  test("le second publie des choix : un bouton par choix sous le terminal, avec son libellé", async () => {
    const vue = await ouvrir();
    await publier(vue, "parade", MERGER);
    assert.deepEqual(vu(vue), ["Merge it now", "Wait for the review of #1482 first", "Send it back to its cook"]);
    assert.equal(sous(vue).children[0]?.dessous("p")[0]?.textContent.startsWith(ATTENDU), true);
  });

  test("un clic envoie le choix au second comme s'il était tapé, puis les boutons partent et le canal l'apprend", async () => {
    const vue = await ouvrir();
    await publier(vue, "parade", MERGER);
    const avant = terminal(vue).focalise;
    bouton(sous(vue), "B").click();
    await repos();
    // Ce qu'un chef taperait : la valeur, puis Entrée, dans le terminal du second.
    assert.deepEqual(ecrits(vue), [[1, "B"], [1, "\r"]]);
    assert.deepEqual(reponses(vue), [["parade", { id: "p-1", by: "click", value: "B" }]]);
    assert.deepEqual(vu(vue), []);
    assert.equal(sous(vue).hidden, true);
    // Le terminal reprend le clavier, pour la suite de la conversation.
    assert.equal(terminal(vue).focalise, avant + 1);
    // Le canal efface la proposition : rien ne revient.
    await publier(vue, "parade", null);
    assert.deepEqual(vu(vue), []);
  });

  test("une réponse tapée dans le terminal fait partir les boutons ; une frappe sans Entrée les laisse", async () => {
    const vue = await ouvrir();
    await publier(vue, "parade", MERGER);
    terminal(vue).taper("ok, let's do ");
    assert.deepEqual(vu(vue).length, 3);
    terminal(vue).taper("A but squash it\r");
    await repos();
    assert.deepEqual(ecrits(vue), [[1, "ok, let's do "], [1, "A but squash it\r"]]);
    assert.deepEqual(reponses(vue), [["parade", { id: "p-1", by: "text" }]]);
    assert.deepEqual(vu(vue), []);
    // Une autre Entrée ne répond à rien de plus.
    terminal(vue).taper("\r");
    assert.equal(reponses(vue).length, 1);
  });

  test("une proposition nouvelle remplace les boutons de la précédente ; le second passé à autre chose, il n'en reste aucun", async () => {
    const vue = await ouvrir();
    await publier(vue, "parade", MERGER);
    await publier(vue, "parade", DECOUPER);
    assert.deepEqual(vu(vue), ["Split the ticket in two", "Keep it whole"]);
    bouton(sous(vue), "2").click();
    await repos();
    assert.deepEqual(reponses(vue), [["parade", { id: "p-2", by: "click", value: "2" }]]);
    await publier(vue, "parade", MERGER);
    assert.deepEqual(vu(vue), ["Merge it now", "Wait for the review of #1482 first", "Send it back to its cook"]);
    await publier(vue, "parade", null);
    assert.deepEqual(vu(vue), []);
    // Un geste n'a pas sa place ici (#1521) : rien sous le terminal pour lui.
    await publier(vue, "parade", GESTE);
    assert.deepEqual(vu(vue), []);
  });

  test("les choix d'un projet restent à son second : ni sur un autre projet, ni sous un shell", async () => {
    const vue = await ouvrir();
    await publier(vue, "fanfare", DECOUPER);
    assert.deepEqual(vu(vue), []);
    await publier(vue, "parade", MERGER);
    const parShell = vue.element("terminaux").children.find((pose) => pose.textContent === "+ shell") ?? assert.fail("pas de « + shell »");
    parShell.click();
    await repos();
    // Une seule machine : le shell s'ouvre d'un clic, et se montre à la place du second.
    assert.deepEqual(vue.element("terminaux").children.filter((pose) => pose.ariaSelected === "true").map((pose) => pose.textContent), ["shell 1"]);
    assert.deepEqual(vu(vue), []);
    (vue.element("terminaux").children.find((pose) => pose.textContent === "second · claude") ?? assert.fail("pas d'onglet du second")).click();
    await repos();
    assert.deepEqual(vu(vue), ["Merge it now", "Wait for the review of #1482 first", "Send it back to its cook"]);
    await entrer(vue, 2);
    assert.deepEqual(vu(vue), ["Split the ticket in two", "Keep it whole"]);
  });

  test("un second arrêté n'a pas de boutons : un clic le relancerait sans rien taper", async () => {
    const vue = await ouvrir();
    await publier(vue, "parade", MERGER);
    vue.dire("surEtat", { ...SECOND, arrete: true, note: "the second stopped (code 0) — a keypress restarts it" });
    await repos();
    assert.deepEqual(vu(vue), []);
    vue.dire("surEtat", SECOND);
    await repos();
    assert.equal(vu(vue).length, 3);
  });

  test("ce que le second proposait déjà à l'ouverture de l'app se montre dès que son espace s'ouvre", async () => {
    const vue = await ouvrir({ propositionsDuSecond: () => ({ parade: MERGER }) });
    assert.deepEqual(vu(vue), ["Merge it now", "Wait for the review of #1482 first", "Send it back to its cook"]);
  });
});
