import React from 'react';
import Dashboard from './components/Dashboard';

function App(){
  return (
    <div className="app-shell">
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold">AI</div>
          <div>
            <h1 className="text-2xl font-semibold">SIH Sports Assessment</h1>
            <p className="text-sm text-slate-500">Democratizing talent assessment with on-device AI</p>
          </div>
        </div>
      </header>

      <main>
        <Dashboard backendUrl={process.env.REACT_APP_BACKEND || 'http://localhost:5000'} />
      </main>
    </div>
  );
}

export default App;
