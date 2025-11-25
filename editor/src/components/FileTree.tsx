import React, { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  FileText,
  FileCode,
  FileJson,
  Table,
  Image
} from 'lucide-react';
import { cn } from './ui/utils';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  extension?: string;
  children?: FileNode[];
  size?: number;
  modified?: string;
}

interface FileTreeProps {
  files: FileNode[];
  onFileClick?: (file: FileNode) => void;
  onFolderClick?: (folder: FileNode) => void;
  onContextMenu?: (file: FileNode, event: React.MouseEvent) => void;
  readOnly?: boolean;
  level?: number;
}

export function FileTree({
  files,
  onFileClick,
  onFolderClick,
  onContextMenu,
  readOnly = false,
  level = 0
}: FileTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const toggleFolder = (path: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedFolders(newExpanded);
  };

  const getFileIcon = (node: FileNode) => {
    if (node.type === 'folder') {
      return expandedFolders.has(node.path) ? (
        <FolderOpen className="h-4 w-4 text-blue-500" />
      ) : (
        <Folder className="h-4 w-4 text-blue-500" />
      );
    }

    const ext = node.extension?.toLowerCase();
    switch (ext) {
      case 'md':
      case 'txt':
        return <FileText className="h-4 w-4 text-gray-600" />;
      case 'py':
      case 'js':
      case 'ts':
      case 'tsx':
        return <FileCode className="h-4 w-4 text-green-600" />;
      case 'json':
        return <FileJson className="h-4 w-4 text-yellow-600" />;
      case 'csv':
        return <Table className="h-4 w-4 text-purple-600" />;
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
        return <Image className="h-4 w-4 text-pink-600" />;
      default:
        return <File className="h-4 w-4 text-gray-500" />;
    }
  };

  const handleItemClick = (node: FileNode, event: React.MouseEvent) => {
    event.stopPropagation();

    if (node.type === 'folder') {
      toggleFolder(node.path);
      onFolderClick?.(node);
    } else {
      onFileClick?.(node);
    }
  };

  const handleContextMenu = (node: FileNode, event: React.MouseEvent) => {
    if (!readOnly) {
      event.preventDefault();
      onContextMenu?.(node, event);
    }
  };

  if (!files || files.length === 0) {
    return (
      <div className="text-xs text-gray-400 italic p-2">
        {level === 0 ? 'No files' : null}
      </div>
    );
  }

  return (
    <div className="select-none">
      {files.map((node) => (
        <div key={node.path}>
          <div
            className={cn(
              'flex items-center gap-1 px-2 py-1 hover:bg-gray-100 cursor-pointer rounded text-sm',
              'transition-colors duration-150'
            )}
            style={{ paddingLeft: `${level * 12 + 8}px` }}
            onClick={(e) => handleItemClick(node, e)}
            onContextMenu={(e) => handleContextMenu(node, e)}
          >
            {node.type === 'folder' && (
              <span className="flex-shrink-0">
                {expandedFolders.has(node.path) ? (
                  <ChevronDown className="h-3 w-3 text-gray-500" />
                ) : (
                  <ChevronRight className="h-3 w-3 text-gray-500" />
                )}
              </span>
            )}
            {node.type === 'file' && <span className="w-3" />}

            <span className="flex-shrink-0">{getFileIcon(node)}</span>

            <span className="truncate flex-1 text-gray-700">
              {node.name}
            </span>

            {node.type === 'file' && node.size !== undefined && (
              <span className="text-xs text-gray-400 flex-shrink-0">
                {formatFileSize(node.size)}
              </span>
            )}
          </div>

          {node.type === 'folder' &&
            expandedFolders.has(node.path) &&
            node.children && (
              <FileTree
                files={node.children}
                onFileClick={onFileClick}
                onFolderClick={onFolderClick}
                onContextMenu={onContextMenu}
                readOnly={readOnly}
                level={level + 1}
              />
            )}
        </div>
      ))}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
