import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  publicDir: 'public',
  server: {
    host: 'localhost',
    hmr: {
      host: 'localhost',
    },
  },
  build: {
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        manualChunks: {
          'stripe': ['@stripe/stripe-js'],
          'supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@stripe/stripe-js',
      '@react-google-maps/api',
      '@supabase/supabase-js',
      'lucide-react',
    ],
  },
});
