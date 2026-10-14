import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

const webRoot = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: '../static',
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
  },
  server: {
    fs: {
      allow: [webRoot, path.resolve(webRoot, '..')],
    },
    proxy: {
      '/api': 'http://127.0.0.1:8040',
      '/ws': { target: 'ws://127.0.0.1:8040', ws: true },
      '/avatars': 'http://127.0.0.1:8040',
    },
  },
})
