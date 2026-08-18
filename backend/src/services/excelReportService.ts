import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import { config } from '../config';

export interface InspectionReportData {
  companyName?: string;
  partName: string;
  partNumber: string;
  drawingName: string;
  revision: string;
  batchNumber: string;
  inspectorName: string;
  inspectionDate: string;
  items: Array<{
    balloonNumber: number;
    dimensionText: string;
    nominalValue: number | null;
    upperTolerance: number | null;
    lowerTolerance: number | null;
    lowerLimit: number | null;
    upperLimit: number | null;
    actualValue: number | null;
    unit: string;
    status: string;
    remarks: string;
  }>;
}

export async function generateExcelReport(data: InspectionReportData): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Automated Dimension Ballooning Tool';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Inspection Report', {
    pageSetup: { paperSize: 9, orientation: 'landscape' }
  });

  // Styles
  const titleFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }; // Dark Slate
  const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }; // Slate 700
  const subHeaderFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };

  // 1. Title Banner
  worksheet.mergeCells('A1:K1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'MANUFACTURING QUALITY INSPECTION REPORT (FAIR / PPAP)';
  titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = titleFill;
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 35;

  // 2. Metadata Grid (Rows 3-6)
  const metadata = [
    ['Company:', data.companyName || 'Industrial Precision Engineering Ltd.', 'Inspection Batch:', data.batchNumber],
    ['Part Name:', data.partName, 'Inspection Date:', data.inspectionDate],
    ['Part Number:', data.partNumber, 'Inspector:', data.inspectorName],
    ['Drawing Ref:', data.drawingName, 'Drawing Rev:', data.revision]
  ];

  metadata.forEach((row, idx) => {
    const rowNum = 3 + idx;
    worksheet.getCell(`A${rowNum}`).value = row[0];
    worksheet.getCell(`A${rowNum}`).font = { bold: true };
    worksheet.getCell(`B${rowNum}`).value = row[1];
    
    worksheet.getCell(`E${rowNum}`).value = row[2];
    worksheet.getCell(`E${rowNum}`).font = { bold: true };
    worksheet.getCell(`F${rowNum}`).value = row[3];
    worksheet.getRow(rowNum).height = 20;
  });

  // Empty row separator
  worksheet.getRow(7).height = 10;

  // 3. Table Header (Row 8)
  const columns = [
    { header: 'Balloon #', key: 'balloonNumber', width: 12 },
    { header: 'Dimension', key: 'dimensionText', width: 20 },
    { header: 'Nominal', key: 'nominalValue', width: 14 },
    { header: '+Tol', key: 'upperTolerance', width: 12 },
    { header: '-Tol', key: 'lowerTolerance', width: 12 },
    { header: 'Lower Limit', key: 'lowerLimit', width: 14 },
    { header: 'Upper Limit', key: 'upperLimit', width: 14 },
    { header: 'Actual', key: 'actualValue', width: 14 },
    { header: 'Unit', key: 'unit', width: 10 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Remarks', key: 'remarks', width: 25 }
  ];

  const headerRow = worksheet.getRow(8);
  columns.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.header;
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = headerFill;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getColumn(idx + 1).width = col.width;
  });
  headerRow.height = 25;

  // 4. Data Rows
  data.items.forEach((item, index) => {
    const rowNum = 9 + index;
    const row = worksheet.getRow(rowNum);

    row.getCell(1).value = item.balloonNumber;
    row.getCell(2).value = item.dimensionText || '-';
    row.getCell(3).value = item.nominalValue !== null ? item.nominalValue : '-';
    row.getCell(4).value = item.upperTolerance !== null ? item.upperTolerance : '-';
    row.getCell(5).value = item.lowerTolerance !== null ? item.lowerTolerance : '-';
    row.getCell(6).value = item.lowerLimit !== null ? item.lowerLimit : '-';
    row.getCell(7).value = item.upperLimit !== null ? item.upperLimit : '-';
    row.getCell(8).value = item.actualValue !== null ? item.actualValue : '-';
    row.getCell(9).value = item.unit || 'mm';
    
    const statusCell = row.getCell(10);
    statusCell.value = item.status || 'PENDING';

    row.getCell(11).value = item.remarks || '';

    // Alignments & Number Formats
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(2).alignment = { horizontal: 'center' };
    for (let c = 3; c <= 8; c++) {
      row.getCell(c).alignment = { horizontal: 'right' };
      if (typeof row.getCell(c).value === 'number') {
        row.getCell(c).numFmt = '0.000';
      }
    }
    row.getCell(9).alignment = { horizontal: 'center' };
    statusCell.alignment = { horizontal: 'center' };

    // Status Cell Styling
    const status = (item.status || 'PENDING').toUpperCase();
    if (status === 'PASS') {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
      statusCell.font = { color: { argb: 'FF065F46' }, bold: true };
    } else if (status === 'CHECK') {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      statusCell.font = { color: { argb: 'FF92400E' }, bold: true };
    } else if (status === 'FAIL') {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
      statusCell.font = { color: { argb: 'FF991B1B' }, bold: true };
    } else {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      statusCell.font = { color: { argb: 'FF475569' }, bold: true };
    }

    // Border
    for (let c = 1; c <= 11; c++) {
      row.getCell(c).border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
    }
    row.height = 22;
  });

  // Ensure output directory exists
  const reportsDirPath = path.resolve(config.reportsDir);
  if (!fs.existsSync(reportsDirPath)) {
    fs.mkdirSync(reportsDirPath, { recursive: true });
  }

  const filename = `Inspection_Report_${data.partNumber}_${Date.now()}.xlsx`;
  const filePath = path.join(reportsDirPath, filename);
  await workbook.xlsx.writeFile(filePath);

  return filePath;
}
