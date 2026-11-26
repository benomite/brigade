// Test d'acceptation gelé (#4048). La vue est jouée telle qu'elle est, devant un faux document (aides/fausse-vue.ts).
// Le contrat que ce test fixe, parce que le ticket le laisse ouvert : l'appel de la commande `send-word` passe par UN petit
// module, `app/src/vue/mot-au-cook/source.js`, qui exporte l'objet `source` — `source.envoyer({ ticket, text })` rend
// `{ ok: true }` ou `{ ok: false, reason }`. La vue l'appelle par l'objet, à chaque usage : le test le remplace par un faux.
// Le champ est un `input` posé sur la carte ; Entrée est un `keydown` de `key: "Enter"` sur lui ; le bouton d'envoi est un
// `button` de la carte dont le texte (ou le nom accessible) dit « send ».
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { source } from "../../src/vue/mot-au-cook/source.js";
import { carteDuTicket, jouerLaVue, repos, type Faux, type Jouee } from "../aides/fausse-vue.ts";

const A = "2026-11-23T12:04:12.000Z";
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
const bon = (ticket: number, etat: string) => ({ ticket, etat, titre: `Ticket ${ticket}`, url: `https://github.com/benomite/brigade/issues/${ticket}`, activite: null });
const FAITS = {
  etat: "ouverte",
  lu: "2026-11-23T12:04:11.000Z",
  dernierTick: "2026-11-23T12:04:11.000Z",
  compteurs: { rail: 0, auTravail: 1, aLaPass: 1, attend: 0, livres24h: 1 },
  dernierEvenement: null,
  rail: [bon(14, "pris"), bon(22, "en pass"), bon(31, "servi")],
  cooks: [],
  attend: [],
};

// Le faux module : il note les appels et répond ce que le test lui a dit.
function fauxModule(reponse: { ok: true } | { ok: false; reason: string }) {
  const appels: unknown[] = [];
  Object.assign(source, {
    envoyer: async (entree: unknown) => {
      appels.push(entree);
      return reponse;
    },
  });
  return appels;
}

async function ouvrir(): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }] } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const recue = tenirFaits(() => new Map()).recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FAITS) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}
const carte = (vue: Jouee, numero: number): Faux => carteDuTicket(vue, numero) ?? assert.fail(`pas de carte #${numero}`);
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

// #4048, critère 1 : la carte d'un ticket en cuisine montre un champ d'une ligne et son bouton d'envoi.
test("the card of a cooking ticket shows a one-line word-to-the-cook field with a send button", async () => {
  fauxModule({ ok: true });
  const vue = await ouvrir();
  const c = carte(vue, 14);
  const pose = champ(c);
  assert.ok(pose.type === "" || pose.type === "text", "une ligne de texte");
  assert.equal(c.dessous("textarea").length, 0, "pas de zone de texte multiligne");
  assert.equal(visible(pose), true);
  assert.equal(visible(envoi(c)), true);
});
