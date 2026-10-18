export type CommitmentType = 'safe' | 'balanced' | 'aggressive';
export type CommitmentStatus = 'active' | 'matured' | 'settled' | 'exited';

export interface TypeSpec {
  id: CommitmentType;
  name: string;
  tagline: string;
  apy: number; // target APY in percent
  maxLoss: number; // max loss % the commitment tolerates
  penalty: number; // early exit penalty %
  minDays: number;
}

export const TYPES: TypeSpec[] = [
  {
    id: 'safe',
    name: 'Safe',
    tagline: 'Capital preservation with tight loss limits.',
    apy: 4.5,
    maxLoss: 2,
    penalty: 3,
    minDays: 7,
  },
  {
    id: 'balanced',
    name: 'Balanced',
    tagline: 'Moderate yield with moderate drawdown tolerance.',
    apy: 9,
    maxLoss: 8,
    penalty: 5,
    minDays: 14,
  },
  {
    id: 'aggressive',
    name: 'Aggressive',
    tagline: 'Maximum yield, wide loss tolerance, longer lock.',
    apy: 16,
    maxLoss: 20,
    penalty: 8,
    minDays: 30,
  },
];

export interface Commitment {
  id: string;
  type: CommitmentType;
  asset: string;
  amount: number;
  durationDays: number;
  maxLoss: number;
  penalty: number;
  apy: number;
  createdAt: number; // ms epoch
  status: CommitmentStatus;
  owner: string | null;
  txHash: string | null;
}

const KEY = 'commitlabs.commitments.v1';
const DAY = 86_400_000;

export function specFor(type: CommitmentType): TypeSpec {
  return TYPES.find((t) => t.id === type) ?? TYPES[1]!;
}

export function maturityOf(c: Commitment): number {
  return c.createdAt + c.durationDays * DAY;
}

export function effectiveStatus(c: Commitment, now = Date.now()): CommitmentStatus {
  if (c.status === 'active' && now >= maturityOf(c)) return 'matured';
  return c.status;
}

export function progressOf(c: Commitment, now = Date.now()): number {
  const total = c.durationDays * DAY;
  return Math.max(0, Math.min(1, (now - c.createdAt) / total));
}

export function projectedYield(c: Commitment): number {
  return (c.amount * (c.apy / 100) * c.durationDays) / 365;
}

export function newId(): string {
  const n = Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0')
    .toUpperCase();
  return `CMT-${n}`;
}

function seed(): Commitment[] {
  const now = Date.now();
  return [
    {
      id: 'CMT-A1B2C3',
      type: 'balanced',
      asset: 'USDC',
      amount: 2500,
      durationDays: 30,
      maxLoss: 8,
      penalty: 5,
      apy: 9,
      createdAt: now - 12 * DAY,
      status: 'active',
      owner: null,
      txHash: null,
    },
    {
      id: 'CMT-D4E5F6',
      type: 'safe',
      asset: 'XLM',
      amount: 10000,
      durationDays: 14,
      maxLoss: 2,
      penalty: 3,
      apy: 4.5,
      createdAt: now - 20 * DAY,
      status: 'active',
      owner: null,
      txHash: null,
    },
  ];
}

export function loadCommitments(): Commitment[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Commitment[];
  } catch {
    /* storage unavailable */
  }
  const s = seed();
  saveCommitments(s);
  return s;
}

export function saveCommitments(list: Commitment[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function fmt(n: number, digits = 2): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: digits });
}
