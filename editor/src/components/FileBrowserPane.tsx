import React, { useState, useEffect } from 'react';
import { FileTree } from './FileTree';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  Plus,
  FolderPlus,
  Search,
  RefreshCw
} from 'lucide-react';
import { API_BASE } from '../lib/api';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  extension?: string;
  children?: FileNode[];
  size?: number;
  modified?: string;
}

interface FileBrowserPaneProps {
  onFileSelect: (file: FileNode) => void;
  onFolderSelect?: (folder: FileNode) => void;
}

export function FileBrowserPane({ onFileSelect, onFolderSelect }: FileBrowserPaneProps) {
  const [myFiles, setMyFiles] = useState<FileNode[]>([]);
  const [domainData, setDomainData] = useState<FileNode[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    setIsLoading(true);
    try {
      // Load my files
      const myFilesRes = await fetch(`${API_BASE}/workspace/files?base_dir=my_files`);
      const myFilesData = await myFilesRes.json();
      if (myFilesData.success) {
        setMyFiles(myFilesData.files);
      }

      // Load domain data
      const domainRes = await fetch(`${API_BASE}/workspace/files?base_dir=domain_data`);
      const domainData = await domainRes.json();
      if (domainData.success) {
        setDomainData(domainData.files);
      }
    } catch (error) {
      console.error('Error loading files:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewFile = () => {
    const fileName = prompt('Enter file name:');
    if (!fileName) return;

    fetch(`${API_BASE}/workspace/file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: fileName,
        content: '',
        format: 'text',
        base_dir: 'my_files'
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          loadFiles();
        }
      })
      .catch(console.error);
  };

  const handleNewFolder = () => {
    const folderName = prompt('Enter folder name:');
    if (!folderName) return;

    fetch(`${API_BASE}/workspace/file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: folderName,
        base_dir: 'my_files',
        operation: 'create_folder'
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          loadFiles();
        }
      })
      .catch(console.error);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      loadFiles();
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/workspace/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          base_dir: 'my_files'
        })
      });
      const data = await res.json();
      if (data.success) {
        setMyFiles(data.results);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white border-r border-gray-200">
      {/* My Files Section */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-3 border-b border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-700">My Files</h2>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={handleNewFile}
                className="h-7 w-7 p-0"
                title="New File"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleNewFolder}
                className="h-7 w-7 p-0"
                title="New Folder"
              >
                <FolderPlus className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={loadFiles}
                className="h-7 w-7 p-0"
                title="Refresh"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className="flex gap-1">
            <Input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="h-8 text-sm"
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={handleSearch}
              className="h-8 w-8 p-0"
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-2">
          <FileTree
            files={myFiles}
            onFileClick={onFileSelect}
            onFolderClick={onFolderSelect}
          />
        </div>
      </div>

      {/* Domain Data Section */}
      <div className="flex-shrink-0 border-t border-gray-200">
        <div className="p-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-700">Domain Data</h2>
          <p className="text-xs text-gray-500 mt-1">Read-only reference data</p>
        </div>

        <div className="overflow-auto p-2" style={{ maxHeight: '200px' }}>
          <FileTree
            files={domainData}
            onFileClick={onFileSelect}
            readOnly={true}
          />
        </div>
      </div>
    </div>
  );
}
