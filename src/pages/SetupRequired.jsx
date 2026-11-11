export default function SetupRequired() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-xl rounded-2xl border border-slate-200 bg-white p-8 shadow-card">
        <h1 className="text-xl font-semibold text-slate-900">Connect Firebase to start the CRM</h1>
        <p className="mt-2 text-sm text-slate-600">No Firebase configuration was found. Follow these steps, then restart <code>npm run dev</code>:</p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-700">
          <li>Create a project at <b>console.firebase.google.com</b>.</li>
          <li>Enable <b>Authentication → Email/Password</b>, <b>Firestore Database</b> and <b>Storage</b>.</li>
          <li>Add a <b>Web app</b> and copy its config values.</li>
          <li>Copy <code>.env.example</code> to <code>.env.local</code> and paste the values in.</li>
          <li>Deploy the security rules: <code>npm run deploy:rules</code>.</li>
        </ol>
        <p className="mt-4 text-sm text-slate-500">The first account you register becomes the admin.</p>
      </div>
    </div>
  );
}
