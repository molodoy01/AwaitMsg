interface Props {
  show: boolean;
  chatName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ChatRemoveModal({
  show,
  chatName,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div className={`chat-remove-modal ${show ? 'show' : ''}`}>
      <div className="chat-remove-title">Remove chat?</div>

      <div className="chat-remove-message">
        "{chatName}" will be removed from your saved chats. Scheduled and sent messages will remain in history.
      </div>

      <div className="chat-remove-actions">
        <button
          className="chat-remove-cancel"
          onClick={onCancel}
        >
          Cancel
        </button>

        <button
          className="chat-remove-confirm"
          onClick={onConfirm}
        >
          Remove
        </button>
      </div>
    </div>
  );
}