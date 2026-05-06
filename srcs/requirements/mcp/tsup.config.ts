import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'es2022',
  clean: true,
  sourcemap: true,
  noExternal: ['@polyagents/sdk', '@polyagents/schema'],
  external: [
    '@hashgraph/sdk',
    'viem',
    'viem/accounts',
    'viem/chains',
    'viem/ens',
  ],
  banner: {
    js: '#!/usr/bin/env node',
  },
})
