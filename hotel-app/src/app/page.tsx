import { readDb } from "@/lib/db";
import { formatCurrency } from "@/lib/format";

// SAMPLE / SANITY-CHECK PAGE — proves the tablet → Termux → localhost flow
// works end to end: real data read from data/db.json, rendered server-side,
// no mock content. The full multi-page site (search, booking flow, admin
// dashboard, etc.) comes next once this is confirmed working on your tablet.
export default function HomePage() {
  const db = readDb();
  const { settings, rooms } = db;

  return (
    <main className="min-h-screen">
      <section
        className="relative flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center text-white"
        style={{
          backgroundImage: `linear-gradient(rgba(16,17,22,0.55),rgba(16,17,22,0.75)), url(${settings.heroImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <p className="rounded-full bg-white/10 px-4 py-1 text-sm tracking-wide">
          LOCAL SAMPLE — running from your own device
        </p>
        <h1 className="font-serif text-4xl font-bold sm:text-5xl">{settings.hotelName}</h1>
        <p className="max-w-xl text-lg text-ink-100">{settings.tagline}</p>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-10">
        <h2 className="mb-6 text-2xl font-bold text-ink-800">Rooms ({rooms.length})</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => (
            <div key={room.id} className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm">
              <img src={room.images[0]} alt={room.name} className="h-40 w-full object-cover" />
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{room.name}</h3>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      room.status === "available" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {room.status === "available" ? "Available" : "Maintenance"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink-500">Room {room.roomNumber} · {room.type} · up to {room.capacity} guests</p>
                <p className="mt-3 text-xl font-bold text-brand-600">{formatCurrency(room.price, settings.currency)}<span className="text-sm font-normal text-ink-400"> /night</span></p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-ink-100 bg-white px-4 py-6 text-center text-sm text-ink-400">
        This is a minimal test page. If you can see live room data above on your tablet's
        browser, the local server setup works — tell Claude to continue building the full
        booking + admin system.
      </footer>
    </main>
  );
}
