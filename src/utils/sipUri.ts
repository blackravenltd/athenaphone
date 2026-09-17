/**
 * Helpers for turning what a user types into something dialable, and for
 * turning what the PBX sends back into something displayable.
 */

//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

/** Characters a PBX will accept in a dial string. */
const DIALABLE = /[^0-9a-zA-Z*#+._@:-]/g;

/**
 * Build a full SIP URI from a dial string.
 *
 * Accepts bare extensions ("1001"), user@host ("alice@example.com") and
 * already-complete URIs ("sip:alice@example.com"), and leaves the last two
 * alone rather than double-prefixing the domain.
 */
export function toSipUri(target: string, domain: string): string {
  const trimmed = target.trim().replace(DIALABLE, '');
  if (!trimmed) {
    throw new Error('Cannot dial an empty target');
  }
  if (trimmed.startsWith('sip:') || trimmed.startsWith('sips:')) {
    return trimmed;
  }
  if (trimmed.includes('@')) {
    return `sip:${trimmed}`;
  }
  return `sip:${trimmed}@${domain}`;
}

/** Strip the scheme and domain so "sip:1001@pbx.local" displays as "1001". */
export function displayTarget(uri: string): string {
  const withoutScheme = uri.replace(/^sips?:/, '');
  const userPart = withoutScheme.split('@')[0];
  return userPart.split(';')[0];
}

/** Full user@host, without the scheme or any URI parameters. */
export function bareUri(uri: string): string {
  return uri.replace(/^sips?:/, '').split(';')[0];
}

/**
 * Format seconds as a call timer: m:ss under an hour, h:mm:ss beyond it.
 */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');

  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(secs)}`
    : `${minutes}:${pad(secs)}`;
}
