import React, { useState, useEffect } from 'react';
import { SingleDocumentEditor } from './singleEditor/SingleDocumentEditor';
import { Button } from './ui/button';
import { Save, Eye, Edit } from 'lucide-react';
import { API_BASE } from '../lib/api';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  extension?: string;
  size?: number;
  modified?: string;
}

interface EditorPaneProps {
  selectedFile: FileNode | null;
  onSave?: (content: string) => void;
}

export function EditorPane({ selectedFile, onSave }: EditorPaneProps) {
  const [mode, setMode] = useState<'edit' | 'view'>('edit');
  const [editorContent, setEditorContent] = useState<any>(null);
  const [rawContent, setRawContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (selectedFile) {
      loadFileContent(selectedFile);
    }
  }, [selectedFile]);

  const loadFileContent = async (file: FileNode) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/workspace/file?path=${encodeURIComponent(file.path)}&base_dir=my_files`);
      const data = await res.json();

      if (data.success) {
        setRawContent(data.file.raw_content);
        setEditorContent(data.file.lexical_json);
      }
    } catch (error) {
      console.error('Error loading file:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedFile || !rawContent) return;

    setIsSaving(true);
    try {
      const res = await fetch(`${API_BASE}/workspace/editor/content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: selectedFile.path,
          content: rawContent,
          base_dir: 'my_files'
        })
      });

      const data = await res.json();
      if (data.success) {
        console.log('File saved successfully');
        onSave?.(rawContent);
      }
    } catch (error) {
      console.error('Error saving file:', error);
    } finally {
      setIsSaving(false);
    }
  };

  if (!selectedFile) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-500">
          <Edit className="h-12 w-12 mx-auto mb-2 text-gray-400" />
          <p className="text-sm">Select a file to edit</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-200 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-gray-700 truncate">
              {selectedFile.name}
            </h2>
            <p className="text-xs text-gray-500 truncate">
              {selectedFile.path}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode Toggle */}
            <div className="flex border border-gray-200 rounded">
              <Button
                size="sm"
                variant={mode === 'edit' ? 'default' : 'ghost'}
                onClick={() => setMode('edit')}
                className="h-7 px-2 rounded-r-none"
              >
                <Edit className="h-3 w-3 mr-1" />
                Edit
              </Button>
              <Button
                size="sm"
                variant={mode === 'view' ? 'default' : 'ghost'}
                onClick={() => setMode('view')}
                className="h-7 px-2 rounded-l-none"
              >
                <Eye className="h-3 w-3 mr-1" />
                View
              </Button>
            </div>

            {/* Save Button */}
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
              className="h-7"
            >
              <Save className="h-3 w-3 mr-1" />
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </div>

      {/* Editor Content */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-gray-500">Loading...</div>
          </div>
        ) : mode === 'edit' ? (
          <div className="h-full">
            {editorContent && (
              <SingleDocumentEditor
                initialDoc={{
                  id: selectedFile.path,
                  title: selectedFile.name,
                  blocks: editorContent.root?.children || [],
                  comments: {},
                  aiSuggestions: {}
                }}
                onContentChange={(content) => {
                  // Convert Lexical content back to raw format
                  // This is simplified - you'd need proper conversion
                  setRawContent(JSON.stringify(content));
                }}
              />
            )}
          </div>
        ) : (
          <div className="h-full overflow-auto p-4">
            <FileViewer content={rawContent} fileType={selectedFile.extension || 'txt'} />
          </div>
        )}
      </div>
    </div>
  );
}

// Simple file viewer component
function FileViewer({ content, fileType }: { content: string; fileType: string }) {
  if (fileType === 'md' || fileType === 'markdown') {
    return (
      <div className="prose max-w-none">
        <pre className="whitespace-pre-wrap font-mono text-sm">{content}</pre>
      </div>
    );
  }

  if (fileType === 'json') {
    try {
      const parsed = JSON.parse(content);
      return (
        <pre className="bg-gray-50 p-4 rounded overflow-auto">
          {JSON.stringify(parsed, null, 2)}
        </pre>
      );
    } catch {
      return <pre className="font-mono text-sm whitespace-pre-wrap">{content}</pre>;
    }
  }

  if (fileType === 'csv') {
    const lines = content.split('\n');
    const headers = lines[0]?.split(',') || [];
    const rows = lines.slice(1).map(line => line.split(','));

    return (
      <div className="overflow-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {headers.map((header, i) => (
                <th key={i} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-2 text-sm text-gray-900">
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

  return <pre className="font-mono text-sm whitespace-pre-wrap">{content}</pre>;
}
