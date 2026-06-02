'use client';

import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Loader2, Camera } from 'lucide-react';
import toast from 'react-hot-toast';

interface UploadFotoProps {
  bucket?: string;
  onUpload: (url: string) => void;
  onRemove?: () => void;
  currentUrl?: string;
  accept?: string;
}

const decodeImage = async (blob: Blob) => {
  if (typeof window !== 'undefined' && 'createImageBitmap' in window) {
    try {
      return await (window as any).createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch {}
    try {
      return await (window as any).createImageBitmap(blob);
    } catch {}
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = objectUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('No se pudo leer la imagen'));
    });
    return img;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const canvasToBlob = (canvas: HTMLCanvasElement, mimeType: string, quality: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) reject(new Error('No se pudo procesar la imagen'));
        else resolve(b);
      },
      mimeType,
      quality
    );
  });

const compressImageIfNeeded = async (file: File) => {
  if (!file.type.startsWith('image/')) return file;

  const targetMaxBytes = 350 * 1024;
  const hardMaxBytes = 900 * 1024;

  const source = await decodeImage(file);
  const srcW = (source as any).width as number;
  const srcH = (source as any).height as number;

  const tryEncode = async (maxDim: number) => {
    const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
    const outW = Math.max(1, Math.round(srcW * scale));
    const outH = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo preparar el canvas');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(source as any, 0, 0, outW, outH);

    const mimeType = 'image/jpeg';
    const qualities = [0.82, 0.75, 0.68, 0.6, 0.52];
    let best: Blob | null = null;
    for (const q of qualities) {
      const blob = await canvasToBlob(canvas, mimeType, q);
      best = blob;
      if (blob.size <= targetMaxBytes) break;
      if (blob.size <= hardMaxBytes) break;
    }
    return best!;
  };

  if (file.size <= targetMaxBytes) return file;

  let blob = await tryEncode(2000);
  if (blob.size > hardMaxBytes) blob = await tryEncode(1600);
  if (blob.size > hardMaxBytes) blob = await tryEncode(1280);

  const compressed = new File([blob], `${Date.now()}.jpg`, { type: 'image/jpeg' });
  return compressed;
};

export default function UploadFoto({
  bucket = 'soportes',
  onUpload,
  onRemove,
  currentUrl,
  accept = 'image/*',
}: UploadFotoProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileToUpload = await compressImageIfNeeded(file);
      if (fileToUpload.size > 5 * 1024 * 1024) {
        throw new Error('La foto es demasiado pesada. Intenta con una foto más liviana.');
      }

      const fileExt = fileToUpload.name.split('.').pop() || 'jpg';
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, fileToUpload, { contentType: fileToUpload.type });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
      onUpload(data.publicUrl);
      toast.success('Foto subida correctamente');
    } catch (error: any) {
      toast.error('Error al subir la foto: ' + error.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="w-full">
      {currentUrl ? (
        <div className="relative">
          <img
            src={currentUrl}
            alt="Preview"
            className="w-full h-64 object-cover rounded-lg"
          />
          <button
            onClick={() => onRemove?.()}
            className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors duration-200"
        >
          {uploading ? (
            <Loader2 className="w-12 h-12 animate-spin mx-auto text-gray-400" />
          ) : (
            <>
              <Camera className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600">
                Haz clic para tomar o subir una foto
              </p>
              <p className="text-sm text-gray-400 mt-2">
                PNG, JPG (máx. 5MB)
              </p>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      )}
    </div>
  );
}
