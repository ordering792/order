export default function Loading() {
  return (
    <div className="w-full animate-pulse space-y-4 p-2">
      <div className="h-12 rounded-xl bg-slate-200" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-28 rounded-xl bg-white" />
        <div className="h-28 rounded-xl bg-white" />
      </div>
      <div className="h-80 rounded-xl bg-white" />
    </div>
  );
}
