// ==UserScript==
// @name         学习通提交结果导题导出器
// @namespace    https://local.codex/chaoxing-source-export
// @version      1.1.0
// @description  在学习通提交后的作业详情页，从后台源码读取完整题目和老师公布的正确答案，并按导题模板导出 Excel。未公布答案时 B 列留空，不读取“我的答案”作为答案。
// @author       Codex
// @match        *://mooc1.chaoxing.com/mooc-ans/mooc2/work/view*
// @match        *://*.chaoxing.com/mooc-ans/mooc2/work/view*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const PANEL_ID = "cx-source-export-panel";

  init();

  function init() {
    if (document.getElementById(PANEL_ID)) return;
    const host = document.createElement("div");
    host.id = PANEL_ID;
    host.style.cssText = [
      "position:fixed",
      "right:18px",
      "bottom:18px",
      "z-index:2147483647",
      "width:190px",
      "padding:10px",
      "border:1px solid rgba(15,23,42,.14)",
      "border-radius:8px",
      "background:#fff",
      "box-shadow:0 12px 32px rgba(15,23,42,.16)",
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif",
      "color:#172033",
    ].join(";");
    host.innerHTML = `
      <div style="font-size:13px;font-weight:700;margin-bottom:8px;">学习通导题导出</div>
      <button data-export style="width:100%;height:34px;border:0;border-radius:6px;background:#246bfe;color:#fff;font-weight:700;cursor:pointer;">后台导出 Excel</button>
      <button data-debug style="width:100%;height:30px;margin-top:7px;border:1px solid #d7dce5;border-radius:6px;background:#fff;color:#172033;font-weight:600;cursor:pointer;">导出调试 JSON</button>
      <div data-status style="min-height:34px;margin-top:8px;padding:7px;border-radius:6px;background:#f6f8fb;color:#566173;font-size:12px;line-height:17px;">提交后在详情页点击导出</div>
    `;
    document.documentElement.appendChild(host);
    host.querySelector("[data-export]").addEventListener("click", exportExcelFromBackend);
    host.querySelector("[data-debug]").addEventListener("click", exportDebugJson);
  }

  async function exportExcelFromBackend() {
    try {
      setStatus("正在读取后台源码...");
      const html = await fetchCurrentHtml();
      const questions = parseQuestionsFromHtml(html);
      if (!questions.length) throw new Error("没有解析到题目");
      const rows = questions.map(toTemplateRow);
      const blob = createTemplateXlsxBlob(rows);
      downloadBlob(`学习通导题-${dateStamp()}.xlsx`, blob);
      const stats = countByType(questions);
      const emptyAnswerCount = questions.filter((item) => !item.correctAnswer).length;
      setStatus(`已导出 ${questions.length} 题：单选 ${stats["单选题"] || 0}，多选 ${stats["多选题"] || 0}，判断 ${stats["判断题"] || 0}${emptyAnswerCount ? `，${emptyAnswerCount} 题答案留空` : ""}`);
    } catch (error) {
      console.error(error);
      setStatus(`导出失败：${error.message || error}`);
    }
  }

  async function exportDebugJson() {
    try {
      setStatus("正在生成调试 JSON...");
      const html = await fetchCurrentHtml();
      const questions = parseQuestionsFromHtml(html);
      downloadBlob(
        `学习通导题调试-${dateStamp()}.json`,
        new Blob([JSON.stringify(questions, null, 2)], { type: "application/json;charset=utf-8" })
      );
      setStatus(`已导出 ${questions.length} 题调试 JSON`);
    } catch (error) {
      console.error(error);
      setStatus(`调试导出失败：${error.message || error}`);
    }
  }

  async function fetchCurrentHtml() {
    const response = await fetch(location.href, {
      credentials: "include",
      cache: "no-store",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    if (!response.ok) throw new Error(`后台返回 ${response.status}`);
    const text = await response.text();
    if (!/questionLi|rightAnswerContent/.test(text)) return document.documentElement.outerHTML;
    return text;
  }

  function parseQuestionsFromHtml(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return Array.from(doc.querySelectorAll(".questionLi"))
      .map(parseQuestionElement)
      .filter(Boolean);
  }

  function parseQuestionElement(element) {
    const title = element.querySelector(".mark_name");
    const metaText = cleanText(title?.querySelector(".colorShallow")?.textContent || "");
    const questionText = cleanQuestion(title?.querySelector(".qtContent")?.textContent || title?.textContent || "");
    const type = detectType(metaText);
    const options = Array.from(element.querySelectorAll(".mark_letter li"))
      .map((item) => parseOption(item.textContent || ""))
      .filter(Boolean);
    const correctAnswerRaw = cleanText(element.querySelector(".rightAnswerContent")?.textContent || "");
    const correctAnswer = formatCorrectAnswer(correctAnswerRaw, type, options);
    const analysis = cleanText(element.querySelector(".analysis, .answerAnalysis, .mark_analysis, .qtAnalysis")?.textContent || "");

    if (!questionText) return null;
    return { type, question: questionText, correctAnswer, analysis, options };
  }

  function parseOption(text) {
    const cleaned = cleanText(text);
    const match = cleaned.match(/^([A-G])[\.\、．]?\s*([\s\S]*)$/i);
    if (!match) return null;
    const label = match[1].toUpperCase();
    let optionText = cleanText(match[2]);
    optionText = optionText.replace(new RegExp(`^${label}[\\.、．]\\s*`, "i"), "");
    return { label, text: optionText };
  }

  function detectType(metaText) {
    if (/多选/.test(metaText)) return "多选题";
    if (/判断/.test(metaText)) return "判断题";
    if (/填空/.test(metaText)) return "填空题";
    if (/简答|问答/.test(metaText)) return "问答题";
    if (/单选/.test(metaText)) return "单选题";
    return "未知题型";
  }

  function formatCorrectAnswer(answer, type, options) {
    const cleaned = cleanText(answer).toUpperCase();
    if (!cleaned) return "";
    if (type === "判断题") return normalizeJudgementAnswer(cleaned, options);
    if (options.length > 0 || /选题/.test(type)) return extractLetters(cleaned, options) || cleaned;
    return cleanText(answer);
  }

  function normalizeJudgementAnswer(answer, options) {
    if (/^(正确|对|√|Y|YES|TRUE)$/.test(answer)) return "正确";
    if (/^(错误|错|×|X|N|NO|FALSE)$/.test(answer)) return "错误";
    const letters = extractLetters(answer, options);
    if (letters.length === 1) {
      const option = options.find((item) => item.label === letters);
      if (option && /正确|对|√|是|Y/i.test(option.text)) return "正确";
      if (option && /错误|错|×|否|N/i.test(option.text)) return "错误";
    }
    return answer;
  }

  function extractLetters(answer, options) {
    const compact = answer.replace(/\s+/g, "");
    if (/^[A-G]+$/.test(compact)) return uniqueLetters(compact).join("");
    const matched = options.filter((option) => answer.includes(option.text) || option.text.includes(answer));
    return uniqueLetters(matched.map((option) => option.label).join("")).join("");
  }

  function toTemplateRow(item) {
    const optionMap = new Map(item.options.map((option) => [option.label, option.text]));
    const question = item.type === "填空题" ? fillBlankQuestion(item.question, item.correctAnswer) : item.question;
    const answer = item.type === "填空题" ? "" : item.correctAnswer;
    return [
      question,
      answer,
      item.analysis || "",
      optionMap.get("A") || "",
      optionMap.get("B") || "",
      optionMap.get("C") || "",
      optionMap.get("D") || "",
      optionMap.get("E") || "",
      optionMap.get("F") || "",
      optionMap.get("G") || "",
    ];
  }

  function fillBlankQuestion(question, answer) {
    if (!answer || /\{[^}]+\}/.test(question)) return question;
    const pattern = /_{2,}|＿+|（\s*）|\(\s*\)|\[\s*\]/;
    return pattern.test(question) ? question.replace(pattern, `{${answer}}`) : `${question}{${answer}}`;
  }

  function cleanQuestion(text) {
    return cleanText(text)
      .replace(/^\d+[\.\、．]\s*/, "")
      .replace(/^（?(?:单选题|多选题|判断题|填空题|简答题|问答题)[^）)]*）?\s*/, "");
  }

  function cleanText(text) {
    return String(text || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function countByType(questions) {
    return questions.reduce((acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + 1;
      return acc;
    }, {});
  }

  function uniqueLetters(text) {
    const seen = new Set();
    const result = [];
    for (const letter of String(text).toUpperCase()) {
      if (!/[A-G]/.test(letter) || seen.has(letter)) continue;
      seen.add(letter);
      result.push(letter);
    }
    return result;
  }

  function createTemplateXlsxBlob(rows) {
    const files = [
      ["[Content_Types].xml", xmlHeader() + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>'],
      ["_rels/.rels", xmlHeader() + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>'],
      ["docProps/core.xml", xmlHeader() + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>学习通提交结果导题导出器</dc:creator><cp:lastModifiedBy>学习通提交结果导题导出器</cp:lastModifiedBy></cp:coreProperties>'],
      ["docProps/app.xml", xmlHeader() + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>学习通提交结果导题导出器</Application></Properties>'],
      ["xl/workbook.xml", xmlHeader() + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="任选" sheetId="1" r:id="rId1"/></sheets></workbook>'],
      ["xl/_rels/workbook.xml.rels", xmlHeader() + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
      ["xl/worksheets/sheet1.xml", buildWorksheetXml(rows)],
    ].map(([name, content]) => ({ name, data: new TextEncoder().encode(content) }));
    return createZipBlob(files, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }

  function buildWorksheetXml(rows) {
    const cols = [56, 12, 42, 24, 24, 24, 24, 24, 24, 24]
      .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
      .join("");
    const rowXml = rows.map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const cells = row.map((value, colIndex) => {
        const cellValue = cleanText(value);
        if (!cellValue) return "";
        const ref = `${columnName(colIndex + 1)}${rowNumber}`;
        return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(cellValue)}</t></is></c>`;
      }).join("");
      return `<row r="${rowNumber}">${cells}</row>`;
    }).join("");
    return xmlHeader() + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A1:J${Math.max(rows.length, 1)}"/><cols>${cols}</cols><sheetData>${rowXml}</sheetData></worksheet>`;
  }

  function createZipBlob(files, mimeType) {
    const localParts = [];
    const centralParts = [];
    const now = new Date();
    const time = dosTime(now);
    const date = dosDate(now);
    let offset = 0;
    let centralSize = 0;

    for (const file of files) {
      const nameBytes = new TextEncoder().encode(file.name);
      const data = file.data;
      const crc = crc32(data);
      const localHeader = new Uint8Array(30 + nameBytes.length);
      const localView = new DataView(localHeader.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(10, time, true);
      localView.setUint16(12, date, true);
      localView.setUint32(14, crc, true);
      localView.setUint32(18, data.length, true);
      localView.setUint32(22, data.length, true);
      localView.setUint16(26, nameBytes.length, true);
      localHeader.set(nameBytes, 30);

      const centralHeader = new Uint8Array(46 + nameBytes.length);
      const centralView = new DataView(centralHeader.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(12, time, true);
      centralView.setUint16(14, date, true);
      centralView.setUint32(16, crc, true);
      centralView.setUint32(20, data.length, true);
      centralView.setUint32(24, data.length, true);
      centralView.setUint16(28, nameBytes.length, true);
      centralView.setUint32(42, offset, true);
      centralHeader.set(nameBytes, 46);

      localParts.push(localHeader, data);
      centralParts.push(centralHeader);
      offset += localHeader.length + data.length;
      centralSize += centralHeader.length;
    }

    const endRecord = new Uint8Array(22);
    const endView = new DataView(endRecord.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, offset, true);
    return new Blob([...localParts, ...centralParts, endRecord], { type: mimeType });
  }

  function crc32(data) {
    const table = crc32.table || (crc32.table = buildCrc32Table());
    let crc = 0xffffffff;
    for (const byte of data) crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
    return (crc ^ 0xffffffff) >>> 0;
  }

  function buildCrc32Table() {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      table[index] = value >>> 0;
    }
    return table;
  }

  function dosTime(date) {
    return (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  }

  function dosDate(date) {
    return ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  }

  function columnName(index) {
    let name = "";
    let value = index;
    while (value > 0) {
      const remainder = (value - 1) % 26;
      name = String.fromCharCode(65 + remainder) + name;
      value = Math.floor((value - 1) / 26);
    }
    return name;
  }

  function escapeXml(value) {
    return String(value || "")
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function xmlHeader() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  }

  function dateStamp() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  }

  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function setStatus(message) {
    const target = document.querySelector(`#${PANEL_ID} [data-status]`);
    if (target) target.textContent = message;
  }
})();
