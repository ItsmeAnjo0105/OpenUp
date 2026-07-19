import { Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import VoiceJournal from './pages/VoiceJournal';
import BookCounseling from './pages/BookCounseling';
import Session from './pages/Session';
import CrisisCompanion from './pages/CrisisCompanion';
import MoodTracker from './pages/MoodTracker';
import GroupSessions from './pages/GroupSessions';
import GroupSession from './pages/GroupSession';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/voice-journal" element={<VoiceJournal />} />
      <Route path="/booking" element={<BookCounseling />} />
      <Route path="/session/:bookingId" element={<Session />} />
      <Route path="/crisis-companion" element={<CrisisCompanion />} />
      <Route path="/mood-tracker" element={<MoodTracker />} />
      <Route path="/group-counseling" element={<GroupSessions />} />
      <Route path="/group-session/:groupSessionId" element={<GroupSession />} />
    </Routes>
  );
}

export default App;
