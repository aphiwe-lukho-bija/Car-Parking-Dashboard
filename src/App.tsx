import React, { useState } from "react";
import "./App.css";

type ParkingSpace = {
  id: string;
  occupied: boolean;
  vehicle?: string;
};

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
  { id: "C4", occupied: true, vehicle: "CA 333-444" },
];

function App() {
  const [spaces, setSpaces] = useState(initialSpaces);

  const totalSpaces = spaces.length;
  const occupiedSpaces = spaces.filter((space) => space.occupied).length;
  const availableSpaces = totalSpaces - occupiedSpaces;
  const occupancyRate = Math.round((occupiedSpaces / totalSpaces) * 100);

  const toggleSpace = (id: string) => {
    setSpaces((currentSpaces) =>
      currentSpaces.map((space) =>
        space.id === id
          ? {
              ...space,
              occupied: !space.occupied,
              vehicle: !space.occupied ? "NEW VEHICLE" : undefined,
            }
          : space
      )
    );
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>Parking Management System</h1>
          <p>Real-time parking facility overview</p>
        </div>

        <div className="status">
          <span className="status-dot"></span>
          System Online
        </div>
      </header>

      <main className="dashboard-content">
        <section className="stats-grid">
          <div className="stat-card">
            <span>Total Spaces</span>
            <strong>{totalSpaces}</strong>
          </div>

          <div className="stat-card">
            <span>Occupied</span>
            <strong>{occupiedSpaces}</strong>
          </div>

          <div className="stat-card">
            <span>Available</span>
            <strong>{availableSpaces}</strong>
          </div>

          <div className="stat-card">
            <span>Occupancy</span>
            <strong>{occupancyRate}%</strong>
          </div>
        </section>

        <section className="dashboard-section">
          <div className="section-header">
            <div>
              <h2>Parking Spaces</h2>
              <p>Click a space to simulate a vehicle entering or leaving.</p>
            </div>

            <div className="legend">
              <span>
                <i className="legend-box available"></i>
                Available
              </span>

              <span>
                <i className="legend-box occupied"></i>
                Occupied
              </span>
            </div>
          </div>

          <div className="parking-grid">
            {spaces.map((space) => (
              <button
                key={space.id}
                className={`parking-space ${
                  space.occupied ? "occupied" : "available"
                }`}
                onClick={() => toggleSpace(space.id)}
              >
                <strong>{space.id}</strong>

                <span>
                  {space.occupied ? "Occupied" : "Available"}
                </span>

                {space.vehicle && (
                  <small>{space.vehicle}</small>
                )}
              </button>
            ))}
          </div>
        </section>

        <section className="dashboard-section calculator-card">
          <div>
            <h2>Parking Fee Calculator</h2>
            <p>Current standard parking rate</p>
          </div>

          <div className="pricing-info">
            <div>
              <span>Hourly Rate</span>
              <strong>R15</strong>
            </div>

            <div>
              <span>Grace Period</span>
              <strong>10 min</strong>
            </div>

            <div>
              <span>Daily Maximum</span>
              <strong>R100</strong>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;