import React, { useEffect, useState } from 'react';

export default function SubmissionsView({ backendUrl }){
  const [items, setItems] = useState([]);
  useEffect(()=>{ fetch(`${backendUrl}/api/submissions`).then(r=>r.json()).then(j=> setItems(j.results || [])); }, []);
  return (
    <div className="p-4 bg-white rounded-2xl shadow">
      <h3 className="font-semibold mb-2">Recent Submissions</h3>
      <ul className="text-sm text-slate-700 space-y-2 max-h-96 overflow-auto">
        {items.map(it=>(
          <li key={it._id || it.id} className="border-b pb-2">
            <div className="flex justify-between">
              <div>
                <div className="font-medium">{it.email || 'anon'}</div>
                <div className="text-xs text-slate-500">{it.test} • {new Date(it.createdAt || it.created_at).toLocaleString()}</div>
              </div>
              <div className="text-xs text-right">
                <div>{it.server_notes || it.server_verification?.reasons?.join(', ') || '-'}</div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
