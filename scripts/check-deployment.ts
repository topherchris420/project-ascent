import { checkDeployment } from '../src/lib/deployment';
import { closeDatabase, transaction } from '../src/lib/db';

async function main() {
  const report = checkDeployment(process.env);
  let databaseProbe = 'not-requested';
  if (process.argv.includes('--database')) {
    if (!report.configured) databaseProbe = 'skipped-incomplete-configuration';
    else {
      Object.assign(process.env, { NODE_ENV: 'production' });
      try {
        const result = await transaction(null, tx =>
          tx.query<{ postgis: boolean }>(
            "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname='postgis') AS postgis",
          ),
        );
        if (!result[0]?.postgis) throw new Error('PostGIS missing');
        databaseProbe = 'passed';
      } catch {
        databaseProbe = 'failed';
      } finally {
        await closeDatabase();
      }
    }
  }
  console.log(
    JSON.stringify(
      {
        ...report,
        databaseProbe,
        databaseVerified: databaseProbe === 'passed',
        note: 'No migrations, writes, inference or property requests performed. A passed database probe verifies connectivity, the runtime role, six RLS tables and PostGIS; it is not full deployed workflow acceptance.',
      },
      null,
      2,
    ),
  );
  if (!report.configured || databaseProbe === 'failed') process.exitCode = 1;
}
main().catch(async () => {
  console.error('Deployment check could not complete. No credential details were logged.');
  await closeDatabase();
  process.exitCode = 1;
});
