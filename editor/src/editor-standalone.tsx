/**
 * Standalone Editor Entry Point
 * 
 * This file creates a self-contained React bundle that can be mounted
 * in Flask templates. The editor reads initial data from DOM data attributes
 * and communicates changes via callbacks.
 * 
 * Usage in Flask template:
 *   <div id="editor-root" 
 *        data-doc-state='{"id":"doc1","blocks":[...]}'
 *        data-file-id="file123">
 *   </div>
 *   <script src="/static/js/editor.js"></script>
 */

import { createRoot } from "react-dom/client";
import { SingleDocumentEditor } from "./components/singleEditor/SingleDocumentEditor";
import type { DocState } from "./model/docTypes";
import { $getSelection, $isRangeSelection, $isTextNode } from "lexical";
import { $findMatchingParent } from "@lexical/utils";
import type { LexicalEditor } from "lexical";
import { $createDocParagraphNode } from "./components/singleEditor/nodes/DocParagraphNode";
import { $createDocHeadingNode } from "./components/singleEditor/nodes/DocHeadingNode";
import { $createDocListNode } from "./components/singleEditor/nodes/DocListNode";
import { $createDocListItemNode } from "./components/singleEditor/nodes/DocListItemNode";
import { $createDocCodeNode } from "./components/singleEditor/nodes/DocCodeNode";
import { $createDocQuoteNode } from "./components/singleEditor/nodes/DocQuoteNode";
import { $createAiTextNode } from "./components/singleEditor/nodes/AiTextNode";
import { applyCommentHighlightByData, removeCommentHighlight } from "./components/singleEditor/utils/commentHighlightHelpers";
import { applyAISuggestionHighlightByData, removeAISuggestionHighlight } from "./components/singleEditor/utils/aiSuggestionHelpers";
import { getSelectionOffsets } from "./components/singleEditor/utils/selectionOffsets";
import "./log-forwarder"; // Enable browser log forwarding
import "./index.css";
import "./components/editor/lexical.css";

// Global interface for editor instance
interface EditorInstance {
  getDocState: () => DocState | null;
  setDocState: (docState: DocState) => void;
  save: () => Promise<void>;
  getEditorInstance: () => LexicalEditor | null;
  getSelectionOffsets: () => { startOffset: number; endOffset: number; blockId: string; selectedText: string } | null;
  applyCommentHighlight: (commentId: string, blockId: string, selectionText: string, startOffset?: number, endOffset?: number, blockIds?: string[]) => void;
  applyAISuggestionHighlight: (suggestionId: string, blockId: string, selectionText: string, status: 'pending' | 'accepted' | 'rejected', startOffset?: number, endOffset?: number) => void;
  removeCommentHighlight: (commentId: string) => void;
  removeAISuggestionHighlight: (suggestionId: string) => void;
}

// Store editor instance globally for Flask to access
declare global {
  interface Window {
    docEditor?: EditorInstance;
  }
}

/**
 * Initialize editor when DOM is ready
 */
function initEditor() {
  console.log("[Editor] initEditor() called, document.readyState:", document.readyState);
  const rootElement = document.getElementById("editor-root");
  
  if (!rootElement) {
    console.warn("[Editor] No #editor-root element found. Editor not initialized.");
    console.warn("[Editor] Available elements with 'editor' in id:", 
      Array.from(document.querySelectorAll('[id*="editor"]')).map(el => el.id));
    return;
  }
  
  console.log("[Editor] Found #editor-root element");

  // Parse initial data from Flask template
  const docStateJson = rootElement.dataset.docState;
  const fileId = rootElement.dataset.fileId || "";
  const readOnly = rootElement.dataset.readOnly === "true";

  let initialDocState: DocState;
  
  try {
    if (docStateJson) {
      initialDocState = JSON.parse(docStateJson);
    } else {
      // Default empty document
      initialDocState = {
        id: fileId,
        title: "",
        version: "1.0",
        blocks: [],
      };
    }
  } catch (error) {
    console.error("[Editor] Failed to parse docState:", error);
    initialDocState = {
      id: fileId,
      title: "",
      version: "1.0",
      blocks: [],
    };
  }

  // Track current document state
  let currentDocState: DocState = initialDocState;
  let editorInstance: any = null;

  // Callback when document changes
  const handleDocChange = (newDocState: DocState) => {
    currentDocState = newDocState;
    
    // Dispatch custom event so Flask/vanilla JS can listen
    const event = new CustomEvent("docEditor:change", {
      detail: { docState: newDocState, fileId },
    });
    document.dispatchEvent(event);

    // Auto-save to backend (optional - can be disabled)
    if (rootElement.dataset.autoSave !== "false") {
      saveToBackend(newDocState, fileId).catch((err) => {
        console.error("[Editor] Auto-save failed:", err);
      });
    }
  };

  // Save to backend
  const saveToBackend = async (docState: DocState, fileId: string) => {
    if (!fileId) {
      console.warn("[Editor] No fileId provided, skipping save");
      return;
    }

    try {
      // Convert DocState to markdown for backend
      const markdown = docStateToMarkdown(docState);
      
      const response = await fetch(`/api/doc_review/documents/${encodeURIComponent(fileId)}/markdown`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({ markdown }),
      });

      if (!response.ok) {
        throw new Error(`Save failed: ${response.statusText}`);
      }

      // Dispatch save success event
      const event = new CustomEvent("docEditor:save", {
        detail: { fileId, success: true },
      });
      document.dispatchEvent(event);
    } catch (error) {
      console.error("[Editor] Save error:", error);
      const event = new CustomEvent("docEditor:save", {
        detail: { fileId, success: false, error },
      });
      document.dispatchEvent(event);
      throw error;
    }
  };

  // Expose editor instance to window for Flask/vanilla JS access
  const exposeEditorAPI = () => {
    window.docEditor = {
      getDocState: () => currentDocState,
      setDocState: (newDocState: DocState) => {
        currentDocState = newDocState;
        // Re-render editor with new state
        if (editorInstance) {
          // This would require re-initializing the editor
          // For now, we'll just update the state
          console.warn("[Editor] setDocState: Full re-render not implemented yet");
        }
      },
      save: () => saveToBackend(currentDocState, fileId),
      getEditorInstance: () => editorInstance,
      getSelectionOffsets: () => {
        if (!editorInstance) {
          console.warn("[Editor] Cannot get selection offsets: editor not ready");
          return null;
        }
        return getSelectionOffsets(editorInstance);
      },
      applyCommentHighlight: (commentId: string, blockId: string, selectionText: string, startOffset?: number, endOffset?: number, blockIds?: string[]) => {
        if (!editorInstance) {
          console.warn("[Editor] Cannot apply comment highlight: editor not ready");
          return;
        }
        applyCommentHighlightByData(editorInstance, commentId, blockId, selectionText, startOffset, endOffset, blockIds);
      },
      applyAISuggestionHighlight: (suggestionId: string, blockId: string, selectionText: string, status: 'pending' | 'accepted' | 'rejected', startOffset?: number, endOffset?: number) => {
        if (!editorInstance) {
          console.warn("[Editor] Cannot apply AI suggestion highlight: editor not ready");
          return;
        }
        applyAISuggestionHighlightByData(editorInstance, suggestionId, blockId, selectionText, status, startOffset, endOffset);
      },
      removeCommentHighlight: (commentId: string) => {
        if (!editorInstance) {
          console.warn("[Editor] Cannot remove comment highlight: editor not ready");
          return;
        }
        removeCommentHighlight(editorInstance, commentId);
      },
      removeAISuggestionHighlight: (suggestionId: string) => {
        if (!editorInstance) {
          console.warn("[Editor] Cannot remove AI suggestion highlight: editor not ready");
          return;
        }
        removeAISuggestionHighlight(editorInstance, suggestionId);
      },
    };
    
    // Dispatch event that editor is ready
    const readyEvent = new CustomEvent("docEditor:ready", {
      detail: { fileId },
    });
    document.dispatchEvent(readyEvent);
  };

  // Render editor
  const root = createRoot(rootElement);
  
  root.render(
    <SingleDocumentEditor
      initialDoc={initialDocState}
      onDocChange={handleDocChange}
      readOnly={readOnly}
      onEditorReady={(editor) => {
        editorInstance = editor;
        exposeEditorAPI();
        console.log("[Editor] Ready, fileId:", fileId);
      }}
      onSelectionChange={(data) => {
        // Dispatch selection change event
        const event = new CustomEvent("docEditor:selection", {
          detail: { ...data, fileId },
        });
        document.dispatchEvent(event);
      }}
      onCommentClick={(commentIds) => {
        const event = new CustomEvent("docEditor:commentClick", {
          detail: { commentIds, fileId },
        });
        document.dispatchEvent(event);
      }}
      // Floating toolbar handlers
      onFormat={(format) => {
        // Format text (bold, italic, underline, etc.)
        if (!editorInstance) {
          console.warn("[Editor] Cannot format: editor not ready");
          return;
        }
        
        editorInstance.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            // Toggle the format directly on the selection
            selection.formatText(format);
          }
        });
      }}
      onTextColor={(color) => {
        // Set text color (like React version)
        if (!editorInstance) {
          console.warn("[Editor] Cannot set text color: editor not ready");
          return;
        }
        
        editorInstance.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            selection.getNodes().forEach((node) => {
              if ($isTextNode(node)) {
                const currentStyle = node.getStyle() || '';
                // Remove existing color style
                const newStyle = currentStyle.replace(/color:\s*[^;]+;?/g, '').trim();
                // Add new color
                node.setStyle(newStyle ? `${newStyle}; color: ${color};` : `color: ${color};`);
              }
            });
          }
        });
        editorInstance.focus();
      }}
      onBackgroundColor={(color) => {
        // Set background color (like React version)
        if (!editorInstance) {
          console.warn("[Editor] Cannot set background color: editor not ready");
          return;
        }
        
        editorInstance.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            selection.getNodes().forEach((node) => {
              if ($isTextNode(node)) {
                const currentStyle = node.getStyle() || '';
                // Remove existing background-color style
                const newStyle = currentStyle.replace(/background-color:\s*[^;]+;?/g, '').trim();
                // Add new background color
                node.setStyle(newStyle ? `${newStyle}; background-color: ${color};` : `background-color: ${color};`);
              }
            });
          }
        });
        editorInstance.focus();
      }}
      onTurnInto={(type) => {
        // Convert block type (paragraph, heading, list, etc.) - like React version
        if (!editorInstance) {
          console.warn("[Editor] Cannot turn into: editor not ready");
          return;
        }
        
        // Map toolbar types to internal types
        const typeMap: Record<string, { type: 'paragraph' | 'heading' | 'list' | 'code' | 'quote'; options?: { level?: 1 | 2 | 3; listStyle?: 'bullet' | 'number' } }> = {
          'paragraph': { type: 'paragraph' },
          'heading-1': { type: 'heading', options: { level: 1 } },
          'heading-2': { type: 'heading', options: { level: 2 } },
          'heading-3': { type: 'heading', options: { level: 3 } },
          'bulleted-list': { type: 'list', options: { listStyle: 'bullet' } },
          'numbered-list': { type: 'list', options: { listStyle: 'number' } },
          'code': { type: 'code' },
          'quote': { type: 'quote' },
        };
        
        const config = typeMap[type];
        if (!config) {
          console.warn("[Editor] Unknown turn into type:", type);
          return;
        }
        
        editorInstance.update(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;
          
          const anchor = selection.anchor.getNode();
          
          // Find the parent block node
          const blockNode = $findMatchingParent(
            anchor,
            (node: any) => {
              const nodeType = node.getType?.();
              return nodeType === 'doc-paragraph' || 
                     nodeType === 'doc-heading' || 
                     nodeType === 'doc-list' ||
                     nodeType === 'doc-code' ||
                     nodeType === 'doc-quote' ||
                     nodeType === 'doc-divider' ||
                     nodeType === 'doc-image' ||
                     nodeType === 'doc-empty';
            }
          );
          
          if (!blockNode) return;
          
          // Get the block ID to preserve it
          const blockId = (blockNode as any).getBlockId?.() || `b${Date.now()}`;
          
          // Get current text content (empty for divider/image/empty blocks)
          const nodeType = (blockNode as any).getType?.();
          const isNonEditableBlock = nodeType === 'doc-divider' || nodeType === 'doc-image' || nodeType === 'doc-empty';
          const textContent = isNonEditableBlock ? '' : blockNode.getTextContent();
          
          // Create new node based on type
          let newNode: any;
          if (config.type === 'paragraph') {
            newNode = $createDocParagraphNode(blockId);
          } else if (config.type === 'heading') {
            newNode = $createDocHeadingNode(config.options?.level || 1, blockId);
          } else if (config.type === 'list') {
            // Create list with current text as a single item
            const items = textContent ? [{ content: textContent }] : [{ content: '' }];
            const listNode = $createDocListNode(blockId, config.options?.listStyle || 'bullet', items);
            
            // Create a list item with text content
            const listItemNode = $createDocListItemNode();
            const textNode = $createAiTextNode(textContent || '');
            listItemNode.append(textNode);
            listNode.append(listItemNode);
            
            // Replace the node
            (blockNode as any).replace(listNode);
            
            // Set selection to the text node inside the list item
            textNode.select();
            return;
          } else if (config.type === 'code') {
            const codeNode = $createDocCodeNode(blockId, textContent);
            const textNode = $createAiTextNode(textContent || '');
            codeNode.append(textNode);
            
            // Replace the node
            (blockNode as any).replace(codeNode);
            
            // Set selection to the text node inside code
            textNode.select();
            return;
          } else if (config.type === 'quote') {
            newNode = $createDocQuoteNode(blockId);
          }
          
          if (!newNode) return;
          
          // Transfer children (for paragraph, heading, quote)
          if (isNonEditableBlock) {
            // Non-editable blocks have no text children, create a blank text node
            const textNode = $createAiTextNode('');
            newNode.append(textNode);
          } else {
            // Transfer existing children
            const children = (blockNode as any).getChildren?.() || [];
            children.forEach((child: any) => {
              newNode.append(child);
            });
          }
          
          // Replace the old node with the new one
          (blockNode as any).replace(newNode);
          
          // Select the first text node in the new node
          const firstChild = (newNode as any).getFirstChild?.();
          if (firstChild) {
            (firstChild as any).select();
          }
        });
        editorInstance.focus();
      }}
      onAddComment={() => {
        // Add comment to selected text
        if (!editorInstance) {
          console.warn("[Editor] Cannot add comment: editor not ready");
          return;
        }
        
        // Calculate precise character offsets (like React version does)
        const offsets = getSelectionOffsets(editorInstance);
        if (!offsets) {
          alert('Please select some text before adding a comment');
          return;
        }
        
        editorInstance.getEditorState().read(() => {
          const selection = $getSelection();
          
          if (!$isRangeSelection(selection) || selection.isCollapsed()) {
            alert('Please select some text before adding a comment');
            return;
          }
          
          // Get selected text and block information
          const selectedText = selection.getTextContent();
          const nodes = selection.getNodes();
          
          // Collect ALL blocks that the selection spans across (for multi-block selections)
          const blockIds = new Set<string>();
          const blockTitles: string[] = [];
          
          for (const node of nodes) {
            // Traverse up to find the parent block node
            let current: any = node;
            while (current) {
              const nodeType = current.getType();
              
              // Check if this is a block node type
              if (
                nodeType === 'doc-paragraph' ||
                nodeType === 'doc-heading' ||
                nodeType === 'doc-list' ||
                nodeType === 'doc-code' ||
                nodeType === 'doc-quote'
              ) {
                // Get blockId from the block node
                const blockId = current.getBlockId?.();
                if (blockId && !blockIds.has(blockId)) {
                  blockIds.add(blockId);
                  
                  // Get block title from node type
                  let blockTitle = '';
                  if (nodeType === 'doc-heading') {
                    blockTitle = `Heading: ${selectedText.substring(0, 50)}`;
                  } else if (nodeType === 'doc-paragraph') {
                    blockTitle = `Paragraph: ${selectedText.substring(0, 50)}`;
                  } else {
                    blockTitle = selectedText.substring(0, 50);
                  }
                  blockTitles.push(blockTitle);
                }
                break;
              }
              
              // Move up to parent
              current = current.getParent();
            }
          }
          
          // Use the first block ID as primary (for backward compatibility with API)
          const primaryBlockId = offsets.blockId || Array.from(blockIds)[0] || 'unknown';
          const primaryBlockTitle = blockTitles[0] || selectedText.substring(0, 50);
          
          if (blockIds.size === 0) {
            console.warn("[Editor] Could not determine block ID for comment");
            console.warn("[Editor] Selected nodes:", nodes.map(n => ({ type: n.getType(), key: n.getKey() })));
          }
          
          // Dispatch event for workspace to handle comment creation
          const event = new CustomEvent("docEditor:addComment", {
            detail: {
              fileId,
              blockId: primaryBlockId, // Primary block ID (for API compatibility)
              blockIds: Array.from(blockIds), // All block IDs (for multi-block highlighting)
              blockTitle: primaryBlockTitle,
              selectionText: selectedText,
              startOffset: offsets.startOffset, // Precise character offset
              endOffset: offsets.endOffset, // Precise character offset
            },
          });
          document.dispatchEvent(event);
          
          console.log("[Editor] Add comment requested:", {
            fileId,
            blockId: primaryBlockId,
            blockIds: Array.from(blockIds),
            blockTitle: primaryBlockTitle,
            selectionText: selectedText.substring(0, 50),
            startOffset: offsets.startOffset,
            endOffset: offsets.endOffset,
            isMultiBlock: blockIds.size > 1,
          });
        });
      }}
      onImproveText={() => {
        // Ask AI to improve text
        if (!editorInstance) {
          console.warn("[Editor] Cannot improve text: editor not ready");
          return;
        }
        
        editorInstance.getEditorState().read(() => {
          const selection = $getSelection();
          
          if (!$isRangeSelection(selection) || selection.isCollapsed()) {
            alert('Please select some text before asking AI to improve it');
            return;
          }
          
          // Get selected text
          const selectedText = selection.getTextContent();
          
          // Dispatch event for workspace to handle
          const event = new CustomEvent("docEditor:improveText", {
            detail: { 
              fileId,
              selectedText,
            },
          });
          document.dispatchEvent(event);
        });
      }}
    />
  );
}

// Simple markdown converter (basic implementation)
function docStateToMarkdown(docState: DocState): string {
  const lines: string[] = [];
  
  for (const block of docState.blocks) {
    switch (block.type) {
      case "heading":
        const headingText = block.text.map((r) => r.text).join("");
        lines.push(`${"#".repeat(block.level)} ${headingText}`);
        break;
      case "paragraph":
        const paraText = block.text.map((r) => {
          let text = r.text;
          if (r.bold) text = `**${text}**`;
          if (r.italic) text = `*${text}*`;
          return text;
        }).join("");
        lines.push(paraText);
        break;
      case "list":
        for (const item of block.items) {
          const prefix = block.style === "bullet" ? "- " : "1. ";
          const itemText = item.text.map((r) => r.text).join("");
          lines.push(`${prefix}${itemText}`);
        }
        break;
      case "preformatted":
        lines.push("```");
        lines.push(block.text);
        lines.push("```");
        break;
      case "divider":
        lines.push("---");
        break;
    }
    lines.push(""); // Empty line between blocks
  }
  
  return lines.join("\n");
}

// Initialize when DOM is ready
console.log("[Editor] Standalone script loaded, document.readyState:", document.readyState);
if (document.readyState === "loading") {
  console.log("[Editor] DOM still loading, waiting for DOMContentLoaded");
  document.addEventListener("DOMContentLoaded", () => {
    console.log("[Editor] DOMContentLoaded fired, calling initEditor");
    initEditor();
  });
} else {
  console.log("[Editor] DOM already ready, calling initEditor immediately");
  // Use setTimeout to ensure DOM is fully ready
  setTimeout(() => {
    initEditor();
  }, 0);
}

