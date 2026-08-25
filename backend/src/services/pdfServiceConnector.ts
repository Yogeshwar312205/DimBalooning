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

export interface AutoExtractResponse {
  success: boolean;
  pageNumber: number;
  skippedBlankTiles: number[];
  extractedCount: number;
  processingTimeSeconds: number;
  macroMetadata?: {
    partNumber?: string;
    revision?: string;
    unit?: string;
  };
  balloons: Array<{
    balloonNumber: number;
    x: number;
    y: number;
    leaderStartX: number;
    leaderStartY: number;
    dimensionText: string;
    nominalValue: number | null;
    upperTolerance: number | null;
    lowerTolerance: number | null;
    unit: string;
    isAiExtracted: boolean; 
  }>;
}

export async function autoExtractDimensionsFromPdf(params: AutoExtractParams): Promise<AutoExtractResponse> {
  try {
    const response = await axios.post(`${config.pdfServiceUrl}/api/pdf/auto-extract`, {
      filePath: params.filePath,
      pageNumber: params.pageNumber || 1
    }, {
      timeout: 600000 // INCREASED TO 10 MINUTES (600,000 ms) for prototype safety
    });
    return response.data;
  } catch (error: any) {
    console.error('PDF Service autoExtractDimensions error:', error?.response?.data || error.message);
    throw new Error(error?.response?.data?.detail || error.message || 'Failed to auto-extract dimensions');
  }
}

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