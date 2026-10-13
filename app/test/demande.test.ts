// La demande qu'une carte de T'attend écrit dans le second : une phrase qui nomme
// l'entrée et ce que la file en dit, jamais envoyée, jamais un caractère de contrôle.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { demandeDe, noteDeLaDemande, REFUS_CONTROLE } from "../src/demande.ts";
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
    assert.match(ecrit.demande, /^Le ticket #30 de brigade \(« Épique de l'app »\) m'attend/);
    assert.ok(ecrit.demande.includes(`« ${QUESTION} »`));
    assert.ok(ecrit.demande.includes("Lis l'issue #30"));
    assert.ok(ecrit.demande.includes("n'agis pas avant mon accord"));
  });

  test("une entrée sans titre ni mot de plus le dit, sans en inventer — et plusieurs lignes se suivent", () => {
    const seule = demandeDe("brigade", 12, [""]);
    assert.ok("demande" in seule && seule.demande.includes("la file n'en dit rien de plus que son numéro") && !seule.demande.includes("(«"));

    const deux = demandeDe("brigade", 12, ["depuis 1 h  pass remontée", "depuis 2 h  86"]);
    assert.ok("demande" in deux && deux.demande.includes("« depuis 1 h  pass remontée ; depuis 2 h  86 »"));
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
    assert.match(dit.note, /sans Entrée/);
    assert.match(dit.note, /dialogue/);
    assert.match(dit.note, /ce risque n'est pas écarté/);
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
    assert.match(dit.note, /n'est pas écrite dans un second qui démarre/);
    assert.deepEqual(ecrits, []);
  });
});
