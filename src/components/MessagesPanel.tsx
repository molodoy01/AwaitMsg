import { useLayoutEffect, useState } from 'react';
import type { ScheduledMessage } from '@/types';
import { MessageCard } from './MessageCard';

interface Props {
  upcoming: ScheduledMessage[];
  sent: ScheduledMessage[];
  revealingId: string | null;
  activeTab: 'upcoming' | 'sent';
  onTabChange: (tab: 'upcoming' | 'sent') => void;
  onCancel: (msg: ScheduledMessage) => void;
  onSendNow: (msg: ScheduledMessage) => void;
  onDelete: (msg: ScheduledMessage) => void;
  onClearSent: () => void;
  onClearAll: () => void;
  cancelingIds: Set<string>;
  sendingIds: Set<string>;
}

export function MessagesPanel({
  upcoming,
  sent,
  revealingId,
  activeTab,
  onTabChange,
  onCancel,
  onSendNow,
  onDelete,
  onClearSent,
  onClearAll,
  cancelingIds,
  sendingIds,
}: Props) {
  const [showOlderUpcoming, setShowOlderUpcoming] = useState(false);
  const [showOlderSent, setShowOlderSent] = useState(false);

  const upcomingSorted = [...upcoming].sort(
    (a, b) =>
      new Date(b.createdAt || b.when).getTime() -
      new Date(a.createdAt || a.when).getTime()
  );

  const recentUpcoming = upcomingSorted.slice(0, 3);
  const olderUpcoming = upcomingSorted.slice(3);

  const sentSorted = [...sent].sort(
    (a, b) =>
      new Date(b.sentAt || b.when).getTime() -
      new Date(a.sentAt || a.when).getTime()
  );

  const recentSent = sentSorted.slice(0, 3);
  const olderSent = sentSorted.slice(3);

  useLayoutEffect(() => {
    const groups = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.message-timeline-group-recent, .message-timeline-group-older'
      )
    );

    const updateTimelineLines = () => {
      groups.forEach((group) => {
        const dots = Array.from(
          group.querySelectorAll<HTMLElement>('.message-rail-dot')
        );

        if (dots.length < 2) return;

        const groupRect = group.getBoundingClientRect();
        const firstDot = dots[0].getBoundingClientRect();
        const lastDot = dots[dots.length - 1].getBoundingClientRect();
        const firstCenter = firstDot.top + firstDot.height / 2;
        const lastCenter = lastDot.top + lastDot.height / 2;

        group.style.setProperty(
          '--timeline-left',
          `${firstDot.left + firstDot.width / 2 - groupRect.left}px`
        );
        group.style.setProperty('--timeline-top', `${firstCenter - groupRect.top}px`);
        group.style.setProperty('--timeline-height', `${lastCenter - firstCenter}px`);
      });
    };

    updateTimelineLines();
    const observer = new ResizeObserver(updateTimelineLines);
    groups.forEach((group) => observer.observe(group));

    return () => observer.disconnect();
  }, [
    recentUpcoming.length,
    recentSent.length,
    olderUpcoming.length,
    olderSent.length,
    showOlderUpcoming,
    showOlderSent,
    activeTab,
  ]);

  return (
    <div className="messages-panel">
      <div className="tabs">
        <button
          className={`tab ${
            activeTab === 'upcoming' ? 'active' : ''
          }`}
          onClick={() => onTabChange('upcoming')}
        >
          Upcoming
          <span className="tab-count">
            {upcoming.length}
          </span>
        </button>

        <button
          className={`tab ${
            activeTab === 'sent' ? 'active' : ''
          }`}
          onClick={() => onTabChange('sent')}
        >
          History
          <span className="tab-count">
            {sent.length}
          </span>
        </button>
      </div>

      <div className="tab-actions">
        {activeTab === 'sent' && sent.length > 0 && (
          <button
            className="clear-history"
            onClick={onClearSent}
            title="Clear message history"
          >
            Clear history
          </button>
        )}

        {activeTab === 'upcoming' &&
          upcoming.length > 0 && (
            <button
              className="clear-history"
              onClick={onClearAll}
              title="Clear all upcoming messages"
            >
              Clear all
            </button>
          )}
      </div>

      <div
        className={`tab-content ${
          activeTab === 'upcoming' ? '' : 'hidden'
        }`}
      >
        {upcomingSorted.length === 0 ? (
          <div className="empty-state">
            Nothing waiting. Your next moment will appear here.
          </div>
        ) : (
          <div className="message-list">
            <div className="message-timeline-group message-timeline-group-recent">
              {recentUpcoming.map((msg, i) => (
                <MessageCard
                  key={msg.id}
                  message={msg}
                  isLast={i === recentUpcoming.length - 1}
                  isRevealing={revealingId === msg.id}
                  onCancel={onCancel}
                  onSendNow={onSendNow}
                  onDelete={onDelete}
                  showCancel={(msg.status === 'scheduled' || msg.status === 'confirmed') && !cancelingIds.has(msg.id)}
                  showSendNow={(msg.status === 'scheduled' || msg.status === 'confirmed') && !sendingIds.has(msg.id)}
                  showDelete={true}
                  railColor="#9aa8b8"
                  isCanceling={cancelingIds.has(msg.id)}
                  isSending={sendingIds.has(msg.id)}
                />
              ))}
            </div>

            {olderUpcoming.length > 0 && (
              <div className="upcoming-older-toggle-wrap">
                <button
                  type="button"
                  className="upcoming-older-toggle"
                  onClick={() => setShowOlderUpcoming((value) => !value)}
                >
                  {showOlderUpcoming ? 'Show less ↑' : 'Show more ↓'}
                </button>
              </div>
            )}

            {showOlderUpcoming && (
              <div className="message-timeline-group message-timeline-group-older">
                {olderUpcoming.map((msg, i) => (
                  <MessageCard
                    key={msg.id}
                    message={msg}
                    isLast={i === olderUpcoming.length - 1}
                    isRevealing={revealingId === msg.id}
                    onCancel={onCancel}
                    onSendNow={onSendNow}
                    onDelete={onDelete}
                    showCancel={(msg.status === 'scheduled' || msg.status === 'confirmed') && !cancelingIds.has(msg.id)}
                    showSendNow={(msg.status === 'scheduled' || msg.status === 'confirmed') && !sendingIds.has(msg.id)}
                    showDelete={true}
                    railColor="#9aa8b8"
                    isCanceling={cancelingIds.has(msg.id)}
                    isSending={sendingIds.has(msg.id)}
                    showCreatedMeta={true}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div
        className={`tab-content ${
          activeTab === 'sent' ? '' : 'hidden'
        }`}
      >
        {sentSorted.length === 0 ? (
          <div className="empty-state">
            Your sent messages will live here.
          </div>
        ) : (
          <div className="message-list">
            <div className="message-timeline-group message-timeline-group-recent">
              {recentSent.map((msg, i) => (
                <MessageCard
                  key={msg.id}
                  message={msg}
                  isLast={i === recentSent.length - 1}
                  onCancel={onCancel}
                  onSendNow={onSendNow}
                  onDelete={onDelete}
                  showCancel={false}
                  showSendNow={false}
                  showDelete={true}
                  railColor="#6f9b7c"
                  isRevealing={revealingId === msg.id}
                />
              ))}
            </div>

            {olderSent.length > 0 && (
              <div className="upcoming-older-toggle-wrap">
                <button
                  type="button"
                  className="upcoming-older-toggle"
                  onClick={() => setShowOlderSent((value) => !value)}
                >
                  {showOlderSent ? 'Show less ↑' : 'Show more ↓'}
                </button>
              </div>
            )}

            {showOlderSent && (
              <div className="message-timeline-group message-timeline-group-older">
                {olderSent.map((msg, i) => (
                  <MessageCard
                    key={msg.id}
                    message={msg}
                    isLast={i === olderSent.length - 1}
                    onCancel={onCancel}
                    onSendNow={onSendNow}
                    onDelete={onDelete}
                    showCancel={false}
                    showSendNow={false}
                    showDelete={true}
                    railColor="#6f9b7c"
                    isRevealing={revealingId === msg.id}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}