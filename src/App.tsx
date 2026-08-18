import React, { useState } from 'react';
import './App.css';

// imported components I split into components folder
import { ParkingSpaceButton } from './components/ParkingSpaceButton';
import { StatCard } from './components/StatCard';
import { PricingCard } from './components/PricingCard';
import { StatusBadge } from './components/StatusBadge';
import { Legend } from './components/Legend';

type ParkingSpace = {
  id: string;
  occupied: boolean;
  vehicle?: string;
};

// dummy data to test UI
const initialSpaces: ParkingSpace[] = [
  { id: "A1", occupied: true, vehicle: "CA 123-456" },
  { id: "A2", occupied: false },
  { id: "A3", occupied: true, vehicle: "CA 987-654" },
  { id: "A4", occupied: false },
  { id: "B1", occupied: false },
  { id: "B2", occupied: true, vehicle: "CA 456-789" },
  { id: "B3", occupied: false },
  { id: "B4", occupied: false },
  { id: "C1", occupied: true, vehicle: "CA 111-222" },
  { id: "C2", occupied: false },
  { id: "C3", occupied: false },
  { id: "C4", occupied: true, vehicle: "CA 333-444" }
];

function App() {
  const [spaces, setSpaces] = useState<ParkingSpace[]>(initialSpaces);

  // counting occupied spots with a loop for the top stats
  const totalSpaces = spaces.length;
  let occupiedCount = 0;

  for (let i = 0; i < spaces.length; i++) {
    if (spaces[i].occupied) {
      occupiedCount++;
    }
  }

  const availableSpaces = totalSpaces - occupiedCount;
  const occupancyRate = Math.round((occupiedCount / totalSpaces) * 100);

  // click spot to toggle between free / occupied
  function toggleSpace(id: string) {
    const updated = spaces.map((s) => {
      if (s.id === id) {
        return {
          ...s,
          occupied: !s.occupied,
          vehicle: !s.occupied ? "NEW VEHICLE" : undefined
        };
      }
      return s;
    });

    setSpaces(updated);
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>Parking Management System</h1>
          <p>Real-time parking facility overview</p>
        </div>
        <StatusBadge />
      </header>

      <main className="dashboard-content">
        <section className="stats-grid">
          <StatCard label="Total Spaces" value={totalSpaces} />
          <StatCard label="Occupied" value={occupiedCount} />
          <StatCard label="Available" value={availableSpaces} />
          <StatCard label="Occupancy" value={occupancyRate + "%"} />
        </section>

        <section className="dashboard-section">
          <div className="section-header">
            <div>
              <h2>Parking Spaces</h2>
              <p>Click a space to simulate a vehicle entering or leaving.</p>
            </div>
            <Legend />
          </div>

          <div className="parking-grid">
            {spaces.map((sp) => (
              <ParkingSpaceButton
                key={sp.id}
                space={sp}
                onToggle={toggleSpace}
              />
            ))}
          </div>
        </section>

        <PricingCard />
      </main>
    </div>
  );
}

export default App;