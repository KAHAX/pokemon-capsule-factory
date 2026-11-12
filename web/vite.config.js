import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Compatibility for older mobile/embedded browsers; visual settings unchanged.
export default defineConfig({ build: { target: ['chrome80', 'safari14', 'firefox78'], rollupOptions: { input: { main: fileURLToPath(new URL('./index.html', import.meta.url)), mobile: fileURLToPath(new URL('./mobile/index.html', import.meta.url)) } } } });
