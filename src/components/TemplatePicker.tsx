import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Template } from '@/types';
import './TemplatePicker.css';

type TemplateInput = Pick<Template, 'name' | 'body'>;

type TemplatePickerProps = {
  templates: Template[];
  draftBody: string;
  onInsert: (body: string) => void;
  onCreate: (input: TemplateInput) => void;
  onUpdate: (id: string, input: TemplateInput) => void;
  onDelete: (id: string) => void;
};

export function TemplatePicker({
  templates,
  draftBody,
  onInsert,
  onCreate,
  onUpdate,
  onDelete,
}: TemplatePickerProps) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
        setEditingId(null);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!open) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        setEditingId(null);
      }
    }

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open]);

  function openNewTemplate(initialBody = '') {
    setEditingId('new');
    setName('');
    setBody(initialBody);
    setOpen(true);
  }

  function openEditTemplate(template: Template) {
    setEditingId(template.id);
    setName(template.name);
    setBody(template.body);
    setOpen(true);
  }

  function closeEditor() {
    setEditingId(null);
    setName('');
    setBody('');
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name.trim() || !body.trim()) return;

    if (editingId === 'new') {
      onCreate({ name, body });
    } else if (editingId) {
      onUpdate(editingId, { name, body });
    }

    closeEditor();
  }

  function handleDelete(template: Template) {
    if (window.confirm(`Delete template "${template.name}"?`)) {
      onDelete(template.id);
    }
  }

  function handleInsert(template: Template) {
    onInsert(template.body);
    setOpen(false);
    closeEditor();
  }

  const filteredTemplates = templates.filter((template) => {
    const query = searchQuery.trim().toLowerCase();
    return !query || template.name.toLowerCase().includes(query) || template.body.toLowerCase().includes(query);
  });

  return (
    <div className="template-picker" ref={containerRef}>
      <button
        type="button"
        className="template-picker-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        Templates
      </button>

      <div
        className={`template-picker-popover ${open ? 'open' : ''}`}
        role="dialog"
        aria-label="Templates"
        aria-hidden={!open}
      >
          <div className="template-picker-header">
            <span className="template-picker-title">Templates</span>
          </div>

          {templates.length > 5 && !editingId && (
            <input
              type="search"
              className="template-picker-search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search templates..."
              aria-label="Search templates"
            />
          )}

          {editingId ? (
            <form className="template-picker-editor" onSubmit={handleSubmit}>
              <label>
                <span>Name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoFocus
                  required
                />
              </label>

              <label>
                <span>Body</span>
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  rows={5}
                  required
                />
              </label>

              <div className="template-picker-editor-actions">
                <button type="button" onClick={closeEditor}>
                  Cancel
                </button>
                <button type="submit">Save</button>
              </div>
            </form>
          ) : filteredTemplates.length > 0 ? (
            <div className="template-picker-list">
              {filteredTemplates.map((template) => (
                <div className="template-picker-item" key={template.id}>
                  <button
                    type="button"
                    className="template-picker-item-main"
                    onClick={() => handleInsert(template)}
                  >
                    <span className="template-picker-item-name">{template.name}</span>
                    <span className="template-picker-item-preview">{template.body}</span>
                  </button>
                  <div className="template-picker-item-actions">
                    <button type="button" onClick={() => openEditTemplate(template)}>
                      Edit
                    </button>
                    <button type="button" onClick={() => handleDelete(template)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : templates.length > 0 ? (
            <div className="template-picker-empty">
              <span>No matching templates.</span>
            </div>
          ) : (
            <div className="template-picker-empty">
              <span>No templates yet.</span>
            </div>
          )}

          {!editingId && (
            <div className="template-picker-footer">
              {draftBody.trim() && (
                <button
                  type="button"
                  className="template-picker-save-draft"
                  onClick={() => openNewTemplate(draftBody)}
                >
                  + Save current draft
                </button>
              )}
              <button type="button" className="template-picker-new" onClick={() => openNewTemplate()}>
                + New template
              </button>
            </div>
          )}
      </div>
    </div>
  );
}
