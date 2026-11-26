// La fiche d'un ticket, ouverte par sa carte sur le rail : #14, que le cook de parade tient. Ce
// qu'elle demande au pont est calculé par les modules de l'app, à partir de faits bruts
// (app/test/aides/cards-dites.ts).
import { actionsDeCard } from "../../../app/src/card-actions.ts";
import { situationDe } from "../../../app/src/histoire.ts";
import { discussionDe, type HistoireBrute, histoireDe } from "../../../app/test/aides/cards-dites.ts";
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

// L'issue de #14, son corps donné : `fiche-diagramme.ts` y met un bloc ```mermaid.
const issueDe = (corps: string) => ({
  found: true,
  issue: {
    title: "Le journal en ajout seul",
    state: "open",
    body: { author: "chef", at: "2026-10-12T17:20:00.000Z", body: corps },
    comments: [{ author: "brigade-manager", at: "2026-10-13T09:40:00.000Z", body: "Calibré `opus` / `high` : touche au cœur du runtime." }],
  },
});

// Ce que la fiche de #14 demande au pont, le corps de son issue donné.
export const donneesDeLaFiche = (corps: string): Ecran["donnees"] => () => {
  const carte = carteDe(RENDUS.parade!, "parade", 14);
  return {
    maintenant: MAINTENANT,
    reponses: {
      demarrage: demarrage(configuration(PROJETS)),
      espace: [SECOND],
      situation: situationDe(carte),
      gestesDeFiche: actionsDeCard(carte),
      lireHistoire: histoireDe(PASS),
      lireDiscussion: discussionDe(issueDe(corps)),
    },
    envois: cuisine(RENDUS),
  };
};

export const ecran: Ecran = {
  dit: "La fiche de #14, ouverte par sa carte dans la colonne Taken du rail de parade",
  largeur: 1440,
  hauteur: 900,
  // La case de parade, puis la carte de la deuxième colonne (Taken) : #14.
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#rail .colonne:nth-child(2) li.bon" }],
  donnees: donneesDeLaFiche("Le journal ne doit jamais être réécrit : **ajout seul**.\n\n- un événement ne se modifie pas\n- un oubli se corrige par un nouvel événement"),
};
