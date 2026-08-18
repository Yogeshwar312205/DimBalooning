import ExcelJS from 'exceljs';

export interface ExportBalloonData {
  balloonNumber: number;
  dimensionName: string;
  nominalValue: number | null;
  upperTolerance: number | null;
  lowerTolerance: number | null;
  lowerLimit: number | null;
  upperLimit: number | null;
  observationCount?: number;
  observations?: (number | null)[];
  actualValue: number | null;
  unit: string;
  status: string;
  remarks?: string;
}

export interface ExportMetadata {
  companyName?: string;
  partName: string;
  partNumber: string;
  drawingRef: string;
  revision: string;
  inspectorName: string;
  inspectionDate: string;
}

export async function exportInspectionToExcel(
  meta: ExportMetadata,
  items: ExportBalloonData[]
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Valmet Dimension Ballooning & Quality Inspection Platform';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Inspection Report', {
    pageSetup: { paperSize: 9, orientation: 'landscape' },
    views: [{ showGridLines: true }]
  });

  // Industrial Styling: Classic Precision Engineering
  const titleFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' } // Slate 800
  };

  const headerFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF334155' } // Slate 700
  };

  // 1. Title Banner
  worksheet.mergeCells('A1:L1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'LAYOUT & DIMENSIONAL QUALITY INSPECTION REPORT (VALMET / FAIR)';
  titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = titleFill;
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 30;

  // 2. Metadata Section (Rows 3-6)
  const metadataRows = [
    ['Customer:', meta.companyName || 'Valmet Corporation', '', '', 'Inspection Date:', meta.inspectionDate],
    ['Part Name:', meta.partName || 'Cast Console / Housing', '', '', 'Inspector Name:', meta.inspectorName || 'QA Inspector'],
    ['Part / Article #:', meta.partNumber || 'VAL-8492-MK2', '', '', 'Drawing Ref:', meta.drawingRef || 'DWG-94050440201'],
    ['Drawing Revision:', meta.revision || 'Rev 05', '', '', 'Total Dimensions:', `${items.length} Ballooned Characteristics`]
  ];

  metadataRows.forEach((row, idx) => {
    const rowNum = 3 + idx;
    worksheet.getCell(`A${rowNum}`).value = row[0];
    worksheet.getCell(`A${rowNum}`).font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF475569' } };
    
    worksheet.getCell(`B${rowNum}`).value = row[1];
    worksheet.getCell(`B${rowNum}`).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0F172A' } };

    worksheet.getCell(`F${rowNum}`).value = row[4];
    worksheet.getCell(`F${rowNum}`).font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF475569' } };

    worksheet.getCell(`G${rowNum}`).value = row[5];
    worksheet.getCell(`G${rowNum}`).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0F172A' } };
    
    worksheet.getRow(rowNum).height = 19;
  });

  worksheet.getRow(7).height = 8;

  // 3. Table Column Headers (Row 8)
  const columns = [
    { header: 'Item #', key: 'balloonNumber', width: 8 },
    { header: 'Dimension Parameter', key: 'dimensionName', width: 28 },
    { header: 'Nominal', key: 'nominalValue', width: 12 },
    { header: '+Tol', key: 'upperTolerance', width: 10 },
    { header: '-Tol', key: 'lowerTolerance', width: 10 },
    { header: 'Lower Limit', key: 'lowerLimit', width: 12 },
    { header: 'Upper Limit', key: 'upperLimit', width: 12 },
    { header: 'Obs 01', key: 'obs1', width: 12 },
    { header: 'Obs 02', key: 'obs2', width: 12 },
    { header: 'Obs 03', key: 'obs3', width: 12 },
    { header: 'Unit', key: 'unit', width: 8 },
    { header: 'Status / Result', key: 'status', width: 16 }
  ];

  const headerRow = worksheet.getRow(8);
  columns.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.header;
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = headerFill;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getColumn(idx + 1).width = col.width;
  });
  headerRow.height = 24;

  // 4. Data Rows
  items.forEach((item, index) => {
    const rowNum = 9 + index;
    const row = worksheet.getRow(rowNum);

    row.getCell(1).value = item.balloonNumber;
    row.getCell(2).value = item.dimensionName || `Dim #${item.balloonNumber}`;
    row.getCell(3).value = item.nominalValue !== null && item.nominalValue !== undefined ? item.nominalValue : '-';
    row.getCell(4).value = item.upperTolerance !== null && item.upperTolerance !== undefined ? item.upperTolerance : '-';
    row.getCell(5).value = item.lowerTolerance !== null && item.lowerTolerance !== undefined ? item.lowerTolerance : '-';
    row.getCell(6).value = item.lowerLimit !== null && item.lowerLimit !== undefined ? item.lowerLimit : '-';
    row.getCell(7).value = item.upperLimit !== null && item.upperLimit !== undefined ? item.upperLimit : '-';

    // Observations
    const obs = item.observations || [item.actualValue];
    row.getCell(8).value = obs[0] !== null && obs[0] !== undefined ? obs[0] : (item.actualValue !== null && item.actualValue !== undefined ? item.actualValue : '-');
    row.getCell(9).value = obs[1] !== null && obs[1] !== undefined ? obs[1] : '-';
    row.getCell(10).value = obs[2] !== null && obs[2] !== undefined ? obs[2] : '-';

    row.getCell(11).value = item.unit || 'mm';

    const status = (item.status || 'PENDING').toUpperCase();
    const statusCell = row.getCell(12);
    statusCell.value = status === 'OK' || status === 'PASS' ? 'OK' : status === 'TO CHECK' || status === 'CHECK' ? 'TO CHECK' : status === 'NOT ACCEPTABLE' || status === 'FAIL' ? 'NOT ACCEPTABLE' : 'PENDING';

    // Alignment & Formatting
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
    for (let c = 3; c <= 10; c++) {
      row.getCell(c).alignment = { horizontal: 'right', vertical: 'middle' };
      if (typeof row.getCell(c).value === 'number') {
        row.getCell(c).numFmt = '0.000';
      }
    }
    row.getCell(11).alignment = { horizontal: 'center', vertical: 'middle' };
    statusCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // Clean Engineering Status Colors
    if (status === 'OK' || status === 'PASS') {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
      statusCell.font = { name: 'Arial', size: 9, color: { argb: 'FF065F46' }, bold: true };
    } else if (status === 'TO CHECK' || status === 'CHECK') {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      statusCell.font = { name: 'Arial', size: 9, color: { argb: 'FF92400E' }, bold: true };
    } else if (status === 'NOT ACCEPTABLE' || status === 'FAIL') {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
      statusCell.font = { name: 'Arial', size: 9, color: { argb: 'FF991B1B' }, bold: true };
    } else {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      statusCell.font = { name: 'Arial', size: 9, color: { argb: 'FF64748B' }, bold: true };
    }

    // Standard Thin Borders
    for (let c = 1; c <= 12; c++) {
      row.getCell(c).border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
    }

    row.height = 22;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `Valmet_Inspection_Sheet_${meta.partNumber || 'Part'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}
