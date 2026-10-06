import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// `base: './'` keeps every asset reference relative, so the same `dist/`
// folder works on Vercel, Netlify and GitHub Pages (project sub-paths too).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    // pdfjs-dist v4 relies on Promise.withResolvers (Chrome 119+).
    target: ['chrome120'],
    sourcemap: false,
    rollupOptions: {
      output: {
        // Split the two large, rarely-changing libraries out of the app chunk
        // so browsers can cache them separately from app code changes.
        manualChunks: {
          pdfjs: ['pdfjs-dist'],
          pdflib: ['pdf-lib'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});