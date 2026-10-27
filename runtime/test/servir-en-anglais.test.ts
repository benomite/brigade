// Les messages de `servir` et de `service` sont en anglais, sans mélange (#930) :
// chaque message que produisent les deux modules — ce qui part à journald, le
// motif écrit au journal, la ligne `service` de `station` et de `status` — ne
// porte aucun mot de la colonne « français » du glossaire.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { DECLARATION_ECRANS } from "../src/ecran.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { direServiceIndisponible, servicesIndisponibles } from "../src/projections/service.ts";
import { DECLARATION_SERVICE, lireDeclaration, serviceDuWorktree, VARIABLE_DU_PORT } from "../src/service.ts";
import { ouvrirServeurs, type Livraison } from "../src/servir.ts";
import { STATION } from "./aides/cuisine.ts";
import { sansMotFrancais } from "./aides/glossaire.ts";
import { aArreter, ENV_ENFANT, jusqua, repertoireTemporaire } from "./outils.ts";
import { posixOnly } from "./support/plateforme.ts";

const declarer = (commande: string, ...chemins: string[]) => [`commande : ${commande}`, ...chemins.map((chemin) => `interface : ${chemin}`), ""].join("\n");

function atelier(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire);
  const avertissements: string[] = [];
  const ranges: number[] = [];
  const serveurs = ouvrirServeurs({
    journal,
    projet: "brigade",
    station: STATION,
    auteur: `station:${STATION}`,
    avertir: (message) => void avertissements.push(message),
    ranger: async ({ ticket }) => void ranges.push(ticket),
    sondeMs: 5,
  });
  aArreter(t, () => {
    serveurs.fermer();
    journal.fermer();
  });
  const livraison = (ticket: number, declaration: string | null, changes: string[], port: number | null = 20000 + ticket, ecrans: string | null = null): Livraison => {
    const relatif = `worktrees/${ticket}-a`;
    const worktree = join(repertoire, relatif);
    mkdirSync(join(worktree, ".claude/brigade"), { recursive: true });
    if (declaration !== null) writeFileSync(join(worktree, DECLARATION_SERVICE), declaration);
    if (ecrans !== null) writeFileSync(join(worktree, DECLARATION_ECRANS), ecrans);
    const env = { ...ENV_ENFANT, ...(port === null ? {} : { [VARIABLE_DU_PORT]: String(port) }) };
    return { ticket, run: `${ticket}-a`, worktree, relatif, branche: `cook/${ticket}-a`, changes, corps: null, env };
  };
  return { repertoire, journal, serveurs, avertissements, ranges, livraison };
}

test("chaque motif que `service` donne d'un projet non servable est en anglais", (t) => {
  const { repertoire, livraison } = atelier(t);
  // Ni déclaration, ni port, ni dossier lisible : les trois motifs du worktree.
  const sans = livraison(1, null, []);
  const sansPort = livraison(2, declarer("npm start", "app"), [], null);
  const mal = livraison(3, "commande : a\ncommande : b\nport : 3\nsans clé\ninterface : /etc\ninterface : app/*\ninterface : .\ninterface :\ncommande :\n", []);
  const exclusif = livraison(4, "commande : a\nlancement : b\nlancement : c\nlancement :\ninterface : app\n", []);
  const sansCommande = livraison(5, "interface : app\n", []);
  const sansChemin = livraison(6, "lancement : npm start\n", []);
  const portInvalide = livraison(7, declarer("npm start", "app"), [], null);
  portInvalide.env = { ...portInvalide.env, [VARIABLE_DU_PORT]: "70000" };
  mkdirSync(join(repertoire, "illisible", DECLARATION_SERVICE), { recursive: true });

  const dits: string[] = [];
  for (const l of [sans, sansPort, mal, exclusif, sansCommande, sansChemin, portInvalide]) {
    const service = serviceDuWorktree(l.worktree, l.env);
    assert.equal(service.servable, false, l.run);
    if (!service.servable) dits.push(service.pourquoi);
  }
  const illisible = serviceDuWorktree(join(repertoire, "illisible"), {});
  if (!illisible.servable) dits.push(illisible.pourquoi);
  for (const texte of [mal, exclusif, sansCommande, sansChemin]) dits.push(...lireDeclaration(readFileSync(join(texte.worktree, DECLARATION_SERVICE), "utf8")).problemes);
  assert.ok(dits.length >= 8);
  sansMotFrancais(dits);
});

test("chaque message que `servir` envoie à journald, et chaque motif qu'il écrit au journal, est en anglais", { skip: posixOnly("starts preview servers whose commands are POSIX shell lines (exec sleep 30, echo … >&2; exit 3): on the Windows job the servers kept the test directory open, and its removal failed (EPERM)") }, async (t) => {
  const { journal, serveurs, avertissements, ranges, livraison } = atelier(t);

  // Un projet qui ne déclare rien : un motif au journal, rien pour journald.
  assert.equal(serveurs.servir(livraison(1, null, ["app/x"])), false);
  // Mal déclaré, sans port, un port pris, des écrans mal écrits, une commande qui sort d'elle-même.
  assert.equal(serveurs.servir(livraison(2, "commande : npm run dev\n", ["app/x"])), false);
  assert.equal(serveurs.servir(livraison(3, declarer("exec sleep 30", "app"), ["app/x"], null)), false);
  assert.equal(serveurs.servir(livraison(4, declarer("exec sleep 30", "app"), ["app/x"], 20004, "app/x\n/etc : /etc\n")), true);
  assert.equal(serveurs.servir(livraison(5, declarer("exec sleep 30", "app"), ["app/x"], 20004)), false);
  await serveurs.arreter(4, "left");
  assert.equal(serveurs.servir(livraison(6, declarer('echo "boom" >&2; exit 3', "app"), ["app/x"])), true);
  await jusqua(() => ranges.includes(6));
  assert.equal(serveurs.servir(livraison(7, declarer("exec sleep 30", "app"), ["app/x"], 20007, "app/x : ")), true);
  await serveurs.arreter(7, "left");
  assert.equal(serveurs.servir(livraison(8, declarer("exec sleep 30", "app"), ["app/x"], 20008)), true);
  serveurs.fermer();

  assert.ok(avertissements.length >= 5, avertissements.join("\n"));
  // Ce que le serveur a dit lui-même (`boom`) n'est pas à la box : il n'est pas jugé.
  sansMotFrancais(avertissements);
  for (const avertissement of avertissements) assert.match(avertissement, /^brigade: /);

  const motifs = journal.tout().flatMap((fait) => (fait.type === "service.unavailable" ? [String((fait.payload as { why: string }).why)] : []));
  assert.ok(motifs.length >= 3, motifs.join("\n"));
  sansMotFrancais(motifs);
});

test("la ligne `service` de `station` et de `status` dit tout en anglais", (t) => {
  const { journal, serveurs, livraison } = atelier(t);
  serveurs.servir(livraison(1, null, ["app/x"]));
  const [sans] = servicesIndisponibles(journal.base);
  serveurs.servir(livraison(2, declarer("npm start", "app"), ["app/x"], null));
  const [sansPort] = servicesIndisponibles(journal.base);
  assert.ok(sans && sansPort);
  const lignes = [direServiceIndisponible(sans), direServiceIndisponible(sansPort), direServiceIndisponible({ ...sansPort, ticket: null })];
  assert.match(lignes[0] ?? "", /^NOT DECLARED — .* \(delivery of ticket #1\); no server is launched$/);
  assert.match(lignes[1] ?? "", /^NOT SERVABLE — .* \(delivery of ticket #2\); no server is launched$/);
  sansMotFrancais(lignes);
});
