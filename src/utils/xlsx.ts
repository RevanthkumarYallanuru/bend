import ExcelJS from "exceljs";
import type { Response } from "express";

export interface XlsxColumn {
  header: string;
  key: string;
  width?: number;
}

/**
 * Builds a single-sheet workbook from column definitions + row
 * objects and streams it to the response as a downloadable .xlsx
 * file. Shared by the Reports and Ledger export endpoints so the
 * file format stays consistent across every export.
 */
export async function sendXlsx(
  res: Response,
  filename: string,
  sheetName: string,
  columns: XlsxColumn[],
  rows: Record<string, unknown>[]
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width ?? 20,
  }));

  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    sheet.addRow(row);
  }

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}"`
  );

  await workbook.xlsx.write(res);
  res.end();
}
