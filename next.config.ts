import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack(config, { webpack, nextRuntime }) {
    // The Anthropic SDK's credential-loading helpers contain dynamic
    // `import('node:fs')` / `import('node:path')` calls used only for
    // reading OAuth / file-based credentials. We use ANTHROPIC_API_KEY
    // env-var auth exclusively, so those code paths never execute — but
    // webpack's Edge bundler still tries to resolve them at build time.
    //
    // Two-step fix:
    //   1. NormalModuleReplacementPlugin strips the "node:" prefix so
    //      webpack can resolve the bare module name ("fs", "path", …).
    //   2. resolve.fallback maps those bare names to `false` (empty stub)
    //      so the Edge bundle compiles without any Node-only runtime code.
    if (nextRuntime === 'edge') {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource: { request: string }) => {
          resource.request = resource.request.replace(/^node:/, '');
        }),
      );
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;
