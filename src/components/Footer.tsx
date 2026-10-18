import Link from 'next/link';
import { REPO_URL } from '@/lib/config';

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <span>CommitLabs &middot; Liquidity as a commitment on Stellar Soroban</span>
        <span className="footer-links">
          <Link href="/docs">Docs</Link>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href="https://stellar.expert/explorer/testnet" target="_blank" rel="noreferrer">
            Testnet explorer
          </a>
        </span>
      </div>
    </footer>
  );
}
