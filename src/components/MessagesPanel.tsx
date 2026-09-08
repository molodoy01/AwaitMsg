import { useState } from 'react';
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
            {recentUpcoming.map((msg, i) => (
              <MessageCard
                key={msg.id}
                message={msg}
                isLast={
                  i === recentUpcoming.length - 1
                }
                isRevealing={revealingId === msg.id}
                onCancel={onCancel}
                onSendNow={onSendNow}
                onDelete={onDelete}
                showCancel={
                  (msg.status === 'scheduled' ||
                    msg.status === 'confirmed') &&
                  !cancelingIds.has(msg.id)
                }
                showSendNow={
                  (msg.status === 'scheduled' ||
                    msg.status === 'confirmed') &&
                  !sendingIds.has(msg.id)
                }
                showDelete={true}
                railColor="#9aa8b8"
                isCanceling={cancelingIds.has(msg.id)}
                isSending={sendingIds.has(msg.id)}
              />
            ))}

            {olderUpcoming.length > 0 && (
              <div className="upcoming-older-toggle-wrap">
                <button
                  type="button"
                  className="upcoming-older-toggle"
                  onClick={() => setShowOlderUpcoming((value) => !value)}
                >
                  {showOlderUpcoming ? 'Hide older moments' : 'Show older moments'}
                </button>
              </div>
            )}

            {showOlderUpcoming &&
              olderUpcoming.map((msg, i) => (
                <MessageCard
                  key={msg.id}
                  message={msg}
                  isLast={
                    i === olderUpcoming.length - 1
                  }
                  isRevealing={revealingId === msg.id}
                  onCancel={onCancel}
                  onSendNow={onSendNow}
                  onDelete={onDelete}
                  showCancel={
                    (msg.status === 'scheduled' ||
                      msg.status === 'confirmed') &&
                    !cancelingIds.has(msg.id)
                  }
                  showSendNow={
                    (msg.status === 'scheduled' ||
                      msg.status === 'confirmed') &&
                    !sendingIds.has(msg.id)
                  }
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
            {sentSorted.map((msg, i) => (
              <MessageCard
                key={msg.id}
                message={msg}
                isLast={
                  i === sentSorted.length - 1
                }
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
    </div>
  );
}