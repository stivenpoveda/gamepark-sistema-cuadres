'use client';

import { useEffect } from "react";
import { Toaster } from "react-hot-toast";

export default function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const numberInput = target.closest?.('input[type="number"]') as HTMLInputElement | null;
      if (!numberInput) return;

      e.preventDefault();
      const scrollingElement = document.scrollingElement || document.documentElement;
      scrollingElement.scrollBy({ top: e.deltaY, left: e.deltaX });
    };

    document.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      document.removeEventListener('wheel', onWheel);
    };
  }, []);

  return (
    <>
      {children}
      <Toaster position="top-right" />
    </>
  );
}
