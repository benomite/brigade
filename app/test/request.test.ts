// La demande qu'une carte de T'attend — ou une ligne de la bande d'alertes dont le geste
// demande du jugement — écrit dans le second : une phrase qui nomme ce que la file en dit,
// jamais envoyée, jamais un caractère de contrôle.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Alert } from "../src/alerts.ts";
import { requestDe, requestDeLAlert, noteDeLaRequest, REFUSAL_CONTROLE, REFUSAL_CONTROLE_ALERT } from "../src/request.ts";
import { ouvrirTerminaux } from "../src/terminaux.ts";

const QUESTION = "depuis 2 h  question du manager avant de découper l'épique — à répondre : sur l'issue, il la relit et la découpe ; ou fermer l'issue";

function registry() {
  const ecrits: string[] = [];
  const terminaux = ouvrirTerminaux({
    claude: "claude",
    shell: "/bin/zsh",
    ouvrirPty: () => ({ ecrire: (donnees: string) => void ecrits.push(donnees), redimensionner: () => {}, tuer: () => {} }),
    surSortie: () => {},
    surEtat: () => {},
  });
  return { terminaux, ecrits };
}

describe("la demande d'une carte de T'attend", () => {
  test("elle nomme le ticket, le projet et ce que la file en dit, mot pour mot — le geste y est", () => {
    const ecrit = requestDe("brigade", 30, [QUESTION], "Épique de l'app");

    assert.ok("demande" in ecrit);
    assert.match(ecrit.demande, /^Le ticket #30 de brigade \(« Épique de l'app »\) m'attend/);
    assert.ok(ecrit.demande.includes(`« ${QUESTION} »`));
    assert.ok(ecrit.demande.includes("Lis l'issue #30"));
    assert.ok(ecrit.demande.includes("n'agis pas avant mon accord"));
    for (const n of ["1. ce qui se passe, en deux phrases au plus", "2. la question à trancher", "3. ta recommandation, en une phrase", "4. une ligne qui me dit que je peux te demander le détail"]) {
      assert.ok(ecrit.demande.includes(n), n);
    }
    assert.ok(ecrit.demande.includes("seulement une fois que j'ai choisi"));
  });

  test("une entrée sans titre ni mot de plus le dit, sans en inventer — et plusieurs lignes se suivent", () => {
    const only = requestDe("brigade", 12, [""]);
    assert.ok("demande" in only && only.demande.includes("la file n'en dit rien de plus que son numéro") && !only.demande.includes("(«"));

    const deux = requestDe("brigade", 12, ["depuis 1 h  pass remontée", "depuis 2 h  86"]);
    assert.ok("demande" in deux && deux.demande.includes("« depuis 1 h  pass remontée ; depuis 2 h  86 »"));
  });

  test("elle ne commence ni par `!` ni par `/` : le second ne la prend pour aucune commande", () => {
    for (const line of ["!rm -rf /", "/clear", "\\"]) {
      const ecrit = requestDe("brigade", 1, [line]);
      assert.ok("demande" in ecrit && /^[A-Z]/.test(ecrit.demande));
    }
  });

  test("un caractère de contrôle dans ce que la file dit, ou dans le nom, refuse tout : aucun clic ne peut envoyer un Entrée ni un Ctrl-C", () => {
    for (const piege of ["question\r", "question\nrépondre", "ça\x03", "tab\there", "x\x7f"]) {
      assert.deepEqual(requestDe("brigade", 30, [piege]), { refus: REFUSAL_CONTROLE });
    }
    assert.deepEqual(requestDe("bri\ngade", 30, [QUESTION]), { refus: REFUSAL_CONTROLE });
    assert.deepEqual(requestDe("brigade", 30, [QUESTION], "titre\r"), { refus: REFUSAL_CONTROLE });
  });

  test("écrite dans un second qui tourne : sans Entrée, et la note tient en une ligne, sans la recopier", () => {
    const { terminaux, ecrits } = registry();
    const project = { nom: "brigade", dossier: "/projets/brigade" };
    terminaux.espace(project);
    const ecrit = requestDe("brigade", 30, [QUESTION]);
    assert.ok("demande" in ecrit);

    const dit = terminaux.inscrire(project, ecrit.demande, noteDeLaRequest);

    assert.deepEqual(ecrits, [ecrit.demande]);
    assert.ok(!/[\r\n]$/.test(ecrits[0] ?? ""));
    assert.equal(dit.note, "demande écrite dans le second — appuie sur Entrée pour l'envoyer");
    assert.ok(!dit.note.includes(ecrit.demande));
  });

  test("la note disparaît quand le chef envoie la demande, et l'avertissement tient en une ligne", () => {
    const states: string[] = [];
    const terminaux = ouvrirTerminaux({
      claude: "claude",
      shell: "/bin/zsh",
      ouvrirPty: () => ({ ecrire: () => {}, redimensionner: () => {}, tuer: () => {} }),
      surSortie: () => {},
      surEtat: (terminal) => void states.push(terminal.note),
    });
    const project = { nom: "brigade", dossier: "/projets/brigade" };
    terminaux.espace(project);
    const ecrit = requestDe("brigade", 30, [QUESTION]);
    assert.ok("demande" in ecrit);
    const dit = terminaux.inscrire(project, ecrit.demande, noteDeLaRequest);

    terminaux.ecrire(dit.id, "a");
    assert.deepEqual(states, []);
    terminaux.ecrire(dit.id, "\r");

    assert.deepEqual(states, [""]);
    assert.ok(!noteDeLaRequest(true).includes("\n"));
  });

  test("un second qui ne tourne pas est lancé, et rien n'y est écrit", () => {
    const { terminaux, ecrits } = registry();
    const project = { nom: "brigade", dossier: "/projets/brigade" };
    const [second] = terminaux.espace(project);
    terminaux.fermer();
    assert.ok(second);
    // Un registre neuf : le second de ce projet n'a pas de pty tant que l'espace n'est pas ouvert.
    const neuf = registry();
    const dit = neuf.terminaux.inscrire(project, "Le ticket #30 m'attend", () => "note");
    assert.deepEqual(neuf.ecrits, []);
    assert.match(dit.note, /is not written into a second that is starting/);
    assert.deepEqual(ecrits, []);
  });
});

describe("la demande d'une ligne de la bande d'alertes : le geste avec jugement", () => {
  const GELEE: Alert = {
    sujet: "cuisine",
    verifie: true,
    ton: "rouge",
    dit: "aucune station déclarée : aucun cook ne part, la cuisine est gelée",
    releve: "AUCUNE DÉCLARÉE depuis 1 h 00\n  déclarer une station sur la box",
    geste: "déclarer une station, puis redémarrer le runtime",
    appel: { demande: true },
    prix: "un redémarrage du runtime : aucun cook en vol à cette lecture, rien n'est interrompu",
  };

  test("elle nomme le projet, ce que la ligne dit, ce que la box en écrit mot pour mot, le geste et son prix — et demande d'attendre l'accord du chef", () => {
    const ecrit = requestDeLAlert("parade", GELEE);

    assert.ok("demande" in ecrit);
    assert.match(ecrit.demande, /^La bande d'alertes de parade dit : « aucune station déclarée : aucun cook ne part, la cuisine est gelée »/);
    // Les lignes de la box, bout à bout : un retour à la ligne aurait envoyé la demande.
    assert.ok(ecrit.demande.includes("« AUCUNE DÉCLARÉE depuis 1 h 00 ;   déclarer une station sur la box »"));
    assert.ok(ecrit.demande.includes(`« ${GELEE.geste} » — son prix : ${GELEE.prix}`));
    assert.ok(ecrit.demande.includes("n'agis pas avant mon accord"));
    assert.ok(ecrit.demande.includes("4. une ligne qui me dit que je peux te demander le détail"));
    assert.ok(ecrit.demande.includes("seulement une fois que j'ai choisi"));
    assert.doesNotMatch(ecrit.demande, /[\r\n]/);
  });

  test("un caractère de contrôle dans ce que la ligne dit refuse tout : aucun clic ne peut envoyer un Entrée", () => {
    for (const piege of ["gelée\r", "x\x03", "tab\there"]) {
      assert.deepEqual(requestDeLAlert("parade", { ...GELEE, dit: piege }), { refus: REFUSAL_CONTROLE_ALERT });
      assert.deepEqual(requestDeLAlert("parade", { ...GELEE, pourquoi: piege }), { refus: REFUSAL_CONTROLE_ALERT });
    }
  });

  test("écrite dans le second : rien d'autre que la phrase, sans Entrée — elle ne part que de l'Entrée du chef", () => {
    const { terminaux, ecrits } = registry();
    const project = { nom: "parade", dossier: "/projets/parade" };
    terminaux.espace(project);
    const ecrit = requestDeLAlert("parade", GELEE);
    assert.ok("demande" in ecrit);

    const dit = terminaux.inscrire(project, ecrit.demande, noteDeLaRequest);

    assert.deepEqual(ecrits, [ecrit.demande]);
    assert.ok(ecrits.every((donnees) => !/[\r\n]/.test(donnees)));
    assert.match(dit.note, /appuie sur Entrée/);
  });
});
