import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const outputPath = resolve(process.env.SMOKE_XLSX || "test-fixtures/smoke-bank.xlsx");
let crcTable;

mkdirSync(dirname(outputPath), { recursive: true });

const rows = [
  ["题干", "正确答案", "解析", "选项A", "选项B", "选项C", "选项D"],
  ["地球绕太阳公转一周大约需要多久？", "A", "一年约为 365 天。", "一年", "一天", "一个月", "十年"],
  ["下列哪些属于编程语言？", "AC", "JavaScript 和 Python 都是编程语言。", "JavaScript", "HTML", "Python", "CSS"],
  ["水在标准大气压下 100 摄氏度沸腾。", "正确", "标准大气压下水的沸点是 100 摄氏度。", "", "", "", ""],
  ["中国的首都是{北京}。", "北京", "基础地理常识。", "", "", "", ""],
];

const files = new Map([
  ["[Content_Types].xml", xml(`<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`)],
  ["_rels/.rels", xml(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`)],
  ["xl/workbook.xml", xml(`<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="导入题库" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`)],
  ["xl/_rels/workbook.xml.rels", xml(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`)],
  ["xl/worksheets/sheet1.xml", xml(`<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
${rows.map((row, rowIndex) => renderRow(row, rowIndex + 1)).join("\n")}
  </sheetData>
</worksheet>`)],
]);

writeFileSync(outputPath, createZip(files));

console.log(`Smoke fixture written: ${outputPath}`);

function renderRow(row, rowNumber) {
  const cells = row.map((value, columnIndex) => {
    const ref = `${columnName(columnIndex)}${rowNumber}`;
    return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
  });
  return `    <row r="${rowNumber}">${cells.join("")}</row>`;
}

function columnName(index) {
  let name = "";
  let value = index + 1;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function xml(text) {
  return Buffer.from(text.trim(), "utf8");
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const [name, data] of entries) {
    const nameBuffer = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);

    localParts.push(localHeader, nameBuffer, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + data.length;
  }

  const centralOffset = offset;
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.size, 8);
  end.writeUInt16LE(entries.size, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(centralOffset, 16);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  const table = getCrcTable();
  for (const byte of buffer) {
    crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getCrcTable() {
  crcTable ||= Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  });
  return crcTable;
}
