import type { ScheduledMessage } from '@/types';
import { formatDateTime } from '@/lib/utils';

interface Props {
  message: ScheduledMessage;
  isLast: boolean;
  onCancel: (msg: ScheduledMessage) => void;
  onSendNow: (msg: ScheduledMessage) => void;
  onDelete: (msg: ScheduledMessage) => void;
  showDelete: boolean;
  showCancel: boolean;
  showSendNow: boolean;
  railColor?: string;
  isCanceling?: boolean;
  isSending?: boolean;
  isRevealing?: boolean;
  showCreatedMeta?: boolean;
}

export function MessageCard({
  message,
  onSendNow,
  onDelete,
  showDelete,
  showSendNow,
  railColor,
  isCanceling,
  isSending,
  isRevealing,
  showCreatedMeta,
}: Props) {
  const createdLabel = new Date(message.createdAt).toLocaleString([], {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  return (
    <div
      className={`message-row ${
        isRevealing ? 'is-revealing' : ''
      } ${message.status} ${showCreatedMeta ? 'archive-row' : ''}`}
    >
      <div className="message-rail" aria-hidden="true">
        <div
          className="message-rail-dot"
          style={
            railColor
              ? { borderColor: railColor }
              : undefined
          }
        />

        <div className="message-rail-line" />

        <div className="message-rail-end">
          <svg
            className="message-rail-check"
            viewBox="0 0 12 12"
            width="12"
            height="12"
            fill="none"
          >
            <path
              d="M2.2 6.2L4.9 8.8L9.8 3.2"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      <div className="message-body">
        <div className="message-chat">
          {message.chatName}
        </div>

        {showCreatedMeta && (
          <div className="message-created-meta">
            <span className="message-created-rail" />
            <span>{createdLabel}</span>
          </div>
        )}

        <div className="message-meta">
          {formatDateTime(message.when)}
        </div>

        <div className="message-preview">
          {message.text}
        </div>

        <div
          className={`message-status ${message.status}`}
        >
          {isCanceling
            ? 'Unscheduling…'
            : isSending
              ? 'Sending…'
              : message.status === 'sent'
                ? 'Sent'
                : message.status === 'confirmed'
                  ? 'Confirmed'
                  : 'Scheduled'}
        </div>
      </div>

      <div className="message-actions">
        {showSendNow && (
          <button
            className="msg-btn send-now"
            onClick={() => onSendNow(message)}
            title="Send this message immediately"
          >
            Send now
          </button>
        )}

        {showDelete && (
          <button
            className="msg-btn delete"
            onClick={() => onDelete(message)}
            title="Remove this message from the list"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
