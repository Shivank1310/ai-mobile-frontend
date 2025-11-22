import React, { useRef, useState, useEffect } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as posedetection from '@tensorflow-models/pose-detection';
import { openDB } from 'idb';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer } from 'recharts';

export default function RecorderCard({ backendUrl, selectedTest }){
  const videoRef = useRef(null);
  const mediaRef = useRef(null);
  const [detector, setDetector] = useState(null);
  const [recording, setRecording] = useState(false);
  const [blobs, setBlobs] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [email, setEmail] = useState('');
  const [log, setLog] = useState('');
  const [queueCount, setQueueCount] = useState(0);

  useEffect(()=>{ initCamera(); loadModel(); initDB(); updateQueueCount(); }, []);

  function appendLog(s){ setLog(prev => prev + s + '\n'); console.log(s); }

  async function initDB(){
    const db = await openDB('sih-db', 1, {
      upgrade(db){
        if(!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
      }
    });
    return db;
  }

  async function updateQueueCount(){
    const db = await initDB();
    const tx = db.transaction('queue','readonly');
    const count = await tx.objectStore('queue').count();
    setQueueCount(count);
  }

  async function initCamera(){
    try{
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }catch(e){ appendLog('Camera error: '+e.message); }
  }

  async function loadModel(){
    appendLog('Loading MoveNet...');
    const model = posedetection.SupportedModels.MoveNet;
    const det = await posedetection.createDetector(model, { modelType: 'SinglePose.Lightning' });
    setDetector(det);
    appendLog('Model loaded.');
  }

  function startRecord(){
    const stream = videoRef.current.srcObject;
    const options = { mimeType: 'video/webm; codecs=vp9' };
    let mr;
    try { mr = new MediaRecorder(stream, options); } catch(e){ mr = new MediaRecorder(stream); }
    const chunks = [];
    mr.ondataavailable = (e)=> { if(e.data && e.data.size) chunks.push(e.data); };
    mr.onstop = ()=> { setBlobs(chunks); appendLog('Recording stopped'); };
    mr.start(100);
    mediaRef.current = mr;
    setRecording(true);
    appendLog('Recording started...');
  }

  function stopRecord(){
    const mr = mediaRef.current;
    if(mr && mr.state !== 'inactive') mr.stop();
    setRecording(false);
  }

  async function extractFrames(blob, sampleFps=8){
    return new Promise((resolve, reject)=>{
      const vid = document.createElement('video');
      vid.muted = true; vid.playsInline = true;
      vid.src = URL.createObjectURL(blob);
      vid.onloadedmetadata = ()=>{
        const duration = vid.duration;
        const count = Math.min(Math.ceil(duration * sampleFps), 120);
        const canvas = document.createElement('canvas');
        canvas.width = vid.videoWidth || 640; canvas.height = vid.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        const frames = [];
        let i=0;
        const capture = ()=>{
          if(i>=count){ URL.revokeObjectURL(vid.src); resolve(frames); return; }
          const t = (i / count) * duration;
          vid.currentTime = t;
        };
        vid.onseeked = ()=>{
          try{
            ctx.drawImage(vid,0,0,canvas.width,canvas.height);
            const img = new Image();
            img.src = canvas.toDataURL('image/jpeg');
            frames.push(img);
            i++; capture();
          }catch(e){ console.error(e); i++; if(i>=count) resolve(frames); else capture(); }
        };
        capture();
      };
      vid.onerror = (e)=> reject(e);
    });
  }

  function findKey(keys, name){
    if(!keys) return null;
    return keys.find(k=>k.name===name) || keys.find(k=>k.part===name);
  }
  function avgPoint(a,b){ if(!a||!b) return null; return { x:(a.x+b.x)/2, y:(a.y+b.y)/2 }; }
  function angleBetween(a,b,c){
    if(!a||!b||!c) return 180;
    const ab={x:a.x-b.x, y:a.y-b.y}, cb={x:c.x-b.x, y:c.y-b.y};
    const dot = ab.x*cb.x + ab.y*cb.y;
    const mag = Math.sqrt(ab.x*ab.x+ab.y*ab.y)*Math.sqrt(cb.x*cb.x+cb.y*cb.y);
    const cos = Math.max(-1, Math.min(1, dot/mag)); return Math.acos(cos)*180/Math.PI;
  }

  async function analyze(){
    if(!blobs || blobs.length===0){ alert('Record first'); return; }
    const blob = new Blob(blobs, { type: 'video/webm' });
    appendLog('Extract frames...');
    const frames = await extractFrames(blob, 8);
    appendLog('Frames extracted: '+frames.length);
    const poses = [];
    for(let i=0;i<frames.length;i++){
      const img = frames[i];
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      await new Promise(res=> img.onload ? img.onload = res : res());
      ctx.drawImage(img,0,0);
      const input = tf.browser.fromPixels(canvas);
      const est = await detector.estimatePoses(input);
      input.dispose();
      poses.push({ pose: est, ts:i });
    }

    appendLog('Pose estimation done');
    // metrics
    const metrics = { samples: poses.length };
    const confidences = poses.map(p=>{
      const k = p.pose[0]?.keypoints || [];
      return k.reduce((s,kp)=>s+(kp.score||0),0)/(k.length||1);
    });
    const lowConfRatio = confidences.filter(c=>c<0.3).length / (confidences.length || 1);
    metrics.confidence_summary = { low_conf_ratio: lowConfRatio, avg_confidence: (confidences.reduce((a,b)=>a+b,0)/(confidences.length||1)).toFixed(3) };

    if(selectedTest === 'vertical_jump'){
      const hips = poses.map(p=>{
        const k = p.pose[0]?.keypoints || [];
        const l = findKey(k,'left_hip'), r = findKey(k,'right_hip');
        const y = ((l?.y||0)+(r?.y||0))/2;
        return { y, score: ((l?.score||0)+(r?.score||0))/2 };
      });
      const baselineCount = Math.max(1, Math.floor(hips.length*0.12));
      const baseline = hips.slice(0, baselineCount).reduce((a,b)=>a+b.y,0)/baselineCount;
      const minY = Math.min(...hips.map(h=>h.y));
      const pixelDelta = baseline - minY;
      const normalized = pixelDelta / (videoRef.current.videoHeight || 480);
      metrics.pixelDelta = pixelDelta;
      metrics.estimatedJumpMeters = +(normalized * 1.5).toFixed(2);
    } else if(selectedTest === 'situps'){
      let count=0, state='down';
      for(let p of poses){
        const k = p.pose[0]?.keypoints || [];
        const lHip = findKey(k,'left_hip'), rHip = findKey(k,'right_hip');
        const lShoulder = findKey(k,'left_shoulder'), rShoulder = findKey(k,'right_shoulder');
        const lKnee = findKey(k,'left_knee'), rKnee = findKey(k,'right_knee');
        const hip = avgPoint(lHip,rHip), shoulder = avgPoint(lShoulder,rShoulder), knee = avgPoint(lKnee,rKnee);
        if(hip && shoulder && knee){
          const ang = angleBetween(shoulder, hip, knee);
          if(ang < 85 && state === 'down'){ state = 'up'; count++; }
          if(ang > 120 && state === 'up'){ state = 'down'; }
        }
      }
      metrics.situp_count = count;
    } else if(selectedTest === 'shuttle_run'){
      metrics.estimated_seconds = Math.round(poses.length / 8);
    }

    // cheat detection
    const cheat = { suspicious:false, reasons:[] };
    if(lowConfRatio > 0.45){ cheat.suspicious=true; cheat.reasons.push('Low-confidence frames'); }
    if(blob.size < 10000){ cheat.suspicious=true; cheat.reasons.push('Very small video size'); }
    const hipYs = poses.map(p=>{
      const k = p.pose[0]?.keypoints || [];
      const l = findKey(k,'left_hip'), r = findKey(k,'right_hip');
      return ((l?.y||0)+(r?.y||0))/2;
    });
    for(let i=1;i<hipYs.length;i++){
      if(Math.abs(hipYs[i]-hipYs[i-1])>220){ cheat.suspicious=true; cheat.reasons.push('Abrupt displacement'); break; }
    }
    if(cheat.reasons.length===0) cheat.reasons.push('OK');

    const final = { test:selectedTest, metrics, cheat, samples: poses.length, timestamp: Date.now() };
    setAnalysis(final);
    appendLog('Analysis ready');

    // store analysis + small metadata in IndexedDB queue for offline sync
    const db = await initDB();
    const tx = db.transaction('queue','readwrite');
    const store = tx.objectStore('queue');
    await store.add({ email: email || 'anon@example.com', test: selectedTest, analysis: final, createdAt: Date.now() });
    await tx.done;
    appendLog('Stored to local queue (for background sync).');
    updateQueueCount();

    // register background sync (if supported)
    if('serviceWorker' in navigator && 'SyncManager' in window){
      try{
        const reg = await navigator.serviceWorker.ready;
        await reg.sync.register('sih-sync');
        appendLog('Background sync registered.');
      }catch(e){ appendLog('Background sync registration failed: '+e.message); }
    }

    return { final, blob };
  }

  async function uploadNow(){
    if(!analysis){ alert('Analyze first'); return; }
    const blob = new Blob(blobs, { type: 'video/webm' });
    const fd = new FormData();
    fd.append('email', email || 'anon@example.com');
    fd.append('test', selectedTest);
    fd.append('analysis', JSON.stringify(analysis));
    fd.append('video', blob, 'submission.webm');
    appendLog('Uploading...');
    try{
      const res = await fetch(`${backendUrl}/api/submissions/upload`, { method:'POST', body: fd });
      const j = await res.json();
      appendLog('Upload done: ' + JSON.stringify(j));
      setAnalysis(null); setBlobs([]);
    }catch(e){ appendLog('Upload error: '+e.message); }
  }

  useEffect(()=>{ updateQueueCount(); }, []);

  const chartData = analysis ? [
    { name: 'Metric', value: (analysis.metrics.estimatedJumpMeters || analysis.metrics.situp_count || analysis.metrics.estimated_seconds || 0) }
  ] : [];

  return (
    <div className="p-4 bg-white rounded-2xl shadow">
      <div className="flex gap-4">
        <div style={{ width: '55%' }}>
          <div className="relative bg-black rounded-md overflow-hidden">
            <video ref={videoRef} className="w-full h-[360px] object-cover" playsInline autoPlay muted></video>
            <div className="absolute top-3 left-3 bg-white/80 px-3 py-1 rounded-full text-sm">{selectedTest.replace('_',' ')}</div>
          </div>
          <div className="flex gap-2 mt-3">
            {!recording ? <button onClick={startRecord} className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg">Start</button>
            : <button onClick={stopRecord} className="px-4 py-2 bg-red-500 text-white rounded-lg">Stop</button>}
            <button onClick={analyze} className="px-4 py-2 bg-slate-100 rounded-lg">Analyze & Queue</button>
            <button onClick={uploadNow} className="px-4 py-2 bg-green-600 text-white rounded-lg">Upload Now</button>
            <input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} className="ml-auto px-3 py-2 border rounded-lg" />
          </div>
        </div>

        <div style={{ width: '45%' }}>
          <div className="p-3 bg-slate-50 rounded-lg h-[360px]">
            <h4 className="font-semibold mb-2">On-device Analysis</h4>
            <pre className="text-sm bg-white p-2 rounded h-[210px] overflow-auto">{analysis ? JSON.stringify(analysis, null, 2) : 'No analysis yet'}</pre>

            <div className="mt-3">
              <h5 className="text-sm font-medium">Quick chart</h5>
              <div className="w-full h-24">
                <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><XAxis dataKey="name" /><YAxis /></BarChart></ResponsiveContainer>
              </div>
              <div className="mt-2">
                <div className="text-sm text-slate-600">Local queue: {queueCount} items</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <h4 className="font-semibold mb-2">Log</h4>
        <pre className="text-sm bg-black text-white p-3 rounded h-36 overflow-auto">{log}</pre>
      </div>
    </div>
  );
}
