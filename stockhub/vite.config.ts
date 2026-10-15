import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    tailwindcss(),
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'FashionFeet Stock Hub',
        short_name: 'Stock Hub',
        start_url: './',
        display: 'standalone',
        background_color: '#0b0d12',
        theme_color: '#0b0d12',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: { navigateFallback: undefined, globPatterns: ['**/*.{js,css,html,png,svg}'] },
    }),
  ],
})
