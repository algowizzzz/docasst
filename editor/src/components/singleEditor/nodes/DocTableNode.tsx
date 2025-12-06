/**
 * Copyright All rights Reserved 2025-2030, Ashutosh Sinha
 * DocTableNode - Custom Lexical node for table data
 */

import React from 'react';
import {
  DecoratorNode,
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical';

export type SerializedDocTableNode = Spread<
  {
    data: string[][];
    blockId: string;
    columnWidths?: number[];
    columnAlignments?: string[];
  },
  SerializedLexicalNode
>;

export class DocTableNode extends DecoratorNode<JSX.Element> {
  __data: string[][];
  __blockId: string;
  __columnWidths?: number[];
  __columnAlignments?: string[];

  static getType(): string {
    return 'doc-table';
  }

  static clone(node: DocTableNode): DocTableNode {
    return new DocTableNode(
      node.__data, 
      node.__blockId, 
      node.__key,
      node.__columnWidths,
      node.__columnAlignments
    );
  }

  constructor(
    data: string[][], 
    blockId: string, 
    key?: NodeKey,
    columnWidths?: number[],
    columnAlignments?: string[]
  ) {
    super(key);
    this.__data = data;
    this.__blockId = blockId;
    this.__columnWidths = columnWidths;
    this.__columnAlignments = columnAlignments;
    
    // Log when node is created to verify data is received
    console.log('[DocTableNode] Constructor called:', {
      blockId,
      dataLength: data?.length || 0,
      dataFirstRow: data?.[0],
      dataSample: data?.slice(0, 2),
      columnWidths: columnWidths?.length || 0,
      columnAlignments: columnAlignments?.length || 0,
      key,
    });
  }

  createDOM(config: EditorConfig): HTMLElement {
    const div = document.createElement('div');
    div.className = 'doc-table-wrapper';
    return div;
  }

  updateDOM(): boolean {
    return false;
  }

  static importJSON(serializedNode: SerializedDocTableNode): DocTableNode {
    const node = $createDocTableNode(
      serializedNode.data,
      serializedNode.blockId,
      serializedNode.columnWidths,
      serializedNode.columnAlignments
    );
    return node;
  }

  exportJSON(): SerializedDocTableNode {
    return {
      data: this.__data,
      blockId: this.__blockId,
      columnWidths: this.__columnWidths,
      columnAlignments: this.__columnAlignments,
      type: 'doc-table',
      version: 1,
    };
  }

  decorate(): JSX.Element {
    // Log when decorate is called (rendering time)
    console.log('[DocTableNode] decorate() called:', {
      blockId: this.__blockId,
      hasData: !!this.__data,
      dataLength: this.__data?.length || 0,
      dataFirstRow: this.__data?.[0],
      dataType: Array.isArray(this.__data) ? 'array' : typeof this.__data,
      columnWidths: this.__columnWidths?.length || 0,
      columnAlignments: this.__columnAlignments?.length || 0,
    });
    
    // Ensure we have data
    if (!this.__data || this.__data.length === 0) {
      console.error('[DocTableNode] ❌ No table data available!', {
        blockId: this.__blockId,
        data: this.__data,
        dataType: typeof this.__data,
        isArray: Array.isArray(this.__data),
      });
      return (
        <div className="doc-table-container my-4" style={{ width: '100%', display: 'block' }}>
          <table className="min-w-full">
            <tbody>
              <tr>
                <td className="px-2 py-1 text-sm text-red-500">[Empty table - no data]</td>
              </tr>
            </tbody>
          </table>
        </div>
      );
    }
    
    const headerRow = this.__data[0] || [];
    const dataRows = this.__data.slice(1);
    
    // Debug logging
    console.log('[DocTableNode] Extracted header and rows:', {
      blockId: this.__blockId,
      headerRowLength: headerRow.length,
      headerRowContent: headerRow,
      dataRowsCount: dataRows.length,
      firstDataRow: dataRows[0],
    });
    
    if (headerRow.length === 0) {
      console.error('[DocTableNode] ❌ Header row is empty!', {
        blockId: this.__blockId,
        dataLength: this.__data.length,
        firstRow: this.__data[0],
        firstRowType: typeof this.__data[0],
        firstRowIsArray: Array.isArray(this.__data[0]),
        allData: this.__data,
      });
    }
    
    // Check if we have column widths - if so, use fixed table layout
    const hasColumnWidths = this.__columnWidths && this.__columnWidths.length > 0;
    
    // Get width and alignment for each column
    const getColumnStyle = (index: number): React.CSSProperties => {
      const style: React.CSSProperties = {};
      
      // Apply width if available (as percentage)
      if (this.__columnWidths && this.__columnWidths[index] !== undefined) {
        style.width = `${this.__columnWidths[index] * 100}%`;
      }
      
      // Apply alignment
      const alignment = this.__columnAlignments?.[index] || 'left';
      style.textAlign = alignment as 'left' | 'right' | 'center' | 'justify';
      
      return style;
    };
    
    // Table style - use fixed layout if we have column widths
    const tableStyle: React.CSSProperties = {
      width: '100%',
      tableLayout: hasColumnWidths ? 'fixed' : 'auto',
    };
    
    // Ensure header row exists
    if (headerRow.length === 0) {
      console.error('[DocTableNode] Cannot render table without header row');
      return (
        <div className="doc-table-container my-4" style={{ width: '100%', display: 'block' }}>
          <div className="text-sm text-red-500">[Table error: Missing header row]</div>
        </div>
      );
    }
    
    return (
      <div className="doc-table-container my-4" style={{ width: '100%', display: 'block' }}>
        <table className="min-w-full" style={tableStyle}>
          <colgroup>
            {headerRow.map((_, i) => {
              const colStyle: React.CSSProperties = {};
              if (this.__columnWidths && this.__columnWidths[i] !== undefined) {
                colStyle.width = `${this.__columnWidths[i] * 100}%`;
              }
              return <col key={i} style={colStyle} />;
            })}
          </colgroup>
          <thead>
            <tr>
              {headerRow.map((header, i) => (
                <th
                  key={i}
                  className="px-2 py-1 text-sm font-semibold"
                  style={getColumnStyle(i)}
                >
                  {String(header || '')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataRows.length > 0 ? (
              dataRows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td
                      key={j}
                      className="px-2 py-1 text-sm"
                      style={getColumnStyle(j)}
                    >
                      {String(cell || '')}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={headerRow.length} className="px-2 py-1 text-sm text-gray-400 text-center">
                  [No data rows]
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  getData(): string[][] {
    return this.__data;
  }

  getBlockId(): string {
    return this.__blockId;
  }

  setData(data: string[][]): void {
    const writable = this.getWritable();
    writable.__data = data;
  }
  
  getColumnWidths(): number[] | undefined {
    return this.__columnWidths;
  }
  
  getColumnAlignments(): string[] | undefined {
    return this.__columnAlignments;
  }
}

export function $createDocTableNode(
  data: string[][],
  blockId: string,
  columnWidths?: number[],
  columnAlignments?: string[]
): DocTableNode {
  // Log when factory function is called
  console.log('[DocTableNode] $createDocTableNode called:', {
    blockId,
    dataLength: data?.length || 0,
    dataFirstRow: data?.[0],
    dataSample: data?.slice(0, 2),
    columnWidths: columnWidths?.length || 0,
    columnAlignments: columnAlignments?.length || 0,
    stackTrace: new Error().stack?.split('\n').slice(1, 4).join('\n'), // Show caller
  });
  
  return new DocTableNode(data, blockId, undefined, columnWidths, columnAlignments);
}

export function $isDocTableNode(
  node: LexicalNode | null | undefined
): node is DocTableNode {
  return node instanceof DocTableNode;
}
