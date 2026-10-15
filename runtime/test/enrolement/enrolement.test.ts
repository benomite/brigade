// L'enrôlement d'un serveur, côté chef : un code à usage unique et la commande
// qui le porte. Le code valide une présentation, une fois, dans son délai ; un
// code faux, expiré ou déjà servi est refusé sans que rien n'entre au
// registre. Et ce qui y entre attend l'acceptation du chef.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { CodeRefuse, DemandeInvalide, DUREE_MS, lireCode, ouvrirEnrolements, RECEPTEUR, repertoireDuRegistre } from "../../src/enrolement/enrolement.ts";
import { ouvrirRegistre, PresentationInvalide, type Presentation } from "../../src/stations-globales/registre.ts";
import { repertoireTemporaire } from "../outils.ts";

const SERVEUR: Presentation = { nom: "serveur-1", machine: "Debian GNU/Linux 13 (trixie)", capacites: ["linux"], cloisonnee: false };

const horloge = (depart = "2026-10-15T09:00:00.000Z") => {
  let instant = new Date(depart);
  return { maintenant: () => instant, aller: (iso: string) => void (instant = new Date(iso)) };
};

const ouvrir = (t: TestContext, heure = horloge()) => {
  const repertoire = repertoireTemporaire(t);
  const enrolements = ouvrirEnrolements(repertoire, { maintenant: heure.maintenant });
  const registre = ouvrirRegistre(repertoire, { maintenant: heure.maintenant });
  t.after(() => {
    enrolements.fermer();
    registre.fermer();
  });
  return { enrolements, registre, repertoire, heure };
};

const refuse = (motif: string) => (erreur: unknown) => erreur instanceof CodeRefuse && erreur.motif === motif;

test("préparer rend un code à usage unique et la commande qui le porte, avec la destination, le geste et le registre du chef", (t) => {
  const { enrolements, repertoire } = ouvrir(t);
  const { code, commande, expireLe } = enrolements.preparer({ vers: "chef@box" });

  assert.match(code, /^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/);
  assert.equal(expireLe, new Date(Date.parse("2026-10-15T09:00:00.000Z") + DUREE_MS).toISOString());
  assert.equal(
    commande,
    `d="$HOME/.local/share/brigade"; { [ -e "$d/.git" ] || git clone --quiet --depth 1 --branch 'v2' 'https://github.com/benomite/brigade.git' "$d"; } && ` +
      `"$d/runtime/deploy/brigade-enrolement" present '${code}' --to 'chef@box' --receiver '${RECEPTEUR}' --registry '${repertoire}'`,
  );
  // Deux enrôlements, deux codes.
  assert.notEqual(enrolements.preparer({ vers: "chef@box" }).code, code);
  // Un nom choisi d'avance passe dans la commande.
  assert.match(enrolements.preparer({ vers: "chef@box", nom: "serveur-de-test" }).commande, / --name 'serveur-de-test'$/);
});

test("rien de ce qui sortirait de ses apostrophes ne s'écrit dans la commande", (t) => {
  const { enrolements } = ouvrir(t);
  for (const vers of ["", "-oProxyCommand=x", "chef@box; rm -rf ~", "chef@'box'", "chef box"]) {
    assert.throws(() => enrolements.preparer({ vers }), DemandeInvalide, vers);
  }
  assert.throws(() => enrolements.preparer({ vers: "chef@box", nom: "Serveur'" }), DemandeInvalide);
  assert.throws(() => enrolements.preparer({ vers: "chef@box", depot: "https://x/'$(id)'" }), DemandeInvalide);
  assert.throws(() => enrolements.preparer({ vers: "chef@box", branche: "--upload-pack=x" }), DemandeInvalide);
});

test("le bon code présente la machine au registre « en attente », avec ses capacités — et elle n'est sélectionnable qu'une fois acceptée", (t) => {
  const { enrolements, registre } = ouvrir(t);
  const { code } = enrolements.preparer({ vers: "chef@box" });

  const presentee = enrolements.recevoir(code, SERVEUR);

  assert.equal(presentee.statut, "en-attente");
  assert.deepEqual(registre.lire("serveur-1"), presentee);
  assert.deepEqual(presentee.declarees, ["linux"]);
  // Avant l'acceptation, aucune sélection ne la rend.
  assert.deepEqual(registre.utilisables(), []);
  assert.deepEqual(registre.utilisables(["linux"]), []);

  const acceptee = registre.accepter("serveur-1");
  assert.deepEqual(registre.utilisables(["linux"]), [acceptee]);
});

test("le code se tape comme on le lit : minuscules, sans tiret, O pour 0, I ou L pour 1", (t) => {
  const { enrolements, registre } = ouvrir(t);
  const { code } = enrolements.preparer({ vers: "chef@box" });
  const tape = code.replace("-", " ").toLowerCase().replaceAll("0", "o").replaceAll("1", "l");

  enrolements.recevoir(tape, SERVEUR);

  assert.equal(registre.lire("serveur-1")?.statut, "en-attente");
  assert.equal(lireCode("abcde-fghjk"), "ABCDEFGHJK");
  assert.equal(lireCode("ABCDE-FGHJU"), null);
  assert.equal(lireCode("ABCD"), null);
});

test("un code faux est refusé, et la machine n'apparaît pas au registre", (t) => {
  const { enrolements, registre } = ouvrir(t);
  const { code } = enrolements.preparer({ vers: "chef@box" });
  // Un autre code bien formé, et ce qui n'en est pas un.
  const faux = code.startsWith("0") ? `1${code.slice(1)}` : `0${code.slice(1)}`;

  for (const tente of [faux, "", "pas un code", `${code}0`]) {
    assert.throws(() => enrolements.recevoir(tente, SERVEUR), refuse("inconnu"), tente);
  }
  assert.deepEqual(registre.liste(), []);
  // Le vrai sert encore.
  assert.equal(enrolements.recevoir(code, SERVEUR).statut, "en-attente");
});

test("un code expiré est refusé, et la machine n'apparaît pas au registre", (t) => {
  const { enrolements, registre, heure } = ouvrir(t);
  const { code, expireLe } = enrolements.preparer({ vers: "chef@box" });

  heure.aller(expireLe);

  assert.throws(() => enrolements.recevoir(code, SERVEUR), refuse("expire"));
  assert.deepEqual(registre.liste(), []);
});

test("un code ne sert qu'une fois : une seconde présentation, de cette machine ou d'une autre, est refusée et n'entre pas au registre", (t) => {
  const { enrolements, registre } = ouvrir(t);
  const { code } = enrolements.preparer({ vers: "chef@box" });
  const premiere = enrolements.recevoir(code, SERVEUR);

  assert.throws(() => enrolements.recevoir(code, { ...SERVEUR, nom: "intrus", machine: "Ubuntu 26.04" }), refuse("utilise"));
  assert.throws(() => enrolements.recevoir(code, SERVEUR), refuse("utilise"));
  assert.deepEqual(registre.liste(), [premiere]);
});

test("une présentation mal formée est refusée sans consommer le code", (t) => {
  const { enrolements, registre } = ouvrir(t);
  const { code } = enrolements.preparer({ vers: "chef@box" });

  assert.throws(() => enrolements.recevoir(code, { ...SERVEUR, nom: "Pas Un Nom" }), PresentationInvalide);
  assert.deepEqual(registre.liste(), []);
  assert.equal(enrolements.recevoir(code, SERVEUR).statut, "en-attente");
});

test("un enrôlement n'hérite jamais d'une acceptation : se présenter sous le nom d'une station acceptée est refusé", (t) => {
  const { enrolements, registre } = ouvrir(t);
  registre.presenter(SERVEUR);
  const acceptee = registre.accepter("serveur-1", { capacites: ["code"] });
  const { code } = enrolements.preparer({ vers: "chef@box" });

  // Même nom, même machine, même cloison : le registre la garderait acceptée.
  assert.throws(() => enrolements.recevoir(code, SERVEUR), refuse("nom-pris"));
  assert.deepEqual(registre.liste(), [acceptee]);
  // Le code reste bon sous un autre nom, qui entre en attente.
  assert.equal(enrolements.recevoir(code, { ...SERVEUR, nom: "serveur-2" }).statut, "en-attente");
  assert.deepEqual(registre.utilisables(), [acceptee]);
});

test("un code préparé dans un process se valide dans un autre : les enrôlements vivent sur le disque, sans le code en clair", (t) => {
  const repertoire = repertoireTemporaire(t);
  const avant = ouvrirEnrolements(repertoire);
  const { code } = avant.preparer({ vers: "chef@box" });
  avant.fermer();

  assert.equal(readFileSync(join(repertoire, "enrolements.db")).includes(Buffer.from(code.replace("-", ""))), false);
  const apres = ouvrirEnrolements(repertoire);
  t.after(() => apres.fermer());
  assert.equal(apres.recevoir(code, SERVEUR).statut, "en-attente");
});

test("le registre du chef : BRIGADE_REGISTRE_DIR, sinon sous l'état de son compte", () => {
  assert.equal(repertoireDuRegistre({ BRIGADE_REGISTRE_DIR: "/srv/registre", HOME: "/home/chef" }), "/srv/registre");
  assert.equal(repertoireDuRegistre({ XDG_STATE_HOME: "/etat", HOME: "/home/chef" }), "/etat/brigade");
  assert.equal(repertoireDuRegistre({ HOME: "/home/chef" }), "/home/chef/.local/state/brigade");
  assert.throws(() => repertoireDuRegistre({}), DemandeInvalide);
});
