import type { Metadata } from 'next';
import './globals.css';
import { WalletProvider } from '@/components/WalletProvider';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { WalletNotice } from '@/components/WalletNotice';

export const metadata: Metadata = {
  title: 'CommitLabs - Liquidity as a Commitment',
  description:
    'Turn passive liquidity into enforceable, attestable on-chain commitments on Stellar Soroban.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>
          <Header />
          <WalletNotice />
          <main id="main-content">{children}</main>
          <Footer />
        </WalletProvider>
      </body>
    </html>
  );
}
