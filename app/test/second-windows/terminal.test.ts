// Du clic au terminal du second sous Windows (#1522, épique #1518) : ce que la vue écrit — la commande, puis `\r` — passe
// par le registre des terminaux, réglé comme sous Windows, jusqu'au pty sans rien changer ; et sur un vrai ConPTY, les
// octets que reçoit un process sont ceux de la commande publiée. Le canal du runtime refuse ce que Windows y glisserait :
// une commande sur deux lignes (`\r\n`).
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { openPty, ptyAvailable } from "../../src/pty.ts";
import { openTerminals, type Launch } from "../../src/terminals.ts";
import { aProposer, propositionLue, Refus } from "../../../runtime/src/second-propositions/proposition.ts";
import { WITH_QUOTES, A } from "./helpers.ts";

const PARADE = { nom: "parade", dossier: "C:\\Users\\chef\\parade" };

function registryWindows() {
  const writtenOnes: string[] = [];
  const launched: Launch[] = [];
  const terminals = openTerminals({
    claude: "claude",
    shell: "powershell.exe",
    argsDuShell: ["-NoLogo"],
    persistantIci: false,
    ouvrirPty(launch) {
      launched.push(launch);
      return { ecrire: (data) => void writtenOnes.push(data), redimensionner: () => {}, tuer: () => {} };
    },
    surSortie: () => {},
    surEtat: () => {},
  });
  return { terminaux: terminals, ecrits: writtenOnes, lances: launched };
}

// Une ligne `brigade …` et sa forme lancée sous `!`, telles que le second les publie.
const LINE_BRIGADE = `cd ~/parade && brigade parade pass 1480 --merge --comment 'ok!  merged'`;
const BRIGADE_UNDER_BANG = `! ${LINE_BRIGADE}`;

describe("le registre, réglé comme sous Windows", () => {
  test("ce que la vue écrit dans le second — la commande, puis `\\r` — arrive au pty octet pour octet, en deux écritures, sans `\\n`", () => {
    const { terminaux: terminals, ecrits: writtenOnes } = registryWindows();
    const [second] = terminals.espace(PARADE);
    assert.ok(second);
    for (const command of [WITH_QUOTES, LINE_BRIGADE, BRIGADE_UNDER_BANG]) {
      writtenOnes.length = 0;
      terminals.ecrire(second.id, command);
      terminals.ecrire(second.id, "\r");
      assert.deepEqual(writtenOnes, [command, "\r"]);
      assert.equal(writtenOnes.join(""), `${command}\r`);
    }
  });

  test("le second d'un poste Windows n'est pas lancé par un shell : `claude` est lancé seul, et un « + shell » est PowerShell, sans session", () => {
    const { terminaux: terminals, lances: launched } = registryWindows();
    terminals.espace(PARADE);
    assert.equal(launched[0]?.commande, "claude");
    terminals.shell(PARADE);
    assert.deepEqual([launched[1]?.commande, launched[1]?.args], ["powershell.exe", ["-NoLogo"]]);
  });
});

describe("le canal du second, pour une commande qui vient de Windows", () => {
  const published = (command: string) => aProposer({ kind: "gesture", command });

  test("guillemets, espaces doublés, `!`, `%VAR%`, `\\` de chemin et lignes `brigade …` sont gardés tels quels", () => {
    for (const command of [WITH_QUOTES, LINE_BRIGADE, BRIGADE_UNDER_BANG]) {
      assert.deepEqual(published(command), { kind: "gesture", command });
      assert.equal(propositionLue({ kind: "gesture", command, id: "g", at: A })?.kind === "gesture" && (propositionLue({ kind: "gesture", command, id: "g", at: A }) as { command: string }).command, command);
    }
  });

  test("une commande qui porte `\\r\\n`, `\\r` ou `\\n` est refusée : Windows y lancerait le début avant la confirmation", () => {
    for (const command of ["! gh pr merge 1480\r\n--merge", "! gh pr merge 1480\r", "! gh pr merge 1480\n"]) {
      assert.throws(() => published(command), Refus);
      assert.equal(propositionLue({ kind: "gesture", command, id: "g", at: A }), null);
    }
  });
});

// Sur un vrai ConPTY : un process lit son entrée brute, et dit en hexadécimal ce qu'il a reçu jusqu'à l'Entrée. Joué là
// où node-pty est livré compilé pour Windows seulement — ailleurs, le pty est un autre (PTY POSIX), éprouvé par pty.test.ts.
const SKIPS = process.platform === "win32" && ptyAvailable ? false : "this test runs on a Windows ConPTY: node-pty is shipped compiled for it, and Enter is `\\r` there";
// Ticket 1645 : sur le runner Windows de la CI, ce test sortait en 474 ms sur un EPERM à la suppression de son dossier
// (le ConPTY y tient son répertoire courant), laissait son pty vivant, et le fichier restait pendu 5 h 39 min
// (« Promise resolution is still pending but the event loop has already resolved »). Les pty sont maintenant tués dans
// `t.after` avant `rmSync`, et lancés dans `tmpdir()`, hors du dossier supprimé : le test rejoue sous Windows.
// Ticket 1685 : ne tuer que les pty vivants. Sous Windows, `kill()` de node-pty forke un agent qui s'attache à la console
// du process ; un process déjà sorti — le lecteur sort de lui-même — le fait lever (« AttachConsole failed »), et cet
// agent, qui hérite de l'environnement du fichier de test et de sa sortie, fait compter son erreur au fichier. Le test
// attend donc la fin du lecteur, et `t.after` ne tue que les pty qui ne sont pas finis.
const READER = `
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

describe("sur un vrai ConPTY", { skip: SKIPS }, () => {
  test("la commande publiée et l'Entrée arrivent au process octet pour octet : ni guillemet perdu, ni `!` mangé, ni `\\n` ajouté", async (t) => {
    const folder = mkdtempSync(join(tmpdir(), "brigade-second-windows-"));
    const ptys: Array<{ tuer: () => void; fini: () => boolean }> = [];
    // Les pty d'abord : un ConPTY vivant tient son répertoire courant, et sa suppression échoue en EPERM.
    t.after(() => {
      for (const p of ptys.filter(({ fini: finished }) => !finished())) try { p.tuer(); } catch { /* déjà mort */ }
      rmSync(folder, { recursive: true, force: true });
    });
    const script = join(folder, "lecteur.cjs");
    writeFileSync(script, READER);
    for (const command of [WITH_QUOTES, BRIGADE_UNDER_BANG]) {
      let output = "";
      let end = false;
      const pty = openPty({ commande: process.execPath, args: [script], dossier: tmpdir(), colonnes: 200, lignes: 40, surSortie: (data) => void (output += data), surFin: () => void (end = true) });
      ptys.push({ tuer: pty.tuer, fini: () => end });
      const wait = async (condition: () => boolean) => {
        const limit = Date.now() + 60_000;
        while (!condition()) {
          if (Date.now() > limit) throw new Error(`jamais arrivé — ${output}`);
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
      };
      await wait(() => output.includes("ready"));
      pty.ecrire(command);
      pty.ecrire("\r");
      await wait(() => /hex:[0-9a-f]*:fin/.test(output));
      const received = Buffer.from(/hex:([0-9a-f]*):fin/.exec(output)?.[1] ?? "", "hex").toString("utf8");
      assert.equal(received, `${command}\r`);
      // Le lecteur sort de lui-même après sa réponse : on attend sa fin plutôt que de tuer un process peut-être sorti.
      await wait(() => end);
    }
  });
});
