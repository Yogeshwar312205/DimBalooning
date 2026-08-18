import ExcelJS from 'exceljs';

export interface ExportSubItem {
  name: string;
  nominalValue: number | null;
  upperTolerance: number | null;
  lowerTolerance: number | null;
  lowerLimit: number | null;
  upperLimit: number | null;
  actualValue: number | null;
  status: string;
}

export interface ExportBalloonData {
  balloonNumber: number;
  unit: string;
  items: ExportSubItem[];
  overallStatus: string;
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
  balloons: ExportBalloonData[]
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Valmet Dimension Inspection Platform';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Inspection Report', {
    pageSetup: { paperSize: 9, orientation: 'landscape' },
    views: [{ showGridLines: true }]
  });

  // Clean Technical Styling
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
  worksheet.mergeCells('A1:J1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'DIMENSIONAL INSPECTION REPORT (VALMET / FAIR)';
  titleCell.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = titleFill;
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 28;

  // 2. Metadata Section (Rows 3-6)
  const metadataRows = [
    ['Customer:', meta.companyName || 'Valmet Corporation', '', 'Inspection Date:', meta.inspectionDate],
    ['Part Name:', meta.partName || 'Machined Component', '', 'Inspector:', meta.inspectorName || 'QA Inspector'],
    ['Part Number:', meta.partNumber || 'VAL-8492-MK2', '', 'Drawing Ref:', meta.drawingRef || 'DWG-94050440201'],
    ['Revision:', meta.revision || 'Rev 05', '', 'Total Balloons:', `${balloons.length} Dimension Balloons`]
  ];

  metadataRows.forEach((row, idx) => {
    const rowNum = 3 + idx;
    worksheet.getCell(`A${rowNum}`).value = row[0];
    worksheet.getCell(`A${rowNum}`).font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF475569' } };
    
    worksheet.getCell(`B${rowNum}`).value = row[1];
    worksheet.getCell(`B${rowNum}`).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0F172A' } };

    worksheet.getCell(`E${rowNum}`).value = row[3];
    worksheet.getCell(`E${rowNum}`).font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF475569' } };

    worksheet.getCell(`F${rowNum}`).value = row[4];
    worksheet.getCell(`F${rowNum}`).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0F172A' } };
    
    worksheet.getRow(rowNum).height = 18;
  });

  worksheet.getRow(7).height = 8;

  // 3. Table Column Headers (Row 8)
  const columns = [
    { header: 'Balloon ID', key: 'balloonId', width: 12 },
    { header: 'Dimension Parameter', key: 'paramName', width: 28 },
    { header: 'Drawing Dim (Nominal)', key: 'nominal', width: 20 },
    { header: '+Tol', key: 'upperTol', width: 11 },
    { header: '-Tol', key: 'lowerTol', width: 11 },
    { header: 'Lower Limit', key: 'lowerLimit', width: 13 },
    { header: 'Upper Limit', key: 'upperLimit', width: 13 },
    { header: 'Actual Measured', key: 'actual', width: 16 },
    { header: 'Unit', key: 'unit', width: 8 },
    { header: 'Result Status', key: 'status', width: 16 }
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

  // 4. Data Rows (Flattening balloons and sub-dimensions)
  let currentRowNum = 9;

  balloons.forEach((b) => {
    const formattedBalloonId = String(b.balloonNumber).padStart(2, '0');

    b.items.forEach((subItem, subIdx) => {
      const row = worksheet.getRow(currentRowNum);

      // Balloon ID column (e.g. "01" or "01 (Length)")
      row.getCell(1).value = subIdx === 0 ? formattedBalloonId : `  ↳ ${formattedBalloonId}`;
      row.getCell(2).value = subItem.name || `Dimension #${formattedBalloonId}`;
      row.getCell(3).value = subItem.nominalValue !== null ? subItem.nominalValue : '-';
      row.getCell(4).value = subItem.upperTolerance !== null ? subItem.upperTolerance : '-';
      row.getCell(5).value = subItem.lowerTolerance !== null ? subItem.lowerTolerance : '-';
      row.getCell(6).value = subItem.lowerLimit !== null ? subItem.lowerLimit : '-';
      row.getCell(7).value = subItem.upperLimit !== null ? subItem.upperLimit : '-';
      row.getCell(8).value = subItem.actualValue !== null ? subItem.actualValue : '-';
      row.getCell(9).value = b.unit || 'mm';

      const status = (subItem.status || 'PENDING').toUpperCase();
      const statusCell = row.getCell(10);
      statusCell.value = status;

      // Alignments & Number formatting
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

      // Status Colors
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

      // Borders
      for (let c = 1; c <= 10; c++) {
        row.getCell(c).border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };
      }

      row.height = 22;
      currentRowNum++;
    });
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
