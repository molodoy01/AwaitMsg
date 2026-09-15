import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { RichTextEntity } from '@/types';
import { editorHtmlToRichText, richTextToHtml } from '@/lib/richText';

interface Props {
  text: string;
  entities: RichTextEntity[];
  onChange: (text: string, entities: RichTextEntity[]) => void;
  stageContent?: ReactNode;
  stageMode?: 'editor' | 'schedule' | 'template';
}

type FormatCommand = 'bold' | 'italic' | 'underline' | 'strikeThrough';

export function RichTextEditor({ text, entities, onChange, stageContent, stageMode = 'editor' }: Props) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [toolbarActive, setToolbarActive] = useState(false);
  const [linkUrl, setLinkUrl] = useState('https://');

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor) return;
    const nextHtml = richTextToHtml(text, entities);
    if (editor.innerHTML !== nextHtml) editor.innerHTML = nextHtml;
  }, [text, entities]);

  const emitChange = () => {
    if (!editorRef.current) return;
    const value = editorHtmlToRichText(editorRef.current);
    onChange(value.text, value.entities);
  };

  const saveSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !editorRef.current?.contains(selection.anchorNode)) return;
    savedRangeRef.current = selection.getRangeAt(0).cloneRange();
  };

  const restoreSelection = () => {
    const selection = window.getSelection();
    const range = savedRangeRef.current;
    if (!selection || !range || !editorRef.current) return;
    editorRef.current.focus();
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const runCommand = (command: FormatCommand) => {
    restoreSelection();
    document.execCommand(command);
    emitChange();
  };

  const applyLink = () => {
    const url = linkUrl.trim();
    if (!/^https?:\/\//i.test(url) && !/^tg:/i.test(url)) return;
    restoreSelection();
    document.execCommand('createLink', false, url);
    setLinkOpen(false);
    emitChange();
  };

  return (
    <div
      className={`workspace-page-rich-text-editor ${stageMode === 'editor' && toolbarActive ? 'is-toolbar-active' : ''}`}
      onFocus={() => setToolbarActive(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setToolbarActive(false);
        }
      }}
    >
      <div className="workspace-page-rich-text-stage">
        <div
          ref={editorRef}
          className={`workspace-page-textarea workspace-page-rich-text-input workspace-page-rich-text-stage-view ${stageMode === 'editor' ? 'is-active' : ''}`}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label="Post content"
          data-placeholder="Start writing your post..."
          spellCheck
          aria-hidden={stageMode !== 'editor'}
          onInput={emitChange}
          onMouseUp={saveSelection}
          onKeyUp={saveSelection}
          onSelect={saveSelection}
          onBlur={saveSelection}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
              event.preventDefault();
              saveSelection();
              setLinkOpen(true);
            }
          }}
        />
        <div className="workspace-page-rich-text-stage-content">
          {stageContent}
        </div>
      </div>
      <div className="workspace-page-rich-text-toolbar" aria-label="Text formatting">
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand('bold')} aria-label="Bold" title="Bold">B</button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand('italic')} aria-label="Italic" title="Italic"><em>I</em></button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand('underline')} aria-label="Underline" title="Underline"><u>U</u></button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand('strikeThrough')} aria-label="Strikethrough" title="Strikethrough"><s>S</s></button>
        <button
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            saveSelection();
          }}
          onClick={() => setLinkOpen((value) => !value)}
          aria-label="Add link"
          title="Add link"
        >
          ↗
        </button>
      </div>
      {linkOpen && (
        <div className="workspace-page-rich-text-link-popover">
          <input
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            aria-label="Link URL"
            placeholder="https://example.com"
            autoFocus
          />
          <button type="button" onClick={applyLink}>Apply</button>
          <button type="button" onClick={() => setLinkOpen(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}