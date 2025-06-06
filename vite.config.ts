import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
  ],
  build: {
    target: 'esnext', // or 'es2022'
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2022',
    },
  },
});
