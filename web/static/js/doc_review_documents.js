/**
 * Documents List Page - Vanilla JavaScript Implementation
 * Migrated from React component DocumentsList.tsx
 */

const DocumentsPage = {
    state: {
        documents: [],
        filteredDocuments: [],
        searchQuery: '',
        statusFilter: 'All',
        loading: false,
        error: null,
        deletingId: null,
        pollInterval: null,
    },

    init() {
        console.log('[DocumentsPage] Initializing...');
        this.loadDocuments();
        this.bindEvents();
    },

    bindEvents() {
        // Search input debounce
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    this.handleSearch();
                }, 300);
            });
        }
    },

    async loadDocuments() {
        this.setLoading(true);
        this.setError(null);

        try {
            console.log('[DocumentsPage] Fetching documents...');
            const response = await fetch('/api/doc_review/documents', {
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            console.log('[DocumentsPage] Response status:', response.status);

            if (!response.ok) {
                throw new Error(`Failed to load documents: ${response.statusText}`);
            }

            console.log('[DocumentsPage] Parsing JSON response...');
            const data = await response.json();
            console.log('[DocumentsPage] Parsed response, documents count:', data.documents?.length || 0);

            this.state.documents = (data.documents || []).map(doc => ({
                ...doc,
                _displayName: doc.file_metadata?.name || doc.file_id,
            }));

            console.log('[DocumentsPage] Mapped documents, applying filters...');
            this.applyFilters();
            console.log('[DocumentsPage] Rendering...');
            this.render();
            console.log('[DocumentsPage] Starting polling...');
            this.startPolling();
            console.log('[DocumentsPage] Load complete');
        } catch (error) {
            console.error('[DocumentsPage] Load error:', error);
            this.setError(error.message || 'Failed to load documents');
            this.render();
        } finally {
            console.log('[DocumentsPage] Setting loading to false');
            this.setLoading(false);
            this.render(); // Re-render after setting loading to false
        }
    },

    applyFilters() {
        let filtered = [...this.state.documents];

        // Apply search filter
        if (this.state.searchQuery) {
            const query = this.state.searchQuery.toLowerCase();
            filtered = filtered.filter(doc => {
                const name = (doc._displayName || '').toLowerCase();
                const fileId = (doc.file_id || '').toLowerCase();
                return name.includes(query) || fileId.includes(query);
            });
        }

        // Apply status filter
        if (this.state.statusFilter !== 'All') {
            filtered = filtered.filter(doc => {
                const status = (doc.status || '').toLowerCase();
                if (this.state.statusFilter === 'In Progress') {
                    return status === 'running';
                }
                if (this.state.statusFilter === 'Completed') {
                    return status === 'completed' || status === 'ready';
                }
                if (this.state.statusFilter === 'Needs Review') {
                    return !status || status === 'unknown';
                }
                return true;
            });
        }

        this.state.filteredDocuments = filtered;
    },

    render() {
        const loadingEl = document.getElementById('loadingState');
        const errorEl = document.getElementById('errorState');
        const emptyEl = document.getElementById('emptyState');
        const mainEl = document.getElementById('mainContent');
        const tableBody = document.getElementById('documentsTableBody');

        // Show/hide states
        if (this.state.loading) {
            loadingEl?.classList.remove('d-none');
            errorEl?.classList.add('d-none');
            emptyEl?.classList.add('d-none');
            mainEl?.classList.add('d-none');
            return;
        }

        if (this.state.error) {
            loadingEl?.classList.add('d-none');
            errorEl?.classList.remove('d-none');
            emptyEl?.classList.add('d-none');
            mainEl?.classList.add('d-none');
            const errorMsg = document.getElementById('errorMessage');
            if (errorMsg) errorMsg.textContent = this.state.error;
            return;
        }

        if (this.state.filteredDocuments.length === 0 && this.state.documents.length === 0) {
            loadingEl?.classList.add('d-none');
            errorEl?.classList.add('d-none');
            emptyEl?.classList.remove('d-none');
            mainEl?.classList.add('d-none');
            return;
        }

        // Show main content
        loadingEl?.classList.add('d-none');
        errorEl?.classList.add('d-none');
        emptyEl?.classList.add('d-none');
        mainEl?.classList.remove('d-none');

        // Render table
        if (tableBody) {
            if (this.state.filteredDocuments.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="text-center py-4 text-muted">
                            No documents match your search criteria.
                        </td>
                    </tr>
                `;
            } else {
                tableBody.innerHTML = this.state.filteredDocuments.map(doc => this.renderRow(doc)).join('');
            }
        }
    },

    renderRow(doc) {
        const statusBadge = this.getStatusBadge(doc.status, doc);
        const displayName = doc._displayName || doc.file_id;
        const fileId = doc.file_id || '';
        const updatedAt = doc.updated_at || '';
        const userName = 'saad'; // TODO: Get from session
        const isDeleting = this.state.deletingId === fileId;

        return `
            <tr class="document-row" onclick="DocumentsPage.openDocument('${fileId}')" style="cursor: pointer;">
                <td>
                    <span class="text-truncate d-block" title="${displayName}">${this.escapeHtml(displayName)}</span>
                </td>
                <td>${statusBadge}</td>
                <td>
                    <span class="text-muted">${this.escapeHtml(updatedAt)}</span>
                </td>
                <td>
                    <span class="text-muted">${this.escapeHtml(userName)}</span>
                </td>
                <td>
                    <span class="text-muted text-truncate d-block" title="${fileId}">${this.escapeHtml(fileId)}</span>
                </td>
                <td>
                    <button 
                        class="btn btn-sm btn-link text-danger p-1" 
                        onclick="event.stopPropagation(); DocumentsPage.handleDelete('${fileId}', '${this.escapeHtml(displayName)}')"
                        ${isDeleting ? 'disabled' : ''}
                        title="Delete document"
                    >
                        ${isDeleting 
                            ? '<span class="spinner-border spinner-border-sm"></span>' 
                            : '<i class="bi bi-trash"></i>'
                        }
                    </button>
                </td>
            </tr>
        `;
    },

    getStatusBadge(status, doc) {
        const statusLower = (status || '').toLowerCase();
        
        if (statusLower === 'completed' || statusLower === 'ready') {
            return '<span class="badge bg-success">' + status + '</span>';
        }
        
        if (statusLower === 'running') {
            // Show progress if available
            const stats = doc?.state?.structure?.ingestion_stats;
            if (stats && stats.total_pages && stats.processed_pages !== undefined) {
                const progress = Math.round((stats.processed_pages / stats.total_pages) * 100);
                return `
                    <div>
                        <span class="badge bg-warning">
                            <span class="spinner-border spinner-border-sm me-1"></span>
                            processing
                        </span>
                        <div class="small text-primary mt-1">
                            Page ${stats.processed_pages}/${stats.total_pages} (${progress}%)
                        </div>
                    </div>
                `;
            }
            return '<span class="badge bg-warning"><span class="spinner-border spinner-border-sm me-1"></span> processing</span>';
        }
        
        if (statusLower === 'error') {
            return '<span class="badge bg-danger">error</span>';
        }
        
        return '<span class="badge bg-secondary">' + (status || 'draft') + '</span>';
    },

    handleSearch() {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            this.state.searchQuery = searchInput.value;
            this.applyFilters();
            this.render();
        }
    },

    handleFilterChange() {
        const filterSelect = document.getElementById('statusFilter');
        if (filterSelect) {
            this.state.statusFilter = filterSelect.value;
            this.applyFilters();
            this.render();
        }
    },

    async handleDelete(fileId, fileName) {
        if (!confirm(`Are you sure you want to delete "${fileName}"?\n\nThis action cannot be undone.`)) {
            return;
        }

        this.state.deletingId = fileId;
        this.render();

        try {
            const response = await fetch(`/api/doc_review/documents/${encodeURIComponent(fileId)}`, {
                method: 'DELETE',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error || response.statusText);
            }

            console.log('[DocumentsPage] Document deleted:', fileId);
            await this.loadDocuments();
        } catch (error) {
            console.error('[DocumentsPage] Delete failed:', error);
            alert(`Failed to delete document: ${error.message || 'Unknown error'}`);
        } finally {
            this.state.deletingId = null;
            this.render();
        }
    },

    openDocument(fileId) {
        // Navigate to workspace with document
        window.location.href = `/doc-review/workspace/${encodeURIComponent(fileId)}`;
    },

    showUploadModal() {
        const modalEl = document.getElementById('uploadModal');
        if (modalEl) {
            // Reset modal state
            this.resetUploadModal();
            
            // Set aria-hidden to false before showing
            modalEl.setAttribute('aria-hidden', 'false');
            
            const modal = new bootstrap.Modal(modalEl, {
                backdrop: true,
                keyboard: true,
                focus: true
            });
            
            // Handle modal events to manage aria-hidden properly
            modalEl.addEventListener('hidden.bs.modal', () => {
                modalEl.setAttribute('aria-hidden', 'true');
                // Move focus away from modal when it's hidden
                const activeElement = document.activeElement;
                if (activeElement && modalEl.contains(activeElement)) {
                    // Focus on the upload button that opened the modal
                    const uploadBtn = document.querySelector('[onclick*="showUploadModal"]');
                    if (uploadBtn) {
                        uploadBtn.focus();
                    } else {
                        document.body.focus();
                    }
                }
            });
            
            modal.show();
        } else {
            console.warn('[DocumentsPage] Upload modal not found');
        }
    },

    resetUploadModal() {
        // Reset file input
        const fileInput = document.getElementById('fileInput');
        if (fileInput) fileInput.value = '';
        
        // Reset UI states
        document.getElementById('uploadFileSelection')?.classList.remove('d-none');
        document.getElementById('uploadProgress')?.classList.add('d-none');
        document.getElementById('uploadError')?.classList.add('d-none');
        document.getElementById('uploadSuccess')?.classList.add('d-none');
        
        // Reset button
        const btnUpload = document.getElementById('btnUpload');
        if (btnUpload) btnUpload.disabled = true;
        
        // Clear status
        this.updateUploadStatus('', '');
        this.updateUploadProgress(0);
    },

    handleFileSelect(event) {
        const file = event.target.files[0];
        const btnUpload = document.getElementById('btnUpload');
        
        if (!file) {
            if (btnUpload) btnUpload.disabled = true;
            return;
        }

        // Validate file type
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            this.showUploadError('Please select a PDF file.');
            if (btnUpload) btnUpload.disabled = true;
            return;
        }

        // Validate file size (50MB max)
        const maxSize = 50 * 1024 * 1024; // 50MB
        if (file.size > maxSize) {
            this.showUploadError('File size exceeds 50MB limit.');
            if (btnUpload) btnUpload.disabled = true;
            return;
        }

        // Enable upload button
        if (btnUpload) btnUpload.disabled = false;
        
        // Hide any previous errors
        document.getElementById('uploadError')?.classList.add('d-none');
    },

    async uploadDocument() {
        const fileInput = document.getElementById('fileInput');
        if (!fileInput || !fileInput.files[0]) {
            this.showUploadError('Please select a file first.');
            return;
        }

        const file = fileInput.files[0];
        const btnUpload = document.getElementById('btnUpload');
        const modalClose = document.getElementById('uploadModalClose');

        // Disable controls
        if (btnUpload) btnUpload.disabled = true;
        if (fileInput) fileInput.disabled = true;
        if (modalClose) modalClose.disabled = true;

        // Show progress UI
        document.getElementById('uploadFileSelection')?.classList.add('d-none');
        document.getElementById('uploadProgress')?.classList.remove('d-none');
        document.getElementById('uploadError')?.classList.add('d-none');
        document.getElementById('uploadSuccess')?.classList.add('d-none');

        try {
            // Step 1: Upload file
            this.updateUploadStatus('Uploading file...', '');
            this.updateUploadProgress(10);

            const formData = new FormData();
            formData.append('file', file);

            const uploadResponse = await fetch('/api/doc_review/upload', {
                method: 'POST',
                credentials: 'same-origin',
                body: formData,
            });

            if (!uploadResponse.ok) {
                const errorData = await uploadResponse.json().catch(() => ({}));
                throw new Error(errorData.error || `Upload failed: ${uploadResponse.statusText}`);
            }

            const uploadData = await uploadResponse.json();
            const savedPath = uploadData.saved_path;
            const fileId = uploadData.file_id;

            console.log('[DocumentsPage] File uploaded:', uploadData);

            // Step 2: Register document
            this.updateUploadStatus('Registering document...', '');
            this.updateUploadProgress(30);

            const registerResponse = await fetch('/api/doc_review/documents', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    source_path: savedPath,
                    file_id: fileId,
                }),
            });

            if (!registerResponse.ok) {
                const errorData = await registerResponse.json().catch(() => ({}));
                throw new Error(errorData.error || `Registration failed: ${registerResponse.statusText}`);
            }

            const registerData = await registerResponse.json();
            const registeredFileId = registerData.document?.file_id || fileId;

            console.log('[DocumentsPage] Document registered:', registeredFileId);

            // Step 3: Start Phase 1 ingestion
            this.updateUploadStatus('Processing document...', 'This may take a few minutes. Please wait.');
            this.updateUploadProgress(50);

            await this.startIngestion(registeredFileId);

            // Step 4: Poll for completion
            this.updateUploadStatus('Waiting for processing to complete...', '');
            this.updateUploadProgress(70);

            await this.pollDocumentStatus(registeredFileId);

            // Success!
            this.updateUploadProgress(100);
            this.updateUploadStatus('Ready!', 'Document processed successfully.');
            document.getElementById('uploadSuccess')?.classList.remove('d-none');

            // Refresh documents list
            await this.loadDocuments();

            // Navigate to workspace after 1.5 seconds
            setTimeout(() => {
                this.openDocument(registeredFileId);
            }, 1500);

        } catch (error) {
            console.error('[DocumentsPage] Upload error:', error);
            this.showUploadError(error.message || 'An error occurred during upload.');
            this.updateUploadProgress(0);
            
            // Re-enable controls
            if (fileInput) fileInput.disabled = false;
            if (btnUpload) btnUpload.disabled = false;
            if (modalClose) modalClose.disabled = false;
        }
    },

    async startIngestion(fileId) {
        try {
            const response = await fetch(`/api/doc_review/documents/${encodeURIComponent(fileId)}/run_phase1`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    use_direct_json: true, // PDF → JSON directly, no markdown
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Ingestion failed: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('[DocumentsPage] Phase 1 ingestion started:', data);
            return data;
        } catch (error) {
            console.error('[DocumentsPage] Ingestion error:', error);
            throw error;
        }
    },

    async pollDocumentStatus(fileId, maxAttempts = 300) {
        // Poll for up to 10 minutes (300 attempts * 2 seconds)
        let attempts = 0;

        return new Promise((resolve, reject) => {
            const pollInterval = setInterval(async () => {
                attempts++;

                try {
                    const response = await fetch(`/api/doc_review/documents/${encodeURIComponent(fileId)}`, {
                        credentials: 'same-origin',
                    });

                    if (!response.ok) {
                        throw new Error(`Failed to check status: ${response.statusText}`);
                    }

                    const data = await response.json();
                    const document = data.document || data;
                    const status = (document.status || '').toLowerCase();

                    console.log(`[DocumentsPage] Status check ${attempts}/${maxAttempts}: ${status}`);

                    if (status === 'ready') {
                        clearInterval(pollInterval);
                        resolve(document);
                    } else if (status === 'error') {
                        clearInterval(pollInterval);
                        reject(new Error('Document processing failed. Please try again.'));
                    } else if (attempts >= maxAttempts) {
                        clearInterval(pollInterval);
                        reject(new Error('Processing timeout. The document may still be processing. Please check back later.'));
                    }
                    // Continue polling if status is 'running' or other
                } catch (error) {
                    clearInterval(pollInterval);
                    reject(error);
                }
            }, 2000); // Poll every 2 seconds
        });
    },

    updateUploadStatus(text, detail) {
        const statusText = document.getElementById('uploadStatusText');
        const statusDetail = document.getElementById('uploadStatusDetail');
        if (statusText) statusText.textContent = text;
        if (statusDetail) statusDetail.textContent = detail;
    },

    updateUploadProgress(percent) {
        const progressBar = document.getElementById('uploadProgressBar');
        if (progressBar) {
            progressBar.style.width = `${percent}%`;
            progressBar.setAttribute('aria-valuenow', percent);
        }
    },

    showUploadError(message) {
        const errorDiv = document.getElementById('uploadError');
        const errorMessage = document.getElementById('uploadErrorMessage');
        if (errorDiv) errorDiv.classList.remove('d-none');
        if (errorMessage) errorMessage.textContent = message;
    },

    scrollToHowItWorks() {
        const section = document.getElementById('howItWorks');
        if (section) {
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setTimeout(() => {
                section.open = true;
            }, 500);
        }
    },

    startPolling() {
        // Stop existing polling
        if (this.state.pollInterval) {
            clearInterval(this.state.pollInterval);
        }

        // Check if there are running documents
        const hasRunningDocs = this.state.documents.some(d => (d.status || '').toLowerCase() === 'running');
        if (!hasRunningDocs) {
            return;
        }

        // Poll every 2 seconds
        this.state.pollInterval = setInterval(async () => {
            try {
                const response = await fetch('/api/doc_review/documents', {
                    credentials: 'same-origin',
                });
                if (response.ok) {
                    const data = await response.json();
                    this.state.documents = (data.documents || []).map(doc => ({
                        ...doc,
                        _displayName: doc.file_metadata?.name || doc.file_id,
                    }));
                    this.applyFilters();
                    this.render();

                    // Stop polling if no running documents
                    const stillRunning = this.state.documents.some(d => (d.status || '').toLowerCase() === 'running');
                    if (!stillRunning && this.state.pollInterval) {
                        clearInterval(this.state.pollInterval);
                        this.state.pollInterval = null;
                    }
                }
            } catch (error) {
                console.error('[DocumentsPage] Polling error:', error);
            }
        }, 2000);
    },

    refresh() {
        this.loadDocuments();
    },

    setLoading(loading) {
        this.state.loading = loading;
    },

    setError(error) {
        this.state.error = error;
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    DocumentsPage.init();
});

