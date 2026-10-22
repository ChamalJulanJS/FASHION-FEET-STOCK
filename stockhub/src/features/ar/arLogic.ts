import type { Variant } from '../../lib/types';
import { fmtMoney } from '../../lib/app.svelte';

export type SizingGender = 'men' | 'women' | 'kids';
export type SizingFit = 'tight' | 'regular' | 'wide';

export interface SizingResult {
  rawLengthCm: number;
  rawLengthInches: number;
  effectiveLengthCm: number;
  gender: SizingGender;
  fit: SizingFit;
  ukSize: number | string;
  euSize: number;
  usSize: number | string;
  fitNotice: string;
  fitNoticeSi: string;
}

export function calculateShoeSize(
  lengthCm: number,
  gender: SizingGender = 'men',
  fit: SizingFit = 'regular',
): SizingResult {
  const allowanceCm = fit === 'tight' ? 0.3 : fit === 'wide' ? 1.0 : 0.6;
  const effectiveCm = Math.max(10, Math.min(36, lengthCm + allowanceCm));
  const rawInches = lengthCm / 2.54;

  let ukSize: number | string = 7;
  let euSize = 41;
  let usSize: number | string = 8;
  let fitNotice = 'Regular Comfort Fit';
  let fitNoticeSi = 'සුවපහසු සාමාන්‍ය පය සඳහා';

  if (fit === 'tight') {
    fitNotice = 'Snug / Slim Fit (Tight fitting)';
    fitNoticeSi = 'හිරට / ස්ලිම් එකට පළඳින්නන්ට';
  } else if (fit === 'wide') {
    fitNotice = 'Wide Fit / Thick Socks (+1/2 size room)';
    fitNoticeSi = 'පළල් පතුල් ඇති අයට හෝ මේස් දමා පළඳින්නන්ට';
  }

  if (gender === 'men') {
    if (effectiveCm < 24.0) { ukSize = 5; euSize = 38; usSize = 6; }
    else if (effectiveCm < 24.5) { ukSize = 5.5; euSize = 39; usSize = 6.5; }
    else if (effectiveCm < 25.0) { ukSize = 6; euSize = 40; usSize = 7; }
    else if (effectiveCm < 25.5) { ukSize = 6.5; euSize = 40.5; usSize = 7.5; }
    else if (effectiveCm < 26.0) { ukSize = 7; euSize = 41; usSize = 8; }
    else if (effectiveCm < 26.5) { ukSize = 7.5; euSize = 41.5; usSize = 8.5; }
    else if (effectiveCm < 27.0) { ukSize = 8; euSize = 42; usSize = 9; }
    else if (effectiveCm < 27.5) { ukSize = 8.5; euSize = 42.5; usSize = 9.5; }
    else if (effectiveCm < 28.0) { ukSize = 9; euSize = 43; usSize = 10; }
    else if (effectiveCm < 28.5) { ukSize = 9.5; euSize = 43.5; usSize = 10.5; }
    else if (effectiveCm < 29.0) { ukSize = 10; euSize = 44; usSize = 11; }
    else if (effectiveCm < 29.5) { ukSize = 10.5; euSize = 44.5; usSize = 11.5; }
    else if (effectiveCm < 30.0) { ukSize = 11; euSize = 45; usSize = 12; }
    else if (effectiveCm < 30.5) { ukSize = 11.5; euSize = 45.5; usSize = 12.5; }
    else { ukSize = 12; euSize = 46; usSize = 13; }
  } else if (gender === 'women') {
    if (effectiveCm < 22.0) { ukSize = 2.5; euSize = 35; usSize = 4.5; }
    else if (effectiveCm < 22.5) { ukSize = 3; euSize = 35.5; usSize = 5; }
    else if (effectiveCm < 23.0) { ukSize = 3.5; euSize = 36; usSize = 5.5; }
    else if (effectiveCm < 23.5) { ukSize = 4; euSize = 37; usSize = 6; }
    else if (effectiveCm < 24.0) { ukSize = 4.5; euSize = 37.5; usSize = 6.5; }
    else if (effectiveCm < 24.5) { ukSize = 5; euSize = 38; usSize = 7; }
    else if (effectiveCm < 25.0) { ukSize = 5.5; euSize = 38.5; usSize = 7.5; }
    else if (effectiveCm < 25.5) { ukSize = 6; euSize = 39; usSize = 8; }
    else if (effectiveCm < 26.0) { ukSize = 6.5; euSize = 40; usSize = 8.5; }
    else if (effectiveCm < 26.5) { ukSize = 7; euSize = 41; usSize = 9; }
    else if (effectiveCm < 27.0) { ukSize = 7.5; euSize = 41.5; usSize = 9.5; }
    else { ukSize = 8; euSize = 42; usSize = 10; }
  } else {
    // Kids
    if (effectiveCm < 12.0) { ukSize = '3C'; euSize = 19; usSize = '4C'; }
    else if (effectiveCm < 13.0) { ukSize = '4C'; euSize = 20; usSize = '5C'; }
    else if (effectiveCm < 14.0) { ukSize = '5.5C'; euSize = 22; usSize = '6.5C'; }
    else if (effectiveCm < 15.0) { ukSize = '7C'; euSize = 24; usSize = '8C'; }
    else if (effectiveCm < 16.0) { ukSize = '8.5C'; euSize = 26; usSize = '9.5C'; }
    else if (effectiveCm < 17.0) { ukSize = '9.5C'; euSize = 27.5; usSize = '10.5C'; }
    else if (effectiveCm < 18.0) { ukSize = '11C'; euSize = 29; usSize = '12C'; }
    else if (effectiveCm < 19.0) { ukSize = '12C'; euSize = 30.5; usSize = '13C'; }
    else if (effectiveCm < 20.0) { ukSize = '13C'; euSize = 32; usSize = '1Y'; }
    else if (effectiveCm < 21.0) { ukSize = '1Y'; euSize = 33.5; usSize = '2Y'; }
    else if (effectiveCm < 22.0) { ukSize = '2Y'; euSize = 34.5; usSize = '3Y'; }
    else { ukSize = '3Y'; euSize = 35.5; usSize = '4Y'; }
  }

  return {
    rawLengthCm: Number(lengthCm.toFixed(1)),
    rawLengthInches: Number(rawInches.toFixed(2)),
    effectiveLengthCm: Number(effectiveCm.toFixed(1)),
    gender,
    fit,
    ukSize,
    euSize,
    usSize,
    fitNotice,
    fitNoticeSi,
  };
}

export function isVariantSizeMatch(
  variantSize: string | null | undefined,
  targetUk: number | string,
  targetEu: number,
): boolean {
  if (!variantSize) return false;
  const s = variantSize.trim().toLowerCase();
  const targetUkStr = String(targetUk).toLowerCase();
  const targetEuStr = String(targetEu);

  if (s === targetUkStr || s === targetEuStr) return true;
  if (s.includes(targetEuStr) || s.includes(targetUkStr)) return true;

  const num = parseFloat(s);
  if (!isNaN(num) && num >= 35 && num <= 48) {
    const derivedUk = num - 34;
    if (String(derivedUk) === targetUkStr || derivedUk === Number(targetUk)) return true;
  }
  return false;
}

export function findInStockShoesForSize(
  catalog: Variant[],
  stockMap: Map<string, number>,
  locationId: string,
  targetUk: number | string,
  targetEu: number,
  gender?: SizingGender,
): { variant: Variant; stock: number }[] {
  if (!locationId || !catalog) return [];
  const results: { variant: Variant; stock: number }[] = [];

  for (const v of catalog) {
    if (!v.size) continue;
    const stock = stockMap.get(`${v.id}_${locationId}`) || 0;
    if (stock <= 0) continue;

    if (gender && v.products?.gender) {
      const g = v.products.gender.toLowerCase();
      if (gender === 'men' && (g.includes('women') || g.includes('lady') || g.includes('girl'))) continue;
      if (gender === 'women' && (g.includes('men') || g.includes('boy')) && !g.includes('women')) continue;
    }

    if (isVariantSizeMatch(v.size, targetUk, targetEu)) {
      results.push({ variant: v, stock });
    }
  }

  results.sort((a, b) => b.stock - a.stock);
  return results.slice(0, 30);
}

export function buildSizingWhatsAppText(
  res: SizingResult,
  branchName = 'Fashion Feet / Shoe Gallery',
  customerName = '',
): string {
  const genderTitle = res.gender === 'men' ? 'Men (පිරිමි)' : res.gender === 'women' ? 'Women (කාන්තා)' : 'Kids (ළමුන්)';
  const custGreeting = customerName ? `Hello ${customerName}!\n` : '';

  return (
    `${custGreeting}👟 *FASHION FEET — 3D AR FOOT SIZING REPORT*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 Category: *${genderTitle}*\n` +
    `📏 Measured Foot Length: *${res.rawLengthCm} cm* (${res.rawLengthInches} inches)\n` +
    `✨ Fit Preference: ${res.fitNotice}\n\n` +
    `🏆 *RECOMMENDED SHOE SIZES:*\n` +
    `• UK / Sri Lanka: *UK ${res.ukSize}*\n` +
    `• EU Size: *EU ${res.euSize}*\n` +
    `• US Size: *US ${res.usSize}*\n\n` +
    `💡 *Fitting Advice:*\n` +
    `_${res.fitNoticeSi}_\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📍 Measured at: *${branchName}*\n` +
    `Thank you for shopping with us!`
  );
}
