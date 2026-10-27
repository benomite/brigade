// Le geste d'enrôlement et ce que le serveur dit de lui : la home prépare par
// `brigade-enrolement prepare`, le serveur se lit lui-même — son nom, sa
// machine, sa plateforme pour capacité, sa cloison.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { principal } from "../../src/enrolement/enrolement-cli.ts";
import { machineCourante, nomDeMachine, presenterLaMachine, type Machine } from "../../src/enrolement/presentation.ts";
import { ouvrirRegistre } from "../../src/stations-globales/registre.ts";
import { appeler, ENV_ENFANT, repertoireTemporaire } from "../outils.ts";
import { posixOnly } from "../support/plateforme.ts";

const GESTE = join(import.meta.dirname, "../../deploy/brigade-enrolement");

const lancer = (args: string[], env: Record<string, string>) =>
  new Promise<{ statut: number; sortie: string; erreurs: string }>((resolve) => {
    execFile(GESTE, args, { env: { ...ENV_ENFANT, ...env }, encoding: "utf8" }, (erreur, sortie, erreurs) => {
      resolve({ statut: erreur ? (typeof erreur.code === "number" ? erreur.code : -1) : 0, sortie, erreurs });
    });
  });

test("le nom d'une machine : la première étiquette de son hôte, en minuscules, chiffres et tirets", () => {
  assert.equal(nomDeMachine("srv-01.example.org"), "srv-01");
  assert.equal(nomDeMachine("Box_Du_Chef"), "box-du-chef");
  assert.equal(nomDeMachine("--x--"), "x");
  assert.equal(nomDeMachine(""), "serveur");
});

test("la machine se présente avec sa plateforme pour capacité, celles qu'on lui ajoute, et sa cloison", () => {
  const debian: Machine = { hostname: "srv-01.example.org", plateforme: "linux", description: "Debian GNU/Linux 13 (trixie)", cloisonnee: false };
  assert.deepEqual(presenterLaMachine(debian), { nom: "srv-01", machine: "Debian GNU/Linux 13 (trixie)", capacites: ["linux"], cloisonnee: false });
  assert.deepEqual(presenterLaMachine({ ...debian, plateforme: "win32" }, { nom: "windows-de-test", capacites: ["obs", "windows"] }).capacites, ["windows", "obs"]);
  assert.deepEqual(presenterLaMachine({ ...debian, plateforme: "darwin" }).capacites, ["macos"]);
});

test("ce qu'est la machine se lit dans son os-release ; sa cloison, dans les drop-ins de la box", { skip: process.platform !== "linux" && "os-release ne se lit que sous Linux" }, (t) => {
  const racine = repertoireTemporaire(t);
  mkdirSync(join(racine, "etc/systemd/system/brigade@boutique.service.d"), { recursive: true });
  writeFileSync(join(racine, "etc/os-release"), 'NAME="Debian GNU/Linux"\nPRETTY_NAME="Debian GNU/Linux 13 (trixie)"\n');
  assert.equal(machineCourante(racine).description, "Debian GNU/Linux 13 (trixie)");
  // Un projet sans cloison ne la donne pas à la machine.
  assert.equal(machineCourante(racine).cloisonnee, false);
  writeFileSync(join(racine, "etc/systemd/system/brigade@boutique.service.d/cloison.conf"), "[Service]\n");
  assert.equal(machineCourante(racine).cloisonnee, true);
});

test("`prepare` rend le code et la commande en JSON, au registre que la home lui nomme", { skip: posixOnly("runs deploy/brigade-enrolement `prepare` and expects the code, the command and its expiry in JSON for the registry the home names; the gesture is an extensionless bash script, which Node's execFile cannot start on Windows") }, async (t) => {
  const registre = repertoireTemporaire(t);

  const { statut, sortie, erreurs } = await lancer(["prepare", "--to", "chef@box", "--registry", registre], { HOME: repertoireTemporaire(t) });

  assert.equal(statut, 0, erreurs);
  const { code, command, expiresAt } = JSON.parse(sortie) as { code: string; command: string; expiresAt: string };
  assert.match(code, /^[0-9A-Z]{5}-[0-9A-Z]{5}$/);
  assert.ok(command.includes(` present '${code}' --to 'chef@box' `), command);
  assert.ok(command.includes(` --registry '${registre}'`), command);
  assert.ok(Date.parse(expiresAt) > Date.now());
  assert.match(erreurs, /lance cette commande sur le serveur/);
});

test("`receive` sans présentation, ou un geste mal écrit, est refusé sans rien écrire", { skip: posixOnly("expects malformed CLI calls refused, then runs deploy/brigade-enrolement `present` with what ssh must not receive and expects usage each time; the gesture is an extensionless bash script, which Node's execFile cannot start on Windows") }, async (t) => {
  const repertoire = repertoireTemporaire(t);
  for (const args of [["receive", "--registry", repertoire], ["present"], ["prepare", "--registry", repertoire], ["inconnu"], []]) {
    const { fin } = appeler((appel) => principal(appel, async () => "pas du JSON"), args, { HOME: repertoire });
    assert.equal(await fin, 2, args.join(" "));
  }
  const registre = ouvrirRegistre(repertoire);
  t.after(() => registre.fermer());
  assert.deepEqual(registre.liste(), []);
  // Le geste refuse ce que `ssh` ne doit pas recevoir.
  for (const args of [
    ["present", "ABCDE-FGHJK", "--to", "-oProxyCommand=x", "--receiver", "/r", "--registry", "/s"],
    ["present", "ABCDE-FGHJK", "--to", "chef@box", "--receiver", "/r'; id; '", "--registry", "/s"],
    ["present", "ABCDE-FGHJK", "--to", "chef@box", "--receiver", "relatif", "--registry", "/s"],
    ["present", "ABCDE-FGHJK", "--to", "chef@box", "--receiver", "/r"],
  ]) {
    assert.equal((await lancer(args, { HOME: repertoire, BRIGADE_SSH_BIN: "/bin/false" })).statut, 64, args.join(" "));
  }
});
