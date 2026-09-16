/**
 * Creates (or resets the password of) the single dashboard admin account.
 * Run with: npm run create-admin
 */
import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import bcrypt from 'bcryptjs';
import { db } from '../lib/db';

async function main() {
  const rl = readline.createInterface({ input: stdin, output: stdout });

  console.log('Set up the dashboard admin account (used to log in at /admin/login).\n');
  const username = (await rl.question('Admin username [admin]: ')).trim() || 'admin';
  let password = '';
  while (password.length < 8) {
    password = await rl.question('Admin password (min 8 characters): ');
    if (password.length < 8) console.log('Too short — try again.');
  }
  rl.close();

  const passwordHash = await bcrypt.hash(password, 12);

  await db.adminUser.upsert({
    where: { username },
    create: { username, passwordHash },
    update: { passwordHash },
  });

  console.log(`\nDone. You can now log in at /admin/login as "${username}".`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
