import React, { useState } from 'react';
import RecorderCard from './RecorderCard';
import SubmissionsView from './SubmissionsView';

export default function Dashboard({ backendUrl }){
  const tests = [
    { id:'vertical_jump', name:'Vertical Jump', emoji:'🏀', desc:'Estimate jump height' },
    { id:'situps', name:'Sit-ups', emoji:'💪', desc:'Count sit-ups' },
    { id:'shuttle_run', name:'Shuttle Run', emoji:'🏃', desc:'Time 20m shuttle run' }
  ];

  const [activeTest, setActiveTest] = useState(tests[0].id);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <section className="lg:col-span-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {tests.map(t => (
            <div key={t.id} className={`p-4 rounded-2xl bg-white shadow hover:scale-[1.01] transition`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl">{t.emoji} <strong className="ml-2">{t.name}</strong></div>
                  <p className="text-sm text-slate-500 mt-1">{t.desc}</p>
                </div>
                <div>
                  <button onClick={()=>setActiveTest(t.id)} className={`px-3 py-2 rounded-lg ${activeTest===t.id ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>
                    {activeTest===t.id ? 'Active' : 'Start'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <RecorderCard backendUrl={backendUrl} selectedTest={activeTest} />
      </section>

      <aside className="lg:col-span-1">
        <div className="p-4 bg-white rounded-2xl shadow mb-4">
          <h3 className="font-semibold mb-2">Quick Tips</h3>
          <ul className="text-sm text-slate-600 space-y-2">
            <li>Use a plain background for better pose detection.</li>
            <li>Keep the phone stable at chest height (use tripod if possible).</li>
            <li>Follow on-screen countdown before starting the test.</li>
          </ul>
        </div>

        <SubmissionsView backendUrl={backendUrl} />
      </aside>
    </div>
  );
}
