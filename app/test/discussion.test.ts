// « ask the second » sur la fiche d'une carte (#686, #2167) : `/brigade:ask <ticket> ` écrit dans le second du projet, sans
// Entrée — contre un second doublé ; la vue, telle qu'elle est, devant un faux document, par la barre de gestes de la fiche.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, test } from "node:test";
import { forTheBar } from "../src/bar.ts";
import { EXAMPLE } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { askAtSecond, noteOfTheQuestion } from "../src/discussion.ts";
import { putAside } from "../src/awaiting.ts";
import { BANNER, holdFacts, type Facts } from "../src/facts.ts";
import { actionsOfCard } from "../src/card-actions.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import type { Read } from "../src/question.ts";
import type { Terminal } from "../src/terminals.ts";
import { cardOfTicket, type Fake, type Played, playTheVue, type Answers, repos } from "./helpers/false-vue.ts";

const ROOT = resolve(import.meta.dirname, "..", "..");
const PARADE = "parade";
const PROJECT = { nom: PARADE, dossier: "/tmp/parade" };

// La vue, jouée telle qu'elle est.
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
// Ce que `inscrire` rend d'une demande écrite : le second la porte, la note la dit.
const SECOND_WRITTEN: Terminal = { ...SECOND, note: "demande écrite dans le second — appuie sur Entrée pour l'envoyer", demandeEcrite: true };
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PROJECT] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: {},
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});
const FACTS: Facts = {
  etat: "ouverte",
  lu: "2026-10-14T12:00:00.000Z",
  dernierTick: "2026-10-14T12:00:00.000Z",
  compteurs: { rail: 3, auTravail: 1, aLaPass: 0, attend: 0, livres24h: 1 },
  dernierEvenement: null,
  rail: [
    { ticket: 14, etat: "pris", titre: "Le journal en ajout seul", url: "https://github.com/benomite/brigade/issues/14", activite: null },
    { ticket: 21, etat: "en attente", titre: "L'export du journal", url: "https://github.com/benomite/brigade/issues/21", activite: null },
    { ticket: 31, etat: "servi", titre: "Servi hier", url: "https://github.com/benomite/brigade/issues/31", activite: null },
  ],
  cooks: [],
  attend: [],
};

async function open(answers: Answers = {}): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [SECOND], gestesDeFiche: (cardItem) => actionsOfCard(cardItem), ...answers });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const receivedOne = holdFacts().recevoir({ projet: PARADE, demande: 0, a: FACTS.lu, sorties: [{ commande: "facts", texte: JSON.stringify(FACTS) }] });
  vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}
const card = (vue: Played) => vue.element("fiche");
const openCard = async (vue: Played, number: number) => {
  const slip = cardOfTicket(vue, number) ?? assert.fail(`pas de bon #${number}`);
  slip.click();
  await repos();
};
// « ask the second » (#686, #2167) : `/brigade:ask <ticket> ` — une espace au bout — écrit dans le second du projet,
// sans Entrée ; le chef tape sa question à la suite. Rien ne part sur GitHub ni sur la box.
describe("demander au second depuis la fiche : `/brigade:ask <ticket> ` écrit dans le second, sans Entrée (#2167)", () => {
  const registered = () => {
    const writtenEntries: string[] = [];
    return { ecrites: writtenEntries, inscrire: (command: string) => (writtenEntries.push(command), SECOND_WRITTEN) };
  };

  test("le ticket 2087 : exactement `/brigade:ask 2087 `, rien d'autre — ni Entrée, ni retour à la ligne — et le second écrit est rendu", () => {
    const { ecrites: writtenEntries, inscrire: register } = registered();
    assert.equal(askAtSecond(register, PROJECT, 2087), SECOND_WRITTEN);
    assert.deepEqual(writtenEntries, ["/brigade:ask 2087 "]);
    assert.doesNotMatch(writtenEntries[0] ?? "", /[\r\n]/);
  });

  test("le même geste pour toute carte qui a un numéro, quelle que soit la station du projet", () => {
    for (const project of [PROJECT, { ...PROJECT, depot: "chef/parade" }, { nom: "ailleurs", dossier: "/tmp/ailleurs", depot: "chef/ailleurs", base: "main" }]) {
      for (const ticket of [1, 21, 2087]) {
        const { ecrites: writtenEntries, inscrire: register } = registered();
        askAtSecond(register, project, ticket);
        assert.deepEqual(writtenEntries, [`/brigade:ask ${ticket} `]);
      }
    }
  });

  test("le clic ne poste rien sur GitHub : ni commentaire, ni label", () => {
    // Le geste ne reçoit pas de quoi joindre GitHub : seulement ce qui écrit dans le second, le projet et le ticket.
    assert.equal(askAtSecond.length, 3);
    // Le canal du process principal n'appelle que lui : ni l'accès GitHub de l'app, ni le rail lu.
    const channel = /ipcMain\.handle\("demanderAuSecond"[\s\S]*?\n\}\);/.exec(readFileSync(join(ROOT, "app/src/main.ts"), "utf8"))?.[0] ?? assert.fail("pas de canal « demanderAuSecond »");
    assert.match(channel, /askAtSecond\(\(command\) => terminals\.inscrire\(aims, command, noteOfTheQuestion\), aims, ticket\)/);
    assert.doesNotMatch(channel, /commentTheIssue|clientDesLabels|tableaux|brigade ask/);
  });

  test("ni ticket, ni projet qui s'ouvre : rien n'est écrit, et pourquoi est dit", () => {
    const { ecrites: writtenEntries, inscrire: register } = registered();
    for (const [project, ticket] of [
      [PROJECT, "21"],
      [PROJECT, 0],
      [PROJECT, 1.5],
      [{ ...PROJECT, refus: "illisible" }, 21],
    ] as const) {
      const rendered = askAtSecond(register, project, ticket);
      assert.ok("refus" in rendered && rendered.refus.startsWith("nothing was written: "), JSON.stringify(rendered));
    }
    assert.deepEqual(writtenEntries, []);
  });

  test("la note du second dit d'écrire la question à la suite, et avertit devant un dialogue", () => {
    assert.match(noteOfTheQuestion(), /without Enter — type your question after it/);
    assert.match(noteOfTheQuestion(true), /keystrokes/);
  });
});

const actions = (vue: Played): Fake => card(vue).dessous("section").find((pose) => pose.className === "gestes-fiche") ?? assert.fail("pas de gestes sur la fiche");
const requestAtSecond = (vue: Played): Fake => actions(vue).dessous("button").find((pose) => pose.dataset.geste === "demande") ?? assert.fail("pas de bouton « ask the second »");

describe("la fiche : le bouton « ask the second » de la barre de gestes, et la question d'une carte Await (#686)", () => {
  test("rien ne part avant le clic ; le clic envoie le projet et le ticket, rien d'autre — ni commentaire, ni champ", async () => {
    const vue = await open({ demander: () => SECOND_WRITTEN });
    await openCard(vue, 21);
    assert.equal(requestAtSecond(vue).textContent, "ask the second");
    assert.equal(vue.appels.filter(({ geste: action }) => action === "demander").length, 0);
    requestAtSecond(vue).click();
    await repos();
    assert.deepEqual(vue.dernier("demander"), [PARADE, 21]);
    assert.equal(card(vue).dessous("textarea").length, 0, "la fiche n'a plus de champ de commentaire");
  });

  test("un appel qui lève ne fait pas tomber la fiche, qui reste ouverte", async () => {
    const vue = await open({ demander: () => Promise.reject(new Error("ipc fermé")) as never });
    await openCard(vue, 21);
    requestAtSecond(vue).click();
    await repos();
    assert.deepEqual(vue.dernier("demander"), [PARADE, 21]);
    assert.ok(requestAtSecond(vue).textContent === "ask the second");
  });

  const QUESTION: Read = {
    a: "2026-10-14T12:30:00.000Z",
    question: { url: "https://github.com/benomite/brigade/issues/50#issuecomment-1", auteur: "brigade-manager", a: "2026-10-14T12:00:00Z", texte: "Quel format garde-t-on ?\nA) CSV\nB) JSON", resume: "Quel format garde-t-on ?", choix: [{ lettre: "A", texte: "CSV" }, { lettre: "B", texte: "JSON" }], depuis: [] },
  };
  const openAwait = async (readQuestion: Read) => {
    const facts = { ...FACTS, attend: [{ ticket: 50, titre: "Le format de l'export", url: "https://github.com/benomite/brigade/issues/50" }] };
    const vue = await playTheVue({ demarrage: startup, espace: () => [SECOND], gestesDeFiche: (cardItem) => actionsOfCard(cardItem), lireQuestion: () => readQuestion });
    (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
    await repos();
    const heldOnes = holdFacts();
    const receivedOne = heldOnes.recevoir({ projet: PARADE, demande: 0, a: facts.lu, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
    vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
    await repos();
    // Le bloc `attend` de `status` : c'est lui qui dit qu'une carte t'attend.
    const status = ["projet     parade", "cuisine    ouverte", "", "attend     1 décision attend le chef", "  #50  depuis 1 h  une décision à prendre sur le format", "fin attend", "", "rail       0 en attente", "", ""].join("\n");
    const withIt = heldOnes.attendre(putAside({ projet: PARADE, demande: 0, a: facts.lu, sorties: [{ commande: "status", texte: status }] })) ?? assert.fail("rien à redessiner");
    vue.dire("surFaits", { ...withIt, demande: vue.dernier("faits")[0] as number });
    await repos();
    await openCard(vue, 50);
    return vue;
  };
  const blocks = (vue: Played) => card(vue).dessous("section").map((pose) => pose.className);

  test("sur une carte Await, la question et ses choix sont en tête, au-dessus des gestes de la fiche", async () => {
    const vue = await openAwait(QUESTION);
    const order = blocks(vue);
    assert.ok(order.includes("question") && order.includes("gestes-fiche"));
    assert.ok(order.indexOf("question") < order.indexOf("gestes-fiche"));
    const question = card(vue).dessous("section").find((pose) => pose.className === "question") ?? assert.fail("pas de question");
    assert.ok(question.textContent.includes("Quel format garde-t-on ?"));
    assert.deepEqual(question.dessous("button").filter((pose) => pose.className === "choix").map((pose) => pose.textContent), ["A) CSV", "B) JSON"]);
  });

  test("sur une carte qui n'est pas Await, aucun bloc de question", async () => {
    const vue = await open({ lireQuestion: () => QUESTION });
    await openCard(vue, 21);
    assert.ok(!blocks(vue).includes("question"));
    assert.equal(vue.appels.filter(({ geste: action }) => action === "lireQuestion").length, 0);
  });
});
