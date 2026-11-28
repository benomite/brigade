// Le terminal du second sous Windows (#1522, épique #1518) : ce que la vue écrit — une commande, puis `\r` — passe
// par le registre des terminaux, réglé comme sous Windows, jusqu'au pty sans rien changer ; et sur un vrai ConPTY, les
// octets que reçoit un process sont ceux de la commande écrite.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { openTerminals, type Launch } from "../../src/terminals.ts";

// Une commande que Windows pourrait abîmer : guillemets, espaces doublés, `!`, `%VAR%`, `\` de chemin.
const WITH_QUOTES = `! gh pr comment 1480 --body "it's  green!  see 'C:\\Users\\chef\\parade' and %USERPROFILE% — \$HOME stays" && echo done!`;

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

// Une ligne `brigade …` et sa forme lancée sous `!`.
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

