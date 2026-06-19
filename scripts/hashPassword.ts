// One-off CLI: hash a password for the ADMIN_PASSWORD_HASH env var.
// Usage: npm run hash-password -- 'your-strong-password'
import bcrypt from 'bcryptjs';

const pwd = process.argv[2];
if (!pwd) {
  console.error('Usage: npm run hash-password -- "<password>"');
  process.exit(1);
}
if (pwd.length < 12) {
  console.error('Password must be at least 12 chars.');
  process.exit(1);
}

const hash = bcrypt.hashSync(pwd, 12);
console.log('\nADMIN_PASSWORD_HASH=' + hash + '\n');
console.log('Paste the line above into Railway → falisha-agent-finder → Variables.\n');
