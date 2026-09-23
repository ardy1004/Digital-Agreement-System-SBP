import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
      '/img-proxy': {
        target: 'https://images.salambumi.xyz',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/img-proxy/, '/materai'),
        headers: {
          'Referer': 'https://images.salambumi.xyz',
        },
      },
    },
  },
})
