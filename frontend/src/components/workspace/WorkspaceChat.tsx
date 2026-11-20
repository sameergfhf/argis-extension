// src/components/workspace/WorkspaceChat.tsx — Real-time team conversations & briefing
import React, { useState, useEffect, useRef } from 'react';
import { Send, MessageSquare, Trash2, Clock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import {
  fetchWorkspaceMessages,
  sendWorkspaceMessage,
  deleteWorkspaceMessage,
  subscribeToWorkspaceMessages,
} from '../../services/workspaceService';
import type { WorkspaceMessage } from '../../types';
import { Button, Spinner } from '../ui';
import toast from 'react-hot-toast';

export default function WorkspaceChat() {
  const { user } = useAuth();
  const { currentWorkspace, isOwnerOrAdmin } = useWorkspace();
  const [messages, setMessages] = useState<WorkspaceMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    if (!currentWorkspace?.id) {
      setMessages([]);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    fetchWorkspaceMessages(currentWorkspace.id)
      .then((data) => {
        if (isMounted) {
          setMessages(data);
          setIsLoading(false);
          setTimeout(() => scrollToBottom('auto'), 100);
        }
      })
      .catch((err) => {
        console.warn('Error loading messages:', err);
        if (isMounted) setIsLoading(false);
      });

    const unsubscribe = subscribeToWorkspaceMessages(currentWorkspace.id, (newMsg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
      setTimeout(() => scrollToBottom('smooth'), 50);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [currentWorkspace?.id]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || !currentWorkspace?.id || isSending) return;

    const content = inputText.trim();
    setInputText('');
    setIsSending(true);

    try {
      const msg = await sendWorkspaceMessage(currentWorkspace.id, content);
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      setTimeout(() => scrollToBottom('smooth'), 50);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to send message';
      toast.error(errorMsg);
      setInputText(content);
    } finally {
      setIsSending(false);
    }
  };

  const handleDelete = async (messageId: string) => {
    try {
      await deleteWorkspaceMessage(messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      toast.success('Message deleted');
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to delete message';
      toast.error(errorMsg);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!currentWorkspace) {
    return (
      <div className="aegis-panel px-6 py-10 text-center">
        <MessageSquare className="mx-auto h-6 w-6 text-muted" aria-hidden="true" />
        <p className="mt-2 font-display text-[14px] font-semibold text-ink">No active workspace</p>
        <p className="mt-1 text-[11.5px] text-muted">
          Select or create a workspace to access team chat.
        </p>
      </div>
    );
  }

  return (
    <section
      aria-label={`Team chat for ${currentWorkspace.name}`}
      className="aegis-panel flex h-[600px] flex-col overflow-hidden"
    >
      <div className="aegis-panel-head shrink-0">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-line bg-canvas text-forest">
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="aegis-eyebrow">Channel / briefing</p>
            <h3 className="mt-1 truncate font-display text-[15px] font-semibold tracking-tight text-ink">
              #{currentWorkspace.name}
            </h3>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.08em]">
          <span className="flex items-center gap-1.5 border border-safe/30 bg-safe/10 px-1.5 py-1 text-safe">
            <span className="h-1.5 w-1.5 bg-safe" aria-hidden="true" />
            Live
          </span>
          <span className="tabular-nums text-muted">{messages.length} msg</span>
        </div>
      </div>

      <div
        className="flex-1 space-y-4 overflow-y-auto bg-canvas px-3.5 py-4 [scrollbar-width:thin] sm:px-4"
        role="log"
        aria-live="polite"
        aria-label="Message history"
      >
        {isLoading ? (
          <div className="flex h-full flex-col items-center justify-center gap-2.5">
            <Spinner size="sm" label="" />
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
              Connecting to team stream…
            </p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <span className="flex h-10 w-10 items-center justify-center border border-line bg-paper text-forest">
              <MessageSquare className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            <h4 className="font-display text-[14px] font-semibold text-ink">Channel is quiet</h4>
            <p className="max-w-xs text-[11.5px] leading-relaxed text-muted">
              Start the briefing — share scan findings, coordinate investigations, or assign
              follow-up actions.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe =
              msg.sender_id === user?.id ||
              (user?.email && msg.sender_email.toLowerCase() === user.email.toLowerCase());
            const canDelete = isMe || isOwnerOrAdmin;
            const timeStr = new Date(msg.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });
            const displayName = isMe
              ? 'You'
              : msg.sender_name || msg.sender_email.split('@')[0];

            return (
              <div key={msg.id} className={`group flex gap-2.5 ${isMe ? 'flex-row-reverse' : ''}`}>
                <div
                  aria-hidden="true"
                  className={`flex h-7 w-7 shrink-0 items-center justify-center border font-mono text-[10px] font-semibold uppercase ${
                    isMe
                      ? 'border-forest/30 bg-forest/10 text-forest'
                      : 'border-line bg-paper text-muted'
                  }`}
                >
                  {(msg.sender_name || msg.sender_email || '?').charAt(0)}
                </div>

                <div
                  className={`flex max-w-[80%] flex-col sm:max-w-[72%] ${
                    isMe ? 'items-end' : 'items-start'
                  }`}
                >
                  <div className="mb-1 flex flex-wrap items-center gap-1.5 px-0.5 font-mono text-[9.5px] text-muted">
                    <span className="font-semibold uppercase tracking-[0.06em] text-ink">
                      {displayName}
                    </span>
                    {!isMe ? (
                      <span className="truncate text-[9px] text-muted">{msg.sender_email}</span>
                    ) : null}
                    <span className="flex items-center gap-0.5 tabular-nums">
                      <Clock className="h-2.5 w-2.5" aria-hidden="true" />
                      {timeStr}
                    </span>
                  </div>

                  <div className="relative">
                    <div
                      className={`whitespace-pre-wrap break-words border px-3 py-2 text-[12px] leading-relaxed ${
                        isMe
                          ? 'border-forest bg-forest text-[var(--aegis-primary-hover-fg)]'
                          : 'border-line bg-paper text-ink'
                      }`}
                    >
                      {msg.content}
                    </div>

                    {canDelete ? (
                      <button
                        type="button"
                        onClick={() => handleDelete(msg.id)}
                        title="Delete message"
                        aria-label={`Delete message from ${displayName}`}
                        className={`absolute top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-[6px] text-muted transition-opacity hover:text-critical focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)] sm:opacity-0 sm:group-hover:opacity-100 ${
                          isMe ? '-left-10' : '-right-10'
                        }`}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <form
        onSubmit={handleSend}
        className="flex shrink-0 items-end gap-2 border-t border-line bg-paper p-3"
      >
        <div className="min-h-11 flex-1 border border-line-strong bg-canvas px-3 py-2 transition-colors focus-within:border-forest">
          <label htmlFor="workspace-chat-input" className="sr-only">
            Message #{currentWorkspace.name}
          </label>
          <textarea
            id="workspace-chat-input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message the channel…"
            rows={1}
            className="max-h-28 w-full resize-none overflow-y-auto bg-transparent text-[12.5px] text-ink outline-none placeholder:text-muted"
            style={{ minHeight: '22px' }}
          />
        </div>
        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={!inputText.trim() || isSending}
          isLoading={isSending}
          leftIcon={<Send className="h-3.5 w-3.5" />}
          className="h-11 shrink-0"
        >
          Send
        </Button>
      </form>
    </section>
  );
}
