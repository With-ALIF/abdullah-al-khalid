import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` keeps every asset reference relative, so the same `dist/`
// folder works on Vercel, Netlify and GitHub Pages (project sub-paths too).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    // pdfjs-dist v4 relies on Promise.withResolvers (Chrome 119+).
    target: ['chrome120'],
    sourcemap: false,
  },
  server: {
    port: 5173,
  },
});