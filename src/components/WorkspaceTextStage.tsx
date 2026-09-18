import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Clock, MessageCircle } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import type { Chat, RichTextEntity, Template } from '@/types';
import type { ScheduleRepeatOptions } from '@/lib/scheduling';
import { InlineKeyboardBuilder } from '@/components/InlineKeyboardBuilder';
import type { InlineButtonRow } from '@/lib/inlineKeyboard';

const chatTypeLabels: Record<NonNullable<Chat['type']>, string> = {
  private: 'Private chat',
  group: 'Group chat',
  supergroup: 'Supergroup',
  channel: 'Channel',
  unknown: 'Chat',
};

const timeOptions = Array.from({ length: 24 }, (_, hour) => {
  return `${String(hour).padStart(2, '0')}:00`;
});

function getLocalTimezoneLabel() {
  const now = new Date();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZoneName: 'short',
    timeZone: timezone,
  }).formatToParts(now);
  const name = parts.find((part) => part.type === 'timeZoneName')?.value || timezone;
  const offsetMinutes = -now.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteMinutes = Math.abs(offsetMinutes);
  const offsetHours = Math.floor(absoluteMinutes / 60);
  const offsetRemainder = absoluteMinutes % 60;
  const offset = `GMT${sign}${offsetHours}${offsetRemainder ? `:${String(offsetRemainder).padStart(2, '0')}` : ''}`;
  const country = timezone === 'Europe/Helsinki' ? 'Finland' : timezone;

  return `${country} · ${name} (${offset})`;
}

interface Props {
  mode: 'editor' | 'schedule' | 'template' | 'chat' | 'buttons';
  onModeChange: (mode: 'editor' | 'schedule' | 'template' | 'chat' | 'buttons') => void;
  selectedChat: Chat | null;
  chats: Chat[];
  selectedChats: Chat[];
  onChatSelectionChange: (chats: Chat[]) => void;
  onChatSelectionDone: () => void;
  onChatSelectionBack: () => void;
  onAddChat: (chat: Chat) => void;
  onRemoveChat: (chat: Chat) => void;
  draftBody: string;
  draftEntities: RichTextEntity[];
  date: string;
  time: string;
  setDate: Dispatch<SetStateAction<string>>;
  setTime: Dispatch<SetStateAction<string>>;
  scheduling: boolean;
  canSchedule: boolean;
  onSchedule: (entities: RichTextEntity[], repeat: ScheduleRepeatOptions) => void;
  repeatMode: ScheduleRepeatOptions['mode'];
  setRepeatMode: Dispatch<SetStateAction<ScheduleRepeatOptions['mode']>>;
  repeatDays: string[];
  setRepeatDays: Dispatch<SetStateAction<string[]>>;
  repeatOccurrences: number;
  setRepeatOccurrences: Dispatch<SetStateAction<number>>;
  templates: Template[];
  onInsertTemplate: (body: string) => void;
  templateEditingId: string | null;
  templateDraftName: string;
  setTemplateDraftName: Dispatch<SetStateAction<string>>;
  templateDraftBody: string;
  setTemplateDraftBody: Dispatch<SetStateAction<string>>;
  openTemplateEditor: (template?: Template) => void;
  onDeleteTemplate: (template: Template) => void;
  closeTemplateEditor: () => void;
  saveTemplateStage: () => void;
  inlineButtons: InlineButtonRow[];
  setInlineButtons: (rows: InlineButtonRow[]) => void;
}

export function WorkspaceTextStage({
  mode,
  onModeChange,
  chats,
  selectedChats,
  onChatSelectionChange,
  onChatSelectionDone,
  onChatSelectionBack,
  onAddChat,
  onRemoveChat,
  date,
  time,
  setDate,
  setTime,
  repeatMode,
  setRepeatMode,
  repeatDays,
  setRepeatDays,
  repeatOccurrences,
  setRepeatOccurrences,
  templates,
  onInsertTemplate,
  templateEditingId,
  templateDraftName,
  setTemplateDraftName,
  templateDraftBody,
  setTemplateDraftBody,
  openTemplateEditor,
  onDeleteTemplate,
  closeTemplateEditor,
  saveTemplateStage,
  inlineButtons,
  setInlineButtons,
}: Props) {
  const [showAddChat, setShowAddChat] = useState(false);
  const [addChatQuery, setAddChatQuery] = useState('');
  const [showChatSearch, setShowChatSearch] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [addingChat, setAddingChat] = useState(false);
  const [chatError, setChatError] = useState('');
  const [scheduleRepeatOpen, setScheduleRepeatOpen] = useState(false);
  const [scheduleMoreOpen, setScheduleMoreOpen] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [manualTime, setManualTime] = useState(time);
  const [manualDate, setManualDate] = useState(date);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [timeMenuPosition, setTimeMenuPosition] = useState({ top: 0, left: 0 });
  const timePickerRef = useRef<HTMLSpanElement>(null);
  const timeMenuRef = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const scheduleMoreRef = useRef<HTMLDivElement>(null);
  const scheduleWhenRef = useRef<HTMLElement>(null);
  const scheduleRepeatRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (mode === 'chat') {
      setChatError('');
      setShowChatSearch(false);
      setChatSearchQuery('');
      setShowAddChat(false);
      setAddChatQuery('');
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== 'schedule') return;

    function closeScheduleSubmenu(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (!scheduleRepeatOpen) return;

      event.preventDefault();
      event.stopPropagation();
      setScheduleRepeatOpen(false);
    }

    document.addEventListener('keydown', closeScheduleSubmenu, true);
    return () => document.removeEventListener('keydown', closeScheduleSubmenu, true);
  }, [mode, scheduleRepeatOpen]);

  useEffect(() => {
    if (mode === 'schedule') setScheduleMoreOpen(false);
  }, [mode]);

  useEffect(() => {
    if (!scheduleRepeatOpen || repeatMode === 'none') return;

    requestAnimationFrame(() => {
      scheduleRepeatRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [repeatMode, scheduleRepeatOpen]);

  useEffect(() => {
    if (!timePickerOpen) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!timePickerRef.current?.contains(event.target as Node) && !timeMenuRef.current?.contains(event.target as Node)) {
        setTimePickerOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTimePickerOpen(false);
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [timePickerOpen]);

  useLayoutEffect(() => {
    if (!timePickerOpen) return;

    const updateTimeMenuPosition = () => {
      const trigger = timePickerRef.current?.getBoundingClientRect();
      const menu = timeMenuRef.current;
      if (!trigger || !menu) return;

      const top = trigger.bottom + 6;
      setTimeMenuPosition({
        top: Math.min(top, window.innerHeight - menu.offsetHeight - 12),
        left: Math.min(trigger.left, window.innerWidth - menu.offsetWidth - 12),
      });
    };

    updateTimeMenuPosition();
    window.addEventListener('resize', updateTimeMenuPosition);
    return () => window.removeEventListener('resize', updateTimeMenuPosition);
  }, [timePickerOpen]);

  const visibleSelectedChats = selectedChats.filter((chat) => chats.some((item) => item.id === chat.id));
  const filteredChats = chats.filter((chat) => {
    const query = chatSearchQuery.trim().toLowerCase();
    if (!query) return true;

    return `${chat.name} ${chat.username || ''}`.toLowerCase().includes(query);
  });
  const toggleChat = (chat: Chat) => {
    onChatSelectionChange([chat]);
  };

  const addChat = async () => {
    if (!addChatQuery.trim() || addingChat) return;

    setAddingChat(true);
    setChatError('');
    try {
      const result = await window.telegram.findChat(addChatQuery.trim());
      if (!result.success || !result.chat) {
        setChatError(result.error || 'That chat could not be found.');
        return;
      }

      const chat: Chat = {
        id: String(result.chat.id),
        name: result.chat.name,
        username: result.chat.username || '',
        type: result.chat.type || 'unknown',
        avatarDataUrl: result.chat.avatarDataUrl || '',
      };
      onAddChat(chat);
      onChatSelectionChange([chat]);
      setAddChatQuery('');
      setShowAddChat(false);
    } catch {
      setChatError('Telegram could not be reached. Try again.');
    } finally {
      setAddingChat(false);
    }
  };
  const scheduleDateLabel = date
    ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${date}T12:00:00`))
    : 'Choose date';
  const scheduleTimeLabel = time
    ? new Date(`2000-01-01T${time}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Choose time';
  const openTimePicker = () => {
    setManualTime(time);
    setTimePickerOpen(true);
  };
  const updateManualDatePart = (part: 'day' | 'month' | 'year', value: string) => {
    const [currentYear, currentMonth, currentDay] = manualDate.split('-');
    const limits = { day: 2, month: 2, year: 4 };
    const digits = value.replace(/\D/g, '').slice(0, limits[part]);
    const nextDay = part === 'day' ? digits : currentDay;
    const nextMonth = part === 'month' ? digits : currentMonth;
    const nextYear = part === 'year' ? digits : currentYear;
    const nextValue = `${nextYear}-${nextMonth}-${nextDay}`;
    setManualDate(nextValue);

    if (nextYear.length === 4 && nextMonth.length === 2 && nextDay.length === 2) {
      const candidate = new Date(`${nextValue}T12:00:00`);
      if (!Number.isNaN(candidate.getTime()) && candidate.toISOString().slice(0, 10) === nextValue) {
        setDate(nextValue);
      }
    }
  };
  const updateManualTimePart = (part: 'hours' | 'minutes', value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 2);
    const [currentHours, currentMinutes] = manualTime.split(':');
    const nextHours = part === 'hours' ? digits : currentHours;
    const nextMinutes = part === 'minutes' ? digits : currentMinutes;
    const nextValue = `${nextHours}:${nextMinutes}`;
    setManualTime(nextValue);

    if (nextHours.length === 2 && nextMinutes.length === 2) {
      const hours = Number(nextHours);
      const minutes = Number(nextMinutes);
      if (hours < 24 && minutes < 60) setTime(nextValue);
    }
  };
  const toggleDatePicker = () => {
    if (datePickerOpen) {
      dateInputRef.current?.blur();
      setDatePickerOpen(false);
      return;
    }

    dateInputRef.current?.showPicker?.();
    setDatePickerOpen(true);
  };
  const scheduleRepeatLabel = {
    none: "Doesn't repeat",
    daily: 'Every day',
    weekly: `Every week${repeatDays.length ? ` · ${repeatDays.join(', ')}` : ''}`,
    biweekly: 'Every 2 weeks',
    monthly: `Every month${date ? ` · day ${new Date(`${date}T12:00:00`).getDate()}` : ''}`,
  }[repeatMode];
  const scheduleSummaryLabel = repeatMode === 'none'
    ? `${scheduleDateLabel} at ${scheduleTimeLabel}`
    : `${scheduleRepeatLabel} · ${repeatOccurrences} runs at ${scheduleTimeLabel}`;
  const selectRepeatMode = (nextMode: ScheduleRepeatOptions['mode']) => {
    setRepeatMode(nextMode);
    if (nextMode === 'none') {
      setRepeatDays([]);
      return;
    }

    if ((nextMode === 'weekly' || nextMode === 'biweekly') && repeatDays.length === 0 && date) {
      const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(new Date(`${date}T12:00:00`));
      setRepeatDays([weekday]);
    }
  };
  return (
    <>
      <div className={`workspace-page-rich-text-stage-view workspace-page-rich-text-schedule-stage ${mode === 'schedule' ? 'is-active' : ''}`} aria-hidden={mode !== 'schedule'}>
        <div className="workspace-page-mode-header">
          <h2>Schedule</h2>
          <p className="workspace-page-schedule-timezone">{getLocalTimezoneLabel()}</p>
        </div>

        <div className="workspace-page-schedule-flow">
          <section ref={scheduleWhenRef} className="workspace-page-schedule-row-section is-open workspace-page-schedule-when-section">
            <div className="workspace-page-schedule-selection-row">
              <label className="workspace-page-schedule-selection-field">
                <span>Date</span>
                <span className="workspace-page-schedule-date-control">
                  <button
                    type="button"
                    className="workspace-page-schedule-date-icon-button"
                    aria-label="Open calendar"
                    onClick={toggleDatePicker}
                  >
                    <CalendarDays className="workspace-page-schedule-date-icon" aria-hidden="true" size={18} strokeWidth={1.8} />
                  </button>
                  <span className="workspace-page-schedule-date-fields">
                    <input type="text" value={manualDate.split('-')[2] || ''} inputMode="numeric" maxLength={2} placeholder="DD" aria-label="Day" onChange={(event) => updateManualDatePart('day', event.target.value)} />
                    <b aria-hidden="true">/</b>
                    <input type="text" value={manualDate.split('-')[1] || ''} inputMode="numeric" maxLength={2} placeholder="MM" aria-label="Month" onChange={(event) => updateManualDatePart('month', event.target.value)} />
                    <b aria-hidden="true">/</b>
                    <input type="text" value={manualDate.split('-')[0] || ''} inputMode="numeric" maxLength={4} placeholder="YYYY" aria-label="Year" onChange={(event) => updateManualDatePart('year', event.target.value)} />
                  </span>
                  <input
                    ref={dateInputRef}
                    className="workspace-page-schedule-native-date"
                    type="date"
                    value={date}
                    aria-hidden="true"
                    tabIndex={-1}
                    onChange={(event) => {
                      setDate(event.target.value);
                      setManualDate(event.target.value);
                      setDatePickerOpen(false);
                    }}
                  />
                </span>
              </label>
              <label className="workspace-page-schedule-selection-field">
                <span>Time</span>
                  <span className="workspace-page-schedule-time-control" ref={timePickerRef}>
                  <Clock className="workspace-page-schedule-time-icon" aria-hidden="true" size={18} strokeWidth={1.8} />
                  <button
                    type="button"
                    className="workspace-page-schedule-time-trigger"
                    aria-haspopup="listbox"
                    aria-expanded={timePickerOpen}
                    onClick={() => {
                      if (timePickerOpen) {
                        setTimePickerOpen(false);
                      } else {
                        openTimePicker();
                      }
                    }}
                  >
                    {scheduleTimeLabel}
                  </button>
                  {timePickerOpen && createPortal(
                    <div
                      ref={timeMenuRef}
                      className="workspace-page-schedule-time-menu workspace-page-schedule-time-menu-simple"
                      style={timeMenuPosition}
                      role="listbox"
                      aria-label="Choose time"
                    >
                      <label className="workspace-page-schedule-time-manual">
                        <span>Manual time</span>
                        <span className="workspace-page-schedule-time-manual-fields">
                          <input
                            type="text"
                            value={manualTime.split(':')[0]}
                            inputMode="numeric"
                            maxLength={2}
                            placeholder="HH"
                            aria-label="Hours"
                            onChange={(event) => updateManualTimePart('hours', event.target.value)}
                          />
                          <b aria-hidden="true">:</b>
                          <input
                            type="text"
                            value={manualTime.split(':')[1]}
                            inputMode="numeric"
                            maxLength={2}
                            placeholder="MM"
                            aria-label="Minutes"
                            onChange={(event) => updateManualTimePart('minutes', event.target.value)}
                          />
                        </span>
                      </label>
                      <select
                        className="workspace-page-schedule-time-list"
                        aria-label="Choose time"
                        size={6}
                        value={`${time.slice(0, 2)}:00`}
                        onChange={(event) => {
                          setTime(event.target.value);
                          setTimePickerOpen(false);
                        }}
                      >
                        {timeOptions.map((option) => (
                          <option key={option} value={option}>
                            {new Date(`2000-01-01T${option}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </option>
                        ))}
                      </select>
                    </div>,
                    document.body,
                  )}
                </span>
              </label>
            </div>

            <div className="workspace-page-schedule-row-section workspace-page-schedule-summary-row">
              <div className="workspace-page-schedule-row-heading">
                <span>Summary</span>
                <strong>{scheduleSummaryLabel}</strong>
              </div>
              {repeatMode !== 'none' && <small>Starting {scheduleDateLabel}</small>}
            </div>
          </section>

          <button
            type="button"
            className={`workspace-page-schedule-more ${scheduleMoreOpen ? 'is-open' : ''}`}
            onClick={() => {
              setScheduleMoreOpen((current) => {
                const nextOpen = !current;
                requestAnimationFrame(() => {
                  (nextOpen ? scheduleMoreRef.current : scheduleWhenRef.current)?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                  });
                });
                return nextOpen;
              });
            }}
            aria-expanded={scheduleMoreOpen}
          >
            More options <span aria-hidden="true">{scheduleMoreOpen ? '↑' : '↓'}</span>
          </button>

          {scheduleMoreOpen && <div ref={scheduleMoreRef} className="workspace-page-schedule-extra">
            <section ref={scheduleRepeatRef} className="workspace-page-schedule-row-section workspace-page-schedule-repeat-section">
              <button type="button" className="workspace-page-schedule-row-heading workspace-page-schedule-row-toggle" onClick={() => setScheduleRepeatOpen((current) => !current)} aria-expanded={scheduleRepeatOpen}>
                <span>Repeat</span><strong>{scheduleRepeatLabel}</strong><span className="workspace-page-schedule-chevron" aria-hidden="true">{scheduleRepeatOpen ? '−' : '+'}</span>
              </button>
              {scheduleRepeatOpen && <div className="workspace-page-schedule-repeat-menu">
                {([['none', "Doesn't repeat"], ['daily', 'Every day'], ['weekly', 'Every week'], ['biweekly', 'Every 2 weeks'], ['monthly', 'Every month']] as const).map(([value, label]) => <button type="button" key={value} className={repeatMode === value ? 'is-selected' : ''} onClick={() => selectRepeatMode(value)}>{label}</button>)}
                {(repeatMode === 'weekly' || repeatMode === 'biweekly') && <div className="workspace-page-weekday-list">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <button type="button" key={day} className={repeatDays.includes(day) ? 'is-selected' : ''} onClick={() => setRepeatDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day])}>{day}</button>)}</div>}
                {repeatMode !== 'none' && <label className="workspace-page-repeat-count"><span>Runs</span><select value={repeatOccurrences} onChange={(event) => setRepeatOccurrences(Number(event.target.value))}>{[2, 3, 5, 10, 20].map((count) => <option value={count} key={count}>{count} times</option>)}</select></label>}
              </div>}
            </section>

          </div>}
        </div>

      </div>

      <div className={`workspace-page-rich-text-stage-view workspace-page-rich-text-template-stage ${mode === 'template' ? 'is-active' : ''}`} aria-hidden={mode !== 'template'}>
        {templateEditingId ? (
          <form className="workspace-page-template-stage-editor" onSubmit={(event) => { event.preventDefault(); saveTemplateStage(); }}>
            <label>
              <span>Name</span>
              <input value={templateDraftName} onChange={(event) => setTemplateDraftName(event.target.value)} autoFocus />
            </label>
            <label>
              <span>Body</span>
              <textarea value={templateDraftBody} onChange={(event) => setTemplateDraftBody(event.target.value)} rows={5} />
            </label>
            <div className="workspace-page-stage-actions">
              <button type="button" className="workspace-page-stage-secondary" onClick={closeTemplateEditor}>Cancel / Back</button>
              <button type="submit" className="workspace-page-stage-primary" disabled={!templateDraftName.trim() || !templateDraftBody.trim()}>
                {templateEditingId === 'new' ? 'Save template' : 'Save changes'}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="workspace-page-template-stage-list-header">
              <strong>Templates</strong>
            </div>
            <div className="workspace-page-template-stage-list">
              {templates.length > 0 ? templates.map((template) => (
                <div className="workspace-page-template-stage-item" key={template.id}>
                  <button type="button" onClick={() => { onInsertTemplate(template.body); onModeChange('editor'); }}>
                    <strong>{template.name}</strong>
                    <span>{template.body.length} characters</span>
                  </button>
                  <div>
                    <button type="button" onClick={() => openTemplateEditor(template)}>Edit</button>
                    <button type="button" onClick={() => onDeleteTemplate(template)}>Delete</button>
                  </div>
                </div>
              )) : <div className="workspace-page-template-stage-empty">No templates yet.</div>}
            </div>
            <div className="workspace-page-stage-actions workspace-page-template-stage-footer">
              <button type="button" className="workspace-page-stage-secondary" onClick={() => onModeChange('editor')}>← Back</button>
              <div className="workspace-page-template-stage-footer-actions">
              <button type="button" className="workspace-page-stage-primary" onClick={() => openTemplateEditor()}>+ New template</button>
              </div>
            </div>
          </>
        )}
      </div>

      <div className={`workspace-page-rich-text-stage-view workspace-page-rich-text-buttons-stage ${mode === 'buttons' ? 'is-active' : ''}`} aria-hidden={mode !== 'buttons'}>
        <InlineKeyboardBuilder rows={inlineButtons} onChange={setInlineButtons} open={mode === 'buttons'} onClose={() => onModeChange('editor')} />
      </div>

      <div className={`workspace-page-rich-text-stage-view workspace-page-rich-text-chat-stage ${mode === 'chat' ? 'is-active' : ''}`} aria-hidden={mode !== 'chat'}>
        <div className="workspace-page-chat-stage-list" role="listbox" aria-label="Choose a Telegram chat" aria-multiselectable="false">
          <div className="workspace-page-chat-stage-list-header">
            <strong>Channel</strong>
            <span>{visibleSelectedChats.length > 0 ? 'Selected chat or channel' : 'Choose one chat or channel for this post'}</span>
          </div>
          {filteredChats.length > 0 ? filteredChats.map((chat) => {
            const selected = visibleSelectedChats.some((item) => item.id === chat.id);
            return (
              <div
                key={chat.id}
                className={`workspace-page-chat-stage-item ${selected ? 'is-selected' : ''}`}
                role="option"
                aria-selected={selected}
                tabIndex={0}
                onClick={() => toggleChat(chat)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggleChat(chat);
                  }
                }}
              >
                <span className="workspace-page-chat-stage-avatar" aria-hidden="true">
                  {chat.avatarDataUrl ? <img src={chat.avatarDataUrl} alt="" /> : <MessageCircle size={15} strokeWidth={1.8} />}
                </span>
                <span className="workspace-page-chat-stage-copy">
                  <strong>{chat.name}</strong>
                  <span>{chat.name === 'Saved Messages' ? 'Saved Messages' : chatTypeLabels[chat.type || 'unknown']}{chat.username ? ` · @${chat.username}` : ''}</span>
                </span>
                <span className="workspace-page-chat-stage-check" aria-hidden="true">{selected ? '✓' : ''}</span>
                <button type="button" className="workspace-page-chat-stage-remove" onClick={(event) => { event.stopPropagation(); onRemoveChat(chat); }} aria-label={`Remove ${chat.name} from saved chats`}>×</button>
              </div>
            );
          }) : (
            <div className="workspace-page-chat-stage-empty" role="status">
              <strong>{chats.length === 0 ? 'No chats saved yet' : 'No chats found'}</strong>
              <span>{chats.length === 0 ? 'Add a Telegram chat to continue.' : 'Try another name or username.'}</span>
            </div>
          )}
        </div>

        {showAddChat && (
          <div className="workspace-page-chat-stage-add-form">
            <input value={addChatQuery} onChange={(event) => setAddChatQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void addChat(); } }} placeholder="@username or chat name" aria-label="Chat name or username" autoFocus />
            <button type="button" onClick={() => void addChat()} disabled={addingChat}>{addingChat ? 'Adding…' : 'Add'}</button>
            {chatError && <span role="alert">{chatError}</span>}
          </div>
        )}

        {showChatSearch && (
          <div className="workspace-page-chat-stage-search">
            <input
              type="search"
              value={chatSearchQuery}
              onChange={(event) => setChatSearchQuery(event.target.value)}
              placeholder="Find a chat or channel"
              aria-label="Find a chat or channel"
              autoFocus
            />
          </div>
        )}

        <div className="workspace-page-stage-actions workspace-page-chat-stage-footer">
          <div className="workspace-page-chat-stage-footer-left">
            <button type="button" className="workspace-page-stage-secondary" onClick={onChatSelectionBack}>Back</button>
            <button type="button" className="workspace-page-chat-stage-add" onClick={() => { setShowAddChat((current) => { if (!current) setShowChatSearch(false); return !current; }); setChatError(''); }} aria-expanded={showAddChat}>
              <span aria-hidden="true">+</span> Add another chat
            </button>
            <button type="button" className="workspace-page-chat-stage-add" onClick={() => { setShowChatSearch((current) => { if (!current) setShowAddChat(false); return !current; }); setChatError(''); }} aria-expanded={showChatSearch}>
              Find a chat
            </button>
          </div>
          <button type="button" className="workspace-page-stage-primary" onClick={onChatSelectionDone}>Done</button>
        </div>
      </div>
    </>
  );
}
