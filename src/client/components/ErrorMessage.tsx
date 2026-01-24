import '../styles/components.css';

interface ErrorMessageProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorMessage({ title = 'Error', message, onRetry }: ErrorMessageProps) {
  return (
    <div className="error-message">
      <div className="error-message__icon">⚠</div>
      <div className="error-message__content">
        <h3 className="error-message__title">{title}</h3>
        <p className="error-message__text">{message}</p>
        {onRetry && (
          <button className="error-message__retry" onClick={onRetry}>
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
