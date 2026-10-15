// Le verdict structuré de « Vérifier » : prêt, pas prêt avec ses manques, ou
// vérification plantée — ce que l'app lit sans parser de texte.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Constat } from "../src/installation.ts";
import { PANNES_CONNUES, rendreLaPanne, verdictDeLaPanne, verdictDesConstats, verdictDeVerification, type Manque } from "../src/verdict.ts";

// Une sortie brute, telle que la commande l'écrirait de ces constats : le
// verdict la joint sans la lire.
const rendre = (constats: Constat[]) => `${constats.map((constat) => `  ${constat.etat}  ${constat.texte}`).join("\n")}\n`;
// La panne de #654, telle que Node la lève sur une box où /etc/sudoers.d est à root en 750.
const EACCES = Object.assign(new Error("EACCES: permission denied, lstat '/etc/sudoers.d/regle'"), { code: "EACCES", syscall: "lstat" });

const OK: Constat[] = [
  { ou: "machine", etat: "ok", texte: "répertoire d'état : /srv/brigade/espace" },
  { ou: "depot", etat: "ok", texte: "gates : `.claude/brigade/gates.sh`" },
  { ou: "github", etat: "ok", texte: "labels : les 13 y sont" },
];
const NOTES: Constat[] = [
  { ou: "machine", etat: "note", texte: "la sauvegarde n'est pas programmée (brigade-sauvegarde@espace.timer) : rien ne garde le journal de ce projet", geste: "docs/installer.md, « Déclarer le projet »" },
  { ou: "depot", etat: "note", texte: "pas de `.claude/brigade/worktree-setup.sh` sur `v2` : le cook part dans un worktree neuf tel quel" },
];
const MANQUES: Constat[] = [
  // Une étape que l'app fait d'un bouton.
  { ou: "machine", etat: "manque", texte: "aucune station déclarée (BRIGADE_STATIONS …)", geste: "déclarer une station", etape: "stations", simple: "aucune station n'est déclarée : aucun cook ne partirait", remede: { qui: "chef", action: "stations" } },
  // Une commande exacte, sur la box.
  { ou: "github", etat: "manque", texte: "labels absents du dépôt : fire, prio:1", geste: "la même commande, suivie de `labels`", etape: "verification", simple: "il manque au dépôt 2 des étiquettes", remede: { qui: "chef", commande: "brigade espace installation labels" } },
  // Ce que brigade lève seule.
  { ou: "machine", etat: "manque", texte: "la branche `v2` n'a pas pu être rapportée", etape: "verification", simple: "brigade réessaie seule", remede: { qui: "brigade" } },
  // Sans remède dit : l'étape de l'app, ou la commande de sa flèche.
  { ou: "github", etat: "manque", texte: "la branche d'intégration `v2` n'est pas protégée sur GitHub", geste: "`brigade espace installation protection poser`", etape: "protection" },
  { ou: "machine", etat: "manque", texte: "l'unité brigade@espace.service n'est pas installée", geste: "`sudo cp runtime/deploy/brigade@.service /etc/systemd/system/ && sudo systemctl daemon-reload` — docs/installer.md", etape: "ajout" },
];

describe("une vérification plantée", () => {
  test("EACCES sur /etc/sudoers.d : la vérification n'est pas allée au bout, c'est la panne connue #654, et le chef n'a rien à faire — ce n'est pas « pas prêt »", () => {
    const verdict = verdictDeLaPanne(EACCES);

    assert.equal(verdict.verdict, "plantee");
    assert.notEqual(verdict.verdict, "pas-pret");
    if (verdict.verdict !== "plantee") return;
    assert.equal(verdict.panne.connue?.issue, 654);
    assert.equal(verdict.panne.acteur, "brigade");
    assert.equal(verdict.panne.rienAFaire, true);
    assert.equal(verdict.panne.erreur, EACCES.message);
    assert.deepEqual(verdict.manques, []);
    assert.deepEqual(verdict.aSavoir, []);
    assert.match(verdict.phrase, /n'a pas pu aller au bout : c'est un problème de brigade, pas de ton projet/);
    assert.match(verdict.phrase, /#654/);
    assert.match(verdict.phrase, /tu n'as rien à faire/);
  });

  test("la sortie brute est la ligne d'erreur de la commande, intacte", () => {
    assert.equal(verdictDeLaPanne(EACCES).brut, "brigade : EACCES: permission denied, lstat '/etc/sudoers.d/regle'\n");
    assert.equal(rendreLaPanne(EACCES), verdictDeLaPanne(EACCES).brut);
    // Une sortie brute donnée est jointe telle quelle, et c'est aussi en elle que la panne se reconnaît.
    const brut = "$ ssh box brigade espace installation\nbrigade : EACCES: permission denied, lstat '/etc/sudoers.d/regle'\n→ exit code 1";
    const verdict = verdictDeLaPanne(new Error("sortie de la box"), brut);
    assert.equal(verdict.brut, brut);
    assert.equal(verdict.verdict === "plantee" && verdict.panne.connue?.issue, 654);
  });

  test("une panne que brigade ne connaît pas reste une panne de brigade : pas de numéro, rien à faire pour le chef", () => {
    const verdict = verdictDeLaPanne(new TypeError("Cannot read properties of undefined (reading 'trim')"));

    assert.equal(verdict.verdict, "plantee");
    if (verdict.verdict !== "plantee") return;
    assert.equal(verdict.panne.connue, null);
    assert.equal(verdict.panne.rienAFaire, true);
    assert.equal(verdict.brut, "brigade : Cannot read properties of undefined (reading 'trim')\n");
    assert.match(verdict.phrase, /pas encore connue/);
  });

  test("une EACCES ailleurs que sur /etc/sudoers.d n'est pas prise pour #654", () => {
    const verdict = verdictDeLaPanne(new Error("EACCES: permission denied, open '/srv/brigade/espace/log.db'"));
    assert.equal(verdict.verdict === "plantee" && verdict.panne.connue, null);
  });

  test("chaque panne connue porte son issue et ce qu'elle est", () => {
    for (const panne of PANNES_CONNUES) {
      assert.ok(Number.isInteger(panne.issue) && panne.issue > 0);
      assert.ok(panne.texte.length > 0);
    }
  });

  test("vérifier ne lève jamais : une vérification qui plante rend son verdict", async () => {
    const verdict = await verdictDeVerification(async () => {
      throw EACCES;
    }, rendre);

    assert.equal(verdict.verdict, "plantee");
    assert.equal(verdict.verdict === "plantee" && verdict.panne.connue?.issue, 654);
    assert.equal(verdict.brut, rendreLaPanne(EACCES));
  });
});

describe("une vérification allée au bout", () => {
  test("prêt : aucun manque, les lignes « à savoir » à part, la sortie brute jointe telle quelle", async () => {
    const constats = [...OK, ...NOTES];

    const verdict = await verdictDeVerification(async () => constats, rendre);

    assert.equal(verdict.verdict, "pret");
    assert.deepEqual(verdict.manques, []);
    assert.deepEqual(
      verdict.aSavoir.map((note) => note.texte),
      NOTES.map((note) => note.texte),
    );
    assert.equal(verdict.aSavoir[0]?.geste, NOTES[0]?.geste);
    assert.equal(verdict.brut, rendre(constats));
    assert.match(verdict.phrase, /^prêt/);
  });

  test("pas prêt : exactement N manques, chacun en mots simples, avec qui le lève et, pour le chef, une action de l'app ou une commande exacte", () => {
    const constats = [...OK, ...MANQUES, ...NOTES];
    const verdict = verdictDesConstats(constats, rendre(constats));

    assert.equal(verdict.verdict, "pas-pret");
    assert.equal(verdict.manques.length, MANQUES.length);
    assert.match(verdict.phrase, new RegExp(`^pas prêt : ${MANQUES.length} choses à faire$`));
    const [stations, labels, seule, protection, unite] = verdict.manques as Manque[];
    assert.deepEqual(pour(stations), { texte: "aucune station n'est déclarée : aucun cook ne partirait", acteur: "chef", action: "stations" });
    assert.deepEqual(pour(labels), { texte: "il manque au dépôt 2 des étiquettes", acteur: "chef", commande: "brigade espace installation labels" });
    assert.deepEqual(pour(seule), { texte: "brigade réessaie seule", acteur: "brigade" });
    // Sans mots simples dits, la ligne de la vérification ; sans remède dit, l'étape que l'app fait d'un bouton…
    assert.deepEqual(pour(protection), { texte: "la branche d'intégration `v2` n'est pas protégée sur GitHub", acteur: "chef", action: "protection" });
    // … ou la commande de sa flèche, entière.
    assert.deepEqual(pour(unite), { texte: "l'unité brigade@espace.service n'est pas installée", acteur: "chef", commande: "sudo cp runtime/deploy/brigade@.service /etc/systemd/system/ && sudo systemctl daemon-reload" });
    for (const manque of verdict.manques) {
      assert.ok(manque.texte.length > 0);
      if (manque.acteur === "chef") assert.ok((manque.action === undefined) !== (manque.commande === undefined), `${manque.texte} : une action ou une commande, l'une des deux`);
    }
    // La ligne et la flèche de la vérification restent jointes à chaque manque.
    assert.equal(labels?.constat, "labels absents du dépôt : fire, prio:1");
    assert.equal(labels?.geste, "la même commande, suivie de `labels`");
    assert.equal(verdict.verdict === "pas-pret" && verdict.etapes.join(","), "ajout,verification,stations,protection");
  });

  test("les lignes « à savoir » sont à part et ne changent pas le compte des manques", () => {
    const sansNote = verdictDesConstats([...OK, ...MANQUES], "");
    const avecNotes = verdictDesConstats([...NOTES, ...OK, ...MANQUES, ...NOTES], "");

    assert.equal(sansNote.manques.length, MANQUES.length);
    assert.equal(avecNotes.manques.length, MANQUES.length);
    assert.deepEqual(sansNote.aSavoir, []);
    assert.equal(avecNotes.aSavoir.length, NOTES.length * 2);
    assert.ok(avecNotes.manques.every((manque) => !NOTES.some((note) => note.texte === manque.constat)));
  });

  test("pas prêt : la sortie brute est jointe telle quelle", async () => {
    const constats = [...OK, ...MANQUES, ...NOTES];

    const verdict = await verdictDeVerification(async () => constats, rendre);

    assert.equal(verdict.verdict, "pas-pret");
    assert.equal(verdict.brut, rendre(constats));
  });
});

const pour = (manque: Manque | undefined) => {
  if (manque === undefined) return undefined;
  const { texte, acteur } = manque;
  if (manque.acteur === "brigade") return { texte, acteur };
  return { texte, acteur, ...(manque.action === undefined ? {} : { action: manque.action }), ...(manque.commande === undefined ? {} : { commande: manque.commande }) };
};
