// background.js - Service worker that handles Native Messaging

const NATIVE_HOST = 'com.vitorpy.tpmfido';

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type !== 'webauthn') {
    return false;
  }

  console.log('[TPM-FIDO bg] Received:', request.action, request.requestId);

  // Build native message
  const nativeMessage = {
    type: request.action,
    requestId: request.requestId,
    origin: request.origin,
    options: request.options
  };

  // Send to native host
  chrome.runtime.sendNativeMessage(NATIVE_HOST, nativeMessage, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[TPM-FIDO bg] Native messaging error:', chrome.runtime.lastError.message);
      sendResponse({
        success: false,
        error: {
          name: 'UnknownError',
          message: chrome.runtime.lastError.message
        }
      });
      return;
    }

    console.log('[TPM-FIDO bg] Native response:', response);

    // Pass through the response from native host
    sendResponse(response);
  });

  // Return true to indicate async response
  return true;
});

// Log when service worker starts
console.log('[TPM-FIDO bg] Service worker started');
