// Le rail de « parade » sur GitHub seul, cuisine arrêtée (#3924) : deux tickets en file, aucune carte prise ni en pass, et
// #30, parqué par ses échecs (#4260), dont la PR ouverte tient sa zone `app/src/vue/` depuis 08:30. La vue reçoit ce que l'app
// en tire (app/src/vue/rail/github.ts, `avecLeRail`), rien écrit à la main.
import { MAINTENANT } from "./commun.ts";
import { ticket } from "./github-seul-commun.ts";
import { ecranDuRail } from "./rail-alerte-commun.ts";

const GELE_LE = "2026-10-13T08:30:00.000Z";

export const ecran = ecranDuRail("Le rail de « parade », cuisine arrêtée : deux tickets en file, rien de pris ni en pass, #30 gelé tient la zone app/src/vue/ depuis 08:30 — le bandeau « The kitchen is stopped » (#3924)", {
  lu: MAINTENANT,
  tickets: [
    ticket(21, "en attente", { priorite: 2, creeLe: "2026-10-13T07:40:00.000Z", entreLe: "2026-10-13T07:40:00.000Z" }),
    ticket(22, "en attente", { creeLe: "2026-10-13T09:01:00.000Z", entreLe: "2026-10-13T09:01:00.000Z" }),
    ticket(30, "WAITING", {
      pr: { numero: 41, url: "https://github.com/chef/parade/pull/41", le: "2026-10-13T08:05:00.000Z" },
      qui: "the supervisor",
      parqueParEchecs: { depuis: GELE_LE, raison: "its cooks failed too many times, the station stopped relaunching it. The reason: the cook failed 3 times", zoneTenue: { zone: ["app/src/vue/"], depuis: GELE_LE } },
    }),
  ],
});
