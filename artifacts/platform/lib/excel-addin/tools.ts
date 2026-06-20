/**
 * Atomic Excel tool catalogue for the Finsyt agentic build loop.
 *
 * Inspired by the sv-excel-agent MCP pattern: instead of a handful of
 * coarse `propose_*` suggestions, the Excel surface exposes a wide set of
 * small, composable operations the model can chain to autonomously build a
 * whole model (3-statement, DCF, comps, …) from a single instruction.
 *
 * These tools have NO server-side `run`. When the model calls one, the
 * shared `runAgent` loop:
 *   1. emits an `event: excel_op` SSE frame `{ id, tool, args }`,
 *   2. awaits the task pane executing it via Office.js and POSTing the
 *      result back to `/api/v1/agent/tool-result`,
 *   3. feeds that real result (success / error / read payload) back to the
 *      model so it can decide its next step.
 *
 * `kind` lets the client know whether an op mutates the workbook (so the
 * preview/approve guard can gate bulk writes) or is a pure read whose
 * payload the model needs back.
 */

export type ExcelToolKind = "read" | "write" | "structure";

export interface ExcelToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /** read = no mutation; write = cell mutation; structure = sheet-level change. */
  kind: ExcelToolKind;
}

const cellMatrix = {
  type: "array",
  items: { type: "array", items: { type: ["string", "number", "boolean", "null"] } },
  description: "2-D matrix of cell values. Strings beginning with = are treated as formulas.",
} as const;

export const EXCEL_TOOLS: ExcelToolDef[] = [
  // ── Value / formula writes ───────────────────────────────────────────────
  {
    name: "write_cell",
    kind: "write",
    description: "Write a single value or formula into one cell.",
    parameters: {
      type: "object",
      properties: {
        sheet: { type: "string", description: "Sheet name. Defaults to the active sheet." },
        cell: { type: "string", description: "Cell reference, e.g. B4." },
        value: { type: ["string", "number", "boolean", "null"], description: "Value, or a formula starting with =." },
      },
      required: ["cell", "value"],
    },
  },
  {
    name: "write_range",
    kind: "write",
    description: "Write a rectangular block of values/formulas starting at a top-left anchor cell.",
    parameters: {
      type: "object",
      properties: {
        sheet: { type: "string", description: "Sheet name. Defaults to the active sheet." },
        anchor: { type: "string", description: "Top-left cell of the block, e.g. A1." },
        values: cellMatrix,
      },
      required: ["anchor", "values"],
    },
  },
  {
    name: "insert_formula",
    kind: "write",
    description: "Insert one formula into a target cell. Use for a single calculated cell.",
    parameters: {
      type: "object",
      properties: {
        sheet: { type: "string" },
        cell: { type: "string", description: "Target cell, e.g. C10." },
        formula: { type: "string", description: "Formula INCLUDING the leading = sign." },
      },
      required: ["cell", "formula"],
    },
  },
  {
    name: "write_header_row",
    kind: "write",
    description: "Write a styled header row (bold) of column labels starting at an anchor cell.",
    parameters: {
      type: "object",
      properties: {
        sheet: { type: "string" },
        anchor: { type: "string", description: "Left-most header cell, e.g. A1." },
        headers: { type: "array", items: { type: "string" }, description: "Ordered column labels." },
      },
      required: ["anchor", "headers"],
    },
  },
  {
    name: "write_bulk_rows",
    kind: "write",
    description: "Append many data rows under an anchor cell in one shot. Use for large tabular data (>1 row).",
    parameters: {
      type: "object",
      properties: {
        sheet: { type: "string" },
        anchor: { type: "string", description: "Top-left cell where the first row lands." },
        rows: cellMatrix,
      },
      required: ["anchor", "rows"],
    },
  },
  {
    name: "clear_range",
    kind: "write",
    description: "Clear contents and formatting from a range.",
    parameters: {
      type: "object",
      properties: {
        sheet: { type: "string" },
        range: { type: "string", description: "Range to clear, e.g. A1:F20." },
      },
      required: ["range"],
    },
  },

  // ── Formatting ───────────────────────────────────────────────────────────
  {
    name: "apply_number_format",
    kind: "write",
    description: "Apply a number format string to a range (e.g. \"$#,##0.00\", \"0.0%\", \"#,##0\").",
    parameters: {
      type: "object",
      properties: {
        sheet: { type: "string" },
        range: { type: "string", description: "Range, e.g. B2:B20." },
        format: { type: "string", description: "Excel number-format code." },
      },
      required: ["range", "format"],
    },
  },
  {
    name: "apply_fill_color",
    kind: "write",
    description: "Set the background fill color of a range using a hex color.",
    parameters: {
      type: "object",
      properties: {
        sheet: { type: "string" },
        range: { type: "string" },
        color: { type: "string", description: "Hex color, e.g. #FFF2CC." },
      },
      required: ["range", "color"],
    },
  },
  {
    name: "apply_font_style",
    kind: "write",
    description: "Apply font styling (bold/italic/underline/size/color) to a range.",
    parameters: {
      type: "object",
      properties: {
        sheet: { type: "string" },
        range: { type: "string" },
        bold: { type: "boolean" },
        italic: { type: "boolean" },
        underline: { type: "boolean" },
        size: { type: "number" },
        color: { type: "string", description: "Hex font color, e.g. #1B4FFF." },
      },
      required: ["range"],
    },
  },
  {
    name: "apply_border",
    kind: "write",
    description: "Apply borders to a range.",
    parameters: {
      type: "object",
      properties: {
        sheet: { type: "string" },
        range: { type: "string" },
        edges: {
          type: "string",
          enum: ["all", "outline", "bottom", "top"],
          description: "Which edges to border. Defaults to all.",
        },
        style: { type: "string", enum: ["thin", "medium", "thick", "double"], description: "Line style. Defaults to thin." },
      },
      required: ["range"],
    },
  },
  {
    name: "apply_conditional_format",
    kind: "write",
    description: "Add a conditional-format rule (cell-value comparison or color scale) to a range.",
    parameters: {
      type: "object",
      properties: {
        sheet: { type: "string" },
        range: { type: "string" },
        type: { type: "string", enum: ["colorScale", "cellValue", "dataBar"], description: "Rule type." },
        operator: {
          type: "string",
          enum: ["greaterThan", "lessThan", "between", "equalTo"],
          description: "For cellValue rules.",
        },
        value: { type: ["string", "number"], description: "Threshold for cellValue rules." },
        color: { type: "string", description: "Highlight hex color for cellValue rules." },
      },
      required: ["range", "type"],
    },
  },
  {
    name: "auto_fit_columns",
    kind: "write",
    description: "Auto-fit column widths to their contents for a range (or the whole used range if omitted).",
    parameters: {
      type: "object",
      properties: {
        sheet: { type: "string" },
        range: { type: "string", description: "Range whose columns to autofit. Optional." },
      },
    },
  },
  {
    name: "set_column_width",
    kind: "write",
    description: "Set an explicit column width (in points) for a column range.",
    parameters: {
      type: "object",
      properties: {
        sheet: { type: "string" },
        columns: { type: "string", description: "Column range, e.g. A:C." },
        width: { type: "number", description: "Width in points." },
      },
      required: ["columns", "width"],
    },
  },
  {
    name: "set_row_height",
    kind: "write",
    description: "Set an explicit row height (in points) for a row range.",
    parameters: {
      type: "object",
      properties: {
        sheet: { type: "string" },
        rows: { type: "string", description: "Row range, e.g. 1:3." },
        height: { type: "number", description: "Height in points." },
      },
      required: ["rows", "height"],
    },
  },
  {
    name: "merge_cells",
    kind: "write",
    description: "Merge a range of cells into one (optionally centered).",
    parameters: {
      type: "object",
      properties: {
        sheet: { type: "string" },
        range: { type: "string" },
        across: { type: "boolean", description: "Merge each row separately instead of the whole block." },
      },
      required: ["range"],
    },
  },
  {
    name: "apply_freeze_panes",
    kind: "write",
    description: "Freeze rows and/or columns so headers stay visible while scrolling.",
    parameters: {
      type: "object",
      properties: {
        sheet: { type: "string" },
        rows: { type: "number", description: "Number of top rows to freeze." },
        columns: { type: "number", description: "Number of left columns to freeze." },
      },
    },
  },
  {
    name: "set_validation",
    kind: "write",
    description: "Add data validation (dropdown list or numeric range) to a range.",
    parameters: {
      type: "object",
      properties: {
        sheet: { type: "string" },
        range: { type: "string" },
        list: { type: "array", items: { type: "string" }, description: "Allowed values for a dropdown." },
        min: { type: "number" },
        max: { type: "number" },
      },
      required: ["range"],
    },
  },

  // ── Tables, charts, structure ────────────────────────────────────────────
  {
    name: "insert_named_table",
    kind: "write",
    description: "Convert a populated range into a native Excel table with a name and header row.",
    parameters: {
      type: "object",
      properties: {
        sheet: { type: "string" },
        range: { type: "string", description: "Range that includes the header row, e.g. A1:E20." },
        name: { type: "string", description: "Table name (letters/numbers/underscore)." },
        hasHeaders: { type: "boolean", description: "Whether the first row is a header. Defaults to true." },
      },
      required: ["range"],
    },
  },
  {
    name: "insert_chart",
    kind: "write",
    description: "Insert a chart bound to a data range.",
    parameters: {
      type: "object",
      properties: {
        sheet: { type: "string" },
        dataRange: { type: "string", description: "Range to plot, e.g. A1:B12." },
        chartType: {
          type: "string",
          enum: ["columnClustered", "line", "pie", "barClustered", "area", "scatter"],
          description: "Chart type. Defaults to columnClustered.",
        },
        title: { type: "string" },
      },
      required: ["dataRange"],
    },
  },
  {
    name: "add_sheet",
    kind: "structure",
    description: "Add a new worksheet (optionally activate it).",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "New sheet name." },
        activate: { type: "boolean", description: "Activate the new sheet. Defaults to true." },
      },
      required: ["name"],
    },
  },
  {
    name: "rename_sheet",
    kind: "structure",
    description: "Rename an existing worksheet.",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "Current sheet name. Defaults to the active sheet." },
        to: { type: "string", description: "New name." },
      },
      required: ["to"],
    },
  },
  {
    name: "protect_sheet",
    kind: "structure",
    description: "Toggle worksheet protection to lock the layout against accidental edits.",
    parameters: {
      type: "object",
      properties: {
        sheet: { type: "string" },
        protect: { type: "boolean", description: "true to protect, false to unprotect. Defaults to true." },
      },
    },
  },

  // ── Reads (payload returned to the model) ────────────────────────────────
  {
    name: "read_range",
    kind: "read",
    description: "Read the current values of a range so you can reason about what is already in the sheet.",
    parameters: {
      type: "object",
      properties: {
        sheet: { type: "string" },
        range: { type: "string", description: "Range to read, e.g. A1:F20." },
      },
      required: ["range"],
    },
  },
  {
    name: "get_sheet_names",
    kind: "read",
    description: "List the names of every worksheet in the workbook.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_used_range",
    kind: "read",
    description: "Get the address and dimensions of the used range on a sheet so you know where existing data ends.",
    parameters: {
      type: "object",
      properties: {
        sheet: { type: "string", description: "Sheet name. Defaults to the active sheet." },
      },
    },
  },
];

export const EXCEL_TOOL_NAMES = new Set(EXCEL_TOOLS.map((t) => t.name));

const EXCEL_TOOL_KINDS = new Map<string, ExcelToolKind>(
  EXCEL_TOOLS.map((t) => [t.name, t.kind]),
);

export function isExcelOpTool(name: string): boolean {
  return EXCEL_TOOL_NAMES.has(name);
}

export function excelOpKind(name: string): ExcelToolKind | undefined {
  return EXCEL_TOOL_KINDS.get(name);
}

/** A mutating op (write or structure) — i.e. one the preview/approve guard gates. */
export function isExcelMutatingTool(name: string): boolean {
  const kind = EXCEL_TOOL_KINDS.get(name);
  return kind === "write" || kind === "structure";
}
