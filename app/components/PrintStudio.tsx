"use client";
import { useState } from 'react';
import { BeeMascot } from './PrintBeeExperience';
import { OrderScene } from './ActiveOrderWidget';
const stages = [
  { label:'Upload', status:'CONFIRMED', text:'Choose your documents, then select how you want them printed.' },
  { label:'Print', status:'PRINTING', text:'Your chosen black-and-white or colour prints come to life.' },
  { label:'Prepare', status:'READY_FOR_PICKUP', text:'Your prints are prepared for collection by a delivery partner.' },
  { label:'Deliver', status:'RIDER_ASSIGNED', text:'Meet your partner. Share your delivery OTP only after receiving your prints.' },
];
export default function PrintStudio({ close }: { close: () => void }) {
  const [stage, setStage] = useState(0);
  return <div className="modal-backdrop" onMouseDown={close}><section className="studio-modal" role="dialog" aria-modal="true" aria-labelledby="studio-title" onMouseDown={event => event.stopPropagation()}><button className="close" aria-label="Close studio" onClick={close}>×</button><small>HOW PRINTBEE WORKS</small><h2 id="studio-title">Your notes. A little journey.</h2><div className="studio-stage"><BeeMascot /><OrderScene key={stage} status={stages[stage].status} /></div><div className="studio-controls" aria-label="Explore the printing journey">{stages.map((item,index) => <button key={item.label} aria-pressed={stage === index} onClick={() => setStage(index)}>{item.label}</button>)}</div><p className="studio-description" aria-live="polite">{stages[stage].text}</p><button className="primary-cta" onClick={close}>Back to PrintBee</button></section></div>;
}
