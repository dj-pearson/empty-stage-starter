/**
 * Document Export Utilities
 *
 * Functions for exporting data to Microsoft Office formats (DOCX, XLSX)
 * Uses minimal dependencies with browser-native capabilities where possible.
 */

import { downloadFile } from "./file-utils";
import { logger } from "./logger";

// =============================================================================
// TYPES
// =============================================================================

export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
  type?: "string" | "number" | "date" | "boolean" | "currency";
  format?: string;
}

export interface ExcelSheet {
  name: string;
  columns: ExcelColumn[];
  data: Record<string, any>[];
  freezeHeader?: boolean;
  autoFilter?: boolean;
}

export interface ExcelExportOptions {
  filename: string;
  sheets: ExcelSheet[];
  author?: string;
  title?: string;
  subject?: string;
}

export interface DocxParagraph {
  text: string;
  style?: "heading1" | "heading2" | "heading3" | "normal" | "title" | "subtitle";
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  alignment?: "left" | "center" | "right" | "justify";
  color?: string;
  fontSize?: number;
}

export interface DocxTable {
  headers: string[];
  rows: string[][];
  headerBackground?: string;
  borderColor?: string;
}

export interface DocxExportOptions {
  filename: string;
  title?: string;
  author?: string;
  subject?: string;
  content: (DocxParagraph | DocxTable | { type: "pageBreak" } | { type: "lineBreak" })[];
}

// =============================================================================
// EXCEL EXPORT (XLSX)
// =============================================================================

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  if (typeof str !== "string") return String(str ?? "");
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Convert column number to Excel column letter (1 -> A, 27 -> AA)
 */
function getColumnLetter(num: number): string {
  let letter = "";
  while (num > 0) {
    const mod = (num - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    num = Math.floor((num - mod) / 26);
  }
  return letter;
}

/**
 * Format value for Excel cell based on type
 */
function formatCellValue(value: any, type?: ExcelColumn["type"]): { value: string; type: string } {
  if (value === null || value === undefined) {
    return { value: "", type: "inlineStr" };
  }

  switch (type) {
    case "number":
    case "currency":
      const num = parseFloat(value);
      if (isNaN(num)) {
        return { value: escapeXml(String(value)), type: "inlineStr" };
      }
      return { value: String(num), type: "n" };

    case "date":
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        return { value: escapeXml(String(value)), type: "inlineStr" };
      }
      // Excel dates are number of days since 1900-01-01
      const excelDate = (date.getTime() / 86400000) + 25569;
      return { value: String(excelDate), type: "n" };

    case "boolean":
      return { value: value ? "1" : "0", type: "b" };

    default:
      return { value: escapeXml(String(value)), type: "inlineStr" };
  }
}

/**
 * Generate Excel workbook as a ZIP file containing XLSX structure
 */
export async function exportToExcel(options: ExcelExportOptions): Promise<void> {
  const { filename, sheets, author = "EatPal", title = "", subject = "" } = options;

  try {
    // We'll use JSZip-like structure but simplified for browser
    const files: Record<string, string> = {};

    // [Content_Types].xml
    files["[Content_Types].xml"] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  ${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n  ")}
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

    // _rels/.rels
    files["_rels/.rels"] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

    // docProps/core.xml
    const now = new Date().toISOString();
    files["docProps/core.xml"] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>${escapeXml(author)}</dc:creator>
  <cp:lastModifiedBy>${escapeXml(author)}</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
  ${title ? `<dc:title>${escapeXml(title)}</dc:title>` : ""}
  ${subject ? `<dc:subject>${escapeXml(subject)}</dc:subject>` : ""}
</cp:coreProperties>`;

    // docProps/app.xml
    files["docProps/app.xml"] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>EatPal</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <HeadingPairs>
    <vt:vector size="2" baseType="variant">
      <vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant>
      <vt:variant><vt:i4>${sheets.length}</vt:i4></vt:variant>
    </vt:vector>
  </HeadingPairs>
  <TitlesOfParts>
    <vt:vector size="${sheets.length}" baseType="lpstr">
      ${sheets.map((s) => `<vt:lpstr>${escapeXml(s.name)}</vt:lpstr>`).join("")}
    </vt:vector>
  </TitlesOfParts>
</Properties>`;

    // xl/_rels/workbook.xml.rels
    files["xl/_rels/workbook.xml.rels"] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("\n  ")}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId${sheets.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`;

    // xl/workbook.xml
    files["xl/workbook.xml"] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${sheets.map((s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("\n    ")}
  </sheets>
</workbook>`;

    // xl/styles.xml
    files["xl/styles.xml"] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE0E0E0"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color indexed="64"/></left>
      <right style="thin"><color indexed="64"/></right>
      <top style="thin"><color indexed="64"/></top>
      <bottom style="thin"><color indexed="64"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="4">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
    <xf numFmtId="14" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
  </cellXfs>
</styleSheet>`;

    // Collect all strings for shared strings
    const sharedStrings: string[] = [];
    const stringIndexMap = new Map<string, number>();

    const getStringIndex = (str: string): number => {
      if (stringIndexMap.has(str)) {
        return stringIndexMap.get(str)!;
      }
      const index = sharedStrings.length;
      sharedStrings.push(str);
      stringIndexMap.set(str, index);
      return index;
    };

    // Generate worksheet files
    sheets.forEach((sheet, sheetIndex) => {
      const { columns, data, freezeHeader, autoFilter } = sheet;

      // Calculate dimensions
      const lastCol = getColumnLetter(columns.length);
      const lastRow = data.length + 1; // +1 for header

      let sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="A1:${lastCol}${lastRow}"/>
  <sheetViews>
    <sheetView tabSelected="${sheetIndex === 0 ? "1" : "0"}" workbookViewId="0"${freezeHeader ? '><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView' : '/'}>
    </sheetView>
  </sheetViews>
  <cols>
    ${columns.map((col, i) => `<col min="${i + 1}" max="${i + 1}" width="${col.width || 15}" customWidth="1"/>`).join("\n    ")}
  </cols>
  <sheetData>`;

      // Header row
      sheetXml += `\n    <row r="1">`;
      columns.forEach((col, colIndex) => {
        const cellRef = `${getColumnLetter(colIndex + 1)}1`;
        const strIndex = getStringIndex(col.header);
        sheetXml += `<c r="${cellRef}" t="s" s="1"><v>${strIndex}</v></c>`;
      });
      sheetXml += `</row>`;

      // Data rows
      data.forEach((row, rowIndex) => {
        const rowNum = rowIndex + 2;
        sheetXml += `\n    <row r="${rowNum}">`;
        columns.forEach((col, colIndex) => {
          const cellRef = `${getColumnLetter(colIndex + 1)}${rowNum}`;
          const cellValue = row[col.key];
          const { value, type } = formatCellValue(cellValue, col.type);

          if (type === "inlineStr") {
            const strIndex = getStringIndex(value);
            sheetXml += `<c r="${cellRef}" t="s" s="2"><v>${strIndex}</v></c>`;
          } else if (type === "n" && col.type === "date") {
            sheetXml += `<c r="${cellRef}" s="3"><v>${value}</v></c>`;
          } else {
            sheetXml += `<c r="${cellRef}" t="${type}" s="2"><v>${value}</v></c>`;
          }
        });
        sheetXml += `</row>`;
      });

      sheetXml += `\n  </sheetData>`;

      if (autoFilter) {
        sheetXml += `\n  <autoFilter ref="A1:${lastCol}${lastRow}"/>`;
      }

      sheetXml += `\n</worksheet>`;

      files[`xl/worksheets/sheet${sheetIndex + 1}.xml`] = sheetXml;
    });

    // xl/sharedStrings.xml
    files["xl/sharedStrings.xml"] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">
  ${sharedStrings.map((s) => `<si><t>${escapeXml(s)}</t></si>`).join("\n  ")}
</sst>`;

    // Create ZIP file using JSZip or similar
    // For browser compatibility, we'll use a simple approach
    const blob = await createZipBlob(files);
    downloadFile(blob, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);

    logger.info("Excel export completed", { filename, sheets: sheets.length });
  } catch (error) {
    logger.error("Excel export failed:", error);
    throw error;
  }
}

/**
 * Create ZIP blob from file map
 * This is a simplified implementation - in production, use JSZip
 */
async function createZipBlob(files: Record<string, string>): Promise<Blob> {
  // Try to use JSZip if available
  if (typeof window !== "undefined" && (window as any).JSZip) {
    const JSZip = (window as any).JSZip;
    const zip = new JSZip();

    Object.entries(files).forEach(([path, content]) => {
      zip.file(path, content);
    });

    return await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  }

  // Fallback: Create a simple uncompressed ZIP
  // This is a minimal implementation for browsers without JSZip
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const centralDirectory: Uint8Array[] = [];
  let offset = 0;

  for (const [path, content] of Object.entries(files)) {
    const pathBytes = encoder.encode(path);
    const contentBytes = encoder.encode(content);

    // Local file header
    const localHeader = new Uint8Array(30 + pathBytes.length);
    const view = new DataView(localHeader.buffer);

    view.setUint32(0, 0x04034b50, true); // Signature
    view.setUint16(4, 20, true); // Version needed
    view.setUint16(6, 0, true); // Flags
    view.setUint16(8, 0, true); // Compression (store)
    view.setUint16(10, 0, true); // Mod time
    view.setUint16(12, 0, true); // Mod date
    view.setUint32(14, 0, true); // CRC-32 (skip for simplicity)
    view.setUint32(18, contentBytes.length, true); // Compressed size
    view.setUint32(22, contentBytes.length, true); // Uncompressed size
    view.setUint16(26, pathBytes.length, true); // File name length
    view.setUint16(28, 0, true); // Extra field length
    localHeader.set(pathBytes, 30);

    parts.push(localHeader);
    parts.push(contentBytes);

    // Central directory entry
    const cdEntry = new Uint8Array(46 + pathBytes.length);
    const cdView = new DataView(cdEntry.buffer);

    cdView.setUint32(0, 0x02014b50, true); // Signature
    cdView.setUint16(4, 20, true); // Version made by
    cdView.setUint16(6, 20, true); // Version needed
    cdView.setUint16(8, 0, true); // Flags
    cdView.setUint16(10, 0, true); // Compression
    cdView.setUint16(12, 0, true); // Mod time
    cdView.setUint16(14, 0, true); // Mod date
    cdView.setUint32(16, 0, true); // CRC-32
    cdView.setUint32(20, contentBytes.length, true); // Compressed size
    cdView.setUint32(24, contentBytes.length, true); // Uncompressed size
    cdView.setUint16(28, pathBytes.length, true); // File name length
    cdView.setUint16(30, 0, true); // Extra field length
    cdView.setUint16(32, 0, true); // Comment length
    cdView.setUint16(34, 0, true); // Disk number
    cdView.setUint16(36, 0, true); // Internal attrs
    cdView.setUint32(38, 0, true); // External attrs
    cdView.setUint32(42, offset, true); // Offset
    cdEntry.set(pathBytes, 46);

    centralDirectory.push(cdEntry);
    offset += localHeader.length + contentBytes.length;
  }

  // Add central directory
  const cdStart = offset;
  let cdSize = 0;
  for (const entry of centralDirectory) {
    parts.push(entry);
    cdSize += entry.length;
  }

  // End of central directory
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true); // Signature
  eocdView.setUint16(4, 0, true); // Disk number
  eocdView.setUint16(6, 0, true); // CD disk number
  eocdView.setUint16(8, centralDirectory.length, true); // CD entries on disk
  eocdView.setUint16(10, centralDirectory.length, true); // Total CD entries
  eocdView.setUint32(12, cdSize, true); // CD size
  eocdView.setUint32(16, cdStart, true); // CD offset
  eocdView.setUint16(20, 0, true); // Comment length

  parts.push(eocd);

  return new Blob(parts, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

// =============================================================================
// WORD DOCUMENT EXPORT (DOCX)
// =============================================================================

/**
 * Export content to a DOCX file
 */
export async function exportToDocx(options: DocxExportOptions): Promise<void> {
  const { filename, title = "", author = "EatPal", subject = "", content } = options;

  try {
    const files: Record<string, string> = {};

    // [Content_Types].xml
    files["[Content_Types].xml"] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

    // _rels/.rels
    files["_rels/.rels"] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

    // docProps/core.xml
    const now = new Date().toISOString();
    files["docProps/core.xml"] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>${escapeXml(author)}</dc:creator>
  <cp:lastModifiedBy>${escapeXml(author)}</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
  ${title ? `<dc:title>${escapeXml(title)}</dc:title>` : ""}
  ${subject ? `<dc:subject>${escapeXml(subject)}</dc:subject>` : ""}
</cp:coreProperties>`;

    // docProps/app.xml
    files["docProps/app.xml"] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>EatPal</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
</Properties>`;

    // word/_rels/document.xml.rels
    files["word/_rels/document.xml.rels"] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

    // word/styles.xml
    files["word/styles.xml"] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
        <w:sz w:val="22"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Normal" w:default="1">
    <w:name w:val="Normal"/>
    <w:pPr><w:spacing w:after="200" w:line="276" w:lineRule="auto"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="Heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="480" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="48"/><w:color w:val="2E74B5"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="Heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="360" w:after="80"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="2E74B5"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="Heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="240" w:after="60"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="28"/><w:color w:val="1F4D78"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:after="300"/><w:jc w:val="center"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="56"/><w:color w:val="000000"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle">
    <w:name w:val="Subtitle"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:jc w:val="center"/></w:pPr>
    <w:rPr><w:i/><w:sz w:val="28"/><w:color w:val="666666"/></w:rPr>
  </w:style>
</w:styles>`;

    // word/document.xml
    let documentBody = "";

    for (const item of content) {
      if ("type" in item) {
        if (item.type === "pageBreak") {
          documentBody += `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
        } else if (item.type === "lineBreak") {
          documentBody += `<w:p><w:r><w:br/></w:r></w:p>`;
        }
      } else if ("headers" in item) {
        // Table
        documentBody += generateDocxTable(item);
      } else {
        // Paragraph
        documentBody += generateDocxParagraph(item);
      }
    }

    files["word/document.xml"] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${documentBody}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

    const blob = await createZipBlob(files);
    downloadFile(blob, filename.endsWith(".docx") ? filename : `${filename}.docx`);

    logger.info("DOCX export completed", { filename });
  } catch (error) {
    logger.error("DOCX export failed:", error);
    throw error;
  }
}

/**
 * Generate DOCX paragraph XML
 */
function generateDocxParagraph(para: DocxParagraph): string {
  const styleMap: Record<string, string> = {
    heading1: "Heading1",
    heading2: "Heading2",
    heading3: "Heading3",
    title: "Title",
    subtitle: "Subtitle",
    normal: "Normal",
  };

  const alignMap: Record<string, string> = {
    left: "start",
    center: "center",
    right: "end",
    justify: "both",
  };

  let pPr = "";
  if (para.style) {
    pPr += `<w:pStyle w:val="${styleMap[para.style] || "Normal"}"/>`;
  }
  if (para.alignment) {
    pPr += `<w:jc w:val="${alignMap[para.alignment]}"/>`;
  }

  let rPr = "";
  if (para.bold) rPr += "<w:b/>";
  if (para.italic) rPr += "<w:i/>";
  if (para.underline) rPr += '<w:u w:val="single"/>';
  if (para.color) rPr += `<w:color w:val="${para.color.replace("#", "")}"/>`;
  if (para.fontSize) rPr += `<w:sz w:val="${para.fontSize * 2}"/>`;

  return `<w:p>
    ${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}
    <w:r>
      ${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}
      <w:t xml:space="preserve">${escapeXml(para.text)}</w:t>
    </w:r>
  </w:p>`;
}

/**
 * Generate DOCX table XML
 */
function generateDocxTable(table: DocxTable): string {
  const borderColor = (table.borderColor || "#000000").replace("#", "");
  const headerBg = (table.headerBackground || "#E0E0E0").replace("#", "");

  let xml = `<w:tbl>
    <w:tblPr>
      <w:tblW w:w="5000" w:type="pct"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:color="${borderColor}"/>
        <w:left w:val="single" w:sz="4" w:color="${borderColor}"/>
        <w:bottom w:val="single" w:sz="4" w:color="${borderColor}"/>
        <w:right w:val="single" w:sz="4" w:color="${borderColor}"/>
        <w:insideH w:val="single" w:sz="4" w:color="${borderColor}"/>
        <w:insideV w:val="single" w:sz="4" w:color="${borderColor}"/>
      </w:tblBorders>
    </w:tblPr>`;

  // Header row
  xml += `<w:tr>`;
  for (const header of table.headers) {
    xml += `<w:tc>
      <w:tcPr><w:shd w:val="clear" w:fill="${headerBg}"/></w:tcPr>
      <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${escapeXml(header)}</w:t></w:r></w:p>
    </w:tc>`;
  }
  xml += `</w:tr>`;

  // Data rows
  for (const row of table.rows) {
    xml += `<w:tr>`;
    for (const cell of row) {
      xml += `<w:tc><w:p><w:r><w:t>${escapeXml(cell)}</w:t></w:r></w:p></w:tc>`;
    }
    xml += `</w:tr>`;
  }

  xml += `</w:tbl>`;
  return xml;
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Export array of objects to Excel with automatic column detection
 */
export async function exportDataToExcel(
  data: Record<string, any>[],
  filename: string,
  sheetName: string = "Data"
): Promise<void> {
  if (data.length === 0) {
    throw new Error("No data to export");
  }

  const keys = Object.keys(data[0]);
  const columns: ExcelColumn[] = keys.map((key) => ({
    header: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " "),
    key,
    width: 15,
  }));

  await exportToExcel({
    filename,
    sheets: [
      {
        name: sheetName,
        columns,
        data,
        freezeHeader: true,
        autoFilter: true,
      },
    ],
  });
}

/**
 * Export report to DOCX with title and table
 */
export async function exportReportToDocx(
  title: string,
  description: string,
  data: Record<string, any>[],
  filename: string
): Promise<void> {
  if (data.length === 0) {
    throw new Error("No data to export");
  }

  const headers = Object.keys(data[0]).map(
    (k) => k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, " ")
  );
  const rows = data.map((row) => Object.values(row).map(String));

  await exportToDocx({
    filename,
    title,
    content: [
      { text: title, style: "title" },
      { text: description, style: "subtitle" },
      { type: "lineBreak" },
      { headers, rows },
    ],
  });
}
