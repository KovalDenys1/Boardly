#!/usr/bin/env bash
# Builds the signed Play bundle (.aab) and a device .apk of the Android TWA (#1467).
# The upload-key password is read from the macOS keychain and handed to Bubblewrap through
# its two environment variables; it is never printed or written to a file.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$REPO_ROOT/android"
KEYSTORE="$HOME/.config/boardly-android/upload-key.jks"
KEY_ALIAS="upload"
KEYCHAIN_ACCOUNT="boardly"
KEYCHAIN_SERVICE="boardly-android-upload"

fail() {
  echo "android-build: $1" >&2
  exit 1
}

command -v bubblewrap >/dev/null 2>&1 || fail "bubblewrap not found; install it with 'npm i -g @bubblewrap/cli@1.27.0' (docs/ANDROID.md)"
command -v perl >/dev/null 2>&1 || fail "perl not found; it redacts the password from the build output"

# Bubblewrap and Gradle both need JDK 17; the system java on this Mac is not a runtime.
JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home}"
[ -x "$JAVA_HOME/bin/java" ] || fail "JDK 17 missing at $JAVA_HOME; run 'brew install openjdk@17'"
export JAVA_HOME

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

export BUBBLEWRAP_KEYSTORE_PASSWORD="$PASSWORD"
export BUBBLEWRAP_KEY_PASSWORD="$PASSWORD"
unset PASSWORD

# Gradle rewrites this tracked file from the manifest's shortcuts on every build, so the file is
# put back as it was whether the build succeeds or fails.
SHORTCUTS="$ANDROID_DIR/app/src/main/res/xml/shortcuts.xml"
SNAPSHOT="$(mktemp)"
cp "$SHORTCUTS" "$SNAPSHOT"
cleanup() {
  cp "$SNAPSHOT" "$SHORTCUTS"
  rm -f "$SNAPSHOT"
  # The Gradle daemon would keep the password variables in its environment for hours.
  (cd "$ANDROID_DIR" && ./gradlew --stop >/dev/null 2>&1) || true
}
trap cleanup EXIT

# A failed signing makes Bubblewrap print the signer's command line, password included.
redact_password() {
  # shellcheck disable=SC2016
  perl -pe 'BEGIN { $| = 1; $p = $ENV{BUBBLEWRAP_KEY_PASSWORD} } s/\Q$p\E/[redacted]/g if length $p'
}

# Bubblewrap does not expand '~', so the manifest's signingKey.path is overridden with an absolute one.
cd "$ANDROID_DIR"
nice -n 10 bubblewrap build --skipPwaValidation --signingKeyPath "$KEYSTORE" --signingKeyAlias "$KEY_ALIAS" </dev/null 2>&1 | redact_password

for artifact in app-release-bundle.aab app-release-signed.apk; do
  [ -s "$ANDROID_DIR/$artifact" ] || fail "build finished but $artifact was not produced"
  echo "$ANDROID_DIR/$artifact"
done
