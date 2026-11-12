import { createContext } from 'react';

/** userId → photo (data URL). Filled once in Layout so every Avatar can show a person's picture. */
export const PhotoContext = createContext(new Map());

const SIZE = 256; // px, square

/**
 * Turns a picked image into a small square JPEG data URL (about 15–40 KB),
 * small enough to keep on the user's Firestore document. No Firebase Storage needed.
 */
export function imageToAvatar(file) {
  return new Promise((resolve, reject) => {
    if (!file?.type?.startsWith('image/')) return reject(new Error('Please choose an image file.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, SIZE, SIZE);
      // Centre-crop to a square, then scale down.
      ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, SIZE, SIZE);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That image couldn't be read. Try a JPG or PNG.")); };
    img.src = url;
  });
}
