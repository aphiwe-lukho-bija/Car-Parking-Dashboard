import React from 'react';

// visual color key so people know what red/green boxes mean

export function Legend() {
  return (
    <div className="legend">
      <span>
        <i className="legend-box available"></i> Available
      </span>
      <span>
        <i className="legend-box occupied"></i> Occupied
      </span>
    </div>
  );
}