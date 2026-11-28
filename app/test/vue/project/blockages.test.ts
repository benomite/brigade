// Ce qui bloque un projet, sur sa page (#1399, épique 1393) : chaque blocage que sa principale publie (#1394) en
// une ligne — ce qui est bloqué en une phrase, et pourquoi ; le geste en bouton quand l'app sait le faire, la page
// de GitHub où le faire en lien qui la nomme ; ce qu'une commande a dit, replié derrière « details », jamais en
// message. Aucun blocage, aucune section. Les blocages sont écrits dans la forme même du runtime
// (runtime/src/installation/blocages/), assainis par lui, et relus par `lireSuivi` comme l'app relit le suivi
// d'une station ; la vue est jouée contre le faux pont (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { type Blockage, readTracking } from "../../../src/projects/request.ts";
import { Fake } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const TOKENS = "https://github.com/settings/personal-access-tokens";
const OUTPUT = "GraphQL: Could not resolve to a Repository with the name 'benomite/parade'.\nfailed to run git: exit status 128";

// A blockage as the station writes it (formerly runtime/src/installation/blocages/blocages.ts, `blocage`): the
// sanitising is replayed here for what these tests feed it, a raw command output given as message or cause
// being replaced by the station's fallback sentences and kept in `detail`.
const FALLBACK_MESSAGE = "Something blocks this project, and the station could not say it in one sentence: the details hold what it saw.";
const FALLBACK_CAUSE = "The station did not recognise what went wrong.";
const isRawOutput = (text: string) => /[\r\n]|\bexit (?:status|code) -?\d+|^\s*(?:fatal|error)\s*:/i.test(text);
function ofRuntime(entry: { id: string; message: string; cause: string; action?: string; link?: string; detail?: string }): Blockage {
  const rawMessage = isRawOutput(entry.message);
  const rawCause = isRawOutput(entry.cause);
  const detail = [rawMessage ? entry.message : null, rawCause ? entry.cause : null, entry.detail ?? null].filter((part): part is string => part !== null).join("\n\n");
  return {
    id: entry.id,
    message: rawMessage ? FALLBACK_MESSAGE : entry.message,
    cause: rawCause ? FALLBACK_CAUSE : entry.cause,
    ...(entry.action === undefined ? {} : { action: entry.action }),
    ...(entry.link === undefined ? {} : { link: entry.link }),
    ...(detail === "" ? {} : { detail }),
  };
}

// Tels que le runtime les écrit : l'un avec la page où le lever, l'autre avec le geste de l'app ; et un troisième
// dont le producteur n'a donné que la sortie de git pour message — le runtime l'a assaini.
const TOKEN = ofRuntime({ id: "clone", message: "box cannot clone benomite/parade: the GitHub account brigade-cook does not see this repository.", cause: "A fine-grained token only covers the repositories chosen for it.", link: TOKENS, detail: OUTPUT });
const POSTGRES = ofRuntime({ id: "need:postgres", message: "The tests of parade need a Postgres that box does not have.", cause: "The worktree setup runs psql against a local database.", action: "choose-station" });
const RAW = ofRuntime({ id: "setup", message: "fatal: could not read Username for 'https://github.com'", cause: "exit status 128" });

// Ce que l'app relit du suivi d'une station qui les publie.
const rereadOnes = (blockages: object[] | undefined): Blockage[] => readTracking(JSON.stringify({ brigade: "projets-suivi", projets: [{ nom: "parade", etat: "en-preparation", ...(blockages === undefined ? {} : { blocages: blockages }) }] }))[0]?.blocages ?? [];

const visible = (or: Fake, element: Fake) => {
  for (let pose: Fake | null = element; pose !== null && pose !== or; pose = pose.parentElement) if (pose.hidden) return false;
  return true;
};
const lines = (or: Fake) => or.dessous("li").filter((li) => li.className === "blocage" && visible(or, li));
const textOf = (or: Fake, classe: string) => or.dessous("p").find((p) => p.className === classe)?.textContent;
const opened = (details: Fake) => Reflect.get(details, "open") === true;

describe("la section, posée par le module", () => {








});

describe("le suivi relu par l'app", () => {
  test("chaque blocage publié, avec ce qu'il porte ; un illisible n'est pas montré ; une page hors de GitHub n'est pas un lien", () => {
    assert.deepEqual(rereadOnes([TOKEN, POSTGRES]), [TOKEN, POSTGRES]);
    assert.deepEqual(rereadOnes([{ id: "x", message: "", cause: "why" }, { message: "No id.", cause: "why" }, { ...POSTGRES, link: "https://ailleurs.example/piege" }]), [POSTGRES]);
    assert.deepEqual(rereadOnes(undefined), []);
    assert.equal(readTracking(JSON.stringify({ brigade: "projets-suivi", projets: [{ nom: "parade", etat: "servi" }] }))[0]?.blocages, undefined, "rien de bloqué, rien de publié");
  });
});

