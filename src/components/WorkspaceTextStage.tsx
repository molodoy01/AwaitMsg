import type { Dispatch, SetStateAction } from 'react';
import type { Chat, RichTextEntity, Template } from '@/types';

interface Props {
  mode: 'editor' | 'schedule' | 'template';
  onModeChange: (mode: 'editor' | 'schedule' | 'template') => void;
  selectedChat: Chat | null;
  draftBody: string;
  draftEntities: RichTextEntity[];
  date: string;
  time: string;
  setDate: Dispatch<SetStateAction<string>>;
  setTime: Dispatch<SetStateAction<string>>;
  scheduling: boolean;
  canSchedule: boolean;
  onSchedule: (entities: RichTextEntity[]) => void;
  repeatMode: 'none' | 'weekly';
  setRepeatMode: Dispatch<SetStateAction<'none' | 'weekly'>>;
  repeatEvery: string;
  setRepeatEvery: Dispatch<SetStateAction<string>>;
  repeatDays: string[];
  setRepeatDays: Dispatch<SetStateAction<string[]>>;
  repeatEnds: string;
  setRepeatEnds: Dispatch<SetStateAction<string>>;
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
}

export function WorkspaceTextStage({
  mode,
  onModeChange,
  selectedChat,
  draftBody,
  draftEntities,
  date,
  time,
  setDate,
  setTime,
  scheduling,
  canSchedule,
  onSchedule,
  repeatMode,
  setRepeatMode,
  repeatEvery,
  setRepeatEvery,
  repeatDays,
  setRepeatDays,
  repeatEnds,
  setRepeatEnds,
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
}: Props) {
  const scheduleSummary = date && time
    ? new Date(`${date}T${time}`).toLocaleString([], {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    : 'Choose a date and time';

  return (
    <>
      <div className={`workspace-page-rich-text-stage-view workspace-page-rich-text-schedule-stage ${mode === 'schedule' ? 'is-active' : ''}`} aria-hidden={mode !== 'schedule'}>
        <div className="workspace-page-mode-header">
          <button type="button" className="workspace-page-mode-back" onClick={() => onModeChange('editor')}>← Back to editor</button>
          <h2>Schedule</h2>
          <p>Choose when this post should be published</p>
        </div>

        <div className="workspace-page-schedule-stage-form">
          <label>
            <span>Date</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label>
            <span>Time</span>
            <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
          </label>
          <label>
            <span>Repeat</span>
            <select value={repeatMode} onChange={(event) => setRepeatMode(event.target.value as 'none' | 'weekly')}>
              <option value="none">Doesn't repeat</option>
              <option value="weekly">Every week</option>
            </select>
          </label>

          {repeatMode === 'weekly' && (
            <div className="workspace-page-repeat-options">
              <div className="workspace-page-repeat-row">
                <label>
                  <span>Every</span>
                  <select value={repeatEvery} onChange={(event) => setRepeatEvery(event.target.value)}>
                    <option value="week">Week</option>
                  </select>
                </label>
                <label>
                  <span>Ends</span>
                  <select value={repeatEnds} onChange={(event) => setRepeatEnds(event.target.value)}>
                    <option value="never">Never</option>
                    <option value="date">On a date</option>
                  </select>
                </label>
              </div>
              <div>
                <span className="workspace-page-repeat-caption">On</span>
                <div className="workspace-page-weekday-list">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                    <button type="button" key={day} className={repeatDays.includes(day) ? 'is-selected' : ''} onClick={() => setRepeatDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day])}>
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="workspace-page-schedule-summary">
          <span>Next publication</span>
          <strong>{scheduleSummary}</strong>
        </div>

        <div className="workspace-page-stage-actions">
          <button type="button" className="workspace-page-stage-secondary" onClick={() => onModeChange('editor')}>Cancel</button>
          <button type="button" className="workspace-page-stage-primary" disabled={!selectedChat || !draftBody.trim() || !canSchedule} onClick={() => onSchedule(draftEntities)}>
            {scheduling ? 'Scheduling…' : 'Schedule'}
          </button>
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
    </>
  );
}
