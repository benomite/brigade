// The script played against a stubbed GitHub client: a repo in memory.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ETIQUETTES } from "../../../runtime/src/etiquettes.ts";
import { estEnFrancais, passer, type Github } from "../migrer.ts";

type Label = { name: string; description: string | null };

function fauxGithub(labels: Label[], items: Record<string, unknown[]> = {}) {
  const ecritures: Array<{ chemin: string; champs: Record<string, string> }> = [];
  const github: Github = {
    lire: (chemin) => {
      if (chemin.includes("/labels")) return labels;
      for (const [debut, liste] of Object.entries(items)) if (chemin.includes(debut)) return liste;
      throw new Error(`unexpected read ${chemin}`);
    },
    ecrire: (chemin, champs) => {
      ecritures.push({ chemin, champs });
      const label = labels.find((l) => chemin.endsWith(`/${encodeURIComponent(l.name)}`));
      if (label === undefined) throw new Error(`unknown label ${chemin}`);
      if (champs.new_name !== undefined) label.name = champs.new_name;
      if (champs.description !== undefined) label.description = champs.description;
    },
  };
  return { github, ecritures, labels };
}

// A repo set up before the catalogue: the old name, French descriptions, one missing description.
const depart = (): Label[] => [
  { name: "hors-cuisine", description: "Ticket servi ailleurs" },
  { name: "fire", description: "À servir" },
  { name: "taken", description: null },
  { name: "fix", description: ETIQUETTES.find((e) => e.name === "fix")!.description },
];

describe("labels", () => {
  test("dry run prints the rename and the description changes and writes nothing", () => {
    const { github, ecritures, labels } = fauxGithub(depart());
    const { sortie, code } = passer("o/r", { appliquer: false, audit: false }, github);
    const texte = sortie.join("\n");
    assert.equal(code, 0);
    assert.match(texte, /rename: hors-cuisine -> served-elsewhere/);
    assert.match(texte, /description: fire -> To be served/);
    assert.match(texte, /description: taken -> A cook holds the ticket/);
    assert.doesNotMatch(texte, /description: fix/);
    assert.match(texte, /dry run/);
    assert.deepEqual(ecritures, []);
    assert.equal(labels[0]?.name, "hors-cuisine");
  });

  test("--apply renames and describes, and a second pass finds nothing", () => {
    const { github, ecritures, labels } = fauxGithub(depart());
    const { code } = passer("o/r", { appliquer: true, audit: false }, github);
    assert.equal(code, 0);
    assert.equal(ecritures.length, 3);
    assert.equal(ecritures[0]?.chemin, "repos/o/r/labels/hors-cuisine");
    assert.equal(ecritures[0]?.champs.new_name, "served-elsewhere");
    for (const label of labels) assert.equal(label.description, ETIQUETTES.find((e) => e.name === label.name)?.description);
    assert.ok(labels.some((l) => l.name === "served-elsewhere"));
    const encore = passer("o/r", { appliquer: true, audit: false }, github);
    assert.match(encore.sortie.join("\n"), /already up to date/);
    assert.equal(ecritures.length, 3);
  });

  test("a GitHub failure is told and exits 1", () => {
    const { github } = fauxGithub(depart());
    github.ecrire = () => {
      throw new Error("HTTP 403");
    };
    const { sortie, code } = passer("o/r", { appliquer: true, audit: false }, github);
    assert.equal(code, 1);
    assert.match(sortie.join("\n"), /FAILED on o\/r: HTTP 403/);
  });

  test("an unreadable label listing fails instead of being read as empty", () => {
    const { github } = fauxGithub([{ name: "fire", description: 3 as unknown as string }]);
    assert.equal(passer("o/r", { appliquer: false, audit: false }, github).code, 1);
  });
});

describe("audit", () => {
  const items = {
    "/issues/comments": [
      { html_url: "https://github.com/o/r/issues/1#c1", body: "Je pense que le ticket est prêt pour la cuisine, il n'y a pas de souci." },
      { html_url: "https://github.com/o/r/issues/1#c2", body: "This is fine and the tests are green." },
    ],
    "/pulls/comments": [{ html_url: "https://github.com/o/r/pull/2#r1", body: "Ce test ne vérifie rien dans le cas où la liste est vide." }],
    "/issues?": [
      { html_url: "https://github.com/o/r/issues/1", title: "Ajouter une page pour les réglages" },
      { html_url: "https://github.com/o/r/pull/2", title: "Add the settings page" },
    ],
  };

  test("lists the number and the links of the French titles and comments, writes nothing", () => {
    const { github, ecritures } = fauxGithub([], items);
    const { sortie, code } = passer("o/r", { appliquer: false, audit: true }, github);
    assert.equal(code, 0);
    assert.match(sortie[0] ?? "", /1 title\(s\) and 2 comment\(s\)/);
    assert.deepEqual(sortie.slice(1), ["title: https://github.com/o/r/issues/1", "comment: https://github.com/o/r/issues/1#c1", "comment: https://github.com/o/r/pull/2#r1"]);
    assert.deepEqual(ecritures, []);
  });

  test("detection ignores code and English text", () => {
    assert.equal(estEnFrancais("Fix the label that is not renamed"), false);
    assert.equal(estEnFrancais("```\nle les des une est pour\n```\nDone"), false);
    assert.equal(estEnFrancais("Le label est renommé pour les tickets"), true);
  });
});
