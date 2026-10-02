import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: '../static',
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8040',
      '/ws': { target: 'ws://127.0.0.1:8040', ws: true },
      '/avatars': 'http://127.0.0.1:8040',
    },
  },
})
