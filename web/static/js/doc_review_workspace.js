/**
 * Workspace Page - Vanilla JavaScript Implementation
 * Handles three-pane layout with editor island
 */

// WorkspacePage v20250124-001
console.log('[WorkspacePage] Script loaded - Version: 20250124-001', new Date().toISOString());

const WorkspacePage = {
    state: {
        fileId: null,
        docState: null,
        leftPaneWidth: 280,
        rightPaneWidth: 360,
        leftPaneCollapsed: false,
        rightPaneCollapsed: false,
        isResizing: false,
        resizeTarget: null,
        startX: 0,
        startWidth: 0,
        analysisSections: [],
        chatMessages: [],
        selectedBlocks: [],
        textSuggestion: null,
        socket: null,
        comments: [],
        showResolvedComments: false,
        saveStatus: 'idle', // 'idle' | 'saving' | 'saved'
        currentMode: 'editing', // 'editing' | 'original' | 'diff'
        showCommentsPanel: false,
    },

    init(options = {}) {
        console.log('[WorkspacePage] Initializing... Version: 20250124-001', options);
        console.log('[WorkspacePage] updateDocumentHeader exists?', typeof this.updateDocumentHeader);
        this.state.fileId = options.fileId || null;
        this.state.docState = options.docState || null;
        
        // Force white background on header
        this.forceWhiteHeader();

        this.setupResizing();
        this.setupEditorIntegration();
        this.loadLeftPaneData();
        this.loadRightPaneData();
        this.loadComments();
        // Delay header update to ensure DOM is ready
        setTimeout(() => {
            console.log('[WorkspacePage] Checking updateDocumentHeader in setTimeout...', typeof this.updateDocumentHeader);
            if (this.updateDocumentHeader) {
                console.log('[WorkspacePage] Calling updateDocumentHeader()');
                this.updateDocumentHeader();
            } else {
                console.error('[WorkspacePage] ERROR: updateDocumentHeader is not a function!');
                console.error('[WorkspacePage] Available methods:', Object.keys(this).filter(k => typeof this[k] === 'function'));
            }
        }, 100);
        this.setupSocketIO();
        this.bindEvents();
        this.setupLeftPaneToggle();
        
        // Listen for editor ready event
        document.addEventListener('docEditor:ready', () => {
            console.log('[WorkspacePage] Editor ready event received, applying highlights');
            // Apply highlights when editor becomes ready
            setTimeout(() => {
                console.log('[WorkspacePage] Applying highlights after delay...');
                this.applyCommentHighlights();
                this.applyAISuggestionHighlights();
            }, 1000); // Increased delay to ensure editor is fully initialized
        });
        
        // Also try to apply highlights after a delay (fallback if event doesn't fire)
        setTimeout(() => {
            if (window.docEditor && window.docEditor.getEditorInstance) {
                console.log('[WorkspacePage] Fallback: Applying highlights after timeout');
                this.applyCommentHighlights();
                this.applyAISuggestionHighlights();
            }
        }, 2000);
    },
    
    setupLeftPaneToggle() {
        // Show toggle button initially (left pane is hidden by default)
        const toggleBtn = document.getElementById('leftPaneToggleBtn');
        if (toggleBtn) {
            toggleBtn.style.display = 'block';
        }
    },

    setupResizing() {
        const leftHandle = document.getElementById('resizeHandleLeft');
        const rightHandle = document.getElementById('resizeHandleRight');
        const leftPane = document.getElementById('leftPane');
        const rightPane = document.getElementById('rightPane');

        // Left pane resize
        if (leftHandle && leftPane) {
            leftHandle.addEventListener('mousedown', (e) => {
                this.startResize('left', e, leftPane);
            });
        }

        // Right pane resize
        if (rightHandle && rightPane) {
            rightHandle.addEventListener('mousedown', (e) => {
                this.startResize('right', e, rightPane);
            });
        }

        // Global mouse events for resizing
        document.addEventListener('mousemove', (e) => this.handleResize(e));
        document.addEventListener('mouseup', () => this.stopResize());
    },

    startResize(target, e, pane) {
        this.state.isResizing = true;
        this.state.resizeTarget = target;
        this.state.startX = e.clientX;
        this.state.startWidth = pane.offsetWidth;
        
        const handle = target === 'left' ? document.getElementById('resizeHandleLeft') : document.getElementById('resizeHandleRight');
        if (handle) handle.classList.add('active');
        
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    },

    handleResize(e) {
        if (!this.state.isResizing) return;

        const diff = e.clientX - this.state.startX;
        const pane = this.state.resizeTarget === 'left' 
            ? document.getElementById('leftPane')
            : document.getElementById('rightPane');

        if (!pane) return;

        let newWidth;
        if (this.state.resizeTarget === 'left') {
            newWidth = Math.max(200, Math.min(500, this.state.startWidth + diff));
            this.state.leftPaneWidth = newWidth;
            pane.style.width = `${newWidth}px`;
        } else {
            newWidth = Math.max(300, Math.min(600, this.state.startWidth - diff));
            this.state.rightPaneWidth = newWidth;
            pane.style.width = `${newWidth}px`;
        }
    },

    stopResize() {
        if (this.state.isResizing) {
            this.state.isResizing = false;
            const handle = this.state.resizeTarget === 'left' 
                ? document.getElementById('resizeHandleLeft')
                : document.getElementById('resizeHandleRight');
            if (handle) handle.classList.remove('active');
            this.state.resizeTarget = null;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    },

    toggleLeftPane() {
        this.state.leftPaneCollapsed = !this.state.leftPaneCollapsed;
        const leftPane = document.getElementById('leftPane');
        const leftHandle = document.getElementById('resizeHandleLeft');
        const leftToggle = document.getElementById('leftPaneToggle');

        if (this.state.leftPaneCollapsed) {
            leftPane?.classList.add('d-none');
            leftHandle?.classList.add('d-none');
            leftToggle?.classList.remove('d-none');
        } else {
            leftPane?.classList.remove('d-none');
            leftHandle?.classList.remove('d-none');
            leftToggle?.classList.add('d-none');
        }
    },

    toggleRightPane() {
        this.state.rightPaneCollapsed = !this.state.rightPaneCollapsed;
        const rightPane = document.getElementById('rightPane');
        const rightHandle = document.getElementById('resizeHandleRight');
        const rightToggle = document.getElementById('rightPaneToggle');

        if (this.state.rightPaneCollapsed) {
            rightPane?.classList.add('d-none');
            rightHandle?.classList.add('d-none');
            rightToggle?.classList.remove('d-none');
        } else {
            rightPane?.classList.remove('d-none');
            rightHandle?.classList.remove('d-none');
            rightToggle?.classList.add('d-none');
        }
    },

    setupEditorIntegration() {
        // Listen for editor events
        let lastEditorChangeTime = 0;
        let highlightUpdateInProgress = false;
        document.addEventListener('docEditor:change', (event) => {
            const { docState, fileId } = event.detail;
            this.state.docState = docState;
            
            // Throttle to prevent excessive logging/updates (max once per 1000ms)
            const now = Date.now();
            if (now - lastEditorChangeTime < 1000) {
                return;
            }
            lastEditorChangeTime = now;
            
            // Prevent re-applying highlights if already in progress
            if (highlightUpdateInProgress) {
                return;
            }
            
            // Re-apply highlights after editor changes (they might get cleared)
            // Use a small delay to ensure editor state is stable
            highlightUpdateInProgress = true;
            setTimeout(() => {
                this.applyCommentHighlights();
                this.applyAISuggestionHighlights();
                highlightUpdateInProgress = false;
            }, 200);
        });

        document.addEventListener('docEditor:save', (event) => {
            const { fileId, success } = event.detail;
            if (success) {
                console.log('[WorkspacePage] Document saved:', fileId);
                // Reload left pane data if needed
            }
        });

        document.addEventListener('docEditor:selection', (event) => {
            const { selectedText, blockIds } = event.detail;
            this.updateSelectedBlocks(blockIds);
        });

        document.addEventListener('docEditor:addComment', async (event) => {
            const { fileId, blockId, blockIds, blockTitle, selectionText, startOffset, endOffset } = event.detail;
            console.log('[WorkspacePage] Add comment requested:', { fileId, blockId, blockIds, blockTitle, startOffset, endOffset, isMultiBlock: blockIds && blockIds.length > 1 });
            
            // Show comment modal (like React)
            // Store blockIds and offsets for later use when highlighting
            this.showCommentModal(selectionText, blockId, blockTitle, fileId, blockIds, startOffset, endOffset);
        });

        document.addEventListener('docEditor:commentClick', (event) => {
            const { commentIds, fileId } = event.detail;
            console.log('[WorkspacePage] Comment clicked:', commentIds);
            
            // Switch to comments tab
            const commentsTab = document.getElementById('comments-tab');
            if (commentsTab) {
                commentsTab.click();
            }
            
            // Scroll to the comment (if we can find it)
            // The comment ID should be in commentIds array
            if (commentIds.length > 0) {
                const commentElement = document.querySelector(`[data-comment-id="${commentIds[0]}"]`);
                if (commentElement) {
                    commentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    commentElement.classList.add('highlight-comment');
                    setTimeout(() => {
                        commentElement.classList.remove('highlight-comment');
                    }, 2000);
                }
            }
        });

        document.addEventListener('docEditor:improveText', async (event) => {
            const { fileId, selectedText: eventSelectedText } = event.detail;
            console.log('[WorkspacePage] Improve text requested for fileId:', fileId);
            
            // Get selected text from event or fallback to browser selection
            let selectedText = eventSelectedText || '';
            
            if (!selectedText || !selectedText.trim()) {
                // Fallback: try to get from browser selection
                try {
                    const selection = window.getSelection();
                    if (selection && selection.toString().trim()) {
                        selectedText = selection.toString().trim();
                    }
                } catch (error) {
                    console.error('[WorkspacePage] Error getting selection:', error);
                }
            }
            
            if (!selectedText || !selectedText.trim()) {
                alert('Please select some text to improve first.');
                return;
            }
            
            if (selectedText.length > 5000) {
                if (!confirm(`Selected text is very long (${selectedText.length} characters). Continue?`)) {
                    return;
                }
            }
            
            // Show loading indicator
            const loadingMsg = document.createElement('div');
            loadingMsg.id = 'improveTextLoading';
            loadingMsg.className = 'alert alert-info position-fixed top-0 start-50 translate-middle-x mt-3';
            loadingMsg.style.zIndex = '9999';
            loadingMsg.innerHTML = '<i class="bi bi-hourglass-split"></i> AI is improving your text...';
            document.body.appendChild(loadingMsg);
            
            try {
                // Call text improvement API
                const response = await fetch('/api/text-improvement/improve', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    credentials: 'same-origin',
                    body: JSON.stringify({
                        text: selectedText,
                        instruction: 'Improve clarity, grammar, and professionalism while preserving meaning',
                    }),
                });
                
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ error: response.statusText }));
                    throw new Error(errorData.error || `Failed to improve text: ${response.statusText}`);
                }
                
                const data = await response.json();
                
                if (!data.success) {
                    throw new Error(data.error || 'Failed to improve text');
                }
                
                // Get selection offsets NOW (while selection is still available) - BEFORE showing UI
                let blockId = 'unknown';
                let startOffset = null;
                let endOffset = null;
                let savedSuggestionId = null;
                
                if (window.docEditor && window.docEditor.getSelectionOffsets) {
                    const offsets = window.docEditor.getSelectionOffsets();
                    if (offsets) {
                        blockId = offsets.blockId;
                        startOffset = offsets.startOffset;
                        endOffset = offsets.endOffset;
                        console.log('[WorkspacePage] Got selection offsets for AI suggestion:', { blockId, startOffset, endOffset });
                        
                        // SAVE AI suggestion to backend NOW (with 'pending' status)
                        // This preserves the original text position before user accepts/rejects
                        try {
                            const saveResponse = await fetch(`/api/doc_review/${encodeURIComponent(this.state.fileId)}/ai_suggestions`, {
                                method: 'POST',
                                credentials: 'same-origin',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    block_id: blockId,
                                    selection_text: data.original, // Original text that was selected
                                    improved_text: data.improved, // LLM's improved version
                                    status: 'pending', // Will be updated to 'accepted' when user accepts
                                    start_offset: startOffset,
                                    end_offset: endOffset,
                                }),
                            });
                            
                            if (saveResponse.ok) {
                                const saved = await saveResponse.json();
                                savedSuggestionId = saved.id;
                                console.log('[WorkspacePage] Saved AI suggestion to backend:', saved);
                                
                                // Apply highlight immediately with 'pending' status (blue)
                                if (window.docEditor && window.docEditor.applyAISuggestionHighlight) {
                                    window.docEditor.applyAISuggestionHighlight(
                                        savedSuggestionId,
                                        blockId,
                                        data.original, // Highlight the original text
                                        'pending',
                                        startOffset,
                                        endOffset
                                    );
                                }
                            } else {
                                console.error('[WorkspacePage] Failed to save AI suggestion:', await saveResponse.text());
                            }
                        } catch (saveError) {
                            console.error('[WorkspacePage] Error saving AI suggestion:', saveError);
                            // Continue anyway - show suggestion even if save fails
                        }
                    }
                }
                
                // Show text suggestion in chat panel (like React) - not as modal
                // Pass the saved suggestion ID so we can update it when accepting
                this.showTextSuggestionInChat(data.original, data.improved, data.reason, savedSuggestionId, blockId, startOffset, endOffset);
                
            } catch (error) {
                console.error('[WorkspacePage] Error improving text:', error);
                alert('Failed to improve text: ' + error.message);
            } finally {
                // Remove loading indicator
                const loading = document.getElementById('improveTextLoading');
                if (loading) loading.remove();
            }
        });
    },

    async loadLeftPaneData() {
        console.log('[WorkspacePage] loadLeftPaneData() called for fileId:', this.state.fileId);
        if (!this.state.fileId) {
            console.log('[WorkspacePage] No fileId, rendering empty');
            this.renderLeftPaneEmpty();
            return;
        }

        try {
            console.log('[WorkspacePage] Fetching document data...');
            const response = await fetch(`/api/doc_review/documents/${encodeURIComponent(this.state.fileId)}`, {
                credentials: 'same-origin',
            });

            if (!response.ok) {
                throw new Error('Failed to load document');
            }

            const data = await response.json();
            const doc = data.document || data;
            const state = doc.state || {};
            
            console.log('[WorkspacePage] Document state keys:', Object.keys(state));
            console.log('[WorkspacePage] phase1:', state.phase1 ? Object.keys(state.phase1) : 'not found');
            console.log('[WorkspacePage] phase2_data:', state.phase2_data ? Object.keys(state.phase2_data) : 'not found');
            
            // Extract analysis sections
            const phase1 = state.phase1 || {};
            const phase2_data = state.phase2_data || {};
            
            const allSections = [
                { id: 'toc_review', title: '1. TOC & Structure Review', analysis: phase1.toc_review },
                { id: 'conceptual_coverage', title: '2. Conceptual Coverage', analysis: phase2_data.conceptual_coverage },
                { id: 'compliance_governance', title: '3. Compliance & Governance', analysis: phase2_data.compliance_governance },
                { id: 'language_clarity', title: '4. Language & Clarity', analysis: phase2_data.language_clarity },
                { id: 'structural_presentation', title: '5. Structural & Presentation', analysis: phase2_data.structural_presentation },
                { id: 'synthesis', title: '6. 📊 Synthesis Summary', analysis: phase2_data.synthesis },
            ];
            
            console.log('[WorkspacePage] All sections before filter:', allSections.map(s => ({
                id: s.id,
                title: s.title,
                hasAnalysis: !!s.analysis,
                analysisLength: s.analysis ? String(s.analysis).length : 0
            })));
            
            this.state.analysisSections = allSections.filter(s => s.analysis);
            
            console.log('[WorkspacePage] Loaded analysis sections:', this.state.analysisSections.length, 'sections (after filter)');
            console.log('[WorkspacePage] Section titles:', this.state.analysisSections.map(s => s.title));
            
            if (this.state.analysisSections.length === 0) {
                console.warn('[WorkspacePage] No analysis sections found after filtering! All sections were empty.');
            }

            // Load AI suggestions
            await this.loadAISuggestions();

            this.renderLeftPane();
        } catch (error) {
            console.error('[WorkspacePage] Error loading left pane data:', error);
            this.renderLeftPaneEmpty();
        }
    },

    async loadAISuggestions() {
        if (!this.state.fileId) return;

        try {
            const response = await fetch(`/api/doc_review/${encodeURIComponent(this.state.fileId)}/ai_suggestions`, {
                credentials: 'same-origin',
            });

            if (response.ok) {
                const data = await response.json();
                const suggestions = data.suggestions || [];
                
                // Store all suggestions for highlighting
                this.state.aiSuggestions = suggestions;
                
                // Apply AI suggestion highlights in editor
                this.applyAISuggestionHighlights();
            }
        } catch (error) {
            console.error('[WorkspacePage] Error loading AI suggestions:', error);
        }
    },

    renderLeftPane() {
        // Render to analysis pane in right pane instead of left pane
        const content = document.getElementById('analysisContent');
        const empty = document.getElementById('analysisEmpty');
        const sections = document.getElementById('analysisSections');
        const status = document.getElementById('analysisStatus');
        const statusBadge = document.getElementById('analysisStatusBadge');

        console.log('[WorkspacePage] renderLeftPane called, sections count:', this.state.analysisSections.length);
        console.log('[WorkspacePage] DOM elements found:', {
            content: !!content,
            empty: !!empty,
            sections: !!sections,
            status: !!status,
            statusBadge: !!statusBadge
        });

        if (!content) {
            console.warn('[WorkspacePage] analysisContent not found!');
            return;
        }

        if (this.state.analysisSections.length === 0) {
            console.log('[WorkspacePage] No analysis sections, showing empty state');
            if (empty) {
                empty.classList.remove('d-none');
                empty.style.display = 'block';
            }
            if (sections) {
                sections.classList.add('d-none');
                sections.innerHTML = '';
            }
            if (status) status.classList.add('d-none');
            return;
        }

        console.log('[WorkspacePage] Hiding empty state, showing', this.state.analysisSections.length, 'sections');
        if (empty) {
            empty.classList.add('d-none');
            empty.style.display = 'none';
            empty.style.visibility = 'hidden';
            empty.style.opacity = '0';
            empty.style.height = '0';
            empty.style.overflow = 'hidden';
            console.log('[WorkspacePage] Empty state hidden, classes:', empty.className, 'display:', window.getComputedStyle(empty).display);
        }
        if (status) status.classList.remove('d-none');
        if (statusBadge) {
            statusBadge.textContent = `${this.state.analysisSections.length} sections analyzed`;
        }

        // Render analysis sections (show them)
        if (sections) {
            console.log('[WorkspacePage] Rendering', this.state.analysisSections.length, 'sections to DOM');
            // Force remove d-none and ensure visibility
            sections.classList.remove('d-none');
            sections.style.display = 'block';
            sections.style.visibility = 'visible';
            
            const html = this.state.analysisSections.map(section => `
            <div class="analysis-section mb-2 border rounded">
                <div class="analysis-section-header p-2 bg-light cursor-pointer" onclick="WorkspacePage.toggleSection('${section.id}')">
                    <div class="d-flex justify-content-between align-items-center">
                        <span class="fw-semibold">${this.escapeHtml(section.title)}</span>
                        <i class="bi bi-chevron-down" id="icon-${section.id}"></i>
                    </div>
                </div>
                <div class="analysis-section-content d-none p-3" id="content-${section.id}">
                    <div class="small">${this.markdownToHtml(section.analysis || 'No analysis available')}</div>
                </div>
            </div>
        `).join('');
            sections.innerHTML = html;
            console.log('[WorkspacePage] Sections rendered, HTML length:', html.length);
            console.log('[WorkspacePage] Sections element classes after render:', sections.className);
            console.log('[WorkspacePage] Sections element computed style display:', window.getComputedStyle(sections).display);
            
            // Ensure Analysis tab is visible if sections are loaded
            const analysisTab = document.getElementById('analysis-tab');
            const analysisPane = document.getElementById('analysis-pane');
            console.log('[WorkspacePage] Analysis tab exists?', !!analysisTab);
            console.log('[WorkspacePage] Analysis pane exists?', !!analysisPane);
            if (analysisTab && analysisPane) {
                // Show the tab if it's hidden
                analysisTab.classList.remove('d-none');
                console.log('[WorkspacePage] Analysis pane classes before:', analysisPane.className);
                // Make sure the pane is visible (use Bootstrap Tab API if available)
                if (!analysisPane.classList.contains('active') && !analysisPane.classList.contains('show')) {
                    console.log('[WorkspacePage] Activating Analysis tab...');
                    
                    // Try using Bootstrap's Tab API if available
                    if (window.bootstrap && window.bootstrap.Tab) {
                        try {
                            const tab = new window.bootstrap.Tab(analysisTab);
                            tab.show();
                            // Force show class immediately (Bootstrap might delay it)
                            analysisPane.classList.add('show');
                            analysisPane.style.display = 'flex';
                            console.log('[WorkspacePage] Activated Analysis tab using Bootstrap Tab API');
                        } catch (e) {
                            console.warn('[WorkspacePage] Bootstrap Tab API failed, using manual activation:', e);
                            // Fallback to manual activation
                            document.querySelectorAll('.nav-link.active').forEach(tab => tab.classList.remove('active'));
                            document.querySelectorAll('.tab-pane.active.show').forEach(pane => {
                                pane.classList.remove('active', 'show');
                            });
                            analysisTab.classList.add('active');
                            analysisPane.classList.add('active', 'show');
                        }
                    } else {
                        // Manual activation if Bootstrap not available
                        document.querySelectorAll('.nav-link.active').forEach(tab => tab.classList.remove('active'));
                        document.querySelectorAll('.tab-pane.active.show').forEach(pane => {
                            pane.classList.remove('active', 'show');
                        });
                        analysisTab.classList.add('active');
                        analysisPane.classList.add('active', 'show');
                    }
                    console.log('[WorkspacePage] Analysis pane classes after:', analysisPane.className);
                } else {
                    console.log('[WorkspacePage] Analysis tab already active');
                }
            }
            
            // Double-check sections visibility and ensure tab stays active
            setTimeout(() => {
                const checkSections = document.getElementById('analysisSections');
                const checkTab = document.getElementById('analysis-tab');
                const checkPane = document.getElementById('analysis-pane');
                
                if (checkSections) {
                    const visibilityInfo = {
                        hasDNone: checkSections.classList.contains('d-none'),
                        computedDisplay: window.getComputedStyle(checkSections).display,
                        computedVisibility: window.getComputedStyle(checkSections).visibility,
                        innerHTMLLength: checkSections.innerHTML.length,
                        parentPaneActive: checkPane?.classList.contains('active'),
                        parentPaneShow: checkPane?.classList.contains('show'),
                        parentPaneDisplay: checkPane ? window.getComputedStyle(checkPane).display : 'N/A',
                        tabActive: checkTab?.classList.contains('active')
                    };
                    console.log('[WorkspacePage] Sections visibility check:', visibilityInfo);
                    
                    // If pane is active but missing show class, add it immediately
                    if (checkPane && checkPane.classList.contains('active') && !checkPane.classList.contains('show')) {
                        console.log('[WorkspacePage] Pane is active but missing show class, adding it...');
                        checkPane.classList.add('show');
                        checkPane.style.display = 'flex';
                    }
                    
                    // Double-check empty state is hidden if sections exist
                    const checkEmpty = document.getElementById('analysisEmpty');
                    if (checkSections && checkSections.innerHTML.length > 0 && checkEmpty) {
                        if (!checkEmpty.classList.contains('d-none')) {
                            console.log('[WorkspacePage] Empty state still visible! Hiding it...');
                            checkEmpty.classList.add('d-none');
                            checkEmpty.style.display = 'none';
                            checkEmpty.style.visibility = 'hidden';
                        }
                    }
                    
                    // If sections are loaded but tab is not active, reactivate it
                    if (checkSections.innerHTML.length > 0 && (!checkPane?.classList.contains('active') || !checkPane?.classList.contains('show'))) {
                        console.log('[WorkspacePage] Sections disappeared! Reactivating Analysis tab...');
                        
                        // Use Bootstrap Tab API if available
                        if (checkTab && window.bootstrap && window.bootstrap.Tab) {
                            try {
                                const tab = new window.bootstrap.Tab(checkTab);
                                tab.show();
                                // Force show class
                                if (checkPane) {
                                    checkPane.classList.add('show');
                                    checkPane.style.display = 'flex';
                                }
                                console.log('[WorkspacePage] Reactivated using Bootstrap Tab API');
                            } catch (e) {
                                console.warn('[WorkspacePage] Bootstrap Tab API failed, using manual:', e);
                                // Fallback
                                document.querySelectorAll('.nav-link.active').forEach(tab => tab.classList.remove('active'));
                                document.querySelectorAll('.tab-pane.active.show').forEach(pane => {
                                    pane.classList.remove('active', 'show');
                                });
                                if (checkTab) checkTab.classList.add('active');
                                if (checkPane) {
                                    checkPane.classList.add('active', 'show');
                                    checkPane.style.display = 'flex';
                                }
                            }
                        } else {
                            // Manual activation
                            document.querySelectorAll('.nav-link.active').forEach(tab => tab.classList.remove('active'));
                            document.querySelectorAll('.tab-pane.active.show').forEach(pane => {
                                pane.classList.remove('active', 'show');
                            });
                            if (checkTab) checkTab.classList.add('active');
                            if (checkPane) {
                                checkPane.classList.add('active', 'show');
                                checkPane.style.display = 'flex';
                            }
                        }
                        
                        // Ensure sections are visible
                        checkSections.classList.remove('d-none');
                        checkSections.style.display = 'block';
                        checkSections.style.visibility = 'visible';
                    }
                }
            }, 100);
            
            // Also check again after a longer delay to catch any delayed tab switches
            setTimeout(() => {
                const checkSections = document.getElementById('analysisSections');
                const checkPane = document.getElementById('analysis-pane');
                if (checkSections && checkSections.innerHTML.length > 0 && (!checkPane?.classList.contains('active') || !checkPane?.classList.contains('show'))) {
                    console.log('[WorkspacePage] Delayed check: Sections still disappeared, reactivating...');
                    const analysisTab = document.getElementById('analysis-tab');
                    if (analysisTab && checkPane) {
                        // Use Bootstrap Tab API if available
                        if (window.bootstrap && window.bootstrap.Tab) {
                            try {
                                const tab = new window.bootstrap.Tab(analysisTab);
                                tab.show();
                                // Force show class and display
                                checkPane.classList.add('show');
                                checkPane.style.display = 'flex';
                                console.log('[WorkspacePage] Delayed reactivation using Bootstrap Tab API');
                            } catch (e) {
                                // Fallback
                                document.querySelectorAll('.nav-link.active').forEach(tab => tab.classList.remove('active'));
                                document.querySelectorAll('.tab-pane.active.show').forEach(pane => {
                                    pane.classList.remove('active', 'show');
                                });
                                analysisTab.classList.add('active');
                                checkPane.classList.add('active', 'show');
                                checkPane.style.display = 'flex';
                            }
                        } else {
                            // Manual activation
                            document.querySelectorAll('.nav-link.active').forEach(tab => tab.classList.remove('active'));
                            document.querySelectorAll('.tab-pane.active.show').forEach(pane => {
                                pane.classList.remove('active', 'show');
                            });
                            analysisTab.classList.add('active');
                            checkPane.classList.add('active', 'show');
                            checkPane.style.display = 'flex';
                        }
                        checkSections.classList.remove('d-none');
                        checkSections.style.display = 'block';
                    }
                }
            }, 500);
        } else {
            console.error('[WorkspacePage] analysisSections element not found in DOM!');
        }
    },

    renderLeftPaneEmpty() {
        console.log('[WorkspacePage] renderLeftPaneEmpty() called');
        const empty = document.getElementById('analysisEmpty');
        const sections = document.getElementById('analysisSections');
        const status = document.getElementById('analysisStatus');
        if (empty) {
            empty.classList.remove('d-none');
            empty.style.display = 'block';
        }
        if (sections) {
            sections.classList.add('d-none');
            sections.innerHTML = '';
        }
        if (status) status.classList.add('d-none');
    },

    toggleSection(sectionId) {
        const content = document.getElementById(`content-${sectionId}`);
        const icon = document.getElementById(`icon-${sectionId}`);
        
        if (content && icon) {
            const isExpanded = !content.classList.contains('d-none');
            if (isExpanded) {
                content.classList.add('d-none');
                icon.classList.remove('bi-chevron-down');
                icon.classList.add('bi-chevron-right');
            } else {
                content.classList.remove('d-none');
                icon.classList.remove('bi-chevron-right');
                icon.classList.add('bi-chevron-down');
            }
        }
    },

    async loadRightPaneData() {
        if (!this.state.fileId) {
            this.renderRightPaneEmpty();
            return;
        }

        // Load chat history
        await this.loadChatHistory();
    },

    async loadChatHistory() {
        if (!this.state.fileId) return;

        try {
            const response = await fetch(`/api/doc_review/${encodeURIComponent(this.state.fileId)}/chat`, {
                credentials: 'same-origin',
            });

            if (response.ok) {
                const data = await response.json();
                this.state.chatMessages = (data.messages || []).map(msg => ({
                    id: msg.id,
                    role: msg.role,
                    content: msg.content,
                    timestamp: msg.timestamp,
                }));
                this.renderChatMessages();
            }
        } catch (error) {
            console.error('[WorkspacePage] Error loading chat history:', error);
        }
    },

    renderChatMessages() {
        const container = document.getElementById('chatMessages');
        if (!container) return;

        if (this.state.chatMessages.length === 0) {
            container.innerHTML = '<div class="text-center text-muted py-2"><small>No messages yet. Start a conversation with RiskGPT.</small></div>';
            return;
        }

        container.innerHTML = this.state.chatMessages.map(msg => {
            // Escape HTML and preserve newlines (CSS white-space: pre-wrap will handle formatting)
            const formattedContent = this.escapeHtml(msg.content);
            
            return `
            <div class="chat-message ${msg.role}">
                <div class="chat-message-header">${msg.role === 'user' ? 'You' : 'RiskGPT'}</div>
                <div class="chat-message-content">${formattedContent}</div>
            </div>
        `;
        }).join('');

        // Scroll to bottom
        const end = document.getElementById('chatMessagesEnd');
        if (end) end.scrollIntoView({ behavior: 'smooth' });
    },

    renderRightPaneEmpty() {
        const container = document.getElementById('chatMessages');
        if (container) {
            container.innerHTML = '<div class="text-center text-muted py-4"><small>Select a document to start chatting.</small></div>';
        }
    },

    async sendChatMessage() {
        const input = document.getElementById('chatInput');
        if (!input || !this.state.fileId) return;

        const message = input.value.trim();
        if (!message) return;

        // Add user message to UI
        this.state.chatMessages.push({
            id: `user-${Date.now()}`,
            role: 'user',
            content: message,
            timestamp: new Date().toISOString(),
        });
        this.renderChatMessages();

        input.value = '';
        const sendBtn = document.getElementById('btnSendChat');
        if (sendBtn) sendBtn.disabled = true;

        try {
            // Get selected block IDs from editor
            const selectedBlockIds = this.state.selectedBlocks.map(b => b.id || b);

            // Call RiskGPT API
            const response = await fetch(`/api/doc_review/ask_riskgpt`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    file_id: this.state.fileId,
                    selected_block_ids: selectedBlockIds,
                    user_prompt: message, // API expects 'user_prompt', not 'message'
                    conversation_history: this.state.chatMessages.slice(-10).map(m => ({
                        role: m.role,
                        content: m.content,
                    })),
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: response.statusText }));
                throw new Error(errorData.error || 'Failed to get response');
            }

            const data = await response.json();
            // API returns: { analysis, suggestions, ... } directly, not wrapped in 'result'
            const analysis = data.analysis || '';
            const suggestions = data.suggestions || [];

            // Add assistant message
            const assistantMessage = {
                id: `assistant-${Date.now()}`,
                role: 'assistant',
                content: analysis || 'Response received',
                suggestions: suggestions,
                timestamp: new Date().toISOString(),
            };

            this.state.chatMessages.push(assistantMessage);
            this.renderChatMessages();

            // Save to backend
            await fetch(`/api/doc_review/${encodeURIComponent(this.state.fileId)}/chat`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    role: 'assistant',
                    content: assistantMessage.content,
                }),
            });

            // Handle suggestions if any
            if (suggestions && suggestions.length > 0) {
                this.handleSuggestionsReceived(suggestions);
            }
        } catch (error) {
            console.error('[WorkspacePage] Error sending chat message:', error);
            alert('Failed to send message: ' + error.message);
        } finally {
            if (sendBtn) sendBtn.disabled = false;
        }
    },

    clearChat() {
        if (!confirm('Clear all chat messages?')) return;

        if (!this.state.fileId) return;

        fetch(`/api/doc_review/${encodeURIComponent(this.state.fileId)}/chat/clear`, {
            method: 'POST',
            credentials: 'same-origin',
        }).then(() => {
            this.state.chatMessages = [];
            this.renderChatMessages();
        });
    },

    updateSelectedBlocks(blockIds) {
        // This will be called when editor selection changes
        this.state.selectedBlocks = blockIds.map(id => ({ id }));
        this.renderSelectedBlocks();
    },

    renderSelectedBlocks() {
        const section = document.getElementById('selectedBlocksSection');
        const list = document.getElementById('selectedBlocksList');

        if (!this.state.selectedBlocks || this.state.selectedBlocks.length === 0) {
            section?.classList.add('d-none');
            return;
        }

        section?.classList.remove('d-none');
        if (list) {
            list.innerHTML = this.state.selectedBlocks.map(block => `
                <span class="selected-block-badge">
                    ${this.escapeHtml(block.id)}
                    <button class="btn-close btn-close-sm ms-1" onclick="WorkspacePage.deselectBlock('${block.id}')"></button>
                </span>
            `).join('');
        }
    },

    deselectBlock(blockId) {
        this.state.selectedBlocks = this.state.selectedBlocks.filter(b => b.id !== blockId);
        this.renderSelectedBlocks();
    },

    clearSelectedBlocks() {
        this.state.selectedBlocks = [];
        this.renderSelectedBlocks();
    },

    handleSuggestionsReceived(suggestions) {
        // Handle AI suggestions from chat
        console.log('[WorkspacePage] Suggestions received:', suggestions);
        // Could update left pane or show notification
    },

    acceptTextSuggestion() {
        // Accept text suggestion from editor
        if (window.docEditor && this.state.textSuggestion) {
            // Editor should handle this via its own API
            console.log('[WorkspacePage] Accepting text suggestion');
        }
        this.hideTextSuggestion();
    },

    rejectTextSuggestion() {
        this.hideTextSuggestion();
    },

    hideTextSuggestion() {
        const section = document.getElementById('textSuggestionSection');
        section?.classList.add('d-none');
        this.state.textSuggestion = null;
    },

    async analyzeDocument() {
        if (!this.state.fileId) return;

        const btn = document.getElementById('btnAnalyzeDocument');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Analyzing...';
        }

        try {
            const response = await fetch(`/api/doc_review/documents/${encodeURIComponent(this.state.fileId)}/analyze`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({}),
            });

            if (!response.ok) {
                throw new Error('Analysis failed');
            }

            // Reload left pane data
            await this.loadLeftPaneData();
        } catch (error) {
            console.error('[WorkspacePage] Error analyzing document:', error);
            alert('Failed to analyze document: ' + error.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-play-fill"></i> Analyze';
            }
        }
    },

    setupSocketIO() {
        if (typeof io === 'undefined') {
            console.warn('[WorkspacePage] Socket.IO not available');
            return;
        }

        this.state.socket = io();
        this.state.socket.on('connect', () => {
            console.log('[WorkspacePage] Socket.IO connected');
            if (this.state.fileId) {
                this.state.socket.emit('doc_review:join', { file_id: this.state.fileId });
            }
        });

        this.state.socket.on('doc_review:log', (data) => {
            console.log('[WorkspacePage] Log event:', data);
        });

        this.state.socket.on('doc_review:status', (data) => {
            console.log('[WorkspacePage] Status event:', data);
            // Update UI based on status
        });
    },

    async loadComments() {
        if (!this.state.fileId) {
            this.renderComments([]);
            return;
        }

        try {
            const response = await fetch(`/api/doc_review/${encodeURIComponent(this.state.fileId)}/comments`, {
                credentials: 'same-origin',
            });

            if (!response.ok) {
                if (response.status === 404) {
                    // No comments yet, that's okay
                    this.renderComments([]);
                    return;
                }
                throw new Error(`Failed to load comments: ${response.statusText}`);
            }

            const data = await response.json();
            const comments = data.comments || [];
            this.state.comments = comments;
            
            // Debug: Log block IDs from API comments
            const blockIdsFromComments = [...new Set(comments.map(c => c.block_id).filter(Boolean))];
            console.log('[WorkspacePage] Block IDs from API comments:', blockIdsFromComments);
            console.log('[WorkspacePage] Block ID types from API:', blockIdsFromComments.map(id => ({ id, type: typeof id })));
            
            this.renderComments(comments);
            
            // Apply comment highlights in editor
            this.applyCommentHighlights();
        } catch (error) {
            console.error('[WorkspacePage] Error loading comments:', error);
            this.renderComments([]);
        }
    },

    renderComments(comments) {
        const container = document.getElementById('commentsList');
        const summary = document.getElementById('commentsSummary');
        const badge = document.getElementById('commentCountBadge');

        if (!container) return;

        // Filter comments based on resolved status
        const filtered = this.state.showResolvedComments 
            ? comments 
            : comments.filter(c => !c.resolved);

            // Update badge
        if (badge) {
            const unresolvedCount = comments.filter(c => !c.resolved).length;
            if (unresolvedCount > 0) {
                badge.textContent = unresolvedCount;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        }
        
        // Update header comment count
        const headerCount = document.getElementById('commentCountHeader');
        if (headerCount) {
            headerCount.textContent = comments.length;
        }

        // Update summary
        if (summary) {
            const total = comments.length;
            const unresolved = comments.filter(c => !c.resolved).length;
            if (total === 0) {
                summary.textContent = 'No comments';
            } else {
                summary.textContent = `${unresolved} unresolved, ${total} total`;
            }
        }

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-3">
                    <i class="bi bi-chat-square-text" style="font-size: 2rem;"></i>
                    <p class="mt-2 mb-0">${comments.length === 0 ? 'No comments yet' : 'No ' + (this.state.showResolvedComments ? '' : 'unresolved ') + 'comments'}</p>
                    ${comments.length === 0 ? '<small>Select text and click the comment button to add a comment</small>' : ''}
                </div>
            `;
            return;
        }
        
        // Clear any empty state
        container.innerHTML = '';

        // Group comments by block
        const grouped = {};
        filtered.forEach(comment => {
            const blockId = comment.block_id || 'unknown';
            if (!grouped[blockId]) {
                grouped[blockId] = [];
            }
            grouped[blockId].push(comment);
        });

        // Render comments
        let html = '';
        Object.entries(grouped).forEach(([blockId, blockComments]) => {
            html += `<div class="mb-3 border-bottom pb-3">`;
            html += `<div class="small text-muted mb-2">Block: ${blockId}</div>`;
            
            blockComments.forEach(comment => {
                const date = new Date(comment.timestamp).toLocaleString();
                html += `
                    <div class="card mb-2 ${comment.resolved ? 'bg-light' : ''}" data-comment-id="${comment.id}">
                        <div class="card-body p-2">
                            <div class="d-flex justify-content-between align-items-start mb-2">
                                <div>
                                    <strong class="small">${comment.author || 'User'}</strong>
                                    <small class="text-muted ms-2">${date}</small>
                                    ${comment.resolved ? '<span class="badge bg-success ms-2">Resolved</span>' : ''}
                                </div>
                                <div class="btn-group btn-group-sm">
                                    ${!comment.resolved ? `
                                        <button class="btn btn-sm btn-outline-success" onclick="WorkspacePage.resolveComment('${comment.id}')" title="Mark as resolved">
                                            <i class="bi bi-check"></i>
                                        </button>
                                    ` : ''}
                                    <button class="btn btn-sm btn-outline-danger" onclick="WorkspacePage.deleteComment('${comment.id}')" title="Delete comment">
                                        <i class="bi bi-trash"></i>
                                    </button>
                                </div>
                            </div>
                            <div class="small mb-2">${this.escapeHtml(comment.content)}</div>
                            ${comment.selection_text ? `
                                <div class="small text-muted bg-light p-2 rounded">
                                    <strong>Selected text:</strong> "${this.escapeHtml(comment.selection_text.substring(0, 100))}${comment.selection_text.length > 100 ? '...' : ''}"
                                </div>
                            ` : ''}
                            ${comment.replies && comment.replies.length > 0 ? `
                                <div class="mt-2 ms-3 border-start ps-2">
                                    <small class="text-muted d-block mb-1">Replies:</small>
                                    ${comment.replies.map(reply => `
                                        <div class="small mb-1">
                                            <strong>${reply.author || 'User'}</strong>: ${this.escapeHtml(reply.content)}
                                        </div>
                                    `).join('')}
                                </div>
                            ` : ''}
                            <button class="btn btn-sm btn-link p-0 mt-2" onclick="WorkspacePage.showReplyForm('${comment.id}')">
                                <i class="bi bi-reply"></i> Reply
                            </button>
                            <div id="replyForm_${comment.id}" class="mt-2 d-none">
                                <textarea class="form-control form-control-sm mb-2" rows="2" id="replyText_${comment.id}" placeholder="Enter your reply..."></textarea>
                                <div class="d-flex gap-2">
                                    <button class="btn btn-sm btn-primary" onclick="WorkspacePage.submitReply('${comment.id}')">Submit</button>
                                    <button class="btn btn-sm btn-outline-secondary" onclick="WorkspacePage.cancelReply('${comment.id}')">Cancel</button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            });
            
            html += `</div>`;
        });

        container.innerHTML = html;
    },

    toggleShowResolvedComments() {
        this.state.showResolvedComments = !this.state.showResolvedComments;
        const btn = document.getElementById('toggleResolvedBtn');
        if (btn) {
            btn.innerHTML = this.state.showResolvedComments 
                ? '<i class="bi bi-eye-slash"></i> Hide Resolved'
                : '<i class="bi bi-eye"></i> Show Resolved';
        }
        this.renderComments(this.state.comments);
    },

    refreshComments() {
        this.loadComments();
    },

    async resolveComment(commentId) {
        if (!this.state.fileId) return;

        try {
            // Remove highlight from editor immediately
            if (window.docEditor && window.docEditor.removeCommentHighlight) {
                window.docEditor.removeCommentHighlight(commentId);
            }

            const response = await fetch(`/api/doc_review/${encodeURIComponent(this.state.fileId)}/comments/${commentId}/resolve`, {
                method: 'POST',
                credentials: 'same-origin',
            });

            if (!response.ok) {
                throw new Error('Failed to resolve comment');
            }

            // Reload comments (this will re-apply highlights, but resolved comments won't be highlighted)
            await this.loadComments();
        } catch (error) {
            console.error('[WorkspacePage] Error resolving comment:', error);
            alert('Failed to resolve comment: ' + error.message);
        }
    },

    async deleteComment(commentId) {
        if (!this.state.fileId) return;
        if (!confirm('Are you sure you want to delete this comment?')) return;

        try {
            // Remove highlight from editor
            if (window.docEditor && window.docEditor.removeCommentHighlight) {
                window.docEditor.removeCommentHighlight(commentId);
            }

            const response = await fetch(`/api/doc_review/${encodeURIComponent(this.state.fileId)}/comments/${commentId}`, {
                method: 'DELETE',
                credentials: 'same-origin',
            });

            if (!response.ok) {
                throw new Error('Failed to delete comment');
            }

            // Reload comments
            await this.loadComments();
        } catch (error) {
            console.error('[WorkspacePage] Error deleting comment:', error);
            alert('Failed to delete comment: ' + error.message);
        }
    },

    showReplyForm(commentId) {
        const form = document.getElementById(`replyForm_${commentId}`);
        if (form) {
            form.classList.remove('d-none');
        }
    },

    cancelReply(commentId) {
        const form = document.getElementById(`replyForm_${commentId}`);
        const textarea = document.getElementById(`replyText_${commentId}`);
        if (form) form.classList.add('d-none');
        if (textarea) textarea.value = '';
    },

    async submitReply(commentId) {
        if (!this.state.fileId) return;

        const textarea = document.getElementById(`replyText_${commentId}`);
        if (!textarea || !textarea.value.trim()) {
            alert('Please enter a reply');
            return;
        }

        try {
            const response = await fetch(`/api/doc_review/${encodeURIComponent(this.state.fileId)}/comments/${commentId}/reply`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    content: textarea.value.trim(),
                    author: 'User', // TODO: Get from session
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to add reply');
            }

            // Reload comments
            await this.loadComments();
        } catch (error) {
            console.error('[WorkspacePage] Error adding reply:', error);
            alert('Failed to add reply: ' + error.message);
        }
    },

    bindEvents() {
        // Additional event bindings if needed
    },

    acceptImprovedText(improvedText) {
        // Replace selected text with improved version
        if (!window.docEditor) {
            alert('Editor not ready');
            return;
        }
        
        // Try to replace selection in editor
        if (window.docEditor.replaceSelection) {
            window.docEditor.replaceSelection(improvedText);
        } else {
            // Fallback: use browser selection
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                range.deleteContents();
                range.insertNode(document.createTextNode(improvedText));
            } else {
                alert('Cannot replace text. Please manually copy the improved text.');
            }
        }
        
        // Close modal
        const modal = document.getElementById('improveTextModal');
        if (modal) modal.remove();
    },

    async updateDocumentHeader() {
        console.log('[WorkspacePage] updateDocumentHeader() called - Version: 20250124-001');
        
        // First, check if header elements exist in DOM
        const headerEl = document.getElementById('workspaceHeader');
        const titleEl = document.getElementById('documentTitle');
        const saveBtn = document.getElementById('saveButton');
        const modeBtns = document.querySelectorAll('[id^="mode"]');
        
        console.log('[WorkspacePage] Header element exists?', !!headerEl);
        console.log('[WorkspacePage] Title element exists?', !!titleEl);
        console.log('[WorkspacePage] Save button exists?', !!saveBtn);
        console.log('[WorkspacePage] Mode buttons count:', modeBtns.length);
        
        if (headerEl) {
            const styles = window.getComputedStyle(headerEl);
            console.log('[WorkspacePage] Header computed styles:', {
                display: styles.display,
                visibility: styles.visibility,
                opacity: styles.opacity,
                height: styles.height,
                offsetHeight: headerEl.offsetHeight,
                offsetTop: headerEl.offsetTop,
            });
        } else {
            console.error('[WorkspacePage] ERROR: workspaceHeader element not found in DOM!');
            const headerElements = Array.from(document.querySelectorAll('[id*="header"], [class*="header"]'));
            console.error('[WorkspacePage] Available elements with "header" in id/class:', 
                headerElements.map(el => ({
                    id: el.id,
                    className: el.className,
                    tagName: el.tagName,
                    innerHTML: el.innerHTML.substring(0, 200),
                    outerHTML: el.outerHTML.substring(0, 300),
                }))
            );
            
            // Check centerPane content
            const centerPane = document.getElementById('centerPane');
            if (centerPane) {
                console.error('[WorkspacePage] centerPane innerHTML length:', centerPane.innerHTML.length);
                console.error('[WorkspacePage] centerPane children count:', centerPane.children.length);
                const children = Array.from(centerPane.children);
                console.error('[WorkspacePage] centerPane children:', children.map(child => ({
                    tagName: child.tagName,
                    id: child.id,
                    className: child.className,
                    innerHTML: child.innerHTML.substring(0, 200),
                    outerHTML: child.outerHTML.substring(0, 300),
                })));
                
                // Log the actual first child's full structure
                if (children.length > 0) {
                    const firstChild = children[0];
                    console.error('[WorkspacePage] FIRST CHILD DETAILS:', {
                        tagName: firstChild.tagName,
                        id: firstChild.id,
                        className: firstChild.className,
                        innerHTML: firstChild.innerHTML.substring(0, 500),
                        outerHTML: firstChild.outerHTML.substring(0, 500),
                        children: Array.from(firstChild.children).map(c => ({ tagName: c.tagName, id: c.id, className: c.className })),
                    });
                }
                
                // Check if header is nested inside editor container
                const headerInside = centerPane.querySelector('#workspaceHeader');
                console.error('[WorkspacePage] Header inside centerPane?', !!headerInside);
                if (headerInside) {
                    console.error('[WorkspacePage] Found header inside centerPane!', {
                        parent: headerInside.parentElement?.id,
                        parentClass: headerInside.parentElement?.className,
                    });
                }
            } else {
                console.error('[WorkspacePage] centerPane element not found!');
            }
            
            // Check entire document for workspaceHeader
            const allHeaders = document.querySelectorAll('#workspaceHeader');
            console.error('[WorkspacePage] All #workspaceHeader elements in document:', allHeaders.length);
            allHeaders.forEach((h, i) => {
                console.error(`[WorkspacePage] Header ${i}:`, {
                    id: h.id,
                    parent: h.parentElement?.id,
                    parentClass: h.parentElement?.className,
                    display: window.getComputedStyle(h).display,
                    visibility: window.getComputedStyle(h).visibility,
                    offsetHeight: h.offsetHeight,
                });
            });
        }
        
        if (!this.state.fileId) {
            console.warn('[WorkspacePage] No fileId, setting default header values');
            if (titleEl) titleEl.textContent = 'No Document';
            return;
        }

        try {
            const response = await fetch(`/api/doc_review/documents/${encodeURIComponent(this.state.fileId)}`, {
                credentials: 'same-origin',
            });

            if (response.ok) {
                const data = await response.json();
                const doc = data.document || data;
                const status = doc.status || 'unknown';
                
                // Update title
                if (titleEl) {
                    titleEl.textContent = doc.file_id || this.state.fileId;
                }
                
                // Update status badge
                const badgeEl = document.getElementById('documentStatusBadge');
                if (badgeEl) {
                    const statusMap = {
                        'completed': { text: 'Completed', class: 'bg-success' },
                        'running': { text: 'Running', class: 'bg-warning' },
                        'error': { text: 'Error', class: 'bg-danger' },
                        'pending': { text: 'Pending', class: 'bg-secondary' },
                    };
                    const statusInfo = statusMap[status.toLowerCase()] || { text: status, class: 'bg-secondary' };
                    badgeEl.textContent = statusInfo.text;
                    badgeEl.className = `badge ${statusInfo.class}`;
                }
            }
        } catch (error) {
            console.error('[WorkspacePage] Error updating document header:', error);
        }
    },

    async saveDocument() {
        if (!this.state.fileId || !this.state.docState) {
            alert('No document to save.');
            return;
        }

        const saveButton = document.getElementById('saveButton');
        const saveButtonText = document.getElementById('saveButtonText');
        if (saveButton) {
            saveButton.disabled = true;
            saveButton.classList.remove('btn-primary', 'btn-success');
            saveButton.classList.add('btn-secondary');
        }
        if (saveButtonText) saveButtonText.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Saving...';

        try {
            // Get current markdown from editor
            let markdown = '';
            if (window.docEditor && typeof window.docEditor.getMarkdown === 'function') {
                markdown = window.docEditor.getMarkdown();
            } else {
                // Fallback: convert docState to markdown
                markdown = this.docStateToMarkdown(this.state.docState);
            }

            const response = await fetch(`/api/doc_review/documents/${encodeURIComponent(this.state.fileId)}/markdown`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ markdown }),
            });

            if (!response.ok) {
                throw new Error(`Save failed: ${response.statusText}`);
            }

            if (saveButton) {
                saveButton.classList.remove('btn-secondary');
                saveButton.classList.add('btn-success');
            }
            if (saveButtonText) saveButtonText.innerHTML = '<i class="bi bi-check-circle"></i> Saved';

            setTimeout(() => {
                if (saveButton) {
                    saveButton.classList.remove('btn-success');
                    saveButton.classList.add('btn-primary');
                    saveButton.disabled = false;
                }
                if (saveButtonText) saveButtonText.innerHTML = '<i class="bi bi-save"></i> Save';
            }, 2000);

            const result = await response.json();
            console.log('[WorkspacePage] Document saved successfully!', result);
        } catch (error) {
            console.error('[WorkspacePage] Save error:', error);
            alert(`Failed to save document: ${error.message || error}`);
            if (saveButton) {
                saveButton.classList.remove('btn-secondary');
                saveButton.classList.add('btn-danger');
                saveButton.disabled = false;
            }
            if (saveButtonText) saveButtonText.innerHTML = '<i class="bi bi-x-circle"></i> Error';
            setTimeout(() => {
                if (saveButton) {
                    saveButton.classList.remove('btn-danger');
                    saveButton.classList.add('btn-primary');
                }
                if (saveButtonText) saveButtonText.innerHTML = '<i class="bi bi-save"></i> Save';
            }, 3000);
        }
    },

    setMode(mode) {
        console.log('[WorkspacePage] Setting mode to:', mode);
        this.state.currentMode = mode;
        
        // Ensure views exist before switching
        if (mode === 'original' && !document.getElementById('originalView')) {
            const centerPane = document.getElementById('centerPane');
            if (centerPane) {
                const container = document.createElement('div');
                container.id = 'originalView';
                container.className = 'workspace-editor-container';
                container.style.display = 'none';
                centerPane.appendChild(container);
            }
        }
        if (mode === 'diff' && !document.getElementById('diffView')) {
            const centerPane = document.getElementById('centerPane');
            if (centerPane) {
                const container = document.createElement('div');
                container.id = 'diffView';
                container.className = 'workspace-editor-container';
                container.style.display = 'none';
                centerPane.appendChild(container);
            }
        }

        // Update button states
        const modes = ['editing', 'original', 'diff'];
        modes.forEach(m => {
            const btn = document.getElementById(`mode${m.charAt(0).toUpperCase() + m.slice(1)}`);
            if (btn) {
                if (m === mode) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            }
        });

        // Show/hide editor and mode-specific views
        const editorContainer = document.getElementById('editorContainer');
        const originalView = document.getElementById('originalView');
        const diffView = document.getElementById('diffView');

        if (mode === 'editing') {
            if (editorContainer) editorContainer.style.display = '';
            if (originalView) originalView.style.display = 'none';
            if (diffView) diffView.style.display = 'none';
        } else if (mode === 'original') {
            if (editorContainer) editorContainer.style.display = 'none';
            if (originalView) originalView.style.display = '';
            if (diffView) diffView.style.display = 'none';
            this.loadOriginalView();
        } else if (mode === 'diff') {
            if (editorContainer) editorContainer.style.display = 'none';
            if (originalView) originalView.style.display = 'none';
            if (diffView) diffView.style.display = '';
            this.loadDiffView();
        }
    },

    async loadOriginalView() {
        if (!this.state.fileId) return;

        let container = document.getElementById('originalView');
        if (!container) {
            // Create original view container
            container = document.createElement('div');
            container.id = 'originalView';
            container.className = 'workspace-editor-container';
            container.style.display = 'none';
            const centerPane = document.getElementById('centerPane');
            if (centerPane) {
                centerPane.appendChild(container);
            }
        }

        container.innerHTML = '<div class="p-4 text-center"><div class="spinner-border" role="status"></div><p class="mt-2">Loading original document...</p></div>';

        try {
            const response = await fetch(`/api/doc_review/documents/${encodeURIComponent(this.state.fileId)}`, {
                credentials: 'same-origin',
            });

            if (!response.ok) {
                throw new Error('Failed to load document');
            }

            const data = await response.json();
            const doc = data.document || data;
            const originalMarkdown = doc.state?.original_markdown || doc.state?.raw_markdown || '';

            if (originalMarkdown) {
                // Render markdown with proper formatting
                const lines = originalMarkdown.split('\n');
                let html = `
                    <div class="p-3 border-bottom bg-light sticky-top" style="z-index: 10;">
                        <span class="text-muted small fw-semibold">Original Document</span>
                    </div>
                    <div class="p-4" style="max-width: 900px; margin: 0 auto;">
                `;
                
                lines.forEach((line, index) => {
                    if (line.trim() === '') {
                        html += '<div class="mb-2"></div>';
                    } else if (line.startsWith('# ')) {
                        html += `<h1 class="mt-4 mb-3 fw-bold">${this.escapeHtml(line.replace('# ', ''))}</h1>`;
                    } else if (line.startsWith('## ')) {
                        html += `<h2 class="mt-3 mb-2 fw-semibold">${this.escapeHtml(line.replace('## ', ''))}</h2>`;
                    } else if (line.startsWith('### ')) {
                        html += `<h3 class="mt-2 mb-1 fw-semibold">${this.escapeHtml(line.replace('### ', ''))}</h3>`;
                    } else if (line.startsWith('- ') || line.startsWith('* ')) {
                        html += `<li class="mb-1 ms-4">${this.escapeHtml(line.replace(/^[-*] /, ''))}</li>`;
                    } else if (line.startsWith('|')) {
                        html += `<div class="font-monospace small text-muted mb-1">${this.escapeHtml(line)}</div>`;
                    } else {
                        html += `<p class="mb-2" style="line-height: 1.6;">${this.escapeHtml(line)}</p>`;
                    }
                });
                
                html += '</div>';
                container.innerHTML = html;
            } else {
                container.innerHTML = '<div class="p-4 text-center text-muted"><i class="bi bi-info-circle"></i> No original markdown available.</div>';
            }
        } catch (error) {
            console.error('[WorkspacePage] Error loading original view:', error);
            container.innerHTML = `<div class="p-4 text-center text-danger">Error loading original document: ${error.message}</div>`;
        }
    },

    async loadDiffView() {
        if (!this.state.fileId) return;

        let container = document.getElementById('diffView');
        if (!container) {
            // Create diff view container
            container = document.createElement('div');
            container.id = 'diffView';
            container.className = 'workspace-editor-container';
            container.style.display = 'none';
            const centerPane = document.getElementById('centerPane');
            if (centerPane) {
                centerPane.appendChild(container);
            }
        }

        container.innerHTML = '<div class="p-4 text-center"><div class="spinner-border" role="status"></div><p class="mt-2">Loading diff view...</p></div>';

        try {
            const response = await fetch(`/api/doc_review/documents/${encodeURIComponent(this.state.fileId)}`, {
                credentials: 'same-origin',
            });

            if (!response.ok) {
                throw new Error('Failed to load document');
            }

            const data = await response.json();
            const doc = data.document || data;
            const blockMetadata = doc.state?.block_metadata || [];

            if (blockMetadata.length > 0) {
                // Enhanced diff view - show blocks with change indicators
                let html = `
                    <div class="p-3 border-bottom bg-light sticky-top" style="z-index: 10;">
                        <span class="text-muted small fw-semibold">Diff View - Document Changes</span>
                    </div>
                    <div class="p-4" style="max-width: 900px; margin: 0 auto;">
                `;

                let changeCount = 0;
                blockMetadata.forEach((block, index) => {
                    const hasChanges = block.change_history && block.change_history.length > 0;
                    if (hasChanges) changeCount++;
                    
                    // Get content as string
                    let contentStr = '';
                    if (typeof block.content === 'string') {
                        contentStr = block.content;
                    } else if (Array.isArray(block.content)) {
                        contentStr = block.content.map(c => typeof c === 'string' ? c : c.text || '').join('');
                    } else if (block.content) {
                        contentStr = JSON.stringify(block.content, null, 2);
                    }
                    
                    const blockType = block.type || 'unknown';
                    const blockId = block.id || `block-${index}`;
                    
                    html += `
                        <div class="mb-3 p-3 border rounded ${hasChanges ? 'border-warning bg-warning bg-opacity-10' : 'border-light'}">
                            <div class="d-flex justify-content-between align-items-center mb-2">
                                <div class="small text-muted">
                                    <span class="badge bg-secondary">${blockType}</span>
                                    <span class="ms-2">Block ${index + 1}</span>
                                </div>
                                ${hasChanges ? `
                                    <div class="small text-warning">
                                        <i class="bi bi-pencil"></i> Modified (${block.change_history.length} change${block.change_history.length > 1 ? 's' : ''})
                                    </div>
                                ` : '<div class="small text-muted"><i class="bi bi-check-circle"></i> Unchanged</div>'}
                            </div>
                            <div class="bg-white p-2 rounded border" style="max-height: 300px; overflow-y: auto;">
                                <pre style="white-space: pre-wrap; font-family: inherit; line-height: 1.6; margin: 0; font-size: 0.9rem;">${this.escapeHtml(contentStr || '(empty)')}</pre>
                            </div>
                            ${hasChanges && block.change_history ? `
                                <div class="mt-2 small">
                                    <details>
                                        <summary class="text-muted cursor-pointer">View change history</summary>
                                        <div class="mt-2 ms-3">
                                            ${block.change_history.map((change, ci) => `
                                                <div class="mb-1 p-2 bg-light rounded">
                                                    <div class="small text-muted">${new Date(change.timestamp).toLocaleString()}</div>
                                                    <div class="small">${this.escapeHtml(change.type || 'change')}</div>
                                                </div>
                                            `).join('')}
                                        </div>
                                    </details>
                                </div>
                            ` : ''}
                        </div>
                    `;
                });

                html += `
                    </div>
                    <div class="p-3 border-top bg-light text-center">
                        <small class="text-muted">Total: ${blockMetadata.length} blocks, ${changeCount} modified</small>
                    </div>
                `;
                container.innerHTML = html;
            } else {
                container.innerHTML = '<div class="p-4 text-center text-muted"><i class="bi bi-info-circle"></i> No content available for diff comparison.</div>';
            }
        } catch (error) {
            console.error('[WorkspacePage] Error loading diff view:', error);
            container.innerHTML = `<div class="p-4 text-center text-danger">Error loading diff view: ${error.message}</div>`;
        }
    },

    docStateToMarkdown(docState) {
        // Simple conversion - could be enhanced
        if (!docState || !docState.blocks) return '';
        return docState.blocks.map(block => {
            if (block.type === 'heading') {
                const level = '#'.repeat(block.level || 1);
                const text = Array.isArray(block.text) ? block.text.map(t => t.text).join('') : '';
                return `${level} ${text}`;
            } else if (block.type === 'paragraph') {
                const text = Array.isArray(block.text) ? block.text.map(t => t.text).join('') : '';
                return text;
            }
            return '';
        }).join('\n\n');
    },

    showCommentModal(selectionText, blockId, blockTitle, fileId, blockIds = null, startOffset = null, endOffset = null) {
        // Remove existing modal if any
        const existing = document.getElementById('commentModal');
        if (existing) existing.remove();
        
        // Create modal overlay
        const modal = document.createElement('div');
        modal.id = 'commentModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        `;
        
        // Create modal content
        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background-color: white;
            border-radius: 8px;
            padding: 24px;
            width: 90%;
            max-width: 500px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        `;
        
        modalContent.innerHTML = `
            <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Add Comment</h3>
            <div style="background-color: #fef9c3; padding: 12px; border-radius: 6px; margin-bottom: 12px; font-size: 14px;">
                <strong>Selected text:</strong> "${this.escapeHtml(selectionText.substring(0, 200))}${selectionText.length > 200 ? '...' : ''}"
            </div>
            <textarea 
                id="commentTextarea" 
                placeholder="Write your comment..."
                style="width: 100%; min-height: 100px; padding: 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; font-family: inherit; resize: vertical; margin-bottom: 16px;"
                autofocus
            ></textarea>
            <div style="display: flex; gap: 8px; justify-content: flex-end;">
                <button 
                    id="commentCancelBtn"
                    style="padding: 8px 16px; border: 1px solid #d1d5db; border-radius: 6px; background-color: white; cursor: pointer; font-size: 14px;"
                >Cancel</button>
                <button 
                    id="commentSubmitBtn"
                    style="padding: 8px 16px; border: none; border-radius: 6px; background-color: #f59e0b; color: white; cursor: pointer; font-size: 14px; font-weight: 600;"
                >Comment</button>
            </div>
        `;
        
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        // Handle Cancel
        document.getElementById('commentCancelBtn').addEventListener('click', () => {
            modal.remove();
        });
        
        // Handle Submit
        const submitComment = async () => {
            const textarea = document.getElementById('commentTextarea');
            const commentText = textarea ? textarea.value.trim() : '';
            
            if (!commentText) {
                alert('Please enter a comment.');
                return;
            }
            
            try {
                const response = await fetch(`/api/doc_review/${encodeURIComponent(fileId)}/comments`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({
                        block_id: blockId,
                        block_title: blockTitle,
                        content: commentText,
                        selection_text: selectionText,
                        start_offset: startOffset,
                        end_offset: endOffset,
                        author: 'User',
                    }),
                });
                
                if (!response.ok) {
                    throw new Error(`Failed to add comment: ${response.statusText}`);
                }
                
                const newComment = await response.json();
                console.log('[WorkspacePage] Comment created:', newComment);
                console.log('[WorkspacePage] New comment block_id:', newComment.block_id, 'type:', typeof newComment.block_id);
                
                // Close modal
                modal.remove();
                
                // Immediately apply highlight for the new comment (before reloading)
                if (window.docEditor && window.docEditor.applyCommentHighlight && newComment.id && newComment.block_id && newComment.selection_text) {
                    try {
                        console.log('[WorkspacePage] Applying immediate highlight for new comment:', newComment.id);
                        console.log('[WorkspacePage] Block ID being passed:', newComment.block_id, 'type:', typeof newComment.block_id);
                        console.log('[WorkspacePage] Offsets:', newComment.start_offset, newComment.end_offset);
                        console.log('[WorkspacePage] Multi-block IDs:', blockIds);
                        // Pass blockIds if this was a multi-block selection
                        // Use offsets from API response (which should match what we sent)
                        window.docEditor.applyCommentHighlight(
                            newComment.id,
                            newComment.block_id,
                            newComment.selection_text,
                            newComment.start_offset ?? startOffset,
                            newComment.end_offset ?? endOffset,
                            blockIds && blockIds.length > 1 ? blockIds : undefined
                        );
                    } catch (error) {
                        console.error('[WorkspacePage] Error applying immediate highlight:', error);
                    }
                }
                
                // Reload comments (this will re-apply all highlights, ensuring consistency)
                await this.loadComments();
                
                // Switch to comments tab
                const commentsTab = document.getElementById('comments-tab');
                if (commentsTab) {
                    commentsTab.click();
                }
            } catch (error) {
                console.error('[WorkspacePage] Failed to add comment:', error);
                alert(`Failed to add comment: ${error.message || error}`);
            }
        };
        
        document.getElementById('commentSubmitBtn').addEventListener('click', submitComment);
        
        // Handle Enter+Meta/Ctrl to submit
        document.getElementById('commentTextarea').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submitComment();
            }
        });
        
        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    },

    showTextSuggestionInChat(original, improved, reason, suggestionId = null, blockId = null, startOffset = null, endOffset = null) {
        // Remove existing suggestion if any
        const existing = document.getElementById('textSuggestionInChat');
        if (existing) existing.remove();
        
        // Store selection info for highlighting after acceptance
        // We'll use the improved text to find and highlight it after replacement
        
        // Create suggestion UI (like React RightPane)
        const suggestionDiv = document.createElement('div');
        suggestionDiv.id = 'textSuggestionInChat';
        suggestionDiv.style.cssText = `
            margin-bottom: 8px;
            padding: 8px;
            border-radius: 6px;
            border: 1px solid #3b82f6;
            background-color: #f0f9ff;
            box-shadow: 0 1px 3px rgba(59, 130, 246, 0.15);
        `;
        
        suggestionDiv.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                <div style="font-size: 10px; font-weight: 600; color: #2563eb; display: flex; align-items: center; gap: 3px;">
                    <span style="font-size: 11px;">✨</span>
                    AI
                </div>
                <div style="display: flex; gap: 4px;">
                    <button 
                        id="acceptTextSuggestionBtn"
                        style="padding: 3px 8px; font-size: 10px; font-weight: 600; border-radius: 4px; border: none; cursor: pointer; background-color: #10b981; color: white; transition: all 0.15s;"
                        onmouseover="this.style.backgroundColor='#059669'; this.style.transform='scale(1.05)'"
                        onmouseout="this.style.backgroundColor='#10b981'; this.style.transform='scale(1)'"
                        title="Accept suggestion"
                    >✓</button>
                    <button 
                        id="rejectTextSuggestionBtn"
                        style="padding: 3px 8px; font-size: 10px; font-weight: 600; border-radius: 4px; border: none; cursor: pointer; background-color: #ef4444; color: white; transition: all 0.15s;"
                        onmouseover="this.style.backgroundColor='#dc2626'; this.style.transform='scale(1.05)'"
                        onmouseout="this.style.backgroundColor='#ef4444'; this.style.transform='scale(1)'"
                        title="Reject suggestion"
                    >✕</button>
                </div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px;">
                <div style="padding: 4px 6px; border-radius: 4px; background-color: rgba(0,0,0,0.02);">
                    <div style="font-size: 8px; font-weight: 600; margin-bottom: 2px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">From</div>
                    <div style="font-size: 11px; color: #4b5563; text-decoration: line-through; opacity: 0.6;">${this.escapeHtml(original)}</div>
                </div>
                <div style="text-align: center; font-size: 10px; color: #3b82f6; line-height: 1;">↓</div>
                <div style="padding: 4px 6px; border-radius: 4px; background-color: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.3);">
                    <div style="font-size: 8px; font-weight: 600; margin-bottom: 2px; color: #2563eb; text-transform: uppercase; letter-spacing: 0.5px;">To</div>
                    <div style="font-size: 12px; font-weight: 600; color: #1e40af;">${this.escapeHtml(improved)}</div>
                </div>
            </div>
        `;
        
        // Store suggestion data (including backend ID if saved)
        suggestionDiv.dataset.original = original;
        suggestionDiv.dataset.improved = improved;
        suggestionDiv.dataset.suggestionId = suggestionId || '';
        suggestionDiv.dataset.blockId = blockId || '';
        suggestionDiv.dataset.startOffset = startOffset || '';
        suggestionDiv.dataset.endOffset = endOffset || '';
        
        // Insert before chat input
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            chatMessages.appendChild(suggestionDiv);
            // Scroll to bottom
            const chatMessagesContainer = document.getElementById('chatMessagesContainer');
            if (chatMessagesContainer) {
                chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
            }
        }
        
        // Handle Accept
        document.getElementById('acceptTextSuggestionBtn').addEventListener('click', async () => {
            const improvedText = suggestionDiv.dataset.improved || '';
            const originalText = suggestionDiv.dataset.original || '';
            const suggestionId = suggestionDiv.dataset.suggestionId;
            const blockId = suggestionDiv.dataset.blockId;
            const startOffset = suggestionDiv.dataset.startOffset ? parseInt(suggestionDiv.dataset.startOffset) : null;
            const endOffset = suggestionDiv.dataset.endOffset ? parseInt(suggestionDiv.dataset.endOffset) : null;
            
            if (!improvedText || !this.state.fileId) return;
            
            try {
                // Replace text in editor
                this.acceptImprovedText(improvedText);
                
                if (suggestionId) {
                    // Update existing suggestion status to 'accepted' (was saved as 'pending')
                    const response = await fetch(`/api/doc_review/${encodeURIComponent(this.state.fileId)}/ai_suggestions/${suggestionId}`, {
                        method: 'PATCH',
                        credentials: 'same-origin',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            status: 'accepted',
                        }),
                    });
                    
                    if (response.ok) {
                        console.log('[WorkspacePage] Updated AI suggestion status to accepted:', suggestionId);
                        
                        // Re-apply highlight with 'accepted' status (darker blue)
                        // Use improved text position (after replacement)
                        setTimeout(() => {
                            if (window.docEditor && window.docEditor.applyAISuggestionHighlight && blockId) {
                                window.docEditor.applyAISuggestionHighlight(
                                    suggestionId,
                                    blockId,
                                    improvedText, // Highlight the improved text now
                                    'accepted',
                                    startOffset, // Use original offsets (text length may have changed)
                                    endOffset
                                );
                            }
                        }, 100);
                    } else {
                        console.error('[WorkspacePage] Failed to update AI suggestion:', await response.text());
                    }
                } else {
                    // Fallback: Create new suggestion if somehow not saved earlier
                    console.warn('[WorkspacePage] No suggestion ID, creating new suggestion');
                    const response = await fetch(`/api/doc_review/${encodeURIComponent(this.state.fileId)}/ai_suggestions`, {
                        method: 'POST',
                        credentials: 'same-origin',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            block_id: blockId || 'unknown',
                            selection_text: originalText,
                            improved_text: improvedText,
                            status: 'accepted',
                            start_offset: startOffset,
                            end_offset: endOffset,
                        }),
                    });
                    
                    if (response.ok) {
                        const saved = await response.json();
                        console.log('[WorkspacePage] Created AI suggestion:', saved);
                    }
                }
                
                // Reload AI suggestions to refresh highlights
                await this.loadAISuggestions();
                
                suggestionDiv.remove();
            } catch (error) {
                console.error('[WorkspacePage] Error accepting suggestion:', error);
                alert('Failed to accept suggestion: ' + error.message);
            }
        });
        
        // Handle Reject
        document.getElementById('rejectTextSuggestionBtn').addEventListener('click', async () => {
            const suggestionId = suggestionDiv.dataset.suggestionId;
            
            if (suggestionId && this.state.fileId) {
                try {
                    // Update suggestion status to 'rejected'
                    const response = await fetch(`/api/doc_review/${encodeURIComponent(this.state.fileId)}/ai_suggestions/${suggestionId}`, {
                        method: 'PATCH',
                        credentials: 'same-origin',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            status: 'rejected',
                        }),
                    });
                    
                    if (response.ok) {
                        console.log('[WorkspacePage] Updated AI suggestion status to rejected:', suggestionId);
                        // Remove highlight
                        if (window.docEditor && window.docEditor.removeAISuggestionHighlight) {
                            window.docEditor.removeAISuggestionHighlight(suggestionId);
                        }
                        // Reload to refresh
                        await this.loadAISuggestions();
                    }
                } catch (error) {
                    console.error('[WorkspacePage] Error rejecting suggestion:', error);
                }
            }
            
            suggestionDiv.remove();
        });
        
        // Switch to Chat tab
        const chatTab = document.getElementById('chat-tab');
        if (chatTab) {
            chatTab.click();
        }
    },

    toggleLeftPane() {
        const leftPane = document.getElementById('leftPane');
        const resizeHandle = document.getElementById('resizeHandleLeft');
        const toggleBtn = document.getElementById('leftPaneToggleBtn');
        const toggleIcon = document.getElementById('leftPaneToggleIcon');
        
        if (!leftPane) return;
        
        const isVisible = leftPane.style.display !== 'none';
        
        if (isVisible) {
            // Hide
            leftPane.style.display = 'none';
            if (resizeHandle) resizeHandle.style.display = 'none';
            if (toggleIcon) toggleIcon.className = 'bi bi-chevron-right';
        } else {
            // Show
            leftPane.style.display = '';
            if (resizeHandle) resizeHandle.style.display = '';
            if (toggleIcon) toggleIcon.className = 'bi bi-chevron-left';
        }
    },

    forceWhiteHeader() {
        const header = document.getElementById('workspaceHeader');
        if (header) {
            // Remove red border - check both style.border and style.cssText
            if (header.style.border && header.style.border.includes('red')) {
                header.style.border = 'none';
            }
            if (header.style.borderColor && (header.style.borderColor.includes('red') || header.style.borderColor === 'red')) {
                header.style.borderColor = '';
                header.style.border = 'none';
            }
            // Remove red border using setProperty with !important
            header.style.setProperty('border', 'none', 'important');
            header.style.setProperty('border-color', 'transparent', 'important');
            header.style.setProperty('outline', 'none', 'important');
            
            // Force white background
            header.style.setProperty('background-color', 'white', 'important');
            header.style.setProperty('background', 'white', 'important');
            header.classList.remove('bg-warning', 'alert-warning', 'bg-yellow');
            
            // Remove any inline styles that might be yellow
            if (header.style.backgroundColor && (header.style.backgroundColor.includes('yellow') || header.style.backgroundColor.includes('ffc') || header.style.backgroundColor.includes('fff3cd') || header.style.backgroundColor.includes('fef9c3'))) {
                header.style.backgroundColor = 'white';
            }
        }
        // Also check periodically for any dynamic changes
        setTimeout(() => this.forceWhiteHeader(), 1000);
    },

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    // Simple markdown to HTML converter for analysis sections
    markdownToHtml(text) {
        if (!text) return '';
        
        let html = text;
        
        // Headers (### -> h3, ## -> h2, # -> h1)
        html = html.replace(/^### (.+)$/gm, '<h6 class="fw-bold mt-3 mb-2">$1</h6>');
        html = html.replace(/^## (.+)$/gm, '<h5 class="fw-bold mt-3 mb-2">$1</h5>');
        html = html.replace(/^# (.+)$/gm, '<h4 class="fw-bold mt-3 mb-2">$1</h4>');
        
        // Bold (**text** or __text__)
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
        
        // Italic (*text* or _text_)
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
        html = html.replace(/_(.+?)_/g, '<em>$1</em>');
        
        // Lists (- item or * item)
        html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>)/s, '<ul class="mb-2">$1</ul>');
        
        // Line breaks (preserve paragraphs)
        html = html.split('\n\n').map(para => {
            if (para.trim().startsWith('<')) return para; // Already HTML
            return `<p class="mb-2">${para.replace(/\n/g, '<br>')}</p>`;
        }).join('');
        
        return html;
    },

    applyCommentHighlights() {
        // Prevent excessive logging - only log once per call
        if (!this._lastHighlightLog || Date.now() - this._lastHighlightLog > 2000) {
            console.log('[WorkspacePage] applyCommentHighlights() called');
            this._lastHighlightLog = Date.now();
        }
        
        if (!window.docEditor || !window.docEditor.applyCommentHighlight) {
            console.warn('[WorkspacePage] Editor not ready for comment highlights. Available methods:', window.docEditor ? Object.keys(window.docEditor) : 'none');
            return;
        }

        if (!this.state.comments || this.state.comments.length === 0) {
            return;
        }

        // Filter out resolved comments - only highlight unresolved ones
        const unresolvedComments = this.state.comments.filter(c => !c.resolved);
        // Only log if count changed (prevent loop)
        if (this._lastCommentCount !== unresolvedComments.length) {
            console.log('[WorkspacePage] Applying highlights for', unresolvedComments.length, 'unresolved comments');
            this._lastCommentCount = unresolvedComments.length;
        }
        
        unresolvedComments.forEach(comment => {
            // API returns 'selection_text', not 'selected_text'
            const selectionText = comment.selection_text || comment.selected_text;
            
            if (comment.id && comment.block_id && selectionText) {
                try {
                    // Only log first time or if comment count changed
                    if (!this._lastCommentCount || this._lastCommentCount !== unresolvedComments.length) {
                        console.log('[WorkspacePage] Applying comment highlight:', comment.id);
                    }
                    // Check if comment has block_ids array (for multi-block comments)
                    const commentBlockIds = comment.block_ids || (comment.block_id ? [comment.block_id] : null);
                    const isMultiBlock = commentBlockIds && commentBlockIds.length > 1;
                    
                    window.docEditor.applyCommentHighlight(
                        comment.id,
                        comment.block_id,
                        selectionText,
                        comment.start_offset,
                        comment.end_offset,
                        isMultiBlock ? commentBlockIds : undefined
                    );
                } catch (error) {
                    console.error('[WorkspacePage] Error applying comment highlight:', error, comment);
                }
            } else {
                console.warn('[WorkspacePage] Comment missing required fields:', {
                    id: comment.id,
                    block_id: comment.block_id,
                    selection_text: !!selectionText,
                    has_start_offset: !!comment.start_offset,
                    has_end_offset: !!comment.end_offset,
                    comment_keys: Object.keys(comment)
                });
            }
        });
        
        // Remove highlights for resolved comments
        const resolvedComments = this.state.comments.filter(c => c.resolved);
        if (resolvedComments.length > 0 && window.docEditor && window.docEditor.removeCommentHighlight) {
            resolvedComments.forEach(comment => {
                if (comment.id) {
                    // Don't log every removal - too verbose
                    window.docEditor.removeCommentHighlight(comment.id);
                }
            });
        }
    },

    applyAISuggestionHighlights() {
        // Prevent excessive logging - only log once per call
        if (!this._lastAIHighlightLog || Date.now() - this._lastAIHighlightLog > 2000) {
            console.log('[WorkspacePage] applyAISuggestionHighlights() called');
            this._lastAIHighlightLog = Date.now();
        }
        
        if (!window.docEditor || !window.docEditor.applyAISuggestionHighlight) {
            console.warn('[WorkspacePage] Editor not ready for AI suggestion highlights. Available methods:', window.docEditor ? Object.keys(window.docEditor) : 'none');
            return;
        }

        if (!this.state.aiSuggestions || this.state.aiSuggestions.length === 0) {
            return;
        }

        // Only log if count changed (prevent loop)
        if (this._lastAICount !== this.state.aiSuggestions.length) {
            console.log('[WorkspacePage] Applying highlights for', this.state.aiSuggestions.length, 'AI suggestions');
            this._lastAICount = this.state.aiSuggestions.length;
        }
        
        this.state.aiSuggestions.forEach(suggestion => {
            if (suggestion.id && suggestion.block_id && suggestion.selection_text) {
                try {
                    // Don't log every highlight - too verbose
                    window.docEditor.applyAISuggestionHighlight(
                        suggestion.id,
                        suggestion.block_id,
                        suggestion.selection_text,
                        suggestion.status || 'pending',
                        suggestion.start_offset,
                        suggestion.end_offset
                    );
                } catch (error) {
                    console.error('[WorkspacePage] Error applying AI suggestion highlight:', error, suggestion);
                }
            } else {
                console.warn('[WorkspacePage] AI suggestion missing required fields:', {
                    id: suggestion.id,
                    block_id: suggestion.block_id,
                    selection_text: !!suggestion.selection_text
                });
            }
        });
    },
};

