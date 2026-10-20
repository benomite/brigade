// Le catalogue des remèdes : pour chacun, le projet est mis dans l'état refusé,
// le remède joué par le point d'entrée, et le refus réévalué est levé — ou
// tient encore, avec sa raison en une phrase. Et le classement de chaque refus :
// un remède, ou pourquoi il n'y a pas de bouton.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DEBUT, FIN } from "../../../src/projets/bloc.ts";
import { CODES_DE_REFUS, refus, type CodeDeRefus, type Refus } from "../../../src/projets/refus.ts";
import { executerRemede, type StationDesRemedes } from "../../../src/remedes/executer.ts";
import { remedesDuCatalogue } from "../../../src/remedes/catalogue/index.ts";
import { creerRegistre, REMEDES, SANS_REMEDE } from "../../../src/remedes/registre.ts";
import { CONFIGURATION, lieuxDuProjet, lireFichierDeConfiguration } from "../../../src/station/configuration.ts";

const unePhrase = (texte: string) => /^[A-Z][^\n]*\.$/.test(texte) && !/[.!?] [A-Z]/.test(texte.slice(0, -1));

// Une station dont la racine est un répertoire temporaire, et dont le refus de
// `parade` est celui que `evaluer` en tire à chaque réévaluation.
function uneStation(options: { configuration?: string; evaluer: (racine: string) => CodeDeRefus | null; registre?: ReturnType<typeof creerRegistre> }) {
  const racine = mkdtempSync(join(tmpdir(), "brigade-remedes-"));
  if (options.configuration !== undefined) writeFileSync(join(racine, CONFIGURATION), options.configuration);
  const registre = options.registre ?? creerRegistre(remedesDuCatalogue());
  const relectures: string[] = [];
  const servi = (): Refus | null => {
    const code = options.evaluer(racine);
    return code === null ? null : refus(code, registre);
  };
  const station: StationDesRemedes = {
    refusDe: servi,
    reevaluer: servi,
    contexte: (projet) => ({ projet, racine, env: { HOME: racine }, dire: () => {}, relireLaConfiguration: () => void relectures.push(projet) }),
  };
  const demander = (code: CodeDeRefus) => {
    const remede = registre.pour(code);
    assert.ok(remede, `${code} : un remède`);
    return executerRemede({ project: "parade", refusal: code, remedy: remede.id }, station, registre);
  };
  return { racine, registre, relectures, demander, fichier: join(racine, CONFIGURATION) };
}

const reglagesDeParade = (racine: string) => lireFichierDeConfiguration(join(racine, CONFIGURATION)).projets.find(({ nom }) => nom === "parade")?.reglages;

test("proxy-port-set : le remède retire le réglage du port de la ligne, et le refus est levé", async () => {
  const { racine, demander, relectures, fichier } = uneStation({
    configuration: "autre org/autre v2\nparade org/parade v2 BRIGADE_PROXY_PORT=8080 BRIGADE_LEASE_SECONDS=60\n",
    evaluer: (racine) => (reglagesDeParade(racine)?.BRIGADE_PROXY_PORT !== undefined ? "proxy-port-set" : null),
  });
  assert.deepEqual(await demander("proxy-port-set"), { outcome: "lifted" });
  assert.equal(readFileSync(fichier, "utf8"), "autre org/autre v2\nparade org/parade v2 BRIGADE_LEASE_SECONDS=60\n");
  assert.deepEqual(relectures, ["parade"]);
});

test("proxy-port-set : sans réglage de port sur la ligne, le remède échoue et le refus tient, en une phrase", async () => {
  const { demander } = uneStation({ configuration: "parade org/parade v2\n", evaluer: () => "proxy-port-set" });
  const issue = await demander("proxy-port-set");
  assert.equal(issue.outcome, "holds");
  if (issue.outcome !== "holds") return;
  assert.ok(unePhrase(issue.reason), issue.reason);
  assert.match(issue.reason, /no port setting to remove/);
});

test("hand-written-line : le remède retire la ligne écrite à la main, jamais celle du bloc de l'app, et le refus est levé", async () => {
  const bloc = `${DEBUT}\nparade org/parade v2\nneuf org/neuf v2\n${FIN}`;
  const { demander, fichier } = uneStation({
    configuration: `main org/main v2\nparade org/vieux v1 BRIGADE_LEASE_SECONDS=60\n${bloc}\n`,
    evaluer: (racine) => {
      const texte = readFileSync(join(racine, CONFIGURATION), "utf8").split("\n");
      const dehors = texte.slice(0, texte.indexOf(DEBUT)).some((ligne) => ligne.startsWith("parade "));
      return dehors ? "hand-written-line" : null;
    },
  });
  assert.deepEqual(await demander("hand-written-line"), { outcome: "lifted" });
  assert.equal(readFileSync(fichier, "utf8"), `main org/main v2\n${bloc}\n`);
});

test("configuration-invalid : le remède efface la ligne de l'app, qui la réécrit à neuf ; il laisse la ligne écrite à la main", async () => {
  const { demander, fichier } = uneStation({
    configuration: `parade org/parade v2\n${DEBUT}\nparade org/parade v2 BRIGADE_X=1\nneuf org/neuf v2\n${FIN}\n`,
    evaluer: (racine) => (readFileSync(join(racine, CONFIGURATION), "utf8").includes("BRIGADE_X=1") ? "configuration-invalid" : null),
  });
  assert.deepEqual(await demander("configuration-invalid"), { outcome: "lifted" });
  assert.equal(readFileSync(fichier, "utf8"), `parade org/parade v2\n${DEBUT}\nneuf org/neuf v2\n${FIN}\n`);
});

test("clone-missing : le remède reclone le dépôt de la ligne du projet, à la place du clone de la station ; le refus est levé", async () => {
  const clonages: string[][] = [];
  const registre = creerRegistre(
    remedesDuCatalogue({
      cloner: async (depot, clone, gh) => {
        clonages.push([depot, clone, gh]);
        mkdirSync(clone, { recursive: true });
      },
    }),
  );
  const { racine, demander, relectures } = uneStation({
    configuration: "parade org/parade v2\n",
    registre,
    evaluer: (racine) => (existsSync(lieuxDuProjet(racine, "parade", racine).clone) ? null : "clone-missing"),
  });
  assert.deepEqual(await demander("clone-missing"), { outcome: "lifted" });
  assert.deepEqual(clonages, [["org/parade", lieuxDuProjet(racine, "parade", racine).clone, "gh"]]);
  assert.deepEqual(relectures, ["parade"]);
});

test("clone-missing : un clonage qui échoue laisse le refus en place, avec pourquoi", async () => {
  const registre = creerRegistre(
    remedesDuCatalogue({
      cloner: async () => {
        throw new Error("clone de org/parade en échec — repository not found");
      },
    }),
  );
  const { demander } = uneStation({ configuration: "parade org/parade v2\n", registre, evaluer: () => "clone-missing" });
  const issue = await demander("clone-missing");
  assert.equal(issue.outcome, "holds");
  if (issue.outcome !== "holds") return;
  assert.ok(unePhrase(issue.reason), issue.reason);
  assert.match(issue.reason, /repository not found/);
});

// Un faux `claude` : `update` pose un fichier (ou échoue).
function unFauxClaude(echoue: boolean) {
  const dossier = mkdtempSync(join(tmpdir(), "brigade-faux-claude-"));
  const marque = join(dossier, "mis-a-jour");
  const bin = join(dossier, "claude");
  writeFileSync(bin, echoue ? "#!/bin/sh\necho 'no network' >&2\nexit 1\n" : `#!/bin/sh\n[ "$1" = update ] && touch ${marque}\n`);
  chmodSync(bin, 0o755);
  return { bin, marque, nettoyer: () => rmSync(dossier, { recursive: true, force: true }) };
}

test("sandbox-unusable : le remède met `claude` à jour, et le refus est levé", async () => {
  const faux = unFauxClaude(false);
  try {
    const { demander } = uneStation({ registre: creerRegistre(remedesDuCatalogue({ claudeBin: faux.bin })), evaluer: () => (existsSync(faux.marque) ? null : "sandbox-unusable") });
    assert.deepEqual(await demander("sandbox-unusable"), { outcome: "lifted" });
  } finally {
    faux.nettoyer();
  }
});

test("sandbox-unusable : si la mise à jour échoue, ou ne suffit pas, le refus tient, avec pourquoi en une phrase", async () => {
  const faux = unFauxClaude(true);
  try {
    const { demander } = uneStation({ registre: creerRegistre(remedesDuCatalogue({ claudeBin: faux.bin })), evaluer: () => "sandbox-unusable" });
    const issue = await demander("sandbox-unusable");
    assert.equal(issue.outcome, "holds");
    if (issue.outcome !== "holds") return;
    assert.ok(unePhrase(issue.reason), issue.reason);
    assert.match(issue.reason, /no network/);
  } finally {
    faux.nettoyer();
  }
});

// Le classement : chaque refus a un remède, ou pourquoi il n'y a pas de bouton.
const AVEC_REMEDE: Record<string, { id: string; destructif: boolean }> = {
  "proxy-port-set": { id: "remove-port-setting", destructif: true },
  "hand-written-line": { id: "remove-hand-written-line", destructif: true },
  "configuration-invalid": { id: "rewrite-project-line", destructif: true },
  "clone-missing": { id: "clone-repository-again", destructif: false },
  "sandbox-unusable": { id: "update-claude", destructif: false },
};

test("chaque remède du catalogue porte son drapeau destructif : vrai s'il retire ou efface quelque chose", () => {
  for (const [code, { id, destructif }] of Object.entries(AVEC_REMEDE)) {
    const remede = REMEDES.pour(code);
    assert.equal(remede?.id, id, code);
    assert.equal(remede?.destructif, destructif, `${id} : destructif`);
    const servi = refus(code as CodeDeRefus);
    assert.ok("remedy" in servi, code);
    if ("remedy" in servi) {
      assert.equal(servi.remedy.destructive, destructif, `${id} : drapeau du descripteur`);
      assert.ok(unePhrase(servi.remedy.description), `${id} : description`);
    }
  }
});

test("un refus sans remède porte pourquoi il n'y a pas de bouton, en une phrase non vide", () => {
  const sans = CODES_DE_REFUS.filter((code) => !(code in AVEC_REMEDE));
  assert.deepEqual([...sans].sort(), ["already-served", "clone-failed", "decisions-not-written", "door-not-open", "fetch-blocked", "handed-over-elsewhere", "push-blocked", "unexpected"]);
  for (const code of sans) {
    assert.equal(REMEDES.pour(code), null, code);
    const servi = refus(code);
    assert.ok("noRemedy" in servi, code);
    assert.ok(SANS_REMEDE[code].trim() !== "" && unePhrase(SANS_REMEDE[code]), `${code} : ${SANS_REMEDE[code]}`);
    if ("noRemedy" in servi) assert.equal(servi.noRemedy, SANS_REMEDE[code]);
  }
});

test("aucun refus ne laisse un geste au terminal ou à l'édition à la main dans son action", () => {
  for (const code of Object.keys(AVEC_REMEDE)) {
    const { action } = refus(code as CodeDeRefus);
    assert.doesNotMatch(action, /configuration\b.*\bremove|command|terminal|edit/i, code);
  }
});
