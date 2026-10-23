// Expo reads this in preference to app.json, and merges what it returns
// over the JSON. It exists for exactly one reason.
//
// THE DRAIN TEST NEEDS CLEARTEXT; THE SHIP APK MUST NOT HAVE IT.
//
// The ship APK talks to https://olympus.tail7270c7.ts.net and forbids
// cleartext HTTP, which is the Android default since API 28 and correct.
// The drain leg (verify_apk.sh drain) points a build at a local stand-in
// over http:// — and Android silently dropped every request, so the
// outbox never drained and the leg could not pass however long it waited.
// Nothing logged: a release build has no logs, and a blocked cleartext
// request fails like any other network error, which the queue treats as
// "stay queued" by design.
//
// So cleartext is enabled ONLY when a stand-in base is baked in, i.e.
// only for the throwaway APK the drain leg builds. Ship builds set no
// EXPO_PUBLIC_API_BASE, or set an https one, and keep the restriction.
//
// Verified both ways by scripts/verify_apk.sh drain, which asserts the
// manifest flag matches the base it just built with.
//
// It is applied through a config plugin, NOT by setting
// `android.usesCleartextTraffic` in the config object: Expo accepts that
// key (it shows up in `expo config --type public`) and prebuild then does
// not write it into AndroidManifest.xml. Checked rather than assumed —
// the config said true while the generated manifest had no such attribute
// and the POSTs were still being dropped.
const { withAndroidManifest } = require("expo/config-plugins");

const base = process.env.EXPO_PUBLIC_API_BASE ?? "";
const needsCleartext = base.startsWith("http://");

module.exports = ({ config }) => {
  if (!needsCleartext) return config;
  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (application) {
      application.$["android:usesCleartextTraffic"] = "true";
    }
    return cfg;
  });
};
