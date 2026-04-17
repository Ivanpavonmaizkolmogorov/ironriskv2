import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const date = new Date();
const buildTime = `${date.getUTCDate().toString().padStart(2, '0')}-${date.toLocaleString('en-US', { month: 'short' })} ${date.getUTCHours().toString().padStart(2, '0')}:${date.getUTCMinutes().toString().padStart(2, '0')} UTC`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_FRONTEND_BUILD_TIME: buildTime,
  }
};

export default withNextIntl(nextConfig);
