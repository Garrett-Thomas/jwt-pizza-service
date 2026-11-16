const app = require('./service.js');
const logger = require('./logger.js');

// Log what would otherwise just kill the process, then exit as Node would have.
for (const event of ['uncaughtException', 'unhandledRejection']) {
  process.on(event, async (err) => {
    await logger.unhandledErrorLogger(err instanceof Error ? err : new Error(String(err)));
    process.exit(1);
  });
}

const port = process.argv[2] || 3000;
app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
