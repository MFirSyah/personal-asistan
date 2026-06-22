/**
 * Utility to scrub PII (Personally Identifiable Information) from text messages.
 * This runs at the very beginning of the pipeline before database insertion.
 */
export function scrubPII(text: string): string {
  if (!text) return text;

  let scrubbed = text;

  // 1. Credit Cards (13 to 16 digits, with optional spaces or dashes)
  const ccRegex = /\b(?:\d[ -]*?){13,16}\b/g;
  scrubbed = scrubbed.replace(ccRegex, '[SENSOR_KARTU_KREDIT]');

  // 2. PIN patterns (e.g., "pin: 123456", "pin saya 4321")
  const pinRegex = /\b(pin(?:[ _]saya)?|atm)\s*[:=\-]?\s*\b\d{4,6}\b/gi;
  scrubbed = scrubbed.replace(pinRegex, (match, p1) => `${p1}: [SENSOR_PIN]`);

  // 3. Passwords (e.g., "password: mypassword123", "sandi = admin123")
  const passwordRegex = /\b(password|pass|sandi|kata[ _]sandi)\s*[:=\-]\s*([A-Za-z0-9_@#$%^&*()+\-]{4,30})/gi;
  scrubbed = scrubbed.replace(passwordRegex, (match, p1) => `${p1}: [SENSOR_PASSWORD]`);

  // 4. Emails
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  scrubbed = scrubbed.replace(emailRegex, '[SENSOR_EMAIL]');

  // 5. Phone numbers (Indonesian format e.g., 0812..., +62812...)
  const phoneRegex = /\b(?:\+?62|0)8[1-9][0-9]{7,10}\b/g;
  scrubbed = scrubbed.replace(phoneRegex, '[SENSOR_TELEPON]');

  return scrubbed;
}
