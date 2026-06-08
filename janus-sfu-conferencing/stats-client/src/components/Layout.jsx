import { Link, Outlet } from 'react-router-dom';

export default function Layout() {
  return (
    <div className="stats-container">
      <header className="app-header">
        <h1>Conference Stats Viewer</h1>
        <nav className="app-nav">
          <Link to="/">Rooms</Link>
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
