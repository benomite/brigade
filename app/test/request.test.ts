// La demande qu'une carte de T'attend écrit dans le second : une phrase qui nomme ce que la file en dit,
// jamais envoyée, jamais un caractère de contrôle.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { requestOf, noteOfTheRequest, REFUSAL_CONTROL } from "../src/request.ts";
import { openTerminals } from "../src/terminals.ts";

const QUESTION = "depuis 2 h  question du manager avant de découper l'épique — à répondre : sur l'issue, il la relit et la découpe ; ou fermer l'issue";

function registry() {
  const writtenOnes: string[] = [];
  const terminals = openTerminals({
    claude: "claude",
    shell: "/bin/zsh",
    ouvrirPty: () => ({ ecrire: (data: string) => void writtenOnes.push(data), redimensionner: () => {}, tuer: () => {} }),
    surSortie: () => {},
    surEtat: () => {},
  });
  return { terminaux: terminals, ecrits: writtenOnes };
}

describe("la demande d'une carte de T'attend", () => {
  test("elle nomme le ticket, le projet et ce que la file en dit, mot pour mot — le geste y est", () => {
    const written = requestOf("brigade", 30, [QUESTION], "Épique de l'app");

    assert.ok("demande" in written);
    assert.match(written.demande, /^Le ticket #30 de brigade \(« Épique de l'app »\) m'attend/);
    assert.ok(written.demande.includes(`« ${QUESTION} »`));
    assert.ok(written.demande.includes("Lis l'issue #30"));
    assert.ok(written.demande.includes("n'agis pas avant mon accord"));
    for (const n of ["1. ce qui se passe, en deux phrases au plus", "2. la question à trancher", "3. ta recommandation, en une phrase", "4. une ligne qui me dit que je peux te demander le détail"]) {
      assert.ok(written.demande.includes(n), n);
    }
    assert.ok(written.demande.includes("seulement une fois que j'ai choisi"));
  });

  test("une entrée sans titre ni mot de plus le dit, sans en inventer — et plusieurs lignes se suivent", () => {
    const only = requestOf("brigade", 12, [""]);
    assert.ok("demande" in only && only.demande.includes("la file n'en dit rien de plus que son numéro") && !only.demande.includes("(«"));

    const two = requestOf("brigade", 12, ["depuis 1 h  pass remontée", "depuis 2 h  86"]);
    assert.ok("demande" in two && two.demande.includes("« depuis 1 h  pass remontée ; depuis 2 h  86 »"));
  });

  test("elle ne commence ni par `!` ni par `/` : le second ne la prend pour aucune commande", () => {
    for (const line of ["!rm -rf /", "/clear", "\\"]) {
      const written = requestOf("brigade", 1, [line]);
      assert.ok("demande" in written && /^[A-Z]/.test(written.demande));
    }
  });

  test("un caractère de contrôle dans ce que la file dit, ou dans le nom, refuse tout : aucun clic ne peut envoyer un Entrée ni un Ctrl-C", () => {
    for (const trap of ["question\r", "question\nrépondre", "ça\x03", "tab\there", "x\x7f"]) {
      assert.deepEqual(requestOf("brigade", 30, [trap]), { refus: REFUSAL_CONTROL });
    }
    assert.deepEqual(requestOf("bri\ngade", 30, [QUESTION]), { refus: REFUSAL_CONTROL });
    assert.deepEqual(requestOf("brigade", 30, [QUESTION], "titre\r"), { refus: REFUSAL_CONTROL });
  });

  test("écrite dans un second qui tourne : sans Entrée, et la note tient en une ligne, sans la recopier", () => {
    const { terminaux: terminals, ecrits: writtenOnes } = registry();
    const project = { nom: "brigade", dossier: "/projets/brigade" };
    terminals.espace(project);
    const written = requestOf("brigade", 30, [QUESTION]);
    assert.ok("demande" in written);

    const said = terminals.inscrire(project, written.demande, noteOfTheRequest);

    assert.deepEqual(writtenOnes, [written.demande]);
    assert.ok(!/[\r\n]$/.test(writtenOnes[0] ?? ""));
    assert.equal(said.note, "demande écrite dans le second — appuie sur Entrée pour l'envoyer");
    assert.ok(!said.note.includes(written.demande));
  });

  test("la note disparaît quand le chef envoie la demande, et l'avertissement tient en une ligne", () => {
    const states: string[] = [];
    const terminals = openTerminals({
      claude: "claude",
      shell: "/bin/zsh",
      ouvrirPty: () => ({ ecrire: () => {}, redimensionner: () => {}, tuer: () => {} }),
      surSortie: () => {},
      surEtat: (terminal) => void states.push(terminal.note),
    });
    const project = { nom: "brigade", dossier: "/projets/brigade" };
    terminals.espace(project);
    const written = requestOf("brigade", 30, [QUESTION]);
    assert.ok("demande" in written);
    const said = terminals.inscrire(project, written.demande, noteOfTheRequest);

    terminals.ecrire(said.id, "a");
    assert.deepEqual(states, []);
    terminals.ecrire(said.id, "\r");

    assert.deepEqual(states, [""]);
    assert.ok(!noteOfTheRequest(true).includes("\n"));
  });

  test("un second qui ne tourne pas est lancé, et rien n'y est écrit", () => {
    const { terminaux: terminals, ecrits: writtenOnes } = registry();
    const project = { nom: "brigade", dossier: "/projets/brigade" };
    const [second] = terminals.espace(project);
    terminals.fermer();
    assert.ok(second);
    // Un registre neuf : le second de ce projet n'a pas de pty tant que l'espace n'est pas ouvert.
    const fresh = registry();
    const said = fresh.terminaux.inscrire(project, "Le ticket #30 m'attend", () => "note");
    assert.deepEqual(fresh.ecrits, []);
    assert.match(said.note, /is not written into a second that is starting/);
    assert.deepEqual(writtenOnes, []);
  });
});
