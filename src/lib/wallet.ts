import { HORIZON_URL } from './config';

export interface WalletState {
  status: 'idle' | 'connecting' | 'connected' | 'unavailable' | 'error';
  address: string | null;
  message: string | null;
}

/* Freighter is optional: any failure resolves to a readable fallback message. */
export async function connectFreighter(): Promise<WalletState> {
  try {
    const f = await import('@stellar/freighter-api');
    const connected = await f.isConnected();
    if (!connected) {
      return {
        status: 'unavailable',
        address: null,
        message: 'Freighter extension not detected. Install it from freighter.app to connect.',
      };
    }
    const address = await f.getPublicKey();
    if (!address) {
      return { status: 'error', address: null, message: 'Wallet access was not granted.' };
    }
    return { status: 'connected', address, message: null };
  } catch {
    return {
      status: 'unavailable',
      address: null,
      message: 'Wallet could not be reached. You can keep using the app in demo mode.',
    };
  }
}

export async function fetchXlmBalance(address: string): Promise<string | null> {
  try {
    const res = await fetch(`${HORIZON_URL}/accounts/${address}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { balances?: { asset_type: string; balance: string }[] };
    return data.balances?.find((b) => b.asset_type === 'native')?.balance ?? null;
  } catch {
    return null;
  }
}

export function shortAddress(a: string): string {
  return `${a.slice(0, 4)}...${a.slice(-4)}`;
}
