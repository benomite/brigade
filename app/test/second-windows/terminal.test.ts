// Du clic au terminal du second sous Windows (#1522, épique #1518) : ce que la vue écrit — la commande, puis `\r` — passe
// par le registre des terminaux, réglé comme sous Windows, jusqu'au pty sans rien changer ; et sur un vrai ConPTY, les
// octets que reçoit un process sont ceux de la commande publiée. Le canal du runtime refuse ce que Windows y glisserait :
// une commande sur deux lignes (`\r\n`).
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ouvrirPty, ptyDisponible } from "../../src/pty.ts";
import { ouvrirTerminaux, type Lancement } from "../../src/terminaux.ts";
import { aProposer, propositionLue, Refus } from "../../../runtime/src/second-propositions/proposition.ts";
import { AVEC_GUILLEMETS, A, LIGNE_SSH, SSH_SOUS_BANG } from "./aides.ts";

const PARADE = { nom: "parade", dossier: "C:\\Users\\chef\\parade" };

function registreWindows() {
  const ecrits: string[] = [];
  const lances: Lancement[] = [];
  const terminaux = ouvrirTerminaux({
    claude: "claude",
    shell: "powershell.exe",
    argsDuShell: ["-NoLogo"],
    persistantIci: false,
    ouvrirPty(lancement) {
      lances.push(lancement);
      return { ecrire: (donnees) => void ecrits.push(donnees), redimensionner: () => {}, tuer: () => {} };
    },
    surSortie: () => {},
    surEtat: () => {},
  });
  return { terminaux, ecrits, lances };
}

describe("le registre, réglé comme sous Windows", () => {
  test("ce que la vue écrit dans le second — la commande, puis `\\r` — arrive au pty octet pour octet, en deux écritures, sans `\\n`", () => {
    const { terminaux, ecrits } = registreWindows();
    const [second] = terminaux.espace(PARADE);
    assert.ok(second);
    for (const commande of [AVEC_GUILLEMETS, LIGNE_SSH, SSH_SOUS_BANG]) {
      ecrits.length = 0;
      terminaux.ecrire(second.id, commande);
      terminaux.ecrire(second.id, "\r");
      assert.deepEqual(ecrits, [commande, "\r"]);
      assert.equal(ecrits.join(""), `${commande}\r`);
    }
  });

  test("le second d'un poste Windows n'est pas lancé par un shell : `claude` est lancé seul, et un « + shell » est PowerShell, sans session", () => {
    const { terminaux, lances } = registreWindows();
    terminaux.espace(PARADE);
    assert.equal(lances[0]?.commande, "claude");
    terminaux.shell(PARADE);
    assert.deepEqual([lances[1]?.commande, lances[1]?.args], ["powershell.exe", ["-NoLogo"]]);
  });
});

describe("le canal du second, pour une commande qui vient de Windows", () => {
  const publiee = (command: string) => aProposer({ kind: "gesture", command });

  test("guillemets, espaces doublés, `!`, `%VAR%`, `\\` de chemin et lignes `ssh … brigade …` sont gardés tels quels", () => {
    for (const command of [AVEC_GUILLEMETS, LIGNE_SSH, SSH_SOUS_BANG]) {
      assert.deepEqual(publiee(command), { kind: "gesture", command });
      assert.equal(propositionLue({ kind: "gesture", command, id: "g", at: A })?.kind === "gesture" && (propositionLue({ kind: "gesture", command, id: "g", at: A }) as { command: string }).command, command);
    }
  });

  test("une commande qui porte `\\r\\n`, `\\r` ou `\\n` est refusée : Windows y lancerait le début avant la confirmation", () => {
    for (const command of ["! gh pr merge 1480\r\n--merge", "! gh pr merge 1480\r", "! gh pr merge 1480\n"]) {
      assert.throws(() => publiee(command), Refus);
      assert.equal(propositionLue({ kind: "gesture", command, id: "g", at: A }), null);
    }
  });
});

// Sur un vrai ConPTY : un process lit son entrée brute, et dit en hexadécimal ce qu'il a reçu jusqu'à l'Entrée. Joué là
// où node-pty est livré compilé pour Windows seulement — ailleurs, le pty est un autre (PTY POSIX), éprouvé par pty.test.ts.
const SAUTE = process.platform === "win32" && ptyDisponible ? false : "this test runs on a Windows ConPTY: node-pty is shipped compiled for it, and Enter is `\\r` there";
// Ticket 1645 : sur le runner Windows de la CI, ce test sortait en 474 ms sur un EPERM à la suppression de son dossier
// (le ConPTY y tient son répertoire courant), laissait son pty vivant, et le fichier restait pendu 5 h 39 min
// (« Promise resolution is still pending but the event loop has already resolved »). Les pty sont maintenant tués dans
// `t.after` avant `rmSync`, et lancés dans `tmpdir()`, hors du dossier supprimé : le test rejoue sous Windows.
const LECTEUR = `
process.stdin.setRawMode(true);
let recu = Buffer.alloc(0);
process.stdout.write("ready\\r\\n");
process.stdin.on("data", (morceau) => {
  recu = Buffer.concat([recu, morceau]);
  if (recu.includes(13)) {
    process.stdout.write("hex:" + recu.toString("hex") + ":fin\\r\\n");
    process.exit(0);
  }
});
`;

describe("sur un vrai ConPTY", { skip: SAUTE }, () => {
  test("la commande publiée et l'Entrée arrivent au process octet pour octet : ni guillemet perdu, ni `!` mangé, ni `\\n` ajouté", async (t) => {
    const dossier = mkdtempSync(join(tmpdir(), "brigade-second-windows-"));
    const ptys: Array<{ tuer: () => void }> = [];
    // Les pty d'abord : un ConPTY vivant tient son répertoire courant, et sa suppression échoue en EPERM.
    t.after(() => {
      for (const p of ptys) try { p.tuer(); } catch { /* déjà mort */ }
      rmSync(dossier, { recursive: true, force: true });
    });
    const script = join(dossier, "lecteur.cjs");
    writeFileSync(script, LECTEUR);
    for (const commande of [AVEC_GUILLEMETS, SSH_SOUS_BANG]) {
      let sortie = "";
      const pty = ouvrirPty({ commande: process.execPath, args: [script], dossier: tmpdir(), colonnes: 200, lignes: 40, surSortie: (donnees) => void (sortie += donnees), surFin: () => {} });
      ptys.push(pty);
      const attendre = async (condition: () => boolean) => {
        const limite = Date.now() + 60_000;
        while (!condition()) {
          if (Date.now() > limite) throw new Error(`jamais arrivé — ${sortie}`);
          await new Promise((resoudre) => setTimeout(resoudre, 5));
        }
      };
      await attendre(() => sortie.includes("ready"));
      pty.ecrire(commande);
      pty.ecrire("\r");
      await attendre(() => /hex:[0-9a-f]*:fin/.test(sortie));
      const recu = Buffer.from(/hex:([0-9a-f]*):fin/.exec(sortie)?.[1] ?? "", "hex").toString("utf8");
      assert.equal(recu, `${commande}\r`);
      pty.tuer();
    }
  });
});
