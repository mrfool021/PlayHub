import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The client reads VITE_* variables from the single .env in the project root
// (copy .env.example to .env). Only variables starting with VITE_ reach the browser.
export default defineConfig({
  plugins: [react()],
  envDir: '..',
  server: { port: 5173 },
});
