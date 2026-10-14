// La demande qu'une carte de T'attend — ou une ligne de la bande d'alertes dont le geste
// demande du jugement — écrit dans le second : une phrase qui nomme ce que la file en dit,
// jamais envoyée, jamais un caractère de contrôle.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Alerte } from "../src/alertes.ts";
import { demandeDe, demandeDeLAlerte, noteDeLaDemande, REFUS_CONTROLE, REFUS_CONTROLE_ALERTE } from "../src/demande.ts";
import { ouvrirTerminaux } from "../src/terminaux.ts";

const QUESTION = "depuis 2 h  question du manager avant de découper l'épique — à répondre : sur l'issue, il la relit et la découpe ; ou fermer l'issue";

function registre() {
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
    const ecrit = demandeDe("brigade", 30, [QUESTION], "Épique de l'app");

    assert.ok("demande" in ecrit);
    assert.match(ecrit.demande, /^Ticket #30 of brigade \(“Épique de l'app”\) is awaiting me/);
    assert.ok(ecrit.demande.includes(`“${QUESTION}”`));
    assert.ok(ecrit.demande.includes("Read issue #30"));
    assert.ok(ecrit.demande.includes("do not act before I agree"));
  });

  test("une entrée sans titre ni mot de plus le dit, sans en inventer — et plusieurs lignes se suivent", () => {
    const seule = demandeDe("brigade", 12, [""]);
    assert.ok("demande" in seule && seule.demande.includes("the queue says nothing more about it than its number") && !seule.demande.includes("(“"));

    const deux = demandeDe("brigade", 12, ["depuis 1 h  pass remontée", "depuis 2 h  86"]);
    assert.ok("demande" in deux && deux.demande.includes("“depuis 1 h  pass remontée ; depuis 2 h  86”"));
  });

  test("elle ne commence ni par `!` ni par `/` : le second ne la prend pour aucune commande", () => {
    for (const ligne of ["!rm -rf /", "/clear", "\\"]) {
      const ecrit = demandeDe("brigade", 1, [ligne]);
      assert.ok("demande" in ecrit && /^[A-Z]/.test(ecrit.demande));
    }
  });

  test("un caractère de contrôle dans ce que la file dit, ou dans le nom, refuse tout : aucun clic ne peut envoyer un Entrée ni un Ctrl-C", () => {
    for (const piege of ["question\r", "question\nrépondre", "ça\x03", "tab\there", "x\x7f"]) {
      assert.deepEqual(demandeDe("brigade", 30, [piege]), { refus: REFUS_CONTROLE });
    }
    assert.deepEqual(demandeDe("bri\ngade", 30, [QUESTION]), { refus: REFUS_CONTROLE });
    assert.deepEqual(demandeDe("brigade", 30, [QUESTION], "titre\r"), { refus: REFUS_CONTROLE });
  });

  test("écrite dans un second qui tourne : sans Entrée, et la note dit le risque d'un dialogue — il n'est pas écarté", () => {
    const { terminaux, ecrits } = registre();
    const projet = { nom: "brigade", dossier: "/projets/brigade" };
    terminaux.espace(projet);
    const ecrit = demandeDe("brigade", 30, [QUESTION]);
    assert.ok("demande" in ecrit);

    const dit = terminaux.inscrire(projet, ecrit.demande, noteDeLaDemande(ecrit.demande));

    assert.deepEqual(ecrits, [ecrit.demande]);
    assert.ok(!/[\r\n]$/.test(ecrits[0] ?? ""));
    assert.equal(dit.note, noteDeLaDemande(ecrit.demande));
    assert.match(dit.note, /without Enter/);
    assert.match(dit.note, /dialog/);
    assert.match(dit.note, /this risk is not ruled out/);
  });

  test("un second qui ne tourne pas est lancé, et rien n'y est écrit", () => {
    const { terminaux, ecrits } = registre();
    const projet = { nom: "brigade", dossier: "/projets/brigade" };
    const [second] = terminaux.espace(projet);
    terminaux.fermer();
    assert.ok(second);
    // Un registre neuf : le second de ce projet n'a pas de pty tant que l'espace n'est pas ouvert.
    const neuf = registre();
    const dit = neuf.terminaux.inscrire(projet, "Le ticket #30 m'attend", "note");
    assert.deepEqual(neuf.ecrits, []);
    assert.match(dit.note, /is not written into a second that is starting/);
    assert.deepEqual(ecrits, []);
  });
});

describe("la demande d'une ligne de la bande d'alertes : le geste avec jugement", () => {
  const GELEE: Alerte = {
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
    const ecrit = demandeDeLAlerte("parade", GELEE);

    assert.ok("demande" in ecrit);
    assert.match(ecrit.demande, /^The alert band of parade says: “aucune station déclarée : aucun cook ne part, la cuisine est gelée”/);
    // Les lignes de la box, bout à bout : un retour à la ligne aurait envoyé la demande.
    assert.ok(ecrit.demande.includes("“AUCUNE DÉCLARÉE depuis 1 h 00 ;   déclarer une station sur la box”"));
    assert.ok(ecrit.demande.includes(`“${GELEE.geste}” — its cost: ${GELEE.prix}`));
    assert.ok(ecrit.demande.includes("Do not act before I agree"));
    assert.doesNotMatch(ecrit.demande, /[\r\n]/);
  });

  test("un caractère de contrôle dans ce que la ligne dit refuse tout : aucun clic ne peut envoyer un Entrée", () => {
    for (const piege of ["gelée\r", "x\x03", "tab\there"]) {
      assert.deepEqual(demandeDeLAlerte("parade", { ...GELEE, dit: piege }), { refus: REFUS_CONTROLE_ALERTE });
      assert.deepEqual(demandeDeLAlerte("parade", { ...GELEE, pourquoi: piege }), { refus: REFUS_CONTROLE_ALERTE });
    }
  });

  test("écrite dans le second : rien d'autre que la phrase, sans Entrée — elle ne part que de l'Entrée du chef", () => {
    const { terminaux, ecrits } = registre();
    const projet = { nom: "parade", dossier: "/projets/parade" };
    terminaux.espace(projet);
    const ecrit = demandeDeLAlerte("parade", GELEE);
    assert.ok("demande" in ecrit);

    const dit = terminaux.inscrire(projet, ecrit.demande, noteDeLaDemande(ecrit.demande));

    assert.deepEqual(ecrits, [ecrit.demande]);
    assert.ok(ecrits.every((donnees) => !/[\r\n]/.test(donnees)));
    assert.match(dit.note, /without Enter/);
  });
});
