import axios from 'axios';
import { config } from '../config';

export interface ExtractDimensionParams {
  filePath: string;
  pageNumber: number;
  normX: number;
  normY: number;
}

export interface AutoExtractParams {
  filePath: string;
  pageNumber?: number;
}

export interface ExtractedItem {
  normX: number;
  normY: number;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
  rawText?: string;
  dimensionText?: string;
  nominalValue?: number | null;
  upperTolerance?: number | null;
  lowerTolerance?: number | null;
  unit?: string;
  prefix?: string;
  isAiExtracted?: boolean;
  extractionMode?: string;
  x?: number;
  y?: number;
}

export interface AutoExtractResponse {
  success: boolean;
  engine?: string;
  processingTimeSeconds?: number;
  count?: number;
  items: ExtractedItem[];
  balloons?: ExtractedItem[];
  error?: string;
}

export async function autoExtractDimensionsFromPdf(params: AutoExtractParams): Promise<AutoExtractResponse> {
  try {
    const response = await axios.post(
      `${config.pdfServiceUrl}/api/pdf/extract-all`,
      {
        filePath: params.filePath,
        pageNumber: params.pageNumber || 1
      },
      {
        timeout: 600000 // 10 minutes timeout for safe fallback
      }
    );
    return response.data;
  } catch (error: any) {
    const detail = error?.response?.data?.detail || error?.response?.data?.error || error.message;
    console.error('PDF Service autoExtract error:', detail);
    return { success: false, items: [], balloons: [], error: detail };
  }
}

export const extractAllDimensionsFromPdf = (filePath: string, pageNumber: number = 1) =>
  autoExtractDimensionsFromPdf({ filePath, pageNumber });

export async function extractDimensionFromPdf(params: ExtractDimensionParams) {
  try {
    const response = await axios.post(`${config.pdfServiceUrl}/api/pdf/extract-text`, {
      filePath: params.filePath,
      pageNumber: params.pageNumber,
      normX: params.normX,
      normY: params.normY
    });
    return response.data;
  } catch (error: any) {
    console.error('PDF Service extractDimension error:', error?.response?.data || error.message);
    return {
      found: false,
      extractionMode: 'MANUAL_FALLBACK',
      message: 'Failed to contact Python PDF extraction service. Switching to manual mode.'
    };
  }
}

export async function requestMarkedUpPdf(inputPdfPath: string, outputPdfPath: string, balloons: any[]) {
  try {
    const response = await axios.post(`${config.pdfServiceUrl}/api/pdf/generate-markup`, {
      inputPdfPath,
      outputPdfPath,
      balloons
    });
    return response.data;
  } catch (error: any) {
    console.error('PDF Service generateMarkup error:', error?.response?.data || error.message);
    throw new Error(error?.response?.data?.detail || 'Failed to generate marked-up PDF');
  }
}

export async function fetchPdfInfo(filePath: string) {
  try {
    const response = await axios.get(`${config.pdfServiceUrl}/api/pdf/info`, {
      params: { filePath }
    });
    return response.data;
  } catch (error: any) {
    console.error('PDF Service fetchPdfInfo error:', error?.response?.data || error.message);
    return { pageCount: 1, pages: [{ pageNumber: 1, width: 595, height: 842 }] };
  }
}