// Test d'acceptation gelé (#4048). La vue est jouée telle qu'elle est, devant un faux document (helpers/false-vue.ts).
// Le contrat que ce test fixe, parce que le ticket le laisse ouvert : l'appel de la commande `send-word` passe par UN petit
// module, `app/src/vue/word-at-cook/source.js`, qui exporte l'objet `source` — `source.envoyer({ ticket, text })` rend
// `{ ok: true }` ou `{ ok: false, reason }`. La vue l'appelle par l'objet, à chaque usage : le test le remplace par un faux.
// Le champ est un `input` posé sur la carte ; Entrée est un `keydown` de `key: "Enter"` sur lui ; le bouton d'envoi est un
// `button` de la carte dont le texte (ou le nom accessible) dit « send ».
import assert from "node:assert/strict";
import { test } from "node:test";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER, holdFacts } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import { source } from "../../src/vue/word-at-cook/source.js";
import { cardOfTicket, playTheVue, repos, type Fake, type Played } from "../helpers/false-vue.ts";

const A = "2026-11-23T12:04:12.000Z";
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});
const slip = (ticket: number, state: string) => ({ ticket, etat: state, titre: `Ticket ${ticket}`, url: `https://github.com/benomite/brigade/issues/${ticket}`, activite: null });
const FACTS = {
  etat: "ouverte",
  lu: "2026-11-23T12:04:11.000Z",
  dernierTick: "2026-11-23T12:04:11.000Z",
  compteurs: { rail: 0, auTravail: 1, aLaPass: 1, attend: 0, livres24h: 1 },
  dernierEvenement: null,
  rail: [slip(14, "pris"), slip(22, "en pass"), slip(31, "servi")],
  cooks: [],
  attend: [],
};

// Le faux module : il note les appels et répond ce que le test lui a dit.
function fakeModule(answer: { ok: true } | { ok: false; reason: string }) {
  const calls: unknown[] = [];
  Object.assign(source, {
    envoyer: async (entry: unknown) => {
      calls.push(entry);
      return answer;
    },
  });
  return calls;
}

async function open(): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }] } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const receivedOne = holdFacts(() => new Map()).recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FACTS) }] });
  vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}
const card = (vue: Played, number: number): Fake => cardOfTicket(vue, number) ?? assert.fail(`pas de carte #${number}`);
const fields = (c: Fake): Fake[] => c.dessous("input").filter((pose) => !pose.hidden && pose.type !== "checkbox");
const field = (c: Fake): Fake => {
  const found = fields(c);
  assert.equal(found.length, 1, "un seul champ « mot au cook » sur la carte");
  return found[0] as Fake;
};
const sending = (c: Fake): Fake => {
  const found = c.dessous("button").filter((b) => /send/i.test(`${b.textContent} ${b.ariaLabel} ${b.title}`));
  assert.equal(found.length, 1, "un seul bouton d'envoi sur la carte");
  return found[0] as Fake;
};
const visible = (node: Fake): boolean => {
  for (let pose: Fake | null = node; pose !== null; pose = pose.parentElement) if (pose.hidden) return false;
  return true;
};

// #4048, critère 2 : les cartes des tickets en pass ou servis ne montrent pas le champ.
test("cards of tickets in pass or served do not show the field", async () => {
  fakeModule({ ok: true });
  const vue = await open();
  assert.equal(fields(card(vue, 14)).length, 1, "le ticket en cuisine l'a");
  for (const number of [22, 31]) {
    const c = card(vue, number);
    assert.equal(fields(c).length, 0, `#${number} sans champ`);
    assert.equal(c.dessous("button").some((b) => /send/i.test(`${b.textContent} ${b.ariaLabel}`)), false, `#${number} sans bouton d'envoi`);
  }
});
