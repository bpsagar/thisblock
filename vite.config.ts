import { defineConfig } from 'vite';

// Relative base so the same build works at a domain root (tb.sagar.im)
// and under a sub-path (bpsagar.github.io/thisblock/).
export default defineConfig({ base: './' });
