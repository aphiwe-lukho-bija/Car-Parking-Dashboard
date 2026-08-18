import React from 'react';

// extracted stat box so I dont keep repeating card divs in App.tsx

type StatCardProps = {
  label: string;
  value: any;
};

export function StatCard(props: StatCardProps) {
  return (
    <div className="stat-card">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}