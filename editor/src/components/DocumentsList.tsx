import { useEffect, useMemo, useState } from 'react';
import { Search, Upload, FileText, Trash2, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { UploadModal } from './UploadModal';
import { listDocuments, deleteDocument, type ApiDocument } from '@/lib/api';

type ColumnKey = 'name' | 'fileId' | 'userName' | 'status' | 'lastUpdated';

interface Column {
  key: ColumnKey;
  label: string;
  width?: string;
}

const defaultColumns: Column[] = [
  { key: 'name', label: 'Document Name', width: '30%' },
  { key: 'status', label: 'Status', width: '12%' },
  { key: 'lastUpdated', label: 'Last Updated', width: '18%' },
  { key: 'userName', label: 'User Name', width: '15%' },
  { key: 'fileId', label: 'File ID', width: '20%' },
];

type ColumnKeyWithActions = ColumnKey | 'actions';

interface DocumentsListProps {
  onOpenDocument: (fileId: string) => void;
}

export function DocumentsList({ onOpenDocument }: DocumentsListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [columns, setColumns] = useState<Column[]>(defaultColumns);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docs, setDocs] = useState<ApiDocument[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resizingColumn, setResizingColumn] = useState<number | null>(null);
  const [startX, setStartX] = useState<number>(0);
  const [startWidth, setStartWidth] = useState<number>(0);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await listDocuments();
      // eslint-disable-next-line no-console
      console.debug('[DocumentsList] listDocuments ->', res);
      setDocs(res.documents || []);
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('[DocumentsList] listDocuments error:', e);
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  // Poll for updates when there are running documents
  useEffect(() => {
    const hasRunningDocs = docs.some(d => d.status === 'running');
    if (!hasRunningDocs) return;

    const interval = setInterval(async () => {
      try {
        const res = await listDocuments();
        setDocs(res.documents || []);
      } catch (e) {
        console.error('[DocumentsList] Polling error:', e);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, [docs]);

  const getStatusBadge = (status: string | undefined, doc?: ApiDocument) => {
    if (status === 'completed' || status === 'ready') {
      return <span className="status-badge analyzed">{status}</span>;
    }
    if (status === 'running') {
      // Show progress if ingestion stats are available
      const stats = doc?.state?.structure?.ingestion_stats;
      if (stats && stats.total_pages && stats.processed_pages !== undefined) {
        const progress = Math.round((stats.processed_pages / stats.total_pages) * 100);
        return (
          <div className="flex flex-col gap-1">
            <span className="status-badge in-review flex items-center gap-2">
              <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full" />
              processing
            </span>
            <div className="text-xs text-blue-600">
              Page {stats.processed_pages}/{stats.total_pages} ({progress}%)
            </div>
          </div>
        );
      }
      return <span className="status-badge in-review">in-review</span>;
    }
    if (status === 'error') {
      return <Badge className="bg-red-100 text-red-800 text-xs">error</Badge>;
    }
    return <span className="status-badge draft">{status || 'draft'}</span>;
  };

  const filteredDocuments = useMemo(() => {
    const normalized = docs.map(d => {
      const name = d.file_metadata?.['name'] as string | undefined;
      return {
        ...d,
        _displayName: name || d.file_id,
      };
    });
    return normalized.filter((doc) => {
      const matchesSearch =
        (doc._displayName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (doc.file_id || '').toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;
      if (statusFilter === 'All') return true;
      if (statusFilter === 'In Progress') return doc.status === 'running';
      if (statusFilter === 'Completed') return doc.status === 'completed' || doc.status === 'ready';
      if (statusFilter === 'Needs Review') return doc.status === 'unknown' || !doc.status;
      return true;
    });
  }, [docs, searchQuery, statusFilter]);

  const handleResizeStart = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    setResizingColumn(index);
    setStartX(e.clientX);
    const th = (e.target as HTMLElement).parentElement;
    if (th) {
      setStartWidth(th.offsetWidth);
    }
  };

  const handleResizeMove = (e: MouseEvent) => {
    if (resizingColumn === null) return;
    
    const diff = e.clientX - startX;
    const newWidth = Math.max(50, startWidth + diff); // Min width 50px
    
    const newColumns = [...columns];
    const percentWidth = (newWidth / window.innerWidth) * 100;
    newColumns[resizingColumn] = {
      ...newColumns[resizingColumn],
      width: `${percentWidth}%`
    };
    setColumns(newColumns);
  };

  const handleResizeEnd = () => {
    setResizingColumn(null);
  };

  useEffect(() => {
    if (resizingColumn !== null) {
      window.addEventListener('mousemove', handleResizeMove);
      window.addEventListener('mouseup', handleResizeEnd);
      return () => {
        window.removeEventListener('mousemove', handleResizeMove);
        window.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [resizingColumn, startX, startWidth]);

  const handleDelete = async (fileId: string, fileName: string) => {
    if (!confirm(`Are you sure you want to delete "${fileName}"?\n\nThis action cannot be undone.`)) {
      return;
    }
    
    setDeletingId(fileId);
    try {
      await deleteDocument(fileId);
      console.log('[DocumentsList] Document deleted:', fileId);
      await refresh();
    } catch (e: any) {
      console.error('[DocumentsList] Delete failed:', e);
      alert(`Failed to delete document: ${e?.message || 'Unknown error'}`);
    } finally {
      setDeletingId(null);
    }
  };

  const renderCellContent = (doc: Document, columnKey: ColumnKeyWithActions) => {
    switch (columnKey) {
      case 'name':
        // @ts-ignore
        return <span className="text-neutral-900 truncate block">{(doc as any)._displayName}</span>;
      case 'fileId':
        // @ts-ignore
        return <span className="text-neutral-600 truncate block" title={(doc as any).file_id}>{(doc as any).file_id}</span>;
      case 'userName':
        return <span className="text-neutral-600 truncate block">saad</span>;
      case 'status':
        // @ts-ignore
        return getStatusBadge((doc as any).status, doc as any);
      case 'lastUpdated':
        // @ts-ignore
        return <span className="text-neutral-600 truncate block">{(doc as any).updated_at || ''}</span>;
      case 'actions':
        // @ts-ignore
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              // @ts-ignore
              handleDelete((doc as any).file_id, (doc as any)._displayName);
            }}
            // @ts-ignore
            disabled={deletingId === (doc as any).file_id}
            className="p-2 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Delete document"
          >
            {/* @ts-ignore */}
            {deletingId === (doc as any).file_id ? (
              <div className="animate-spin h-4 w-4 border-2 border-neutral-300 border-t-red-600 rounded-full" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </button>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="empty-state-icon mb-4">
            <div className="animate-spin h-8 w-8 border-3 border-slate-300 border-t-blue-600 rounded-full" />
          </div>
          <h2 className="text-slate-900 font-semibold mb-2">Loading documents…</h2>
          <p className="text-slate-600 text-sm">Please wait while we fetch your documents</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-white">
        <FileText className="w-16 h-16 text-red-300 mb-4" />
        <h2 className="text-neutral-900 mb-2">Failed to load</h2>
        <p className="text-neutral-600 mb-6 text-sm">{error}</p>
        <Button onClick={() => refresh()}>Retry</Button>
      </div>
    );
  }

  if (filteredDocuments.length === 0 && !loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center py-16 px-4 max-w-md">
          <div className="empty-state-icon mb-6">
            <Upload className="size-12 text-slate-400" />
          </div>
          <h3 className="text-slate-900 text-xl font-semibold mb-2">Start by uploading a policy document</h3>
          <p className="text-slate-600 text-sm mb-4">
            Supported formats: PDF, Word
          </p>
          <p className="text-slate-500 text-xs mb-6">
            Try uploading OSFI guidelines, Basel docs, or risk policies
          </p>
          <Button onClick={() => setUploadModalOpen(true)} className="gap-2">
            <Upload className="w-4 h-4" />
          Upload & Review
        </Button>
        </div>
        
        {uploadModalOpen && (
          <UploadModal onClose={() => { setUploadModalOpen(false); refresh(); }} />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto p-6 space-y-8">
        
        {/* Welcome Banner */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-10 feature-card">
          <h1 className="text-4xl font-bold text-slate-900 mb-4 leading-tight tracking-tight">
            Welcome to <span className="gradient-text">RiskGPT Documentation Assistant</span>
          </h1>
          <p className="text-xl text-slate-600 mb-8 leading-relaxed max-w-4xl">
            Your AI-powered hub for creating and improving documents. Upload files, review insights, apply smart edits, track revisions, comment, and export in the format you need.
          </p>
          <div className="flex gap-4 items-center">
            <Button 
              onClick={() => { console.debug('[UI] Click Upload & Review'); setUploadModalOpen(true); }} 
              className="gap-2 px-6 py-3 text-sm"
            >
              <Upload className="size-4" />
              Upload & Review
            </Button>
            <button 
              onClick={() => {
                const section = document.getElementById('how-it-works');
                if (section) {
                  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  setTimeout(() => {
                    const details = section as HTMLDetailsElement;
                    if (details && !details.open) {
                      details.open = true;
                    }
                  }, 500);
                }
              }}
              className="px-5 py-3 text-base text-slate-700 hover:text-slate-900 font-medium transition-colors hover:bg-slate-50 rounded-lg"
            >
              Learn More →
            </button>
          </div>
        </div>

        {/* Documents Section */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                <span className="text-lg">📚</span>
              </div>
              <div>
                <h2 className="text-slate-900 font-semibold">Your Documents</h2>
                <p className="text-slate-600 text-sm mt-1">Review, analyze, and collaborate on policy documents</p>
              </div>
            </div>
            <Button onClick={() => { console.debug('[UI] Click Upload & Review'); setUploadModalOpen(true); }} className="gap-2">
              <Upload className="size-4" />
              Upload & Review
            </Button>
          </div>

          {/* Filters */}
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                type="text"
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>
            
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-neutral-300 rounded-lg bg-white text-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="All">All</option>
              <option value="Needs Review">Needs Review</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
            </select>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full table-fixed">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {columns.map((column, index) => (
                    <th
                      key={column.key}
                      style={{ width: column.width, position: 'relative' }}
                      className="text-left px-6 py-3 text-slate-700 text-sm font-semibold hover:bg-slate-100 transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                        {column.label}
                      </div>
                      {/* Resize Handle */}
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleResizeStart(e, index);
                        }}
                        className="absolute top-0 right-0 h-full cursor-col-resize transition-all"
                        style={{ userSelect: 'none', zIndex: 10 }}
                        title="Drag to resize column"
                      />
                    </th>
                  ))}
                  <th className="text-left px-6 py-3 text-slate-700 text-sm font-semibold w-[5%]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocuments.map((doc: any) => (
                  <tr
                    key={doc.file_id}
                    onClick={() => { console.debug('[UI] Click row open document', doc.file_id); onOpenDocument(doc.file_id); }}
                    className="document-row border-b border-slate-100 cursor-pointer"
                  >
                    {columns.map((column) => (
                      <td key={column.key} className="px-6 py-4 max-w-0">
                        {renderCellContent(doc, column.key)}
                      </td>
                    ))}
                    <td className="px-6 py-4">
                      {renderCellContent(doc, 'actions')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* What Can You Do? - Collapsible */}
        <details className="bg-white rounded-xl shadow-sm border border-slate-200 collapsible-section" open>
          <summary className="cursor-pointer p-6 font-semibold text-lg text-slate-900 flex items-center justify-between hover:bg-slate-50 transition-colors rounded-xl">
            <div className="flex items-center gap-3">
              <div className="icon-badge blue">
                <span className="text-xl">✨</span>
              </div>
              <span>What Can You Do?</span>
            </div>
            <ChevronRight className="w-5 h-5 transition-transform group-open:rotate-90" />
          </summary>
          <div className="px-6 pb-6 pt-2">
            <div className="grid grid-cols-3 gap-6 max-w-6xl mx-auto">
              {/* AI Analysis */}
              <div className="feature-card bg-white rounded-lg p-5">
                <div className="icon-badge blue mb-3">
                  <span className="text-xl">🤖</span>
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">AI-Powered Analysis</h3>
                <p className="text-sm text-slate-600 mb-3">Get instant insights on structure, compliance, and quality with our advanced AI engine.</p>
                <span className="text-xs text-blue-600 font-medium">Beta</span>
              </div>
              
              {/* Real-time Collab */}
              <div className="feature-card bg-white rounded-lg p-5">
                <div className="icon-badge green mb-3">
                  <span className="text-xl">💬</span>
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">Real-time Collaboration</h3>
                <p className="text-sm text-slate-600 mb-3">Leave comments, tag colleagues, and track changes across your team seamlessly.</p>
                <span className="text-xs text-green-600 font-medium">Live</span>
              </div>
              
              {/* Smart Suggestions */}
              <div className="feature-card bg-white rounded-lg p-5">
                <div className="icon-badge purple mb-3">
                  <span className="text-xl">💡</span>
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">Smart Suggestions</h3>
                <p className="text-sm text-slate-600 mb-3">Receive contextual recommendations to improve clarity and regulatory alignment.</p>
                <span className="text-xs text-purple-600 font-medium">Enhanced</span>
              </div>
              
              {/* Version Control */}
              <div className="feature-card bg-white rounded-lg p-5">
                <div className="icon-badge orange mb-3">
                  <span className="text-xl">📊</span>
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">Version Control</h3>
                <p className="text-sm text-slate-600 mb-3">Track every change with auto-save and compare document versions side-by-side.</p>
                <span className="text-xs text-orange-600 font-medium">Coming Soon</span>
              </div>
              
              {/* Export Options */}
              <div className="feature-card bg-white rounded-lg p-5">
                <div className="icon-badge blue mb-3">
                  <span className="text-xl">📤</span>
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">Export Anywhere</h3>
                <p className="text-sm text-slate-600 mb-3">Export to PDF, Word, or Markdown with all comments and suggestions preserved.</p>
                <span className="text-xs text-blue-600 font-medium">Live</span>
              </div>
              
              {/* Custom Prompts */}
              <div className="feature-card bg-white rounded-lg p-5">
                <div className="icon-badge green mb-3">
                  <span className="text-xl">⚙️</span>
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">Custom Prompts</h3>
                <p className="text-sm text-slate-600 mb-3">Tailor AI analysis with custom prompts for OSFI, Basel, or internal guidelines.</p>
                <span className="text-xs text-green-600 font-medium">Beta</span>
              </div>
            </div>
          </div>
        </details>

        {/* How Does It Work? - Collapsible */}
        <details id="how-it-works" className="bg-white rounded-xl shadow-sm border border-slate-200 collapsible-section">
          <summary className="cursor-pointer p-6 font-semibold text-lg text-slate-900 flex items-center justify-between hover:bg-slate-50 transition-colors rounded-xl">
            <div className="flex items-center gap-3">
              <div className="icon-badge purple">
                <span className="text-xl">🚀</span>
              </div>
              <div>
                <div className="font-semibold text-slate-900">How Does It Work?</div>
                <div className="text-sm font-normal text-slate-600">Complete review workflow in 6 phases</div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 transition-transform group-open:rotate-90" />
          </summary>
          <div className="px-6 pb-6 pt-2 space-y-3">
            
            {/* Phase 1: Setup & Analysis */}
            <details className="bg-slate-50 rounded-lg border border-slate-200">
              <summary className="cursor-pointer p-4 flex items-center justify-between hover:bg-slate-100 transition-colors rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg">1</div>
                  <div>
                    <div className="font-semibold text-slate-900">Setup & Analysis</div>
                    <div className="text-xs text-slate-600">3 steps</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </summary>
              <div className="px-4 pb-4 pt-2 space-y-2 text-sm text-slate-600">
                <div>• Upload your policy document (PDF/Word)</div>
                <div>• AI extracts content and structure</div>
                <div>• Initial compliance scan performed</div>
              </div>
            </details>

            {/* Phase 2: Deep Understanding */}
            <details className="bg-slate-50 rounded-lg border border-slate-200">
              <summary className="cursor-pointer p-4 flex items-center justify-between hover:bg-slate-100 transition-colors rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold text-lg">2</div>
                  <div>
                    <div className="font-semibold text-slate-900">Deep Understanding</div>
                    <div className="text-xs text-slate-600">3 steps</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </summary>
              <div className="px-4 pb-4 pt-2 space-y-2 text-sm text-slate-600">
                <div>• AI analyzes document structure & clarity</div>
                <div>• Identifies gaps and compliance issues</div>
                <div>• Generates detailed analysis report</div>
              </div>
            </details>

            {/* Phase 3: Review & Annotate */}
            <details className="bg-slate-50 rounded-lg border border-slate-200">
              <summary className="cursor-pointer p-4 flex items-center justify-between hover:bg-slate-100 transition-colors rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-bold text-lg">3</div>
                  <div>
                    <div className="font-semibold text-slate-900">Review & Annotate</div>
                    <div className="text-xs text-slate-600">3 steps</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </summary>
              <div className="px-4 pb-4 pt-2 space-y-2 text-sm text-slate-600">
                <div>• Read through AI analysis & insights</div>
                <div>• Add comments on specific sections</div>
                <div>• Highlight areas needing attention</div>
              </div>
            </details>

            {/* Phase 4: Request AI Help */}
            <details className="bg-slate-50 rounded-lg border border-slate-200">
              <summary className="cursor-pointer p-4 flex items-center justify-between hover:bg-slate-100 transition-colors rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg">4</div>
                  <div>
                    <div className="font-semibold text-slate-900">Request AI Help</div>
                    <div className="text-xs text-slate-600">3 steps</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </summary>
              <div className="px-4 pb-4 pt-2 space-y-2 text-sm text-slate-600">
                <div>• Select text and ask AI for improvements</div>
                <div>• Get contextual rewording suggestions</div>
                <div>• Request compliance alignment help</div>
              </div>
            </details>

            {/* Phase 5: Make Edits */}
            <details className="bg-slate-50 rounded-lg border border-slate-200">
              <summary className="cursor-pointer p-4 flex items-center justify-between hover:bg-slate-100 transition-colors rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-lg">5</div>
                  <div>
                    <div className="font-semibold text-slate-900">Make Edits</div>
                    <div className="text-xs text-slate-600">3 steps</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </summary>
              <div className="px-4 pb-4 pt-2 space-y-2 text-sm text-slate-600">
                <div>• Accept or reject AI suggestions</div>
                <div>• Make manual edits directly in editor</div>
                <div>• Changes auto-save every 5 seconds</div>
              </div>
            </details>

            {/* Phase 6: Collaborate & Export */}
            <details className="bg-slate-50 rounded-lg border border-slate-200">
              <summary className="cursor-pointer p-4 flex items-center justify-between hover:bg-slate-100 transition-colors rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold text-lg">6</div>
                  <div>
                    <div className="font-semibold text-slate-900">Collaborate & Export</div>
                    <div className="text-xs text-slate-600">3 steps</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </summary>
              <div className="px-4 pb-4 pt-2 space-y-2 text-sm text-slate-600">
                <div>• Share with team for review</div>
                <div>• Track all changes & comments</div>
                <div>• Export to PDF/Word with audit trail</div>
              </div>
            </details>

          </div>
        </details>
      </div>

      {/* Help Button - Fixed Position */}
      <button className="help-button" title="Need help?">
        <span className="text-white text-xl">💬</span>
      </button>

      {uploadModalOpen && (
        <UploadModal onClose={() => { setUploadModalOpen(false); refresh(); }} />
      )}
    </div>
  );
}
