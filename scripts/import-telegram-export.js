// Runs scripts/telegram-import.ts with the app's "@/" alias; `server-only` is a no-op outside Next.
const path = require('node:path');

const jiti = require('jiti')(__filename, {
  alias: {
    '@': path.join(__dirname, '..', 'src'),
    'server-only': require.resolve('next/dist/compiled/server-only/empty.js'),
  },
});

jiti('./telegram-import.ts')
  .main(process.argv[2])
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Telegram import failed:', error.message);
    process.exit(1);
  });
