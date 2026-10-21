// La rétro d'un ticket sur sa fiche (#1038) : la vue jouée, la fiche d'un ticket servi ouverte par sa
// carte. Avec une rétro, ses leçons — chacune marquée provisoire, son sens au survol, son id et son
// texte — puis ce que son cook a écrit ; sans, une phrase à la place, jamais une section vide ni cassée.
// L'histoire est écrite dans la forme même du runtime (`HistoireDuTicket`) : l'app lit ce que la box écrit.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { HistoireDuTicket, RetroDuTicket } from "../../runtime/src/histoire-ticket.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { BOUTONS } from "../src/boutons.ts";
import { EXEMPLE, type Projet } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE, type Dessinable } from "../src/faits.ts";
import { entete } from "../src/fiche.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { gestesDeCarte } from "../src/gestes-fiche.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { histoireDe } from "../src/histoire.ts";
import { GESTES_DU_MANAGER } from "../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import type { Terminal } from "../src/terminaux.ts";
import { DIT_PROVISOIRE, PROVISOIRE } from "../src/vue/apprentissage.js";
import { type Faux, jouerLaVue, repos } from "./aides/fausse-vue.ts";

const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", box: { hote: "box" } };
const A = "2026-10-16T10:00:00.000Z";
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };

const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE], hotes: ["box"] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

// #12, servi et mergé : rien ne l'attend.
const carte = { ticket: 12, etat: "servi", ton: "vert", titre: "Validation SIRET", fiche: entete({ titre: "Validation SIRET" }), ouvrable: true, attendu: false, pr: true, attend: [], dit: [] };
const faits = (demande: number): Dessinable =>
  ({
    projet: "parade",
    demande,
    a: A,
    tableau: {
      etat: "ouverte",
      ton: "vert",
      arretee: false,
      tick: "dernier tick il y a 12 s",
      compteurs: [{ libelle: "rail", nombre: 1 }],
      cooks: { enCours: [], vide: "aucun cook en cours" },
      evenement: "rien",
      rail: { colonnes: [{ nom: "T'attend", ton: "vert", compte: "1", cartes: [carte], vide: "aucun ticket" }], hors: [], attendLu: A },
    },
  }) as unknown as Dessinable;

const HISTOIRE: Omit<HistoireDuTicket, "retro"> = {
  ticket: 12,
  steps: [
    { kind: "arrived", at: "2026-10-14T08:00:00.000Z" },
    { kind: "delivered", at: "2026-10-14T09:10:00.000Z", run: "r1" },
    { kind: "merged", at: "2026-10-14T10:30:00.000Z", by: "pass" },
  ],
  cost: { attempts: 1, tokens: 48210, durationMs: 722000, incomplete: false },
};
const TEXTE = "reconfirm L4\npropose Relire la fiche avant d'écrire.\npropose Un test attend un fait, jamais une durée.";
const RETRO: RetroDuTicket = {
  at: "2026-10-14T10:30:00.000Z",
  text: TEXTE,
  lessons: [
    { kind: "reconfirm", id: "L4", text: "Lancer les tests avant de commiter." },
    { kind: "propose", id: "L9", text: "Relire la fiche avant d'écrire." },
    { kind: "propose", id: "L10", text: "Un test attend un fait, jamais une durée." },
  ],
};

// La fiche de #12 ouverte d'un clic sur sa carte, la box rendant cette rétro — `undefined` : une box
// d'avant la rétro sur la fiche, qui n'écrit pas le champ ; rend sa section « retro ».
async function retroSurLaFiche(retro: RetroDuTicket | null | undefined): Promise<Faux | undefined> {
  const histoire: Partial<HistoireDuTicket> = retro === undefined ? HISTOIRE : { ...HISTOIRE, retro };
  const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], gestesDeFiche: (lue) => gestesDeCarte(lue), lireHistoire: () => histoireDe(JSON.stringify(histoire)) });
  (vue.element("projets").children[1] ?? assert.fail("pas de case")).click();
  await repos();
  vue.dire("surFaits", faits(vue.dernier("faits")[0] as number));
  (vue.element("rail").dessous("li").find(({ className }) => className === "bon") ?? assert.fail("pas de carte sur le rail")).click();
  await repos();
  const fiche = vue.element("fiche");
  assert.equal(fiche.hidden, false);
  return fiche.dessous("section").find(({ className }) => className === "retro");
}

const lecons = (section: Faux) => section.dessous("li");

describe("la rétro sur la fiche d'un ticket", () => {
  test("un ticket servi avec sa rétro : chaque leçon marquée provisoire, son id, son texte — puis ce que le cook a écrit", async () => {
    const section = (await retroSurLaFiche(RETRO)) ?? assert.fail("pas de section retro sur la fiche");
    assert.equal(section.ariaLabel, "the retro of #12");
    const lignes = lecons(section);
    assert.equal(lignes.length, 3);
    for (const [rang, ligne] of lignes.entries()) {
      const lecon = RETRO.lessons[rang] ?? assert.fail("leçon attendue");
      const statut = ligne.dessous("span").find(({ className }) => className === "statut") ?? assert.fail("pas de pastille");
      assert.equal(statut.textContent, PROVISOIRE);
      // Son sens se lit au survol de la pastille.
      assert.equal(statut.ariaLabel, DIT_PROVISOIRE);
      assert.equal(ligne.dessous("code")[0]?.textContent, lecon.id);
      assert.ok(ligne.textContent.includes(lecon.text ?? ""), ligne.textContent);
    }
    // La leçon reconfirmée le dit ; les nouvelles, non.
    assert.deepEqual(lignes.map((ligne) => ligne.textContent.endsWith("reconfirmed")), [true, false, false]);
    assert.equal(section.dessous("pre")[0]?.textContent, TEXTE);
  });

  test("une rétro de plus de trois leçons n'en montre que trois", async () => {
    const lessons = [1, 2, 3, 4, 5].map((n) => ({ kind: "propose" as const, id: `L${n}`, text: `leçon ${n}` }));
    const section = (await retroSurLaFiche({ at: A, text: "…", lessons })) ?? assert.fail("pas de section retro");
    assert.deepEqual(lecons(section).map((ligne) => ligne.dessous("code")[0]?.textContent), ["L1", "L2", "L3"]);
  });

  test("un ticket sans rétro : une phrase le dit, ni liste vide ni ligne en échec", async () => {
    const section = (await retroSurLaFiche(null)) ?? assert.fail("pas de section retro sur la fiche");
    assert.deepEqual(section.children.map(({ balise, textContent }) => `${balise}: ${textContent}`), ["h4: retro", "p: no retro yet: a ticket gets one when it is served"]);
    assert.equal(section.children[1]?.className, "sans");
  });

  test("servi sans que son cook écrive de rétro : une phrase le dit", async () => {
    const section = (await retroSurLaFiche({ at: A, text: null, lessons: [] })) ?? assert.fail("pas de section retro sur la fiche");
    assert.deepEqual(section.children.map(({ textContent }) => textContent), ["retro", "served, but its cook wrote no retro"]);
  });

  test("une box d'avant la rétro sur la fiche : une ligne courte, le pourquoi au survol", async () => {
    const section = (await retroSurLaFiche(undefined)) ?? assert.fail("pas de section retro sur la fiche");
    const ligne = section.children[1] ?? assert.fail("rien sous le titre");
    assert.equal(ligne.className, "indisponible");
    assert.equal(ligne.children[0]?.textContent, "retro unavailable");
  });
});
