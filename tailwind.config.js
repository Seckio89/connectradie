/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Design system v2 — the only palette. Bound to the CSS custom
      // properties in src/index.css; the marketing site consumes the same
      // variables without Tailwind. Colour literals belong ONLY in that token
      // block (print/e-mail generators and the Stripe iframe excepted — see
      // CLAUDE.md).
      //
      // The `ct-` prefix is now historical: the v1 ramps it was namespaced
      // against are gone. It is kept because renaming ~4,000 call sites is
      // churn without benefit; drop it only with a reason.
      //
      // Semantic rule — enforced, not advisory:
      //   teal  = money moving as agreed, or the action to take
      //   amber = blocked on a person
      //   rose  = failed or declined
      colors: {
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
          'line-soft': 'rgb(var(--line-soft-c) / <alpha-value>)',
          // The light band — the landing page's comparison section inverts to
          // --paper. AA-corrected; see src/index.css.
          'paper-2': 'rgb(var(--paper-2-c) / <alpha-value>)',
          'ink-on-paper': 'rgb(var(--ink-on-paper-c) / <alpha-value>)',
          'mute-on-paper': 'rgb(var(--mute-on-paper-c) / <alpha-value>)',
          'teal-ink': 'rgb(var(--teal-ink-c) / <alpha-value>)',
          'amber-ink': 'rgb(var(--amber-ink-c) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        //   ct-display — headings, card titles, button labels
        //   ct-mono    — every dollar figure, job reference, date,
        //                and uppercase meta label
        'ct-display': ['Space Grotesk', 'system-ui', 'sans-serif'],
        'ct-mono': ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // The uppercase mono meta label — status pills, table headers, job
        // references. Tracking is baked in so it can't drift between call
        // sites.
        'ct-meta': ['0.625rem', { lineHeight: '1', letterSpacing: '0.1em' }],
      },
      // The radius scale. A nested element always steps down one level:
      // a 9px button inside a 14px card. Never equal, never larger.
      borderRadius: {
        'ct-xs': 'var(--r-xs)',
        'ct-sm': 'var(--r-sm)',
        'ct-md': 'var(--r-md)',
        'ct-lg': 'var(--r-lg)',
        'ct-xl': 'var(--r-xl)',
      },
      animation: {
        // Always pair with `motion-safe:` at the call site.
        'ct-slide-in': 'ct-slide-in .6s cubic-bezier(.2,.7,.3,1) both',
      },
      keyframes: {
        'ct-slide-in': {
          from: { opacity: '0', transform: 'translateY(9px)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
    },
  },
  plugins: [],
};
