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
}

export function MessageCard({
  message,
  isLast,
  onCancel,
  onSendNow,
  onDelete,
  showDelete,
  showCancel,
  showSendNow,
  railColor,
  isCanceling,
  isSending,
  isRevealing,
}: Props) {
  return (
    <div
      className={`message-row ${
        isRevealing ? 'is-revealing' : ''
      } ${message.status}`}
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
            ? 'Cancelling…'
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
        {showCancel && (
          <button
            className="msg-btn"
            onClick={() => onCancel(message)}
          >
            Cancel
          </button>
        )}

        {showSendNow && (
          <button
            className="msg-btn send-now"
            onClick={() => onSendNow(message)}
          >
            Send now
          </button>
        )}

        {showDelete && (
          <button
            className="msg-btn delete"
            onClick={() => onDelete(message)}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
