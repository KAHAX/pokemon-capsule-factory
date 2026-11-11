import { defineConfig } from 'vite';

// Compatibility for older mobile/embedded browsers; visual settings unchanged.
export default defineConfig({ build: { target: ['chrome80', 'safari14', 'firefox78'] } });
