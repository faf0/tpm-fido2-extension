#!/usr/bin/env bash
set -e

EXTENSION_ID='tpmfido@vitorpy.com'
BINARY_PATH="$HOME/bin/tpm-fido"

echo '=== TPM-FIDO Extension Native Messaging Setup ==='
echo ''

# Check if binary exists
if [ ! -x "$BINARY_PATH" ]; then
    echo "Error: tpm-fido binary not found at $BINARY_PATH"
    echo ''
    echo 'Please build and install tpm-fido first:'
    echo '  cd ../tpm-fido2-prf'
    echo '  go build -o tpm-fido .'
    echo '  mkdir -p ~/bin'
    echo '  cp tpm-fido ~/bin/'
    exit 1
fi

# Detect browser config directory
FIREFOX_DIR="$HOME/.mozilla/native-messaging-hosts"

INSTALL_DIRS=()
if [ -d "$HOME/.mozilla/native-messaging-hosts" ]; then
    INSTALL_DIRS+=("$FIREFOX_DIR")
fi

if [ ${#INSTALL_DIRS[@]} -eq 0 ]; then
    echo 'Warning: No Firefox config directory found'
    echo 'Creating Firefox directory...'
    INSTALL_DIRS=("$FIREFOX_DIR")
fi

# Create manifest content
MANIFEST_CONTENT=$(cat <<EOF
{
  "name": "com.vitorpy.tpmfido",
  "description": "TPM-FIDO WebAuthn Platform Authenticator with PRF support",
  "path": "$BINARY_PATH",
  "type": "stdio",
  "allowed_extensions": [
    "$EXTENSION_ID"
  ]
}
EOF
)

# Install native messaging manifest
for INSTALL_DIR in "${INSTALL_DIRS[@]}"; do
    echo "Installing native messaging manifest to $INSTALL_DIR..."
    mkdir -p "$INSTALL_DIR"
    echo "$MANIFEST_CONTENT" > "$INSTALL_DIR/com.vitorpy.tpmfido.json"
done

# Copy files into extension folder
cp src/background.js firefox/
cp src/content.js firefox/
cp src/inject.js firefox/
cp -r icons firefox/
cd firefox && zip -r ../tpmfido.xpi .

echo ''
echo '=== Setup complete ==='
echo ''
echo "Extension ID: $EXTENSION_ID"
echo "Binary path: $BINARY_PATH"
echo ''
echo 'Native messaging manifests installed:'
for INSTALL_DIR in "${INSTALL_DIRS[@]}"; do
    echo "  - $INSTALL_DIR/com.vitorpy.tpmfido.json"
done
echo ''
echo 'Next steps:'
echo '  1. Load the extension in Firefox'
echo '  1.1. Temporary: Browse to about:debugging#/runtime/this-firefox → Load Temporary Add-on...'
echo '  1.2. Permanent: https://support.mozilla.org/en-US/kb/add-on-signing-in-firefox?as=u&utm_source=inproduct#w_if-firefox-disables-your-add-ons'
echo '  2. Test on https://webauthn.io'
