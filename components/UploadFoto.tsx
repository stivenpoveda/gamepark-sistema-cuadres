'use client';

import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Upload, X, Loader2, Camera } from 'lucide-react';
import toast from 'react-hot-toast';

interface UploadFotoProps {
  bucket?: string;
  onUpload: (url: string) => void;
  onRemove?: () => void;
  currentUrl?: string;
  accept?: string;
}

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
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
      onUpload(data.publicUrl);
      toast.success('Foto subida correctamente');
    } catch (error: any) {
      toast.error('Error al subir la foto: ' + error.message);
    } finally {
      setUploading(false);
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