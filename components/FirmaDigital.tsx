'use client';

import { useRef, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Eraser, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface FirmaDigitalProps {
  onSign: (url: string) => void;
  onClear?: () => void;
  currentUrl?: string;
  label?: string;
}

export default function FirmaDigital({
  onSign,
  onClear,
  currentUrl,
  label = 'Firma',
}: FirmaDigitalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    let clientX: number, clientY: number;

    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    const coords = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const coords = getCoordinates(e);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = async () => {
    setIsDrawing(false);
    if (hasSignature) {
      await uploadSignature();
    }
  };

  const uploadSignature = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setUploading(true);
    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blobResult) => {
          if (blobResult) {
            resolve(blobResult);
          } else {
            reject(new Error('No se pudo generar la firma'));
          }
        }, 'image/png');
      });

      const fileName = `firma-${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage
        .from('firmas')
        .upload(fileName, blob);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('firmas').getPublicUrl(fileName);
      onSign(data.publicUrl);
      toast.success('Firma guardada correctamente');
    } catch (error: any) {
      toast.error('Error al guardar la firma: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onClear?.();
  };

  if (currentUrl) {
    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        <img src={currentUrl} alt={label} className="w-full h-48 object-contain border rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <div className="border border-gray-300 rounded-lg overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          width={400}
          height={200}
          className="w-full cursor-crosshair"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
      </div>
      {hasSignature && (
        <button
          onClick={clearCanvas}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800"
        >
          <Eraser className="w-4 h-4" />
          Limpiar firma
        </button>
      )}
      {uploading && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="w-4 h-4 animate-spin" />
          Guardando firma...
        </div>
      )}
    </div>
  );
}
