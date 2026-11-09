// @ts-check
// Le menu de la page d'un projet (ticket 2485, épique 2484, ticket 2921) : Rail · Stations · Settings. Rail et Stations sont
// les onglets que le projet retient ; Settings s'ouvre par-dessus, comme une page. La santé de la cuisine et le temps des
// tickets ne sont plus un onglet : leurs chiffres sont dans la bande du rail (projet/rail/bande-rail.js, ticket 3013). Ce module ne touche
// pas `document` : la vue pose les boutons.

export const RAIL = "rail";
export const STATIONS = "stations";

// Les entrées du menu qui sont des onglets, dans l'ordre ; Settings vient après, de la vue.
export const MENU = [
  { id: RAIL, titre: "Rail" },
  { id: STATIONS, titre: "Stations" },
];
export const TITRE_DE_SETTINGS = "Settings";
