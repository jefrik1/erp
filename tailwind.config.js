// Design tokens hasil sinkronisasi dengan Stitch project 14736409701922377967
// ("UI Redesign and Polish"): M3-style palette, Inter body + Plus Jakarta Sans display.
const c = (v) => `rgb(var(--${v}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg: c('bg'),
        surface: { DEFAULT: c('surface'), 2: c('surface-2'), 3: c('surface-3'), 4: c('surface-4') },
        line: { DEFAULT: c('line'), strong: c('line-strong') },
        ink: { DEFAULT: c('ink'), 2: c('ink-2'), 3: c('ink-3') },
        navy: { DEFAULT: c('navy'), 2: c('navy-2') },
        brand: {
          DEFAULT: c('brand'),
          strong: c('brand-strong'),
          tint: c('brand-tint'),
          soft: c('brand-soft'),
        },
        success: { DEFAULT: c('success'), soft: c('success-soft'), line: c('success-line') },
        warning: { DEFAULT: c('warning'), soft: c('warning-soft'), line: c('warning-line') },
        danger: { DEFAULT: c('danger'), soft: c('danger-soft'), line: c('danger-line') },
        info: { DEFAULT: c('info'), soft: c('info-soft'), line: c('info-line') },

        // Netral & semantik dipetakan ulang agar utility lama (text-slate-500,
        // bg-red-50, dst.) otomatis ikut palet Stitch tanpa menyentuh 44 halaman.
        gray: { 50:'#f8f9ff', 100:'#eff4ff', 200:'#e5eeff', 300:'#d3e4fe', 400:'#c6c6cd', 500:'#76777d', 600:'#5b5d66', 700:'#45464d', 800:'#2b3445', 900:'#0b1c30' },
        slate: { 50:'#f8f9ff', 100:'#eff4ff', 200:'#e5eeff', 300:'#d3e4fe', 400:'#c6c6cd', 500:'#76777d', 600:'#5b5d66', 700:'#45464d', 800:'#2b3445', 900:'#0b1c30' },
        zinc: { 50:'#f8f9ff', 100:'#eff4ff', 200:'#e5eeff', 300:'#d3e4fe', 400:'#c6c6cd', 500:'#76777d', 600:'#5b5d66', 700:'#45464d', 800:'#2b3445', 900:'#0b1c30' },
        blue: { 50:'#eff4ff', 100:'#dbe1ff', 200:'#b4c5ff', 300:'#8aa6ff', 400:'#5b83ff', 500:'#316bf3', 600:'#0051d5', 700:'#003ea8', 800:'#002f80', 900:'#00174b' },
        sky: { 50:'#eff4ff', 100:'#dbe1ff', 200:'#b4c5ff', 300:'#8aa6ff', 400:'#5b83ff', 500:'#316bf3', 600:'#0051d5', 700:'#003ea8', 800:'#002f80', 900:'#00174b' },
        emerald: { 50:'#e8fbf2', 100:'#c9f5df', 200:'#a8ebc4', 300:'#6ffbbe', 400:'#2ee6a0', 500:'#00b87c', 600:'#009668', 700:'#007a55', 800:'#005c41', 900:'#003d2b' },
        teal: { 50:'#e8fbf2', 100:'#c9f5df', 200:'#a8ebc4', 300:'#6ffbbe', 400:'#2ee6a0', 500:'#00b87c', 600:'#009668', 700:'#007a55', 800:'#005c41', 900:'#003d2b' },
        red: { 50:'#ffdad6', 100:'#ffdad6', 200:'#ffb4ab', 300:'#ffb4ab', 400:'#ff897d', 500:'#ff5449', 600:'#ba1a1a', 700:'#93000a', 800:'#690005', 900:'#410002' },
        amber: { 50:'#fff8ec', 100:'#ffedd0', 200:'#ffd8a8', 300:'#f7bd6b', 400:'#e9a23b', 500:'#c9821a', 600:'#a8650c', 700:'#7a4f01', 800:'#5c3b02', 900:'#3d2701' },
        orange: { 50:'#fff8ec', 100:'#ffedd0', 200:'#ffd8a8', 300:'#f7bd6b', 400:'#e9a23b', 500:'#c9821a', 600:'#a8650c', 700:'#7a4f01', 800:'#5c3b02', 900:'#3d2701' },
        cyan: { 50:'#eff4ff', 100:'#dbe1ff', 200:'#b4c5ff', 300:'#8aa6ff', 400:'#5b83ff', 500:'#316bf3', 600:'#0051d5', 700:'#003ea8', 800:'#002f80', 900:'#00174b' },
        purple: { 50:'#f3efff', 100:'#e8ddff', 200:'#d0bdff', 300:'#b49aff', 400:'#9575ff', 500:'#7a5af8', 600:'#5b3fd6', 700:'#4529b0', 800:'#331d8a', 900:'#22115f' },
      },
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Plus Jakarta Sans Variable', 'Plus Jakarta Sans', 'Inter Variable', 'Inter', 'sans-serif'],
        mono: ['ui-monospace', 'JetBrains Mono', 'SF Mono', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        'label-sm': ['11px', { lineHeight: '14px', fontWeight: '600' }],
        'label-md': ['12px', { lineHeight: '16px', fontWeight: '600' }],
        'label-lg': ['14px', { lineHeight: '18px', fontWeight: '600' }],
        'body-sm': ['13px', { lineHeight: '18px' }],
        'body-md': ['14px', { lineHeight: '20px' }],
        'body-lg': ['16px', { lineHeight: '24px' }],
        'headline-sm': ['18px', { lineHeight: '24px', fontWeight: '600' }],
        'headline-lg': ['22px', { lineHeight: '28px', fontWeight: '700' }],
        'headline-xl': ['28px', { lineHeight: '36px', fontWeight: '700' }],
        currency: ['20px', { lineHeight: '26px', fontWeight: '700' }],
      },
      borderRadius: { DEFAULT: '4px', sm: '4px', md: '6px', lg: '8px', xl: '12px', '2xl': '16px' },
      spacing: { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '24px' },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,.04), 0 1px 8px rgba(0,0,0,.04)',
        raised: '0 2px 4px rgba(0,0,0,.05), 0 4px 16px rgba(0,0,0,.06)',
        pop: '0 8px 24px rgba(11,28,48,.12), 0 2px 6px rgba(11,28,48,.06)',
        modal: '0 24px 48px rgba(11,28,48,.18), 0 8px 16px rgba(11,28,48,.08)',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(.2,0,0,1)',
        enter: 'cubic-bezier(.16,1,.3,1)',
      },
      zIndex: { sticky: '10', header: '40', sidebar: '50', dropdown: '45', modal: '70', toast: '80' },
      maxWidth: { workspace: '1600px' },
    },
  },
  plugins: [],
};