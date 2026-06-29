/**
 * Utility to scrub PII (Personally Identifiable Information) from text messages.
 * This runs at the very beginning of the pipeline before database insertion.
 *
 * SECURITY: Enhanced version with better pattern matching
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

  // 4. Emails - Standard format
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  scrubbed = scrubbed.replace(emailRegex, '[SENSOR_EMAIL]');

  // 4b. Emails - Split format (john doe gmail.com, johndoe gmail com)
  const splitEmailRegex = /\b[A-Za-z0-9._%+-]+\s+(?:@|at|didepan|dengan)\s+[A-Za-z0-9.-]+\s+(?:@|dot|titik|\.)\s*[A-Za-z]{2,}\b/gi;
  scrubbed = scrubbed.replace(splitEmailRegex, '[SENSOR_EMAIL]');

  // 5. Phone numbers - Indonesian format (various formats)
  // +62 812-3456-7890, 0812 3456 7890, 6281234567890, etc.
  const phoneRegexes = [
    /\b(?:\+?62)[ .\-\\]*8[1-9][ .\-\\]*[0-9]{3,4}[ .\-\\]*[0-9]{3,4}\b/g,
    /\b08[1-9][ .\-\\]*[0-9]{3,4}[ .\-\\]*[0-9]{3,4}\b/g,
    /\b08[1-9][0-9]{7,10}\b/g,
  ];
  for (const regex of phoneRegexes) {
    scrubbed = scrubbed.replace(regex, '[SENSOR_TELEPON]');
  }

  // 6. Indonesian ID numbers (KTP format: 1234567890123456)
  const ktpRegex = /\b\d{16}\b/g;
  scrubbed = scrubbed.replace(ktpRegex, '[SENSOR_KTP]');

  // 7. Bank account numbers (various Indonesian banks, typically 10-16 digits)
  const bankAccountRegex = /\b(?:rekening|rek|nomor|nomor\.?)\s*[:=\-]?\s*\d{8,16}\b/gi;
  scrubbed = scrubbed.replace(bankAccountRegex, '[SENSOR_REKENING]');

  // 8. GPS coordinates (e.g., -6.2088, 106.8456)
  const gpsRegex = /-?\d{1,3}[.,]\d{1,8}[,\s]+-?\d{1,3}[.,]\d{1,8}/g;
  scrubbed = scrubbed.replace(gpsRegex, '[SENSOR_LOKASI]');

  return scrubbed;
}
