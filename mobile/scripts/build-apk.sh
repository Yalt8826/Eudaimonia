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
