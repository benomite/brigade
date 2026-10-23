// La règle d'architecture des stations distantes, gardée : le poste du chef se
// connecte à la box, jamais l'inverse. La box n'a aucun chemin vers une station
// distante — ni adresse où la joindre, ni code qui ouvre une connexion vers
// elle : la seule direction possible est station → box, par le geste de la box
// (`run tirer`), qui n'écrit qu'au journal.
//
// Trois gardes : ce que la déclaration d'une station peut porter, ce que les
// sources du runtime importent, et ce qu'un tour complet d'une station distante
// ouvre réellement comme connexions — aucune.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import net from "node:net";
import { join, relative } from "node:path";
import { test } from "node:test";
import { MARQUEUR } from "../src/fiche.ts";
import { ACTIONS, jamaisAccordee } from "../src/grant.ts";
import { ConfigInvalide } from "../src/runtime.ts";
import { lireStations } from "../src/stations-declarees.ts";
import { demander } from "../src/tirer.ts";
import { chef, cuisine, issue, pousserSurLOrigine } from "./aides/cuisine.ts";
import { jusqua } from "./outils.ts";

const SRC = join(import.meta.dirname, "../src");
const sources = (repertoire = SRC): string[] =>
  readdirSync(repertoire, { withFileTypes: true }).flatMap((entree) => (entree.isDirectory() ? sources(join(repertoire, entree.name)) : entree.name.endsWith(".ts") ? [join(repertoire, entree.name)] : []));
const lire = (fichier: string) => readFileSync(fichier, "utf8");
const nom = (fichier: string) => relative(SRC, fichier);

// Ce par quoi un module de Node parle au réseau.
const RESEAU = /from "node:(net|http|https|http2|tls|dgram|dns)"|\bfetch\(|\bWebSocket\b|\bXMLHttpRequest\b/;
// Les seuls modules du runtime qui y touchent, et vers quoi : aucun ne va vers
// une station. Un module de plus ici est une décision d'architecture — elle se
// prend dans une livraison qui la dit, pas par un import.
const VERS = {
  "arbitrage.ts": "l'arbitre entre projets, sur 127.0.0.1",
  "arbitre.ts": "n'ouvre rien : il écoute, sur 127.0.0.1",
  "identites.ts": "l'API de GitHub, pour les jetons des rôles",
  "installateur.ts": "n'ouvre rien : il cherche un port libre sur la machine",
  "mise-a-jour/publications.ts": "les releases du dépôt de brigade sur GitHub, pour la mise à jour de la station",
  "porte.ts": "les hôtes de la liste blanche du projet, pour ses lancements — elle écoute sur 127.0.0.1",
  "reseau.ts": "la porte du projet, et la sonde du filtre de son unité",
  "servir.ts": "le serveur d'une livraison d'interface, sur 127.0.0.1",
  "telephone/guichet.ts": "n'ouvre rien : il écoute — le téléphone du chef le joint pour s'appairer, puis lire les stations, les projets et leur file, et y faire les gestes de la file",
};
// Ce qui sert les stations distantes, côté box.
const DISTANTES = ["distantes.ts", "tirer.ts", "tirer-cli.ts", "superviseur-distant.ts", "events/remote.ts"];

test("la déclaration d'une station distante ne porte aucune adresse : la box ne sait pas où elle est, elle ne peut donc pas la joindre", () => {
  const [distante] = lireStations({ BRIGADE_STATIONS: "mac/claude:1:chrome-connecté:distante" });
  assert.deepEqual(Object.keys(distante ?? {}).sort(), ["cooks", "distante", "fournit", "moteur", "nom"]);
  // Ni hôte, ni port, ni URL : rien de tel ne s'écrit dans une déclaration.
  for (const adresse of ["192.168.1.20", "mac.local", "mac.local:22", "ssh://chef@mac", "chef@mac"]) {
    assert.throws(() => lireStations({ BRIGADE_STATIONS: `mac/claude:1:chrome-connecté:${adresse}` }), ConfigInvalide, adresse);
    assert.throws(() => lireStations({ BRIGADE_STATIONS: `mac/claude:1:chrome-connecté:distante:${adresse}` }), ConfigInvalide, adresse);
  }
});

test("`runtime/src` : seuls neuf modules touchent au réseau, aucun vers une station — et ce qui sert les stations distantes n'en importe aucun", () => {
  const fichiers = sources();
  assert.deepEqual(fichiers.filter((fichier) => RESEAU.test(lire(fichier))).map(nom).sort(), Object.keys(VERS).sort());
  // Aucun de ces neuf ne connaît les stations distantes : ni leurs modules, ni
  // leur déclaration, ni leurs demandes.
  for (const fichier of Object.keys(VERS)) {
    assert.doesNotMatch(lire(join(SRC, fichier)), /distante|remote\.|tirer\.ts|stations-declarees/i, fichier);
  }
  // Ce qui les sert n'ouvre aucune connexion et ne lance aucun process : il
  // lit et écrit le journal.
  for (const fichier of DISTANTES) {
    const texte = lire(join(SRC, fichier));
    assert.doesNotMatch(texte, RESEAU, fichier);
    assert.doesNotMatch(texte, /node:child_process|\bspawn\(|\bexecFile(Sync)?\(/, fichier);
  }
  assert.deepEqual(DISTANTES.filter((fichier) => !fichiers.map(nom).includes(fichier)), []);
});

test("`runtime/src` : aucun programme qui joint une autre machine n'est lancé par son nom — ni `ssh`, ni `scp`, ni `curl`", () => {
  // Les seuls programmes que le runtime lance par un nom écrit en dur.
  const lances = new Set(sources().flatMap((fichier) => [...lire(fichier).matchAll(/(?<![.\w])(?:spawn|spawnSync|execFile|execFileSync|exec|execSync)\(\s*"([^"]+)"/g)].map((trouve) => trouve[1])));
  // `systemctl` : pour la seule bascule, jouée sous root par le paquet de la
  // station, qui arrête les anciennes unités de la machine
  // (`bascule/basculer.ts`) — il ne parle qu'au systemd local.
  assert.deepEqual([...lances].sort(), ["du", "git", "systemctl"]);
  // Ni nommé ailleurs dans le code — un commentaire peut le citer, pas une chaîne.
  // Sauf par la vérification des outils du second (#1433), qui cherche `ssh`
  // dans le PATH du chef pour dire s'il manque, et ne lance rien.
  const OUTILS_DU_SECOND = join(SRC, "second", "outils.ts");
  assert.doesNotMatch(lire(OUTILS_DU_SECOND), /node:child_process|\bspawn\(|\bexecFile(Sync)?\(/);
  for (const fichier of sources().filter((fichier) => fichier !== OUTILS_DU_SECOND)) {
    const code = lire(fichier)
      .split("\n")
      .filter((ligne) => !ligne.trimStart().startsWith("//"))
      .join("\n");
    assert.doesNotMatch(code, /["'](ssh|scp|sftp|rsync|curl|wget|nc|ncat|telnet|mosh)["']/, nom(fichier));
  }
});

test("un tour complet d'une station distante — annoncer, réclamer, renouveler, rendre, la pass, le merge — n'ouvre aucune connexion depuis la box", async (t) => {
  // Toute connexion TCP de ce process passe par ici, HTTP compris.
  const ouvertes: string[] = [];
  const connect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
    ouvertes.push(JSON.stringify(args[0]));
    return (connect as (...recus: unknown[]) => net.Socket).apply(this, args);
  } as typeof connect;
  t.after(() => void (net.Socket.prototype.connect = connect));

  const MAC = "mac/claude";
  const { gh, repertoire, heure, types, journal } = cuisine(t, { stations: lireStations({ BRIGADE_STATIONS: `${MAC}:1:chrome-connecté:distante` }), pass: true });
  chef(repertoire, "grant.activated");
  gh.ficher(16, "2026-10-08T09:00:00Z", [MARQUEUR, "- requiert : chrome-connecté"].join("\n"));
  gh.poser(issue(16));
  const tirer = (demande: Parameters<typeof demander>[2]) => demander(repertoire, MAC, demande, { maintenant: heure.maintenant, pasMs: 2 });
  await jusqua(() => types(16).includes("ticket.86"));
  await tirer({ verb: "announce" });
  await jusqua(() => types(16).includes("ticket.released"));
  const prise = await tirer({ verb: "claim" });
  assert.ok(prise.ok && prise.verb === "claim" && prise.mission !== null);
  const { run, branch } = prise.mission;
  assert.equal((await tirer({ verb: "renew", run, proof: "e1", turns: 1, tokens: 10 })).ok, true);
  pousserSurLOrigine(repertoire, branch);
  assert.equal((await tirer({ verb: "deliver", run, ending: "delivered", reason: null, message: null, turns: 2, tokens: 20 })).ok, true);
  await jusqua(() => types(16).includes("ticket.served"));

  assert.deepEqual(ouvertes, []);
  // Et aucun grant n'en est né : le seul accordé l'a été par le chef, et la
  // pass seule s'en est servie — la station distante n'en reçoit ni n'en écrit.
  assert.deepEqual(journal.tout().flatMap((e) => (e.type.startsWith("grant.") ? [`${e.type} ${e.author}`] : [])), ["grant.activated chef", "grant.used pass"]);
  assert.deepEqual(ACTIONS, ["merge"]);
  assert.equal(jamaisAccordee("accès-prod")?.action, "acces-prod");
});
