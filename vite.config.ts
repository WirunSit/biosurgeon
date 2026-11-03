import { defineConfig } from 'vite';

// base: './' ให้ build แล้วเปิดจากโฟลเดอร์ย่อยได้ (GitHub Pages / Netlify / เครื่องในห้องคอม)
export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
});
