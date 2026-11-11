// Le premier ticket de `cantine`, écrit dans l'app (#3306) : le projet prêt, cet ordinateur choisi, le chef répond à la
// question du second au-dessus du rail — son brouillon revient. Ce que le second rédige et ce que la création rend sont
// figés ici, dans la forme du runtime (`runtime/src/premier-ticket/`).
import type { Brouillon, Creation, Redaction } from "../../../runtime/src/premier-ticket/premier-ticket.ts";
import type { Etape } from "./commun.ts";
import { CHOISIR_LE_RECOMMANDE } from "./parcours-premier-projet-commun.ts";

export const BROUILLON: Brouillon = {
  title: "Show today's lunch menu on the home page",
  body: [
    "## Context",
    "",
    "Guests open the site to know what is for lunch, and today they must scroll down to find the menu. The chef wants today's menu to be the first thing they see.",
    "",
    "## Acceptance criteria",
    "",
    "- When I open the home page, I see today's lunch menu at the top, before anything else.",
    "- When the menu has not been set for today, I see \"Menu coming soon\" instead.",
    "- When I open the home page on a phone, the whole menu fits without scrolling sideways.",
  ].join("\n"),
};
export const REDIGE: Redaction = { draft: BROUILLON };
export const CREE: Creation = { ticket: 12, url: "https://github.com/chef/cantine/issues/12" };

// Du projet prêt au brouillon montré : cet ordinateur choisi, la réponse tapée, envoyée au second.
export const JUSQU_AU_BROUILLON: Etape[] = [
  CHOISIR_LE_RECOMMANDE,
  { saisir: "#parcours-premier-projet .premier-ticket textarea", texte: "Guests should see today's lunch menu first, without scrolling." },
  { cliquer: "#parcours-premier-projet .premier-ticket p.gestes .action:first-child > button:first-child" },
];
// Le « oui » du chef.
export const OUI: Etape = { cliquer: "#parcours-premier-projet .premier-ticket p.gestes .action > button:first-child" };
