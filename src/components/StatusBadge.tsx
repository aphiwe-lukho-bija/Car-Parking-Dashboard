import React from 'react';

// top right green dot badge
// default to online so I don't have to keep setting it manually

type BadgeProps = {
  statusText?: string;
  isOnline?: boolean;
};

export function StatusBadge(props: BadgeProps) {
  const text = props.statusText ? props.statusText : "System Online";
  const online = props.isOnline !== undefined ? props.isOnline : true;

  return (
    <div className="status">
      <span className={online ? "status-dot online" : "status-dot offline"}></span>
      {text}
    </div>
  );
}