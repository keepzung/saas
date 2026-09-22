import * as XLSX from 'xlsx';

/**
 * 导出多 sheet Excel
 * @param {Array<{name: string, rows: Array<object>}>} sheets
 *   每个 sheet：name = 页签名，rows = 对象数组（键为列头）
 * @param {string} filename 文件名（不含扩展名）
 */
export function exportExcel(sheets, filename) {
  const wb = XLSX.utils.book_new();
  for (const { name, rows } of sheets) {
    const ws = XLSX.utils.json_to_sheet(rows ?? []);
    XLSX.utils.book_append_sheet(wb, ws, (name ?? 'Sheet').slice(0, 31));
  }
  XLSX.writeFile(wb, `${filename}_${formatDate()}.xlsx`);
}

function formatDate() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}
