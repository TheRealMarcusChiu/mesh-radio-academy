// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// Canonical host is the GitHub Pages custom domain; the course lives under `base`.
export default defineConfig({
  site: 'https://git.marcuschiu.com',
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
            { slug: 'modules/03-first-meshtastic-link', label: '03 Your first Meshtastic link' },
            { slug: 'modules/04-meshtastic-under-the-hood', label: '04 Meshtastic under the hood' },
            { slug: 'modules/05-first-meshcore-link', label: '05 Your first MeshCore link' },
            { slug: 'modules/06-meshcore-under-the-hood', label: '06 MeshCore under the hood' },
            { slug: 'modules/07-reliability-capacity', label: '07 Reliability and capacity' },
            { slug: 'modules/08-privacy-security-rules', label: '08 Privacy, security and rules' },
            { slug: 'modules/09-troubleshooting-field-tests', label: '09 Troubleshooting and field tests' },
            { slug: 'modules/10-neighborhood-mesh', label: '10 Build a neighborhood mesh' },
            { slug: 'modules/11-compare-choose', label: '11 Compare and choose' },
            { slug: 'modules/12-capstone-operator-reference', label: '12 Capstone and operator reference' },
            { slug: 'curriculum', label: 'Full course outline' },
          ],
        },
        {
          label: 'Labs',
          items: [
            { slug: 'labs', label: 'All labs' },
            'labs/rf-sandbox',
            'labs/routing-playground',
            'labs/packet-inspector',
            'labs/field-planner',
          ],
        },
        {
          label: 'Reference',
          items: [
            'glossary',
            'comparison',
            'appendix/operator-tools',
            'appendix/local-mqtt',
            'reference/field-checklist',
            'reference/baselines',
            'reference/claims',
            'reference/sources',
            'reference/corrections',
          ],
        },
        'about',
      ],
      pagination: false,
    }),
  ],
});
