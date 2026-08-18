import ExcelJS from 'exceljs';

export interface ExportBalloonData {
  balloonNumber: number;
  dimensionName: string;
  nominalValue: number | null;
  upperTolerance: number | null;
  lowerTolerance: number | null;
  lowerLimit: number | null;
  upperLimit: number | null;
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
  workbook.creator = 'Valmet Inspection Ballooning Tool';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Inspection Report', {
    pageSetup: { paperSize: 9, orientation: 'landscape' },
    views: [{ showGridLines: true }]
  });

  // Styles definition
  const titleFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F172A' } // Dark Slate
  };

  const headerFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' } // Slate 800
  };

  // 1. Title Banner
  worksheet.mergeCells('A1:K1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'VALMET QUALITY INSPECTION REPORT (FAIR / PPAP)';
  titleCell.font = { name: 'Arial', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = titleFill;
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 32;

  // 2. Metadata Section (Rows 3 to 6)
  const metadataRows = [
    ['Company:', meta.companyName || 'Valmet Quality Assurance / Industrial Precision', '', '', 'Inspection Date:', meta.inspectionDate],
    ['Part Name:', meta.partName || 'Cast Machined Console', '', '', 'Inspector:', meta.inspectorName || 'Lead QA Inspector'],
    ['Part Number:', meta.partNumber || 'VAL-8492-MK2', '', '', 'Drawing Ref:', meta.drawingRef || 'DWG-CONSOLE-001'],
    ['Revision:', meta.revision || 'Rev B', '', '', 'Total Checks:', `${items.length} Dimensions`]
  ];

  metadataRows.forEach((row, idx) => {
    const rowNum = 3 + idx;
    worksheet.getCell(`A${rowNum}`).value = row[0];
    worksheet.getCell(`A${rowNum}`).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF475569' } };
    
    worksheet.getCell(`B${rowNum}`).value = row[1];
    worksheet.getCell(`B${rowNum}`).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0F172A' } };

    worksheet.getCell(`E${rowNum}`).value = row[4];
    worksheet.getCell(`E${rowNum}`).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF475569' } };

    worksheet.getCell(`F${rowNum}`).value = row[5];
    worksheet.getCell(`F${rowNum}`).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0F172A' } };
    
    worksheet.getRow(rowNum).height = 20;
  });

  worksheet.getRow(7).height = 10;

  // 3. Table Column Headers
  const columns = [
    { header: 'Balloon #', key: 'balloonNumber', width: 12 },
    { header: 'Dimension Characteristic', key: 'dimensionName', width: 26 },
    { header: 'Nominal', key: 'nominalValue', width: 14 },
    { header: '+Tol', key: 'upperTolerance', width: 12 },
    { header: '-Tol', key: 'lowerTolerance', width: 12 },
    { header: 'Lower Limit', key: 'lowerLimit', width: 14 },
    { header: 'Upper Limit', key: 'upperLimit', width: 14 },
    { header: 'Actual Measured', key: 'actualValue', width: 16 },
    { header: 'Unit', key: 'unit', width: 10 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Remarks / Notes', key: 'remarks', width: 24 }
  ];

  const headerRow = worksheet.getRow(8);
  columns.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.header;
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = headerFill;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getColumn(idx + 1).width = col.width;
  });
  headerRow.height = 26;

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
    row.getCell(8).value = item.actualValue !== null && item.actualValue !== undefined ? item.actualValue : '-';
    row.getCell(9).value = item.unit || 'mm';

    const status = (item.status || 'PENDING').toUpperCase();
    const statusCell = row.getCell(10);
    statusCell.value = status;

    row.getCell(11).value = item.remarks || '';

    // Cell Alignment & Number Formatting
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
    for (let c = 3; c <= 8; c++) {
      row.getCell(c).alignment = { horizontal: 'right', vertical: 'middle' };
      if (typeof row.getCell(c).value === 'number') {
        row.getCell(c).numFmt = '0.000';
      }
    }
    row.getCell(9).alignment = { horizontal: 'center', vertical: 'middle' };
    statusCell.alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(11).alignment = { horizontal: 'left', vertical: 'middle' };

    // Status Coloring
    if (status === 'PASS' || status === 'OK') {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
      statusCell.font = { name: 'Arial', size: 10, color: { argb: 'FF065F46' }, bold: true };
    } else if (status === 'CHECK' || status === 'TO CHECK') {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      statusCell.font = { name: 'Arial', size: 10, color: { argb: 'FF92400E' }, bold: true };
    } else if (status === 'FAIL' || status === 'NOT ACCEPTABLE') {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
      statusCell.font = { name: 'Arial', size: 10, color: { argb: 'FF991B1B' }, bold: true };
    } else {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
      statusCell.font = { name: 'Arial', size: 10, color: { argb: 'FF1E40AF' }, bold: true };
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

    row.height = 24;
  });

  // Write and Trigger Download in Browser
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `Valmet_Inspection_${meta.partNumber || 'Part'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}
