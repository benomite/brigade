// Ce qu'une station du nuage reçoit, et l'accord donné une fois (#2231,
// épique #2223) : la liste en clair, l'accord qui vaut tant que la liste ne
// change pas, et une charge utile où ni la session Max ni aucun secret hors de
// la liste n'entre.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import {
  approuver,
  chargePourStation,
  chargeUtile,
  empreinte,
  enClair,
  FICHIER_ACCORD,
  JAMAIS,
  LISTE,
  lireAccord,
  peutRecevoir,
  RECOIT,
  retirerAccord,
  type Liste,
} from "../../src/stations-cloud-secrets/stations-cloud-secrets.ts";
import { repertoireTemporaire } from "../outils.ts";

const SESSION_MAX = "sk-ant-oat01-session-max-de-l-utilisateur-0123456789";
const JETON = "ghs_jetonLimiteAuDepot0123456789abcdef";

// Tout ce que la machine de l'utilisateur pourrait avoir sous la main.
const DISPONIBLE = {
  depot: "benomite/brigade",
  jetonGithub: JETON,
  sessionMax: SESSION_MAX,
  CLAUDE_CODE_OAUTH_TOKEN: SESSION_MAX,
  ANTHROPIC_API_KEY: "sk-ant-api03-cle-de-l-utilisateur-0123456789",
  GH_TOKEN: "gho_loginGithubDeLUtilisateur0123456789",
  secretsDuProjet: "STRIPE_TEST_KEY=sk_test_0123456789abcdef",
  BRIGADE_SECRETS_FILE: "/home/chef/.config/brigade/secrets",
  cleDeLApp: "-----BEGIN RSA PRIVATE KEY-----\nMIIE…\n-----END RSA PRIVATE KEY-----",
};

describe("la liste de ce qu'une station reçoit", () => {
  test("elle se dit en clair : chaque élément reçu et chaque élément jamais reçu a une phrase à montrer", () => {
    assert.deepEqual(
      RECOIT.map((element) => element.cle),
      ["depot", "jetonGithub"],
    );
    for (const element of [...RECOIT, ...JAMAIS]) assert.match(element.dit, /^[A-Z].{20,}\.$/s, element.cle);
    const texte = enClair();
    for (const element of [...RECOIT, ...JAMAIS]) assert.ok(texte.includes(element.dit), element.cle);
    assert.ok(texte.indexOf("never receives") > texte.indexOf(RECOIT.at(-1)?.dit ?? ""));
    assert.match(JAMAIS.map((element) => element.dit).join(" "), /Max session/);
  });

  test("aucun élément n'est à la fois reçu et jamais reçu, et la liste ne se modifie pas en mémoire", () => {
    const recus = new Set(RECOIT.map((element) => element.cle));
    assert.deepEqual(
      JAMAIS.filter((element) => recus.has(element.cle)),
      [],
    );
    assert.throws(() => (RECOIT as Array<{ cle: string; dit: string }>).push({ cle: "sessionMax", dit: "x" }));
    assert.throws(() => {
      (RECOIT[0] as { dit: string }).dit = "autre chose";
    });
  });
});

describe("l'accord de l'utilisateur, une fois par projet", () => {
  test("non tant qu'il n'a pas approuvé, oui après, non de nouveau dès que la liste change", (t) => {
    const etat = repertoireTemporaire(t);
    assert.equal(peutRecevoir(etat, "brigade"), false);

    approuver(etat, "brigade", LISTE, new Date("2026-11-04T10:00:00Z"));
    assert.equal(peutRecevoir(etat, "brigade"), true);
    assert.deepEqual(lireAccord(etat), { projet: "brigade", empreinte: empreinte(), au: "2026-11-04T10:00:00.000Z" });

    // Un élément ajouté, retiré, ou seulement dit autrement : l'accord ne vaut plus.
    const ajoute: Liste = { ...LISTE, recoit: [...RECOIT, { cle: "cleAnthropic", dit: "An Anthropic API key, billed to you." }] };
    const retire: Liste = { ...LISTE, recoit: RECOIT.slice(1) };
    const reformule: Liste = { ...LISTE, recoit: RECOIT.map((element, i) => (i === 0 ? { ...element, dit: `${element.dit} Also its forks.` } : element)) };
    const jamaisMoins: Liste = { ...LISTE, jamais: JAMAIS.slice(1) };
    for (const liste of [ajoute, retire, reformule, jamaisMoins]) {
      assert.notEqual(empreinte(liste), empreinte());
      assert.equal(peutRecevoir(etat, "brigade", liste), false);
    }

    // Redemandé sur la nouvelle liste, il vaut pour elle, et plus pour l'ancienne.
    approuver(etat, "brigade", ajoute);
    assert.equal(peutRecevoir(etat, "brigade", ajoute), true);
    assert.equal(peutRecevoir(etat, "brigade"), false);
  });

  test("l'accord d'un projet ne vaut pas pour un autre, et se retire", (t) => {
    const etat = repertoireTemporaire(t);
    const autre = repertoireTemporaire(t);
    approuver(etat, "brigade");
    assert.equal(peutRecevoir(etat, "autre-projet"), false);
    assert.equal(peutRecevoir(autre, "brigade"), false);

    retirerAccord(etat);
    assert.equal(peutRecevoir(etat, "brigade"), false);
    retirerAccord(etat);
  });

  test("un accord illisible ou mal formé n'est pas un accord", (t) => {
    const etat = repertoireTemporaire(t);
    for (const contenu of ["{", "null", "[]", JSON.stringify({ projet: "brigade" }), JSON.stringify({ projet: "brigade", empreinte: 1, au: "x" })]) {
      writeFileSync(join(etat, FICHIER_ACCORD), contenu);
      assert.equal(lireAccord(etat), null, contenu);
      assert.equal(peutRecevoir(etat, "brigade"), false, contenu);
    }
  });
});

describe("la charge utile d'une station", () => {
  test("la session Max et tout secret hors de la liste en sont absents : n'y entre que ce que la liste nomme", () => {
    const batie = chargeUtile(DISPONIBLE);
    assert.ok(batie.pret);
    assert.deepEqual(batie.charge, { depot: "benomite/brigade", jetonGithub: JETON });
    // Ni sous son nom, ni sous un autre, ni au détour d'une chaîne.
    const serialisee = JSON.stringify(batie);
    for (const [cle, valeur] of Object.entries(DISPONIBLE)) {
      if (cle === "depot" || cle === "jetonGithub") continue;
      assert.ok(!serialisee.includes(valeur), cle);
      assert.ok(!(cle in batie.charge), cle);
    }
    assert.ok(!serialisee.includes("sk-ant-"));
    assert.ok(Object.isFrozen(batie.charge));
  });

  test("un élément de la liste qui porterait la session Max, une clé Anthropic ou un secret retenu est refusé, sans citer la valeur", () => {
    const cas = [
      { ...DISPONIBLE, jetonGithub: SESSION_MAX },
      { ...DISPONIBLE, jetonGithub: "sk-ant-api03-autre-cle-0123456789" },
      { ...DISPONIBLE, jetonGithub: DISPONIBLE.GH_TOKEN },
      { ...DISPONIBLE, depot: DISPONIBLE.secretsDuProjet },
    ];
    for (const disponible of cas) {
      const batie = chargeUtile(disponible);
      assert.equal(batie.pret, false);
      assert.ok(!("charge" in batie));
      const dit = JSON.stringify(batie);
      for (const valeur of Object.values(DISPONIBLE)) assert.ok(!dit.includes(valeur) || valeur === "benomite/brigade", dit);
    }
  });

  test("un élément de la liste qui manque, ou un dépôt mal écrit : rien n'est donné", () => {
    const { jetonGithub: _, ...sansJeton } = DISPONIBLE;
    assert.deepEqual(chargeUtile(sansJeton), { pret: false, problemes: ["`jetonGithub` is missing"] });
    assert.deepEqual(chargeUtile({ ...DISPONIBLE, depot: "https://github.com/benomite/brigade" }), { pret: false, problemes: ["`depot` is not a repository written owner/name"] });
  });

  test("sans accord sur la liste telle qu'elle est, une station ne reçoit rien ; avec, elle reçoit la liste et elle seule", (t) => {
    const etat = repertoireTemporaire(t);
    const refusee = chargePourStation(etat, "brigade", DISPONIBLE);
    assert.equal(refusee.pret, false);
    assert.ok(!("charge" in refusee));

    approuver(etat, "brigade");
    const donnee = chargePourStation(etat, "brigade", DISPONIBLE);
    assert.ok(donnee.pret);
    assert.deepEqual(donnee.charge, { depot: "benomite/brigade", jetonGithub: JETON });

    // La liste change : la station ne reçoit plus rien jusqu'au nouvel accord.
    const changee: Liste = { ...LISTE, recoit: [...RECOIT, { cle: "sessionMax", dit: "Your Claude Max session." }] };
    assert.equal(chargePourStation(etat, "brigade", DISPONIBLE, changee).pret, false);
  });
});
