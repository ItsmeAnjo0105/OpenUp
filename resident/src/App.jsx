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
import PsychologistClientDetail from './pages/PsychologistClientDetail';
import PsychologistGroupSessions from './pages/PsychologistGroupSessions';
import PsychologistNotes from './pages/PsychologistNotes';
import PsychologistSchedule from './pages/PsychologistSchedule';
import PsychologistReports from './pages/PsychologistReports';
import PsychologistProfile from './pages/PsychologistProfile';
import AdminHome from './pages/AdminHome';
import AdminLguAccounts from './pages/AdminLguAccounts';
import AdminSubscriptions from './pages/AdminSubscriptions';
import AdminResidents from './pages/AdminResidents';
import AdminPsychologists from './pages/AdminPsychologists';
import AdminVerification from './pages/AdminVerification';
import AdminAppointments from './pages/AdminAppointments';
import AdminCommunity from './pages/AdminCommunity';
import AdminResources from './pages/AdminResources';
import AdminAIManagement from './pages/AdminAIManagement';
import AdminReports from './pages/AdminReports';
import AdminAnnouncements from './pages/AdminAnnouncements';
import AdminSettings from './pages/AdminSettings';
import AdminProfile from './pages/AdminProfile';
import LguDashboard from './pages/LguDashboard';
import LguResidents from './pages/LguResidents';
import LguHeatmap from './pages/LguHeatmap';
import LguRiskAlerts from './pages/LguRiskAlerts';
import LguReport from './pages/LguReport';
import LguCareCredits from './pages/LguCareCredits';
import LguFunding from './pages/LguFunding';
import LguAiEffectiveness from './pages/LguAiEffectiveness';
import LguResourceAllocation from './pages/LguResourceAllocation';
import LguWellnessIndex from './pages/LguWellnessIndex';
import LguDataGovernance from './pages/LguDataGovernance';
import LguPsychologistDirectory from './pages/LguPsychologistDirectory';
import LguProfile from './pages/LguProfile';
import AnonymousChat from './pages/AnonymousChat';
import PaymentResult from './pages/PaymentResult';
import Profile from './pages/Profile';
import Resources from './pages/Resources';
import Community from './pages/Community';
import Notifications from './pages/Notifications';

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
      <Route path="/psychologist/clients/:residentId" element={<PsychologistClientDetail />} />
      <Route path="/psychologist/group-sessions" element={<PsychologistGroupSessions />} />
      <Route path="/psychologist/notes" element={<PsychologistNotes />} />
      <Route path="/psychologist/schedule" element={<PsychologistSchedule />} />
      <Route path="/psychologist/reports" element={<PsychologistReports />} />
      <Route path="/psychologist/profile" element={<PsychologistProfile />} />
      <Route path="/admin/dashboard" element={<AdminHome />} />
      <Route path="/admin/lgu-accounts" element={<AdminLguAccounts />} />
      <Route path="/admin/subscriptions" element={<AdminSubscriptions />} />
      <Route path="/admin/residents" element={<AdminResidents />} />
      <Route path="/admin/psychologists" element={<AdminPsychologists />} />
      <Route path="/admin/verification" element={<AdminVerification />} />
      <Route path="/admin/appointments" element={<AdminAppointments />} />
      <Route path="/admin/community" element={<AdminCommunity />} />
      <Route path="/admin/resources" element={<AdminResources />} />
      <Route path="/admin/ai-management" element={<AdminAIManagement />} />
      <Route path="/admin/reports" element={<AdminReports />} />
      <Route path="/admin/announcements" element={<AdminAnnouncements />} />
      <Route path="/admin/settings" element={<AdminSettings />} />
      <Route path="/admin/profile" element={<AdminProfile />} />
      <Route path="/lgu/dashboard" element={<LguDashboard />} />
      <Route path="/lgu/heatmap" element={<LguHeatmap />} />
      <Route path="/lgu/risk-alerts" element={<LguRiskAlerts />} />
      <Route path="/lgu/residents" element={<LguResidents />} />
      <Route path="/lgu/report" element={<LguReport />} />
      <Route path="/lgu/care-credits" element={<LguCareCredits />} />
      <Route path="/lgu/funding" element={<LguFunding />} />
      <Route path="/lgu/ai-effectiveness" element={<LguAiEffectiveness />} />
      <Route path="/lgu/resource-allocation" element={<LguResourceAllocation />} />
      <Route path="/lgu/wellness-index" element={<LguWellnessIndex />} />
      <Route path="/lgu/data-governance" element={<LguDataGovernance />} />
      <Route path="/lgu/psychologists" element={<LguPsychologistDirectory />} />
      <Route path="/lgu/profile" element={<LguProfile />} />
      <Route path="/anonymous-chat" element={<AnonymousChat />} />
      <Route path="/payment/result" element={<PaymentResult />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/resources" element={<Resources />} />
      <Route path="/community" element={<Community />} />
      <Route path="/notifications" element={<Notifications />} />
    </Routes>
  );
}

export default App;
