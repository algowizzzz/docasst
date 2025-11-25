/**
 * Helper utilities for applying comment highlighting to text nodes
 */

import { LexicalEditor, LexicalNode } from 'lexical';
import { $getRoot, $getSelection, $isRangeSelection } from 'lexical';
import { $isAiTextNode } from '../nodes/AiTextNode';
import { $isDocParagraphNode } from '../nodes/DocParagraphNode';
import { $isDocHeadingNode } from '../nodes/DocHeadingNode';
import { $isDocListNode } from '../nodes/DocListNode';
import { $isDocCodeNode } from '../nodes/DocCodeNode';
import { $isDocQuoteNode } from '../nodes/DocQuoteNode';

/**
 * Apply comment highlighting to text nodes in the current selection
 * Returns the blockId and text offsets for the comment
 */
export function applyCommentToSelection(
  editor: LexicalEditor,
  commentId: string
): { blockId: string; selectedText: string; startOffset: number; endOffset: number } | null {
  let result: { blockId: string; selectedText: string; startOffset: number; endOffset: number } | null = null;

  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      return;
    }

    const selectedText = selection.getTextContent();
    if (!selectedText) {
      return;
    }

    // Get all selected nodes
    const nodes = selection.getNodes();
    
    // Find the parent block to get blockId
    let blockId = 'unknown';
    for (const node of nodes) {
      let current: any = node;
      while (current) {
        const nodeType = current.getType();
        if (
          nodeType === 'doc-paragraph' ||
          nodeType === 'doc-heading' ||
          nodeType === 'doc-list' ||
          nodeType === 'doc-code' ||
          nodeType === 'doc-quote'
        ) {
          // Get blockId from the block node
          blockId = current.getBlockId?.() || 'unknown';
          break;
        }
        current = current.getParent();
      }
      if (blockId !== 'unknown') break;
    }

    // Mark all text nodes in selection with commentId
    for (const node of nodes) {
      if ($isAiTextNode(node)) {
        node.addCommentId(commentId);
      }
    }

    // Calculate offsets (simplified - using selection text length)
    // In a real implementation, you'd calculate actual character offsets within the block
    result = {
      blockId,
      selectedText,
      startOffset: 0, // TODO: Calculate actual offset
      endOffset: selectedText.length,
    };
  });

  return result;
}

/**
 * Remove comment highlighting from all text nodes with this commentId
 */
export function removeCommentHighlight(
  editor: LexicalEditor,
  commentId: string
): void {
  editor.update(() => {
    const root = $getRoot();
    
    // Recursively find all text nodes
    const textNodes: any[] = [];
    
    function collectTextNodes(node: any) {
      if ($isAiTextNode(node)) {
        textNodes.push(node);
      }
      
      const children = node.getChildren?.();
      if (children) {
        children.forEach(collectTextNodes);
      }
    }
    
    collectTextNodes(root);
    
    // Remove commentId from all text nodes
    for (const textNode of textNodes) {
      if (textNode.getCommentIds?.().includes(commentId)) {
        textNode.removeCommentId(commentId);
      }
    }
  });
}

/**
 * Apply comment highlighting to the current selection
 * This is used when creating a new comment
 */
export function applyCommentHighlight(
  editor: LexicalEditor,
  commentId: string
): void {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      return;
    }

    const nodes = selection.getNodes();
    
    // Mark all text nodes in selection with commentId
    for (const node of nodes) {
      if ($isAiTextNode(node)) {
        node.addCommentId(commentId);
      }
    }
  });
}

/**
 * Apply comment highlighting based on comment data (for loading existing comments)
 * Uses precise character offsets to highlight exact selection
 * Supports multi-block selections by searching across all blocks
 */
export function applyCommentHighlightByData(
  editor: LexicalEditor,
  commentId: string,
  blockId: string,
  selectionText: string,
  startOffset?: number,
  endOffset?: number,
  blockIds?: string[] // Optional: all block IDs for multi-block selections
): void {
  editor.update(() => {
    const root = $getRoot();
    
    // Collect all blocks in the editor
    const allBlocks: any[] = [];
    function collectAllBlocks(node: any) {
      const nodeType = node.getType?.();
      if (
        nodeType === 'doc-paragraph' ||
        nodeType === 'doc-heading' ||
        nodeType === 'doc-list' ||
        nodeType === 'doc-code' ||
        nodeType === 'doc-quote'
      ) {
        allBlocks.push(node);
      }
      const children = node.getChildren?.();
      if (children) {
        children.forEach(collectAllBlocks);
      }
    }
    collectAllBlocks(root);
    
    // Strategy for multi-block selections:
    // 1. If blockIds array is provided, highlight text in all those blocks
    // 2. Otherwise, if we have precise offsets, use them in the target block
    // 3. Otherwise, search for selection text across all blocks
    
    const blocksToHighlight: Array<{ block: any; startIndex: number; endIndex: number }> = [];
    
    // Case 1: Multi-block selection - highlight in all specified blocks
    if (blockIds && blockIds.length > 0) {
      const normalizedSelectionText = selectionText.trim().toLowerCase();
      
      for (const targetBlockId of blockIds) {
        const targetBlock = allBlocks.find(b => b.getBlockId?.() === targetBlockId);
        if (!targetBlock) {
          console.warn(`[applyCommentHighlightByData] Block ${targetBlockId} not found for multi-block comment`);
          continue;
        }
        
        const blockText = targetBlock.getTextContent();
        const normalizedBlockText = blockText.toLowerCase();
        
        // Find where the selection text appears in this block
        // For multi-block, we need to find the portion that's in this block
        let index = -1;
        
        // Try to find the text in this block
        index = normalizedBlockText.indexOf(normalizedSelectionText);
        
        // If not found as whole, try to find partial match (for text that spans blocks)
        if (index === -1) {
          // Check if this block contains part of the selection
          // For multi-block selections, we highlight the entire block if it contains any part
          if (normalizedBlockText.includes(normalizedSelectionText.substring(0, Math.min(20, normalizedSelectionText.length)))) {
            // Found start of selection in this block
            index = 0; // Highlight from start
          } else if (normalizedBlockText.includes(normalizedSelectionText.substring(Math.max(0, normalizedSelectionText.length - 20)))) {
            // Found end of selection in this block
            index = Math.max(0, normalizedBlockText.length - 20); // Approximate position
          }
        }
        
        if (index !== -1 || blockText.length > 0) {
          // If we found the text or the block has content, highlight it
          // For multi-block, we'll highlight the entire block or the matching portion
          const startIdx = index >= 0 ? index : 0;
          const endIdx = index >= 0 ? (index + normalizedSelectionText.length) : blockText.length;
          
          blocksToHighlight.push({
            block: targetBlock,
            startIndex: startIdx,
            endIndex: Math.min(endIdx, blockText.length),
          });
        }
      }
    }
    // Case 2: Single block with precise offsets
    else if (startOffset !== undefined && endOffset !== undefined) {
      const targetBlock = allBlocks.find(b => b.getBlockId?.() === blockId);
      if (targetBlock) {
        blocksToHighlight.push({
          block: targetBlock,
          startIndex: startOffset,
          endIndex: endOffset,
        });
      }
    }
    // Case 3: Fallback - search for selection text across all blocks
    else {
      // Use exact match (case-sensitive) to avoid partial matches
      // Only search in the target block if we have it, otherwise search all blocks
      const blocksToSearch = targetBlock ? [targetBlock] : allBlocks;
      
      for (const block of blocksToSearch) {
        const blockText = block.getTextContent();
        
        // Try exact match first (case-sensitive, preserves whitespace)
        let index = blockText.indexOf(selectionText);
        
        // If not found, try case-insensitive but only if it's a whole word match
        if (index === -1) {
          const normalizedBlockText = blockText.toLowerCase();
          const normalizedSelectionText = selectionText.trim().toLowerCase();
          
          // Find all occurrences
          let searchIndex = 0;
          const occurrences: number[] = [];
          while ((searchIndex = normalizedBlockText.indexOf(normalizedSelectionText, searchIndex)) !== -1) {
            occurrences.push(searchIndex);
            searchIndex += 1;
          }
          
          // If there's exactly one occurrence, use it
          // If multiple, prefer the one that matches the original case
          if (occurrences.length === 1) {
            index = occurrences[0];
          } else if (occurrences.length > 1) {
            // Multiple matches - try to find the one that matches original case
            for (const occ of occurrences) {
              const substr = blockText.substring(occ, occ + selectionText.length);
              if (substr.toLowerCase() === normalizedSelectionText) {
                // Check if it's a whole word (not part of another word)
                const before = occ > 0 ? blockText[occ - 1] : ' ';
                const after = occ + selectionText.length < blockText.length ? blockText[occ + selectionText.length] : ' ';
                const isWordBoundary = /[\s\p{P}]/u.test(before) && /[\s\p{P}]/u.test(after);
                
                // Prefer whole word matches, but accept any if none are whole words
                if (isWordBoundary) {
                  index = occ;
                  break;
                } else if (index === -1) {
                  index = occ; // Use first match if no whole word match found
                }
              }
            }
            
            // If still no match, use first occurrence
            if (index === -1 && occurrences.length > 0) {
              index = occurrences[0];
            }
          }
        }
        
        if (index !== -1) {
          blocksToHighlight.push({
            block,
            startIndex: index,
            endIndex: index + selectionText.length,
          });
          // If we found a match in the target block, don't search other blocks
          if (targetBlock && block === targetBlock) {
            break;
          }
        }
      }
    }
    
    if (blocksToHighlight.length === 0) {
      console.warn(`[applyCommentHighlightByData] Selection text "${selectionText.substring(0, 50)}..." not found in any block`);
      return;
    }
    
    // Apply highlighting to all matching blocks
    for (const { block, startIndex, endIndex } of blocksToHighlight) {
      // Find all text nodes in this block
      const textNodes: any[] = [];
      
      function collectTextNodes(node: any) {
        if ($isAiTextNode(node)) {
          textNodes.push(node);
        }
        
        const children = node.getChildren?.();
        if (children) {
          children.forEach(collectTextNodes);
        }
      }
      
      collectTextNodes(block);
      
      // Apply commentId to text nodes that fall within the selection range
      // Only highlight nodes that actually contain part of the selection
      let currentIndex = 0;
      for (const textNode of textNodes) {
        const nodeText = textNode.getTextContent();
        const nodeStart = currentIndex;
        const nodeEnd = currentIndex + nodeText.length;
        
        // Check if this node overlaps with the selection range
        // Only highlight if the node actually contains part of the selection
        const overlapStart = Math.max(nodeStart, startIndex);
        const overlapEnd = Math.min(nodeEnd, endIndex);
        
        if (overlapStart < overlapEnd) {
          // Node overlaps with selection - but we need to be more precise
          // For now, only highlight if the overlap is significant (more than 50% of selection or node)
          const selectionLength = endIndex - startIndex;
          const nodeLength = nodeEnd - nodeStart;
          const overlapLength = overlapEnd - overlapStart;
          
          // Highlight if:
          // 1. The overlap is at least 50% of the selection, OR
          // 2. The overlap is at least 50% of the node, OR
          // 3. The node is small (less than 20 chars) and overlaps at all
          if (overlapLength >= selectionLength * 0.5 || 
              overlapLength >= nodeLength * 0.5 || 
              (nodeLength < 20 && overlapLength > 0)) {
            textNode.addCommentId(commentId);
          }
        }
        
        currentIndex = nodeEnd;
      }
      
      const blockIdStr = block.getBlockId?.() || 'unknown';
      console.log(`[applyCommentHighlightByData] Applied highlight for comment ${commentId} in block ${blockIdStr} (offsets: ${startIndex}-${endIndex})`);
    }
    
    if (blocksToHighlight.length > 1) {
      console.log(`[applyCommentHighlightByData] Multi-block comment: highlighted ${blocksToHighlight.length} blocks`);
    }
  });
}

/**
 * Highlight text in a specific block with specific offsets (for clicking on a comment)
 */
export function highlightCommentInEditor(
  editor: LexicalEditor,
  blockId: string,
  startOffset: number,
  endOffset: number
): void {
  editor.update(() => {
    const root = $getRoot();
    
    // Find the block node with this ID
    let targetBlock: any = null;
    
    function findBlock(node: any): boolean {
      const nodeType = node.getType?.();
      if (
        nodeType === 'doc-paragraph' ||
        nodeType === 'doc-heading' ||
        nodeType === 'doc-list' ||
        nodeType === 'doc-code' ||
        nodeType === 'doc-quote'
      ) {
        if (node.getBlockId?.() === blockId) {
          targetBlock = node;
          return true;
        }
      }
      
      const children = node.getChildren?.();
      if (children) {
        for (const child of children) {
          if (findBlock(child)) return true;
        }
      }
      return false;
    }
    
    findBlock(root);
    
    if (!targetBlock) {
      console.warn(`Block with ID ${blockId} not found`);
      return;
    }

    // TODO: Scroll to and highlight the specific text range
    // For now, just scroll to the block
    const domElement = editor.getElementByKey(targetBlock.getKey());
    if (domElement) {
      domElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
}

