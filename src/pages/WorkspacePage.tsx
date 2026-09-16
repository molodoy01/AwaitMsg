import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { ChatRemoveModal } from '@/components/ChatRemoveModal';
import { Notification } from '@/components/Notification';
import { RichTextEditor } from '@/components/RichTextEditor';
import { WorkspaceTextStage } from '@/components/WorkspaceTextStage';
import { createTemplate, deleteTemplate, insertTextAtSelection, updateTemplate } from '@/lib/templates';
import { normalizeRichTextEntities, richTextToHtml } from '@/lib/richText';
import { loadTemplates, saveTemplates } from '@/lib/storage';
import type { ScheduleRepeatOptions } from '@/lib/scheduling';
import type {
  Chat,
  PreviewChatHistory,
  RichTextEntity,
  ScheduledMessage,
  Template,
} from '@/types';
import './WorkspacePage.css';

type WorkspacePageProps = {
  connected: boolean;
  chats: Chat[];
  selectedChat: Chat | null;
  setSelectedChat: React.Dispatch<React.SetStateAction<Chat | null>>;
  onAddChat: (chat: Chat) => void;
  onRemoveChat: (chat: Chat) => void;
  removeModal: { show: boolean; chat: Chat | null };
  setRemoveModal: React.Dispatch<React.SetStateAction<{ show: boolean; chat: Chat | null }>>;
  confirmRemoveChat: () => void;
  date: string;
  time: string;
  scheduling: boolean;
  successPulse: boolean;
  lastAction: 'sent' | 'scheduled' | null;
  notification: import('@/types').NotificationState;
  closeNotification: () => void;
  upcoming: ScheduledMessage[];
  setDate: React.Dispatch<React.SetStateAction<string>>;
  setTime: React.Dispatch<React.SetStateAction<string>>;
  handleSchedule: (payload?: {
    chatId: string;
    message: string;
    date: string;
    time: string;
    attachments?: string[];
    entities?: RichTextEntity[];
  }, repeat?: ScheduleRepeatOptions) => void;
  handleSendDraftNow: (chat: Chat, text: string, attachments?: string[], entities?: RichTextEntity[]) => Promise<void>;
  publishingDraft: boolean;
  handleCancelMessage: (message: ScheduledMessage) => void;
};

type WorkspaceDraft = {
  body: string;
  entities?: RichTextEntity[];
  attachments: WorkspaceAttachment[];
  savedAt: string;
};

type WorkspaceAttachment = {
  name: string;
  path: string;
};

const WORKSPACE_DRAFT_KEY = 'awaitmsg-workspace-draft';
const PREVIEW_LAYOUT_KEY = 'awaitmsg-preview-layout';

type PreviewLayout = {
  collapsed?: boolean;
  visible?: boolean;
};

const DEFAULT_PREVIEW_LAYOUT: PreviewLayout = { visible: true };

function readPreviewLayout(): PreviewLayout | null {
  try {
    const raw = window.localStorage.getItem(PREVIEW_LAYOUT_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PreviewLayout>;
    return {
      collapsed: parsed.collapsed === true,
      visible: typeof parsed.visible === 'boolean' ? parsed.visible : true,
    };
  } catch {
    // ignore invalid preview layout
  }

  return null;
}

function normalizeAttachments(value: unknown): WorkspaceAttachment[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((attachment) => {
    if (typeof attachment === 'string') {
      return [{ name: attachment, path: '' }];
    }

    if (
      attachment &&
      typeof attachment === 'object' &&
      typeof attachment.name === 'string' &&
      typeof attachment.path === 'string'
    ) {
      return [{ name: attachment.name, path: attachment.path }];
    }

    return [];
  });
}

function isImageAttachment(attachment: WorkspaceAttachment) {
  return /\.(?:avif|gif|jpe?g|png|webp)$/i.test(attachment.name);
}

function toFileUrl(filePath: string) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const encodedPath = normalizedPath
    .split('/')
    .map((segment, index) => (index === 0 ? segment : encodeURIComponent(segment)))
    .join('/');

  return `file:///${encodedPath}`;
}

function formatPreviewBytes(size?: number) {
  if (!size || size < 1) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatPreviewDuration(duration?: number) {
  if (!duration || duration < 1) return '';
  const minutes = Math.floor(duration / 60);
  const seconds = Math.floor(duration % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function WorkspacePage({
  connected,
  chats,
  selectedChat,
  setSelectedChat,
  onAddChat,
  onRemoveChat,
  removeModal,
  setRemoveModal,
  confirmRemoveChat,
  date,
  time,
  scheduling,
  successPulse,
  lastAction,
  notification,
  closeNotification,
  upcoming,
  setDate,
  setTime,
  handleSchedule,
  handleSendDraftNow,
  publishingDraft,
  handleCancelMessage,
}: WorkspacePageProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bodyInputRef = useRef<HTMLTextAreaElement | null>(null);
  const previewFeedRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const initialPreviewLayoutRef = useRef<PreviewLayout | null>(null);
  const initialDraftRef = useRef<Partial<WorkspaceDraft> | null>(null);

  if (initialPreviewLayoutRef.current === null) {
    initialPreviewLayoutRef.current = readPreviewLayout();
  }

  if (initialDraftRef.current === null) {
    try {
      const raw = window.localStorage.getItem(WORKSPACE_DRAFT_KEY);
      const parsed = raw ? (JSON.parse(raw) as Partial<WorkspaceDraft>) : {};
      initialDraftRef.current = {
        ...parsed,
          entities: normalizeRichTextEntities(parsed.entities, parsed.body?.length ?? 0),
        attachments: normalizeAttachments(parsed.attachments),
      };
    } catch {
      initialDraftRef.current = {};
    }
  }

  const [draftBody, setDraftBody] = useState(() => initialDraftRef.current?.body ?? '');
  const [draftEntities, setDraftEntities] = useState<RichTextEntity[]>(
    () => initialDraftRef.current?.entities ?? [],
  );
  const [attachments, setAttachments] = useState<WorkspaceAttachment[]>(
    () => normalizeAttachments(initialDraftRef.current?.attachments),
  );
  const [templates, setTemplates] = useState<Template[]>(() => loadTemplates());
  const [savedAt, setSavedAt] = useState(
    () => initialDraftRef.current?.savedAt ?? 'Not saved',
  );
  const [stageMode, setStageMode] = useState<'editor' | 'schedule' | 'template' | 'chat'>('editor');
  const [workspaceSelectedChats, setWorkspaceSelectedChats] = useState<Chat[]>([]);
  const workspaceChatOriginRef = useRef<Chat | null>(null);
  const [repeatMode, setRepeatMode] = useState<ScheduleRepeatOptions['mode']>('none');
  const [repeatDays, setRepeatDays] = useState<string[]>([]);
  const [repeatOccurrences, setRepeatOccurrences] = useState(5);
  const [templateEditingId, setTemplateEditingId] = useState<string | null>(null);
  const [templateDraftName, setTemplateDraftName] = useState('');
  const [templateDraftBody, setTemplateDraftBody] = useState('');
  const [previewHistory, setPreviewHistory] = useState<PreviewChatHistory | null>(null);
  const [previewHistoryLoading, setPreviewHistoryLoading] = useState(false);
  const [previewHistoryError, setPreviewHistoryError] = useState('');
  const [previewHistoryRetry, setPreviewHistoryRetry] = useState(0);
  const [previewLayout, setPreviewLayout] = useState<PreviewLayout>(() => {
    const layout = initialPreviewLayoutRef.current ?? DEFAULT_PREVIEW_LAYOUT;
    return {
      collapsed: layout.collapsed === true,
      visible: layout.visible ?? true,
    };
  });
  const previewCollapsed = previewLayout.collapsed === true;

  useEffect(() => {
    window.localStorage.setItem(PREVIEW_LAYOUT_KEY, JSON.stringify(previewLayout));
  }, [previewLayout]);


  const togglePreviewVisibility = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setPreviewLayout((current) => {
      const nextVisible = current.visible ?? true;
      return {
        ...current,
        visible: !nextVisible,
        collapsed: nextVisible ? current.collapsed : false,
      };
    });
  };

  const togglePreviewCollapsed = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setPreviewLayout((current) => ({ ...current, collapsed: !current.collapsed }));
  };

  useEffect(() => {
    if (stageMode === 'editor') return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (stageMode === 'chat') {
          setSelectedChat(workspaceChatOriginRef.current);
          workspaceChatOriginRef.current = null;
          setWorkspaceSelectedChats([]);
        }
        setStageMode('editor');
        setTemplateEditingId(null);
        setTemplateDraftName('');
        setTemplateDraftBody('');
      }
    };

    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [setSelectedChat, stageMode]);

  useEffect(() => {
    if (stageMode !== 'editor') return;

    const returnToSchedule = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      event.preventDefault();
      window.location.hash = '#/';
    };

    document.addEventListener('keydown', returnToSchedule);
    return () => document.removeEventListener('keydown', returnToSchedule);
  }, [stageMode]);

  useEffect(() => {
    const draft: WorkspaceDraft = {
      body: draftBody,
      entities: draftEntities,
      attachments,
      savedAt: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    window.localStorage.setItem(WORKSPACE_DRAFT_KEY, JSON.stringify(draft));
    setSavedAt(draft.savedAt);
  }, [draftBody, draftEntities, attachments]);

  useEffect(() => {
    if (successPulse) {
      setDraftBody('');
      setDraftEntities([]);
      setAttachments([]);
    }
  }, [successPulse]);

  useEffect(() => {
    saveTemplates(templates);
  }, [templates]);

  useEffect(() => {
    let cancelled = false;

    if (!connected || !selectedChat) {
      setPreviewHistory(null);
      setPreviewHistoryLoading(false);
      setPreviewHistoryError('');
      return () => {
        cancelled = true;
      };
    }

    setPreviewHistory(null);
    setPreviewHistoryLoading(true);
    setPreviewHistoryError('');
    window.telegram
      .getChatHistory({ chatId: selectedChat.id, limit: 25 })
      .then((result) => {
        if (cancelled) return;

        setPreviewHistory(result.success ? result.history ?? null : null);
        setPreviewHistoryError(result.success ? '' : result.error || 'Telegram history could not be loaded.');
        setPreviewHistoryLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;

        setPreviewHistory(null);
        setPreviewHistoryError(error instanceof Error ? error.message : 'Telegram history could not be loaded.');
        setPreviewHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [connected, selectedChat, previewHistoryRetry]);

  useLayoutEffect(() => {
    if (!previewHistoryLoading && previewFeedRef.current) {
      previewFeedRef.current.scrollTop = previewFeedRef.current.scrollHeight;
    }
  }, [previewHistory?.chat.id, previewHistory?.messages.length, previewHistoryLoading]);

  const previewText = stageMode === 'template' && templateEditingId ? templateDraftBody : draftBody;
  const previewBody = previewText.trim() || 'Your draft preview will appear here.';
  const hasPreviewText = Boolean(previewText.trim());
  const imageAttachments = attachments.filter(
    (attachment) => isImageAttachment(attachment) && attachment.path,
  );
  const documentAttachments = attachments.filter(
    (attachment) => !isImageAttachment(attachment) || !attachment.path,
  );
  const previewTime = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  const scheduleSummary = (() => {
    if (!date || !time) return 'Schedule';

    const dateValue = new Date(date);
    if (Number.isNaN(dateValue.getTime())) return 'Schedule';

    const summaryDate = new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
    }).format(dateValue);

    const summaryTime = new Date(`2000-01-01T${time}`).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    return `${summaryDate} · ${summaryTime}`;
  })();
  const previewChatTitle = previewHistory?.chat.title || selectedChat?.name || 'Select a chat';
  const previewChatType = previewHistory?.chat.topic
    || (previewHistory?.chat.username ? `@${previewHistory.chat.username}` : '')
    || previewHistory?.chat.type
    || selectedChat?.type
    || 'Chat';
  const previewHistoryGroups = (() => {
    const groups: {
      key: string;
      groupId?: string;
      messages: PreviewChatHistory['messages'];
    }[] = [];

    for (const message of previewHistory?.messages ?? []) {
      const previous = groups[groups.length - 1];
      const groupHasMedia = previous?.messages.some((item) => item.media) ?? false;
      if (
        message.groupId &&
        previous?.groupId === message.groupId &&
        (Boolean(message.media) || groupHasMedia)
      ) {
        previous.messages.push(message);
      } else {
        groups.push({
          key: message.media ? message.groupId || message.id : message.id,
          groupId: message.groupId,
          messages: [message],
        });
      }
    }

    return groups;
  })();

  const renderHistoryMedia = (message: PreviewChatHistory['messages'][number]) => {
    const media = message.media;
    if (!media) return null;

    if (media.kind === 'photo') {
      return media.thumbnailDataUrl ? (
        <img
          src={media.thumbnailDataUrl}
          alt={media.name || 'Telegram photo'}
          className="workspace-page-preview-history-image"
        />
      ) : (
        <div className="workspace-page-preview-history-placeholder">Photo preview unavailable</div>
      );
    }

    if (media.kind === 'video') {
      return (
        <div className="workspace-page-preview-history-video">
          {media.thumbnailDataUrl ? (
            <img
              src={media.thumbnailDataUrl}
              alt={media.name || 'Telegram video'}
              className="workspace-page-preview-history-image"
            />
          ) : (
            <div className="workspace-page-preview-history-placeholder">Video preview unavailable</div>
          )}
          <span className="workspace-page-preview-history-play">▶</span>
          {media.duration ? <span className="workspace-page-preview-history-duration">{formatPreviewDuration(media.duration)}</span> : null}
        </div>
      );
    }

    if (media.kind === 'audio') {
      return (
        <div className="workspace-page-preview-history-audio">
          <div className="workspace-page-preview-history-audio-copy">
            <strong>{media.name || 'Audio message'}</strong>
            <span>{formatPreviewDuration(media.duration) || 'Audio preview unavailable'}</span>
          </div>
          {media.dataUrl ? (
            <audio controls preload="metadata" src={media.dataUrl} />
          ) : (
            <span className="workspace-page-preview-history-play">▶</span>
          )}
        </div>
      );
    }

    return (
      <div className="workspace-page-preview-history-document">
        <span className="workspace-page-preview-file-mark">FILE</span>
        <div className="workspace-page-preview-history-document-copy">
          <strong>{media.name || message.mediaName || 'Document'}</strong>
          <span>{[media.mimeType, formatPreviewBytes(media.size)].filter(Boolean).join(' · ') || 'Document'}</span>
        </div>
      </div>
    );
  };
  const scheduledForCurrentChat = [...upcoming]
    .filter((msg) => msg.chatId === (selectedChat?.id ?? ''))
    .sort((left, right) => new Date(left.when).getTime() - new Date(right.when).getTime())[0] ?? null;
  const canSchedule = Boolean(selectedChat) && Boolean(draftBody.trim()) && !scheduling;

  const insertTextAtCursor = (insertedText: string) => {
    const textarea = bodyInputRef.current;

    const selection = window.getSelection();
    const selectionNode = selection?.anchorNode;
    const selectionEditor = selectionNode instanceof HTMLElement
      ? selectionNode.closest('[contenteditable="true"]')
      : selectionNode?.parentElement?.closest('[contenteditable="true"]');

    if (!textarea && selectionEditor) {
      document.execCommand('insertText', false, insertedText);
      return;
    }

    if (!textarea) {
      const { body: nextValue } = insertTextAtSelection(
        draftBody,
        insertedText,
        draftBody.length,
        draftBody.length,
      );
      setDraftBody(nextValue);
      setDraftEntities([]);
      return;
    }

    const selectionStart = textarea.selectionStart ?? draftBody.length;
    const selectionEnd = textarea.selectionEnd ?? draftBody.length;

    textarea.focus();
    textarea.setSelectionRange(selectionStart, selectionEnd);

    const supportsNativeInsert =
      typeof document.queryCommandSupported === 'function' &&
      document.queryCommandSupported('insertText');

    if (supportsNativeInsert && document.execCommand('insertText', false, insertedText)) {
      return;
    }

    const { body: nextValue, caretPosition } = insertTextAtSelection(
      draftBody,
      insertedText,
      selectionStart,
      selectionEnd,
    );

    setDraftBody(nextValue);
    textarea.selectionStart = caretPosition;
    textarea.selectionEnd = caretPosition;
  };

  const handleCreateTemplate = (input: Pick<Template, 'name' | 'body'>) => {
    setTemplates((current) => [
      ...current,
      createTemplate(input),
    ]);
  };

  const handleUpdateTemplate = (
    id: string,
    input: Pick<Template, 'name' | 'body'>,
  ) => {
    setTemplates((current) =>
      current.map((template) =>
        template.id === id ? updateTemplate(template, input) : template,
      ),
    );
  };

  const handleDeleteTemplate = (template: Template) => {
    if (!window.confirm(`Delete template "${template.name}"?`)) return;

    setTemplates((current) => deleteTemplate(current, template.id));
  };

  const openTemplateEditor = (template?: Template) => {
    setTemplateEditingId(template?.id ?? 'new');
    setTemplateDraftName(template?.name ?? '');
    setTemplateDraftBody(template?.body ?? '');
  };

  const closeTemplateEditor = () => {
    setTemplateEditingId(null);
    setTemplateDraftName('');
    setTemplateDraftBody('');
  };

  const openChatSelection = () => {
    if (stageMode === 'chat') {
      backFromChatSelection();
      return;
    }

    workspaceChatOriginRef.current = selectedChat;
    setWorkspaceSelectedChats((current) => current.length > 0 ? current : selectedChat ? [selectedChat] : []);
    setStageMode('chat');
  };

  const backFromChatSelection = () => {
    setSelectedChat(workspaceChatOriginRef.current);
    workspaceChatOriginRef.current = null;
    setWorkspaceSelectedChats([]);
    setStageMode('editor');
  };

  const completeChatSelection = () => {
    const availableChats = workspaceSelectedChats.filter((chat) => chats.some((item) => item.id === chat.id));
    setWorkspaceSelectedChats(availableChats);
    setSelectedChat(availableChats[0] ?? null);
    workspaceChatOriginRef.current = null;
    setStageMode('editor');
  };

  const changeStageMode = (nextMode: 'editor' | 'schedule' | 'template' | 'chat') => {
    if (stageMode === 'chat' && nextMode !== 'chat') {
      setSelectedChat(workspaceChatOriginRef.current);
      workspaceChatOriginRef.current = null;
      setWorkspaceSelectedChats([]);
    }
    if (nextMode !== 'template') closeTemplateEditor();
    setStageMode(nextMode);
  };

  const saveTemplateStage = () => {
    if (!templateDraftName.trim() || !templateDraftBody.trim()) return;

    if (templateEditingId === 'new') {
      handleCreateTemplate({ name: templateDraftName, body: templateDraftBody });
    } else if (templateEditingId) {
      handleUpdateTemplate(templateEditingId, {
        name: templateDraftName,
        body: templateDraftBody,
      });
    }

    closeTemplateEditor();
  };

  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);

    if (!files.length) return;

    setAttachments((current) => [
      ...current,
      ...files.map((file) => ({
        name: file.name,
        path: window.telegram.getFilePath(file),
      })),
    ]);

    event.target.value = '';
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments((current) => current.filter((_, attachmentIndex) => attachmentIndex !== index));
  };

  return (
    <div
      ref={workspaceRef}
      aria-label="Workspace page"
      className="workspace-page"
    >
      <Notification
        message={notification.message}
        type={notification.type}
        title={notification.title}
        visible={notification.visible}
        onClose={closeNotification}
      />
      <header className="topbar workspace-page-topbar">
        <div className="topbar-identity">
          <div className="brand">STUDIO</div>
        </div>
      </header>
      <div className="workspace-page-shell">
        <main className="workspace-page-main">
          <section className="workspace-page-panel workspace-page-editor-panel">
                <div className="workspace-page-editor-heading">
                  <div className="workspace-page-editor-title">
                    <span>Create Post</span>
                  </div>
                </div>

                <div className="workspace-page-editor-shell">
              <div className="workspace-page-editor-canvas">
                <div className="workspace-page-form-row">
                  <label className="workspace-page-field-label" aria-label="Channel selector" />
                  <div className="workspace-page-channel-picker">
                    <button type="button" className="workspace-page-chat-trigger" onClick={openChatSelection} aria-label="Choose chat">
                      {selectedChat ? (
                        <>
                          <span className="workspace-page-chat-trigger-avatar" aria-hidden="true">
                            {selectedChat.avatarDataUrl ? <img src={selectedChat.avatarDataUrl} alt="" /> : selectedChat.name.slice(0, 1).toUpperCase()}
                          </span>
                          <span className="workspace-page-chat-trigger-copy">
                            <strong>{selectedChat.name}</strong>
                            <span>{selectedChat.name === 'Saved Messages' ? 'Saved Messages' : selectedChat.type || 'Chat'}</span>
                          </span>
                        </>
                      ) : 'Choose chat'}
                    </button>
                  </div>
                </div>

                <div className="workspace-page-form-row workspace-page-form-row-body">
                  <RichTextEditor
                    text={draftBody}
                    entities={draftEntities}
                    stageMode={stageMode}
                    onChange={(nextText, nextEntities) => {
                      setDraftBody(nextText);
                      setDraftEntities(nextEntities);
                    }}
                    stageContent={(
                      <WorkspaceTextStage
                        mode={stageMode}
                        onModeChange={changeStageMode}
                        selectedChat={selectedChat}
                        chats={chats}
                        selectedChats={workspaceSelectedChats}
                        onChatSelectionChange={setWorkspaceSelectedChats}
                        onChatSelectionDone={completeChatSelection}
                        onChatSelectionBack={backFromChatSelection}
                        onAddChat={onAddChat}
                        onRemoveChat={onRemoveChat}
                        draftBody={draftBody}
                        draftEntities={draftEntities}
                        date={date}
                        time={time}
                        setDate={setDate}
                        setTime={setTime}
                        scheduling={scheduling}
                        canSchedule={canSchedule}
                        onSchedule={(entities, repeat) => {
                          if (!selectedChat) return;
                          handleSchedule({
                            chatId: selectedChat.id,
                            message: draftBody,
                            date,
                            time,
                            entities,
                            attachments: attachments.map((attachment) => attachment.path).filter(Boolean),
                          }, repeat);
                          setStageMode('editor');
                        }}
                        repeatMode={repeatMode}
                        setRepeatMode={setRepeatMode}
                        repeatDays={repeatDays}
                        setRepeatDays={setRepeatDays}
                        repeatOccurrences={repeatOccurrences}
                        setRepeatOccurrences={setRepeatOccurrences}
                        templates={templates}
                        onInsertTemplate={insertTextAtCursor}
                        templateEditingId={templateEditingId}
                        templateDraftName={templateDraftName}
                        setTemplateDraftName={setTemplateDraftName}
                        templateDraftBody={templateDraftBody}
                        setTemplateDraftBody={setTemplateDraftBody}
                        openTemplateEditor={openTemplateEditor}
                        onDeleteTemplate={handleDeleteTemplate}
                        closeTemplateEditor={closeTemplateEditor}
                        saveTemplateStage={saveTemplateStage}
                      />
                    )}
                  />
                </div>

              </div>

              {attachments.length > 0 && (
                <div className="workspace-page-attachment-tray" aria-label="Attached files">
                  <div className="workspace-page-media-items">
                    {attachments.map((file, index) => (
                      <div key={`${file.name}-${index}`} className="workspace-page-attachment-card">
                        {isImageAttachment(file) && file.path ? (
                          <img
                            src={toFileUrl(file.path)}
                            alt=""
                            className="workspace-page-attachment-thumbnail"
                          />
                        ) : (
                          <div className="workspace-page-attachment-file-mark">FILE</div>
                        )}
                        <span className="workspace-page-attachment-name">{file.name}</span>
                        <button
                          type="button"
                          className="workspace-page-attachment-remove"
                          onClick={() => handleRemoveAttachment(index)}
                          aria-label={`Remove ${file.name}`}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="workspace-page-action-row workspace-page-schedule-row">
                <div className="workspace-page-media-row">
                  <button
                    type="button"
                    className="workspace-page-preview-toggle workspace-page-attachment-toggle"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Add file"
                    title="Add attachment"
                  >
                    <svg className="workspace-page-attachment-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <path d="M9.6 12.4 16.7 5.3a3.7 3.7 0 1 1 5.2 5.2l-9.4 9.4a5.9 5.9 0 1 1-8.4-8.4l9.9-9.9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFileSelection}
                    className="workspace-page-hidden-file-input"
                  />
                </div>
                <div className="workspace-page-action-left-group">
                  <button
                    type="button"
                    className="workspace-page-preview-toggle"
                    onClick={togglePreviewVisibility}
                    aria-label={previewLayout.visible === false ? 'Show preview' : 'Hide preview'}
                    title={previewLayout.visible === false ? 'Show preview' : 'Hide preview'}
                  >
                    {previewLayout.visible === false ? (
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M4 4l16 16M3 12s3.5-6 10.5-6 10.5 6 10.5 6-3.5 6-10.5 6S3 12 3 12Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M10 14.5a2.5 2.5 0 0 0 3.2-3.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M1.5 12s3.5-6 10.5-6 10.5 6 10.5 6-3.5 6-10.5 6S1.5 12 1.5 12Zm10.5 3.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4Z" fill="currentColor"/>
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    className={`workspace-page-mode-button ${stageMode === 'template' ? 'is-active' : ''}`}
                    onClick={() => {
                      if (stageMode === 'template') {
                        closeTemplateEditor();
                        setStageMode('editor');
                      } else {
                        changeStageMode('template');
                      }
                    }}
                    aria-pressed={stageMode === 'template'}
                  >
                    Templates
                  </button>
                </div>

                <div className="workspace-page-mode-trigger-wrap">
                  <button
                    type="button"
                    className="workspace-page-schedule-menu-trigger"
                    onClick={() => changeStageMode(stageMode === 'schedule' ? 'editor' : 'schedule')}
                  >
                    <Clock className="workspace-page-schedule-menu-icon" aria-hidden="true" size={16} strokeWidth={1.9} />
                    <span>{scheduleSummary === 'Schedule' ? 'Schedule' : scheduleSummary}</span>
                  </button>
                </div>

                <div className="workspace-page-submit-actions">
                  <button
                    type="button"
                    className="workspace-page-send-button"
                    onClick={() => {
                      if (!selectedChat) return;
                      void handleSendDraftNow(
                        selectedChat,
                        draftBody,
                        attachments.map((attachment) => attachment.path).filter(Boolean),
                        draftEntities,
                      );
                    }}
                    disabled={!selectedChat || !draftBody.trim() || publishingDraft || scheduling}
                  >
                    {publishingDraft ? 'Sending…' : successPulse && lastAction === 'sent' ? 'Sent' : 'Send now'}
                  </button>

                  <button
                    type="button"
                    className={`workspace-page-schedule-button ${successPulse ? 'is-success' : ''}`}
                    onClick={() => {
                      if (!selectedChat) return;
                      handleSchedule({
                        chatId: selectedChat.id,
                        message: draftBody,
                        date,
                        time,
                        entities: draftEntities,
                        attachments: attachments
                          .map((attachment) => attachment.path)
                          .filter(Boolean),
                      }, {
                        mode: repeatMode,
                        days: repeatDays,
                        occurrences: repeatMode === 'none' ? 1 : repeatOccurrences,
                      });
                    }}
                    disabled={!canSchedule}
                  >
                    {scheduling ? 'Scheduling…' : successPulse && lastAction === 'scheduled' ? 'Scheduled' : 'Schedule'}
                  </button>
                </div>
              </div>

              <div className="workspace-page-action-row">
                <div className="workspace-page-draft-meta">Draft saved: {savedAt}</div>
              </div>

              {scheduledForCurrentChat && (
                <div className="workspace-page-scheduled-status">
                  <div className="workspace-page-scheduled-label">Scheduled</div>
                  <div className="workspace-page-scheduled-value">
                    {new Date(scheduledForCurrentChat.when).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                  <button
                    type="button"
                    className="workspace-page-cancel-button"
                    onClick={() => handleCancelMessage(scheduledForCurrentChat)}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </section>

          <section
            className="workspace-page-panel workspace-page-preview-panel"
            data-collapsed={previewCollapsed ? 'true' : 'false'}
            data-visible={previewLayout.visible === false ? 'false' : 'true'}
          >
            <div className="workspace-page-preview-header">
              <div className="workspace-page-panel-label" aria-label="Preview header" />
            </div>

            <div className="workspace-page-preview-shell">
              <div className="workspace-page-chat-header">
                <span>{selectedChat ? selectedChat.name : 'Select a chat'}</span>
              </div>

              <div className="workspace-page-preview-feed">
                <div className="workspace-page-draft-preview">
                  {hasPreviewText ? (
                    <span dangerouslySetInnerHTML={{ __html: richTextToHtml(previewText, stageMode === 'template' && templateEditingId ? [] : draftEntities) }} />
                  ) : (
                    previewBody
                  )}
                </div>
                {attachments.length > 0 && (
                  <div className="workspace-page-preview-attachments">
                    {attachments.map((attachment, index) => (
                      <div
                        key={`${attachment.name}-${index}`}
                        className="workspace-page-preview-attachment"
                      >
                        {attachment.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="workspace-page-preview-shell-desktop">
              <div
                className="workspace-page-preview-chat-header"
              >
                {previewHistory?.chat.avatarDataUrl ? (
                  <img
                    src={previewHistory.chat.avatarDataUrl}
                    alt=""
                    className="workspace-page-preview-avatar"
                  />
                ) : (
                  <div className="workspace-page-preview-avatar">
                    {previewChatTitle.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="workspace-page-preview-chat-copy">
                  <div className="workspace-page-preview-chat-name">
                    {previewChatTitle}
                  </div>
                  <div className="workspace-page-preview-chat-state">
                    {previewChatType}
                  </div>
                </div>
                <button
                  type="button"
                  className="workspace-page-preview-collapse"
                  onClick={togglePreviewCollapsed}
                  aria-label={previewCollapsed ? 'Expand preview' : 'Collapse preview'}
                >
                  {previewCollapsed ? '+' : '−'}
                </button>
              </div>

              <div className="workspace-page-preview-feed-desktop" ref={previewFeedRef}>
                {previewHistoryLoading && (
                  <div className="workspace-page-preview-loading" aria-live="polite">
                    Loading history…
                  </div>
                )}

                {!previewHistoryLoading && previewHistoryError && (
                  <div className="workspace-page-preview-error" role="alert">
                    <span>{previewHistoryError}</span>
                    <button type="button" onClick={() => setPreviewHistoryRetry((value) => value + 1)}>
                      Retry
                    </button>
                  </div>
                )}

                {previewHistoryGroups.map((group) => {
                  const firstMessage = group.messages[0];
                  const hasMedia = group.messages.some((message) => message.media);
                  const caption = group.messages.find((message) => message.text)?.text;

                  return (
                    <article
                      className={`workspace-page-preview-bubble workspace-page-preview-history-bubble ${hasMedia ? '' : 'workspace-page-preview-text-only'} ${firstMessage.outgoing ? 'is-outgoing' : 'is-incoming'}`}
                      key={group.key}
                    >
                      {hasMedia && (
                        <div className={`workspace-page-preview-history-media ${group.messages.length > 1 ? 'is-album' : ''}`}>
                          {group.messages.map((message) => (
                            <div className="workspace-page-preview-history-media-item" key={message.id}>
                              {renderHistoryMedia(message)}
                            </div>
                          ))}
                        </div>
                      )}
                      {firstMessage.senderName && !firstMessage.outgoing && (
                        <div className="workspace-page-preview-message">
                          {firstMessage.senderName}
                        </div>
                      )}
                      {hasMedia
                        ? caption && <div className="workspace-page-preview-message">{caption}</div>
                        : group.messages
                          .filter((message) => message.text)
                          .map((message) => (
                            <div className="workspace-page-preview-message" key={message.id}>
                              {message.text}
                            </div>
                          ))}
                      <div className="workspace-page-preview-meta">
                        <span>{new Date(firstMessage.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </article>
                  );
                })}

                {hasPreviewText || attachments.length > 0 ? (
                  <article className="workspace-page-preview-bubble workspace-page-preview-draft-bubble">
                    {imageAttachments.length > 0 && (
                      <div
                        className={`workspace-page-preview-media ${imageAttachments.length > 1 ? 'is-album' : 'is-single'}`}
                      >
                        {imageAttachments.map((attachment, index) => (
                          <div
                            key={`${attachment.name}-${index}`}
                            className="workspace-page-preview-media-item is-image"
                          >
                            <img
                              src={toFileUrl(attachment.path)}
                              alt={attachment.name}
                              className="workspace-page-preview-image"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {documentAttachments.length > 0 && (
                      <div className="workspace-page-preview-documents">
                        {documentAttachments.map((attachment, index) => (
                          <div
                            key={`${attachment.name}-${index}`}
                            className="workspace-page-preview-media-item is-file"
                          >
                            <div className="workspace-page-preview-file">
                              <span className="workspace-page-preview-file-mark">FILE</span>
                              <span className="workspace-page-preview-file-name">
                                {attachment.name}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {hasPreviewText && (
                      <div className={`workspace-page-preview-message ${attachments.length > 0 ? 'is-caption' : ''}`}>
                        <span dangerouslySetInnerHTML={{ __html: richTextToHtml(previewText, stageMode === 'template' && templateEditingId ? [] : draftEntities) }} />
                      </div>
                    )}

                    <div className="workspace-page-preview-meta">
                      <span>{previewTime}</span>
                      <span className="workspace-page-preview-status">✓✓</span>
                    </div>
                  </article>
                ) : (
                  <div className="workspace-page-preview-empty-chat">
                    No messages yet
                  </div>
                )}
              </div>
            </div>
          </section>
        </main>
      </div>

      <ChatRemoveModal
        show={removeModal.show}
        chatName={removeModal.chat?.name || ''}
        onConfirm={confirmRemoveChat}
        onCancel={() => setRemoveModal({ show: false, chat: null })}
      />
    </div>
  );
}
