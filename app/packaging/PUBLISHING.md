# Publishing an Android release

How to cut a release of the Android app, so that an installed copy updates in place and finds the
new version at its next launch. The build itself (`node app/packaging/android.ts`) is described in
[`README.md`](README.md), « L'APK Android »; this page is the procedure around it, from the version
bump to the check on a device.

Two rules hold for every release, and the rest of the page depends on them:

- **The application id and the signing key never change.** `com.github.benomite.brigade` is the
  id, and the release key is the one the environment provides (`BRIGADE_KEYSTORE_FILE`,
  `BRIGADE_KEY_ALIAS`, …). Android installs a new APK over an old one only if both are the same;
  otherwise it installs next to the old app, and the old app keeps its data. Never commit a keystore
  or a password, and never change the id in `app/android/natif/app/build.gradle`,
  `app/android/capacitor.config.json` or `strings.xml`.
- **The version code only goes up.** Android refuses an update whose `versionCode` is not higher
  than the installed one.

## Steps, in order

1. **Choose the version.** A dotted version, `<v>`, such as `1.4.0` (one to four numbers separated by
   dots). It is the `versionName` of the APK and the `version` of the manifest. The tag is
   `android-v<v>`.
2. **Bump the version code.** In `app/android/natif/app/build.gradle`, raise `versionCode` to at
   least one more than the last published release (its `latest-android.json` gives it). Commit that
   change before building, so that the tag points at it.
3. **Check the packaging.** Run the check script (see [Check the packaging](#check-the-packaging)) with
   the previous version code. It must exit 0.
4. **Build the release APK.** Prepare the Capacitor project and its web view with the packaging
   command, then build the release with the release key:

   ```sh
   node app/packaging/android.ts --version <v>
   cd app/android/natif
   BRIGADE_KEYSTORE_FILE=/chemin/vers/brigade.jks \
   BRIGADE_KEYSTORE_PASSWORD=… BRIGADE_KEY_ALIAS=… BRIGADE_KEY_PASSWORD=… \
   ./gradlew assembleRelease --no-daemon -PbrigadeVersion=<v>
   ```

   The signed APK is `app/android/natif/app/build/outputs/apk/release/app-release.apk`. A release build
   without `BRIGADE_KEYSTORE_FILE` Gradle refuses to build and names the four variables. Note that
   `node app/packaging/android.ts` by itself builds a **debug**-signed APK: it is not the one to publish.
5. **Check the signature.** The APK must be signed by the same key as the previous release. With
   `apksigner` (in the Android build-tools):

   ```sh
   apksigner verify --print-certs app/android/natif/app/build/outputs/apk/release/app-release.apk
   ```

   Compare the SHA-256 digest of the signer with the one from the previous release. A different digest
   means the wrong key: stop, do not publish.
6. **Name the APK.** Copy it to `Brigade-<v>.apk`. That name is the last segment of the asset's
   address.
7. **Write the update manifest.** A file `latest-android.json`, with the format below.
8. **Create the GitHub release.** Tag `android-v<v>`, and attach both files:

   ```sh
   gh release create android-v<v> Brigade-<v>.apk latest-android.json \
     --repo benomite/brigade --title "Brigade (Android) <v>" --notes "<what changed>"
   ```

9. **Verify the publication** (below).

## The update manifest

The launch-time check (`app/src/mise-a-jour/android.ts`) reads `latest-android.json` and nothing
else. Its fields, all in this form:

```json
{
  "version": "1.4.0",
  "versionCode": 14,
  "apkUrl": "https://github.com/benomite/brigade/releases/download/android-v1.4.0/Brigade-1.4.0.apk",
  "notes": "What changed, in a few lines."
}
```

- `version` (required): a dotted version, the same as the tag and the APK's `versionName`.
- `versionCode` (required): the positive integer of the APK, the same as `build.gradle`.
- `apkUrl` (required): an `https` address of the APK asset of this release, as above.
- `notes` (optional): a string shown to the user.

A manifest that does not match this format is ignored: the app then says nothing, and no error
appears.

## Check the packaging

```sh
node app/packaging/android-stable.ts --previous-version-code <n>
```

`<n>` is the `versionCode` of the previous release. The script reads `build.gradle`, the manifest,
`file_paths.xml` and `android-stable.json` as text: it needs no SDK. It exits 0 and prints the
application id, the version code and the signing source when all is well. It exits 1 and names the
problem when the id or the signing configuration changed, when the version code does not increase,
when the install permission or the file provider is missing, or when a key sits in the repository. The
tests are in `app/test/packaging/android-stable.test.ts`.

## Verify the publication

1. **The manifest is found at the launch address:**

   ```sh
   curl -fsSL https://github.com/benomite/brigade/releases/latest/download/latest-android.json
   ```

   It must print the manifest you wrote. The app reads this address, so the Android release has to be
   the one GitHub calls the latest.
2. **The APK downloads:** the `apkUrl` of that manifest answers with the APK, and `apksigner verify
   --print-certs` on the downloaded file gives the same digest as step 5.
3. **An older install is offered the update.** On a device or an emulator, install the previous
   release (`adb install -r`), then the new one at the same id: it must keep its data. Then launch the
   app. It must offer version `<v>` at launch, with its notes, and install it on the user's
   confirmation.
4. **Nothing appears when no newer release exists.** On a device that already runs the latest
   version, launch the app: no offer appears.

**Open point:** at the time of writing, nothing in the repository calls the launch check
(`checkAtLaunch`) outside its tests, so step 3 cannot succeed until that call is wired into the
Android shell. Steps 1, 2 and 4 can be checked now.

**Open point:** the address of step 1 is the latest GitHub release. The station's release workflow
(`.github/workflows/publier-station.yml`) also publishes with `--latest`, so after a station release
that address points to the station, and the manifest is not found. Until the check reads the Android
release by its tag, publish an Android release after any station release, and check step 1 again
before the device check.
