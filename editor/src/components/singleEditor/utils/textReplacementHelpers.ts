/**
 * Helper utilities for replacing text in the editor while maintaining highlights
 */

import { LexicalEditor } from 'lexical';
import { $getRoot, $isRangeSelection } from 'lexical';
import { $isAiTextNode, $createAiTextNode } from '../nodes/AiTextNode';

/**
 * Replace text that has a specific AI suggestion ID with new text
 * This is used when accepting AI suggestions
 * Now supports character-level replacement using offsets
 */
export function replaceTextBySuggestionId(
  editor: LexicalEditor,
  suggestionId: string,
  newText: string,
  startOffset?: number,
  endOffset?: number
): void {
  editor.update(() => {
    const root = $getRoot();
    
    // Find all text nodes with this suggestion ID
    const textNodes: any[] = [];
    
    function collectTextNodes(node: any) {
      if ($isAiTextNode(node)) {
        if (node.getAiSuggestionId?.() === suggestionId) {
          textNodes.push(node);
        }
      }
      
      const children = node.getChildren?.();
      if (children) {
        children.forEach(collectTextNodes);
      }
    }
    
    collectTextNodes(root);
    
    if (textNodes.length === 0) {
      console.warn(`[replaceTextBySuggestionId] No nodes found with suggestion ID: ${suggestionId}`);
      return;
    }
    
    // If we have offsets, do character-level replacement
    if (startOffset !== undefined && endOffset !== undefined && textNodes.length === 1) {
      const targetNode = textNodes[0];
      const nodeText = targetNode.getTextContent();
      
      // Split into 3 parts: [before] [changed] [after]
      const beforeText = nodeText.slice(0, startOffset);
      const afterText = nodeText.slice(endOffset);
      
      console.log(`[replaceTextBySuggestionId] Character-level split:`, {
        original: nodeText,
        before: beforeText,
        changed: nodeText.slice(startOffset, endOffset),
        after: afterText,
        newText
      });
      
      // Create new nodes for each part
      const parent = targetNode.getParent();
      if (!parent) {
        console.error('[replaceTextBySuggestionId] No parent found');
        return;
      }
      
      // Create the replacement node with accepted status
      const changedNode = $createAiTextNode(newText);
      changedNode.setAiSuggestionId(suggestionId);
      changedNode.setAiSuggestionStatus('applied');
      changedNode.setFormat(targetNode.getFormat());
      changedNode.setStyle(targetNode.getStyle());
      
      // Insert nodes in order: before, changed, after
      if (beforeText) {
        const beforeNode = $createAiTextNode(beforeText);
        beforeNode.setFormat(targetNode.getFormat());
        beforeNode.setStyle(targetNode.getStyle());
        targetNode.insertBefore(beforeNode);
      }
      
      targetNode.replace(changedNode);
      
      if (afterText) {
        const afterNode = $createAiTextNode(afterText);
        afterNode.setFormat(targetNode.getFormat());
        afterNode.setStyle(targetNode.getStyle());
        changedNode.insertAfter(afterNode);
      }
      
      console.log(`[replaceTextBySuggestionId] ✅ Character-level replacement complete`);
      return;
    }
    
    // Fallback: whole-node replacement
    const firstNode = textNodes[0];
    const parent = firstNode.getParent();
    
    if (!parent) {
      console.error('[replaceTextBySuggestionId] No parent found for text node');
      return;
    }
    
    // Create a new AiTextNode with the improved text, keeping the suggestion ID
    const newNode = $createAiTextNode(newText);
    newNode.setAiSuggestionId(suggestionId);
    newNode.setAiSuggestionStatus('applied'); // Mark as applied/accepted
    
    // Copy formatting from the first original node
    if ($isAiTextNode(firstNode)) {
      newNode.setFormat(firstNode.getFormat());
      newNode.setStyle(firstNode.getStyle());
    }
    
    // Replace the first node and remove the rest
    firstNode.replace(newNode);
    
    // Remove remaining nodes (if the selection spanned multiple text nodes)
    for (let i = 1; i < textNodes.length; i++) {
      textNodes[i].remove();
    }
    
    console.log(`[replaceTextBySuggestionId] Replaced ${textNodes.length} node(s) with new text (whole-node mode)`);
  });
}

/**
 * Find and select text by suggestion ID
 * Useful for programmatically selecting the text that was suggested
 */
export function selectTextBySuggestionId(
  editor: LexicalEditor,
  suggestionId: string
): boolean {
  let found = false;
  
  editor.update(() => {
    const root = $getRoot();
    
    // Find all text nodes with this suggestion ID
    const textNodes: any[] = [];
    
    function collectTextNodes(node: any) {
      if ($isAiTextNode(node)) {
        if (node.getAiSuggestionId?.() === suggestionId) {
          textNodes.push(node);
        }
      }
      
      const children = node.getChildren?.();
      if (children) {
        children.forEach(collectTextNodes);
      }
    }
    
    collectTextNodes(root);
    
    if (textNodes.length > 0) {
      // Select from the start of the first node to the end of the last node
      const firstNode = textNodes[0];
      const lastNode = textNodes[textNodes.length - 1];
      
      firstNode.select(0, lastNode.getTextContentSize());
      found = true;
    }
  });
  
  return found;
}


