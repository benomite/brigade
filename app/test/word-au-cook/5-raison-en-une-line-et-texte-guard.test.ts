// Test d'acceptation gelé (#4048). La vue est jouée telle qu'elle est, devant un faux document (aides/fausse-vue.ts).
// Le contrat que ce test fixe, parce que le ticket le laisse ouvert : l'appel de la commande `send-word` passe par UN petit
// module, `app/src/vue/word-au-cook/source.js`, qui exporte l'objet `source` — `source.envoyer({ ticket, text })` rend
// `{ ok: true }` ou `{ ok: false, reason }`. La vue l'appelle par l'objet, à chaque usage : le test le remplace par un faux.
// Le champ est un `input` posé sur la carte ; Entrée est un `keydown` de `key: "Enter"` sur lui ; le bouton d'envoi est un
// `button` de la carte dont le texte (ou le nom accessible) dit « send ».
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBar } from "../../src/bar.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNIERE, holdFacts } from "../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projects/projects.ts";
import { source } from "../../src/vue/word-au-cook/source.js";
import { cardDuTicket, jouerLaVue, repos, type Faux, type Jouee } from "../aides/fausse-vue.ts";

const A = "2026-11-23T12:04:12.000Z";
const demarrage = () => ({
  configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
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
function fauxModule(answer: { ok: true } | { ok: false; reason: string }) {
  const calls: unknown[] = [];
  Object.assign(source, {
    envoyer: async (entree: unknown) => {
      calls.push(entree);
      return answer;
    },
  });
  return calls;
}

async function ouvrir(): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }] } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const recue = holdFacts(() => new Map()).recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FACTS) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}
const card = (vue: Jouee, numero: number): Faux => cardDuTicket(vue, numero) ?? assert.fail(`pas de carte #${numero}`);
const champs = (c: Faux): Faux[] => c.dessous("input").filter((pose) => !pose.hidden && pose.type !== "checkbox");
const champ = (c: Faux): Faux => {
  const trouves = champs(c);
  assert.equal(trouves.length, 1, "un seul champ « mot au cook » sur la carte");
  return trouves[0] as Faux;
};
const envoi = (c: Faux): Faux => {
  const trouves = c.dessous("button").filter((b) => /send/i.test(`${b.textContent} ${b.ariaLabel} ${b.title}`));
  assert.equal(trouves.length, 1, "un seul bouton d'envoi sur la carte");
  return trouves[0] as Faux;
};
const visible = (noeud: Faux): boolean => {
  for (let pose: Faux | null = noeud; pose !== null; pose = pose.parentElement) if (pose.hidden) return false;
  return true;
};

// #4048, critère 5 : après `{ok: false, reason}`, la raison est dite en une ligne et le champ garde son texte.
test("after the answer {ok: false, reason}, the app shows the one-line reason and the field keeps the text", async () => {
  const REASON = "the cook is not listening";
  const calls = fauxModule({ ok: false, reason: REASON });
  const vue = await ouvrir();
  champ(card(vue, 14)).value = "  keep me, as typed ";
  envoi(card(vue, 14)).click();
  await repos();
  assert.equal(calls.length, 1);
  assert.equal(champ(card(vue, 14)).value, "  keep me, as typed ");
  const poses = [...card(vue, 14).descendants()].filter((n) => visible(n) && n.children.length === 0 && n.textContent.includes(REASON));
  assert.equal(poses.length, 1, "la raison est montrée une fois sur la carte");
  assert.equal(poses[0]?.textContent.trim(), REASON, "seule, sur une ligne");
});
