// Ce que « All projects » dit sur un téléphone appairé à une station avant le ticket 2500 (#1414) : un guichet qui ne se
// joint pas se dit en une phrase, qui nomme ce qui manque — l'adresse, sur le tailnet du chef ou non (#1409), le guichet
// derrière elle, ou ce qui répond à sa place. L'écran qui appairait le téléphone n'est plus (#2500) : une installation
// neuve se connecte à GitHub (connexion-github.test.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { adresseDuGuichet, issueDe, parLeTailnet } from "../../src/vue/telephone/appairage.js";

const ADRESSE = "http://192.168.1.20:7010";
// Le guichet d'une box louée ailleurs, publié par `tailscale serve` sur le tailnet du chef (#1408).
const TAILNET = "https://box.tail1234.ts.net";

describe("ce que la liste dit d'un guichet", () => {
  test("l'adresse tapée, avec ou sans http : celle que le pont joint", () => {
    assert.equal(adresseDuGuichet("192.168.1.20:7010"), ADRESSE);
    assert.equal(adresseDuGuichet(" http://192.168.1.20:7010/ "), ADRESSE);
    assert.equal(adresseDuGuichet("https://atelier.local:7010/pairing"), "https://atelier.local:7010");
    assert.equal(adresseDuGuichet("[fe80::1]:7010"), "http://[fe80::1]:7010");
    for (const fausse of ["", "   ", "ftp://192.168.1.20", "http://", "a b"]) assert.equal(adresseDuGuichet(fausse), null, fausse);
  });

  test("un nom du tailnet tapé sans protocole se joint en https, là où `tailscale serve` publie le guichet", () => {
    assert.equal(adresseDuGuichet("box.tail1234.ts.net"), TAILNET);
    assert.equal(adresseDuGuichet(" BOX.tail1234.TS.NET/ "), TAILNET);
    assert.equal(adresseDuGuichet(TAILNET), TAILNET);
    // Ce que le chef écrit en entier, ou avec un port, reste tel qu'il l'a écrit.
    assert.equal(adresseDuGuichet("http://box.tail1234.ts.net"), "http://box.tail1234.ts.net");
    assert.equal(adresseDuGuichet("box.tail1234.ts.net:7010"), "http://box.tail1234.ts.net:7010");
    assert.equal(adresseDuGuichet("atelier.local"), "http://atelier.local");
  });

  test("une adresse du tailnet : un nom en .ts.net, ou une adresse de Tailscale (100.64.0.0/10)", () => {
    for (const oui of [TAILNET, "http://box.tail1234.ts.net:7010", "http://100.64.0.1:7010", "http://100.101.102.103", "http://100.127.255.254"]) assert.equal(parLeTailnet(oui), true, oui);
    for (const non of [ADRESSE, "http://100.63.0.1", "http://100.128.0.1", "http://10.0.0.2:7010", "https://ts.net.example.com", "pas une adresse"]) assert.equal(parLeTailnet(non), false, non);
  });

  test("chaque guichet qui ne se joint pas se dit en une ligne, son détail à part", () => {
    assert.deepEqual(issueDe("injoignable", "failed to connect", ADRESSE), {
      ligne: "This phone cannot reach your station at 192.168.1.20:7010.",
      detail: "failed to connect — on the station's network, check that it is running.",
    });
    assert.deepEqual(issueDe("inattendu", "answered 404", ADRESSE), { ligne: "What answers at 192.168.1.20:7010 is not a station's phone desk.", detail: "answered 404" });
  });

  test("sur le tailnet, la ligne dit ce qui ne se joint pas : la box elle-même, ou le guichet derrière elle", () => {
    assert.deepEqual(issueDe("injoignable", 'Unable to resolve host "box.tail1234.ts.net"', TAILNET), {
      ligne: "This phone cannot reach box.tail1234.ts.net on your tailnet.",
      detail: 'Unable to resolve host "box.tail1234.ts.net" — check that the Tailscale app is on, on this phone, signed in to your account, and that the station\'s machine is on.',
    });
    assert.deepEqual(issueDe("sans-guichet", `${TAILNET} answered 502: nothing answers behind it`, TAILNET), {
      ligne: "box.tail1234.ts.net answers, but the station's phone desk behind it does not.",
      detail: `${TAILNET} answered 502: nothing answers behind it — check that the station is running there, with its phone desk on.`,
    });
    // Une adresse en https qui ne se relit pas sans son protocole se dit entière.
    assert.equal(issueDe("injoignable", "x", "https://atelier.local:7443").ligne, "This phone cannot reach your station at https://atelier.local:7443.");
  });
});
