// La fiche de #14, dont le corps de l'issue porte un bloc ```mermaid (#3773) : le diagramme se lit sur la fiche,
// au-dessus de l'issue repliée. Le reste est celui de `fiche.ts`.
import { gestesDeCarte } from "../../../app/src/gestes-fiche.ts";
import { situationDe } from "../../../app/src/histoire.ts";
import { discussionDe, type HistoireBrute, histoireDe } from "../../../app/test/aides/fiches-dites.ts";
import type { Terminal } from "../../../app/src/terminaux.ts";
import { carteDe, configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "session neuve", arrete: false };

const PASS: HistoireBrute = {
  steps: [
    { kind: "arrived", at: "2026-10-13T09:40:02.000Z" },
    { kind: "taken", at: "2026-10-13T09:52:10.000Z", station: "box/claude" },
  ],
  cost: { attempts: 1, tokens: 48210, durationMs: 722000, incomplete: false },
};

const CORPS = [
  "Le journal ne doit jamais être réécrit : **ajout seul**.",
  "",
  "```mermaid",
  "flowchart LR",
  "  E[event] --> J[(journal)]",
  "  J --> R[replay]",
  "  O[oversight] -. new event .-> J",
  "```",
  "",
  "- un événement ne se modifie pas",
  "- un oubli se corrige par un nouvel événement",
].join("\n");

const ISSUE = {
  found: true,
  issue: {
    title: "Le journal en ajout seul",
    state: "open",
    body: { author: "chef", at: "2026-10-12T17:20:00.000Z", body: CORPS },
    comments: [{ author: "brigade-manager", at: "2026-10-13T09:40:00.000Z", body: "Calibré `opus` / `high` : touche au cœur du runtime." }],
  },
};

export const ecran: Ecran = {
  dit: "La fiche de #14 dont l'issue porte un diagramme Mermaid, ouverte par sa carte dans la colonne Taken du rail de parade",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#rail .colonne:nth-child(2) li.bon" }],
  donnees: () => {
    const carte = carteDe(RENDUS.parade!, "parade", 14);
    return {
      maintenant: MAINTENANT,
      reponses: {
        demarrage: demarrage(configuration(PROJETS)),
        espace: [SECOND],
        situation: situationDe(carte),
        gestesDeFiche: gestesDeCarte(carte),
        lireHistoire: histoireDe(PASS),
        lireDiscussion: discussionDe(ISSUE),
      },
      envois: cuisine(RENDUS),
    };
  },
};
