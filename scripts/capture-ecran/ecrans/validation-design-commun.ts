// La carte « Validate its screen » sur « parade », projet GitHub seul (ticket 3185, épique 3180) : la livraison design
// verte de #58 (PR #60) que la pass retient pour le chef (runtime/src/validation-design/), posée en issue #61 au label
// `chef-todo` — le commentaire de sa sorte (`design-validation`) porte la question et le lien de la PR, le corps de l'issue
// porte son marqueur et les captures avant et après, comme le runtime les écrit. La vue reçoit ce que l'app en tire
// (app/src/tableau/attente-du-chef.ts, `avecLAttenteDuChef`), la carte lue du corps par `validationDuCorps`. L'image de chaque capture est la même image figée.
import { readFileSync } from "node:fs";
import { avecLAttenteDuChef, type AttenteDuChef } from "../../../app/src/tableau/attente-du-chef.ts";
import { avecLeRail } from "../../../app/src/vue/rail/github.ts";
import { validationDuCorps } from "../../../app/src/vue/validation-design/validation-design-github.ts";
import { configuration, cuisine, demarrage, type Donnees, MAINTENANT } from "./commun.ts";
import { MANAGER_ALLUME, PROJETS, RENDUS } from "./cuisine-figee.ts";
import { renduDeParade, SIGNES, SUR_GITHUB, TABLEAU_FIGE } from "./github-seul-commun.ts";
import { SECOND } from "./rail-waiting-commun.ts";

const DEPOT = "chef/parade";
const SHA = "3f9c2a1b7d4e5f60718293a4b5c6d7e8f9012345";
const capture = (fichier: string) => `https://github.com/${DEPOT}/blob/${SHA}/docs/captures/58/${fichier}?raw=true`;
export const QUESTION = "Does the screen of #58 look right? Validate it and PR #60 is merged; send it back with what to change and a cook takes it up again.";
export const TEXTE = `${QUESTION}\n\nPull request: https://github.com/${DEPOT}/pull/60`;
// Le corps de l'issue, tel que runtime/src/validation-design/validation-design.ts (`corpsDeLaCarte`) l'écrit.
export const CORPS = [
  `<!-- brigade:validation-design pr=60 ticket=58 sha=${SHA} -->`,
  `**${QUESTION}**`,
  "",
  "Ticket: #58 — Export the journal as CSV",
  `Pull request: https://github.com/${DEPOT}/pull/60`,
  "",
  "### Captures",
  "",
  "**Écran `rail`**",
  "",
  "| Avant | Après |",
  "| --- | --- |",
  `| ![rail — avant](${capture("rail-avant.png")})<br>rail — avant | ![rail — après](${capture("rail-apres.png")})<br>rail — après |`,
  "",
].join("\n");

export const CARTE: AttenteDuChef = {
  ticket: 61,
  titre: "Validate its screen",
  url: `https://github.com/${DEPOT}/issues/61`,
  depuis: "2026-10-13T09:40:00.000Z",
  quoi: "carte",
  ligne: `${QUESTION} — on its Todo card: Validate, or Send back to the kitchen with a comment`,
  chef: { sorte: "design-validation", texte: TEXTE, design: validationDuCorps(DEPOT, CORPS) ?? undefined },
};

const IMAGE = `data:image/png;base64,${readFileSync(new URL("../../../docs/captures/2909/tous-les-projets-apres.png", import.meta.url)).toString("base64")}`;

export const OUVRIR_PARADE = { cliquer: '#projets > button[title^="parade — "]' };

export const donnees = (carte: AttenteDuChef = CARTE): Donnees => {
  const lu = avecLAttenteDuChef(avecLeRail(TABLEAU_FIGE, SUR_GITHUB, SIGNES), { attentes: [carte], illisibles: [] });
  return {
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [SECOND], lireCapture: { image: IMAGE } },
    envois: cuisine({ ...RENDUS, parade: { ...renduDeParade(lu), manager: MANAGER_ALLUME } }),
  };
};
