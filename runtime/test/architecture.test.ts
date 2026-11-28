// La règle d'architecture des stations distantes, gardée : le poste du chef se
// connecte à la box, jamais l'inverse. La box n'a aucun chemin vers une station
// distante — ni adresse où la joindre, ni code qui ouvre une connexion vers
// elle. Et la box ne sert plus de station distante (#2061) : les stations
// prennent leurs tickets sur GitHub, aucun module n'y lit ni n'y écrit de
// demande `remote.*`.
//
// Trois gardes : ce que la déclaration d'une station peut porter, ce que les
// sources du runtime importent, et ce qu'elles lancent.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { test } from "node:test";
import { ConfigInvalide } from "../src/runtime.ts";
import { lireStations } from "../src/stations-declarees.ts";

const SRC = join(import.meta.dirname, "../src");
const sources = (repertoire = SRC): string[] =>
  readdirSync(repertoire, { withFileTypes: true }).flatMap((entree) => (entree.isDirectory() ? sources(join(repertoire, entree.name)) : entree.name.endsWith(".ts") ? [join(repertoire, entree.name)] : []));
const lire = (fichier: string) => readFileSync(fichier, "utf8");
// Le nom d'un module, écrit avec `/` comme dans le dépôt, sur toutes les plateformes.
const nom = (fichier: string) => relative(SRC, fichier).replaceAll(sep, "/");

// Ce par quoi un module de Node parle au réseau.
const RESEAU = /from "node:(net|http|https|http2|tls|dgram|dns)"|\bfetch\(|\bWebSocket\b|\bXMLHttpRequest\b/;
// Les seuls modules du runtime qui y touchent, et vers quoi : aucun ne va vers
// une station. Un module de plus ici est une décision d'architecture — elle se
// prend dans une livraison qui la dit, pas par un import.
const VERS = {
  "arbitrage.ts": "l'arbitre entre projets, sur 127.0.0.1",
  "arbitre.ts": "n'ouvre rien : il écoute, sur 127.0.0.1",
  "identites.ts": "l'API de GitHub, pour les jetons des rôles",
  "mise-a-jour/publications.ts": "les releases du dépôt de brigade sur GitHub, pour la mise à jour de la station",
  "porte.ts": "les hôtes de la liste blanche du projet, pour ses lancements — elle écoute sur 127.0.0.1",
  "reseau.ts": "la porte du projet, et la sonde du filtre de son unité",
};

test("la déclaration d'une station distante ne porte aucune adresse : la box ne sait pas où elle est, elle ne peut donc pas la joindre", () => {
  const [distante] = lireStations({ BRIGADE_STATIONS: "mac/claude:1:chrome-connecté:distante" });
  assert.deepEqual(Object.keys(distante ?? {}).sort(), ["cooks", "distante", "fournit", "moteur", "nom"]);
  // Ni hôte, ni port, ni URL : rien de tel ne s'écrit dans une déclaration.
  for (const adresse of ["192.168.1.20", "mac.local", "mac.local:22", "ssh://chef@mac", "chef@mac"]) {
    assert.throws(() => lireStations({ BRIGADE_STATIONS: `mac/claude:1:chrome-connecté:${adresse}` }), ConfigInvalide, adresse);
    assert.throws(() => lireStations({ BRIGADE_STATIONS: `mac/claude:1:chrome-connecté:distante:${adresse}` }), ConfigInvalide, adresse);
  }
});

test("`runtime/src` : seuls sept modules touchent au réseau, aucun vers une station — et plus aucun ne sert les stations distantes", () => {
  const fichiers = sources();
  assert.deepEqual(fichiers.filter((fichier) => RESEAU.test(lire(fichier))).map(nom).sort(), Object.keys(VERS).sort());
  // Aucun de ces sept ne connaît les stations distantes : ni leurs modules, ni
  // leur déclaration, ni leurs demandes.
  for (const fichier of Object.keys(VERS)) {
    assert.doesNotMatch(lire(join(SRC, fichier)), /distante|remote\.|tirer\.ts|stations-declarees/i, fichier);
  }
  // La box ne sert plus de station distante : aucun module ne lit ni n'écrit
  // de demande `remote.*` au journal.
  for (const fichier of fichiers) {
    assert.doesNotMatch(lire(fichier), /["'`]remote\./, nom(fichier));
  }
});

test("`runtime/src` : aucun programme qui joint une autre machine n'est lancé par son nom — ni `ssh`, ni `scp`, ni `curl`", () => {
  // Les seuls programmes que le runtime lance par un nom écrit en dur.
  const lances = new Set(sources().flatMap((fichier) => [...lire(fichier).matchAll(/(?<![.\w])(?:spawn|spawnSync|execFile|execFileSync|exec|execSync)\(\s*"([^"]+)"/g)].map((trouve) => trouve[1])));
  // `ps` : pour dire quel processus tient le processeur quand la machine est
  // saturée (`consommateur.ts`, #4090) — il ne lit que la table des processus locale.
  assert.deepEqual([...lances].sort(), ["du", "git", "ps"]);
  // Ni nommé ailleurs dans le code — un commentaire peut le citer, pas une chaîne.
  for (const fichier of sources()) {
    const code = lire(fichier)
      .split("\n")
      .filter((ligne) => !ligne.trimStart().startsWith("//"))
      .join("\n");
    assert.doesNotMatch(code, /["'](ssh|scp|sftp|rsync|curl|wget|nc|ncat|telnet|mosh)["']/, nom(fichier));
  }
});
