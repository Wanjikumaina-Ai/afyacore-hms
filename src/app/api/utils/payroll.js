/**
 * FILE: src/app/api/utils/payroll.js
 *
 * Kenya 2026 Statutory Payroll Calculations
 * ─────────────────────────────────────────
 * PAYE:          Progressive 10%–35% bands, KES 2,400 personal relief
 * NSSF:          6% employee + 6% employer (Tier I: 6% of first 7,000;
 *                Tier II: 6% of next (grossPay - 7,000) up to 36,000 ceiling)
 * SHIF:          2.75% of gross pay (replaces NHIF as of Oct 2024)
 * Housing Levy:  1.5% employee + 1.5% employer of gross salary
 *
 * All figures in KES (Kenyan Shillings).
 */

// ── PAYE tax bands (2026) ──────────────────────────────────────────────────
const PAYE_BANDS = [
  { upTo: 24_000,   rate: 0.10 },
  { upTo: 32_333,   rate: 0.25 },
  { upTo: 500_000,  rate: 0.30 },
  { upTo: 800_000,  rate: 0.325 },
  { upTo: Infinity, rate: 0.35 },
];

const PERSONAL_RELIEF = 2_400;      // KES per month

// ── NSSF 2024 tiers ───────────────────────────────────────────────────────
// Tier I applies to the lower earnings limit (LEL = KES 7,000)
// Tier II applies to earnings between LEL and upper earnings limit (UEL = KES 36,000)
// Combined employee contribution = 6% of gross, capped at (0.06 * 36,000) = 2,160
const NSSF_TIER_I_LIMIT = 7_000;
const NSSF_TIER_II_LIMIT = 36_000;
const NSSF_RATE = 0.06;
const NSSF_MAX = NSSF_TIER_II_LIMIT * NSSF_RATE; // KES 2,160 max employee contribution

// ── SHIF (Social Health Insurance Fund) ───────────────────────────────────
const SHIF_RATE = 0.0275;  // 2.75% of gross — effective Oct 2024

// ── Housing Levy ──────────────────────────────────────────────────────────
const HOUSING_LEVY_RATE = 0.015;  // 1.5% employee; 1.5% employer

/**
 * Calculate PAYE on taxable income (before personal relief).
 * Returns the gross tax before relief.
 */
function calculatePAYEBeforeRelief(taxableIncome) {
  if (taxableIncome <= 0) return 0;

  let tax = 0;
  let remaining = taxableIncome;
  let prevBandTop = 0;

  for (const band of PAYE_BANDS) {
    const bandWidth = band.upTo === Infinity
      ? remaining
      : Math.min(remaining, band.upTo - prevBandTop);

    if (bandWidth <= 0) break;

    tax += bandWidth * band.rate;
    remaining -= bandWidth;
    prevBandTop = band.upTo;

    if (remaining <= 0) break;
  }

  return Math.round(tax * 100) / 100;
}

/**
 * Calculate NSSF contribution (employee side).
 * Per the NSSF Act 2013 (operative from 2024):
 *   - 6% of earnings up to KES 7,000 (Tier I)
 *   - 6% of earnings between 7,001 and 36,000 (Tier II)
 *   - Capped at KES 2,160 per month for employee
 */
function calculateNSSF(grossPay) {
  const contribution = Math.min(grossPay * NSSF_RATE, NSSF_MAX);
  return Math.round(contribution * 100) / 100;
}

/**
 * Calculate SHIF deduction (replaces NHIF as of Oct 2024).
 * 2.75% of gross pay. Minimum KES 300.
 */
function calculateSHIF(grossPay) {
  const raw = grossPay * SHIF_RATE;
  const result = Math.max(raw, 300);
  return Math.round(result * 100) / 100;
}

/**
 * Master payroll calculation function.
 *
 * @param {Object} params
 * @param {number} params.basicSalary   - Basic / consolidated salary
 * @param {number} params.allowances    - Total allowances (taxable)
 * @param {number} params.otherDeductions - Additional deductions (loans, etc.)
 * @returns {Object} Full payslip breakdown
 */
export function calculatePayroll({ basicSalary = 0, allowances = 0, otherDeductions = 0 }) {
  const gross = basicSalary + allowances;

  // NSSF
  const nssfEmployee = calculateNSSF(gross);
  const nssfEmployer = nssfEmployee; // Employer matches employee contribution

  // SHIF
  const shif = calculateSHIF(gross);

  // Housing Levy
  const housingLevyEmployee = Math.round(gross * HOUSING_LEVY_RATE * 100) / 100;
  const housingLevyEmployer = housingLevyEmployee;

  // Taxable Pay = Gross - NSSF (NSSF is tax-exempt)
  const taxablePay = Math.max(gross - nssfEmployee, 0);

  // PAYE
  const payeBeforeRelief = calculatePAYEBeforeRelief(taxablePay);
  const paye = Math.max(payeBeforeRelief - PERSONAL_RELIEF, 0);
  const paye_rounded = Math.round(paye * 100) / 100;

  // Net Pay
  const totalDeductions = nssfEmployee + shif + housingLevyEmployee + paye_rounded + otherDeductions;
  const netPay = Math.round((gross - totalDeductions) * 100) / 100;

  // Cost to employer
  const employerCost = Math.round((gross + nssfEmployer + housingLevyEmployer) * 100) / 100;

  return {
    basicSalary:       Math.round(basicSalary * 100) / 100,
    allowances:        Math.round(allowances * 100) / 100,
    grossPay:          Math.round(gross * 100) / 100,

    nssfEmployee,
    nssfEmployer,
    shif,
    housingLevyEmployee,
    housingLevyEmployer,

    taxablePay:        Math.round(taxablePay * 100) / 100,
    payeBeforeRelief:  Math.round(payeBeforeRelief * 100) / 100,
    personalRelief:    PERSONAL_RELIEF,
    paye:              paye_rounded,

    otherDeductions:   Math.round(otherDeductions * 100) / 100,
    totalDeductions:   Math.round(totalDeductions * 100) / 100,
    netPay,
    employerCost,

    // For payslip display
    breakdown: {
      paye_band_1: Math.min(taxablePay, 24_000) * 0.10,
      paye_band_2: Math.max(0, Math.min(taxablePay, 32_333) - 24_000) * 0.25,
      paye_band_3: Math.max(0, Math.min(taxablePay, 500_000) - 32_333) * 0.30,
      paye_band_4: Math.max(0, Math.min(taxablePay, 800_000) - 500_000) * 0.325,
      paye_band_5: Math.max(0, taxablePay - 800_000) * 0.35,
    },
  };
}

/**
 * Format KES amount for display.
 */
export function formatKES(amount) {
  return `KES ${Number(amount || 0).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}