/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Design system v2 ──────────────────────────────────────
        // Bound to the CSS custom properties in src/index.css.
        //
        // Namespaced `ct-` on purpose. The legacy ramps below still
        // own the names `teal`, `emerald`, `surface` and `accent`
        // (`teal-500` currently resolves to #06D6A0, NOT --teal), so
        // an un-namespaced key would silently repaint live screens.
        // The prefix also makes migration progress greppable: a
        // class carrying `ct-` is migrated, one without is not.
        // It comes off in a single find/replace once the legacy
        // ramps are deleted.
        //
        // Semantic rule — enforced, not advisory:
        //   teal  = money moving as agreed, or the action to take
        //   amber = blocked on a person
        //   rose  = failed or declined
        // A component must not use a colour outside its meaning.
        ct: {
          ink: 'rgb(var(--ink-c) / <alpha-value>)',
          'ink-2': 'rgb(var(--ink-2-c) / <alpha-value>)',
          surface: 'rgb(var(--surface-c) / <alpha-value>)',
          'surface-2': 'rgb(var(--surface-2-c) / <alpha-value>)',
          line: 'rgb(var(--line-c) / <alpha-value>)',
          teal: 'rgb(var(--teal-c) / <alpha-value>)',
          'teal-deep': 'rgb(var(--teal-deep-c) / <alpha-value>)',
          amber: 'rgb(var(--amber-c) / <alpha-value>)',
          rose: 'rgb(var(--rose-c) / <alpha-value>)',
          paper: 'rgb(var(--paper-c) / <alpha-value>)',
          mute: 'rgb(var(--mute-c) / <alpha-value>)',
          'mute-2': 'rgb(var(--mute-2-c) / <alpha-value>)',
          placeholder: 'var(--placeholder)',
        },

        // ── Legacy (v1) — being migrated, do not use for new work ──
        // #06D6A0 — emerald, primary actions (unified with warm/brand)
        primary: {
          50:  '#ECFDF6',
          100: '#D1FAE9',
          200: '#A7F3D5',
          300: '#6EE7BC',
          400: '#34D89F',
          500: '#06D6A0',
          600: '#05AB80',
          700: '#048163',
          800: '#035A46',
          900: '#02362A',
        },
        // #263238 — charcoal / gunmetal, nav & dark surfaces
        navy: {
          50:  '#ECEFF1',
          100: '#CFD8DC',
          200: '#B0BEC5',
          300: '#90A4AE',
          400: '#78909C',
          500: '#607D8B',
          600: '#546E7A',
          700: '#455A64',
          800: '#37474F',
          900: '#263238',
        },
        // #06D6A0 — emerald, brand CTAs & accents
        warm: {
          50:  '#ECFDF6',
          100: '#D1FAE9',
          200: '#A7F3D5',
          300: '#6EE7BC',
          400: '#34D89F',
          500: '#06D6A0',
          600: '#05AB80',
          700: '#048163',
          800: '#035A46',
          900: '#02362A',
        },
        // #F5F7F8 — off-white / light grey, card surfaces
        surface: {
          50:  '#FAFBFC',
          100: '#F5F7F8',
          200: '#ECEFF1',
          300: '#E0E0E0',
          400: '#BDBDBD',
        },
        // #2E86DE — ocean blue, secondary accents (info, interactive, pending states)
        secondary: {
          50:  '#F0F7FF',
          100: '#D6EAFF',
          200: '#ADD4FF',
          300: '#7AB8F5',
          400: '#4E9DEE',
          500: '#2E86DE',
          600: '#1E6DC0',
          700: '#165299',
          800: '#103C73',
          900: '#0A264D',
        },
        accent: {
          50:  '#FEFEF5',
          100: '#FDF5BF',
          200: '#F9E87A',
          300: '#F4D63A',
          400: '#EBC20D',
          500: '#D4AC08',
          600: '#AB8A06',
          700: '#826904',
          800: '#5E4B02',
          900: '#3A2F01',
        },
        // Override default green/emerald/teal to match brand warm palette (#06D6A0)
        green: {
          50:  '#ECFDF6',
          100: '#D1FAE9',
          200: '#A7F3D5',
          300: '#6EE7BC',
          400: '#34D89F',
          500: '#06D6A0',
          600: '#05AB80',
          700: '#048163',
          800: '#035A46',
          900: '#02362A',
        },
        emerald: {
          50:  '#ECFDF6',
          100: '#D1FAE9',
          200: '#A7F3D5',
          300: '#6EE7BC',
          400: '#34D89F',
          500: '#06D6A0',
          600: '#05AB80',
          700: '#048163',
          800: '#035A46',
          900: '#02362A',
        },
        teal: {
          50:  '#ECFDF6',
          100: '#D1FAE9',
          200: '#A7F3D5',
          300: '#6EE7BC',
          400: '#34D89F',
          500: '#06D6A0',
          600: '#05AB80',
          700: '#048163',
          800: '#035A46',
          900: '#02362A',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        // Design system v2. Namespaced so the 6 existing `font-mono`
        // call sites keep the system mono until they migrate.
        //   ct-display — headings, card titles, button labels
        //   ct-mono    — every dollar figure, job reference, date,
        //                and uppercase meta label
        'ct-display': ['Space Grotesk', 'system-ui', 'sans-serif'],
        'ct-mono': ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        // Legacy (v1) — being migrated. Note lg and xl are both 8px,
        // so today's markup carries no signal for which should become
        // 9px vs 12px. Every call site needs a per-component decision.
        'sm': '4px',
        'DEFAULT': '6px',
        'md': '6px',
        'lg': '8px',
        'xl': '8px',
        '2xl': '10px',
        // Design system v2 — nested elements step down one level.
        'ct-xs': 'var(--r-xs)',
        'ct-sm': 'var(--r-sm)',
        'ct-md': 'var(--r-md)',
        'ct-lg': 'var(--r-lg)',
        'ct-xl': 'var(--r-xl)',
      },
      animation: {
        'float-slow': 'float-slow 6s ease-in-out infinite',
      },
      keyframes: {
        'float-slow': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
      },
    },
  },
  plugins: [],
};
