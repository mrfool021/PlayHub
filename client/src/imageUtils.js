// Client-side image preparation. The browser shrinks + re-encodes every picture
// to JPEG on a canvas BEFORE upload, so the base64 string inside the JSON body
// stays small (typically 100-400 kB) no matter how large the original photo is.

export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SOURCE_BYTES = 20 * 1024 * 1024; // refuse to even decode absurdly large originals

async function loadImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawToJpeg(img, { width, height, sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight }, quality) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; // JPEG has no transparency
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

// base64 length -> approximate decoded byte size
const decodedBytes = (dataUrl) => Math.floor(((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4);

function checkFile(file) {
  if (!file) throw new Error('No file selected.');
  if (!ACCEPTED_TYPES.includes(file.type)) throw new Error('Please choose a JPG, PNG, WebP or GIF image.');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('That image is too large (max 20 MB).');
}

/**
 * Poll photo: longest side <= maxSide, quality lowered until it fits maxBytes.
 * Returns { dataUrl, bytes, width, height }.
 */
export async function preparePollImage(file, { maxSide = 1280, maxBytes = 1_400_000 } = {}) {
  checkFile(file);
  let img;
  try {
    img = await loadImage(file);
  } catch {
    throw new Error('That file could not be read as an image.');
  }
  let scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    for (const quality of [0.85, 0.72, 0.6]) {
      const dataUrl = drawToJpeg(img, { width, height }, quality);
      if (decodedBytes(dataUrl) <= maxBytes) return { dataUrl, bytes: decodedBytes(dataUrl), width, height };
    }
    scale *= 0.75;
  }
  throw new Error('Could not shrink that image enough. Try a smaller one.');
}

/** Avatar: centre-cropped square, 256x256, JPEG. */
export async function prepareAvatarImage(file, { size = 256, maxBytes = 200_000 } = {}) {
  checkFile(file);
  let img;
  try {
    img = await loadImage(file);
  } catch {
    throw new Error('That file could not be read as an image.');
  }
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const crop = {
    width: size,
    height: size,
    sx: Math.round((img.naturalWidth - side) / 2),
    sy: Math.round((img.naturalHeight - side) / 2),
    sw: side,
    sh: side,
  };
  for (const quality of [0.9, 0.8, 0.7, 0.55]) {
    const dataUrl = drawToJpeg(img, crop, quality);
    if (decodedBytes(dataUrl) <= maxBytes) return { dataUrl, bytes: decodedBytes(dataUrl) };
  }
  throw new Error('Could not shrink that image enough. Try a different one.');
}

export const formatBytes = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);
