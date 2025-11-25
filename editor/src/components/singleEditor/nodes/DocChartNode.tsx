/**
 * Copyright All rights Reserved 2025-2030, Ashutosh Sinha
 * DocChartNode - Custom Lexical node for chart visualization
 */

import {
  DecoratorNode,
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical';
import React from 'react';

export interface ChartConfig {
  type: 'bar' | 'line' | 'scatter' | 'pie';
  data: {
    x: any[];
    y: any[];
    labels?: string[];
  };
  layout: {
    title: string;
    xaxis?: { title: string };
    yaxis?: { title: string };
  };
}

export type SerializedDocChartNode = Spread<
  {
    chartConfig: ChartConfig;
    blockId: string;
  },
  SerializedLexicalNode
>;

export class DocChartNode extends DecoratorNode<JSX.Element> {
  __chartConfig: ChartConfig;
  __blockId: string;

  static getType(): string {
    return 'doc-chart';
  }

  static clone(node: DocChartNode): DocChartNode {
    return new DocChartNode(node.__chartConfig, node.__blockId, node.__key);
  }

  constructor(chartConfig: ChartConfig, blockId: string, key?: NodeKey) {
    super(key);
    this.__chartConfig = chartConfig;
    this.__blockId = blockId;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const div = document.createElement('div');
    div.className = 'doc-chart-wrapper';
    return div;
  }

  updateDOM(): boolean {
    return false;
  }

  static importJSON(serializedNode: SerializedDocChartNode): DocChartNode {
    const node = $createDocChartNode(
      serializedNode.chartConfig,
      serializedNode.blockId
    );
    return node;
  }

  exportJSON(): SerializedDocChartNode {
    return {
      chartConfig: this.__chartConfig,
      blockId: this.__blockId,
      type: 'doc-chart',
      version: 1,
    };
  }

  decorate(): JSX.Element {
    return <ChartComponent config={this.__chartConfig} />;
  }

  getChartConfig(): ChartConfig {
    return this.__chartConfig;
  }

  getBlockId(): string {
    return this.__blockId;
  }

  setChartConfig(config: ChartConfig): void {
    const writable = this.getWritable();
    writable.__chartConfig = config;
  }
}

// Simple chart component (can be replaced with Plotly/Recharts later)
function ChartComponent({ config }: { config: ChartConfig }) {
  const { type, data, layout } = config;

  // Simple bar chart visualization
  if (type === 'bar') {
    const max = Math.max(...data.y.map(v => Number(v)));

    return (
      <div className="doc-chart-container my-4 p-4 bg-gray-50 rounded border border-gray-200">
        <h3 className="text-sm font-semibold mb-3">{layout.title}</h3>
        <div className="space-y-2">
          {data.x.map((label, i) => {
            const value = Number(data.y[i]);
            const percentage = (value / max) * 100;

            return (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-gray-600 w-20 truncate">
                  {label}
                </span>
                <div className="flex-1 bg-gray-200 rounded h-6 relative overflow-hidden">
                  <div
                    className="bg-blue-500 h-full rounded flex items-center justify-end pr-2"
                    style={{ width: `${percentage}%` }}
                  >
                    <span className="text-xs text-white font-medium">
                      {value}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {layout.xaxis && (
          <p className="text-xs text-gray-500 mt-2">{layout.xaxis.title}</p>
        )}
      </div>
    );
  }

  // Simple line chart visualization
  if (type === 'line') {
    return (
      <div className="doc-chart-container my-4 p-4 bg-gray-50 rounded border border-gray-200">
        <h3 className="text-sm font-semibold mb-3">{layout.title}</h3>
        <div className="text-xs text-gray-600 font-mono">
          {data.x.map((label, i) => (
            <div key={i} className="flex justify-between py-1">
              <span>{label}</span>
              <span className="font-semibold">{data.y[i]}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Fallback: show data as list
  return (
    <div className="doc-chart-container my-4 p-4 bg-gray-50 rounded border border-gray-200">
      <h3 className="text-sm font-semibold mb-3">{layout.title}</h3>
      <div className="text-xs text-gray-600">
        <p>Chart type: {type}</p>
        <pre className="mt-2 overflow-auto">
          {JSON.stringify({ data, layout }, null, 2)}
        </pre>
      </div>
    </div>
  );
}

export function $createDocChartNode(
  chartConfig: ChartConfig,
  blockId: string
): DocChartNode {
  return new DocChartNode(chartConfig, blockId);
}

export function $isDocChartNode(
  node: LexicalNode | null | undefined
): node is DocChartNode {
  return node instanceof DocChartNode;
}
