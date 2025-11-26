/**
 * Settings Page - Vanilla JavaScript Implementation
 */

const SettingsPage = {
    state: {
        defaultViewMode: 'editing',
        autosaveInterval: '60',
        debugMode: false,
        apiKey: '',
        hasChanges: false,
    },

    init() {
        console.log('[SettingsPage] Initializing...');
        this.loadSettings();
        this.bindEvents();
    },

    loadSettings() {
        // Load from localStorage or defaults
        const saved = localStorage.getItem('docReviewSettings');
        if (saved) {
            try {
                const settings = JSON.parse(saved);
                this.state.defaultViewMode = settings.defaultViewMode || 'editing';
                this.state.autosaveInterval = settings.autosaveInterval || '60';
                this.state.debugMode = settings.debugMode || false;
            } catch (e) {
                console.error('[SettingsPage] Error loading settings:', e);
            }
        }

        this.render();
    },

    render() {
        const viewMode = document.getElementById('defaultViewMode');
        const autosave = document.getElementById('autosaveInterval');
        const debug = document.getElementById('debugMode');

        if (viewMode) viewMode.value = this.state.defaultViewMode;
        if (autosave) autosave.value = this.state.autosaveInterval;
        if (debug) debug.checked = this.state.debugMode;
    },

    handleChange() {
        const viewMode = document.getElementById('defaultViewMode');
        const autosave = document.getElementById('autosaveInterval');
        const debug = document.getElementById('debugMode');

        if (viewMode) this.state.defaultViewMode = viewMode.value;
        if (autosave) this.state.autosaveInterval = autosave.value;
        if (debug) this.state.debugMode = debug.checked;

        this.state.hasChanges = true;
    },

    async save() {
        const status = document.getElementById('saveStatus');
        
        try {
            // Save to localStorage
            localStorage.setItem('docReviewSettings', JSON.stringify({
                defaultViewMode: this.state.defaultViewMode,
                autosaveInterval: this.state.autosaveInterval,
                debugMode: this.state.debugMode,
            }));

            // Could also save to backend if needed
            // await fetch('/api/doc_review/settings', { method: 'POST', ... });

            this.state.hasChanges = false;
            if (status) {
                status.innerHTML = '<div class="alert alert-success"><i class="bi bi-check-circle"></i> Settings saved</div>';
                setTimeout(() => {
                    status.innerHTML = '';
                }, 3000);
            }
        } catch (error) {
            console.error('[SettingsPage] Error saving settings:', error);
            if (status) {
                status.innerHTML = '<div class="alert alert-danger">Failed to save settings</div>';
            }
        }
    },

    reset() {
        if (!confirm('Reset all settings to defaults?')) return;

        this.state.defaultViewMode = 'editing';
        this.state.autosaveInterval = '60';
        this.state.debugMode = false;
        this.state.hasChanges = false;

        localStorage.removeItem('docReviewSettings');
        this.render();
    },

    updateApiKey() {
        const apiKeyInput = document.getElementById('apiKey');
        if (!apiKeyInput) return;

        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) {
            alert('Please enter an API key');
            return;
        }

        // TODO: Save API key to backend
        console.log('[SettingsPage] API key update requested');
        alert('API key update functionality to be implemented');
    },

    bindEvents() {
        // Additional event bindings if needed
    },
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    SettingsPage.init();
});

