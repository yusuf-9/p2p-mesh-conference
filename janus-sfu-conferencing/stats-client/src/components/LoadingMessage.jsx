export default function LoadingMessage({ message = 'Loading...' }) {
  return <p className="status-message loading">{message}</p>;
}
