import { OAuth2Client } from 'google-auth-library';

// Verifies a Google Identity Services ID token: signature, expiry, issuer, and
// that it was issued for this application's client ID.
export function createGoogleTokenVerifier({ clientId }) {
  if (!clientId) {
    throw new Error('A Google client ID is required.');
  }
  const client = new OAuth2Client(clientId);

  return async function verifyGoogleToken(idToken) {
    const ticket = await client.verifyIdToken({ idToken, audience: clientId });
    return ticket.getPayload();
  };
}
