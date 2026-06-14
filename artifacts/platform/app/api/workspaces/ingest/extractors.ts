/**
 * Document text extractors used by the workspace ingest pipeline.
 *
 * Each extractor takes a raw `Buffer` (the file body) and returns plain
 * text. Failures collapse to "" so the upstream caller can surface a
 * graceful "no text extracted" status instead of a 500.
 *
 * - DOCX: parsed with `mammoth` (paragraph-aware text extraction).
 * - PPTX: parsed by unzipping with JSZip and pulling `<a:t>` runs from
 *   each `ppt/slides/slide*.xml`. Slides are joined with form-feeds so
 *   the chunker keeps slide boundaries.
 * - XLSX: parsed with `exceljs` — every non-empty cell across every sheet
 *   is emitted as `Sheet | Address: value`. Numbers / dates / formulas
 *   collapse to their displayed value when available.
 *
 * We avoid any heavy OCR fallback — that's explicitly out of scope.
 */

export async function extractDocxText(buffer: Buffer): Promise<string> {
  try {
    const mammoth = await import("mammoth")
    const result = await mammoth.extractRawText({ buffer })
    return (result?.value || "").toString()
  } catch {
    return ""
  }
}

export async function extractPptxText(buffer: Buffer): Promise<string> {
  try {
    const JSZipMod = await import("jszip")
    const JSZip = (JSZipMod as { default?: typeof import("jszip") }).default || (JSZipMod as unknown as typeof import("jszip"))
    const zip = await JSZip.loadAsync(buffer)
    const slideEntries = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
      .sort((a, b) => {
        const na = Number((a.match(/slide(\d+)/i) || [])[1] || 0)
        const nb = Number((b.match(/slide(\d+)/i) || [])[1] || 0)
        return na - nb
      })

    const slides: string[] = []
    for (let i = 0; i < slideEntries.length; i++) {
      const xml = await zip.files[slideEntries[i]].async("string")
      const runs = xml.match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g) || []
      const text = runs
        .map((r) => r.replace(/<a:t[^>]*>/, "").replace(/<\/a:t>$/, ""))
        .map((t) =>
          t
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n))),
        )
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
      if (text) slides.push(`[Slide ${i + 1}] ${text}`)
    }
    return slides.join("\n\n")
  } catch {
    return ""
  }
}

export async function extractXlsxText(buffer: Buffer): Promise<string> {
  try {
    const ExcelJSMod = await import("exceljs")
    const ExcelJS = (ExcelJSMod as { default?: typeof import("exceljs") }).default || (ExcelJSMod as unknown as typeof import("exceljs"))
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer as unknown as ArrayBuffer)
    const lines: string[] = []
    wb.eachSheet((sheet) => {
      const sheetName = sheet.name || `Sheet${sheet.id}`
      sheet.eachRow({ includeEmpty: false }, (row, rowIdx) => {
        row.eachCell({ includeEmpty: false }, (cell, colIdx) => {
          let value: unknown = cell.value
          // ExcelJS represents formulas / rich text / dates as objects.
          if (value && typeof value === "object") {
            const v = value as { result?: unknown; richText?: Array<{ text?: string }>; text?: string }
            if (v.richText) value = v.richText.map((r) => r.text || "").join("")
            else if ("result" in v && v.result != null) value = v.result
            else if ("text" in v && v.text != null) value = v.text
            else value = JSON.stringify(value)
          }
          if (value === null || value === undefined || value === "") return
          const colLetter = colIndexToLetter(colIdx)
          lines.push(`${sheetName} | ${colLetter}${rowIdx}: ${String(value)}`)
        })
      })
    })
    return lines.join("\n")
  } catch {
    return ""
  }
}

function colIndexToLetter(n: number): string {
  let s = ""
  let i = n
  while (i > 0) {
    const r = (i - 1) % 26
    s = String.fromCharCode(65 + r) + s
    i = Math.floor((i - 1) / 26)
  }
  return s || "A"
}
