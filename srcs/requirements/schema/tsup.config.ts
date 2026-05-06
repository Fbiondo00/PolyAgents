import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/types/index.ts', 'src/zod/index.ts'],
  format: ['esm', 'cjs'],
  dts: false,
  clean: true,
  sourcemap: true,
  splitting: true,
})
