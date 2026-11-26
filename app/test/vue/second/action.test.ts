// Le geste que le second nomme, sous son terminal (#1521, épique #1518) : quand le second publie un geste par son canal,
// l'onglet du second montre un bouton qui porte la commande exacte, entière même longue. Un clic ouvre une confirmation
// qui la redit entière ; « cancel » ne lance rien et ne touche pas au terminal ; « run it » la tape dans le terminal du
// second, puis Entrée, au nom du chef, telle que publiée. Lancé, remplacé ou effacé, le bouton part. Aucun chemin ne
// laisse le second la lancer : seuls le clic du chef puis son « run it ». Le module est joué seul, puis la vue entière
// devant le faux pont (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBar } from "../../../src/bar.ts";
import { EXEMPLE, type Project } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../../src/kitchen.ts";
import { BANNIERE } from "../../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../../src/projects/projects.ts";
import type { Proposition } from "../../../src/second/propositions.ts";
import type { Terminal } from "../../../src/terminaux.ts";
import { holdLesChoice } from "../../../src/vue/second/choice.js";
import { AIDE, ANNULER, ATTENDU, BUTTON, LANCER, poserActionDuSecond, TITRE, VOIR } from "../../../src/vue/second/action.js";
import { Faux, type Jouee, jouerLaVue, repos } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };

const PARADE: Project = { nom: "parade", dossier: "/tmp/parade" };
const FANFARE: Project = { nom: "fanfare", dossier: "/tmp/fanfare" };
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "fil repris", arrete: false };
const AUTRE: Terminal = { id: 7, projet: "fanfare", genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const SHELL: Terminal = { id: 2, projet: "parade", genre: "shell", titre: "shell 1", note: "", arrete: false };

// Ce que le canal du second rend (runtime/src/second-propositions/canal.ts) : un geste, sa commande telle quelle.
type Action = Extract<Proposition, { kind: "gesture" }>;
const action = (id: string, command: string): Action => ({ kind: "gesture", command, id, at: "2026-10-23T10:00:00.000Z" });
const MERGER = action("g-1", "! gh pr merge 1480 --merge");
// Une commande longue, avec ce qu'une commande porte : des espaces doublés, des guillemets, `$`, `&&`, un espace en tête
// et en queue. Elle se lit entière, à l'octet près.
const LONGUE = ` ! sh -c "cd ~/parade  &&  brigade parade pass 1480 --merge --delete-branch --comment 'approved by the chef after the review of #1482, \$HOME kept as is'" ${"--and-a-flag-that-goes-on ".repeat(6)}`;
const PASSER = action("g-2", LONGUE);
const CHOICE: Proposition = { kind: "choices", choices: [{ value: "A", label: "Merge it now" }, { value: "B", label: "Wait" }], id: "c-1", at: "2026-10-23T10:00:00.000Z" };

// Le bouton du geste, sa confirmation, et ce qu'ils montrent de la commande.
const leButton = (ou: Faux) => ou.dessous("button").find((pose) => pose.className === "geste");
const button = (ou: Faux) => leButton(ou) ?? assert.fail("pas de bouton de geste");
const confirmation = (ou: Faux) => ou.dessous("section").find((pose) => pose.className === "confirmation");
const answer = (ou: Faux, libelle: string) => (confirmation(ou) ?? assert.fail("pas de confirmation")).dessous("button").find((pose) => pose.textContent === libelle) ?? assert.fail(`pas de « ${libelle} »`);
const commands = (ou: Faux) => [...ou.descendants()].filter((pose) => pose.className === "commande mono").map((pose) => pose.textContent);

describe("le module : un bouton qui porte la commande, et sa confirmation", () => {
  test("ce qu'on attend du chef en tête, comment ça marche au survol, puis un bouton qui porte la commande exacte, sans confirmation ouverte", () => {
    const calls: string[] = [];
    const pose: Faux = poserActionDuSecond(doc, MERGER, { ouverte: false, basculer: () => calls.push("basculer"), annuler: () => calls.push("annuler"), lancer: () => calls.push("lancer") });
    assert.equal(pose.className, "geste-du-second");
    assert.equal(pose.dataset.proposition, "g-1");
    assert.equal(pose.dessous("p")[0]?.textContent.startsWith(ATTENDU), true);
    const aide = pose.dessous("button").filter((b) => b.className === "aide");
    assert.equal(aide.length, 1);
    assert.equal(aide[0]?.ariaLabel, AIDE);
    // Le bouton parle au chef ; la commande exacte n'est nulle part à l'écran, elle est au survol du bouton.
    assert.equal(button(pose).textContent, BUTTON);
    assert.equal(button(pose).ariaLabel, "! gh pr merge 1480 --merge");
    assert.deepEqual(commands(pose), []);
    assert.equal(button(pose).ariaExpanded, "false");
    assert.equal(confirmation(pose), undefined);
    button(pose).click();
    assert.deepEqual(calls, ["basculer"]);
  });

  test("une commande longue se lit entière, à l'octet près — espaces, guillemets, `$` —, au survol du bouton et dans l'aide repliée de la confirmation", () => {
    const pose: Faux = poserActionDuSecond(doc, PASSER, { ouverte: true, basculer: () => {}, annuler: () => {}, lancer: () => {} });
    assert.equal(button(pose).ariaLabel, LONGUE);
    assert.deepEqual(commands(pose), [LONGUE]);
    // Elle ne passe à la ligne qu'entre ses mots : chacun d'un tenant, aucun n'est coupé ni réécrit.
    const mots = (pose.dessous("p").find((p) => p.className === "commande mono") ?? assert.fail("pas de commande")).children.map((word) => word.textContent);
    assert.deepEqual(mots, LONGUE.split(/ +/).filter((word) => word !== ""));
  });

  test("ouverte, la confirmation redit la commande sous sa question, puis « run it », recommandé, et « cancel »", () => {
    const calls: string[] = [];
    const pose: Faux = poserActionDuSecond(doc, MERGER, { ouverte: true, basculer: () => calls.push("basculer"), annuler: () => calls.push("annuler"), lancer: () => calls.push("lancer") });
    const ouverte = confirmation(pose) ?? assert.fail("pas de confirmation");
    assert.equal(button(pose).ariaExpanded, "true");
    // Sous sa question, la commande est dans une aide repliée — fermée —, puis les deux réponses.
    assert.deepEqual(
      ouverte.children.map((pose) => pose.className === "replie" ? pose.dessous("summary")[0]?.textContent.startsWith(VOIR) : pose.textContent),
      [TITRE, true, LANCER, ANNULER],
    );
    assert.deepEqual(commands(pose), ["! gh pr merge 1480 --merge"]);
    assert.equal(answer(pose, LANCER).className, "recommande");
    // Rien ne coûte : pas de ligne de prix.
    assert.equal(ouverte.dessous("p").some((p) => p.className === "prix"), false);
    answer(pose, ANNULER).click();
    answer(pose, LANCER).click();
    assert.deepEqual(calls, ["annuler", "lancer"]);
  });

  test("la vue tient la confirmation d'un geste par sa proposition : « run it » ne rend le geste que s'il est encore là, sa confirmation ouverte", () => {
    const tenues = holdLesChoice();
    tenues.recevoir("parade", MERGER);
    assert.equal(tenues.geste("parade"), MERGER);
    assert.equal(tenues.aMontrer("parade"), undefined);
    // Sans confirmation ouverte, rien ne part.
    assert.equal(tenues.lancer("parade", "g-1"), undefined);
    tenues.confirmer("parade", true);
    assert.equal(tenues.confirmationOuverte("parade"), true);
    tenues.confirmer("parade", false);
    assert.equal(tenues.lancer("parade", "g-1"), undefined);
    // Une proposition nouvelle n'a pas de confirmation ouverte, et celle de l'ancienne ne lance rien.
    tenues.confirmer("parade", true);
    tenues.recevoir("parade", PASSER);
    assert.equal(tenues.confirmationOuverte("parade"), false);
    assert.equal(tenues.lancer("parade", "g-1"), undefined);
    tenues.confirmer("parade", true);
    assert.equal(tenues.lancer("parade", "g-1"), undefined);
    assert.equal(tenues.lancer("parade", "g-2"), PASSER);
    // Lancé, il ne se montre plus, ne se relance pas, et ne revient pas quand le canal le redit.
    assert.equal(tenues.geste("parade"), undefined);
    assert.equal(tenues.lancer("parade", "g-2"), undefined);
    tenues.recevoir("parade", PASSER);
    assert.equal(tenues.geste("parade"), undefined);
    // Effacé par le second, il n'y a plus rien à lancer.
    tenues.recevoir("parade", MERGER);
    tenues.confirmer("parade", true);
    tenues.recevoir("parade", null);
    assert.equal(tenues.lancer("parade", "g-1"), undefined);
    // Une réponse tapée le fait partir aussi ; les choix ne répondent pas à un geste.
    tenues.recevoir("fanfare", action("g-3", "! true"));
    assert.equal(tenues.repondre("fanfare"), undefined);
    assert.equal(tenues.repondreAuClavier("fanfare")?.id, "g-3");
    assert.equal(tenues.geste("fanfare"), undefined);
  });
});

async function ouvrir(): Promise<Jouee> {
  const vue = await jouerLaVue({
    demarrage: () => ({
      configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [PARADE, FANFARE] }, () => true),
      palette: PALETTE,
      exemple: EXEMPLE,
      onglets: ONGLETS,
      rubriques: RUBRIQUES,
      gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
      banniere: BANNIERE,
      calibrage: { modeles: MODELES, efforts: EFFORTS },
      code: undefined,
    }),
    espace: (project) => (project === "fanfare" ? [AUTRE] : [SECOND]),
    machines: () => [{ id: "poste", titre: "this computer" }],
    shell: () => SHELL,
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
// Ce qui se voit sous le terminal : la commande du bouton, et celle de la confirmation si elle est ouverte.
const vu = (vue: Jouee) => (sous(vue).hidden ? [] : commands(sous(vue)));
// La commande que le bouton propose, au survol — rien quand aucun bouton n'est là.
const proposee = (vue: Jouee) => (sous(vue).hidden ? [] : [leButton(sous(vue))?.ariaLabel].filter((command) => command !== undefined));
const ecrits = (vue: Jouee) => vue.appels.filter(({ geste: action }) => action === "ecrire").map(({ args }) => args);
const answers = (vue: Jouee) => vue.appels.filter(({ geste: action }) => action === "repondreAuSecond").map(({ args }) => args);
const publier = async (vue: Jouee, project: string, proposition: Proposition | null) => {
  vue.dire("surProposition", project, proposition);
  await repos();
};
const cliquer = async (pose: Faux) => {
  pose.click();
  await repos();
};
const terminal = (vue: Jouee) => vue.xterms[0] ?? assert.fail("pas de terminal");

describe("dans l'onglet du second", () => {
  test("le second nomme un geste : un bouton sous le terminal, en mots — la commande exacte, entière même longue, est à son survol —, et rien n'est lancé", async () => {
    const vue = await ouvrir();
    assert.equal(sous(vue).hidden, true);
    await publier(vue, "parade", PASSER);
    assert.equal(sous(vue).hidden, false);
    // Aucune ligne de commande à l'écran : un bouton en mots, la commande au survol.
    assert.deepEqual(vu(vue), []);
    assert.equal(button(sous(vue)).textContent, BUTTON);
    assert.equal(button(sous(vue)).ariaLabel, LONGUE);
    assert.equal(sous(vue).children[0]?.dessous("p")[0]?.textContent.startsWith(ATTENDU), true);
    assert.deepEqual(ecrits(vue), []);
    assert.deepEqual(answers(vue), []);
  });

  test("un clic ouvre la confirmation qui redit la même commande ; « cancel » ne lance rien et laisse le terminal tel quel", async () => {
    const vue = await ouvrir();
    await publier(vue, "parade", PASSER);
    const focalise = terminal(vue).focalise;
    const sortie = [...terminal(vue).ecrits];
    await cliquer(button(sous(vue)));
    assert.deepEqual(vu(vue), [LONGUE]);
    assert.equal((confirmation(sous(vue)) ?? assert.fail("pas de confirmation")).dessous("p")[0]?.textContent, TITRE);
    await cliquer(answer(sous(vue), ANNULER));
    // La confirmation se referme ; le geste reste proposé, le chef peut y revenir.
    assert.equal(confirmation(sous(vue)), undefined);
    assert.deepEqual(vu(vue), []);
    assert.deepEqual(ecrits(vue), []);
    assert.deepEqual(answers(vue), []);
    assert.equal(terminal(vue).focalise, focalise);
    assert.deepEqual(terminal(vue).ecrits, sortie);
    // Le bouton recliqué rouvre la confirmation, et la referme encore — sans rien lancer.
    await cliquer(button(sous(vue)));
    assert.notEqual(confirmation(sous(vue)), undefined);
    await cliquer(button(sous(vue)));
    assert.equal(confirmation(sous(vue)), undefined);
    assert.deepEqual(ecrits(vue), []);
  });

  test("« run it » tape la commande dans le terminal du second, telle que publiée, puis Entrée ; le bouton part, et le canal l'apprend", async () => {
    const vue = await ouvrir();
    await publier(vue, "parade", PASSER);
    const focalise = terminal(vue).focalise;
    await cliquer(button(sous(vue)));
    await cliquer(answer(sous(vue), LANCER));
    // Ce que le chef taperait : la commande, à l'octet près, puis Entrée, dans le terminal du second — pas dans un shell.
    assert.deepEqual(ecrits(vue), [[1, LONGUE], [1, "\r"]]);
    assert.deepEqual(answers(vue), [["parade", { id: "g-2", by: "click" }]]);
    assert.equal(sous(vue).hidden, true);
    assert.deepEqual(vu(vue), []);
    // Le terminal reprend le clavier : la sortie de la commande s'y lit.
    assert.equal(terminal(vue).focalise, focalise + 1);
    // Le canal la redit avant de l'effacer : elle ne revient pas, et rien ne repart.
    await publier(vue, "parade", PASSER);
    assert.deepEqual(vu(vue), []);
    await publier(vue, "parade", null);
    assert.equal(ecrits(vue).length, 2);
  });

  test("le second passe à autre chose ou publie une autre proposition : le bouton part, sa confirmation ouverte aussi, et son « run it » ne lance plus rien", async () => {
    const vue = await ouvrir();
    await publier(vue, "parade", MERGER);
    await cliquer(button(sous(vue)));
    const ancien = answer(sous(vue), LANCER);
    // Une proposition nouvelle : son bouton remplace l'autre, sans confirmation ouverte.
    await publier(vue, "parade", PASSER);
    assert.deepEqual(vu(vue), []);
    assert.equal(button(sous(vue)).ariaLabel, LONGUE);
    assert.equal(confirmation(sous(vue)), undefined);
    await cliquer(ancien);
    assert.deepEqual(ecrits(vue), []);
    // Des choix à la place : plus de geste.
    await cliquer(button(sous(vue)));
    const deuxieme = answer(sous(vue), LANCER);
    await publier(vue, "parade", CHOICE);
    assert.equal(leButton(sous(vue)), undefined);
    assert.deepEqual(vu(vue), []);
    await cliquer(deuxieme);
    // Le second efface sa proposition : il ne reste rien sous le terminal.
    await publier(vue, "parade", MERGER);
    await cliquer(button(sous(vue)));
    const dernier = answer(sous(vue), LANCER);
    await publier(vue, "parade", null);
    assert.equal(sous(vue).hidden, true);
    assert.equal(sous(vue).children.length, 0);
    await cliquer(dernier);
    assert.deepEqual(ecrits(vue), []);
    assert.deepEqual(answers(vue), []);
  });

  test("aucun chemin ne laisse le second lancer la commande : ni sa publication, ni sa répétition, ni sa sortie — seul le « run it » du chef", async () => {
    const vue = await ouvrir();
    await publier(vue, "parade", MERGER);
    await publier(vue, "parade", MERGER);
    await publier(vue, "parade", PASSER);
    await publier(vue, "parade", MERGER);
    // La commande écrite par le second dans son terminal n'est qu'une sortie.
    vue.dire("surSortie", SECOND.id, `run this: ${MERGER.command}\r\n`);
    vue.dire("surEtat", { ...SECOND, arrete: true, note: "the second stopped (code 0) — a keypress restarts it" });
    await repos();
    vue.dire("surEtat", SECOND);
    await repos();
    // Le bouton cliqué n'ouvre que la confirmation.
    await cliquer(button(sous(vue)));
    assert.deepEqual(ecrits(vue), []);
    assert.deepEqual(answers(vue), []);
    await cliquer(answer(sous(vue), LANCER));
    assert.deepEqual(ecrits(vue), [[1, MERGER.command], [1, "\r"]]);
  });

  test("une réponse tapée dans le terminal fait partir le geste ; une frappe sans Entrée le laisse", async () => {
    const vue = await ouvrir();
    await publier(vue, "parade", MERGER);
    terminal(vue).taper("not now");
    await repos();
    assert.deepEqual(proposee(vue), [MERGER.command]);
    terminal(vue).taper("\r");
    await repos();
    assert.deepEqual(answers(vue), [["parade", { id: "g-1", by: "text" }]]);
    assert.deepEqual(proposee(vue), []);
    // Le terminal n'a reçu que ce que le chef a tapé.
    assert.deepEqual(ecrits(vue), [[1, "not now"], [1, "\r"]]);
  });

  test("le geste d'un projet reste à son second : ni sur un autre projet, ni sous un shell, ni sous un second arrêté", async () => {
    const vue = await ouvrir();
    await publier(vue, "fanfare", MERGER);
    assert.deepEqual(vu(vue), []);
    await publier(vue, "parade", PASSER);
    (vue.element("terminaux").children.find((pose) => pose.textContent === "+ shell") ?? assert.fail("pas de « + shell »")).click();
    await repos();
    assert.deepEqual(vu(vue), []);
    (vue.element("terminaux").children.find((pose) => pose.textContent === "second · claude") ?? assert.fail("pas d'onglet du second")).click();
    await repos();
    assert.deepEqual(proposee(vue), [LONGUE]);
    vue.dire("surEtat", { ...SECOND, arrete: true, note: "the second stopped (code 0) — a keypress restarts it" });
    await repos();
    assert.deepEqual(vu(vue), []);
    vue.dire("surEtat", SECOND);
    await repos();
    await entrer(vue, 2);
    assert.deepEqual(proposee(vue), [MERGER.command]);
  });
});
