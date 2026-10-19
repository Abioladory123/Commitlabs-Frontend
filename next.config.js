/** @type {import('next').NextConfig} */
const { execSync } = require('child_process');

try {
  execSync('node scripts/validate-env.mjs', { stdio: 'inherit' });
} catch (err) {
  process.exit(1);
}

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
