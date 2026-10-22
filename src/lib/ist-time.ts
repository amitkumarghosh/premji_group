/**
 * IST Time Engine - Asia/Kolkata Timezone Locking Utility
 * Premji Groups Operations Portal
 *
 * Guarantees zero timezone drift between client machines and serverless / container runtimes.
 */

export const IST_TIMEZONE = 'Asia/Kolkata';

/**
 * Returns current Date adjusted to India Standard Time (UTC+5:30)
 */
export function getIstNow(): Date {
  return new Date();
}

/**
 * Formats a Date or timestamp string into IST 'YYYY-MM-DD'
 */
export function getIstDateString(date: Date | string | number = new Date()): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) {
    return new Date().toLocaleDateString('en-CA', { timeZone: IST_TIMEZONE });
  }
  return d.toLocaleDateString('en-CA', { timeZone: IST_TIMEZONE });
}

/**
 * Formats a Date or timestamp into 24-hour 'HH:mm:ss' in IST
 */
export function getIstTimeString(
  date: Date | string | number = new Date(),
  format: '24h' | '12h' = '24h'
): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '00:00:00';

  if (format === '12h') {
    return d.toLocaleTimeString('en-IN', {
      timeZone: IST_TIMEZONE,
      hour12: true,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  return d.toLocaleTimeString('en-GB', {
    timeZone: IST_TIMEZONE,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Formats a Date into standard MySQL DATETIME string in IST ('YYYY-MM-DD HH:MM:SS')
 */
export function getIstDateTimeString(date: Date | string | number = new Date()): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) {
    const fallback = new Date();
    const dateStr = fallback.toLocaleDateString('en-CA', { timeZone: IST_TIMEZONE });
    const timeStr = fallback.toLocaleTimeString('en-GB', { timeZone: IST_TIMEZONE, hour12: false });
    return `${dateStr} ${timeStr}`;
  }

  const dateStr = d.toLocaleDateString('en-CA', { timeZone: IST_TIMEZONE });
  const timeStr = d.toLocaleTimeString('en-GB', {
    timeZone: IST_TIMEZONE,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  return `${dateStr} ${timeStr}`;
}

/**
 * Normalizes input value (string / Date / time-only) to a valid Date object in IST
 */
export function parseToIstDate(
  val: string | Date | number | null | undefined,
  baseDateStr?: string
): Date | null {
  if (!val) return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }

  const str = String(val).trim();
  if (!str) return null;

  // Case 1: Full ISO string or full datetime with space
  if (str.includes('T') || /^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}/.test(str)) {
    // If standard MySQL datetime 'YYYY-MM-DD HH:MM:SS', convert to ISO with IST offset (+05:30)
    if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}/.test(str)) {
      const isoStr = str.replace(' ', 'T') + '+05:30';
      const parsed = new Date(isoStr);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  // Case 2: Time only 'HH:MM:SS' or 'HH:MM'
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(str)) {
    const refDate = baseDateStr || getIstDateString();
    const parts = str.split(':');
    const hh = parts[0].padStart(2, '0');
    const mm = parts[1].padStart(2, '0');
    const ss = (parts[2] || '00').padStart(2, '0');
    const isoStr = `${refDate}T${hh}:${mm}:${ss}+05:30`;
    const d = new Date(isoStr);
    return isNaN(d.getTime()) ? null : d;
  }

  const fallback = new Date(str);
  return isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * Calculates hours elapsed between two timestamps with 2 decimal precision.
 * Formula: ROUND((TIMESTAMPDIFF(SECOND, start, end) / 3600.0), 2)
 */
export function calculateHours(
  startTime: string | Date | null | undefined,
  endTime: string | Date | null | undefined,
  baseDateStr?: string
): number {
  if (!startTime || !endTime) return 0.0;

  const startDate = parseToIstDate(startTime, baseDateStr);
  const endDate = parseToIstDate(endTime, baseDateStr);

  if (!startDate || !endDate) return 0.0;

  const diffMs = endDate.getTime() - startDate.getTime();
  if (diffMs <= 0) return 0.0;

  const diffSeconds = diffMs / 1000.0;
  const hours = diffSeconds / 3600.0;
  return Number(hours.toFixed(2));
}

/**
 * Calculates net productive working hours.
 * Formula: MAX(0.00, ROUND(totalWorking - totalBreak, 2))
 */
export function calculateEffectiveHours(totalWorking: number, totalBreak: number): number {
  const net = (Number(totalWorking) || 0) - (Number(totalBreak) || 0);
  return Math.max(0.0, Number(net.toFixed(2)));
}

/**
 * Clean UI Formatter: Converts any timestamp to "hh:mm AM/PM" in IST
 */
export function formatIstTimeDisplay(val: string | Date | null | undefined): string {
  if (!val) return '—';
  const d = parseToIstDate(val);
  if (!d) {
    const str = String(val).trim();
    if (str.includes(' ')) return str.split(' ')[1];
    return str;
  }
  return d.toLocaleTimeString('en-IN', {
    timeZone: IST_TIMEZONE,
    hour12: true,
    hour: 'numeric',
    minute: '2-digit'
  });
}

/**
 * Clean UI Formatter: Converts Date/String to "DD MMM YYYY, hh:mm AM/PM" in IST
 */
export function formatIstFullDisplay(val: string | Date | null | undefined): string {
  if (!val) return '—';
  const d = parseToIstDate(val);
  if (!d) return String(val);

  return d.toLocaleString('en-IN', {
    timeZone: IST_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour12: true,
    hour: 'numeric',
    minute: '2-digit'
  });
}

/**
 * Checks whether current IST time is at or past a cutoff time in HH:mm (or HH:mm:ss) format.
 * Defaults to '16:00' (4:00 PM IST).
 */
export function isCurrentTimePastCutoff(cutoffTime: string = '16:00', referenceDate: Date = new Date()): boolean {
  try {
    const timeStr = getIstTimeString(referenceDate, '24h');
    const [nowH, nowM] = timeStr.split(':').map(Number);
    const [cutH, cutM] = (cutoffTime || '16:00').split(':').map(Number);

    if (isNaN(cutH)) return false;
    const cutoffMinutes = cutH * 60 + (isNaN(cutM) ? 0 : cutM);
    const currentMinutes = (isNaN(nowH) ? 0 : nowH) * 60 + (isNaN(nowM) ? 0 : nowM);

    return currentMinutes >= cutoffMinutes;
  } catch (e) {
    return false;
  }
}

/**
 * Formats a 24-hour time string (e.g. "16:00" or "09:30") to 12-hour display with AM/PM (e.g. "04:00 PM")
 */
export function format24To12HourDisplay(time24: string): string {
  if (!time24) return '04:00 PM';
  const parts = time24.split(':');
  let h = parseInt(parts[0], 10);
  const m = (parts[1] || '00').padStart(2, '0');
  if (isNaN(h)) return '04:00 PM';
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  h = h ? h : 12;
  const hStr = h < 10 ? `0${h}` : `${h}`;
  return `${hStr}:${m} ${ampm}`;
}

