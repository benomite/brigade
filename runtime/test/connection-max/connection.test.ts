// La connexion Max de la machine, lue du seul fichier d'état du
// renouvellement : connectée, perdue — un login à faire —, ou inconnue.
import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluer, GESTE, INCONNUE, lireExposition, lireRenouvellement, perdre, type MaxConnection } from "../../src/connection-max/connection.ts";

const MAINTENANT = new Date("2026-10-15T12:00:00Z");
// Ce que la station retient après avoir lu ces fichiers d'état, l'un après l'autre.
const suite = (...etats: string[]) => etats.reduce<MaxConnection>((avant, texte) => evaluer(lireRenouvellement(texte), avant, MAINTENANT), INCONNUE);

const SANS_IDENTIFIANTS = "echec=2026-10-15T11:58:00Z\nechec_nature=identifiants-absents\nechec_detail=aucune connexion Max sous ce compte\n";
const REFUSEE = "verifie=2026-10-15T11:00:00Z\necrits=2026-10-15T08:00:00Z\nechec=2026-10-15T11:30:00Z\nechec_nature=session-refusee\nechec_detail=Anthropic a refusé le renouvellement\n";

test("sans passage du renouvellement, la connexion est inconnue — même un fichier vide", () => {
  assert.equal(evaluer(null, INCONNUE, MAINTENANT).etat, "inconnue");
  assert.equal(suite("").etat, "inconnue");
});

test("un passage réussi, sans échec derrière lui : connectée, vérifiée à son heure, et rien à faire", () => {
  const connection = suite("verifie=2026-10-15T11:59:30Z\necrits=2026-10-15T08:00:00Z\n");
  assert.deepEqual(
    { etat: connection.etat, verifiee: connection.verifiee, reecrite: connection.reecrite, geste: connection.geste, vivant: connection.renouvellement.vivant },
    { etat: "connectee", verifiee: "2026-10-15T11:59:30.000Z", reecrite: "2026-10-15T08:00:00.000Z", geste: null, vivant: true },
  );
});

test("avant le login de l'installation, chaque passage échoue faute d'identifiants : la connexion est perdue, et le geste est un login", () => {
  const connection = suite(SANS_IDENTIFIANTS);
  assert.deepEqual(
    { etat: connection.etat, depuis: connection.depuis, raison: connection.raison, geste: connection.geste },
    { etat: "perdue", depuis: "2026-10-15T11:58:00.000Z", raison: "identifiants-absents", geste: GESTE },
  );
  assert.match(GESTE, /claude auth login.*la cuisine reprend seule dans la minute/);
});

test("un renouvellement refusé, ou un jeton mort sans renouvellement, perd la connexion — et la perte garde sa première date", () => {
  assert.equal(suite(REFUSEE).raison, "session-refusee");
  assert.equal(suite("echec=2026-10-15T11:30:00Z\nechec_nature=non-renouvele\n").etat, "perdue");
  const continuee = suite(REFUSEE, REFUSEE.replace("echec=2026-10-15T11:30:00Z", "echec=2026-10-15T11:59:30Z"));
  assert.equal(continuee.depuis, "2026-10-15T11:30:00.000Z");
});

test("un renouvellement en panne n'est pas une connexion perdue : elle reste ce qu'elle était, et la panne est dite à part", () => {
  const connection = suite("verifie=2026-10-15T11:00:00Z\necrits=2026-10-15T08:00:00Z\n", "verifie=2026-10-15T11:00:00Z\necrits=2026-10-15T08:00:00Z\nechec=2026-10-15T11:59:00Z\nechec_nature=claude-introuvable\nechec_detail=« claude » ne se lance pas\n");
  assert.equal(connection.etat, "connectee");
  assert.deepEqual(connection.renouvellement.echec, { nature: "claude-introuvable", detail: "« claude » ne se lance pas", at: "2026-10-15T11:59:00.000Z" });
});

test("perdue, elle ne se rétablit que sur des identifiants réécrits après la perte — un passage frais n'y suffit pas", () => {
  // Le passage réussit, mais rien n'a été réécrit depuis la chute : pas de login.
  const sansLogin = suite(REFUSEE, "verifie=2026-10-15T11:59:30Z\necrits=2026-10-15T08:00:00Z\nechec=2026-10-15T11:30:00Z\nechec_nature=session-refusee\n");
  assert.equal(sansLogin.etat, "perdue");
  // Le login a réécrit les identifiants : la connexion est rétablie.
  const apresLogin = suite(REFUSEE, "verifie=2026-10-15T11:59:30Z\necrits=2026-10-15T11:59:10Z\nechec=2026-10-15T11:30:00Z\nechec_nature=session-refusee\n");
  assert.deepEqual([apresLogin.etat, apresLogin.reecrite, apresLogin.geste], ["connectee", "2026-10-15T11:59:10.000Z", null]);
});

test("un projet qui voit la connexion tomber la perd pour toute la machine — sauf si un login l'a déjà réécrite depuis", () => {
  const connectee = suite("verifie=2026-10-15T11:59:30Z\necrits=2026-10-15T08:00:00Z\n");
  const perdue = perdre(connectee, "authentication_failed", "2026-10-15T11:59:40.000Z");
  assert.deepEqual([perdue.etat, perdue.raison, perdue.depuis], ["perdue", "authentication_failed", "2026-10-15T11:59:40.000Z"]);
  // Une chute plus vieille que la dernière réécriture est déjà réparée.
  assert.equal(perdre(connectee, "authentication_failed", "2026-10-15T07:00:00.000Z"), connectee);
  // Le renouvellement continue de réussir sans rien réécrire : elle reste perdue.
  assert.equal(evaluer(lireRenouvellement("verifie=2026-10-15T12:00:00Z\necrits=2026-10-15T08:00:00Z\n"), perdue, MAINTENANT).etat, "perdue");
  // Un fichier qui disparaît ne l'efface pas non plus.
  assert.equal(evaluer(null, perdue, MAINTENANT).etat, "perdue");
});

test("un renouvellement sans passage depuis dix minutes n'est plus vivant", () => {
  assert.equal(suite("verifie=2026-10-15T11:49:00Z\n").renouvellement.vivant, false);
});

test("l'exposition se relit telle qu'elle a été écrite ; un texte qui n'en est pas une ne se lit pas", () => {
  const connection = suite(SANS_IDENTIFIANTS);
  assert.deepEqual(lireExposition(JSON.stringify(connection)), connection);
  assert.equal(lireExposition("{}"), null);
  assert.equal(lireExposition("pas du json"), null);
});
