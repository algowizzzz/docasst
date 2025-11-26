/**
 * Prompts Page - Vanilla JavaScript Implementation
 */

const PromptsPage = {
    state: {
        prompts: [
            { id: 'toc_review', title: '1. TOC & Structure Review', description: 'Analyzes document table of contents and overall structure', filename: 'phase1_toc_review.md' },
            { id: 'conceptual_coverage', title: '2. Conceptual Coverage', description: 'Evaluates completeness across universal policy domains', filename: 'phase2_check_conceptual_coverage.md' },
            { id: 'compliance_governance', title: '3. Compliance & Governance', description: 'Reviews regulatory precision and control strength', filename: 'phase2_check_compliance_governance.md' },
            { id: 'language_clarity', title: '4. Language & Clarity', description: 'Assesses writing quality, tone, and readability', filename: 'phase2_check_language_clarity.md' },
            { id: 'structural_presentation', title: '5. Structural & Presentation', description: 'Evaluates document flow and formatting', filename: 'phase2_check_structural_presentation.md' },
            { id: 'synthesis', title: '6. Synthesis Summary', description: 'Generates holistic assessment combining all checks', filename: 'phase2_synthesis_summary.md' },
        ],
        selectedPrompt: null,
        promptContent: '',
        isSaving: false,
        isSaved: false,
    },

    init() {
        console.log('[PromptsPage] Initializing...');
        this.renderPromptList();
        if (this.state.prompts.length > 0) {
            this.selectPrompt(this.state.prompts[0]);
        }
    },

    renderPromptList() {
        const list = document.getElementById('promptsList');
        if (!list) return;

        list.innerHTML = this.state.prompts.map(prompt => `
            <button 
                class="list-group-item list-group-item-action ${this.state.selectedPrompt?.id === prompt.id ? 'active' : ''}"
                onclick="PromptsPage.selectPrompt(PromptsPage.state.prompts.find(p => p.id === '${prompt.id}'))"
            >
                <div class="fw-semibold">${this.escapeHtml(prompt.title)}</div>
                <small class="text-muted">${this.escapeHtml(prompt.description)}</small>
            </button>
        `).join('');
    },

    async selectPrompt(prompt) {
        if (!prompt) return;

        this.state.selectedPrompt = prompt;
        this.renderPromptList();

        const title = document.getElementById('promptTitle');
        const description = document.getElementById('promptDescription');
        const editor = document.getElementById('promptEditor');
        const saveBtn = document.getElementById('btnSavePrompt');

        if (title) title.textContent = prompt.title;
        if (description) description.textContent = prompt.description;
        if (saveBtn) saveBtn.disabled = true;

        // Load prompt content
        try {
            const response = await fetch(`/api/doc_review/prompts/${encodeURIComponent(prompt.filename)}`, {
                credentials: 'same-origin',
            });

            if (response.ok) {
                const content = await response.text();
                this.state.promptContent = content;
                if (editor) editor.value = content;
            } else {
                this.state.promptContent = `# ${prompt.title}\n\nPrompt not found.`;
                if (editor) editor.value = this.state.promptContent;
            }
        } catch (error) {
            console.error('[PromptsPage] Error loading prompt:', error);
            this.state.promptContent = `# ${prompt.title}\n\nError loading prompt.`;
            if (editor) editor.value = this.state.promptContent;
        }
    },

    handleContentChange() {
        const editor = document.getElementById('promptEditor');
        const saveBtn = document.getElementById('btnSavePrompt');
        
        if (editor) {
            this.state.promptContent = editor.value;
        }
        if (saveBtn) {
            saveBtn.disabled = false;
        }
        this.state.isSaved = false;
        this.updateSaveStatus();
    },

    async savePrompt() {
        if (!this.state.selectedPrompt) return;

        const saveBtn = document.getElementById('btnSavePrompt');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Saving...';
        }

        this.state.isSaving = true;

        try {
            const editor = document.getElementById('promptEditor');
            const content = editor ? editor.value : this.state.promptContent;

            const response = await fetch(`/api/doc_review/prompts/${encodeURIComponent(this.state.selectedPrompt.filename)}`, {
                method: 'PUT',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'text/plain',
                },
                body: content,
            });

            if (response.ok) {
                this.state.isSaved = true;
                this.updateSaveStatus();
                setTimeout(() => {
                    this.state.isSaved = false;
                    this.updateSaveStatus();
                }, 3000);
            } else {
                throw new Error(response.statusText);
            }
        } catch (error) {
            console.error('[PromptsPage] Error saving prompt:', error);
            alert('Failed to save prompt: ' + error.message);
        } finally {
            this.state.isSaving = false;
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="bi bi-save"></i> Save';
            }
        }
    },

    updateSaveStatus() {
        const status = document.getElementById('saveStatus');
        if (!status) return;

        if (this.state.isSaving) {
            status.innerHTML = '<span class="text-muted"><i class="bi bi-hourglass-split"></i> Saving...</span>';
        } else if (this.state.isSaved) {
            status.innerHTML = '<span class="text-success"><i class="bi bi-check-circle"></i> Saved</span>';
        } else {
            status.innerHTML = '';
        }
    },

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    PromptsPage.init();
});

