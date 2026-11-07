import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Dashboard from './pages/Dashboard';
import CreateAgreement from './pages/CreateAgreement';
import AgreementDetail from './pages/AgreementDetail';
import SigningPage from './pages/SigningPage';
import SuccessPage from './pages/SuccessPage';
import CreateReferral from './pages/referral/CreateReferral';
import ReferralDetail from './pages/referral/ReferralDetail';
import ReferralSigningPage from './pages/referral/ReferralSigningPage';
import ReferralSuccessPage from './pages/referral/ReferralSuccessPage';
import CreateCobroker from './pages/cobroker/CreateCobroker';
import CobrokerDetail from './pages/cobroker/CobrokerDetail';
import CobrokerSigningPage from './pages/cobroker/CobrokerSigningPage';
import CobrokerSuccessPage from './pages/cobroker/CobrokerSuccessPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/create" element={<CreateAgreement />} />
          <Route path="/agreement/:id" element={<AgreementDetail />} />
          <Route path="/sign/:token" element={<SigningPage />} />
          <Route path="/success/:token" element={<SuccessPage />} />
          <Route path="/referrals" element={<Navigate to="/?jenis=referal" replace />} />
          <Route path="/referrals/create" element={<CreateReferral />} />
          <Route path="/referrals/sign/:token" element={<ReferralSigningPage />} />
          <Route path="/referrals/success/:token" element={<ReferralSuccessPage />} />
          <Route path="/referrals/:id" element={<ReferralDetail />} />
          <Route path="/cobrokers" element={<Navigate to="/?jenis=cobroker" replace />} />
          <Route path="/cobrokers/create" element={<CreateCobroker />} />
          <Route path="/cobrokers/sign/:token" element={<CobrokerSigningPage />} />
          <Route path="/cobrokers/success/:token" element={<CobrokerSuccessPage />} />
          <Route path="/cobrokers/:id/edit" element={<CreateCobroker />} />
          <Route path="/cobrokers/:id" element={<CobrokerDetail />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
