// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// Canonical host is provisional until the GitHub Pages API confirms it.
export default defineConfig({
  site: 'https://therealmarcuschiu.github.io',
  base: '/mesh-radio-academy',
  trailingSlash: 'always',
  output: 'static',
  integrations: [
    starlight({
      title: 'Mesh Radio Academy',
      description:
        'An independent, hardware-optional course on Meshtastic and MeshCore, from first message to field-tested network.',
      favicon: '/favicon.svg',
      customCss: ['./src/styles/theme.css'],
      social: [
        { icon: 'github', label: 'Source on GitHub', href: 'https://github.com/TheRealMarcusChiu/mesh-radio-academy' },
      ],
      sidebar: [
        { label: 'Home', link: '/' },
        'start-here',
        'curriculum',
        'about',
      ],
      pagination: false,
    }),
  ],
});
