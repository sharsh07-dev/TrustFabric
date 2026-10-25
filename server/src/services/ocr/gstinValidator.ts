/**
 * Indian GSTIN Format and Structural Checksum Validator
 * Format: 2 digits (State Code) + 10 chars (PAN) + 1 char (Entity code) + 'Z' + 1 checksum char
 */

const STATE_CODES: Record<string, string> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
  '99': 'Centre Jurisdiction',
};

const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export interface GstinValidationResult {
  formatValid: boolean;
  stateCode?: string;
  stateName?: string;
  checksumValid: boolean;
  notice: string;
}

export class GstinValidator {
  private static readonly GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

  public static validate(gstin: string): GstinValidationResult {
    const clean = gstin.trim().toUpperCase();

    if (!clean || clean.length !== 15 || !this.GSTIN_REGEX.test(clean)) {
      return {
        formatValid: false,
        checksumValid: false,
        notice: 'GSTIN does not match the 15-character statutory alphanumeric pattern (2 state + 10 PAN + 1 entity + Z + 1 check).',
      };
    }

    const stateCode = clean.substring(0, 2);
    const stateName = STATE_CODES[stateCode];

    if (!stateName) {
      return {
        formatValid: false,
        stateCode,
        checksumValid: false,
        notice: `State code ${stateCode} is not a recognized Indian state or union territory GST code.`,
      };
    }

    // Verify Mod-36 Checksum (Luhn variant for base 36)
    let sum = 0;
    for (let i = 0; i < 14; i++) {
      const c = clean[i];
      let val = CHARS.indexOf(c);
      if (val === -1) return { formatValid: false, checksumValid: false, notice: 'Invalid character in GSTIN.' };

      // Multiplier alternate 1, 2
      const factor = (i % 2 === 0) ? 1 : 2;
      const product = val * factor;
      const quotient = Math.floor(product / 36);
      const remainder = product % 36;
      sum += quotient + remainder;
    }

    const checkCodeVal = (36 - (sum % 36)) % 36;
    const expectedCheckChar = CHARS[checkCodeVal];
    const actualCheckChar = clean[14];
    const checksumValid = actualCheckChar === expectedCheckChar;

    return {
      formatValid: true,
      stateCode,
      stateName,
      checksumValid,
      notice: checksumValid
        ? 'GSTIN format and structural checksum are valid. Structural validation does not confirm legal registration status on the GSTN portal.'
        : `GSTIN format matches standard pattern, but check character ${actualCheckChar} does not match computed checksum ${expectedCheckChar}.`,
    };
  }
}
