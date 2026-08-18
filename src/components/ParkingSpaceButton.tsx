import React from 'react';

// button component for single spots
// need to pass space object and toggle function as props

type SpaceProps = {
  space: {
    id: string;
    occupied: boolean;
    vehicle?: string;
  };
  onToggle: (id: string) => void;
};

export function ParkingSpaceButton(props: SpaceProps) {
  const space = props.space;
  const onToggle = props.onToggle;

  // setting up styles based on whether spot is full or free
  let statusText = "Available";
  let buttonClass = "parking-space available";

  if (space.occupied) {
    statusText = "Occupied";
    buttonClass = "parking-space occupied";
  }

  return (
    <button className={buttonClass} onClick={() => onToggle(space.id)}>
      <strong>{space.id}</strong>
      <span>{statusText}</span>
      {/* only render plate if car is parked */}
      {space.vehicle ? <small>{space.vehicle}</small> : null}
    </button>
  );
}