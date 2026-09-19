import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { WorkspaceTextStage } from './WorkspaceTextStage';

function renderScheduleStage() {
  function Harness() {
    const [date, setDate] = useState('2026-09-19');
    const [time, setTime] = useState('01:47');
    const [repeatMode, setRepeatMode] = useState<'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly'>('none');
    const [repeatDays, setRepeatDays] = useState<string[]>([]);
    const [repeatOccurrences, setRepeatOccurrences] = useState(5);

    return (
      <WorkspaceTextStage
        mode="schedule"
        onModeChange={vi.fn()}
        selectedChat={null}
        chats={[]}
        selectedChats={[]}
        onChatSelectionChange={vi.fn()}
        onChatSelectionDone={vi.fn()}
        onChatSelectionBack={vi.fn()}
        onAddChat={vi.fn()}
        onRemoveChat={vi.fn()}
        draftBody="Message"
        draftEntities={[]}
        date={date}
        time={time}
        setDate={setDate}
        setTime={setTime}
        scheduling={false}
        canSchedule={false}
        onSchedule={vi.fn()}
        repeatMode={repeatMode}
        setRepeatMode={setRepeatMode}
        repeatDays={repeatDays}
        setRepeatDays={setRepeatDays}
        repeatOccurrences={repeatOccurrences}
        setRepeatOccurrences={setRepeatOccurrences}
        templates={[]}
        onInsertTemplate={vi.fn()}
        templateEditingId={null}
        templateDraftName=""
        setTemplateDraftName={vi.fn()}
        templateDraftBody=""
        setTemplateDraftBody={vi.fn()}
        openTemplateEditor={vi.fn()}
        onDeleteTemplate={vi.fn()}
        closeTemplateEditor={vi.fn()}
        saveTemplateStage={vi.fn()}
        inlineButtons={[]}
        setInlineButtons={vi.fn()}
      />
    );
  }

  render(<Harness />);
}

describe('WorkspaceTextStage schedule controls', () => {
  it('opens date and time controls', () => {
    renderScheduleStage();

    expect(screen.getByLabelText('Day')).toHaveValue('19');
    expect(screen.getByLabelText('Month')).toHaveValue('09');
    expect(screen.getByLabelText('Year')).toHaveValue('2026');

    fireEvent.click(screen.getByRole('button', { name: 'Open calendar' }));
    expect(screen.getByLabelText('Day')).toBeInTheDocument();

    fireEvent.click(screen.getByText('01:47', { selector: 'button' }));
    expect(document.querySelector('.workspace-page-schedule-time-menu')).toBeInTheDocument();
  });

  it('updates the repeat selection and keeps Summary current', () => {
    renderScheduleStage();

    fireEvent.click(screen.getByRole('button', { name: /More options/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Repeat/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Every 2 weeks' }));

    expect(screen.getByText(/Every 2 weeks .* 5 runs at 01:47/)).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Tue' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tue' }));
    expect(screen.getByText(/Every 2 weeks .* 5 runs at 01:47/)).toBeInTheDocument();

    const runs = screen.getByLabelText('Runs');
    fireEvent.change(runs, { target: { value: '10' } });
    expect(screen.getByText(/Every 2 weeks .* 10 runs at 01:47/)).toBeInTheDocument();
  });
});
