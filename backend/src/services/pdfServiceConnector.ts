import axios from 'axios';
import { config } from '../config';

export interface ExtractDimensionParams {
  filePath: string;
  pageNumber: number;
  normX: float;
  normY: float;
}

export type float = number;

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

export async function extractAllDimensionsFromPdf(filePath: string, pageNumber: number = 1) {
  try {
    const response = await axios.post(`${config.pdfServiceUrl}/api/pdf/extract-all`, {
      filePath,
      pageNumber
    }, {
      timeout: 180000
    });
    return response.data;
  } catch (error: any) {
    const detail = error?.response?.data?.detail || error?.response?.data?.error || error.message;
    console.error('PDF Service extractAll error:', detail);
    return { success: false, items: [], error: detail };
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
