// Le test de glossaire : des lignes de sortie qu'on veut anglaises ne portent
// aucun mot de la colonne « français » de docs/glossary.md. Les mots se lisent
// du glossaire lui-même, à chaque appel : un terme qu'il ajoute est vérifié sans
// toucher à ce fichier.
//
// Ce qui est français : chaque terme entre backticks de la première colonne des
// tables, et le côté gauche de chaque `x` → `y` d'une autre cellule. Ce qui n'en
// est pas : un terme que le glossaire donne aussi pour anglais (`grant`, `rail`,
// `base`, `installation`…) — en colonne anglaise, à droite d'une flèche, ou dans
// la liste des mots déjà anglais —, et celui que sa ligne dit `unchanged`.
//
// Ce qui est entre backticks dans la sortie n'est pas lu : c'est un identifiant
// que le chef tape tel quel — une commande, un label (`hors-cuisine`), une clé
// de fiche (`attend`). Son nom change avec le ticket qui le renomme, pas avec
// la phrase qui le cite.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const GLOSSAIRE = join(import.meta.dirname, "../../../docs/glossary.md");

const entreBackticks = (texte: string) => [...texte.matchAll(/`([^`]+)`/g)].map(([, terme]) => terme ?? "");
// « sans grant, … » se cherche comme « sans grant », « ROUGE depuis … » comme « ROUGE depuis ».
const nettoyer = (terme: string) => terme.replace(/…/g, "").replace(/[\s,;:]+$/, "").trim();
// Les cellules d'une ligne de table : le `|` échappé (`\|`) est dans la cellule.
const cellules = (ligne: string) =>
  ligne
    .replace(/^\||\|$/g, "")
    .split(/(?<!\\)\|/)
    .map((cellule) => cellule.trim());
const FLECHE = /`([^`]+)`\s*→\s*`([^`]+)`/g;

// Les mots français du glossaire, sans doublon, du plus long au plus court.
export function motsFrancais(texte = readFileSync(GLOSSAIRE, "utf8")): string[] {
  const francais = new Set<string>();
  const anglais = new Set<string>();
  // La liste des mots déjà anglais, sur plusieurs lignes : de son titre à « are kept ».
  const dejaAnglais = /\*\*Words already English stay\.\*\*([^]*?)are kept/.exec(texte)?.[1] ?? "";
  for (const mot of entreBackticks(dejaAnglais)) anglais.add(nettoyer(mot).toLowerCase());
  for (const ligne of texte.split("\n")) {
    if (!ligne.startsWith("|") || /^\|[\s|:-]+\|$/.test(ligne)) continue;
    const [premiere = "", seconde = "", ...autres] = cellules(ligne);
    if (premiere === "French") continue;
    const termes = entreBackticks(premiere);
    if (/^unchanged\b/.test(seconde)) {
      for (const terme of termes) anglais.add(nettoyer(terme).toLowerCase());
      continue;
    }
    for (const terme of termes) francais.add(nettoyer(terme));
    for (const terme of entreBackticks(seconde)) anglais.add(nettoyer(terme).toLowerCase());
    for (const cellule of [seconde, ...autres]) {
      for (const [, gauche = "", droite = ""] of cellule.matchAll(FLECHE)) {
        francais.add(nettoyer(gauche));
        anglais.add(nettoyer(droite).toLowerCase());
      }
    }
  }
  return [...francais].filter((terme) => terme !== "" && !anglais.has(terme.toLowerCase())).sort((a, b) => b.length - a.length || a.localeCompare(b));
}

const echapper = (terme: string) => terme.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Un mot entier, sans égard à la casse : `cuisine` ne se trouve ni dans
// `cuisiner` ni dans `precuisine`, mais bien dans « la cuisine ».
const motifDe = (terme: string) => new RegExp(`(?<![\\p{L}\\p{N}_])${echapper(terme)}(?![\\p{L}\\p{N}_])`, "iu");

// Ce que les lignes portent de français : le mot, et la ligne où il est.
export function motsFrancaisDans(lignes: readonly string[], mots = motsFrancais()): Array<{ mot: string; ligne: string }> {
  const motifs = mots.map((mot) => ({ mot, motif: motifDe(mot) }));
  return lignes.flatMap((ligne) => {
    const lue = ligne.replace(/`[^`]*`/g, " ");
    return motifs.filter(({ motif }) => motif.test(lue)).map(({ mot }) => ({ mot, ligne }));
  });
}

// Échoue si une ligne porte un mot français du glossaire, en citant chacun et
// sa ligne.
export function sansMotFrancais(lignes: readonly string[], mots = motsFrancais()): void {
  const trouves = motsFrancaisDans(lignes, mots);
  assert.equal(trouves.length, 0, `mots français du glossaire dans la sortie :\n${trouves.map(({ mot, ligne }) => `  « ${mot} » dans : ${ligne}`).join("\n")}`);
}
