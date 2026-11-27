// Ce que les cooks ont appris au projet (#1058, épique 1034) : la lecture du champ
// `apprentissage` de `facts`, la section telle que le module la pose — les leçons avec leur statut, leur date,
// leurs tickets et leurs cooks, le lien d'une promue vers sa ligne du carnet ; les profils avec leur
// domaine, leur carnet et leurs tickets ; une phrase, et aucune liste, quand il n'y a rien. La vue ne le pose plus (#2921, la page Cooks est supprimée). L'apprentissage
// est écrit dans la forme même du runtime (`Apprentissage`) : l'app lit ce que la box écrit.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { learningOf, learningRead, type Learning } from "../src/learning.ts";
import { understand, board } from "../src/facts.ts";

// The box's `apprentissage` field, as the runtime wrote it (its module is gone, #4683): the shape this test pins.
type Delivery = { retenus: number; premiers: number; premierCoup: number; essaisMoyens: number };
type Progress = { avant: Delivery | null; apres: Delivery | null };
type Origin = { kind: "retro" } | { kind: "pass-send-back"; ticket: number } | { kind: "chef-correction"; ticket: number };
type LearningOfRuntime = {
  lecons: Array<{ id: string; texte: string; statut: "provisoire" | "promue"; date: string; tickets: number[]; origine: Origin; cooks: number; progres: Progress; url?: string }>;
  profils: Array<{ nom: string; domaine: string; skills: string[]; perimetre: string[]; carnet: Array<{ id: string; texte: string; etat: string; origine: Origin }>; tickets: number[]; progres: Progress }>;
};

const A = "2026-10-19T10:00:00.000Z";
const LINE = "https://github.com/chef/parade/blob/main/.claude/brigade/carnet.md#L5";

// Une leçon provisoire, une promue avec l'adresse de sa ligne, une promue sans (la box ne connaît pas le
// dépôt), et deux profils — dans la forme que `facts` écrit (runtime/src/apprentissage/projet.ts). Le
// `progres` de chacun (#1057) : la part livrée du premier coup et les essais moyens, avant et après son entrée.
const PROGRESS = { avant: { retenus: 10, premiers: 6, premierCoup: 0.6, essaisMoyens: 1.5 }, apres: { retenus: 4, premiers: 3, premierCoup: 0.75, essaisMoyens: 1.25 } };
const FILLED: LearningOfRuntime = {
  lecons: [
    { id: "L4", texte: "run the app tests before touching the view", statut: "provisoire", date: "2026-10-17", tickets: [29, 33], origine: { kind: "retro" }, cooks: 3, progres: PROGRESS },
    { id: "L-001", texte: "read CLAUDE.md first", statut: "promue", date: "2026-10-01", tickets: [12, 15], origine: { kind: "pass-send-back", ticket: 12 }, cooks: 14, url: LINE, progres: PROGRESS },
    { id: "L-002", texte: "a test waits for a fact", statut: "promue", date: "2026-10-08", tickets: [18], origine: { kind: "chef-correction", ticket: 18 }, cooks: 1, progres: PROGRESS },
  ],
  profils: [
    {
      nom: "app-src-vue",
      domaine: "app/src/vue",
      skills: [],
      perimetre: ["app/src/vue"],
      carnet: [
        { id: "L-001", texte: "keep the view thin", etat: "promoted", origine: { kind: "retro" } },
        { id: "L-002", texte: "every gesture is a button", etat: "retired", origine: { kind: "chef-correction", ticket: 29 } },
      ],
      tickets: [29, 36],
      progres: PROGRESS,
    },
    { nom: "runtime-src-correctif", domaine: "runtime/src/correctif", skills: [], perimetre: ["runtime/src/correctif"], carnet: [], tickets: [], progres: { avant: null, apres: null } },
  ],
};
// Ce que l'app en lit : la même chose, moins l'origine des leçons d'un carnet de profil, qu'elle ne lit pas.
const withoutOrigin = <T extends { origine: unknown }>({ origine: _origin, ...remains }: T) => remains;
const READ = { lecons: FILLED.lecons, profils: FILLED.profils.map((profile) => ({ ...profile, carnet: profile.carnet.map(withoutOrigin) })) };

const FACTS = { etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [] };
const readOnes = (learning: unknown) => understand(JSON.stringify({ ...FACTS, apprentissage: learning }));
const section = (learning: LearningOfRuntime): Learning => learningOf(learningRead(JSON.parse(JSON.stringify(learning))));

describe("le champ `apprentissage` de `facts`", () => {
  test("se lit tel que le runtime l'écrit", () => {
    const facts = readOnes(FILLED);
    assert.ok(!("informe" in facts), JSON.stringify(facts));
    assert.deepEqual(facts.apprentissage, READ);
  });

  test("absent — ni leçon ni profil, ou un runtime d'avant ce champ —, le tableau porte deux listes vides", () => {
    const facts = understand(JSON.stringify(FACTS));
    assert.ok(!("informe" in facts));
    assert.equal("apprentissage" in facts, false);
    assert.deepEqual(board(facts).apprentissage, { lecons: [], profils: [] });
  });

  test("une forme qui n'est pas la sienne refuse les faits, et dit quel champ", () => {
    const [temporary] = FILLED.lecons;
    assert.deepEqual(readOnes({ ...FILLED, lecons: [{ ...temporary, statut: "retiree" }] }), { informe: "apprentissage.lecons[0].statut: expected provisoire or promue" });
    assert.deepEqual(readOnes({ ...FILLED, lecons: [{ ...temporary, date: "hier" }] }), { informe: "apprentissage.lecons[0].date: expected a date (YYYY-MM-DD)" });
    assert.deepEqual(readOnes({ ...FILLED, lecons: [{ ...temporary, cooks: -1 }] }), { informe: "apprentissage.lecons[0].cooks: expected a non-negative integer" });
    assert.deepEqual(readOnes({ ...FILLED, profils: [{ ...FILLED.profils[0], tickets: "29" }] }), { informe: "apprentissage.profils[0].tickets: expected a list" });
    assert.deepEqual(readOnes({ lecons: [] }), { informe: "apprentissage.profils: expected a list" });
  });

  test("la section : l'adresse d'une promue ne passe pas à la vue — seulement si sa ligne s'ouvre ; une provisoire n'a pas de lien", () => {
    const { lecons: lessons, profils } = section(FILLED);
    const [temporary, openable, withoutAddress] = lessons;
    assert.deepEqual(temporary, { id: "L4", texte: "run the app tests before touching the view", statut: "provisoire", date: "2026-10-17", tickets: [29, 33], origine: { kind: "retro" }, cooks: 3, progres: PROGRESS });
    assert.deepEqual(openable?.lien, { ouvrable: true });
    assert.deepEqual(withoutAddress?.lien, { ouvrable: false });
    assert.equal(JSON.stringify(lessons).includes("https://"), false);
    assert.deepEqual(profils, READ.profils);
  });
});
