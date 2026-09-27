/**
 * Utility to reliably format and resolve image URLs for attendance and work orders.
 * Prevents Mixed Content browser blocks by proxying legacy HTTP URLs through the secure /api/media/view endpoint.
 */
export function formatPhotoUrl(rawUrl: any): string {
  if (!rawUrl) return '';

  let str = '';
  if (typeof rawUrl === 'string') {
    str = rawUrl.trim();
  } else if (typeof rawUrl === 'object' && rawUrl.type === 'Buffer' && Array.isArray(rawUrl.data)) {
    try {
      str = new TextDecoder().decode(new Uint8Array(rawUrl.data)).trim();
    } catch {
      return '';
    }
  } else {
    return '';
  }

  if (!str) return '';

  // Return data URLs directly
  if (str.startsWith('data:image/')) {
    return str;
  }

  // Already our relative secure proxy endpoint
  if (str.startsWith('/api/media/view')) {
    return str;
  }

  // If full URL (e.g. http://72.60.202.149/premji/jobcard_photo/xyz.jpg)
  let cleanPath = str;
  if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
    try {
      const u = new URL(cleanPath);
      cleanPath = u.pathname;
    } catch {
      cleanPath = cleanPath.replace(/^https?:\/\/[^\/]+/, '');
    }
  }

  // Remove leading /premji/ or /
  cleanPath = cleanPath.replace(/^\/?(premji\/)?/, '');

  return `/api/media/view?path=${encodeURIComponent(cleanPath)}`;
}

export const FALLBACK_IMAGE_SVG =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
