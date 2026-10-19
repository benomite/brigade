// The correspondence table of the rename: French → English, from
// `docs/glossary.md`. The tool reads nothing else: to change a result, change
// this file and replay (README.md).

// Word sequences of a name (lower case, space-separated) and their English
// words. A name is cut into words (`lireJournalDuProjet` → lire journal du
// projet, `garde-fous-cli` → garde fous cli), every sequence found here is
// replaced, and the name is put back together in its own style. The longest
// sequence wins (`en attente` before `attente`).
export const WORDS: Record<string, string> = {
  // §1 — « cuisine »
  cuisine: "kitchen",
  cuisines: "kitchens",
  cuisiner: "cook",
  // §2 — product terms
  "garde fous": "guardrails",
  "garde fou": "guardrail",
  plafond: "cap",
  plafonds: "caps",
  disjoncteur: "breaker",
  journal: "log",
  journaux: "logs",
  sauvegarde: "backup",
  sauvegardes: "backups",
  sauvegarder: "backup",
  fermeture: "closing",
  fermetures: "closings",
  derive: "drift",
  consomme: "consumed",
  attend: "awaiting",
  "t attend": "awaiting you",
  "en attente": "queued",
  pris: "taken",
  servi: "served",
  servie: "served",
  servis: "served",
  servies: "served",
  bloque: "blocked",
  bloquee: "blocked",
  bloques: "blocked",
  bloquees: "blocked",
  abandonne: "dropped",
  abandonnes: "dropped",
  coince: "stuck",
  coinces: "stuck",
  bail: "lease",
  "tenu par": "taken by",
  fiche: "card",
  fiches: "cards",
  bon: "slip",
  bons: "slips",
  decoupage: "split",
  decoupages: "splits",
  epique: "epic",
  epiques: "epics",
  calibrage: "calibration",
  calibrages: "calibrations",
  tours: "turns",
  jetons: "tokens",
  livraison: "delivery",
  livraisons: "deliveries",
  livrable: "deliverable",
  livrables: "deliverables",
  poste: "workstation",
  postes: "workstations",
  espace: "space",
  brule: "burns",
  "sans progres": "no progress",
  rangement: "cleanup",
  rangements: "cleanups",
  cloison: "partition",
  arbitre: "arbiter",
  arbitres: "arbiters",
  arbitrage: "arbitration",
  porte: "door",
  portes: "doors",
  distante: "remote",
  distantes: "remote",
  "station distante": "remote station",
  "stations distantes": "remote stations",
  connexion: "connection",
  connexions: "connections",
  mesure: "measure",
  mesures: "measures",
  faits: "facts",
  // §3 — box commands and their options
  tirer: "pull",
  annoncer: "announce",
  reclamer: "claim",
  renouveler: "renew",
  restaurer: "restore",
  rejouer: "replay",
  desinstaller: "uninstall",
  revoquer: "revoke",
  prolonger: "extend",
  poids: "weight",
  preuve: "proof",
  serveur: "server",
  serveurs: "servers",
  ecran: "screen",
  ecrans: "screens",
  "tenir porte": "hold door",
  "tenir portes": "hold doors",
  "tenir arbitre": "hold arbiter",
};

// Whole names, for the names the word-by-word translation would leave half
// French: names.ts.
export { NAMES } from "./names.ts";

// Files and folders whose word-by-word name would be wrong, or would land on
// another's: their new name (the last part only), keyed by their path.
export const PATHS: Record<string, string> = {
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
    file: "app/test/page.test.ts",
    from: 'fonction("poserServie")',
    to: 'fonction("renderServed")',
    why: "the test reads the view's source for the function by its name",
  },
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
];
