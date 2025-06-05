import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import MunicipalStaffLogin from './pages/MunicipalStaffLogin';
import Dashboard from './pages/Dashboard';
import ProtectedRoute from './components/ProtectedRoute';
import Incidents from './pages/Incidents';
import IncidentDetail from './pages/IncidentDetail';
import IncidentChat from './pages/IncidentChat';
import Notifications from './pages/Notifications';
import NavBar from './components/NavBar';
import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { db, auth } from './config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import SLA from './pages/SLA';

function AppRoutes() {
  const [notificationCount, setNotificationCount] = useState<number>(0);
  const [municipal, setMunicipal] = useState<string>('');
  const location = useLocation();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        setMunicipal('');
        setNotificationCount(0);
        return;
      }
      const fetchUserMunicipal = async () => {
        const q = query(collection(db, 'users'), where('email', '==', currentUser.email));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          const userDoc = querySnapshot.docs[0].data();
          setMunicipal(userDoc.municipal);
        }
      };
      fetchUserMunicipal();
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!municipal) {
      setNotificationCount(0);
      return;
    }
    const q = query(collection(db, 'reports'), where('reportState', '==', 'New'), where('municipal', '==', municipal));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      setNotificationCount(querySnapshot.size);
    });
    return () => unsubscribe();
  }, [municipal]);

  return (
    <>
      {location.pathname !== '/' && <NavBar notificationCount={notificationCount} />}
      <Routes>
        <Route path="/" element={<MunicipalStaffLogin />} />
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/incidents" element={
          <ProtectedRoute>
            <Incidents />
          </ProtectedRoute>
        } />
        <Route path="/incidents/:id" element={
          <ProtectedRoute>
            <IncidentDetail />
          </ProtectedRoute>
        } />
        <Route path="/incidents/:id/chat" element={
          <ProtectedRoute>
            <IncidentChat />
          </ProtectedRoute>
        } />
        <Route path="/notifications" element={
          <ProtectedRoute>
            <Notifications />
          </ProtectedRoute>
        } />
        <Route path="/sla" element={
          <ProtectedRoute>
            <SLA />
          </ProtectedRoute>
        } />
      </Routes>
    </>
  );
}

function App() {
  return (
    <Router>
      <AppRoutes />
    </Router>
  );
}

export default App;
