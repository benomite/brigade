// Ce qui a échoué dans le setup du projet, en une phrase : ce que sa sortie
// dit manquer à la station, sinon son code et sa dernière ligne ; et le
// passage du corps du ticket de préparation qui le porte.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ceQuiManque, corpsAvecLeSetup, DEBUT, FIN, passageDuSetup, phraseDuSetup } from "../../src/preparation-depot/setup-en-echec.ts";
import { corps } from "../../src/preparation-depot/ticket.ts";

test("les fichiers et les commandes que la sortie dit manquer, dans l'ordre, une fois chacun", () => {
  const sortie = [
    "Installing dependencies…",
    "cp: cannot stat 'apps/api/.env': No such file or directory",
    "./setup.sh: line 9: docker: command not found",
    "cat: .env.local: No such file or directory",
    "sh: 1: psql: not found",
    "zsh: command not found: redis-cli",
    "./setup.sh: line 9: docker: command not found",
    "source: config/dev.env: file not found",
  ].join("\n");
  assert.deepEqual(ceQuiManque(sortie), ["`apps/api/.env`", "`docker`", "`.env.local`", "`psql`", "`redis-cli`", "`config/dev.env`"]);
});

test("un démon Docker qui ne tourne pas se dit comme tel", () => {
  assert.deepEqual(ceQuiManque("Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?"), ["a running Docker daemon"]);
  assert.equal(
    phraseDuSetup({ code: 1, depasse: false, sortie: "Cannot connect to the Docker daemon at unix:///var/run/docker.sock." }, "box/claude").fr,
    "le setup a besoin d'un démon Docker qui tourne, que la station `box/claude` n'a pas",
  );
});

test("ce qui manque fait la phrase, en français et en anglais", () => {
  const sortie = "cp: cannot stat 'apps/api/.env': No such file or directory\n./setup.sh: line 9: docker: command not found\n./setup.sh: line 12: psql: command not found";
  assert.deepEqual(phraseDuSetup({ code: 1, depasse: false, sortie }, "mac/claude"), {
    fr: "le setup a besoin de `apps/api/.env`, `docker` et `psql`, que la station `mac/claude` n'a pas",
    en: "the setup needs `apps/api/.env`, `docker` and `psql`, which the station `mac/claude` does not have",
  });
  assert.equal(phraseDuSetup({ code: 1, depasse: false, sortie: "cat: .env.local: No such file or directory" }, "mac/claude").en, "the setup needs `.env.local`, which the station `mac/claude` does not have");
});

test("rien de nommé : le code de sortie et la dernière ligne, sans accent grave qui casserait la citation", () => {
  assert.deepEqual(phraseDuSetup({ code: 2, depasse: false, sortie: "building…\nerror: `pnpm` lockfile is out of date\n\n" }, "box/claude"), {
    fr: "le setup sort en 2 sur la station `box/claude` : `error: 'pnpm' lockfile is out of date`",
    en: "the setup exits with code 2 on the station `box/claude`: `error: 'pnpm' lockfile is out of date`",
  });
  assert.equal(phraseDuSetup({ code: 1, depasse: false, sortie: "" }, "box/claude").en, "the setup exits with code 1 on the station `box/claude`");
  assert.equal(phraseDuSetup({ code: null, depasse: true, sortie: "waiting for postgres…" }, "box/claude").en, "the setup does not finish within its time limit on the station `box/claude`: `waiting for postgres…`");
  assert.equal(phraseDuSetup({ code: null, depasse: false, sortie: "" }, "box/claude").fr, "le setup a été interrompu sur la station `box/claude`");
});

test("une ligne démesurée est bornée", () => {
  const { en } = phraseDuSetup({ code: 1, depasse: false, sortie: "x".repeat(5000) }, "box/claude");
  assert.ok(en.length < 300, en);
});

test("le passage se pose avant ce que le ticket demande de livrer, se remplace, et se retire en rendant le corps d'origine", () => {
  const origine = corps({ projet: "parade", depot: "benomite/parade", base: "main", presents: {} });
  const premier = corpsAvecLeSetup(origine, passageDuSetup("le setup sort en 1 sur la station `box/claude`"));
  assert.ok(premier.indexOf(DEBUT) > 0 && premier.indexOf(FIN) < premier.indexOf("## À livrer"));
  assert.match(premier, /\*\*Le setup sort en 1 sur la station `box\/claude`\.\*\* Le cook de ce ticket part quand même/);
  // Reposé tel quel : rien ne change.
  assert.equal(corpsAvecLeSetup(premier, passageDuSetup("le setup sort en 1 sur la station `box/claude`")), premier);
  // Une autre cause remplace la première, sans en laisser trace.
  const second = corpsAvecLeSetup(premier, passageDuSetup("le setup a besoin de `psql`, que la station `box/claude` n'a pas"));
  assert.equal(second.split(DEBUT).length, 2);
  assert.doesNotMatch(second, /sort en 1/);
  assert.match(second, /Le setup a besoin de `psql`/);
  assert.equal(corpsAvecLeSetup(second, null), origine);
  assert.equal(corpsAvecLeSetup(origine, null), origine);
});

test("un corps sans la section à livrer reçoit le passage à sa fin", () => {
  const passage = passageDuSetup("le setup sort en 1 sur la station `box/claude`");
  assert.equal(corpsAvecLeSetup("Préparer le dépôt.", passage), `Préparer le dépôt.\n\n${passage}`);
  assert.equal(corpsAvecLeSetup(`Préparer le dépôt.\n\n${passage}`, null), "Préparer le dépôt.");
});
