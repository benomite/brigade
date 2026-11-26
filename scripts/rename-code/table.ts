// The correspondence table of the rename: French → English. The tool reads
// nothing else: to change a result, change this file or `mapping.json` and
// replay (README.md).

import { readFileSync } from "node:fs";
import { join } from "node:path";

// The French → English mapping of words, `mapping.json` — the one source that
// the rename applies, that the naming gate (`gate.ts`) checks, and that the
// tables of `docs/naming-rule.md` and README.md print. Two parts, both applied:
// `glossary`, the words of `docs/glossary.md`, and `code`, the recurring
// French words of the file names of runtime/src and app/src.
export const MAPPING_FILE = join(import.meta.dirname, "mapping.json");

export type Mapping = { glossary: Record<string, string>; code: Record<string, string> };

// The mapping, read and checked: a file that is missing or malformed throws,
// naming the file — never an empty table, which would rename nothing and let
// every French name through the gate.
export function readMapping(file: string = MAPPING_FILE): Mapping {
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`cannot read the French → English mapping ${file}: ${(error as Error).message}`);
  }
  const part = (name: string): Record<string, string> => {
    const value = (data as Record<string, unknown> | null)?.[name];
    if (typeof value !== "object" || value === null || Object.values(value).some((english) => typeof english !== "string"))
      throw new Error(`the French → English mapping ${file} has no \`${name}\` object of strings`);
    return value as Record<string, string>;
  };
  return { glossary: part("glossary"), code: part("code") };
}

// Word sequences of a name (lower case, space-separated, no accents) and their
// English words. A name is cut into words (`lireJournalDuProjet` → lire journal
// du projet, `garde-fous-cli` → garde fous cli), every sequence found here is
// replaced, and the name is put back together in its own style. The longest
// sequence wins (`en attente` before `attente`).
const mapping = readMapping();
export const WORDS: Record<string, string> = { ...mapping.glossary, ...mapping.code };

// Whole names, for the names the word-by-word translation would leave half
// French: names.ts.
export { NAMES } from "./names.ts";

// Files and folders whose word-by-word name would be wrong, or would land on
// another's: their new name (the last part only), keyed by their path.
export const PATHS: Record<string, string> = {
  // The project menu's Know-how tab (#4241), beside Settings' know-how section (`vue/know-how`).
  "app/src/vue/savoir-faire": "know-how-tab",
  "app/test/vue/savoir-faire": "know-how-tab",
  // Components named in PascalCase, which the word-by-word translation does not cut.
  "app/src/vue/accueil/projets/BlocDesProjets.js": "ProjectsBlock.js",
  "app/src/vue/moteur/MoteurDeLaCarte.js": "CardEngine.js",
  "app/src/vue/moteur/SectionDuMoteur.js": "EngineSection.js",
  "app/src/vue/projet/bandeau-sante/PlafondsDuree.js": "DurationCaps.js",
  "app/src/vue/projet/bandeau-sante/TempsDeLaPasse.js": "PassTime.js",
  "app/src/vue/projet/stations/AjoutStation.js": "AddStation.js",
  "app/src/vue/projet/stations/ArretStation.js": "StopStation.js",
  "app/src/vue/projet/stations/ReglagesStation.js": "StationSettings.js",
  "app/src/vue/station/page/NiveauReglage.js": "SettingLevel.js",
  "app/src/vue/station/page/ProjetsDeLaStation.js": "StationProjects.js",
  "app/src/gestes-fiche.ts": "card-actions.ts",
  "app/test/gestes-fiche.test.ts": "card-actions.test.ts",
  "app/test/ecrans-restants.test.ts": "remaining-screens.test.ts",
  "runtime/src/bilan-epique.ts": "epic-summary.ts",
  "runtime/test/bilan-epique.test.ts": "epic-summary.test.ts",
  "runtime/src/desinstaller-sous-le-compte.ts": "uninstall-as-the-account.ts",
  "runtime/src/journal-pas-rejoue.ts": "log-not-replayed.ts",
  "runtime/test/journal-pas-rejoue.test.ts": "log-not-replayed.test.ts",
  "runtime/src/montrer-cloison.ts": "show-partition.ts",
  "runtime/test/montrer-cloison.test.ts": "show-partition.test.ts",
  "runtime/src/montrer-mesures.ts": "show-measures.ts",
  "runtime/test/aides/connexion-refusee.ts": "refused-connection.ts",
  "runtime/test/aides/test-bloque.ts": "hanging-test.ts",
  "runtime/test/test-bloque.test.ts": "hanging-test.test.ts",
  "runtime/test/aides/tient-journal.ts": "holds-log.ts",
  "runtime/test/capacites-en-cuisine.test.ts": "capabilities-in-kitchen.test.ts",
  "runtime/test/secrets-en-cuisine.test.ts": "secrets-in-kitchen.test.ts",
  "runtime/test/jeton-en-cloison.test.ts": "token-in-partition.test.ts",
  "runtime/test/station/cuisine-jeton.test.ts": "kitchen-token.test.ts",
  "runtime/test/mesures-derive-motif.test.ts": "measures-drift-reason.test.ts",
  "runtime/test/mesures-des-gates.test.ts": "gates-measures.test.ts",
  "runtime/test/mesures-perdu.test.ts": "measures-lost.test.ts",
};


// Names that keep their French word, on purpose. Each list says why.
export const KEPT_NAMES: { why: string; names: string[] }[] = [];
export const KEPT_MEMBERS: { why: string; names: string[] }[] = [
  {
    why: "Linked by assignment — not by reference — to a member that keeps its name (a literal built in a `.map`, a value passed where a format's type is expected): the language service does not follow an assignment, renaming one side would leave the other. Found by the type check of the renamed tree.",
    names: ["ecran", "ecrans", "mesure", "distante", "plafond", "plafonds", "plafondMs", "poids", "nonArbitres", "calibrage", "connexionS", "serveur", "faits", "fiche"],
  },
  {
    why: "Read back from data the code does not type at the reading (a parsed document, a record keyed by project or by port name, the box's output): the tests that compare what is read with what is expected find the old name. Found by the test suites of the renamed tree.",
    names: ["dureeBailMs", "connexionMax", "espace", "seuilDisjoncteur", "sauvegardes", "porte", "servis", "enAttente", "serviLe", "livraison"],
  },
];
export const KEPT_FILES: { why: string; paths: string[] }[] = [
  {
    why: "Named by a systemd unit that the box copies into /etc/systemd/system (runtime/deploy/*.service): a box that updates its clone keeps its copy, which would name a file that no longer exists. They are renamed with their units, in a delivery that also moves the copies.",
    paths: ["runtime/src/sauvegarder.ts", "runtime/src/tenir-porte.ts", "runtime/src/tenir-arbitre.ts"],
  },
];

// Text edits the references cannot carry, applied last, on the renamed tree
// (`file` is the new path). Each `from` must be found `count` times (once by
// default): a test that names a function or a file in text, a list whose
// sorted order the rename changes.
export const FIXUPS: { file: string; from: string; to: string; why: string; count?: number }[] = [
  {
    file: "runtime/test/log-not-replayed.test.ts",
    from: '"garde-fous-cli"',
    to: '"guardrails-cli"',
    why: "the test names the command file without its extension",
    count: 2,
  },
  {
    file: "runtime/test/echeance-de-session.test.ts",
    from: '["bac-a-sable/configuration.ts", "partition.ts", "identifiants.ts"]',
    to: '["bac-a-sable/configuration.ts", "identifiants.ts", "partition.ts"]',
    why: "a sorted list of files: `cloison.ts` → `partition.ts` moves in the order",
  },
  {
    file: "runtime/test/echeance-de-session.test.ts",
    from: "cloison\\.identifiants\\)",
    to: "partition\\.identifiants\\)",
    why: "the test reads `eprouver.ts`'s source, whose parameter `cloison` is now `partition`",
  },
];
