export default function Loading() {
  return (
    <div className="min-h-[240px] w-full animate-pulse space-y-4 p-4 bg-gray-50">
      <div className="h-24 rounded-2xl bg-orange-100/70" />
      <div className="h-52 rounded-2xl bg-gray-200" />
      <div className="h-40 rounded-2xl bg-gray-100" />
    </div>
  );
}
