// Plugin to initialize Lexical editor from DocState

import { useEffect, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot } from 'lexical';
import type { DocState, DocBlock, TextRun } from '@/model/docTypes';
import { $createDocHeadingNode } from '../nodes/DocHeadingNode';
import { $createDocParagraphNode } from '../nodes/DocParagraphNode';
import { $createAiTextNode } from '../nodes/AiTextNode';
import { $createDocListNode } from '../nodes/DocListNode';
import { $createDocListItemNode } from '../nodes/DocListItemNode';
import { $createDocCodeNode } from '../nodes/DocCodeNode';
import { $createDocQuoteNode } from '../nodes/DocQuoteNode';
import { $createDocDividerNode } from '../nodes/DocDividerNode';
import { $createDocImageNode } from '../nodes/DocImageNode';
import { $createDocEmptyNode } from '../nodes/DocEmptyNode';
import { $createDocTableNode } from '../nodes/DocTableNode';

interface DocInitializerPluginProps {
  initialDoc: DocState;
}

export function DocInitializerPlugin({ initialDoc }: DocInitializerPluginProps) {
  const [editor] = useLexicalComposerContext();
  const initializedRef = useRef(false);

  useEffect(() => {
    // Only initialize once when component mounts
    if (initializedRef.current) return;
    initializedRef.current = true;

    console.log('[DocInitializerPlugin] Initializing editor with', initialDoc.blocks.length, 'blocks');
    console.log('[DocInitializerPlugin] First block sample:', JSON.stringify(initialDoc.blocks[0], null, 2));
    if (initialDoc.blocks[0]?.text) {
      console.log('[DocInitializerPlugin] First block text runs:', initialDoc.blocks[0].text);
    }

    editor.update(() => {
      const root = $getRoot();
      root.clear();

      let nodesCreated = 0;
      const blockIdsInEditor: string[] = [];
      
      for (let i = 0; i < initialDoc.blocks.length; i++) {
        const block = initialDoc.blocks[i];
        const metadata = (block as any).metadata;
        const isFootnote = metadata?.is_footnote;
        
        // Add divider before footnote if previous block was not a footnote
        if (isFootnote && i > 0) {
          const prevBlock = initialDoc.blocks[i - 1];
          const prevMetadata = (prevBlock as any).metadata;
          const prevIsFootnote = prevMetadata?.is_footnote;
          
          if (!prevIsFootnote) {
            // Insert divider before first footnote
            const dividerNode = $createDocDividerNode(`${block.id}_divider`);
            root.append(dividerNode);
            nodesCreated++;
          }
        }
        
        const node = createNodeFromBlock(block);
        if (node) {
          root.append(node);
          nodesCreated++;
          
          // Add footnote class if this is a footnote paragraph
          const metadata = (block as any).metadata;
          const isFootnote = metadata?.is_footnote;
          if (isFootnote && node.getType() === 'doc-paragraph') {
            // Add class after DOM is created
            setTimeout(() => {
              const dom = editor.getElementByKey(node.getKey());
              if (dom) {
                dom.classList.add('doc-footnote');
              }
            }, 0);
          }
          
          // Collect block IDs from created nodes
          const blockId = (node as any).getBlockId?.();
          if (blockId) {
            blockIdsInEditor.push(blockId);
          }
        } else {
          console.warn('[DocInitializerPlugin] Failed to create node for block:', block);
        }
      }
      
      console.log('[DocInitializerPlugin] Created', nodesCreated, 'nodes, root children:', root.getChildrenSize());
      console.log('[DocInitializerPlugin] Block IDs in editor:', blockIdsInEditor);
      console.log('[DocInitializerPlugin] Block IDs from API:', initialDoc.blocks.map(b => b.id));
      
      // Verify all blocks have matching IDs
      const apiBlockIds = initialDoc.blocks.map(b => b.id);
      const missingInEditor = apiBlockIds.filter(id => !blockIdsInEditor.includes(id));
      const extraInEditor = blockIdsInEditor.filter(id => !apiBlockIds.includes(id));
      
      if (missingInEditor.length > 0) {
        console.warn('[DocInitializerPlugin] Block IDs from API not found in editor:', missingInEditor);
      }
      if (extraInEditor.length > 0) {
        console.warn('[DocInitializerPlugin] Block IDs in editor not in API:', extraInEditor);
      }
    });
  }, [editor, initialDoc]);

  return null;
}

// Convert DocBlock to Lexical node
function createNodeFromBlock(block: DocBlock) {
  switch (block.type) {
    case 'heading': {
      const headingNode = $createDocHeadingNode(block.level, block.id, block.sectionKey);
      // Use 'text' property (from DocState) or 'content' (legacy)
      const textRuns = (block as any).text || (block as any).content || [];
      appendTextRuns(headingNode, textRuns);
      return headingNode;
    }
    
    case 'paragraph': {
      const pNode = $createDocParagraphNode(block.id, block.sectionKey);
      const metadata = (block as any).metadata;
      const isNumbered = metadata?.is_numbered;
      const number = metadata?.number;
      
      // Use 'text' property (from DocState) or 'content' (legacy)
      let textRuns = (block as any).text || (block as any).content || [];
      
      // Prepend number for numbered paragraphs
      if (isNumbered && number) {
        // Prepend number to first text run
        if (Array.isArray(textRuns) && textRuns.length > 0) {
          const firstRun = textRuns[0];
          if (typeof firstRun === 'object' && firstRun !== null) {
            textRuns = [{
              ...firstRun,
              text: `${number} ${firstRun.text || ''}`
            }, ...textRuns.slice(1)];
          } else {
            textRuns = [{ text: `${number} ${String(firstRun)}` }, ...textRuns.slice(1)];
          }
        } else if (typeof textRuns === 'string') {
          textRuns = [{ text: `${number} ${textRuns}` }];
        } else {
          textRuns = [{ text: `${number} ` }];
        }
      }
      
      // Note: No special treatment for footnotes (just styling)
      // Divider before footnotes is handled in the initialization loop above
      // Footnote class is added in the initialization loop after node creation
      
      appendTextRuns(pNode, textRuns);
      return pNode;
    }
    
    case 'list': {
      // Handle legacy list format with proper Lexical nodes
      const items = block.items.map(item => ({
        content: typeof item === 'string' ? item : item.content?.map((t: any) => t.text).join('') || ''
      }));
      const listNode = $createDocListNode(block.id, block.listStyle, items);
      
      // Create ListItemNode children with TextNode content
      items.forEach((item) => {
        const listItemNode = $createDocListItemNode();
        const textNode = $createAiTextNode(item.content || '');
        listItemNode.append(textNode);
        listNode.append(listItemNode);
      });
      
      return listNode;
    }
    
    case 'bulleted_list':
    case 'numbered_list': {
      // Handle BlockEditor format with proper Lexical nodes and nested children
      const style = block.type === 'bulleted_list' ? 'bullet' : 'number';
      const rawItems = (block as any).items || [];
      
      // Recursively convert items preserving nested children
      const convertListItem = (item: any): { content: string; children?: Array<{ content: string }> } => {
        // Handle content that could be string, array (InlineSegment[]), or object
        let content: string = '';
        const rawContent = item.content || item.text;
        
        if (typeof rawContent === 'string') {
          content = rawContent;
        } else if (Array.isArray(rawContent)) {
          // Extract text from InlineSegment[] format
          content = rawContent.map((seg: any) => {
            if (typeof seg === 'string') return seg;
            if (typeof seg === 'object' && seg !== null) {
              return seg.text || seg.content || '';
            }
            return String(seg);
          }).join('');
        } else if (typeof rawContent === 'object' && rawContent !== null) {
          // Handle object format (extract text property)
          content = rawContent.text || rawContent.content || '';
        } else if (typeof item === 'string') {
          content = item;
        }
        
        const result: { content: string; children?: Array<{ content: string }> } = { content };
        
        if (item.children && Array.isArray(item.children) && item.children.length > 0) {
          result.children = item.children.map(convertListItem);
        }
        
        return result;
      };
      
      const items = rawItems.map(convertListItem);
      const listNode = $createDocListNode((block as any).id || block.id, style, items);
      
      // Recursively create ListItemNode children with nested structure
      const createListItemNodes = (itemList: Array<{ content: string; children?: Array<{ content: string }> }>, parentNode: any) => {
        itemList.forEach((item: any) => {
          const listItemNode = $createDocListItemNode();
          const textNode = $createAiTextNode(item.content || '');
          listItemNode.append(textNode);
          
          // Handle nested children recursively
          if (item.children && item.children.length > 0) {
            const nestedList = $createDocListNode(undefined, style, item.children);
            createListItemNodes(item.children, nestedList);
            listItemNode.append(nestedList);
          }
          
          parentNode.append(listItemNode);
        });
      };
      
      createListItemNodes(items, listNode);
      
      return listNode;
    }
    
    case 'preformatted':
    case 'code': {
      // Handle code blocks with proper Lexical TextNode children
      const codeContent = typeof (block as any).content === 'string' 
        ? (block as any).content 
        : Array.isArray((block as any).content)
          ? (block as any).content.map((t: any) => t.text).join('')
          : '';
      const language = (block as any).language;
      const codeNode = $createDocCodeNode((block as any).id || block.id, codeContent, language);
      
      // Add TextNode child with the code content
      const textNode = $createAiTextNode(codeContent);
      codeNode.append(textNode);
      
      return codeNode;
    }
    
    case 'blockquote':
    case 'quote': {
      // Handle quotes
      const quoteNode = $createDocQuoteNode((block as any).id || block.id);
      const content = (block as any).content;
      if (typeof content === 'string') {
        const textNode = $createAiTextNode(content);
        quoteNode.append(textNode);
      } else if (Array.isArray(content)) {
        appendTextRuns(quoteNode, content);
      }
      return quoteNode;
    }
    
    case 'divider': {
      // Handle dividers/horizontal rules
      return $createDocDividerNode((block as any).id || block.id);
    }
    
    case 'image': {
      // Handle images
      const src = (block as any).src || '';
      const description = (block as any).description;
      const widthPx = (block as any).widthPx;
      const heightPx = (block as any).heightPx;
      return $createDocImageNode((block as any).id || block.id, src, description, widthPx, heightPx);
    }
    
    case 'empty': {
      // Handle empty/blank lines
      return $createDocEmptyNode((block as any).id || block.id);
    }
    
    case 'table': {
      // Handle table blocks
      const tableBlock = block as any;
      const columns = tableBlock.columns || [];
      const rows = tableBlock.rows || [];
      const has_header = tableBlock.has_header || false;
      const column_widths = tableBlock.column_widths || [];
      const column_alignments = tableBlock.column_alignments || [];
      
      // Prepare table data: combine columns (as header if no header row) and rows
      // IMPORTANT: If columns exist and have data, ALWAYS use them as header (even if has_header=True)
      // This handles cases where LLM incorrectly sets has_header=True but header is in columns
      let tableData: string[][] = [];
      if (columns.length > 0) {
        // Use columns as header row (prefer columns over first row in rows)
        // Only use rows[0] as header if columns is empty
        tableData = [columns, ...rows];
        console.log('[DocInitializerPlugin] Using columns as header:', columns);
      } else if (has_header && rows.length > 0) {
        // Fallback: First row is the header (when columns is empty)
        tableData = rows;
        console.log('[DocInitializerPlugin] Using first row as header (columns empty)');
      } else {
        // No header, just rows
        tableData = rows;
        console.log('[DocInitializerPlugin] No header available');
      }
      
      // Validate table data: ensure all rows have same number of columns as header
      if (tableData.length > 0) {
        const headerCols = tableData[0]?.length || 0;
        const validatedData: string[][] = [tableData[0]]; // Header
        
        for (let i = 1; i < tableData.length; i++) {
          const row = tableData[i] || [];
          // Pad with empty strings if row has fewer columns, truncate if more
          const validatedRow: string[] = [];
          for (let j = 0; j < headerCols; j++) {
            validatedRow[j] = row[j] !== undefined ? String(row[j]) : '';
          }
          validatedData.push(validatedRow);
        }
        
        tableData = validatedData;
      }
      
      // Ensure tableData has at least one row (even if empty)
      if (tableData.length === 0) {
        tableData = [['']];
      }
      
      console.log('[DocInitializerPlugin] Creating table:', {
        blockId: (block as any).id || block.id,
        columns: columns.length,
        columnsData: columns,
        rows: rows.length,
        has_header,
        tableDataRows: tableData.length,
        tableDataHeader: tableData[0],
        tableDataFirstRow: tableData[1],
        column_widths: column_widths.length,
        column_alignments: column_alignments.length,
        fullTableData: tableData,
      });
      
      return $createDocTableNode(
        tableData, 
        (block as any).id || block.id,
        column_widths,
        column_alignments
      );
    }
    
    default: {
      console.warn('[DocInitializerPlugin] Unsupported block type:', (block as any).type);
      // Fallback to paragraph
      const pNode = $createDocParagraphNode((block as any).id || `fallback-${Date.now()}`);
      const textNode = $createAiTextNode(`[Unsupported block: ${(block as any).type}]`);
      pNode.append(textNode);
      return pNode;
    }
  }
}

// Append text runs with formatting to a parent node
function appendTextRuns(parentNode: any, runs: TextRun[]) {
  if (!runs || runs.length === 0) {
    // Add empty text node for empty blocks
    const textNode = $createAiTextNode('');
    parentNode.append(textNode);
    return;
  }

  runs.forEach((run) => {
    const textNode = $createAiTextNode(run.text);
    
    // Apply formatting
    if (run.bold) textNode.toggleFormat('bold');
    if (run.italic) textNode.toggleFormat('italic');
    if (run.underline) textNode.toggleFormat('underline');
    if (run.code) textNode.toggleFormat('code');
    if (run.superscript) textNode.toggleFormat('superscript');
    if (run.subscript) textNode.toggleFormat('subscript');
    
    // Apply AI suggestion status
    if (run.aiSuggestionStatus) {
      textNode.setAiSuggestionStatus(run.aiSuggestionStatus);
    }
    
    // Apply comment IDs
    if (run.commentIds && run.commentIds.length > 0) {
      run.commentIds.forEach(commentId => {
        textNode.addCommentId(commentId);
      });
    }
    
    parentNode.append(textNode);
  });
}

