#!/usr/bin/env bash
# M5: build the Android artifacts locally, mirroring the eas.json profiles.
#
# The sanctioned path is `npx eas-cli build --profile <p> --platform android`
# (cloud, or --local on this machine) once `eas login` exists. This script
# reproduces exactly the same prebuild + Gradle task for working WITHOUT an
# Expo account session; eas.json remains the profile source of truth.
#
#   scripts/build-apk.sh preview       # release-signed APK (the M5 artifact)
#   scripts/build-apk.sh development   # dev-client APK (development profile)
#   scripts/build-apk.sh production    # release AAB (store artifact, M8+)
#
# Metro inlines EXPO_PUBLIC_API_BASE (and any EXPO_PUBLIC_*) at bundle time,
# so a point-build at a stand-in server is:
#   EXPO_PUBLIC_API_BASE=http://<host>:<port> scripts/build-apk.sh preview
set -euo pipefail

PROFILE="${1:-preview}"
case "$PROFILE" in
  development) TASK=":app:assembleDebug" ;;
  preview) TASK=":app:assembleRelease" ;;
  production) TASK=":app:bundleRelease" ;;
  *) echo "unknown profile: $PROFILE (development|preview|production)" >&2; exit 2 ;;
esac

cd "$(dirname "$0")/.."

# Gradle 9.3.1 cannot parse class files from JDK 27 (this box's default —
# "Unsupported class file major version 71", observed 2026-10-14); run the
# build JVM from the Temurin 21 tarball under ~/.jdks when present. JAVA_HOME
# still wins if the caller pins something Gradle can actually run.
if [ -z "${JAVA_HOME:-}" ] && [ -d "$HOME/.jdks/jdk-21.0.12.1+1" ]; then
  export JAVA_HOME="$HOME/.jdks/jdk-21.0.12.1+1"
  export PATH="$JAVA_HOME/bin:$PATH"
fi

# The SDK lives outside PATH on this box (adb at $SDK/platform-tools).
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"

# npm's allowScripts policy blocks @shopify/react-native-skia's postinstall,
# and its CMake step then fails with "Skia prebuilt binaries not found"
# (observed 2026-10-14). Run the package's own installer when the binaries
# are missing.
if [ ! -d "node_modules/@shopify/react-native-skia/libs/android" ]; then
  (cd node_modules/@shopify/react-native-skia && node scripts/install-libs.js)
fi

npx expo prebuild -p android --no-install --clean

cd android
./gradlew "$TASK"

echo "--- artifacts ---"
find app/build/outputs -name '*.apk' -o -name '*.aab' | while read -r f; do
  ls -l "$f" | awk '{print $5, $9}'
done

# Preserve the artifact OUTSIDE android/, which the `--clean` prebuild above
# deletes wholesale. The M5 dev-client APK was built, measured, and then
# destroyed by the next profile's build because only the ship APK had ever
# been copied out by hand — 19 minutes of build gone with nothing to show a
# reviewer. dist/ is the artifact of record for every profile now.
cd ..
mkdir -p dist
case "$PROFILE" in
  development) SRC=android/app/build/outputs/apk/debug/app-debug.apk; DEST=dist/eudaimonia-devclient.apk ;;
  preview) SRC=android/app/build/outputs/apk/release/app-release.apk; DEST=dist/eudaimonia-ship.apk ;;
  production) SRC=android/app/build/outputs/bundle/release/app-release.aab; DEST=dist/eudaimonia-store.aab ;;
esac
# A point-build at a stand-in server is NOT the ship artifact and must never
# take its name: verify_apk.sh's drain leg restores dist/eudaimonia-ship.apk
# afterwards, so clobbering it there would leave the owner's phone running a
# cleartext build aimed at a laptop that is no longer listening.
if [ -n "${EXPO_PUBLIC_API_BASE:-}" ]; then
  DEST="${DEST%.*}-pointbuild.${DEST##*.}"
fi
if [ -f "$SRC" ]; then
  cp "$SRC" "$DEST"
  echo "preserved: $DEST ($(stat -c %s "$DEST") bytes)"
else
  echo "WARNING: expected $SRC, not preserving" >&2
fi
