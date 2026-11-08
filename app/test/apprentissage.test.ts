// Ce que les cooks ont appris au projet (#1058, épique 1034) : la lecture du champ
// `apprentissage` de `facts`, la section telle que le module la pose — les leçons avec leur statut, leur date,
// leurs tickets et leurs cooks, le lien d'une promue vers sa ligne du carnet ; les profils avec leur
// domaine, leur carnet et leurs tickets ; une phrase, et aucune liste, quand il n'y a rien. La vue ne le pose plus (#2921, la page Cooks est supprimée). L'apprentissage
// est écrit dans la forme même du runtime (`Apprentissage`) : l'app lit ce que la box écrit.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Apprentissage as ApprentissageDuRuntime } from "../../runtime/src/apprentissage/projet.ts";
import { apprentissageDe, apprentissageLu, type Apprentissage } from "../src/apprentissage.ts";
import { comprendre, tableau } from "../src/faits.ts";

const A = "2026-10-19T10:00:00.000Z";
const LIGNE = "https://github.com/chef/parade/blob/main/.claude/brigade/carnet.md#L5";

// Une leçon provisoire, une promue avec l'adresse de sa ligne, une promue sans (la box ne connaît pas le
// dépôt), et deux profils — dans la forme que `facts` écrit (runtime/src/apprentissage/projet.ts). Le
// `progres` de chacun (#1057) : la part livrée du premier coup et les essais moyens, avant et après son entrée.
const PROGRES = { avant: { retenus: 10, premiers: 6, premierCoup: 0.6, essaisMoyens: 1.5 }, apres: { retenus: 4, premiers: 3, premierCoup: 0.75, essaisMoyens: 1.25 } };
const GARNI: ApprentissageDuRuntime = {
  lecons: [
    { id: "L4", texte: "run the app tests before touching the view", statut: "provisoire", date: "2026-10-17", tickets: [29, 33], origine: { kind: "retro" }, cooks: 3, progres: PROGRES },
    { id: "L-001", texte: "read CLAUDE.md first", statut: "promue", date: "2026-10-01", tickets: [12, 15], origine: { kind: "pass-send-back", ticket: 12 }, cooks: 14, url: LIGNE, progres: PROGRES },
    { id: "L-002", texte: "a test waits for a fact", statut: "promue", date: "2026-10-08", tickets: [18], origine: { kind: "chef-correction", ticket: 18 }, cooks: 1, progres: PROGRES },
  ],
  profils: [
    {
      nom: "app-src-vue",
      domaine: "app/src/vue",
      skills: ["agents/cook-design.md"],
      perimetre: ["app/src/vue"],
      carnet: [
        { id: "L-001", texte: "keep the view thin", etat: "promoted", origine: { kind: "retro" } },
        { id: "L-002", texte: "every gesture is a button", etat: "retired", origine: { kind: "chef-correction", ticket: 29 } },
      ],
      tickets: [29, 36],
      progres: PROGRES,
    },
    { nom: "runtime-src-correctif", domaine: "runtime/src/correctif", skills: [], perimetre: ["runtime/src/correctif"], carnet: [], tickets: [], progres: { avant: null, apres: null } },
  ],
};
// Ce que l'app en lit : la même chose, moins l'origine des leçons d'un carnet de profil, qu'elle ne lit pas.
const sansOrigine = <T extends { origine: unknown }>({ origine: _origine, ...reste }: T) => reste;
const LU = { lecons: GARNI.lecons, profils: GARNI.profils.map((profil) => ({ ...profil, carnet: profil.carnet.map(sansOrigine) })) };

const FAITS = { etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [] };
const lus = (apprentissage: unknown) => comprendre(JSON.stringify({ ...FAITS, apprentissage }));
const section = (apprentissage: ApprentissageDuRuntime): Apprentissage => apprentissageDe(apprentissageLu(JSON.parse(JSON.stringify(apprentissage))));

describe("le champ `apprentissage` de `facts`", () => {
  test("se lit tel que le runtime l'écrit", () => {
    const faits = lus(GARNI);
    assert.ok(!("informe" in faits), JSON.stringify(faits));
    assert.deepEqual(faits.apprentissage, LU);
  });

  test("absent — ni leçon ni profil, ou un runtime d'avant ce champ —, le tableau porte deux listes vides", () => {
    const faits = comprendre(JSON.stringify(FAITS));
    assert.ok(!("informe" in faits));
    assert.equal("apprentissage" in faits, false);
    assert.deepEqual(tableau(faits).apprentissage, { lecons: [], profils: [] });
  });

  test("une forme qui n'est pas la sienne refuse les faits, et dit quel champ", () => {
    const [provisoire] = GARNI.lecons;
    assert.deepEqual(lus({ ...GARNI, lecons: [{ ...provisoire, statut: "retiree" }] }), { informe: "apprentissage.lecons[0].statut: expected provisoire or promue" });
    assert.deepEqual(lus({ ...GARNI, lecons: [{ ...provisoire, date: "hier" }] }), { informe: "apprentissage.lecons[0].date: expected a date (YYYY-MM-DD)" });
    assert.deepEqual(lus({ ...GARNI, lecons: [{ ...provisoire, cooks: -1 }] }), { informe: "apprentissage.lecons[0].cooks: expected a non-negative integer" });
    assert.deepEqual(lus({ ...GARNI, profils: [{ ...GARNI.profils[0], tickets: "29" }] }), { informe: "apprentissage.profils[0].tickets: expected a list" });
    assert.deepEqual(lus({ lecons: [] }), { informe: "apprentissage.profils: expected a list" });
  });

  test("la section : l'adresse d'une promue ne passe pas à la vue — seulement si sa ligne s'ouvre ; une provisoire n'a pas de lien", () => {
    const { lecons, profils } = section(GARNI);
    const [provisoire, ouvrable, sansAdresse] = lecons;
    assert.deepEqual(provisoire, { id: "L4", texte: "run the app tests before touching the view", statut: "provisoire", date: "2026-10-17", tickets: [29, 33], origine: { kind: "retro" }, cooks: 3, progres: PROGRES });
    assert.deepEqual(ouvrable?.lien, { ouvrable: true });
    assert.deepEqual(sansAdresse?.lien, { ouvrable: false });
    assert.equal(JSON.stringify(lecons).includes("https://"), false);
    assert.deepEqual(profils, LU.profils);
  });
});
