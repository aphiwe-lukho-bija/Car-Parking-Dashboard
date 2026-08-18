import React from 'react';

// pricing section component
// added default rates here just in case I forget to pass props later

type PricingCardProps = {
  title?: string;
  subtitle?: string;
  pricingDetails?: { label: string; rate: string }[];
};

export function PricingCard(props: PricingCardProps) {
  // fallback rate list
  const defaultRates = [
    { label: "Hourly Rate", rate: "R15" },
    { label: "Grace Period", rate: "10 min" },
    { label: "Daily Maximum", rate: "R100" }
  ];

  const title = props.title || "Parking Fee Calculator";
  const subtitle = props.subtitle || "Current standard parking rate";
  const details = props.pricingDetails || defaultRates;

  return (
    <section className="dashboard-section calculator-card">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>

      <div className="pricing-info">
        {details.map((item, i) => {
          return (
            <div key={i}>
              <span>{item.label}</span>
              <strong>{item.rate}</strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}