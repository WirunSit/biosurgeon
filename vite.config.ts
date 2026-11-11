import { defineConfig } from 'vite';

// base: './' ให้ build แล้วเปิดจากโฟลเดอร์ย่อยได้ (GitHub Pages / Netlify / เครื่องในห้องคอม)
export default defineConfig({
  base: './',
  // PORT จากตัวเปิดเซิร์ฟเวอร์ (ถ้ามี) ไม่งั้นใช้ 5173
  server: { host: true, port: Number(process.env.PORT) || 5173 },
  build: { target: 'es2020', chunkSizeWarningLimit: 1000 },
});
