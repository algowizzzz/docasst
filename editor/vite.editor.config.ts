/**
 * Vite configuration for building standalone editor bundle
 * 
 * This builds only the editor component as a self-contained bundle
 * that can be mounted in Flask templates.
 * 
 * Build output: web/static/js/editor.js
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    // Define Node.js globals for browser compatibility
    'process.env': '{}',
    'process': JSON.stringify({
      env: {},
      version: '',
    }),
  },
    build: {
    // Build as a library that can be loaded in browser
    lib: {
      entry: path.resolve(__dirname, 'src/editor-standalone.tsx'),
      name: 'DocEditor',
      fileName: (format) => `editor.${format}.js`, // Will produce editor.iife.js
      formats: ['iife'], // Immediately Invoked Function Expression - self-contained
    },
    // Output to Flask static directory
    outDir: '../web/static/js',
    emptyOutDir: false, // Don't delete other files in static/js
    rollupOptions: {
      // Bundle all dependencies (no external deps)
      external: [],
      output: {
        // Self-contained bundle
        format: 'iife',
        name: 'DocEditor',
        inlineDynamicImports: true,
      },
    },
    // Optimize for production (use esbuild, terser requires separate install)
    minify: 'esbuild',
    // Source maps
    sourcemap: true,
    // Chunk size warning limit (editor bundle might be large)
    chunkSizeWarningLimit: 1000,
  },
  // CSS handling
  css: {
    // Extract CSS to separate file
    extract: {
      filename: 'editor.css',
    },
  },
});

