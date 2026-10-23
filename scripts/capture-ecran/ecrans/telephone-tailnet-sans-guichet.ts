// L'appairage du téléphone avec une box louée ailleurs, par le tailnet du chef (#1409) : la box répond —
// `tailscale serve` —, mais rien derrière elle, la station arrêtée ou sans guichet. La ligne le dit.
import { apresLeQr, QR_TAILNET } from "./telephone-commun.ts";

export const ecran = apresLeQr("L'appairage du téléphone par le tailnet, la box sans guichet", { paired: false, reason: "sans-guichet", said: "https://box.tail1234.ts.net answered 502: nothing answers behind it" }, QR_TAILNET);
