// content.js - Content script that bridges inject.js and background.js

(function() {
  'use strict';

  // Inject the page-context script
  function injectScript() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js');
    script.onload = function() {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  }

  // Inject as early as possible
  injectScript();

  // Listen for messages from inject.js (page context)
  window.addEventListener('message', async (event) => {
    // Only accept messages from same window
    if (event.source !== window) return;

    // Only handle our messages
    if (event.data?.type !== 'tpmfido-request') return;

    const { requestId, action, origin, options } = event.data;

    console.log('[TPM-FIDO content] Received request:', action, requestId);

    try {
      // Forward to background script
      const response = await chrome.runtime.sendMessage({
        type: 'webauthn',
        action: action,
        requestId: requestId,
        origin: origin,
        options: options
      });

      console.log('[TPM-FIDO content] Got response:', response);

      // Send response back to inject.js
      window.postMessage({
        type: 'tpmfido-response',
        requestId: requestId,
        success: response.success,
        credential: response.credential,
        error: response.error
      }, '*');

    } catch (error) {
      console.error('[TPM-FIDO content] Error:', error);

      window.postMessage({
        type: 'tpmfido-response',
        requestId: requestId,
        success: false,
        error: {
          name: 'UnknownError',
          message: error.message || 'Extension communication error'
        }
      }, '*');
    }
  });

  console.log('[TPM-FIDO content] Content script loaded');
})();
