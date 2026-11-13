import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { Button, Modal } from './ui';

const VIEW = 260; // px, size of the square preview
const OUT = 256; // px, size of the saved photo
const MAX_ZOOM = 4;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Lets the user zoom and drag a picked image inside a circle, then returns
 * the visible part as a small square JPEG data URL via onSave.
 */
export function PhotoCropper({ file, onCancel, onSave, saving }) {
  const [img, setImg] = useState(null);
  const [src, setSrc] = useState('');
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef(null);

  // Load the picked file.
  useEffect(() => {
    if (!file) return undefined;
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => { setImg(im); setSrc(url); setZoom(1); setPos({ x: 0, y: 0 }); };
    im.src = url;
    return () => { URL.revokeObjectURL(url); setImg(null); setSrc(''); };
  }, [file]);

  // Scale that makes the image just cover the square, times the user's zoom.
  const base = img ? VIEW / Math.min(img.naturalWidth, img.naturalHeight) : 1;
  const scale = base * zoom;
  const w = img ? img.naturalWidth * scale : VIEW;
  const h = img ? img.naturalHeight * scale : VIEW;
  // Keep the image covering the whole square (no empty edges).
  const fit = (p, s = scale) => {
    const maxX = img ? (img.naturalWidth * s - VIEW) / 2 : 0;
    const maxY = img ? (img.naturalHeight * s - VIEW) / 2 : 0;
    return { x: clamp(p.x, -maxX, maxX), y: clamp(p.y, -maxY, maxY) };
  };

  const setZoomKeep = (z) => {
    const nz = clamp(z, 1, MAX_ZOOM);
    setZoom(nz);
    setPos((p) => fit(p, base * nz));
  };

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, start: pos };
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const { sx, sy, start } = drag.current;
    setPos(fit({ x: start.x + e.clientX - sx, y: start.y + e.clientY - sy }));
  };
  const onPointerUp = () => { drag.current = null; };
  const onWheel = (e) => setZoomKeep(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08));

  const save = () => {
    if (!img) return;
    // Top-left of the image inside the preview square.
    const left = VIEW / 2 - w / 2 + pos.x;
    const top = VIEW / 2 - h / 2 + pos.y;
    const canvas = document.createElement('canvas');
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, OUT, OUT);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, -left / scale, -top / scale, VIEW / scale, VIEW / scale, 0, 0, OUT, OUT);
    onSave(canvas.toDataURL('image/jpeg', 0.88));
  };

  return (
    <Modal
      open={Boolean(file)}
      onClose={saving ? () => {} : onCancel}
      title="Adjust your photo"
      subtitle="Drag to move it, use the slider or mouse wheel to zoom."
      footer={(
        <>
          <Button variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={!img}>Save photo</Button>
        </>
      )}
    >
      <div className="flex flex-col items-center gap-5">
        <div
          className="theme-fixed relative cursor-grab touch-none select-none overflow-hidden rounded-lg bg-slate-900 active:cursor-grabbing"
          style={{ width: VIEW, height: VIEW }}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          {src && (
            <img
              src={src} alt="" draggable={false}
              className="pointer-events-none absolute max-w-none"
              style={{ width: w, height: h, left: VIEW / 2 - w / 2 + pos.x, top: VIEW / 2 - h / 2 + pos.y }}
            />
          )}
          {/* Darken everything outside the circle that will be saved. */}
          <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_999px_rgba(15,23,42,0.55)] ring-2 ring-white/80" />
        </div>

        <div className="flex w-full max-w-xs items-center gap-3">
          <button type="button" onClick={() => setZoomKeep(zoom - 0.2)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label="Zoom out"><Minus className="h-4 w-4" /></button>
          <input
            type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom}
            onChange={(e) => setZoomKeep(Number(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer accent-slate-900" aria-label="Zoom"
          />
          <button type="button" onClick={() => setZoomKeep(zoom + 0.2)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label="Zoom in"><Plus className="h-4 w-4" /></button>
          <button type="button" onClick={() => { setZoom(1); setPos({ x: 0, y: 0 }); }} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800" title="Reset" aria-label="Reset"><RotateCcw className="h-4 w-4" /></button>
        </div>
        <p className="font-mono text-[11px] text-slate-400">{Math.round(zoom * 100)}%</p>
      </div>
    </Modal>
  );
}
