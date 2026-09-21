import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { ChatRemoveModal } from '@/components/ChatRemoveModal';
import { ChatPreviewStand, type ChatWallpaper } from '@/components/ChatPreviewStand';
import { MessagesPanel } from '@/components/MessagesPanel';
import { Notification } from '@/components/Notification';
import { RichTextEditor } from '@/components/RichTextEditor';
import { WorkspaceTextStage } from '@/components/WorkspaceTextStage';
import { createTemplate, deleteTemplate, insertTextAtSelection, updateTemplate } from '@/lib/templates';
import { normalizeRichTextEntities } from '@/lib/richText';
import { sliceRichText } from '@/lib/richText';
import { getMessageMaxLength } from '@/lib/messageLimits';
import { appendPreviewMessage } from '@/lib/preview';
import { toInlineKeyboardMarkup } from '@/lib/inlineKeyboard';
import type { InlineButtonRow } from '@/lib/inlineKeyboard';
import { loadTemplates, saveTemplates } from '@/lib/storage';
import { MAX_SCHEDULE_OCCURRENCES, type ScheduleRepeatOptions } from '@/lib/scheduling';
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
  sent: ScheduledMessage[];
  activeTab: 'upcoming' | 'sent';
  revealingId: string | null;
  cancelingIds: Set<string>;
  sendingIds: Set<string>;
  setDate: React.Dispatch<React.SetStateAction<string>>;
  setTime: React.Dispatch<React.SetStateAction<string>>;
  handleSchedule: (payload?: {
    chatId: string;
    message: string;
    date: string;
    time: string;
    attachments?: string[];
    entities?: RichTextEntity[];
    replyMarkup?: ReturnType<typeof toInlineKeyboardMarkup>;
  }, repeat?: ScheduleRepeatOptions) => void;
  handleSendDraftNow: (chat: Chat, text: string, attachments?: string[], entities?: RichTextEntity[], replyMarkup?: ReturnType<typeof toInlineKeyboardMarkup>) => Promise<boolean>;
  handleSendNow: (message: ScheduledMessage) => void;
  handleDeleteMessage: (message: ScheduledMessage) => void;
  handleClearSent: () => void;
  handleClearAll: () => void;
  setActiveTab: React.Dispatch<React.SetStateAction<'upcoming' | 'sent'>>;
  publishingDraft: boolean;
  handleCancelMessage: (message: ScheduledMessage) => void;
};

type WorkspaceDraft = {
  body: string;
  entities?: RichTextEntity[];
  attachments: WorkspaceAttachment[];
  savedAt: string;
  inlineButtons?: InlineButtonRow[];
  date?: string;
  time?: string;
  repeatMode?: ScheduleRepeatOptions['mode'];
  repeatDays?: string[];
  repeatOccurrences?: number;
};

type WorkspaceAttachment = {
  name: string;
  path: string;
  size?: number;
};

const WORKSPACE_DRAFT_KEY = 'awaitmsg-workspace-draft';
const PREVIEW_LAYOUT_KEY = 'awaitmsg-preview-layout';
const CHAT_WALLPAPER_STORAGE_KEY = 'awaitmsg-chat-preview-wallpaper';
const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024;
const MAX_ATTACHMENTS_TOTAL_SIZE = 200 * 1024 * 1024;

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

function readChatWallpaper(): ChatWallpaper {
  try {
    const raw = window.localStorage.getItem(CHAT_WALLPAPER_STORAGE_KEY);
    if (!raw) return { theme: 'telegram', image: '', accent: '' };

    const parsed = JSON.parse(raw) as Partial<ChatWallpaper>;
    return {
      theme: parsed.theme === 'custom' ? 'custom' : parsed.theme === 'graphite' ? 'graphite' : 'telegram',
      image: typeof parsed.image === 'string' ? parsed.image : '',
      accent: typeof parsed.accent === 'string' ? parsed.accent : '',
    };
  } catch {
    return { theme: 'telegram', image: '', accent: '' };
  }
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

function isAudioAttachment(attachment: WorkspaceAttachment) {
  return /\.(?:aac|aiff|flac|m4a|mp3|ogg|wav|wma)$/i.test(attachment.name);
}

function toFileUrl(filePath: string) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const encodedPath = normalizedPath
    .split('/')
    .map((segment, index) => (index === 0 ? segment : encodeURIComponent(segment)))
    .join('/');

  return `file:///${encodedPath}`;
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
  sent,
  activeTab,
  revealingId,
  cancelingIds,
  sendingIds,
  setDate,
  setTime,
  handleSchedule,
  handleSendDraftNow,
  handleSendNow,
  handleDeleteMessage,
  handleClearSent,
  handleClearAll,
  setActiveTab,
  publishingDraft,
  handleCancelMessage,
}: WorkspacePageProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bodyInputRef = useRef<HTMLDivElement | null>(null);
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
  const [attachmentError, setAttachmentError] = useState('');
  const [inlineButtons, setInlineButtons] = useState<InlineButtonRow[]>(
    () => initialDraftRef.current?.inlineButtons ?? [],
  );
  const [templates, setTemplates] = useState<Template[]>(() => loadTemplates());
  const [savedAt, setSavedAt] = useState(
    () => initialDraftRef.current?.savedAt ?? 'Not saved',
  );
  const [stageMode, setStageMode] = useState<'editor' | 'schedule' | 'template' | 'chat' | 'buttons'>('editor');
  const [, setStageTab] = useState<'editor' | 'templates' | 'buttons'>('editor');
  const [workspaceSelectedChats, setWorkspaceSelectedChats] = useState<Chat[]>([]);
  const workspaceChatOriginRef = useRef<Chat | null>(null);
  const [repeatMode, setRepeatMode] = useState<ScheduleRepeatOptions['mode']>('none');
  const [repeatDays, setRepeatDays] = useState<string[]>([]);
  const [repeatOccurrences, setRepeatOccurrences] = useState(5);
  const scheduleDraftHydratedRef = useRef(false);
  const [templateEditingId, setTemplateEditingId] = useState<string | null>(null);
  const [templateDraftName, setTemplateDraftName] = useState('');
  const [templateDraftBody, setTemplateDraftBody] = useState('');
  const [previewHistory, setPreviewHistory] = useState<PreviewChatHistory | null>(null);
  const [previewHistoryLoading, setPreviewHistoryLoading] = useState(false);
  const [previewHistoryError, setPreviewHistoryError] = useState('');
  const [previewHistoryRetry, setPreviewHistoryRetry] = useState(0);
  const [rightPanelMode, setRightPanelMode] = useState<'preview' | 'queue'>('preview');
  const [chatWallpaper, setChatWallpaper] = useState<ChatWallpaper>(() => readChatWallpaper());
  const [chatListOpen, setChatListOpen] = useState(false);
  const [publishMenuOpen, setPublishMenuOpen] = useState(false);
  const [publishAction, setPublishAction] = useState<'send' | 'schedule'>('send');
  const publishMenuRef = useRef<HTMLDivElement | null>(null);
  const publishMenuToggleRef = useRef<HTMLButtonElement | null>(null);
  const [previewLayout, setPreviewLayout] = useState<PreviewLayout>(() => {
    const layout = initialPreviewLayoutRef.current ?? DEFAULT_PREVIEW_LAYOUT;
    return {
      collapsed: layout.collapsed === true,
      visible: layout.visible ?? true,
    };
  });
  const previewCollapsed = previewLayout.collapsed === true;
  const maxDraftLength = getMessageMaxLength(attachments.length > 0);

  useEffect(() => {
    if (draftBody.length <= maxDraftLength) return;

    const limited = sliceRichText(draftBody, draftEntities, 0, maxDraftLength);
    setDraftBody(limited.text);
    setDraftEntities(limited.entities);
  }, [attachments.length, draftBody, draftEntities, maxDraftLength]);

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

  const handlePreviewPanelModeChange = (mode: 'preview' | 'queue') => {
    setRightPanelMode(mode);
  };

  useEffect(() => {
    if (stageMode === 'editor') return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (stageMode === 'chat') {
          setSelectedChat(workspaceChatOriginRef.current);
          workspaceChatOriginRef.current = null;
          setWorkspaceSelectedChats([]);
        }
        setStageMode('editor');
        setStageTab('editor');
        setTemplateEditingId(null);
        setTemplateDraftName('');
        setTemplateDraftBody('');
        (document.activeElement as HTMLElement | null)?.blur();
      }
    };

    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [setSelectedChat, stageMode]);

  useEffect(() => {
    if (!publishMenuOpen) return;

    const closePublishMenu = (event: MouseEvent) => {
      if (publishMenuRef.current && !publishMenuRef.current.contains(event.target as Node)) {
        setPublishMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setPublishMenuOpen(false);
        publishMenuToggleRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', closePublishMenu);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closePublishMenu);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [publishMenuOpen]);

  useEffect(() => {
    if (stageMode !== 'editor' || publishMenuOpen) return;

    const returnToSchedule = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      event.preventDefault();
      if (chatListOpen) {
        setChatListOpen(false);
        return;
      }
      window.location.hash = '#/';
    };

    document.addEventListener('keydown', returnToSchedule);
    return () => document.removeEventListener('keydown', returnToSchedule);
  }, [chatListOpen, publishMenuOpen, stageMode]);

  useEffect(() => {
    const savedDraft = initialDraftRef.current;
    if (savedDraft?.date) setDate(savedDraft.date);
    if (savedDraft?.time) setTime(savedDraft.time);
    if (savedDraft?.repeatMode) setRepeatMode(savedDraft.repeatMode);
    if (Array.isArray(savedDraft?.repeatDays)) setRepeatDays(savedDraft.repeatDays);
    if (typeof savedDraft?.repeatOccurrences === 'number' && savedDraft.repeatOccurrences > 0) {
      setRepeatOccurrences(Math.min(MAX_SCHEDULE_OCCURRENCES, Math.floor(savedDraft.repeatOccurrences)));
    }
    scheduleDraftHydratedRef.current = true;
  }, [setDate, setTime]);

  useEffect(() => {
    if (!scheduleDraftHydratedRef.current) return;

    const draft: WorkspaceDraft = {
      body: draftBody,
      entities: draftEntities,
      attachments,
      inlineButtons,
      date,
      time,
      repeatMode,
      repeatDays,
      repeatOccurrences,
      savedAt: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    window.localStorage.setItem(WORKSPACE_DRAFT_KEY, JSON.stringify(draft));
    setSavedAt(draft.savedAt);
  }, [attachments, date, draftBody, draftEntities, inlineButtons, repeatDays, repeatMode, repeatOccurrences, time]);

  useEffect(() => {
    if (successPulse) {
      setDraftBody('');
      setDraftEntities([]);
      setAttachments([]);
      setInlineButtons([]);
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

  const previewText = stageMode === 'template' && templateEditingId ? templateDraftBody : draftBody;

  useLayoutEffect(() => {
    if (previewHistoryLoading || previewCollapsed) return;

    const scrollPreviewToBottom = () => {
      if (previewFeedRef.current) {
        previewFeedRef.current.scrollTop = previewFeedRef.current.scrollHeight;
      }
    };

    scrollPreviewToBottom();
    const firstFrame = window.requestAnimationFrame(() => {
      scrollPreviewToBottom();
    });
    const secondFrame = window.requestAnimationFrame(() => {
      scrollPreviewToBottom();
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [
    previewHistory?.chat.id,
    previewHistory?.messages.length,
    previewHistoryLoading,
    previewText,
    draftEntities.length,
    attachments.length,
    inlineButtons.length,
    chatListOpen,
    previewCollapsed,
    selectedChat?.id,
  ]);

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
  const canSchedule = Boolean(selectedChat) && Boolean(draftBody.trim()) && !scheduling;

  const sendDraftNow = () => {
    if (!selectedChat) return;

    const chat = selectedChat;
    const text = draftBody;
    const replyMarkup = toInlineKeyboardMarkup(inlineButtons);
    setPublishMenuOpen(false);
    void handleSendDraftNow(
      chat,
      text,
      attachments.map((attachment) => attachment.path).filter(Boolean),
      draftEntities,
      replyMarkup,
    ).then((sent) => {
      if (!sent) return;

      setPreviewHistory((current) => {
        if (!current || current.chat.id !== chat.id) return current;

        return appendPreviewMessage(current, chat.id, text, replyMarkup);
      });
    });
  };

  const openScheduleStage = () => {
    setPublishMenuOpen(false);
    changeStageMode('schedule');
  };

  const scheduleDraft = () => {
    if (!selectedChat) return;

    handleSchedule({
      chatId: selectedChat.id,
      message: draftBody,
      date,
      time,
      attachments: attachments.map((attachment) => attachment.path).filter(Boolean),
      entities: draftEntities,
      replyMarkup: toInlineKeyboardMarkup(inlineButtons),
    }, {
      mode: repeatMode,
      days: repeatDays,
      occurrences: repeatOccurrences,
    });
  };

  const choosePublishAction = (action: 'send' | 'schedule') => {
    setPublishAction(action);
    setPublishMenuOpen(false);
  };

  const handlePrimaryPublish = () => {
    if (publishAction === 'schedule') {
      if (stageMode === 'schedule') {
        scheduleDraft();
      } else {
        openScheduleStage();
      }
      return;
    }

    sendDraftNow();
  };

  const insertTextAtCursor = (insertedText: string) => {
    const editor = bodyInputRef.current;
    const selectionStart = Number(editor?.dataset.selectionStart);
    const selectionEnd = Number(editor?.dataset.selectionEnd);
    const hasSelection = Number.isFinite(selectionStart) && Number.isFinite(selectionEnd);
    const start = hasSelection ? selectionStart : draftBody.length;
    const end = hasSelection ? selectionEnd : draftBody.length;
    const { body: nextValue, caretPosition } = insertTextAtSelection(
      draftBody,
      insertedText,
      start,
      end,
    );

    setDraftBody(nextValue);
    setDraftEntities([]);

    if (!editor) return;

    editor.dataset.selectionStart = String(caretPosition);
    editor.dataset.selectionEnd = String(caretPosition);
    setTimeout(() => {
      editor.focus();
      const range = editor.ownerDocument.createRange();
      const walker = editor.ownerDocument.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      let remaining = caretPosition;
      let node = walker.nextNode();

      while (node) {
        const length = node.textContent?.length ?? 0;
        if (remaining <= length) {
          range.setStart(node, remaining);
          range.collapse(true);
          const selection = editor.ownerDocument.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          break;
        }
        remaining -= length;
        node = walker.nextNode();
      }
    }, 0);
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
    setStageTab('editor');
  };

  const completeChatSelection = () => {
    const availableChats = workspaceSelectedChats.filter((chat) => chats.some((item) => item.id === chat.id));
    setWorkspaceSelectedChats(availableChats);
    setSelectedChat(availableChats[0] ?? null);
    workspaceChatOriginRef.current = null;
    setStageMode('editor');
  };

  const changeStageMode = (nextMode: 'editor' | 'schedule' | 'template' | 'chat' | 'buttons') => {
    if (stageMode === 'chat' && nextMode !== 'chat') {
      setSelectedChat(workspaceChatOriginRef.current);
      workspaceChatOriginRef.current = null;
      setWorkspaceSelectedChats([]);
    }
    if (nextMode !== 'template') closeTemplateEditor();
    setStageTab(nextMode === 'template' ? 'templates' : nextMode === 'buttons' ? 'buttons' : 'editor');
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

    const currentSize = attachments.reduce((total, attachment) => total + (attachment.size ?? 0), 0);
    const acceptedFiles: File[] = [];
    let nextSize = currentSize;
    let nextError = '';

    for (const file of files) {
      if (attachments.length + acceptedFiles.length >= MAX_ATTACHMENTS) {
        nextError = `Можно добавить не больше ${MAX_ATTACHMENTS} файлов.`;
        break;
      }

      if (file.size > MAX_ATTACHMENT_SIZE) {
        nextError = `${file.name}: размер файла не должен превышать 50 МБ.`;
        continue;
      }

      if (nextSize + file.size > MAX_ATTACHMENTS_TOTAL_SIZE) {
        nextError = 'Общий размер вложений не должен превышать 200 МБ.';
        break;
      }

      acceptedFiles.push(file);
      nextSize += file.size;
    }

    setAttachments((current) => [
      ...current,
      ...acceptedFiles.map((file) => ({
        name: file.name,
        path: window.telegram.getFilePath(file),
        size: file.size,
      })),
    ]);

    setAttachmentError(nextError);

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
                    <span className="workspace-page-editor-title-text">Create Post</span>
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
                    inputRef={bodyInputRef}
                    text={draftBody}
                    entities={draftEntities}
                    maxLength={maxDraftLength}
                    stageMode={stageMode}
                    onChange={(nextText, nextEntities) => {
                      const limited = nextText.length > maxDraftLength
                        ? sliceRichText(nextText, nextEntities, 0, maxDraftLength)
                        : { text: nextText, entities: nextEntities };
                      setDraftBody(limited.text);
                      setDraftEntities(limited.entities);
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
                            replyMarkup: toInlineKeyboardMarkup(inlineButtons),
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
                        inlineButtons={inlineButtons}
                        setInlineButtons={setInlineButtons}
                      />
                    )}
                  />
                </div>

              </div>

              {attachmentError && <div role="alert" className="workspace-page-empty-attachments">{attachmentError}</div>}

              <div
                className={`workspace-page-attachment-tray ${attachments.length === 0 ? 'is-empty' : ''}`}
                aria-label="Attached files"
                aria-hidden={attachments.length === 0}
              >
                <div className="workspace-page-media-items">
                  {attachments.map((file, index) => {
                    const isAudio = isAudioAttachment(file);

                    return (
                      <div key={`${file.name}-${index}`} className="workspace-page-attachment-card">
                        {isImageAttachment(file) && file.path ? (
                          <img src={toFileUrl(file.path)} alt="" className="workspace-page-attachment-thumbnail" />
                        ) : (
                          <div
                            className={`workspace-page-attachment-file-mark ${isAudio ? 'is-audio' : ''}`}
                            aria-label={isAudio ? 'Audio file' : 'File'}
                          >
                            {isAudio ? (
                              <svg className="workspace-page-attachment-music-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                <path d="M9 18V7.7l9-2.1v9.1a2.7 2.7 0 1 1-2.7-2.7 3.4 3.4 0 0 1 .9.1V7.8l-6.2 1.5V18a2.7 2.7 0 1 1-2.7-2.7A3.5 3.5 0 0 1 9 18Z" fill="currentColor" />
                              </svg>
                            ) : (
                              <svg className="workspace-page-attachment-document-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                <path d="M7 3.5A2.5 2.5 0 0 1 9.5 1h6.2c.4 0 .8.1 1.1.4l2.8 2.8c.3.3.4.7.4 1.1v13.2A2.5 2.5 0 0 1 17.5 21h-8A2.5 2.5 0 0 1 7 18.5v-15Zm3 2.5h5v2h-5V6Zm0 4h7v2h-7v-2Zm0 4h7v2h-7v-2Zm-1-8h.01v2H9V6Z" fill="currentColor" />
                              </svg>
                            )}
                          </div>
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
                    );
                  })}
                </div>
              </div>

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
                        setStageTab('editor');
                        setStageMode('editor');
                      } else {
                        changeStageMode('template');
                      }
                    }}
                    aria-pressed={stageMode === 'template'}
                  >
                    Templates
                  </button>
                  <button
                    type="button"
                    className={`workspace-page-mode-button workspace-page-mode-button-history ${rightPanelMode === 'queue' ? 'is-active' : ''}`}
                    onClick={() => {
                      setRightPanelMode((current) => current === 'queue' ? 'preview' : 'queue');
                    }}
                    aria-pressed={rightPanelMode === 'queue'}
                  >
                    QUEUE / HISTORY
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

                <div className="workspace-page-submit-actions" ref={publishMenuRef}>
                  <button
                    type="button"
                    className="workspace-page-publish-trigger workspace-page-publish-main"
                    onClick={handlePrimaryPublish}
                    disabled={publishAction === 'schedule' ? !canSchedule : !selectedChat || !draftBody.trim() || publishingDraft || scheduling}
                  >
                    <span className="workspace-page-publish-trigger-main">
                      {publishAction === 'schedule'
                        ? (scheduling ? 'Scheduling…' : successPulse && lastAction === 'scheduled' ? 'Scheduled' : 'Schedule')
                        : (publishingDraft ? 'Sending…' : successPulse && lastAction === 'sent' ? 'Sent' : 'Send now')}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="workspace-page-publish-trigger workspace-page-publish-menu-toggle"
                    ref={publishMenuToggleRef}
                    onClick={() => setPublishMenuOpen((current) => !current)}
                    aria-label="More send options"
                    aria-expanded={publishMenuOpen}
                    aria-haspopup="menu"
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setPublishMenuOpen(true);
                      }
                    }}
                  >
                    <span className="workspace-page-publish-trigger-arrow" aria-hidden="true">▾</span>
                  </button>

                  {publishMenuOpen && (
                    <div className="workspace-page-publish-menu workspace-page-publish-menu-compact" role="menu" aria-label="Publish action">
                      <button
                        type="button"
                        className={`workspace-page-publish-option ${publishAction === 'send' ? 'is-selected' : ''}`}
                        autoFocus={publishAction === 'send'}
                        onClick={() => choosePublishAction('send')}
                        disabled={!selectedChat || !draftBody.trim() || publishingDraft || scheduling}
                        role="menuitemradio"
                        aria-checked={publishAction === 'send'}
                      >
                        <span>Send now</span>
                      </button>
                      <button
                        type="button"
                        className={`workspace-page-publish-option is-scheduled ${publishAction === 'schedule' ? 'is-selected' : ''}`}
                        autoFocus={publishAction === 'schedule'}
                        onClick={() => choosePublishAction('schedule')}
                        disabled={!canSchedule}
                        role="menuitemradio"
                        aria-checked={publishAction === 'schedule'}
                      >
                        <span>{scheduling ? 'Scheduling…' : successPulse && lastAction === 'scheduled' ? 'Scheduled' : 'Schedule'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="workspace-page-action-row">
                <div className="workspace-page-draft-meta">Draft saved: {savedAt}</div>
              </div>

            </div>
          </section>

          <section
            className="workspace-page-panel workspace-page-preview-panel"
            data-collapsed={previewCollapsed ? 'true' : 'false'}
            data-visible={previewLayout.visible === false ? 'false' : 'true'}
          >
            {rightPanelMode === 'queue' ? (
              <div className="workspace-page-queue-panel">
                <div className="workspace-page-queue-header">
                  <span>Queue / history</span>
                </div>
                <div
                  className={`workspace-page-queue-content theme-${chatWallpaper.theme}`}
                  style={chatWallpaper.theme === 'custom' && chatWallpaper.image
                    ? { backgroundImage: `url(${chatWallpaper.image})` }
                    : undefined}
                >
                  <MessagesPanel
                    upcoming={upcoming}
                    sent={sent}
                    upcomingLabel="Queue"
                    assistantText=""
                    revealingId={revealingId}
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    onCancel={handleCancelMessage}
                    onSendNow={handleSendNow}
                    onDelete={handleDeleteMessage}
                    onClearSent={handleClearSent}
                    onClearAll={handleClearAll}
                    cancelingIds={cancelingIds}
                    sendingIds={sendingIds}
                    showAllMessages
                  />
                </div>
              </div>
            ) : (
              <ChatPreviewStand
                chats={chats}
                selectedChat={selectedChat}
                previewHistory={previewHistory}
                previewHistoryLoading={previewHistoryLoading}
                previewHistoryError={previewHistoryError}
                previewHistoryRetry={() => setPreviewHistoryRetry((value) => value + 1)}
                previewFeedRef={previewFeedRef}
                draftText={previewText}
                draftEntities={stageMode === 'template' && templateEditingId ? [] : draftEntities}
                inlineButtons={inlineButtons}
                attachments={attachments}
                previewTime={previewTime}
                collapsed={previewCollapsed}
                chatListOpen={chatListOpen}
                onToggleChatList={() => setChatListOpen((current) => !current)}
                onSelectChat={(chat) => {
                  setSelectedChat(chat);
                  setChatListOpen(false);
                }}
                onWallpaperChange={setChatWallpaper}
                rightPanelMode={rightPanelMode}
                onRightPanelModeChange={handlePreviewPanelModeChange}
              />
            )}
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
