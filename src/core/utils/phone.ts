/**
 * Convert a phone number into E.164 format, assuming +1 when ten digits are provided.
 *
 * @param p Raw phone number string.
 * @returns Normalized E.164 phone number.
 */
export function toE164(p: string): string {
  if (!p) return "";
  if (p.startsWith("+")) return p;
  const digits = p.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}