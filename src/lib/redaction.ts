export function redactContactInfo(text: string): string {
  let redacted = text;

  redacted = redacted.replace(/\b(04\d{2})\s*(\d{3})\s*(\d{3})\b/gi, '[phone number hidden]');
  redacted = redacted.replace(/\b(04\d{8})\b/gi, '[phone number hidden]');
  redacted = redacted.replace(/\+61\s*4\d{2}\s*\d{3}\s*\d{3}\b/gi, '[phone number hidden]');
  redacted = redacted.replace(/\+614\d{8}\b/gi, '[phone number hidden]');
  redacted = redacted.replace(/\(0(\d)\)\s*\d{4}\s*\d{4}\b/gi, '[phone number hidden]');
  redacted = redacted.replace(/\b(0[2-8])\s*\d{4}\s*\d{4}\b/gi, '[phone number hidden]');
  redacted = redacted.replace(/\b(0[2-8]\d{8})\b/gi, '[phone number hidden]');

  redacted = redacted.replace(/\b([\w\.-]+)@([\w\.-]+\.\w{2,})\b/gi, '[email hidden]');
  redacted = redacted.replace(/\b([\w\.-]+)\s*@\s*([\w\.-]+)\s*\.\s*(\w{2,})\b/gi, '[email hidden]');

  redacted = redacted.replace(/\b(zero|oh)\s*(four|for)\s+(\w+\s+){7,}\b/gi, '[phone number hidden]');

  return redacted;
}

export function redactSensitiveInfo(text: string, isUnlocked: boolean): string {
  if (isUnlocked) {
    return text;
  }
  return redactContactInfo(text);
}

export function shouldAllowContactSharing(
  messages: { sender_id: string }[],
  participantIds: [string, string]
): boolean {
  const [idA, idB] = participantIds;
  const aSent = messages.some((m) => m.sender_id === idA);
  const bSent = messages.some((m) => m.sender_id === idB);
  return aSent && bSent;
}
