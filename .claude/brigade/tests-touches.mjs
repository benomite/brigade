// Les tests que touche un changement (#1004) : les gates ne jouent que ceux-là.
// Usage : <fichiers modifiés, un par ligne> | node tests-touches.mjs   (chemins relatifs à la racine)
// Sort, par zone à suite de tests, une ligne `<zone> tout`, `<zone> rien` ou
// `<zone> fichiers <test>...` (chemins relatifs à la zone).
//
// Un test est touché quand un fichier modifié est dans sa fermeture : ce qu'il
// importe, ce qu'il nomme (un `src/main.ts` qu'il lance, un `docs/…` qu'il lit),
// et de proche en proche ce que ses helpers importent ou nomment — sans entrer
// dans le code du produit : ce qu'un module du produit importe à son tour n'est
// pas suivi. Ce qui casse de loin se voit sur la base, où tout se joue. Un fichier
// modifié qui n'est ni du code ni un test (une page de doc, un script, un
// manifest) touche les fichiers qui citent son nom.
// `--proches` (les gates d'une station) : seuls les tests que le changement
// modifie, et ceux qui portent le nom d'un fichier modifié (`src/rail.ts` →
// `test/rail.test.ts`) — quelques secondes, sur la machine qui cuisine. La CI
// joue la fermeture entière sur la PR, et tout sur la base.
// Tout jouer quand le doute est permis : aucun fichier modifié (la base
// elle-même), un fichier qui règle toute une suite (package.json, tsconfig, le
// setup), ou une erreur ici — les gates jouent alors la suite entière.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, normalize, relative } from "node:path";

const ZONES = ["runtime", "app"];
const CODE = /\.(ts|mts|js|mjs|cjs)$/;
const IGNORES = new Set(["node_modules", ".git", ".brigade-state", "construit", "dist"]);
// Ce qui règle une suite entière : un changement ici rejoue tout.
const GLOBAUX = [/^(runtime|app)\/package(-lock)?\.json$/, /^(runtime|app)\/tsconfig[^/]*\.json$/, /^\.claude\/brigade\/worktree-setup\.sh$/, /^package(-lock)?\.json$/];

const modifies = readFileSync(0, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
if (modifies.length === 0 || modifies.some((f) => GLOBAUX.some((g) => g.test(f)))) {
  for (const zone of ZONES) console.log(`${zone} tout`);
  process.exit(0);
}
if (process.argv.includes("--proches")) {
  for (const zone of ZONES) {
    const noms = new Set(modifies.filter((m) => m.startsWith(`${zone}/`) && CODE.test(m)).map((m) => basename(m).replace(/(\.test)?\.[^.]+$/, "")));
    const proches = lister(join(zone, "test")).filter((t) => t.endsWith(".test.ts") && (modifies.includes(t) || noms.has(basename(t, ".test.ts"))));
    console.log(proches.length === 0 ? `${zone} rien` : `${zone} fichiers ${proches.map((t) => relative(zone, t)).join(" ")}`);
  }
  process.exit(0);
}

function lister(dossier, vus = []) {
  let noms;
  try {
    noms = readdirSync(dossier);
  } catch {
    return vus;
  }
  for (const nom of noms) {
    if (IGNORES.has(nom)) continue;
    const chemin = join(dossier, nom);
    const st = statSync(chemin, { throwIfNoEntry: false });
    if (st?.isDirectory()) lister(chemin, vus);
    else if (st?.isFile() && CODE.test(nom)) vus.push(normalize(chemin));
  }
  return vus;
}

// Le code des deux zones : un test de l'une lit souvent l'autre.
const fichiers = ZONES.flatMap((zone) => lister(zone));
const connus = new Set(fichiers);
const parNom = new Map();
for (const f of fichiers) {
  const n = basename(f);
  parNom.set(n, [...(parNom.get(n) ?? []), f]);
}
const textes = new Map(fichiers.map((f) => [f, readFileSync(f, "utf8")]));

// Les arêtes d'un fichier : ses imports relatifs résolus, et, pour un test, tout
// nom de fichier de code qu'il cite (un chemin qu'il lance ou lit) — par son nom,
// donc au large.
const CITE = /[\w.@-]+\.(?:ts|mts|js|mjs|cjs)\b/g;
const IMPORT = /(?:from\s*|import\s*\(\s*|import\s+)["'`](\.{1,2}\/[^"'`]+)["'`]/g;
// Un import de type ne fait rien tourner : le typecheck le couvre.
const IMPORT_DE_TYPE = /^\s*import\s+type\b[^;]*;/gm;
const sousTest = (f) => /^(runtime|app)\/test\//.test(f);
const aretes = new Map();
for (const [f, texte] of textes) {
  const vers = new Set();
  for (const [, cible] of texte.replace(IMPORT_DE_TYPE, "").matchAll(IMPORT)) {
    const resolu = normalize(join(dirname(f), cible));
    // Un helper partagé (`aides/cuisine.ts`) importe presque tout le produit, et
    // ferait toucher chaque test qui l'utilise par presque tout : de lui, seuls
    // les autres helpers se suivent. Ce qu'un test exerce à travers lui se
    // rattrape sur la base.
    if (connus.has(resolu) && (f.endsWith(".test.ts") || !sousTest(f) || sousTest(resolu))) vers.add(resolu);
  }
  // Un nom cité ne compte que dans un test : un helper partagé en cite beaucoup
  // (le `main.ts` qu'il sait lancer), et ferait toucher chaque test par tout.
  if (f.endsWith(".test.ts")) for (const [nom] of texte.matchAll(CITE)) for (const g of parNom.get(basename(nom)) ?? []) if (g !== f) vers.add(g);
  aretes.set(f, vers);
}

// La fermeture d'un test, mémorisée par fichier.
const fermetures = new Map();
function fermeture(depart) {
  const vu = new Set([depart]);
  const pile = [depart];
  while (pile.length > 0) {
    for (const g of aretes.get(pile.pop()) ?? []) {
      if (!vu.has(g)) {
        vu.add(g);
        // Seuls les fichiers sous test/ se suivent : le code du produit est une
        // feuille. Un test est touché par ce que lui ou ses helpers utilisent
        // directement ; ce qui n'en dépend que de loin se rattrape sur la base.
        if (/^(runtime|app)\/test\//.test(g)) pile.push(g);
      }
    }
  }
  return vu;
}

// Ce que cite un fichier modifié qui n'est pas du code : son chemin, ou son nom.
const autres = modifies.filter((m) => !connus.has(normalize(m)));
// Seul ce qui est sous test/ compte : le code cite des pages de doc et des scripts
// dans ses commentaires, sans les lire.
// Le dossier cité seul, fin de chaîne comprise : `docs/runtime.md` ne cite pas `docs/runtime`.
const citeLeDossier = (t, dossier) => new RegExp(`${dossier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/?["'\`]`).test(t);
const cites = (f) => sousTest(f) && autres.some((m) => {
    const t = textes.get(f);
    // Un helper qui lit tout un dossier (`docs/runtime`) le cite sans nommer ses pages.
    const dossier = dirname(m);
    return t.includes(m) || t.includes(basename(m)) || (dossier.includes("/") && citeLeDossier(t, dossier));
  });
const codeModifie = new Set(modifies.map(normalize).filter((m) => connus.has(m)));

for (const zone of ZONES) {
  const tests = fichiers.filter((f) => f.startsWith(`${zone}/test/`) && f.endsWith(".test.ts"));
  if (tests.length === 0) {
    console.log(`${zone} rien`);
    continue;
  }
  // Les tests lents de bout en bout — une vraie station, de vraies attentes —
  // portent `// gates: base` dans leur en-tête : ils ne tournent que sur la
  // base, où tout se joue, jamais pour un changement.
  const touches = tests.filter((t) => !/^\/\/ gates: base$/m.test(textes.get(t).slice(0, 4000))).filter((t) => {
    let ferme = fermetures.get(t);
    if (!ferme) fermetures.set(t, (ferme = fermeture(t)));
    for (const f of ferme) if (codeModifie.has(f) || (autres.length > 0 && cites(f))) return true;
    return false;
  });
  console.log(touches.length === 0 ? `${zone} rien` : touches.length === tests.length ? `${zone} tout` : `${zone} fichiers ${touches.map((t) => relative(zone, t)).join(" ")}`);
}
