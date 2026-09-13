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
import Assessment from './pages/Assessment';
import PsychologistDashboard from './pages/PsychologistDashboard';
import PsychologistRequests from './pages/PsychologistRequests';
import PsychologistChats from './pages/PsychologistChats';
import PsychologistClients from './pages/PsychologistClients';
import PsychologistGroupSessions from './pages/PsychologistGroupSessions';
import PsychologistNotes from './pages/PsychologistNotes';
import PsychologistSchedule from './pages/PsychologistSchedule';
import PsychologistReports from './pages/PsychologistReports';
import PsychologistProfile from './pages/PsychologistProfile';
import AdminDashboard from './pages/AdminDashboard';
import AnonymousChat from './pages/AnonymousChat';
import PaymentResult from './pages/PaymentResult';

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
      <Route path="/assessment" element={<Assessment />} />
      <Route path="/psychologist/dashboard" element={<PsychologistDashboard />} />
      <Route path="/psychologist/requests" element={<PsychologistRequests />} />
      <Route path="/psychologist/chats" element={<PsychologistChats />} />
      <Route path="/psychologist/clients" element={<PsychologistClients />} />
      <Route path="/psychologist/group-sessions" element={<PsychologistGroupSessions />} />
      <Route path="/psychologist/notes" element={<PsychologistNotes />} />
      <Route path="/psychologist/schedule" element={<PsychologistSchedule />} />
      <Route path="/psychologist/reports" element={<PsychologistReports />} />
      <Route path="/psychologist/profile" element={<PsychologistProfile />} />
      <Route path="/admin/dashboard" element={<AdminDashboard />} />
      <Route path="/anonymous-chat" element={<AnonymousChat />} />
      <Route path="/payment/result" element={<PaymentResult />} />
    </Routes>
  );
}

export default App;
