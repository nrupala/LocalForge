/**
 * Verification layer — proof certificates for workflow runs.
 *
 * HONEST SCOPE (read before citing a certificate):
 * A certificate attests to the OBSERVED workflow run — which agents ran, in
 * which order, their statuses, and SHA-256 hashes of their outputs — chained
 * to the previous certificate so tampering is detectable. It is NOT a formal
 * proof that the generated code is correct, secure, or complete. The test
 * outcome recorded is the Tester's own reported outcome, not an independent
 * re-execution. See HANDSHAKE.md for the path toward AxiomCode-grade proofs.
 *
 * Chain: chainHash = sha256(prevChainHash + canonical(payload)).
 * Anyone holding the log can recompute every link with verifyCertificate().
 */

import * as crypto from 'crypto';
import { WorkflowStep } from './Workflow';
import { EditionId } from './edition';

export interface CertifiedStep {
  role: string;
  status: string;
  outputHash: string;
}

export interface ProofCertificate {
  serial: string;
  issuedAt: string;
  edition: EditionId;
  goal: string;
  goalHash: string;
  steps: CertifiedStep[];
  success: boolean;
  prevChainHash: string;
  chainHash: string;
  scope: string;
}

export const CERT_SCOPE =
  'Attests to the observed Planner->Writer->Reviewer->Tester run (agent order, ' +
  'statuses, output hashes). Not a formal proof of code correctness.';

let lastChainHash = 'GENESIS';

function sha256Hex(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

function canonicalStep(s: WorkflowStep): CertifiedStep {
  return {
    role: s.role,
    status: s.status,
    outputHash: sha256Hex(s.output || ''),
  };
}

/** Mint a proof certificate for a completed workflow run. */
export function mintCertificate(
  steps: WorkflowStep[],
  goal: string,
  edition: EditionId
): ProofCertificate {
  const issuedAt = new Date().toISOString();
  const serial = `LF-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const certifiedSteps = steps.map(canonicalStep);
  const prevChainHash = lastChainHash;
  const payload = JSON.stringify({
    serial, issuedAt, edition,
    goalHash: sha256Hex(goal),
    steps: certifiedSteps,
    prevChainHash,
  });
  const chainHash = sha256Hex(prevChainHash + payload);
  lastChainHash = chainHash;

  return {
    serial,
    issuedAt,
    edition,
    goal: goal.substring(0, 200),
    goalHash: sha256Hex(goal),
    steps: certifiedSteps,
    success: steps.every(s => s.status === 'completed'),
    prevChainHash,
    chainHash,
    scope: CERT_SCOPE,
  };
}

/**
 * Recompute a certificate's chain link. Returns true when the certificate is
 * internally consistent AND chains to the supplied previous hash.
 */
export function verifyCertificate(cert: ProofCertificate, prevChainHash: string): boolean {
  if (cert.prevChainHash !== prevChainHash) return false;
  const payload = JSON.stringify({
    serial: cert.serial,
    issuedAt: cert.issuedAt,
    edition: cert.edition,
    goalHash: cert.goalHash,
    steps: cert.steps,
    prevChainHash: cert.prevChainHash,
  });
  return sha256Hex(cert.prevChainHash + payload) === cert.chainHash;
}

/** Reset the in-process chain (tests/benchmarks only). */
export function resetChain(): void {
  lastChainHash = 'GENESIS';
}

/** Current head of the in-process chain. */
export function chainHead(): string {
  return lastChainHash;
}
