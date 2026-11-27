// @ts-check
// Le menu de la page d'un projet (ticket 2485, épique 2484, ticket 2921) : Rail · Stations · Agents · Know-how · Settings. Rail, Stations,
// Agents (ticket 4224) et Know-how (ticket 4570) sont les onglets que le projet retient ; Settings s'ouvre par-dessus, comme une page. La santé de la cuisine et le temps des
// tickets ne sont plus un onglet, ni une ligne du rail (tickets 3013, 3523). Ce module ne touche
// pas `document` : la vue pose les boutons.

export const RAIL = "rail";
export const STATIONS = "stations";
export const AGENTS = "agents";
export const KNOW_HOW = "know-how";

// Les entrées du menu qui sont des onglets, dans l'ordre ; Settings vient après, de la vue.
export const MENU = [
  { id: RAIL, titre: "Rail" },
  { id: STATIONS, titre: "Stations" },
  { id: AGENTS, titre: "Agents" },
  { id: KNOW_HOW, titre: "Know-how" },
];
export const TITLE_OF_SETTINGS = "Settings";
