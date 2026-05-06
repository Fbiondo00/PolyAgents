import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
  ],
  format: ['esm', 'cjs'],
  dts: false,
  clean: true,
  sourcemap: true,
  external: [
    '@hashgraph/sdk',
    'viem',
    'viem/accounts',
    'viem/chains',
    'viem/ens',
  ],
})
