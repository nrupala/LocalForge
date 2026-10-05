/**
 * LocalForge editions — LICENSE FLAGS, never forks.
 *
 * One codebase, one CI. Every edition difference is a flag read through this
 * module. No edition may introduce a duplicated code path: features check
 * `verificationEnabled()`, `getActiveEdition()` or `isAirGapCapable()` and
 * branch on the result.
 *
 * Editions (converged 2026-10-05):
 *   workshop   — Founder Workshop: CLI + VS Code ext + Web UI, local-first.
 *   complete   — LocalForge Complete: the bundle (workshop + air-gap + verification).
 *   enterprise — Air-gap Enterprise: hardened packaging for regulated teams.
 *   perpetual  — Perpetual air-gap license (one-time).
 *
 * Resolution order: LOCALFORGE_EDITION env var. Default is 'workshop'
 * (the free Self-Hosted tier). Verification is included in complete /
 * enterprise / perpetual, or added to Pro via LOCALFORGE_VERIFICATION=1
 * (the $15/mo verification add-on).
 */

export type EditionId = 'workshop' | 'complete' | 'enterprise' | 'perpetual';

export interface Tier {
  id: string;
  name: string;
  price: string;
  edition: EditionId;
  verification: boolean;
  bestFor: string;
}

/** Commercial tiers. Prices set 2026-10-05 at 1.5x verified market pricing. */
export const TIERS: Tier[] = [
  { id: 'self-hosted', name: 'Self-Hosted', price: '$0 forever', edition: 'workshop', verification: false, bestFor: 'Open source, hobbyists, offline use' },
  { id: 'pro', name: 'Pro', price: '$30/mo', edition: 'workshop', verification: false, bestFor: 'Professional developers needing 75+ providers' },
  { id: 'verification-addon', name: 'Verification add-on', price: '$15/mo', edition: 'workshop', verification: true, bestFor: 'Pro seats that need proof certificates' },
  { id: 'complete', name: 'Complete', price: '$45/mo', edition: 'complete', verification: true, bestFor: 'The full bundle: workshop + air-gap packaging + verification' },
  { id: 'enterprise', name: 'Enterprise', price: '$60/user/mo', edition: 'enterprise', verification: true, bestFor: 'Teams needing SSO, private deployment, support' },
  { id: 'perpetual', name: 'Perpetual', price: '$375 one-time', edition: 'perpetual', verification: true, bestFor: 'Air-gapped environments, 1 year of updates' },
];

export const EDITION_LABELS: Record<EditionId, string> = {
  workshop: 'Founder Workshop',
  complete: 'LocalForge Complete',
  enterprise: 'Air-gap Enterprise',
  perpetual: 'Perpetual (air-gap)',
};

/** Resolve the active edition from the environment. Defaults to workshop. */
export function getActiveEdition(): EditionId {
  const raw = (process.env.LOCALFORGE_EDITION || '').toLowerCase().trim();
  if (raw === 'complete' || raw === 'enterprise' || raw === 'perpetual') {
    return raw;
  }
  return 'workshop';
}

/**
 * Whether the verification layer (proof certificates) is active.
 * Included in complete / enterprise / perpetual; on Pro via the
 * LOCALFORGE_VERIFICATION=1 add-on flag.
 */
export function verificationEnabled(): boolean {
  const edition = getActiveEdition();
  if (edition === 'complete' || edition === 'enterprise' || edition === 'perpetual') {
    return true;
  }
  return process.env.LOCALFORGE_VERIFICATION === '1';
}

/** Whether this edition may use hardened air-gap packaging. */
export function isAirGapCapable(): boolean {
  const edition = getActiveEdition();
  return edition === 'complete' || edition === 'enterprise' || edition === 'perpetual';
}

/** One-line human description of the active configuration, for banners/logs. */
export function describeActiveEdition(): string {
  const edition = getActiveEdition();
  const ver = verificationEnabled() ? ' + verification' : '';
  return `${EDITION_LABELS[edition]}${ver}`;
}
