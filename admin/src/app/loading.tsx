export default function Loading() {
  return (
    <div className="min-h-screen w-full animate-pulse space-y-4 p-6 bg-slate-100">
      <div className="h-12 rounded-xl bg-slate-200" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="h-28 rounded-xl bg-white" />
        <div className="h-28 rounded-xl bg-white" />
        <div className="h-28 rounded-xl bg-white" />
      </div>
      <div className="h-96 rounded-xl bg-white" />
    </div>
  );
}
