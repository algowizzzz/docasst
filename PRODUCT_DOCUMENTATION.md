# Doc Review Assistant - Product Documentation

## 1. Executive Summary

### Product Vision
Doc Review Assistant is an AI-powered document review platform designed to streamline document review, and improvement processes at BMO. By leveraging Claude AI's advanced language capabilities, the tool aims to reduces manual review time while improving document quality and consistency.

### Value Proposition
- **Accelerate Review Cycles**: Automated analysis reduces weeks of manual review to hours
- **Improve Quality**: AI-powered suggestions ensure completeness, clarity, and compliance
- **Enable Collaboration**: Real-time commenting and highlighting facilitate team coordination
- **Ensure Consistency**: Template-based checks enforce organizational standards



---

## 2. Product Overview

### What is Doc Review Assistant?

Doc Review Assistant is an enterprise-grade document review platform that combines AI-powered analysis with collaborative editing tools. Built specifically for BMO's compliance, finance,risk, and legal teams, it transforms PDF documents into structured, reviewable content and provides intelligent suggestions for improvement.

### Problem Statement

BMO teams face significant challenges in document review:
- **Manual Review Overhead**: Policy documents require weeks of manual review across multiple stakeholders
- **Inconsistent Quality**: Lack of standardized review processes leads to gaps and inconsistencies
- **Collaboration Friction**: Email-based review cycles create version control issues
- **Template Compliance**: Manual checking against templates is time-consuming and error-prone
- **Knowledge Silos**: Subject matter expertise is not systematically captured or applied

### Solution Approach

Doc Review Assistant addresses these challenges through:
1. **AI-Powered Ingestion**: Converts PDFs to structured, editable blocks using Claude Vision
2. **Automated Analysis**: Runs comprehensive checks (coverage, compliance, language, structure)
3. **Template Validation**: Compares documents against organizational templates
4. **Collaborative Workspace**: Real-time commenting, highlighting, and suggestions
5. **Intelligent Q&A**: Chat interface for document-specific questions

### Core Capabilities

- **PDF Processing**: Direct conversion of policy documents to structured JSON blocks
- **Multi-Phase Analysis**: TOC review, holistic checks, synthesis summary
- **Block-Level Editing**: Granular editing with change tracking
- **AI Suggestions**: Context-aware text improvements
- **Comments System**: Threaded discussions on specific text selections
- **Template Checking**: Automated compliance validation
- **Export Options**: Download improved documents in multiple formats

---

## 3. User Personas & Use Cases

### Primary User Personas

#### 1. **Sarah - Compliance Officer** TBD 
**Role**: Ensures policies meet regulatory requirements  
**Goals**: Validate documents against OSFI guidelines, identify gaps, track remediation  
**Pain Points**: Manual gap analysis takes days, tracking changes across versions is difficult  
**How Tool Helps**: Automated compliance checks, gap identification, comment tracking

#### 2. **Michael - Policy Writer**
**Role**: Drafts and maintains internal policies  
**Goals**: Create clear, comprehensive policies that meet templates  
**Pain Points**: Uncertain if content meets standards, feedback comes late in process  
**How Tool Helps**: Real-time AI suggestions, template validation, instant feedback

#### 3. **Jennifer - Risk Manager**
**Role**: Reviews risk assessment documentation  
**Goals**: Ensure risk coverage is complete, language is precise  
**Pain Points**: Identifying missing risk scenarios, inconsistent terminology  
**How Tool Helps**: Coverage analysis, terminology consistency checks, AI chat for questions

#### 4. **David - Legal Counsel**
**Role**: Reviews policies for legal compliance  
**Goals**: Identify legal risks, ensure regulatory alignment  
**Pain Points**: Large document volumes, tight deadlines, coordination with multiple teams  
**How Tool Helps**: Prioritized issue flagging, collaborative commenting, synthesis summaries

### Key Use Cases

#### Use Case 1: New Policy Creation
**Scenario**: Michael needs to create a new "Third-Party Risk Management Policy"  
**Workflow**:
1. Upload existing reference policy or template
2. Run analysis to understand template structure
3. Draft new content using AI suggestions
4. Validate against template requirements
5. Share with Sarah (Compliance) for review via comments
6. Address feedback and export final version

**Outcome**: Policy created in 3 days vs. 2 weeks, 100% template compliance

#### Use Case 2: Regulatory Compliance Review
**Scenario**: Sarah needs to validate "AML Policy" against new OSFI guidelines  
**Workflow**:
1. Upload current AML policy PDF
2. Upload OSFI guideline template
3. Run template-based compliance check
4. Review identified gaps in left panel
5. Add comments on required changes
6. Use AI chat to clarify regulatory requirements
7. Track remediation through comment resolution

**Outcome**: Gap analysis completed in 4 hours vs. 3 days, full audit trail

#### Use Case 3: Policy Update Review
**Scenario**: Jennifer needs to review annual update to "Operational Risk Policy"  
**Workflow**:
1. Upload updated policy document
2. Run holistic analysis (coverage, language, structure)
3. Review synthesis summary for high-level assessment
4. Drill into specific sections with issues
5. Use AI suggestions to improve clarity
6. Collaborate with policy owner via comments
7. Export final approved version

**Outcome**: Review completed in 1 day vs. 1 week, 40% fewer revision cycles

#### Use Case 4: Multi-Stakeholder Review
**Scenario**: David coordinates review of "Data Governance Framework" across Legal, Compliance, and IT  
**Workflow**:
1. Upload framework document
2. Run comprehensive analysis
3. Share document link with all stakeholders
4. Each team adds comments on their sections
5. Use highlights to flag critical issues
6. Resolve comments collaboratively
7. Track all changes and decisions

**Outcome**: Coordinated review in 5 days vs. 3 weeks, single source of truth

---

## 4. Features & Capabilities

### 4.1 PDF Ingestion & Processing

**Capability**: Convert any PDF policy document into structured, editable blocks

**Key Benefits**:
- Preserves document structure (headings, lists, tables)
- Handles complex layouts and multi-column formats
- Maintains formatting (bold, italic, underline)
- Creates table of contents automatically

**Limitations**:
- Processing time: ~30-60 seconds per page
- Best results with text-based PDFs (not scanned images)
- Tables with complex merging may need manual review

### 4.2 AI-Powered Document Analysis

**Capability**: Automated comprehensive review across multiple dimensions

**Analysis Phases**:

**Phase 1: TOC Review**
- Analyzes document structure and organization
- Identifies missing or misplaced sections
- Validates heading hierarchy
- Compares against expected structure

**Phase 2: Holistic Checks** (4 parallel analyses)
1. **Conceptual Coverage**: Identifies missing topics, gaps in logic
2. **Compliance & Governance**: Checks regulatory alignment, policy requirements
3. **Language & Clarity**: Flags jargon, ambiguity, passive voice
4. **Structural & Presentation**: Reviews formatting, consistency, readability

**Phase 2: Synthesis Summary**
- Executive summary of findings
- Prioritized recommendations
- Overall compliance score
- Critical gaps highlighted

**Key Benefits**:
- Comprehensive review in minutes vs. days
- Consistent evaluation criteria
- Prioritized action items
- Audit trail of analysis

### 4.3 Template-Based Compliance Checking

**Capability**: Validate documents against organizational templates

**How It Works**:
- Upload template document (e.g., "Policy Template v2.1")
- System compares document structure and content against template
- Identifies missing required sections
- Flags deviations from standard language
- Generates gap analysis report

**Key Benefits**:
- Ensures 100% template compliance
- Reduces manual checklist validation
- Highlights specific gaps with context
- Suggests content to fill gaps

**Use Cases**:
- New policy creation against templates
- Regulatory guideline compliance
- Internal standard validation
- Audit preparation

### 4.4 Collaborative Commenting

**Capability**: Real-time commenting and discussion on specific text

**Features**:
- **Text Selection Comments**: Highlight specific text and add comments
- **Block Comments**: Comment on entire paragraphs or sections
- **Threaded Replies**: Multi-level discussion threads
- **Comment Resolution**: Mark comments as resolved when addressed
- **User Attribution**: Track who said what and when
- **Highlight Persistence**: Comments remain visible across sessions

**Key Benefits**:
- Eliminates email-based review cycles
- Maintains context with inline comments
- Tracks all feedback in one place
- Clear ownership and resolution status

**Workflow**:
1. Select text in document
2. Click "Add Comment" or press Cmd+Shift+M
3. Type comment and submit
4. Team members receive notification
5. Reply to comment or resolve
6. Export comment log for audit trail

### 4.5 AI Text Improvement Suggestions

**Capability**: Context-aware suggestions to improve clarity and quality

**How It Works**:
- Select text that needs improvement
- Click "Improve with AI" or use sparkle button
- AI analyzes text in document context
- Provides improved version with explanation
- Accept or reject suggestion with one click

**Suggestion Types**:
- **Clarity**: Simplify complex sentences, remove jargon
- **Conciseness**: Reduce wordiness, eliminate redundancy
- **Precision**: Replace vague terms with specific language
- **Tone**: Adjust formality, improve professionalism
- **Structure**: Reorganize for better flow

**Key Benefits**:
- Instant writing assistance
- Maintains document context
- Learns from organizational style
- Preserves original intent

**Example**:
- **Original**: "The bank should endeavor to implement appropriate controls to mitigate risks that may arise from third-party relationships."
- **Improved**: "The bank must implement controls to mitigate third-party risks."
- **Reason**: More direct, removes hedging language, clearer action

### 4.6 Document Q&A Chat (RiskGPT)

**Capability**: Ask questions about document content and get AI-powered answers

**Features**:
- **Document-Aware**: AI has full context of uploaded document
- **Block Selection**: Select specific sections for focused questions
- **Conversation History**: Maintains context across questions
- **Source Citations**: Answers reference specific document sections
- **Multi-Turn Dialogue**: Follow-up questions build on previous answers

**Use Cases**:
- "What are the key risk indicators mentioned?"
- "Does this policy address vendor due diligence?"
- "Summarize the escalation process"
- "What's missing compared to OSFI B-10?"

**Key Benefits**:
- Instant answers without reading entire document
- Identifies gaps and inconsistencies
- Clarifies complex sections
- Supports decision-making

### 4.7 Block-Level Editing

**Capability**: Edit document at granular block level with rich formatting

**Features**:
- **Rich Text Editor**: Bold, italic, underline, lists, headings
- **Block Types**: Paragraphs, headings, lists, tables, quotes
- **Drag & Drop**: Reorder blocks
- **Auto-Save**: Changes saved automatically every 2 seconds
- **Undo/Redo**: Full edit history
- **Version Tracking**: Track changes over time

**Key Benefits**:
- Precise editing control
- No formatting loss
- Collaborative editing
- Change tracking

---

## 5. User Guide

### 5.1 Getting Started

#### Initial Setup
1. Navigate to `http://localhost:8000` (or your deployment URL)
2. Log in with BMO credentials (default: `admin/admin123` for POC)
3. You'll see the Documents page

#### System Requirements
- **Browser**: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- **Internet**: Stable connection for AI API calls
- **Screen**: 1920x1080 minimum recommended
- **RAM**: 8GB+ for large documents

### 5.2 Uploading Documents

#### Step-by-Step Upload Process

1. **Click "Upload Document"** button (top-right on Documents page)

2. **Select PDF File**
   - Click "Choose File" or drag & drop
   - Supported: PDF files up to 50MB
   - Recommended: Text-based PDFs (not scanned images)

3. **Configure Upload Options**
   - **Direct JSON Mode**: Faster processing, uses Claude Vision
   - **Template Upload**: Check if uploading a template (not a document to review)

4. **Start Upload**
   - Click "Upload & Process"
   - Progress bar shows upload status
   - Processing steps displayed in real-time:
     - ✓ Uploading file
     - ✓ Registering document
     - ✓ Converting PDF to images
     - ✓ Processing pages (1/10, 2/10, etc.)
     - ✓ Generating table of contents
     - ✓ Creating block structure

5. **Review Results**
   - Document appears in Documents list
   - Status shows "Ready"
   - Click document to open workspace

#### Upload Tips
- **File Naming**: Use descriptive names (e.g., "AML_Policy_v2.1_Draft.pdf")
- **File Size**: Larger files take longer (estimate 1 min per 10 pages)
- **Retry**: If upload fails, check file size and format
- **Duplicates**: System appends unique ID if document name exists

### 5.3 Running Analysis

#### Phase 1: TOC Review

**Purpose**: Analyze document structure and organization

**Steps**:
1. Open document in workspace
2. Click "Run Analysis" in left panel
3. Select "Phase 1: TOC Review"
4. Wait for completion (~30 seconds)
5. Review results in left panel under "Analysis"

**What You Get**:
- Document structure assessment
- Missing sections identified
- Heading hierarchy validation
- Organization recommendations

#### Phase 2: Holistic Analysis

**Purpose**: Comprehensive review across 4 dimensions

**Steps**:
1. After Phase 1 completes, click "Run Phase 2"
2. System runs 4 checks in sequence (~2-3 minutes):
   - Conceptual Coverage
   - Compliance & Governance
   - Language & Clarity
   - Structural & Presentation
3. Synthesis summary generated automatically
4. Results appear in left panel

**What You Get**:
- **Synthesis Summary**: Executive overview with compliance score
- **Detailed Findings**: Issues organized by category and severity
- **Recommendations**: Prioritized action items
- **Gap Analysis**: Missing content identified

#### Template-Based Analysis

**Purpose**: Validate against organizational template

**Steps**:
1. First, upload template document (mark as "Template" during upload)
2. Open document to review
3. Click "Check Template Compliance"
4. Select template from dropdown
5. Wait for analysis (~1-2 minutes)
6. Review gap analysis results

**What You Get**:
- Section-by-section comparison
- Missing required sections
- Deviations from standard language
- Suggested content to add

### 5.4 Reviewing Results

#### Understanding the Workspace

**Left Panel**: Analysis results and suggestions
- **Analysis Tab**: Phase 1/2 results, synthesis summary
- **Suggestions Tab**: AI-generated improvements
- **Artifacts Tab**: Generated reports and exports

**Center Panel**: Document editor
- **Editing Mode**: Edit document content
- **Original Mode**: View original PDF
- **Diff Mode**: Compare original vs. edited

**Right Panel**: Comments and chat
- **Comments Tab**: All document comments
- **Chat Tab**: RiskGPT Q&A interface

#### Navigating Analysis Results

1. **Synthesis Summary** (top of left panel)
   - Overall assessment and compliance score
   - Critical gaps highlighted
   - Key recommendations

2. **Issue List** (scrollable)
   - Issues grouped by severity: High, Medium, Low
   - Click issue to jump to relevant section in document
   - Issue shows: location, description, recommendation

3. **Filtering**
   - Filter by severity (High/Medium/Low)
   - Filter by category (Coverage, Compliance, Language, Structure)
   - Search issues by keyword

#### Taking Action on Issues

**Option 1: Manual Edit**
1. Click issue in left panel
2. Document scrolls to relevant block
3. Edit text directly in center panel
4. Changes auto-save

**Option 2: AI Suggestion**
1. Click "Get AI Suggestion" on issue
2. AI generates improved text
3. Review suggestion in right panel
4. Accept or reject with one click

**Option 3: Add Comment**
1. Click issue to navigate to section
2. Select relevant text
3. Add comment explaining required change
4. Assign to team member
5. Track resolution

### 5.5 Adding Comments

#### Creating Comments

**Method 1: Text Selection**
1. Select text in document (click and drag)
2. Click "Comment" button in floating toolbar
3. Type comment in dialog
4. Click "Submit"

**Method 2: Block Comment**
1. Click comment icon on any block (right side)
2. Type comment
3. Submit

**Method 3: Keyboard Shortcut**
1. Select text
2. Press `Cmd+Shift+M` (Mac) or `Ctrl+Shift+M` (Windows)
3. Type and submit

#### Managing Comments

**Replying**:
1. Click on existing comment in right panel
2. Type reply in text box
3. Submit

**Resolving**:
1. Click "Resolve" button on comment
2. Comment moves to "Resolved" section
3. Can be reopened if needed

**Filtering**:
- View all comments or only unresolved
- Filter by author
- Search comments by keyword

**Exporting**:
1. Click "Export Comments" in right panel
2. Download as CSV or JSON
3. Includes: comment text, author, timestamp, location, status

### 5.6 Using AI Suggestions

#### Generating Suggestions

**Method 1: Selection-Based**
1. Select text that needs improvement
2. Click sparkle button (✨) in toolbar
3. Choose suggestion type:
   - Improve Clarity
   - Make Concise
   - Enhance Precision
   - Adjust Tone
4. AI generates suggestion
5. Review in right panel

**Method 2: Block-Based**
1. Click sparkle button on block
2. AI analyzes entire block
3. Suggests improvements
4. Shows side-by-side comparison

**Method 3: Multi-Block**
1. Select multiple blocks (Cmd+Click)
2. Click "Improve Selected" in right panel
3. AI generates suggestions for all blocks
4. Review and apply individually

#### Reviewing Suggestions

**Suggestion Display**:
- **Original Text**: Current version (left)
- **Suggested Text**: Improved version (right)
- **Reason**: Explanation of changes
- **Diff View**: Highlighted changes

**Actions**:
- **Accept**: Replaces original with suggestion
- **Reject**: Dismisses suggestion
- **Edit**: Modify suggestion before accepting
- **Comment**: Ask question about suggestion

#### Managing Suggestions

**Suggestion List** (left panel):
- All pending suggestions
- Organized by block location
- Shows preview of change
- Filter by type or severity

**Bulk Actions**:
- Accept all suggestions
- Reject all suggestions
- Accept by category (e.g., all "Clarity" suggestions)

**Tracking**:
- Accepted suggestions logged
- Rejected suggestions archived
- Export suggestion log for audit

### 5.7 Exporting Results

#### Export Options

**1. Improved Document**
- **Format**: Markdown, PDF, Word (DOCX)
- **Content**: Edited document with all accepted changes
- **Location**: Downloads folder
- **Naming**: `{document_name}_improved.{format}`

**2. Analysis Report**
- **Format**: PDF, JSON
- **Content**: Synthesis summary, all findings, recommendations
- **Includes**: Charts, tables, issue breakdown
- **Use Case**: Executive summary, audit documentation

**3. Comments Log**
- **Format**: CSV, JSON
- **Content**: All comments, replies, resolution status
- **Columns**: Comment text, author, timestamp, location, status
- **Use Case**: Audit trail, team coordination

**4. Suggestions Log**
- **Format**: CSV, JSON
- **Content**: All AI suggestions, acceptance status
- **Use Case**: Track improvements, measure impact

#### Export Steps

1. Click "Export" button (top-right in workspace)
2. Select export type
3. Choose format
4. Configure options:
   - Include comments: Yes/No
   - Include suggestions: Yes/No
   - Include analysis: Yes/No
5. Click "Download"
6. File downloads to browser's download folder

#### Sharing Documents

**Option 1: Share Link**
- Click "Share" button
- Copy link to clipboard
- Share with team members
- Recipients need BMO login

**Option 2: Export & Email**
- Export document as PDF
- Attach to email
- Include analysis report if needed

**Option 3: Collaborative Editing**
- Multiple users can open same document
- Real-time comment updates
- Changes synced automatically

---

## 6. Product Roadmap

### Current Version: v1.0 (POC)

**Capabilities**:
- ✅ PDF ingestion with Claude Vision
- ✅ Multi-phase document analysis
- ✅ Block-level editing with rich text
- ✅ Collaborative commenting
- ✅ AI text improvement suggestions
- ✅ Template-based compliance checking
- ✅ Document Q&A chat (RiskGPT)
- ✅ Real-time collaboration via Socket.IO
- ✅ Export to Markdown

**Known Limitations**:
- File-based storage (no database)
- Single-threaded processing
- No document versioning
- Limited to 50MB PDFs
- No user role management
- No audit logging
- Manual template management

### Short-Term Roadmap (Q1-Q2 2025)

**Priority 1: Production Readiness**
- [ ] Database integration (PostgreSQL)
- [ ] User authentication with BMO SSO
- [ ] Role-based access control (Viewer, Editor, Admin)
- [ ] Audit logging and compliance tracking
- [ ] Document versioning and history
- [ ] Async processing with job queue
- [ ] Rate limiting and API throttling

**Priority 2: Enhanced Collaboration**
- [ ] User notifications (email, in-app)
- [ ] @mentions in comments
- [ ] Comment assignments and due dates
- [ ] Approval workflows
- [ ] Change tracking and diff view
- [ ] Document locking (prevent concurrent edits)

**Priority 3: Advanced Analysis**
- [ ] Custom template creation UI
- [ ] Regulatory library integration (OSFI, BCBS, etc.)
- [ ] Cross-document comparison
- [ ] Trend analysis across document versions
- [ ] Risk scoring and prioritization
- [ ] Automated remediation suggestions

**Priority 4: Enterprise Features**
- [ ] Bulk document processing
- [ ] Scheduled analysis jobs
- [ ] Custom report templates
- [ ] API for integrations
- [ ] Webhook notifications
- [ ] Admin dashboard with analytics

### Long-Term Vision (2025-2026)

**Phase: Scale & Performance**
- Support for 1000+ page documents
- Real-time collaborative editing (Google Docs-style)
- Mobile app for review on-the-go
- Offline mode with sync
- Multi-language support


**Phase: Governance & Control**
- Advanced audit trails
- Compliance reporting dashboard
- Policy lifecycle management
- Automated archival and retention
- E-signature integration

**Phase: Advanced AI Capabilities**
- Multi-document synthesis
- Policy impact analysis (what changes if we update X?)
- Regulatory change monitoring and alerts
- Automated compliance mapping
- AI-powered policy recommendations

---

## 8. Release Notes

### Version 1.0.0 - POC Release (January 2025)

**Initial Release**

**Core Features**:
- ✅ PDF ingestion with Claude Vision API
- ✅ Multi-phase document analysis (TOC, Holistic, Synthesis)
- ✅ Block-based rich text editor (Lexical)
- ✅ Collaborative commenting system
- ✅ AI text improvement suggestions
- ✅ Template-based compliance checking
- ✅ Document Q&A chat (RiskGPT)
- ✅ Real-time collaboration (Socket.IO)
- ✅ Markdown export

**Technical Stack**:
- Backend: Flask (Python 3.13)
- Frontend: React 18 + TypeScript
- Editor: Lexical
- AI: Anthropic Claude API
- Storage: File-based JSON

**Known Issues**:
- Large documents (100+ pages) may timeout
- No document versioning
- Limited concurrent user support
- Comments don't support file attachments
- Export limited to Markdown format
- Ask AI color not visible and not saved 
- Horizontal toolbar buttons 
- Update prompt workflow 

**Limitations**:
- File-based storage (no database)
- Single-threaded processing
- No user role management
- No audit logging
- Manual template management
- 50MB file size limit

---

### Version 1.1.0 - Planned (Q1 2025)

**Enhancements**:
- [ ] Database integration (PostgreSQL)
- [ ] BMO SSO authentication
- [ ] Document versioning
- [ ] Async processing queue
- [ ] Export to PDF and Word
- [ ] User notifications
- [ ] Improved error handling

**Bug Fixes**:
- [ ] Fix timeout on large documents
- [ ] Improve Socket.IO reconnection
- [ ] Fix comment highlight persistence
- [ ] Resolve editor scroll issues

---

### Version 1.2.0 - Planned (Q2 2025)

**New Features**:
- [ ] Role-based access control
- [ ] Approval workflows
- [ ] Audit logging
- [ ] Custom templates UI
- [ ] Cross-document comparison
- [ ] Bulk document processing

**Performance**:
- [ ] 50% faster document processing
- [ ] Support for 200+ page documents
- [ ] 50+ concurrent users

---

## 9. Appendix

### A. Glossary

**Agent**: The AI orchestrator that runs document analysis phases

**Block**: A discrete unit of content (paragraph, heading, list, table)

**Block ID**: Unique identifier for each block (format: `p{page}_b{block}_{hash}`)

**Claude Vision**: Anthropic's AI model for image analysis (used for PDF OCR)

**Holistic Checks**: Phase 2 analysis covering 4 dimensions (coverage, compliance, language, structure)

**IIFE**: Immediately Invoked Function Expression (React bundle format)

**Ingestion**: Process of converting PDF to structured JSON blocks

**Lexical**: Facebook's rich text editor framework

**Phase 0**: Ingestion phase (PDF → JSON blocks)

**Phase 1**: TOC review and structure analysis

**Phase 2**: Holistic checks and synthesis

**RiskGPT**: Document Q&A chat agent

**Socket.IO**: Real-time communication library for live updates

**State**: Complete document data including content, comments, analysis results

**Synthesis**: Executive summary generated from all analysis phases

**Template**: Reference document used for compliance checking

**TOC**: Table of Contents

### B. API Reference

#### REST API Endpoints

**Authentication**:
```
POST /login
Body: { "username": "string", "password": "string" }
Response: { "success": true, "redirect": "/doc-review/documents" }
```

**Document Management**:
```
GET /api/doc_review/documents
Response: [{ "file_id": "string", "status": "string", "updated_at": "string" }]

POST /api/doc_review/upload
Body: FormData with file
Response: { "file_id": "string", "saved_path": "string" }

GET /api/doc_review/documents/{file_id}
Response: { "id": "string", "state": {...}, "status": "string" }

PUT /api/doc_review/documents/{file_id}/markdown
Body: { "markdown": "string" }
Response: { "success": true }
```

**Analysis**:
```
POST /api/doc_review/documents/{file_id}/run_phase1
Response: { "run_id": "string", "status": "success" }

POST /api/doc_review/documents/{file_id}/run_phase2
Response: { "status": "success", "phase2_data": {...} }

POST /api/doc_review/documents/{file_id}/check_template
Body: { "template_name": "string" }
Response: { "gaps": [...], "suggestions": [...] }
```

**Comments**:
```
GET /api/doc_review/{file_id}/comments
Response: [{ "id": "string", "content": "string", "author": "string" }]

POST /api/doc_review/{file_id}/comments
Body: { "block_id": "string", "content": "string", "selection_text": "string" }
Response: { "id": "string", "timestamp": "string" }
```

**AI Suggestions**:
```
GET /api/doc_review/{file_id}/ai_suggestions
Response: [{ "id": "string", "block_id": "string", "suggested_text": "string" }]

POST /api/doc_review/{file_id}/improve_text
Body: { "text": "string", "instruction": "string" }
Response: { "improved_text": "string", "explanation": "string" }
```

**Chat (RiskGPT)**:
```
GET /api/doc_review/{file_id}/chat
Response: [{ "role": "user|assistant", "content": "string" }]

POST /api/doc_review/{file_id}/chat
Body: { "message": "string", "selected_blocks": ["string"] }
Response: { "response": "string", "suggestions": [...] }
```

#### Socket.IO Events

**Client → Server**:
```javascript
socket.emit('join_document', { file_id: 'doc123' })
socket.emit('leave_document', { file_id: 'doc123' })
```

**Server → Client**:
```javascript
socket.on('node_started', { node: 'phase1_toc_review', timestamp: '...' })
socket.on('node_completed', { node: 'phase1_toc_review', status: 'success', duration_ms: 1234 })
socket.on('markdown_ready', { path: '/raw.md', bytes: 12345 })
socket.on('comment_added', { comment_id: 'c123', block_id: 'b456' })
```

### C. Integration Guide

#### Integrating with BMO Systems

**1. SSO Integration** (Planned)
```python
# Example: SAML integration
from flask_saml import SAML

app.config['SAML_METADATA_URL'] = 'https://sso.bmo.com/metadata'
saml = SAML(app)

@app.route('/saml/login')
def saml_login():
    return saml.authenticate()
```

**2. Document Management System Integration** (Planned)
```python
# Example: SharePoint integration
from office365.sharepoint.client_context import ClientContext

def upload_to_sharepoint(file_path, doc_id):
    ctx = ClientContext(SHAREPOINT_URL).with_credentials(...)
    with open(file_path, 'rb') as f:
        ctx.web.get_folder_by_server_relative_url('/Documents').upload_file(f'doc_{doc_id}.md', f).execute_query()
```

**3. ServiceNow Integration** (Planned)
```python
# Example: Create incident for critical issues
import requests

def create_servicenow_incident(issue):
    response = requests.post(
        f'{SERVICENOW_URL}/api/now/table/incident',
        auth=(SERVICENOW_USER, SERVICENOW_PASS),
        json={
            'short_description': f'Policy Issue: {issue["title"]}',
            'description': issue['description'],
            'urgency': '1' if issue['severity'] == 'high' else '2'
        }
    )
    return response.json()
```

### D. Best Practices

#### Document Preparation
1. **Use Text-Based PDFs**: Scanned images require OCR and may have lower accuracy
2. **Clean Formatting**: Remove headers/footers that repeat on every page
3. **Consistent Structure**: Use proper heading hierarchy (H1 → H2 → H3)
4. **File Naming**: Use descriptive names with version numbers

#### Analysis Workflow
1. **Start with Phase 1**: Understand structure before detailed analysis
2. **Review Synthesis First**: Get high-level overview before drilling into details
3. **Prioritize High Severity**: Address critical issues first
4. **Use Templates**: Always validate against templates when available
5. **Iterate**: Run analysis after major edits to validate improvements

#### Collaboration
1. **Clear Comments**: Be specific about what needs to change and why
2. **Use @mentions**: Tag relevant team members (when feature available)
3. **Resolve Promptly**: Mark comments as resolved when addressed
4. **Export Regularly**: Save comment logs for audit trail
5. **Version Control**: Export documents at key milestones

#### Performance Optimization
1. **Batch Processing**: Upload multiple documents during off-hours
2. **Chunk Large Docs**: Split 200+ page documents into sections
3. **Close Unused Tabs**: Keep only active documents open
4. **Clear Cache**: Refresh browser if experiencing slowness
5. **Use Chrome**: Best performance and compatibility

#### Security
1. **Protect API Keys**: Never share Anthropic API key
2. **Log Out**: Always log out when done
3. **Secure Sharing**: Only share document links with authorized users
4. **Export Carefully**: Ensure exported files are stored securely
5. **Report Issues**: Contact IT immediately if you suspect security issue

---

**Document Version**: 1.0  
**Last Updated**: January 2025  
**Owner**: Product Management Team  
**Contact**: [product-team@bmo.com](mailto:product-team@bmo.com)

