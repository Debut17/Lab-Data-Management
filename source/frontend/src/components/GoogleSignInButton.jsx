import { useEffect, useRef, useState } from 'react';

const GOOGLE_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  const existing = document.querySelector(`script[src="${GOOGLE_SCRIPT_SRC}"]`);
  return new Promise((resolve, reject) => {
    const script = existing ?? document.createElement('script');
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('Google sign-in could not be loaded.')), { once: true });
    if (!existing) {
      script.src = GOOGLE_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });
}

// US-16: renders the official Google Identity Services button and hands the
// returned ID token to the backend, which verifies it.
export default function GoogleSignInButton({ clientId, allowedEmailDomain, onCredential }) {
  const containerRef = useRef(null);
  const callbackRef = useRef(onCredential);
  const [loadError, setLoadError] = useState('');

  callbackRef.current = onCredential;

  useEffect(() => {
    let isCurrent = true;
    loadGoogleScript()
      .then(() => {
        if (!isCurrent || !containerRef.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          hd: allowedEmailDomain,
          callback: (response) => callbackRef.current(response.credential),
        });
        window.google.accounts.id.renderButton(containerRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          width: 320,
        });
      })
      .catch((error) => {
        if (isCurrent) setLoadError(error.message);
      });
    return () => {
      isCurrent = false;
    };
  }, [clientId, allowedEmailDomain]);

  return (
    <div className="google-sign-in">
      <div ref={containerRef} data-testid="google-sign-in-button" />
      {loadError && <div role="alert" className="message error-message">{loadError}</div>}
    </div>
  );
}
