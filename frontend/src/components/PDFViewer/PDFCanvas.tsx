import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { useInspectionStore } from '../../store/useInspectionStore';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface PDFCanvasProps {
  pdfUrl: string;
  containerWidth?: number;
  containerHeight?: number;
  onPageRendered?: (dimensions: { width: number; height: number; totalPages: number }) => void;
}

export const PDFCanvas: React.FC<PDFCanvasProps> = ({
  pdfUrl,
  containerWidth = 800,
  containerHeight = 700,
  onPageRendered
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { currentPage, zoomLevel, fitMode, rotation } = useInspectionStore();
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 1. Load PDF Document
  useEffect(() => {
    if (!pdfUrl) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    fetch(pdfUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.arrayBuffer();
      })
      .then((data) => pdfjsLib.getDocument({ data }).promise)
      .then((pdf) => {
        if (isMounted) {
          setPdfDoc(pdf);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('PDF.js Load Error:', err);
        if (isMounted) {
          setError('Failed to load engineering PDF drawing');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [pdfUrl]);

  // 2. High-DPI Razor Sharp Page Rendering with Rotation
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    let renderTask: pdfjsLib.RenderTask | null = null;

    pdfDoc.getPage(currentPage).then((page) => {
      const currentRotation = (page.rotate + rotation) % 360;
      const baseViewport = page.getViewport({ scale: 1.0, rotation: currentRotation });

      let calculatedScale = zoomLevel;

      if (fitMode === 'FIT_PAGE' && containerWidth > 0 && containerHeight > 0) {
        const scaleX = (containerWidth - 32) / baseViewport.width;
        const scaleY = (containerHeight - 32) / baseViewport.height;
        calculatedScale = Math.min(scaleX, scaleY);
      } else if (fitMode === 'FIT_WIDTH' && containerWidth > 0) {
        calculatedScale = (containerWidth - 32) / baseViewport.width;
      }

      calculatedScale = Math.max(0.2, Math.min(4.0, calculatedScale));

      // High-DPI Device Pixel Ratio Scaling
      const dpr = Math.max(window.devicePixelRatio || 1, 2);
      const renderViewport = page.getViewport({ scale: calculatedScale * dpr, rotation: currentRotation });

      const canvas = canvasRef.current;
      if (!canvas) return;

      const context = canvas.getContext('2d', { alpha: false });
      if (!context) return;

      canvas.width = Math.floor(renderViewport.width);
      canvas.height = Math.floor(renderViewport.height);

      const displayWidth = Math.floor(renderViewport.width / dpr);
      const displayHeight = Math.floor(renderViewport.height / dpr);
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;

      const renderContext = {
        canvasContext: context,
        viewport: renderViewport
      };

      renderTask = page.render(renderContext);
      renderTask.promise
        .then(() => {
          if (onPageRendered) {
            onPageRendered({
              width: displayWidth,
              height: displayHeight,
              totalPages: pdfDoc.numPages
            });
          }
        })
        .catch((err) => {
          if (err?.name !== 'RenderingCancelledException') {
            console.error('Page render error:', err);
          }
        });
    });

    return () => {
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [pdfDoc, currentPage, zoomLevel, fitMode, rotation, containerWidth, containerHeight]);

  if (loading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 dark:bg-slate-950 light:bg-slate-50 dark:text-slate-400 light:text-slate-600">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-medium">Rendering HD Engineering Vector PDF...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-2 dark:bg-slate-950 light:bg-slate-50 text-rose-500">
        <p className="font-semibold text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative inline-block shadow-2xl rounded border dark:border-slate-800 light:border-slate-300 bg-white">
      <canvas ref={canvasRef} className="block" />
    </div>
  );
};