import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  // pdf-parse loads @napi-rs/canvas at runtime so PDF.js can polyfill
  // DOMMatrix/ImageData/Path2D in Node. Bundling pdf-parse hides that dynamic
  // dependency from Next's file tracer and breaks in serverless functions.
  serverExternalPackages: ['pdf-parse', '@napi-rs/canvas'],
  experimental: {
    serverActions: {
      bodySizeLimit: '12mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
