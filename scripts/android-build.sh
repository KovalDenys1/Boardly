#!/usr/bin/env bash
# Builds the signed Play bundle (.aab) and a device .apk of the Android TWA (#1467).
# Bubblewrap builds unsigned; jarsigner and apksigner sign here. The upload-key password is read
# from the macOS keychain and reaches them only through the environment: Bubblewrap's own signing
# puts it on a command line, where any `ps` sees it. It is never printed or written to a file.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$REPO_ROOT/android"
KEYSTORE="$HOME/.config/boardly-android/upload-key.jks"
KEY_ALIAS="upload"
KEYCHAIN_ACCOUNT="boardly"
KEYCHAIN_SERVICE="boardly-android-upload"
BUILD_TOOLS_VERSION="36.1.0" # the version Bubblewrap 1.27.0 installs and checks for

fail() {
  echo "android-build: $1" >&2
  exit 1
}

command -v bubblewrap >/dev/null 2>&1 || fail "bubblewrap not found; install it with 'npm i -g @bubblewrap/cli@1.27.0' (docs/ANDROID.md)"
command -v perl >/dev/null 2>&1 || fail "perl not found; it redacts the password from the signing output"

# Bubblewrap and Gradle both need JDK 17; the system java on this Mac is not a runtime.
JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home}"
[ -x "$JAVA_HOME/bin/java" ] || fail "JDK 17 missing at $JAVA_HOME; run 'brew install openjdk@17'"
export JAVA_HOME
export PATH="$JAVA_HOME/bin:$PATH" # apksigner starts plain `java`

SDK_DIR="$(node -p "require(process.env.HOME + '/.bubblewrap/config.json').androidSdkPath" 2>/dev/null)" ||
  fail "$HOME/.bubblewrap/config.json has no androidSdkPath; run 'bubblewrap doctor' (docs/ANDROID.md)"
APKSIGNER="$SDK_DIR/build-tools/$BUILD_TOOLS_VERSION/apksigner"
[ -x "$APKSIGNER" ] || fail "apksigner missing at $APKSIGNER; run 'bubblewrap doctor' (docs/ANDROID.md)"

[ -f "$KEYSTORE" ] || fail "keystore missing at $KEYSTORE; restore it from ~/Library/Mobile Documents/com~apple~CloudDocs/Keys/boardly-upload-key.jks (docs/ANDROID.md)"

PASSWORD="$(security find-generic-password -a "$KEYCHAIN_ACCOUNT" -s "$KEYCHAIN_SERVICE" -w 2>/dev/null)" ||
  fail "keychain item '$KEYCHAIN_SERVICE' (account '$KEYCHAIN_ACCOUNT') not found; add the upload-key password to the login keychain (docs/ANDROID.md)"
[ -n "$PASSWORD" ] || fail "keychain item '$KEYCHAIN_SERVICE' is empty"

# Bubblewrap regenerates android/ and bumps the version when twa-manifest.json differs from the
# last generation, and asks first. Stop here instead of answering that prompt in a script.
[ -f "$ANDROID_DIR/manifest-checksum.txt" ] ||
  fail "android/manifest-checksum.txt missing; regenerate the project with 'cd android && bubblewrap update --skipVersionUpgrade'"
EXPECTED_SUM="$(tr -d '[:space:]' <"$ANDROID_DIR/manifest-checksum.txt")"
ACTUAL_SUM="$(shasum -a 1 "$ANDROID_DIR/twa-manifest.json" | cut -d' ' -f1)"
[ "$EXPECTED_SUM" = "$ACTUAL_SUM" ] ||
  fail "android/twa-manifest.json changed since the project was generated; run 'cd android && bubblewrap update --skipVersionUpgrade' and commit the result"

# Gradle rewrites this tracked file from the manifest's shortcuts on every build, so the file is
# put back as it was whether the build succeeds or fails.
SHORTCUTS="$ANDROID_DIR/app/src/main/res/xml/shortcuts.xml"
SNAPSHOT="$(mktemp)"
cp "$SHORTCUTS" "$SNAPSHOT"
cleanup() {
  cp "$SNAPSHOT" "$SHORTCUTS"
  rm -f "$SNAPSHOT"
}
trap cleanup EXIT

# The password stays a plain shell variable; only the processes that need it get it, as an
# environment variable. Whatever they print goes through this filter as well.
redact_password() {
  # shellcheck disable=SC2016
  REDACT="$PASSWORD" perl -pe 'BEGIN { $| = 1; $p = $ENV{REDACT} } s/\Q$p\E/[redacted]/g if length $p'
}

UNSIGNED_BUNDLE="$ANDROID_DIR/app/build/outputs/bundle/release/app-release.aab"
UNSIGNED_APK="$ANDROID_DIR/app-release-unsigned-aligned.apk"
SIGNED_BUNDLE="$ANDROID_DIR/app-release-bundle.aab"
SIGNED_APK="$ANDROID_DIR/app-release-signed.apk"
rm -f "$SIGNED_BUNDLE" "$SIGNED_APK" "$SIGNED_APK.idsig"

cd "$ANDROID_DIR"
nice -n 10 bubblewrap build --skipPwaValidation --skipSigning </dev/null 2>&1 | redact_password

# Same algorithms Bubblewrap uses for the bundle. The input apk is already zipaligned: Bubblewrap
# verifies that right after Gradle builds it.
BOARDLY_UPLOAD_PASSWORD="$PASSWORD" "$JAVA_HOME/bin/jarsigner" -sigalg SHA256withRSA -digestalg SHA-256 \
  -keystore "$KEYSTORE" -storepass:env BOARDLY_UPLOAD_PASSWORD -keypass:env BOARDLY_UPLOAD_PASSWORD \
  -signedjar "$SIGNED_BUNDLE" "$UNSIGNED_BUNDLE" "$KEY_ALIAS" 2>&1 | redact_password
BOARDLY_UPLOAD_PASSWORD="$PASSWORD" "$APKSIGNER" sign --ks "$KEYSTORE" --ks-key-alias "$KEY_ALIAS" \
  --ks-pass env:BOARDLY_UPLOAD_PASSWORD --key-pass env:BOARDLY_UPLOAD_PASSWORD \
  --out "$SIGNED_APK" "$UNSIGNED_APK" 2>&1 | redact_password

for artifact in "$SIGNED_BUNDLE" "$SIGNED_APK"; do
  [ -s "$artifact" ] || fail "build finished but $(basename "$artifact") was not produced"
  echo "$artifact"
done
