import React from 'react';

export function Table({ className = '', children, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto rounded-[12px] border border-line bg-paper">
      <table className={`aegis-table text-left text-[13.5px] ${className}`} {...props}>{children}</table>
    </div>
  );
}

export function TableCaption({ className = '', ...props }: React.HTMLAttributes<HTMLTableCaptionElement>) {
  return <caption className={`px-4 py-3 text-left font-mono text-[11px] uppercase tracking-[0.1em] text-muted ${className}`} {...props} />;
}

export function TableHead({ className = '', ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" className={`px-4 py-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted ${className}`} {...props} />;
}

export function TableCell({ className = '', ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={`border-t border-line px-4 py-3 align-middle text-ink ${className}`} {...props} />;
}

export function TableRow({ className = '', ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={`transition-colors hover:bg-elevated/40 ${className}`} {...props} />;
}

export function TableHeader({ className = '', ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={className} {...props} />;
}

export function TableBody({ className = '', ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...props} />;
}
