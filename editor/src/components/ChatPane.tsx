import React, { useState, useRef, useEffect } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Send, Bot, User, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { cn } from './ui/utils';
import { API_BASE } from '../lib/api';

type AgentType = 'autonomous' | 'structured' | 'web' | 'unstructured';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning_trace?: ReasoningNode[];
  file_operations?: FileOperation[];
  timestamp: string;
  agent_used?: AgentType;
}

interface ReasoningNode {
  node: string;
  kind: 'llm' | 'tool' | 'processing' | 'decision';
  label: string;
  output: string;
  timestamp: string;
  status: 'running' | 'completed' | 'failed';
}

interface FileOperation {
  type: string;
  path?: string;
  success?: boolean;
  file_path?: string;
  lexical_json?: any;
  block_count?: number;
}

interface ChatPaneProps {
  onFileCreated?: () => void;
  onEditorPublish?: (lexicalJson: any) => void;
}

export function ChatPane({ onFileCreated, onEditorPublish }: ChatPaneProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [agentType, setAgentType] = useState<AgentType>('autonomous');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/workspace/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input,
          session_id: sessionId,
          user_id: 'default_user',
          agent_type: agentType
        })
      });

      const data = await res.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response || 'No response',
        reasoning_trace: data.reasoning_trace || [],
        file_operations: data.file_operations || [],
        timestamp: new Date().toISOString(),
        agent_used: data.agent_used || agentType
      };

      setMessages(prev => [...prev, assistantMessage]);
      setSessionId(data.session_id);

      // Handle file operations
      if (data.file_operations && data.file_operations.length > 0) {
        data.file_operations.forEach((op: FileOperation) => {
          if (op.type.includes('file') && op.success) {
            onFileCreated?.();
          }
          if (op.type === 'editor_published' && op.lexical_json) {
            onEditorPublish?.(op.lexical_json);
          }
        });
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Error: ' + (error as Error).message,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearConversation = async () => {
    if (!sessionId) return;
    
    try {
      const res = await fetch(`${API_BASE}/workspace/context`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          agent_type: agentType,
          user_id: 'default_user'
        })
      });

      const data = await res.json();
      
      if (data.success) {
        setMessages([]);
        setSessionId(null);
      }
    } catch (error) {
      console.error('Error clearing conversation:', error);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white border-l border-gray-200">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-700">Workspace Assistant</h2>
            {messages.length > 0 && (
              <span className="text-xs text-gray-400">
                ({messages.length} messages)
              </span>
            )}
          </div>
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearConversation}
              className="text-xs text-gray-500 hover:text-red-600"
              title="Clear conversation"
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Clear
            </Button>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Ask me to create files, run code, or help with your work
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-8">
            <Bot className="h-12 w-12 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">Start a conversation with the assistant</p>
            <div className="mt-4 text-xs space-y-1">
              <p className="text-gray-500">Try asking:</p>
              <p className="text-blue-600">"Create a file called notes.md"</p>
              <p className="text-blue-600">"List all my files"</p>
              <p className="text-blue-600">"Execute: print('Hello World')"</p>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 text-gray-500">
            <Bot className="h-4 w-4 animate-pulse" />
            <span className="text-sm">Thinking...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-gray-200 p-4 space-y-3">
        {/* Agent Selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-600 min-w-fit">Agent:</label>
          <select
            value={agentType}
            onChange={(e) => setAgentType(e.target.value as AgentType)}
            className="text-sm px-3 py-1.5 border border-gray-300 rounded-md bg-white hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent flex-1"
            disabled={isLoading}
          >
            <option value="autonomous">🤖 Autonomous Agent (Default)</option>
            <option value="structured">📊 Structured Data Agent</option>
            <option value="web">🌐 Web Search Agent</option>
            <option value="unstructured">📄 Unstructured Data Agent</option>
          </select>
        </div>

        {/* Message Input */}
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask the assistant..."
            className="min-h-[60px] max-h-[120px] resize-none"
            disabled={isLoading}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="self-end"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-gray-400">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

function ChatMessage({ message }: { message: Message }) {
  const [showTrace, setShowTrace] = useState(false);

  return (
    <div className={cn(
      'flex gap-3',
      message.role === 'user' ? 'justify-end' : 'justify-start'
    )}>
      <div className={cn(
        'max-w-[80%] space-y-2',
        message.role === 'user' ? 'order-2' : 'order-1'
      )}>
        {/* Avatar */}
        <div className="flex items-center gap-2 flex-wrap">
          {message.role === 'assistant' ? (
            <Bot className="h-4 w-4 text-blue-600" />
          ) : (
            <User className="h-4 w-4 text-gray-600" />
          )}
          <span className="text-xs text-gray-500">
            {message.role === 'assistant' ? 'Assistant' : 'You'}
          </span>
          {message.role === 'assistant' && message.agent_used && (
            <span className={cn(
              'text-xs px-2 py-0.5 rounded-md font-medium',
              message.agent_used === 'structured' && 'bg-blue-100 text-blue-700',
              message.agent_used === 'web' && 'bg-purple-100 text-purple-700',
              message.agent_used === 'unstructured' && 'bg-green-100 text-green-700',
              message.agent_used === 'autonomous' && 'bg-gray-100 text-gray-700'
            )}>
              {message.agent_used === 'structured' && '📊 Structured'}
              {message.agent_used === 'web' && '🌐 Web'}
              {message.agent_used === 'unstructured' && '📄 Unstructured'}
              {message.agent_used === 'autonomous' && '🤖 Autonomous'}
            </span>
          )}
          <span className="text-xs text-gray-400">
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
        </div>

        {/* Message Content */}
        <div className={cn(
          'rounded-lg px-4 py-2',
          message.role === 'user'
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 text-gray-900'
        )}>
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>

        {/* File Operations */}
        {message.file_operations && message.file_operations.length > 0 && (
          <div className="text-xs space-y-1">
            {message.file_operations.map((op, i) => (
              <div key={i} className="flex items-center gap-1 text-gray-600">
                <span className="text-green-600">✓</span>
                <span>
                  {op.type === 'file_create_file' && `Created: ${op.path}`}
                  {op.type === 'editor_published' && `Published ${op.block_count} blocks to editor`}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Reasoning Trace */}
        {message.reasoning_trace && message.reasoning_trace.length > 0 && (
          <div className="text-xs">
            <button
              onClick={() => setShowTrace(!showTrace)}
              className="flex items-center gap-1 text-gray-600 hover:text-gray-900"
            >
              {showTrace ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              <span>Show reasoning ({message.reasoning_trace.length} steps)</span>
            </button>

            {showTrace && (
              <div className="mt-2 space-y-1 pl-4 border-l-2 border-gray-200">
                {message.reasoning_trace.map((node, i) => (
                  <ReasoningStep key={i} node={node} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ReasoningStep({ node }: { node: ReasoningNode }) {
  const [expanded, setExpanded] = useState(false);

  const getNodeColor = () => {
    switch (node.kind) {
      case 'llm': return 'text-blue-600';
      case 'tool': return 'text-green-600';
      case 'processing': return 'text-gray-600';
      case 'decision': return 'text-purple-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = () => {
    switch (node.status) {
      case 'completed': return '✓';
      case 'failed': return '✗';
      case 'running': return '⋯';
      default: return '·';
    }
  };

  return (
    <div className="text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 hover:bg-gray-50 rounded px-1 py-0.5 w-full text-left"
      >
        <span>{getStatusIcon()}</span>
        <span className={getNodeColor()}>{node.label}</span>
      </button>

      {expanded && node.output && (
        <div className="mt-1 ml-4 p-2 bg-gray-50 rounded text-gray-700 font-mono">
          {node.output}
        </div>
      )}
    </div>
  );
}
