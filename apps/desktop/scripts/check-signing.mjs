// Run in CI before packaging (.github/workflows/build.yml): signing is configured whole or not at all. A certificate
// without its password, a password without its certificate, notarisation without a certificate or with only part of
// Apple's credentials, or a certificate that is neither base64, an https URL nor a file, stops the build here, naming
// the variables and never their values. Nothing set is fine: the installers are then unsigned.

import { existsSync } from 'node:fs';

const set = (name) => Boolean(process.env[name]?.trim());
const problems = [];

/** Both of a certificate and its password, or neither. */
function pair(certificate, password) {
  if (set(certificate) && !set(password)) problems.push(`${certificate} is set but ${password} is not.`);
  if (!set(certificate) && set(password)) problems.push(`${password} is set but ${certificate} is not.`);
  if (set(certificate)) {
    const value = process.env[certificate].trim();
    const base64 = /^[A-Za-z0-9+/=\s]+$/.test(value) && Buffer.from(value, 'base64').length >= 1000;
    if (!base64 && !value.startsWith('https://') && !existsSync(value)) {
      problems.push(`${certificate} is neither a certificate in base64 (the .p12 file, encoded), an https URL nor a file that exists.`);
    }
  }
}

pair('CSC_LINK', 'CSC_KEY_PASSWORD');
pair('WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD');

const apple = ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'];
const given = apple.filter(set);
if (given.length && given.length < apple.length) {
  problems.push(`Notarisation needs ${apple.join(', ')}; ${apple.filter((name) => !set(name)).join(', ')} not set.`);
}
if (given.length && !set('CSC_LINK')) problems.push('Notarisation needs the app signed: APPLE_* is set but CSC_LINK is not.');

if (problems.length) {
  console.error(['Signing is configured only in part (repository secrets, CLAUDE.md "Commands"):', ...problems.map((p) => `- ${p}`)].join('\n'));
  process.exit(1);
}
console.log(set('CSC_LINK') || set('WIN_CSC_LINK') ? 'Signing is configured.' : 'No signing secrets: the installers will be unsigned.');
