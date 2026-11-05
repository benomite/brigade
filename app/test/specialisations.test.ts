// Les spécialisations des cooks d'un projet, sur Kitchen > Cooks (#2492) : l'app lit les `agents/cook-<nom>.md` du dépôt
// sur sa branche d'intégration, sur GitHub, et en ajoute une en créant son fichier. Une spécialisation ajoutée est
// écrite dans le dépôt : relue ensuite — l'app relancée ne garde rien d'autre —, elle y est, telle qu'elle a été dite.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { PROFIL_COOK_DESIGN } from "../../runtime/src/calibrage.ts";
import type { ClientDeLaPriorite } from "../src/priorite.ts";
import { DEPOT, github } from "./aides/depot-github.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { ajouterUneSpecialisation, ecrireLaSpecialisation, fichierDe, lireLaSpecialisation, lireLesSpecialisations, specialisationDemandee, type SpecialisationLue } from "../src/specialisations.ts";
import { EFFORTS as EFFORTS_DE_LA_VUE, MODELES as MODELES_DE_LA_VUE } from "../src/vue/projet/cuisine/cuisiniers/Specialisations.js";

const RACINE = join(import.meta.dirname, "..", "..");
const DESIGN = readFileSync(join(RACINE, PROFIL_COOK_DESIGN), "utf8");
const SECURITE = ["---", "name: cook-security", "description: Auth, secrets and permissions.", "model: opus", "effort: high", "capabilities: code, acces-prod", "---", "", "You are the **security cook**."].join("\n");

const lues = async (client: ClientDeLaPriorite): Promise<SpecialisationLue[]> => {
  const lue = await lireLesSpecialisations({ depot: DEPOT, branche: "main", client });
  return "specialisations" in lue ? lue.specialisations : assert.fail(`non lues : ${JSON.stringify(lue)}`);
};
const MIGRATIONS = { nom: "migrations", description: "Database schema changes and their migrations.", modele: "sonnet", effort: "medium", capacites: "code, postgres" };

describe("les spécialisations, dans le dépôt du projet", () => {
  test("le cook design du runtime en est une : son fichier est `agents/cook-design.md`, lu avec son effort", () => {
    assert.equal(fichierDe("design"), PROFIL_COOK_DESIGN);
    const design = lireLaSpecialisation("design", DESIGN);
    assert.equal(design.effort, "medium");
    assert.equal(design.modele, null, "sans modèle dans son fichier, le ticket décide");
    assert.deepEqual(design.capacites, []);
    assert.match(design.description, /Cook spawné sur tout ticket qui touche la vue/);
  });

  test("la vue propose exactement les modèles et les efforts de l'app", () => {
    assert.deepEqual(MODELES_DE_LA_VUE, [...MODELES]);
    assert.deepEqual(EFFORTS_DE_LA_VUE, [...EFFORTS]);
  });

  test("lues sur la branche d'intégration : les seuls `cook-<nom>.md` d'`agents/`, par leur nom", async () => {
    const { client } = github({ "agents/cook-security.md": SECURITE, "agents/cook-design.md": DESIGN, "agents/dev-teammate.md": "---\nname: dev-teammate\n---\n", "agents/cook-vieux/notes.md": "x", "README.md": "parade" });
    assert.deepEqual(
      (await lues(client)).map(({ nom, fichier, modele, effort, capacites }) => [nom, fichier, modele, effort, capacites]),
      [
        ["design", "agents/cook-design.md", null, "medium", []],
        ["security", "agents/cook-security.md", "opus", "high", ["code", "acces-prod"]],
      ],
    );
  });

  test("un dépôt sans `agents/` n'en a aucune ; une lecture refusée tient en une ligne, la réponse de GitHub en détail", async () => {
    assert.deepEqual(await lues(github({ "README.md": "parade" }).client), []);
    const refusee = await lireLesSpecialisations({ depot: DEPOT, branche: "main", client: github({}, { GET: { status: 401, data: { message: "Bad credentials" } } }).client });
    assert.equal("sans" in refusee && refusee.sans, "specializations unavailable");
    assert.match("sans" in refusee ? (refusee.detail ?? "") : "", /HTTP 401.*Bad credentials/);
  });

  test("ajoutée, elle est écrite dans le dépôt et s'y relit telle qu'elle a été dite", async () => {
    const { client, demandes, ecrits, fichier } = github({ "agents/cook-design.md": DESIGN });
    const rendu = await ajouterUneSpecialisation({ depot: DEPOT, branche: "main", demande: MIGRATIONS, client });
    assert.deepEqual(rendu, {
      fait: "migrations added in the repository",
      specialisation: { nom: "migrations", fichier: "agents/cook-migrations.md", description: "Database schema changes and their migrations.", modele: "sonnet", effort: "medium", capacites: ["code", "postgres"] },
    });
    assert.deepEqual(demandes, [`GET /repos/${DEPOT}/contents/agents?ref=main`, `PUT /repos/${DEPOT}/contents/agents/cook-migrations.md`]);
    assert.equal(ecrits[0]?.branch, "main");
    assert.equal(ecrits[0]?.sha, undefined, "un fichier neuf, jamais un remplacé");
    assert.match(String(ecrits[0]?.message), /add the migrations specialization/);
    assert.equal(
      fichier("agents/cook-migrations.md"),
      ["---", "name: cook-migrations", "description: Database schema changes and their migrations.", "model: sonnet", "effort: medium", "capabilities: code, postgres", "---", "", "You are the **migrations cook**: Database schema changes and their migrations.", ""].join("\n"),
    );

    // Relue — ce que l'app fait à sa relance —, elle y est, avec les autres.
    const relues = await lues(client);
    assert.deepEqual(relues.map(({ nom }) => nom), ["design", "migrations"]);
    assert.deepEqual(relues[1], "fait" in rendu ? rendu.specialisation : assert.fail("pas ajoutée"));
  });

  test("sans modèle ni effort ni capacité, le fichier n'en dit rien : le ticket décide ; une description à deux-points se relit telle quelle", async () => {
    const { client, fichier } = github({});
    const description = "Writing: docs, release notes # and the README";
    await ajouterUneSpecialisation({ depot: DEPOT, branche: "main", demande: { nom: "Writing", description, modele: "", effort: "", capacites: "" }, client });
    const ecrit = fichier("agents/cook-writing.md") ?? assert.fail("pas écrit");
    assert.doesNotMatch(ecrit, /^(model|effort|capabilities):/m);
    assert.deepEqual(await lues(client), [{ nom: "writing", fichier: "agents/cook-writing.md", description, modele: null, effort: null, capacites: [] }]);
  });

  test("ce qui n'est pas une spécialisation est refusé avant tout appel, en une ligne", async () => {
    const refus = (demande: Record<string, string>) => {
      const dite = specialisationDemandee({ ...MIGRATIONS, ...demande });
      return "refus" in dite ? dite.refus : "acceptée";
    };
    assert.equal(refus({ nom: "" }), "give it a name");
    assert.match(refus({ nom: "my cook" }), /lowercase letters, digits and hyphens/);
    assert.match(refus({ nom: "../x" }), /lowercase letters/);
    assert.match(refus({ nom: "general" }), /ordinary cook/);
    assert.equal(refus({ description: "  " }), "say what it cooks, in one line");
    assert.match(refus({ modele: "gpt" }), /its model is one of opus, sonnet, haiku/);
    assert.match(refus({ effort: "extreme" }), /its effort is one of low, medium, high, xhigh, max/);
    assert.match(refus({ capacites: "code, accès_prod" }), /“accès_prod” is not a capability/);
    assert.equal(refus({}), "acceptée");

    const { client, demandes } = github({});
    const rendu = await ajouterUneSpecialisation({ depot: DEPOT, branche: "main", demande: { ...MIGRATIONS, nom: "general" }, client });
    assert.match("refus" in rendu ? rendu.refus : "", /^nothing was added: general is the ordinary cook/);
    assert.deepEqual(demandes, []);
  });

  test("un nom déjà pris est refusé sans rien écrire ; un refus de GitHub se dit, sa réponse en détail", async () => {
    const pris = github({ "agents/cook-migrations.md": SECURITE });
    const rendu = await ajouterUneSpecialisation({ depot: DEPOT, branche: "main", demande: MIGRATIONS, client: pris.client });
    assert.equal("refus" in rendu && rendu.refus, "nothing was added: migrations is already a specialization");
    assert.deepEqual(pris.ecrits, []);
    assert.equal(pris.fichier("agents/cook-migrations.md"), SECURITE);

    const refuse = await ajouterUneSpecialisation({ depot: DEPOT, branche: "main", demande: MIGRATIONS, client: github({}, { PUT: { status: 403, data: { message: "Resource not accessible by integration" } } }).client });
    assert.equal("refus" in refuse && refuse.refus, "nothing was added: GitHub did not write agents/cook-migrations.md");
    assert.match("refus" in refuse ? (refuse.detail ?? "") : "", /HTTP 403.*Resource not accessible/);
  });

  test("le fichier écrit se relit à l'identique", () => {
    const specialisation = { nom: "security", description: "Auth, secrets and permissions.", modele: "opus", effort: "high", capacites: ["code", "acces-prod"] };
    assert.deepEqual(lireLaSpecialisation("security", ecrireLaSpecialisation(specialisation)), { ...specialisation, fichier: "agents/cook-security.md" });
  });
});
