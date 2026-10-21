// Parler au second d'un projet depuis le téléphone appairé (ticket 1165). La vue est celle du desktop, sur un écran
// étroit (#1186) : l'onglet Second y prend la place du centre. Mais un téléphone n'a pas de terminal — aucun pty n'y
// tourne : son onglet Second tient la conversation, en messages (telephone/conversation.js), telle que le pont la rend
// (`conversation`). C'est celle du second du desktop : le message que le chef envoie d'ici part dans cette même
// conversation (`envoyerAuSecond`), et ce qui s'y écrit ensuite — la réponse du second, un message tapé sur le
// desktop — revient par `surConversation`. Ici, le pont est une fausse station qui tient une seule conversation par
// projet, celle que le desktop montre. Vus sur les captures `telephone-second*` de scripts/capture-ecran
// (docs/captures/1165/).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { BOUTONS } from "../../src/boutons.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { GESTES_DU_MANAGER } from "../../src/manager.ts";
import { rendre } from "../../src/markdown.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import type { Conversation, MessageDuSecond, RefusDeConversation } from "../../src/vue/pont.d.ts";
import { AIDE, ATTENTE, ILLISIBLE, NON_ENVOYE, PRIX, REPOND, SANS_PONT } from "../../src/vue/telephone/conversation.js";
import { type Faux, FauxEcran, type Jouee, jouerLaVue, type Reponses, repos } from "../aides/fausse-vue.ts";

const PARADE = "parade";
const CANTINE = "cantine";
const PROJETS = [
  { nom: PARADE, dossier: "/tmp/parade", box: { hote: "box" } },
  { nom: CANTINE, dossier: "/tmp/cantine", box: { hote: "box" } },
];
const TELEPHONE = { appaire: true as const, station: "box", adresse: "http://192.168.1.20:7010" };

// Le démarrage tel que le pont de l'app Android le rend (app/android/web/pont.js) : les constantes de l'app, le
// téléphone appairé — `telephone` absent, c'est le desktop —, et les projets que sa station sert.
const demarrage = (telephone: typeof TELEPHONE | undefined) => () => ({
  configuration: pourLaBarre({ chemin: "no projects file on this phone", projets: PROJETS, hotes: ["box"] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  ...(telephone === undefined ? {} : { telephone }),
});

const message = (de: MessageDuSecond["de"], a: string, texte: string): MessageDuSecond => ({ de, a: `2026-10-21T${a}:00.000Z`, blocs: rendre(texte) });
const QUESTION = message("chef", "09:58", "What is waiting for me on parade?");
const REPONSE = message("second", "09:58", "One decision: **#12** is green, but the pass does not merge it without the `merge` grant.");

// La station, telle que le pont du téléphone la joindrait : une conversation par projet — celle du second du desktop,
// la seule. Ce que le téléphone envoie y est écrit, comme ce que le chef tape sur le desktop (`ecrireDuDesktop`) ; le
// second y répond (`repondre`). Chaque changement est poussé à la vue, comme le pont le ferait.
function station(vue: () => Jouee) {
  const conversations = new Map<string, Conversation>([
    [PARADE, { messages: [QUESTION, REPONSE] }],
    [CANTINE, { messages: [] }],
  ]);
  const recus: { projet: string; texte: string }[] = [];
  const conversation = (projet: string): Conversation => conversations.get(projet) ?? { messages: [] };
  const pousser = (projet: string) => vue().dire("surConversation", projet, structuredClone(conversation(projet)));
  return {
    recus,
    conversation,
    reponses: {
      conversation: (projet: string) => structuredClone(conversation(projet)),
      envoyerAuSecond: (projet: string, texte: string) => {
        recus.push({ projet, texte });
        conversations.set(projet, { messages: [...conversation(projet).messages, message("chef", "10:04", texte)], repond: true });
        return structuredClone(conversation(projet));
      },
    } satisfies Reponses,
    // Le second répond au dernier message.
    repondre(projet: string, texte: string) {
      conversations.set(projet, { messages: [...conversation(projet).messages, message("second", "10:05", texte)] });
      pousser(projet);
    },
    // Le chef écrit dans le terminal du second, sur son ordinateur.
    ecrireDuDesktop(projet: string, texte: string) {
      conversations.set(projet, { messages: [...conversation(projet).messages, message("chef", "10:06", texte)] });
      pousser(projet);
    },
  };
}

// L'espace de parade ouvert sur le téléphone — `desktop` : sur une fenêtre étroite du desktop —, puis son onglet Second
// touché. `espace` ne rend rien : le pont du
// téléphone n'ouvre aucun terminal.
async function ouvrir(reponses: Reponses = {}, { desktop = false } = {}): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage: demarrage(desktop ? undefined : TELEPHONE), espace: () => undefined as never, machines: () => [], ...reponses }, { ecran: new FauxEcran(true) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  await toucherSecond(vue);
  return vue;
}
async function toucherSecond(vue: Jouee): Promise<void> {
  (vue.element("onglets-du-projet").children.find((onglet) => onglet.textContent === "Second") ?? assert.fail("pas d'onglet Second")).click();
  await repos();
}

const conversation = (vue: Jouee) => vue.element("conversation");
// Les messages montrés : qui, et ce qu'il a écrit — ou ce que l'écran dit à leur place.
const messages = (vue: Jouee) =>
  (conversation(vue).dessous("ol")[0] ?? assert.fail("pas de messages"))
    .children.map((li) => (li.className === "chef" || li.className === "second" ? `${li.children[0]?.children[0]?.textContent}: ${li.children[1]?.textContent}` : `(${li.className}) ${li.textContent}`));
const saisie = (vue: Jouee): Faux => conversation(vue).dessous("textarea")[0] ?? assert.fail("pas de champ");
const envoyer = (vue: Jouee): Faux => conversation(vue).dessous("button").find((pose) => pose.dataset.geste === "envoyer-au-second") ?? assert.fail("pas de « send »");
// Ce que la ligne d'issue dit, sous les messages, et son survol.
const issue = (vue: Jouee) => {
  const lieu = conversation(vue).children.find((pose) => pose.className === "issue-conversation") ?? assert.fail("pas de ligne d'issue");
  return lieu.children.map((pose) => ({ classe: pose.className, dit: pose.children[0]?.textContent ?? pose.textContent, survol: pose.dessous("button").find((aide) => aide.className === "aide")?.ariaLabel ?? "" }));
};
async function taper(vue: Jouee, texte: string): Promise<void> {
  saisie(vue).value = texte;
  saisie(vue).declencher("input");
  await repos();
}

describe("depuis le téléphone, l'onglet Second est la conversation du projet avec son second", () => {
  test("ni terminal ni shell : la conversation lue au pont, dans l'ordre, chaque message nommé — le markdown rendu —, ce qu'on attend du chef en tête, et le champ du message", async () => {
    let vue: Jouee | undefined;
    const fausse = station(() => vue ?? assert.fail());
    vue = await ouvrir(fausse.reponses);
    assert.equal(vue.element("second").hidden, false);
    assert.equal(vue.element("centre").hidden, true, "la conversation prend la place du centre");
    assert.equal(conversation(vue).hidden, false);
    assert.equal(vue.element("tete-du-second").hidden, true, "ni onglets de terminaux ni « + shell »");
    assert.equal(vue.element("fil").hidden, true, "aucun terminal");
    assert.equal(vue.element("note-second").hidden, true, "pas de « the second is opening… »");
    assert.equal(vue.xterms.length, 0);
    assert.deepEqual(vue.dernier("conversation"), [PARADE]);
    assert.deepEqual(messages(vue), ["you: What is waiting for me on parade?", "second: One decision: #12 is green, but the pass does not merge it without the merge grant."]);
    const reponse = conversation(vue).dessous("ol")[0]?.children[1] ?? assert.fail();
    assert.deepEqual(
      reponse.dessous("strong").map((gras) => gras.textContent),
      ["second", "#12"],
      "le markdown du second est rendu",
    );
    const attendu = conversation(vue).children[0] ?? assert.fail();
    assert.equal(attendu.className, "attendu");
    assert.equal(attendu.children[0]?.dessous("button")[0]?.ariaLabel, AIDE);
    assert.match(attendu.textContent, /^Write to parade's second: it answers here\./);
    assert.equal(saisie(vue).placeholder, "a message to parade's second");
    assert.equal(envoyer(vue).textContent, "send");
    assert.equal(envoyer(vue).className, "recommande", "le geste recommandé");
    assert.equal(envoyer(vue).disabled, true, "rien ne part d'un champ vide");
    // Le prix au survol : la réponse du second est sur le quota.
    assert.equal(envoyer(vue).parentElement?.dessous("button").find((aide) => aide.className === "aide")?.ariaLabel, PRIX);
  });

  test("un message tapé part au clic sur « send », nommé — le projet, le texte —, dans la conversation du desktop : il y apparaît, le champ se vide, et le second répond", async () => {
    let vue: Jouee | undefined;
    const fausse = station(() => vue ?? assert.fail());
    vue = await ouvrir(fausse.reponses);
    await taper(vue, "  Merge #12, I grant it for this one.  ");
    assert.equal(envoyer(vue).disabled, false);
    envoyer(vue).click();
    await repos();
    assert.deepEqual(vue.dernier("envoyerAuSecond"), [PARADE, "Merge #12, I grant it for this one."]);
    assert.deepEqual(fausse.recus, [{ projet: PARADE, texte: "Merge #12, I grant it for this one." }], "il est arrivé dans la conversation de parade, celle du desktop");
    assert.deepEqual(messages(vue).slice(2), ["you: Merge #12, I grant it for this one.", `(second repond) ${REPOND}`]);
    assert.equal(saisie(vue).value, "");
    assert.equal(envoyer(vue).disabled, true);
    assert.deepEqual(issue(vue), []);
    fausse.repondre(PARADE, "Merged: **#12** is served.");
    await repos();
    assert.deepEqual(messages(vue).slice(2), ["you: Merge #12, I grant it for this one.", "second: Merged: #12 is served."]);
  });

  test("ce que le chef tape sur le desktop, dans le même second, apparaît aussi sur le téléphone", async () => {
    let vue: Jouee | undefined;
    const fausse = station(() => vue ?? assert.fail());
    vue = await ouvrir(fausse.reponses);
    fausse.ecrireDuDesktop(PARADE, "Also look at #21.");
    await repos();
    assert.equal(messages(vue).at(-1), "you: Also look at #21.");
    // Celle d'un autre projet ne s'écrit pas dans celle-ci.
    vue.dire("surConversation", CANTINE, { messages: [message("chef", "10:07", "Hello cantine")] });
    await repos();
    assert.equal(messages(vue).length, 3);
  });

  test("tant que la station n'a pas répondu, le champ et « send » attendent, et la ligne le dit : rien ne part deux fois", async () => {
    let rendre: (rendu: Conversation) => void = () => {};
    const vue = await ouvrir({ conversation: () => ({ messages: [QUESTION, REPONSE] }), envoyerAuSecond: () => new Promise((resoudre) => (rendre = resoudre)) as never });
    await taper(vue, "Merge #12.");
    envoyer(vue).click();
    await repos();
    assert.deepEqual(issue(vue).map(({ dit }) => dit), [ATTENTE]);
    assert.equal(saisie(vue).disabled, true);
    assert.equal(envoyer(vue).disabled, true);
    envoyer(vue).declencher("click");
    await repos();
    assert.equal(vue.appels.filter(({ geste }) => geste === "envoyerAuSecond").length, 1);
    rendre({ messages: [QUESTION, REPONSE, message("chef", "10:04", "Merge #12.")], repond: true });
    await repos();
    assert.deepEqual(issue(vue), []);
    assert.equal(saisie(vue).disabled, false);
    assert.equal(messages(vue).at(-2), "you: Merge #12.");
  });

  test("une réponse qui arrive pendant que le chef tape ne lui prend rien : le même champ, le même texte", async () => {
    let vue: Jouee | undefined;
    const fausse = station(() => vue ?? assert.fail());
    vue = await ouvrir(fausse.reponses);
    const champ = saisie(vue);
    await taper(vue, "And #21?");
    fausse.repondre(PARADE, "Nothing else waits for you.");
    await repos();
    assert.equal(saisie(vue), champ);
    assert.equal(saisie(vue).value, "And #21?");
    assert.equal(messages(vue).at(-1), "second: Nothing else waits for you.");
  });

  test("chaque projet a son brouillon et sa conversation : passer de l'un à l'autre ne mêle rien", async () => {
    let vue: Jouee | undefined;
    const fausse = station(() => vue ?? assert.fail());
    vue = await ouvrir(fausse.reponses);
    await taper(vue, "For parade");
    (vue.element("projets").children.at(2) ?? assert.fail()).click();
    await repos();
    await toucherSecond(vue);
    assert.deepEqual(vue.dernier("conversation"), [CANTINE]);
    assert.deepEqual(messages(vue), ["(sans) nothing said yet: your message starts the conversation"]);
    assert.equal(saisie(vue).value, "");
    assert.equal(saisie(vue).placeholder, "a message to cantine's second");
    (vue.element("projets").children.at(1) ?? assert.fail()).click();
    await repos();
    await toucherSecond(vue);
    assert.equal(saisie(vue).value, "For parade");
    assert.equal(messages(vue).length, 2);
  });

  test("rechoisir l'onglet Second relit la conversation, ce qui est montré restant en attendant", async () => {
    let vue: Jouee | undefined;
    const fausse = station(() => vue ?? assert.fail());
    vue = await ouvrir(fausse.reponses);
    const lues = () => (vue ?? assert.fail()).appels.filter(({ geste }) => geste === "conversation").length;
    assert.equal(lues(), 1);
    (vue.element("onglets-du-projet").children.find((onglet) => onglet.textContent === "Rail") ?? assert.fail()).click();
    await repos();
    await toucherSecond(vue);
    assert.equal(lues(), 2);
    assert.equal(messages(vue).length, 2);
  });
});

describe("ce qui n'est pas parti, ou ne se lit pas, se dit en une ligne, le détail au survol", () => {
  const LUE = { conversation: () => ({ messages: [QUESTION, REPONSE] }) };
  for (const [cas, envoyerAuSecond, attendu] of [
    ["refusé par la station", () => ({ refus: "not sent: parade's second is not running", detail: "the app on atelier has no second open for parade" }), { dit: "not sent: parade's second is not running", survol: "the app on atelier has no second open for parade" }],
    ["un pont qui lève", () => Promise.reject(new Error("connect ECONNREFUSED 192.168.1.20:7010")), { dit: NON_ENVOYE, survol: "connect ECONNREFUSED 192.168.1.20:7010" }],
    ["un pont qui ne porte pas l'envoi — celui de l'app Android d'aujourd'hui", () => undefined, { dit: NON_ENVOYE, survol: SANS_PONT }],
  ] as const) {
    test(`${cas} : le texte reste dans le champ, la conversation ne bouge pas, et « send » se rejoue`, async () => {
      const vue = await ouvrir({ ...LUE, envoyerAuSecond: envoyerAuSecond as never });
      await taper(vue, "Merge #12.");
      envoyer(vue).click();
      await repos();
      assert.deepEqual(issue(vue), [{ classe: "indisponible refus", ...attendu }]);
      assert.equal(saisie(vue).value, "Merge #12.");
      assert.equal(messages(vue).length, 2);
      assert.equal(envoyer(vue).disabled, false);
      // Le chef retouche son texte : la ligne s'en va.
      await taper(vue, "Merge #12 please.");
      assert.deepEqual(issue(vue), []);
    });
  }

  test("le pont ne porte pas la conversation — celui de l'app Android d'aujourd'hui : « conversation unavailable », pourquoi au survol, pas de champ, et « read again » la relit", async () => {
    let lue: Conversation | undefined;
    const vue = await ouvrir({ conversation: () => lue });
    const ligne = conversation(vue).dessous("li")[0] ?? assert.fail();
    assert.equal(ligne.className, "illisible");
    assert.equal(ligne.children[0]?.children[0]?.textContent, ILLISIBLE);
    assert.equal(ligne.children[0]?.dessous("button")[0]?.ariaLabel, SANS_PONT);
    const champ = conversation(vue).children.find((pose) => pose.className === "message-au-second") ?? assert.fail();
    assert.equal(champ.hidden, true, "rien ne s'envoie à une conversation qui ne se lit pas");
    lue = { messages: [QUESTION] };
    (ligne.dessous("button").find((pose) => pose.textContent === "read again") ?? assert.fail("pas de « read again »")).click();
    await repos();
    assert.deepEqual(messages(vue), ["you: What is waiting for me on parade?"]);
    assert.equal(champ.hidden, false);
  });

  test("la station refuse la lecture : la ligne dit « conversation unavailable », sa phrase et son détail au survol", async () => {
    const vue = await ouvrir({ conversation: () => ({ refus: "the station did not reach your computer", detail: "atelier offline for 12 min" }) });
    const ligne = conversation(vue).dessous("li")[0] ?? assert.fail();
    assert.equal(ligne.children[0]?.children[0]?.textContent, ILLISIBLE);
    assert.equal(ligne.children[0]?.dessous("button")[0]?.ariaLabel, "the station did not reach your computer — atelier offline for 12 min");
  });

  test("une relecture qui échoue garde la conversation lue, et la ligne d'issue le dit", async () => {
    let rendu: Conversation | RefusDeConversation = { messages: [QUESTION, REPONSE] };
    const vue = await ouvrir({ conversation: () => rendu });
    rendu = { refus: "the station did not answer" };
    await toucherSecond(vue);
    assert.equal(messages(vue).length, 2);
    assert.deepEqual(issue(vue), [{ classe: "indisponible refus", dit: ILLISIBLE, survol: "the station did not answer" }]);
  });
});

describe("sur le desktop, rien ne change", () => {
  test("une fenêtre étroite du desktop garde le terminal du second dans son onglet Second : aucune conversation n'y est lue", async () => {
    const second = { id: 1, projet: PARADE, genre: "second" as const, titre: "second · claude", note: "fil repris", arrete: false };
    const vue = await ouvrir({ espace: () => [second] }, { desktop: true });
    assert.equal(vue.element("second").hidden, false);
    assert.equal(conversation(vue).hidden, true);
    assert.equal(vue.element("tete-du-second").hidden, false);
    assert.equal(vue.element("fil").hidden, false);
    assert.equal(vue.xterms.length, 1);
    assert.equal(vue.appels.some(({ geste }) => geste === "conversation"), false);
  });
});
