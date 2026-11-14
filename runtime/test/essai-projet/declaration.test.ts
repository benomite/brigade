// La déclaration d'essai d'un projet (#3559) : ce que le dépôt montre donne
// `{"command", "url"?}`, `{"tryable": false, "reason"}` pour une app qui veut un
// appareil, ou rien du tout pour un dépôt qu'elle ne reconnaît pas ou ne lit pas.
// Lue ici depuis les fichiers d'une branche, comme la cuisine la lit.
import assert from "node:assert/strict";
import { test } from "node:test";
import { declarationDesFichiers, fichiersDeLaBranche } from "../../src/essai-projet/declaration.ts";

// La détection telle que la cuisine la joue : les fichiers suivis d'une branche, et de quoi en lire un.
const detecter = (fichiers: Record<string, string>) => declarationDesFichiers(fichiersDeLaBranche(Object.keys(fichiers), (chemin) => fichiers[chemin] ?? null));
const declaration = (fichiers: Record<string, string>) => detecter(fichiers)?.declaration ?? null;
const paquet = (scripts: Record<string, string>) => JSON.stringify({ name: "app", scripts });

test("an npm project with a `dev` script: `npm install && npm run dev`, with the url of the port its Vite config serves", () => {
  const vite = 'export default defineConfig({\n  plugins: [vue()],\n  server: { port: 5173, strictPort: true },\n});\n';
  assert.deepEqual(declaration({ "package.json": paquet({ dev: "vite", build: "vite build" }), "vite.config.ts": vite }), { command: "npm install && npm run dev", url: "http://localhost:5173" });
  assert.match(detecter({ "package.json": paquet({ dev: "vite" }), "vite.config.ts": vite })?.preuve ?? "", /`dev` script serving port 5173/);
});

test("an npm project: the port written in its `dev` script gives the url", () => {
  assert.deepEqual(declaration({ "package.json": paquet({ dev: "next dev --port 3001" }) }), { command: "npm install && npm run dev", url: "http://localhost:3001" });
  assert.deepEqual(declaration({ "package.json": paquet({ dev: "PORT=4000 node server.js" }) }), { command: "npm install && npm run dev", url: "http://localhost:4000" });
});

test("an npm project whose port is not readable: the command alone, no url invented", () => {
  assert.deepEqual(declaration({ "package.json": paquet({ dev: "vite" }) }), { command: "npm install && npm run dev" });
});

test("an npm project without `dev` but with `start`: `npm install && npm start`", () => {
  assert.deepEqual(declaration({ "package.json": paquet({ start: "node server.js", test: "node --test" }) }), { command: "npm install && npm start" });
});

test("an npm project with neither `dev` nor `start`, or an unreadable `package.json`: no declaration", () => {
  assert.equal(declaration({ "package.json": paquet({ test: "node --test", build: "tsc" }) }), null);
  assert.equal(declaration({ "package.json": "{ not json" }), null);
});

test("a Gradle app: `./gradlew run` with the `application` plugin, `./gradlew bootRun` for Spring Boot", () => {
  assert.deepEqual(declaration({ gradlew: "#!/bin/sh\n", "settings.gradle.kts": "", "app/build.gradle.kts": 'plugins {\n  id("application")\n}\napplication { mainClass.set("demo.AppKt") }\n' }), { command: "./gradlew run" });
  assert.deepEqual(declaration({ gradlew: "#!/bin/sh\n", "build.gradle": "plugins {\n  id 'org.springframework.boot' version '3.3.0'\n  id 'java'\n}\n" }), { command: "./gradlew bootRun" });
  assert.deepEqual(declaration({ "build.gradle": "apply plugin: 'application'\n" }), { command: "gradle run" });
});

test("a Gradle library, with no application plugin: no declaration", () => {
  assert.equal(declaration({ gradlew: "#!/bin/sh\n", "build.gradle.kts": 'plugins {\n  `java-library`\n}\n' }), null);
});

test("a Python server: Django, Flask and FastAPI each give a command in a venv, and the url they serve", () => {
  assert.deepEqual(declaration({ "manage.py": "#!/usr/bin/env python\n", "requirements.txt": "Django==5.0\n" }), {
    command: "python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/python manage.py runserver 8000",
    url: "http://localhost:8000",
  });
  assert.deepEqual(declaration({ "app.py": "from flask import Flask\napp = Flask(__name__)\n", "requirements.txt": "flask>=3\n" }), {
    command: "python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/flask --app app run --port 5000",
    url: "http://localhost:5000",
  });
  assert.deepEqual(declaration({ "main.py": "from fastapi import FastAPI\napi = FastAPI()\n", "pyproject.toml": '[project]\ndependencies = ["fastapi>=0.110"]\n' }), {
    command: "python3 -m venv .venv && .venv/bin/pip install . uvicorn && .venv/bin/uvicorn main:api --port 8000",
    url: "http://localhost:8000",
  });
});

test("a Python project that serves nothing it recognises: no declaration", () => {
  assert.equal(declaration({ "requirements.txt": "numpy\n", "main.py": "print('hello')\n" }), null);
});

test("an Android app needs a device: `tryable: false` with a reason a human reads, even with a `package.json` beside it", () => {
  const android = { "app/src/main/AndroidManifest.xml": "<manifest/>", "app/build.gradle.kts": 'plugins { id("com.android.application") }\n', "package.json": paquet({ start: "react-native start" }) };
  const lue = declaration(android);
  assert.ok(lue !== null && "tryable" in lue, JSON.stringify(lue));
  assert.equal(lue.tryable, false);
  assert.match(lue.reason, /Android app.*device/);
  assert.deepEqual(Object.keys(lue).sort(), ["reason", "tryable"]);
  // Le plugin Android seul suffit.
  assert.equal((declaration({ "build.gradle": "apply plugin: 'com.android.application'\n" }) as { tryable?: boolean } | null)?.tryable, false);
});

test("an Xcode app runs from Xcode: `tryable: false` with its reason", () => {
  const lue = declaration({ "Demo.xcodeproj/project.pbxproj": "// !$*UTF8*$!" });
  assert.ok(lue !== null && "tryable" in lue);
  assert.match(lue.reason, /Xcode/);
});

test("a project it cannot read yields no declaration: nothing recognised, or nothing at all", () => {
  assert.equal(declaration({}), null);
  assert.equal(declaration({ "README.md": "# a project\n", "src/index.c": "int main(){}" }), null);
});

test("a file listed on the branch but not read throws: unread is not absent", () => {
  assert.throws(() => declarationDesFichiers(fichiersDeLaBranche(["package.json"], () => null)), /package\.json is listed on the branch but cannot be read/);
});
