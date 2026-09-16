import { resetDatabaseForSeed } from "../lib/db";

const db = resetDatabaseForSeed();
console.log(`Seeded data/db.json with ${db.rooms.length} rooms and ${db.bookings.length} sample bookings.`);
