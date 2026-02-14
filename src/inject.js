// inject.js - Injected into page context to override WebAuthn API

(function() {
  'use strict';

  // Avoid double injection
  if (window.__tpmFidoInjected) return;
  window.__tpmFidoInjected = true;

  const EXTENSION_ID = 'tpmfido';

  // Store original methods
  const originalCreate = navigator.credentials.create.bind(navigator.credentials);
  const originalGet = navigator.credentials.get.bind(navigator.credentials);

  // ============== Serialization Helpers ==============

  /**
   * Convert ArrayBuffer to base64url string (URL-safe, no padding)
   * Used for all WebAuthn binary fields per spec:
   * https://www.w3.org/TR/webauthn-3/#base64url-encoding
   */
  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  /**
   * Convert base64url string (with or without padding) to ArrayBuffer
   * Handles base64url input as used in WebAuthn JSON structures
   */
  function base64ToArrayBuffer(base64url) {
    // Convert base64url to base64
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    // Add padding if needed
    const padded = base64 + '='.repeat((3 * base64.length) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // Serialize PublicKeyCredentialCreationOptions for JSON transport
  function serializeCreateOptions(options) {
    const serialized = {
      challenge: arrayBufferToBase64(options.challenge),
      rp: { ...options.rp },
      user: {
        id: arrayBufferToBase64(options.user.id),
        name: options.user.name,
        displayName: options.user.displayName
      },
      pubKeyCredParams: options.pubKeyCredParams,
      timeout: options.timeout,
      attestation: options.attestation,
      authenticatorSelection: options.authenticatorSelection,
    };

    if (options.excludeCredentials) {
      serialized.excludeCredentials = options.excludeCredentials.map(cred => ({
        type: cred.type,
        id: arrayBufferToBase64(cred.id),
        transports: cred.transports
      }));
    }

    if (options.extensions) {
      serialized.extensions = {};

      // Handle PRF extension
      if (options.extensions.prf) {
        serialized.extensions.prf = {};
        if (options.extensions.prf.eval) {
          serialized.extensions.prf.eval = {};
          if (options.extensions.prf.eval.first) {
            serialized.extensions.prf.eval.first = arrayBufferToBase64(options.extensions.prf.eval.first);
          }
          if (options.extensions.prf.eval.second) {
            serialized.extensions.prf.eval.second = arrayBufferToBase64(options.extensions.prf.eval.second);
          }
        }
        if (options.extensions.prf.evalByCredential) {
          // Handle per-credential PRF salts if needed
          serialized.extensions.prf.evalByCredential = {};
          for (const [credId, evalObj] of Object.entries(options.extensions.prf.evalByCredential)) {
            serialized.extensions.prf.evalByCredential[credId] = {
              first: evalObj.first ? arrayBufferToBase64(evalObj.first) : undefined,
              second: evalObj.second ? arrayBufferToBase64(evalObj.second) : undefined
            };
          }
        }
      }

      // Pass through other extensions as-is
      for (const [key, value] of Object.entries(options.extensions)) {
        if (key !== 'prf') {
          serialized.extensions[key] = value;
        }
      }
    }

    return serialized;
  }

  // Check if a domain ends with any allowed eTLD
  function endsWithAllowedSuffix(domain) {
    // Allowlist of the most common eTLDs. Checked only when the RP wants to use
    // a parent domain of the origin's domain. Allows common domains without
    // pulling in a Public Suffix List.
    const ALLOWED_PARENT_SUFFIXES = [
      'com',
      'org',
      'net',
      'edu',
      'gov',
      'to',
      'co.uk',
      'com.au',
      'com.br',
      'com.mx',
      'com.ar',
      'com.co',
    ];

    return ALLOWED_PARENT_SUFFIXES.some(suffix => {
      return domain.endsWith('.' + suffix);
    });
  }

  // validate RP ID for credentials get
  function validateRpId(rpId, hostname) {
    // Default to current hostname if rpId is not provided
    if (!rpId) {
      return hostname;
    }

    if (rpId === hostname) {
      return hostname;
    }

    if (hostname === 'localhost') {
      if (rpId !== 'localhost') {
        throw new Error(`rpId '${rpId}' is not valid for origin 'localhost'`);
      }
      return rpId;
    }

    // Validate rpId format
    if (!rpId.includes('.') || rpId.startsWith('.') || rpId.endsWith('.')) {
      throw new Error('Invalid rpId');
    }

    // rpId must be a parent domain of hostname (one or more levels up)
    if (!hostname.endsWith('.' + rpId)) {
      throw new Error(`rpId '${rpId}' is not a parent domain of origin '${hostname}'`);
    }

    // Check if rpId ends with any allowed eTLD suffix
    if (!endsWithAllowedSuffix(rpId)) {
      throw new Error(
        `rpId '${rpId}' is not allowed. ` +
        "Only parent domains under common registrable suffixes (e.g., '.com', '.co.uk') are supported."
      );
    }

    return rpId;
  }

  // Serialize PublicKeyCredentialRequestOptions for JSON transport
  function serializeGetOptions(options) {
    const rpId = validateRpId(options?.rpId, location.hostname);
    const serialized = {
      challenge: arrayBufferToBase64(options.challenge),
      rpId: rpId,
      timeout: options.timeout,
      userVerification: options.userVerification,
    };

    if (options.allowCredentials) {
      serialized.allowCredentials = options.allowCredentials.map(cred => ({
        type: cred.type,
        id: arrayBufferToBase64(cred.id),
        transports: cred.transports
      }));
    }

    if (options.extensions) {
      serialized.extensions = {};

      // Handle PRF extension
      if (options.extensions.prf) {
        serialized.extensions.prf = {};
        if (options.extensions.prf.eval) {
          serialized.extensions.prf.eval = {};
          if (options.extensions.prf.eval.first) {
            serialized.extensions.prf.eval.first = arrayBufferToBase64(options.extensions.prf.eval.first);
          }
          if (options.extensions.prf.eval.second) {
            serialized.extensions.prf.eval.second = arrayBufferToBase64(options.extensions.prf.eval.second);
          }
        }
        if (options.extensions.prf.evalByCredential) {
          serialized.extensions.prf.evalByCredential = {};
          for (const [credId, evalObj] of Object.entries(options.extensions.prf.evalByCredential)) {
            serialized.extensions.prf.evalByCredential[credId] = {
              first: evalObj.first ? arrayBufferToBase64(evalObj.first) : undefined,
              second: evalObj.second ? arrayBufferToBase64(evalObj.second) : undefined
            };
          }
        }
      }

      for (const [key, value] of Object.entries(options.extensions)) {
        if (key !== 'prf') {
          serialized.extensions[key] = value;
        }
      }
    }

    return serialized;
  }

  // Deserialize create response to PublicKeyCredential
  function deserializeCreateResponse(response) {
    const credential = {
      id: response.id,
      rawId: base64ToArrayBuffer(response.rawId),
      type: response.type,
      authenticatorAttachment: response.authenticatorAttachment,
      response: {
        clientDataJSON: base64ToArrayBuffer(response.response.clientDataJSON),
        attestationObject: base64ToArrayBuffer(response.response.attestationObject),
        getTransports: () => response.response.transports || ['internal'],
        getAuthenticatorData: () => {
          // Parse from attestationObject if needed
          // For now, return undefined - most sites don't need this
          return undefined;
        },
        getPublicKey: () => {
          // Would need to parse from attestationObject
          return null;
        },
        getPublicKeyAlgorithm: () => {
          return -7; // ES256
        }
      },
      getClientExtensionResults: () => {
        const results = {};
        if (response.clientExtensionResults) {
          if (response.clientExtensionResults.prf) {
            results.prf = {
              enabled: response.clientExtensionResults.prf.enabled
            };
            if (response.clientExtensionResults.prf.results) {
              results.prf.results = {};
              if (response.clientExtensionResults.prf.results.first) {
                results.prf.results.first = base64ToArrayBuffer(response.clientExtensionResults.prf.results.first);
              }
              if (response.clientExtensionResults.prf.results.second) {
                results.prf.results.second = base64ToArrayBuffer(response.clientExtensionResults.prf.results.second);
              }
            }
          }
        }
        return results;
      }
    };

    // Make it look like a real PublicKeyCredential
    Object.setPrototypeOf(credential, PublicKeyCredential.prototype);
    Object.setPrototypeOf(credential.response, AuthenticatorAttestationResponse.prototype);

    return credential;
  }

  // Deserialize get response to PublicKeyCredential
  function deserializeGetResponse(response) {
    const credential = {
      id: response.id,
      rawId: base64ToArrayBuffer(response.rawId),
      type: response.type,
      authenticatorAttachment: response.authenticatorAttachment,
      response: {
        clientDataJSON: base64ToArrayBuffer(response.response.clientDataJSON),
        authenticatorData: base64ToArrayBuffer(response.response.authenticatorData),
        signature: base64ToArrayBuffer(response.response.signature),
        userHandle: response.response.userHandle
          ? base64ToArrayBuffer(response.response.userHandle)
          : null
      },
      getClientExtensionResults: () => {
        const results = {};
        if (response.clientExtensionResults) {
          if (response.clientExtensionResults.prf) {
            results.prf = {};
            if (response.clientExtensionResults.prf.results) {
              results.prf.results = {};
              if (response.clientExtensionResults.prf.results.first) {
                results.prf.results.first = base64ToArrayBuffer(response.clientExtensionResults.prf.results.first);
              }
              if (response.clientExtensionResults.prf.results.second) {
                results.prf.results.second = base64ToArrayBuffer(response.clientExtensionResults.prf.results.second);
              }
            }
          }
        }
        return results;
      }
    };

    Object.setPrototypeOf(credential, PublicKeyCredential.prototype);
    Object.setPrototypeOf(credential.response, AuthenticatorAssertionResponse.prototype);

    return credential;
  }

  // ============== Message Passing ==============

  function sendToExtension(type, options) {
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();

      function handleResponse(event) {
        if (event.source !== window) return;
        if (event.data?.type !== 'tpmfido-response') return;
        if (event.data?.requestId !== requestId) return;

        window.removeEventListener('message', handleResponse);

        if (event.data.success) {
          resolve(event.data.credential);
        } else {
          const error = new DOMException(
            event.data.error?.message || 'Unknown error',
            event.data.error?.name || 'UnknownError'
          );
          reject(error);
        }
      }

      window.addEventListener('message', handleResponse);

      window.postMessage({
        type: 'tpmfido-request',
        requestId: requestId,
        action: type,
        origin: window.location.origin,
        options: options
      }, '*');

      // Timeout fallback (should match or exceed the authenticator timeout)
      const timeout = options.timeout || 60000;
      setTimeout(() => {
        window.removeEventListener('message', handleResponse);
        reject(new DOMException('Operation timed out', 'NotAllowedError'));
      }, timeout + 5000); // Add buffer for processing
    });
  }

  // ============== WebAuthn API Overrides ==============

  navigator.credentials.create = async function(options) {
    // Only intercept publicKey (WebAuthn) requests
    if (!options?.publicKey) {
      return originalCreate(options);
    }

    console.log('[TPM-FIDO] Intercepting credentials.create()', options.publicKey);

    try {
      const serialized = serializeCreateOptions(options.publicKey);
      const response = await sendToExtension('create', serialized);
      const credential = deserializeCreateResponse(response);
      console.log('[TPM-FIDO] credentials.create() success', credential);
      return credential;
    } catch (error) {
      console.error('[TPM-FIDO] credentials.create() error', error);
      throw error;
    }
  };

  navigator.credentials.get = async function(options) {
    // Only intercept publicKey (WebAuthn) requests
    if (!options?.publicKey) {
      return originalGet(options);
    }

    console.log('[TPM-FIDO] Intercepting credentials.get()', options.publicKey);

    try {
      const serialized = serializeGetOptions(options.publicKey);
      const response = await sendToExtension('get', serialized);
      const credential = deserializeGetResponse(response);
      console.log('[TPM-FIDO] credentials.get() success', credential);
      return credential;
    } catch (error) {
      console.error('[TPM-FIDO] credentials.get() error', error);
      throw error;
    }
  };

  // Override isUserVerifyingPlatformAuthenticatorAvailable to return true
  PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = async function() {
    return true;
  };

  // Override isConditionalMediationAvailable if it exists
  if (PublicKeyCredential.isConditionalMediationAvailable) {
    PublicKeyCredential.isConditionalMediationAvailable = async function() {
      return true; // We support discoverable credentials
    };
  }

  console.log('[TPM-FIDO] WebAuthn API override installed');
})();
