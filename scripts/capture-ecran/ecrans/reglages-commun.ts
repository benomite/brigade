// Les réglages de « parade » (Settings), tels qu'un Mac, un PC et un téléphone les montrent (#1700) : ses réglages de
// projet lus dans son dépôt, son grant `merge` tel que `grant` le rend — actif, avec ses usages —, ses tickets
// ordinaires sur ce poste, et ses couleurs. Un Mac sert la station de parade ; un PC sous Windows aussi, sans tickets
// ordinaires ; le téléphone a la largeur d'un téléphone.
import type { Lecture } from "../../../app/src/box.ts";
import { voir as voirGrants } from "../../../app/src/grants.ts";
import { blocDesOrdinaires } from "../../../app/src/ordinaires.ts";
import { RETIRER } from "../../../app/src/retrait.ts";
import { configuration, cuisine, demarrage, type Donnees, type Envoi, type Etape, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { LUS } from "./reglages-du-projet.ts";

// Ce que `grant` rend de parade (runtime/src/grant-cli.ts), mot pour mot : le grant `merge` accordé ce matin, et ce
// qui s'en est servi depuis.
const usage = (heure: string, ticket: number, pr: number, commit: string, verdict: number) => `  2026-10-13T${heure}.000Z  #${ticket}  merge on main  https://github.com/chef/parade/pull/${pr}  ${commit}  verdict no. ${verdict}  merged`;
export const GRANT = [
  "grant merge           ACTIVE since 2026-10-13T07:01:00.000Z (by chef) — 6 h left (until 13 Oct 17:00 UTC): a green pass is merged without you",
  "never granted         identifiants-max — read the Max account credentials",
  "                      acces-prod — any action on a project's production",
  "latest actions        ",
  "  2026-10-13T07:01:00.000Z  merge  enabled until 13 Oct 17:00 UTC  (chef)",
  "latest uses           ",
  usage("09:58:00", 31, 62, "4e1c9a0", 41),
  usage("09:31:00", 29, 60, "b73d2e8", 40),
  usage("09:12:00", 27, 58, "0a9f6c1", 39),
  usage("08:47:00", 26, 57, "e25b8d4", 38),
  usage("08:20:00", 24, 55, "7c0d3f2", 37),
  usage("07:56:00", 23, 53, "91a4e7b", 36),
  usage("07:33:00", 21, 51, "3f8c2a6", 35),
  usage("07:10:00", 20, 49, "c4e9b10", 34),
  "without a grant, 2 green deliveries stopped: 2 merged by hand, 0 closed without merge — no disagreement —, 0 still open",
  "",
].join("\n");

const lecture = (commande: string, texte: string): Lecture => ({ projet: "parade", demande: 0, a: MAINTENANT, sorties: [{ commande, texte }] });
const lu = (commande: string, texte: string, vus: unknown[] = []): Envoi => ({ sur: "surContenu", args: [lecture(commande, texte), ...vus], demande: "onglet" });

export type Poste = "mac" | "pc" | "telephone";
export const LARGEURS: Record<Poste, { largeur: number; hauteur: number }> = { mac: { largeur: 1440, hauteur: 1100 }, pc: { largeur: 1920, hauteur: 1080 }, telephone: { largeur: 412, hauteur: 1700 } };

// Un clic sur l'entrée de parade, puis sur Settings.
export const OUVRIR: Etape[] = [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets > button:first-child" }];

export function donnees(poste: Poste): Donnees {
  const machine = poste === "pc" ? "pc" : "mac";
  const parade = { ...PROJETS[0]!, ordinaires: true, limiteCooks: 2 };
  const stations = [{ station: machine, distante: false, plafond: 2, ordinaires: true, bacASable: null, prendOrdinaires: false }];
  const pose = demarrage(configuration([parade, ...PROJETS.slice(1)]));
  return {
    maintenant: MAINTENANT,
    reponses: {
      demarrage: poste === "pc" ? { ...pose, poste: { nom: "this PC", mac: false } } : pose,
      espace: [],
      reglagesDuProjet: LUS,
      ordinaires: blocDesOrdinaires(parade, poste === "pc" ? "win32" : "darwin", stations, true),
      // Ses gestes de retrait, tels que retrait.ts les rend : Settings n'en garde que le premier, une ligne de toi.
      retrait: { projet: "parade", titre: "Remove “parade”", retirer: { libelle: RETIRER, lignes: ["“parade” leaves the app: its tab, its colors.", "Nothing is sent to its station."] } },
    },
    envois: {
      ...cuisine(RENDUS),
      onglet: {
        "parade/grants": [lu("grant", GRANT, [undefined, voirGrants(lecture("grant", GRANT))])],
      },
    },
  };
}
