import { describe, it, expect } from 'vitest';
import {
  redactContactInfo,
  redactSensitiveInfo,
  shouldAllowContactSharing,
} from '../redaction';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('redaction', () => {
  // -----------------------------------------------------------------------
  // redactContactInfo
  // -----------------------------------------------------------------------
  describe('redactContactInfo', () => {
    // --- Australian mobile numbers ---

    it('redacts mobile number with spaces (0412 345 678)', () => {
      expect(redactContactInfo('Call me on 0412 345 678 thanks')).toBe(
        'Call me on [phone number hidden] thanks'
      );
    });

    it('redacts mobile number without spaces (0412345678)', () => {
      expect(redactContactInfo('My number is 0412345678')).toBe(
        'My number is [phone number hidden]'
      );
    });

    it('redacts +61 mobile number with spaces', () => {
      expect(redactContactInfo('Reach me at +61 412 345 678')).toBe(
        'Reach me at [phone number hidden]'
      );
    });

    it('redacts +61 mobile number without spaces', () => {
      expect(redactContactInfo('Text +61412345678 anytime')).toBe(
        'Text [phone number hidden] anytime'
      );
    });

    // --- Australian landline numbers ---

    it('redacts landline with parenthesized area code (02) 1234 5678', () => {
      expect(redactContactInfo('Office: (02) 1234 5678')).toBe(
        'Office: [phone number hidden]'
      );
    });

    it('redacts landline with spaces (02 1234 5678)', () => {
      expect(redactContactInfo('Call 02 1234 5678 for info')).toBe(
        'Call [phone number hidden] for info'
      );
    });

    it('redacts landline without spaces (0212345678)', () => {
      expect(redactContactInfo('Fax 0212345678')).toBe(
        'Fax [phone number hidden]'
      );
    });

    // --- Email addresses ---

    it('redacts a standard email address', () => {
      expect(redactContactInfo('Email me at john@example.com')).toBe(
        'Email me at [email hidden]'
      );
    });

    it('redacts email with dots and hyphens', () => {
      expect(redactContactInfo('Contact john.doe-test@my-company.com.au')).toBe(
        'Contact [email hidden]'
      );
    });

    it('redacts email with spaces around @ and dot', () => {
      expect(redactContactInfo('Try john @ example . com for info')).toBe(
        'Try [email hidden] for info'
      );
    });

    // --- Spelled-out numbers ---

    it('redacts phone numbers written as words (zero four ...)', () => {
      const spelled = 'zero four one two three four five six seven eight';
      expect(redactContactInfo(spelled)).toBe('[phone number hidden]');
    });

    it('redacts phone numbers starting with "oh four"', () => {
      const spelled = 'oh four one two three four five six seven eight';
      expect(redactContactInfo(spelled)).toBe('[phone number hidden]');
    });

    // --- No false positives ---

    it('does not redact regular text without contact info', () => {
      const text = 'I need help fixing a leaky tap in my kitchen';
      expect(redactContactInfo(text)).toBe(text);
    });

    it('does not redact short number sequences that are not phone numbers', () => {
      const text = 'I need 42 nails and 100 screws';
      expect(redactContactInfo(text)).toBe(text);
    });

    // --- Multiple contacts ---

    it('redacts multiple phone numbers and emails in one string', () => {
      const input = 'Call 0412 345 678 or email test@test.com or try 03 9876 5432';
      const result = redactContactInfo(input);
      expect(result).not.toContain('0412');
      expect(result).not.toContain('test@test.com');
      expect(result).not.toContain('9876');
      expect(result).toContain('[phone number hidden]');
      expect(result).toContain('[email hidden]');
    });

    // --- Edge cases ---

    it('handles empty string', () => {
      expect(redactContactInfo('')).toBe('');
    });

    it('handles string with only whitespace', () => {
      expect(redactContactInfo('   ')).toBe('   ');
    });
  });

  // -----------------------------------------------------------------------
  // redactSensitiveInfo
  // -----------------------------------------------------------------------
  describe('redactSensitiveInfo', () => {
    it('returns original text when isUnlocked is true', () => {
      const text = 'Call me at 0412 345 678 or john@example.com';
      expect(redactSensitiveInfo(text, true)).toBe(text);
    });

    it('redacts contact info when isUnlocked is false', () => {
      const text = 'Call me at 0412 345 678 or john@example.com';
      const result = redactSensitiveInfo(text, false);
      expect(result).toContain('[phone number hidden]');
      expect(result).toContain('[email hidden]');
      expect(result).not.toContain('0412');
      expect(result).not.toContain('john@example.com');
    });

    it('returns plain text unchanged when isUnlocked is false and no contact info present', () => {
      const text = 'I need a plumber for a blocked drain';
      expect(redactSensitiveInfo(text, false)).toBe(text);
    });
  });

  // -----------------------------------------------------------------------
  // shouldAllowContactSharing
  // -----------------------------------------------------------------------
  describe('shouldAllowContactSharing', () => {
    const idA = 'user-a';
    const idB = 'user-b';

    it('returns true when both participants have sent messages', () => {
      const messages = [
        { sender_id: idA },
        { sender_id: idB },
      ];
      expect(shouldAllowContactSharing(messages, [idA, idB])).toBe(true);
    });

    it('returns false when only participant A has sent messages', () => {
      const messages = [
        { sender_id: idA },
        { sender_id: idA },
      ];
      expect(shouldAllowContactSharing(messages, [idA, idB])).toBe(false);
    });

    it('returns false when only participant B has sent messages', () => {
      const messages = [
        { sender_id: idB },
      ];
      expect(shouldAllowContactSharing(messages, [idA, idB])).toBe(false);
    });

    it('returns false when messages array is empty', () => {
      expect(shouldAllowContactSharing([], [idA, idB])).toBe(false);
    });

    it('returns false when messages are from a third party only', () => {
      const messages = [
        { sender_id: 'user-c' },
        { sender_id: 'user-d' },
      ];
      expect(shouldAllowContactSharing(messages, [idA, idB])).toBe(false);
    });

    it('returns true with many messages as long as both participants appear', () => {
      const messages = [
        { sender_id: 'user-c' },
        { sender_id: idA },
        { sender_id: 'user-c' },
        { sender_id: idB },
        { sender_id: 'user-c' },
      ];
      expect(shouldAllowContactSharing(messages, [idA, idB])).toBe(true);
    });
  });
});
