import type { AuditEvent } from '../shared/types';

export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function audit(
  actor: AuditEvent['actor'],
  action: string,
  message: string,
  level: AuditEvent['level'] = 'info',
  data?: Record<string, unknown>
): AuditEvent {
  return {
    id: uid('evt'),
    at: nowIso(),
    actor,
    action,
    message,
    level,
    data
  };
}

export function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function bps(value: number, basisPoints: number): number {
  return value * (basisPoints / 10_000);
}
