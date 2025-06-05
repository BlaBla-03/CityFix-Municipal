import React from 'react';

interface IncidentFiltersProps {
  filters: {
    status: string;
    severity: string;
    type: string;
    search: string;
  };
  onFilterChange: (filterName: string, value: string) => void;
}

const IncidentFilters: React.FC<IncidentFiltersProps> = ({ filters, onFilterChange }) => {
  return (
    <div className="incident-filters">
      <div className="search-box">
        <input
          type="text"
          placeholder="Search incidents..."
          value={filters.search}
          onChange={(e) => onFilterChange('search', e.target.value)}
        />
      </div>

      <div className="filter-group">
        <select
          value={filters.status}
          onChange={(e) => onFilterChange('status', e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="New">New</option>
          <option value="In Progress">In Progress</option>
          <option value="Completed">Completed</option>
          <option value="Flagged">Flagged</option>
          <option value="Merged">Merged</option>
          <option value="Overdue">Overdue</option>
        </select>

        <select
          value={filters.severity}
          onChange={(e) => onFilterChange('severity', e.target.value)}
        >
          <option value="">All Severities</option>
          <option value="Low">Low</option>
          <option value="Medium">Medium</option>
          <option value="High">High</option>
          <option value="Critical">Critical</option>
        </select>

        <select
          value={filters.type}
          onChange={(e) => onFilterChange('type', e.target.value)}
        >
          <option value="">All Types</option>
          <option value="Road Damage">Road Damage</option>
          <option value="Street Light">Street Light</option>
          <option value="Garbage">Garbage</option>
          <option value="Water Leak">Water Leak</option>
          <option value="Other">Other</option>
        </select>
      </div>
    </div>
  );
};

export default IncidentFilters; 