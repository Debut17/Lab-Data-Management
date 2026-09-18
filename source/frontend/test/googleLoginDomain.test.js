import { readFileSync } from 'node:fs';
import path from 'node:path';

import { JSDOM, VirtualConsole } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const pageHtml = readFileSync(
  path.join(process.cwd(), 'public', 'login_page.html'),
  'utf8',
);

let dom;
let doc;
let alerts;
let jsdomErrors;

beforeEach(() => {
  alerts = [];
  jsdomErrors = [];

  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => jsdomErrors.push(error.message));

  dom = new JSDOM(pageHtml, {
    runScripts: 'dangerously',
    url: 'https://lab-data-management.test/login_page.html',
    virtualConsole,
  });
  doc = dom.window.document;
  dom.window.alert = (message) => alerts.push(message);
});

afterEach(() => {
  dom.window.close();
});

function credentialFor(payload) {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(payload)}.unverified-signature`;
}

function signInWith(payload) {
  dom.window.handleCredentialResponse({ credential: credentialFor(payload) });
}

// jsdom does not implement navigation, so a redirect surfaces as a jsdomError
// rather than a change to window.location.
function redirected() {
  return jsdomErrors.some((message) => message.includes('navigation'));
}

describe('US-16 KU account restriction', () => {
  it('accepts a ku.th account and continues to the resource page', () => {
    signInWith({ email: 'student@ku.th', name: 'KU Student', sub: '1' });

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain('Login Successful');
    expect(alerts[0]).toContain('student@ku.th');
    expect(redirected()).toBe(true);
  });

  it('accepts a ku.th account written in upper case', () => {
    signInWith({ email: 'STUDENT@KU.TH', name: 'KU Student', sub: '2' });

    expect(alerts[0]).toContain('Login Successful');
  });

  it('rejects an account from another provider', () => {
    signInWith({ email: 'someone@gmail.com', name: 'Someone', sub: '3' });

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain('Access Denied');
    expect(redirected()).toBe(false);
  });

  it('rejects a token that carries no email address', () => {
    signInWith({ name: 'No Email', sub: '4' });

    expect(alerts[0]).toContain('Access Denied');
    expect(redirected()).toBe(false);
  });

  it('rejects a domain that only starts with ku.th', () => {
    signInWith({ email: 'student@ku.th.example.com', name: 'Lookalike', sub: '5' });

    expect(alerts[0]).toContain('Access Denied');
    expect(redirected()).toBe(false);
  });

  it('rejects a ku.th subdomain address', () => {
    signInWith({ email: 'student@eng.ku.th', name: 'Faculty Address', sub: '6' });

    expect(alerts[0]).toContain('Access Denied');
    expect(redirected()).toBe(false);
  });
});

describe('US-16 Google sign-in configuration', () => {
  it('asks Google to restrict the account chooser to ku.th', () => {
    const onload = doc.getElementById('g_id_onload');

    expect(onload.getAttribute('data-hd')).toBe('ku.th');
    expect(onload.getAttribute('data-client_id')).toBeTruthy();
  });

  it('names a callback that the page actually defines', () => {
    const callbackName = doc
      .getElementById('g_id_onload')
      .getAttribute('data-callback');

    expect(callbackName).toBe('handleCredentialResponse');
    expect(typeof dom.window[callbackName]).toBe('function');
  });

  it('accepts a token whose signature was never verified', () => {
    signInWith({ email: 'student@ku.th', name: 'Forged', sub: '7' });

    expect(alerts[0]).toContain('Login Successful');
  });
});
