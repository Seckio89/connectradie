/**
 * Native mobile autocorrect / spell-check / sentence auto-capitalisation for
 * free-text PROSE inputs. Spread onto a <textarea> or prose <input>:
 *
 *   <textarea {...proseInputProps} ... />
 *
 * These hint the OS keyboard (Gboard on Android, iOS keyboard) to autocorrect
 * typos, underline misspellings, and capitalise the first letter of sentences —
 * the same behaviour users get when texting.
 *
 * DO NOT spread this onto email / phone / ABN / licence / password / code /
 * URL fields — autocorrect and auto-capitalisation corrupt those. Use the right
 * input type there instead (type="email", type="tel", inputMode="numeric", …),
 * which disables autocorrect automatically.
 */
export const proseInputProps = {
  spellCheck: true,
  autoCorrect: 'on',
  autoCapitalize: 'sentences',
} as const;
