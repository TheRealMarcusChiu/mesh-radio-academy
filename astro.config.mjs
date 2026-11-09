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
      components: {
        PageTitle: './src/components/PageTitle.astro',
        ThemeProvider: './src/components/ThemeProvider.astro',
        ThemeSelect: './src/components/ThemeSelect.astro',
      },
      social: [
        { icon: 'github', label: 'Source on GitHub', href: 'https://github.com/TheRealMarcusChiu/mesh-radio-academy' },
      ],
      sidebar: [
        { label: 'Home', link: '/' },
        {
          label: 'Lessons',
          items: [
            { slug: 'modules/00-start-here', label: '00 Start here' },
            { slug: 'modules/01-rf-foundations', label: '01 RF and LoRa foundations' },
            { slug: 'modules/02-hardware-first-boot', label: '02 Hardware and first boot' },
            { slug: 'curriculum', label: 'Full course outline' },
          ],
        },
        { label: 'Labs', items: ['labs/rf-sandbox', 'labs/routing-playground', 'labs/field-planner'] },
        {
          label: 'Reference',
          items: ['reference/baselines', 'reference/claims', 'reference/sources', 'reference/corrections'],
        },
        'about',
      ],
      pagination: false,
    }),
  ],
});
