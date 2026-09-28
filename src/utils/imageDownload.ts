/**
 * Image Download Helper
 * Downloads any image (data URL, proxy URL, or blob) in strictly JPEG or PNG format.
 */
export async function downloadImageAsFormat(
  imageUrl: string,
  title: string,
  format: 'jpeg' | 'png',
  rotationDegrees: number = 0
): Promise<boolean> {
  if (!imageUrl) return false;

  const extension = format === 'jpeg' ? 'jpg' : 'png';
  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const cleanTitle = (title || 'attendance_photo')
    .replace(/[^a-zA-Z0-9_\-\.]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 60);
  const downloadFileName = cleanTitle.toLowerCase().endsWith(`.${extension}`)
    ? cleanTitle
    : `${cleanTitle}.${extension}`;

  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image for download'));
      img.src = imageUrl;
    });

    const canvas = document.createElement('canvas');
    const rad = (rotationDegrees * Math.PI) / 180;
    const isSideways = (rotationDegrees / 90) % 2 !== 0;

    canvas.width = isSideways ? img.naturalHeight : img.naturalWidth;
    canvas.height = isSideways ? img.naturalWidth : img.naturalHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');

    // Fill white background for JPEG to prevent black transparent areas
    if (format === 'jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rad);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    ctx.restore();

    return await new Promise<boolean>((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(false);
            return;
          }
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = downloadFileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
          resolve(true);
        },
        mimeType,
        format === 'jpeg' ? 0.95 : undefined
      );
    });
  } catch (err) {
    console.warn('Canvas conversion failed, falling back to direct download link:', err);
    try {
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = downloadFileName;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return true;
    } catch {
      return false;
    }
  }
}
