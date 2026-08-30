import React from 'react';
import { Table2 } from 'lucide-react';
import { DataTable } from '../../types';

// Any subject, data-heavy content (and Geography's fact_sheet_table, which
// reuses this same shape with a different title). Responsive: the table
// itself scrolls horizontally rather than squeezing columns unreadably
// small on a phone.
export default function DataTableBlock({ table, title = 'Data' }: { table?: DataTable; title?: string }) {
  if (!table || !table.headers?.length || !table.rows?.length) return null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 space-y-2.5 overflow-x-auto">
      <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
        <Table2 className="w-3.5 h-3.5" /> {title}
      </p>
      <table className="text-xs w-full min-w-[280px] border-collapse">
        <thead>
          <tr>
            {table.headers.map((h, i) => (
              <th
                key={i}
                className="text-left text-slate-400 font-semibold pb-1.5 px-2.5 border-b border-slate-100 dark:border-slate-800 whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, ri) => (
            <tr key={ri} className={ri % 2 === 1 ? 'bg-slate-50/60 dark:bg-slate-800/40' : ''}>
              {row.map((cell, ci) => (
                <td key={ci} className="text-slate-600 dark:text-slate-300 px-2.5 py-1.5 whitespace-nowrap">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
