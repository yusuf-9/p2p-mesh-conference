import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import RoomsPage from './pages/RoomsPage';
import UsersPage from './pages/UsersPage';
import UserStatsPage from './pages/UserStatsPage';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<RoomsPage />} />
        <Route path="/room/:roomId" element={<UsersPage />} />
        <Route path="/room/:roomId/user/:userId" element={<UserStatsPage />} />
      </Route>
    </Routes>
  );
}
