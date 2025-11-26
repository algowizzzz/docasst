/**
 * Copyright All rights Reserved 2025-2030, Ashutosh Sinha
 * DocTableNode - Custom Lexical node for table data
 */

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
  },
  SerializedLexicalNode
>;

export class DocTableNode extends DecoratorNode<JSX.Element> {
  __data: string[][];
  __blockId: string;

  static getType(): string {
    return 'doc-table';
  }

  static clone(node: DocTableNode): DocTableNode {
    return new DocTableNode(node.__data, node.__blockId, node.__key);
  }

  constructor(data: string[][], blockId: string, key?: NodeKey) {
    super(key);
    this.__data = data;
    this.__blockId = blockId;
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
      serializedNode.blockId
    );
    return node;
  }

  exportJSON(): SerializedDocTableNode {
    return {
      data: this.__data,
      blockId: this.__blockId,
      type: 'doc-table',
      version: 1,
    };
  }

  decorate(): JSX.Element {
    return (
      <div className="doc-table-container my-4 overflow-auto">
        <table className="min-w-full divide-y divide-gray-200 border border-gray-300">
          <thead className="bg-gray-50">
            <tr>
              {this.__data[0]?.map((header, i) => (
                <th
                  key={i}
                  className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wider border-r border-gray-200 last:border-r-0"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {this.__data.slice(1).map((row, i) => (
              <tr key={i} className="hover:bg-gray-50">
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className="px-4 py-2 text-sm text-gray-900 border-r border-gray-200 last:border-r-0"
                  >
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
}

export function $createDocTableNode(
  data: string[][],
  blockId: string
): DocTableNode {
  return new DocTableNode(data, blockId);
}

export function $isDocTableNode(
  node: LexicalNode | null | undefined
): node is DocTableNode {
  return node instanceof DocTableNode;
}
