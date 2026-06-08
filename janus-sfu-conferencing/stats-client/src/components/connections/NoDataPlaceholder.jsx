export default function NoDataPlaceholder({ message = 'No data yet' }) {
  return <p className="no-data-placeholder">{message}</p>;
}
