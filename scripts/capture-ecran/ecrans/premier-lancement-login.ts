// Le premier lancement, Claude Code pas connecté sur cet ordinateur (#4057) : un clic sur parade ne démarre pas sa
// cuisine — la phrase le dit sous sa station, avec « log in » et « try again ».
import { NOT_CONNECTED } from "../../../app/src/first-launch.ts";
import { LISTEES, premierLancement } from "./premier-lancement-commun.ts";

export const ecran = premierLancement("Le premier lancement, Claude Code pas connecté (#4057) : « log in » sous la station, avant que la cuisine de parade démarre", LISTEES, [{ cliquer: "section[aria-label=\"parade-box\"] button[title=\"benomite/parade\"]" }], {
  ouvrirDUneStation: { state: "login" as const, project: "parade", repository: "benomite/parade", cause: "login" as const, reason: NOT_CONNECTED("parade") },
});
