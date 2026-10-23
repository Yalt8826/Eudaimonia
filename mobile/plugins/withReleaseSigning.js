// M5: sign release builds with the project's own keystore (the prebuild
// template ships `signingConfig signingConfigs.debug` in the release
// buildType with a "generate your own keystore" caution).
//
// CNG discipline: android/ is generated — this plugin is the committed
// configuration; nothing under android/ is hand-edited. The keystore and
// keystore/keystore.properties are gitignored; when the properties file is
// absent (fresh clone, eas cloud build using managed credentials) the
// plugin is a no-op and the template's debug signing stands.
//
// If the template anchor is missing (expo changed the generated file), the
// plugin THROWS: an unverified signing setup must fail the prebuild, not
// silently ship a debug-signed release APK.
const { withAppBuildGradle } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const PROPERTIES_RELATIVE = "keystore/keystore.properties";
const RELEASE_ANCHOR = [
  "        release {",
  "            // Caution! In production, you need to generate your own keystore file.",
  "            // see https://reactnative.dev/docs/signed-apk-android.",
  "            signingConfig signingConfigs.debug",
].join("\n");
const RELEASE_SIGNED = [
  "        release {",
  "            // Caution! In production, you need to generate your own keystore file.",
  "            // see https://reactnative.dev/docs/signed-apk-android.",
  "            signingConfig signingConfigs.eudaimoniaRelease",
].join("\n");

const SIGNING_BLOCK = [
  "    signingConfigs {",
  "        eudaimoniaRelease {",
  "            def keystoreProperties = new java.util.Properties()",
  '            def keystorePropertiesFile = rootProject.file("../keystore/keystore.properties")',
  "            if (keystorePropertiesFile.exists()) {",
  "                keystorePropertiesFile.withInputStream { keystoreProperties.load(it) }",
  "            }",
  "            storeFile file(keystoreProperties['storeFile'])",
  "            storePassword keystoreProperties['storePassword']",
  "            keyAlias keystoreProperties['keyAlias']",
  "            keyPassword keystoreProperties['keyPassword']",
  "        }",
  "    }",
  "",
].join("\n");

const withReleaseSigning = (config) =>
  withAppBuildGradle(config, (mod) => {
    const propsFile = path.join(
      mod.modRequest.projectRoot,
      PROPERTIES_RELATIVE,
    );
    if (!fs.existsSync(propsFile)) {
      return mod;
    }
    let contents = mod.modResults.contents;
    if (contents.includes("signingConfigs.eudaimoniaRelease")) {
      return mod; // already applied (idempotent re-run)
    }
    if (!contents.includes(RELEASE_ANCHOR)) {
      throw new Error(
        "withReleaseSigning: the generated android/app/build.gradle no " +
          "longer matches the template anchor (release buildType with " +
          "debug signing). Re-inspect the template and update this plugin " +
          "— refusing to build an unverified release APK.",
      );
    }
    contents = contents.replace("    buildTypes {", `${SIGNING_BLOCK}    buildTypes {`);
    contents = contents.replace(RELEASE_ANCHOR, RELEASE_SIGNED);
    mod.modResults.contents = contents;
    return mod;
  });

module.exports = withReleaseSigning;
