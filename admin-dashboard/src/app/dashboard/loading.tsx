// Ditampilkan instan saat pindah menu, sambil data halaman dimuat di server.
export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-56 bg-gray-200 rounded" />
        <div className="h-4 w-80 max-w-full bg-gray-100 rounded" />
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-5 bg-gray-100 rounded" />
        ))}
      </div>
    </div>
  )
}
