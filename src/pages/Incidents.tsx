import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';
import { IncidentDetailData } from '../utils/incidentUtils';
import IncidentList from '../components/incidents/IncidentList';
import IncidentFilters from '../components/incidents/IncidentFilters';
import '../styles/incident-list.css';

const Incidents: React.FC = () => {
  const [incidents, setIncidents] = useState<IncidentDetailData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    status: '',
    severity: '',
    type: '',
    search: ''
  });

  useEffect(() => {
    const fetchIncidents = async () => {
      try {
        const q = query(collection(db, 'reports'), orderBy('timestamp', 'desc'));
        const querySnapshot = await getDocs(q);
        const incidentsData = querySnapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id
        })) as IncidentDetailData[];
        
        setIncidents(incidentsData);
      } catch (err) {
        setError('Error fetching incidents');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchIncidents();
  }, []);

  const handleFilterChange = (filterName: string, value: string) => {
    setFilters(prev => ({
      ...prev,
      [filterName]: value
    }));
  };

  const filteredIncidents = incidents.filter(incident => {
    const matchesStatus = !filters.status || incident.status === filters.status;
    const matchesSeverity = !filters.severity || incident.severity === filters.severity;
    const matchesType = !filters.type || incident.incidentType === filters.type;
    const matchesSearch = !filters.search || 
      incident.title.toLowerCase().includes(filters.search.toLowerCase()) ||
      incident.description.toLowerCase().includes(filters.search.toLowerCase()) ||
      incident.locationInfo?.toLowerCase().includes(filters.search.toLowerCase()) ||
      incident.location?.toLowerCase().includes(filters.search.toLowerCase());

    return matchesStatus && matchesSeverity && matchesType && matchesSearch;
  });

  return (
    <div className="incidents-page">
      <IncidentFilters
        filters={filters}
        onFilterChange={handleFilterChange}
      />
      
      <IncidentList
        incidents={filteredIncidents}
        loading={loading}
        error={error}
      />
    </div>
  );
};

export default Incidents; 