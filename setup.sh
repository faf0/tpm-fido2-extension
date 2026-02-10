#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Stable extension ID (derived from the key in manifest.json)
EXTENSION_ID="bfmfknknibchmioeamgbnlpakcjimnbf"
BINARY_PATH="$HOME/bin/tpm-fido"

echo "=== TPM-FIDO Extension Native Messaging Setup ==="
echo ""

# Check if binary exists
if [ ! -x "$BINARY_PATH" ]; then
    echo "Error: tpm-fido binary not found at $BINARY_PATH"
    echo ""
    echo "Please build and install tpm-fido first:"
    echo "  cd ../tpm-fido2-prf"
    echo "  go build -o tpm-fido ."
    echo "  mkdir -p ~/bin"
    echo "  cp tpm-fido ~/bin/"
    exit 1
fi

# Detect browser config directory
CHROME_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
CHROMIUM_DIR="$HOME/.config/chromium/NativeMessagingHosts"
BRAVE_DIR="$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"

INSTALL_DIRS=()
if [ -d "$HOME/.config/google-chrome" ]; then
    INSTALL_DIRS+=("$CHROME_DIR")
fi
if [ -d "$HOME/.config/chromium" ]; then
    INSTALL_DIRS+=("$CHROMIUM_DIR")
fi
if [ -d "$HOME/.config/BraveSoftware/Brave-Browser" ]; then
    INSTALL_DIRS+=("$BRAVE_DIR")
fi

if [ ${#INSTALL_DIRS[@]} -eq 0 ]; then
    echo "Warning: No Chrome/Chromium/Brave config directory found"
    echo "Creating Chrome directory..."
    INSTALL_DIRS=("$CHROME_DIR")
fi

# Create manifest content
MANIFEST_CONTENT=$(cat <<EOF
{
  "name": "com.vitorpy.tpmfido",
  "description": "TPM-FIDO WebAuthn Platform Authenticator with PRF support",
  "path": "$BINARY_PATH",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
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

echo ""
echo "=== Setup complete ==="
echo ""
echo "Extension ID: $EXTENSION_ID"
echo "Binary path: $BINARY_PATH"
echo ""
echo "Native messaging manifests installed:"
for INSTALL_DIR in "${INSTALL_DIRS[@]}"; do
    echo "  - $INSTALL_DIR/com.vitorpy.tpmfido.json"
done
echo ""
echo "Next steps:"
echo "  1. Load the extension in Chrome (chrome://extensions → Load unpacked)"
echo "  2. Restart Chrome"
echo "  3. Test on https://webauthn.io"
